"""
Feature importance via permutation.

The source literature review references SHAP for explainability, but the
`shap` package isn't installable in this offline sandbox. Permutation
importance answers a similar question -- "how much does this feature
matter to the model's decisions" -- via a different, dependency-free
mechanism: shuffle one feature at a time across the test set and measure
how much detection quality (F1) degrades. A feature the model relies on
heavily will cause a large drop when scrambled; a feature it ignores
won't move the score at all.

If `shap` becomes available (`pip install shap` on a machine with
internet access), it can be dropped in alongside this without changing
anything else in the pipeline -- see the note in README.md.
"""

import numpy as np
from sklearn.metrics import f1_score


def permutation_importance(wrapper, X_test, y_test, feature_names, n_repeats=3, seed=42):
    rng = np.random.default_rng(seed)
    baseline_pred = (wrapper.predict_proba(X_test) >= 0.5).astype(int)
    baseline_f1 = f1_score(y_test, baseline_pred, zero_division=0)

    n_features = X_test.shape[-1]
    importances = []
    for f_idx in range(n_features):
        drops = []
        for _ in range(n_repeats):
            X_perm = X_test.copy()
            perm_idx = rng.permutation(len(X_perm))
            if X_perm.ndim == 2:
                X_perm[:, f_idx] = X_perm[perm_idx, f_idx]
            else:  # sequence input (batch, T, features)
                X_perm[:, :, f_idx] = X_perm[perm_idx][:, :, f_idx]
            pred = (wrapper.predict_proba(X_perm) >= 0.5).astype(int)
            f1 = f1_score(y_test, pred, zero_division=0)
            drops.append(baseline_f1 - f1)
        importances.append(float(np.mean(drops)))

    ranked = sorted(zip(feature_names, importances), key=lambda kv: -kv[1])
    return {
        "method": "permutation_importance (F1 drop when feature is shuffled)",
        "baseline_f1": float(baseline_f1),
        "ranking": [{"feature": f, "importance": round(v, 5)} for f, v in ranked],
    }
