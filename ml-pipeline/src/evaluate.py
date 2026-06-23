"""
Multi-objective evaluation framework.

Per the source research, a model is judged not only on detection quality
but on deployability: a 98% F1-score model that takes 2 seconds per
inference is not clinically usable. This module reports both classes of
metric for every trained model.
"""

import time
import numpy as np
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score,
)


def _measure_latency_ms(predict_fn, X, n_samples=200):
    n_samples = min(n_samples, len(X))
    idx = np.random.choice(len(X), n_samples, replace=False)
    # warm-up
    predict_fn(X[idx[:5]])
    start = time.perf_counter()
    for i in idx:
        predict_fn(X[i:i + 1])
    elapsed = time.perf_counter() - start
    return (elapsed / n_samples) * 1000.0


def evaluate_model(wrapper, X_test, y_test, threshold=0.5, latency_samples=200):
    proba = wrapper.predict_proba(X_test)
    pred = (proba >= threshold).astype(int)

    metrics = {
        "name": wrapper.name,
        "accuracy": float(accuracy_score(y_test, pred)),
        "precision": float(precision_score(y_test, pred, zero_division=0)),
        "recall": float(recall_score(y_test, pred, zero_division=0)),
        "f1_score": float(f1_score(y_test, pred, zero_division=0)),
    }
    try:
        metrics["roc_auc"] = float(roc_auc_score(y_test, proba))
    except ValueError:
        metrics["roc_auc"] = None

    metrics["inference_latency_ms"] = float(
        _measure_latency_ms(wrapper.predict_proba, X_test, latency_samples)
    )
    metrics["model_size_kb"] = float(wrapper.size_bytes() / 1024.0)
    metrics["n_params"] = wrapper.n_params()
    metrics["n_test_samples"] = int(len(y_test))
    metrics["n_test_attacks"] = int(np.sum(y_test))
    return metrics
