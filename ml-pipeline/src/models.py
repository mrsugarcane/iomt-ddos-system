"""
Model zoo for the IoMT DDoS prediction study.

Four deep learning architectures, matching the ones compared in the source
research:
  - CNN        : treats a single flow's feature vector as a 1D signal and
                 learns local patterns across adjacent features.
  - LSTM       : models a short window of consecutive flows to capture
                 temporal dependencies (periodicity / burstiness).
  - Autoencoder: unsupervised; trained only on benign traffic, flags
                 traffic with high reconstruction error as anomalous.
  - Hybrid     : Conv1D feature compression across the window, then an
                 LSTM over the compressed sequence (CNN-LSTM hybrid).

Plus two classical ML baselines (Random Forest, Logistic Regression) for
the "deep learning vs traditional ML" comparison the study calls for.

Every model is wrapped behind a common interface (`fit`, `predict_proba`,
`n_params`, `size_bytes`) so evaluate.py can treat them uniformly.
"""

import pickle
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression

import dl_framework as dlf


class DLClassifierWrapper:
    def __init__(self, build_fn, name, input_kind):
        self.model = build_fn()
        self.name = name
        self.input_kind = input_kind  # 'tabular' or 'sequence'

    def fit(self, X_train, y_train, X_val, y_val, epochs=15, batch_size=256, lr=1e-3):
        n_pos = y_train.sum()
        n_neg = len(y_train) - n_pos
        w_pos = len(y_train) / (2 * max(n_pos, 1))
        w_neg = len(y_train) / (2 * max(n_neg, 1))
        self.history = dlf.train_binary_classifier(
            self.model, X_train, y_train, X_val, y_val,
            epochs=epochs, batch_size=batch_size, lr=lr,
            class_weight={0: w_neg, 1: w_pos},
        )
        return self

    def predict_proba(self, X):
        return dlf.sigmoid(self.model.predict_logits(X)).ravel()

    def n_params(self):
        return self.model.n_params()

    def size_bytes(self):
        return self.n_params() * 4  # float32 storage

    def sequential(self):
        return self.model


class AutoencoderWrapper:
    def __init__(self, build_fn, name="autoencoder"):
        self.encoder_decoder = build_fn()
        self.name = name
        self.threshold = None

    def fit(self, X_train, y_train, X_val, y_val, epochs=15, batch_size=256, lr=1e-3):
        X_benign = X_train[y_train == 0]
        self.history = dlf.train_autoencoder(
            self.encoder_decoder, X_benign, X_val[y_val == 0] if (y_val == 0).any() else X_val,
            epochs=epochs, batch_size=batch_size, lr=lr,
        )
        recon_benign = self.encoder_decoder.predict_logits(X_benign)
        errors = np.mean((recon_benign - X_benign) ** 2, axis=1)
        self.threshold = float(np.percentile(errors, 95))
        return self

    def reconstruction_error(self, X):
        recon = self.encoder_decoder.predict_logits(X)
        return np.mean((recon - X) ** 2, axis=1)

    def predict_proba(self, X):
        err = self.reconstruction_error(X)
        # squash error relative to threshold into a pseudo-probability
        return 1 / (1 + np.exp(-(err - self.threshold) / (self.threshold + 1e-6)))

    def n_params(self):
        return self.encoder_decoder.n_params()

    def size_bytes(self):
        return self.n_params() * 4

    def sequential(self):
        return self.encoder_decoder


class SklearnWrapper:
    def __init__(self, sk_model, name):
        self.model = sk_model
        self.name = name

    def fit(self, X_train, y_train, X_val=None, y_val=None, **kwargs):
        self.model.fit(X_train, y_train)
        return self

    def predict_proba(self, X):
        return self.model.predict_proba(X)[:, 1]

    def n_params(self):
        return None

    def size_bytes(self):
        return len(pickle.dumps(self.model))


# ---------------------------------------------------------------------
# Architecture builders
# ---------------------------------------------------------------------

def build_cnn(n_features):
    def _build():
        return dlf.Sequential([
            dlf.Reshape((n_features, 1)),
            dlf.Conv1D(1, 16, kernel_size=3),
            dlf.ReLU(),
            dlf.Conv1D(16, 16, kernel_size=3),
            dlf.ReLU(),
            dlf.Flatten(),
            dlf.Dense((n_features - 4) * 16, 64),
            dlf.ReLU(),
            dlf.Dropout(0.2),
            dlf.Dense(64, 1),
        ])
    return DLClassifierWrapper(_build, "CNN", "tabular")


def build_lstm(window, n_features):
    def _build():
        return dlf.Sequential([
            dlf.LSTM(n_features, 32, return_sequence=False),
            dlf.Dense(32, 32),
            dlf.ReLU(),
            dlf.Dropout(0.2),
            dlf.Dense(32, 1),
        ])
    return DLClassifierWrapper(_build, "LSTM", "sequence")


def build_hybrid_cnn_lstm(window, n_features):
    def _build():
        return dlf.Sequential([
            dlf.Conv1D(n_features, 16, kernel_size=3),
            dlf.ReLU(),
            dlf.LSTM(16, 32, return_sequence=False),
            dlf.Dense(32, 32),
            dlf.ReLU(),
            dlf.Dropout(0.2),
            dlf.Dense(32, 1),
        ])
    return DLClassifierWrapper(_build, "Hybrid CNN-LSTM", "sequence")


def build_autoencoder(n_features):
    def _build():
        return dlf.Sequential([
            dlf.Dense(n_features, 32),
            dlf.ReLU(),
            dlf.Dense(32, 8),
            dlf.ReLU(),
            dlf.Dense(8, 32),
            dlf.ReLU(),
            dlf.Dense(32, n_features),
        ])
    return AutoencoderWrapper(_build, "Autoencoder")


def build_random_forest():
    return SklearnWrapper(
        RandomForestClassifier(n_estimators=100, max_depth=12, random_state=42, n_jobs=-1),
        "Random Forest (baseline)",
    )


def build_logistic_regression():
    return SklearnWrapper(
        LogisticRegression(max_iter=500),
        "Logistic Regression (baseline)",
    )
