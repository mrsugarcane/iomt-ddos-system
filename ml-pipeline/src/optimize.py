"""
Edge-deployment optimization for the selected best model.

Implements the two techniques the source research calls for ahead of
deploying onto constrained edge gateway hardware (the source research targets a Raspberry Pi 4,
4GB RAM, rather than a full workstation):

  - Structured magnitude pruning: zero out the smallest-magnitude weights
    in every layer, up to a target sparsity.
  - Post-training quantization: simulate int8 quantization by rounding
    each weight to its nearest representable value on an 8-bit symmetric
    grid (scale derived from the layer's max absolute value), then storing
    it back as a (lower-fidelity) float for continued NumPy inference.

Returns both the optimized wrapper and a before/after report so the
dashboard can show the accuracy/size trade-off explicitly.
"""

import copy
import numpy as np

from evaluate import evaluate_model


def prune(sequential_model, sparsity=0.3):
    total, pruned = 0, 0
    for layer in sequential_model.layers:
        for name, param in layer.params.items():
            if param.ndim == 0 or param.size == 0:
                continue
            flat = np.abs(param).ravel()
            thresh = np.percentile(flat, sparsity * 100)
            mask = np.abs(param) < thresh
            pruned += int(mask.sum())
            total += param.size
            param[mask] = 0.0
    return pruned, total


def quantize_int8(sequential_model):
    for layer in sequential_model.layers:
        for name, param in layer.params.items():
            if param.size == 0:
                continue
            max_val = np.max(np.abs(param))
            if max_val == 0:
                continue
            scale = max_val / 127.0
            q = np.round(param / scale).astype(np.int8)
            param[:] = q.astype(np.float64) * scale


def optimize_best_model(best_wrapper, X_test, y_test, sparsity=0.3):
    """Clones the best wrapper, applies pruning + quantization to the clone,
    and returns (optimized_wrapper, report_dict)."""
    baseline_metrics = evaluate_model(best_wrapper, X_test, y_test)

    optimized = copy.deepcopy(best_wrapper)
    seq = optimized.sequential()
    n_pruned, n_total = prune(seq, sparsity=sparsity)
    quantize_int8(seq)

    optimized_metrics = evaluate_model(optimized, X_test, y_test)
    optimized_size_kb = (n_total - n_pruned) * 1 / 1024.0  # 1 byte/param after int8 + sparsity

    report = {
        "model_name": best_wrapper.name,
        "baseline": baseline_metrics,
        "optimized": optimized_metrics,
        "sparsity_target": sparsity,
        "params_pruned": n_pruned,
        "params_total": n_total,
        "baseline_size_kb": baseline_metrics["model_size_kb"],
        "optimized_size_kb": float(optimized_size_kb),
        "size_reduction_pct": float(
            100 * (1 - optimized_size_kb / baseline_metrics["model_size_kb"])
        ) if baseline_metrics["model_size_kb"] > 0 else None,
        "f1_delta": optimized_metrics["f1_score"] - baseline_metrics["f1_score"],
    }
    return optimized, report
