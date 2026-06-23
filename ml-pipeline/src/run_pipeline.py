"""
End-to-end pipeline entry point.

    python run_pipeline.py

Builds the IoMT-DDoS dataset, trains the four deep learning architectures
plus two classical ML baselines, evaluates all six on the held-out test
set, optimizes the best deep model for edge deployment (pruning +
quantization), and writes everything the backend/frontend need to
ml-pipeline/results/ and backend/data/.
"""

import json
import os
import time
import numpy as np

import dataset_builder
import models
from evaluate import evaluate_model
from optimize import optimize_best_model
from explainability import permutation_importance

DATA_DIR = os.environ.get("PIPELINE_DATA_DIR", "../data")
RESULTS_DIR = os.environ.get("PIPELINE_RESULTS_DIR", "../results")
BACKEND_DATA_DIR = os.environ.get("PIPELINE_BACKEND_DATA_DIR", "../../backend/data")


def load_processed():
    npz = np.load(f"{DATA_DIR}/processed.npz", allow_pickle=True)
    return npz


def main():
    os.makedirs(RESULTS_DIR, exist_ok=True)
    os.makedirs(BACKEND_DATA_DIR, exist_ok=True)

    if not os.path.exists(f"{DATA_DIR}/processed.npz"):
        dataset_builder.run(DATA_DIR)
    else:
        print("Reusing existing dataset at", f"{DATA_DIR}/processed.npz")

    npz = load_processed()
    X_train, y_train = npz["X_train"], npz["y_train"]
    X_val, y_val = npz["X_val"], npz["y_val"]
    X_test, y_test = npz["X_test"], npz["y_test"]
    Xs_train, ys_train = npz["Xs_train"], npz["ys_train"]
    Xs_val, ys_val = npz["Xs_val"], npz["ys_val"]
    Xs_test, ys_test = npz["Xs_test"], npz["ys_test"]
    feature_cols = list(npz["feature_cols"])
    n_features = X_train.shape[1]
    window = Xs_train.shape[1]

    with open(f"{DATA_DIR}/dataset_summary.json") as f:
        dataset_summary = json.load(f)

    print("\n=== Training models ===")
    results = []
    wrappers = {}

    print("\n[1/6] CNN (tabular, single-flow)")
    cnn = models.build_cnn(n_features)
    t0 = time.time()
    cnn.fit(X_train, y_train, X_val, y_val, epochs=12, lr=1e-3)
    print(f"  trained in {time.time() - t0:.1f}s")
    results.append(evaluate_model(cnn, X_test, y_test))
    wrappers["CNN"] = cnn

    print("\n[2/6] LSTM (sequence window)")
    lstm = models.build_lstm(window, n_features)
    t0 = time.time()
    lstm.fit(Xs_train, ys_train, Xs_val, ys_val, epochs=10, lr=1e-3)
    print(f"  trained in {time.time() - t0:.1f}s")
    results.append(evaluate_model(lstm, Xs_test, ys_test))
    wrappers["LSTM"] = lstm

    print("\n[3/6] Hybrid CNN-LSTM (sequence window)")
    hybrid = models.build_hybrid_cnn_lstm(window, n_features)
    t0 = time.time()
    hybrid.fit(Xs_train, ys_train, Xs_val, ys_val, epochs=10, lr=1e-3)
    print(f"  trained in {time.time() - t0:.1f}s")
    results.append(evaluate_model(hybrid, Xs_test, ys_test))
    wrappers["Hybrid CNN-LSTM"] = hybrid

    print("\n[4/6] Autoencoder (unsupervised, benign-only)")
    ae = models.build_autoencoder(n_features)
    t0 = time.time()
    ae.fit(X_train, y_train, X_val, y_val, epochs=12, lr=1e-3)
    print(f"  trained in {time.time() - t0:.1f}s")
    results.append(evaluate_model(ae, X_test, y_test))
    wrappers["Autoencoder"] = ae

    print("\n[5/6] Random Forest (baseline)")
    rf = models.build_random_forest()
    t0 = time.time()
    rf.fit(X_train, y_train)
    print(f"  trained in {time.time() - t0:.1f}s")
    results.append(evaluate_model(rf, X_test, y_test))
    wrappers["Random Forest"] = rf

    print("\n[6/6] Logistic Regression (baseline)")
    logreg = models.build_logistic_regression()
    t0 = time.time()
    logreg.fit(X_train, y_train)
    print(f"  trained in {time.time() - t0:.1f}s")
    results.append(evaluate_model(logreg, X_test, y_test))
    wrappers["Logistic Regression"] = logreg

    print("\n=== Comparison table ===")
    for r in sorted(results, key=lambda r: -r["f1_score"]):
        print(f"  {r['name']:<28} f1={r['f1_score']:.3f}  precision={r['precision']:.3f}  "
              f"recall={r['recall']:.3f}  latency={r['inference_latency_ms']:.3f}ms  "
              f"size={r['model_size_kb']:.1f}KB")

    dl_results = [r for r in results if r["name"] in ("CNN", "LSTM", "Hybrid CNN-LSTM")]
    best = max(dl_results, key=lambda r: r["f1_score"])
    best_name = best["name"]
    best_wrapper = wrappers[best_name]
    print(f"\nBest deep model by F1-score: {best_name}")

    print("\n=== Optimizing best model for edge deployment ===")
    X_test_for_best = Xs_test if best_wrapper.input_kind == "sequence" else X_test
    y_test_for_best = ys_test if best_wrapper.input_kind == "sequence" else y_test
    optimized_wrapper, opt_report = optimize_best_model(
        best_wrapper, X_test_for_best, y_test_for_best, sparsity=0.3
    )
    print(json.dumps({k: v for k, v in opt_report.items() if k not in ("baseline", "optimized")}, indent=2))

    print("\n=== Explainability (permutation importance on best model) ===")
    print("  (SHAP substitute — see explainability.py for drop-in upgrade instructions)")
    X_test_explain = X_test_for_best
    y_test_explain = y_test_for_best
    importance_result = permutation_importance(
        best_wrapper, X_test_explain, y_test_explain,
        feature_cols if best_wrapper.input_kind == "tabular" else feature_cols,
        n_repeats=3
    )
    print(f"  baseline F1: {importance_result['baseline_f1']:.4f}")
    print("  top-5 features by importance:")
    for row in importance_result["ranking"][:5]:
        print(f"    {row['feature']:<30} Δf1 = {row['importance']:.5f}")

    print("\n=== Exporting edge model (Logistic Regression coefficients) for live dashboard ===")
    edge_model = {
        "feature_columns": feature_cols,
        "scaler_mean": npz["scaler_mean"].tolist(),
        "scaler_scale": npz["scaler_scale"].tolist(),
        "weights": logreg.model.coef_[0].tolist(),
        "bias": float(logreg.model.intercept_[0]),
    }
    with open(f"{BACKEND_DATA_DIR}/edge_model.json", "w") as f:
        json.dump(edge_model, f, indent=2)

    print("\n=== Exporting best DL model weights for backend deep inference ===")
    dl_layers = []
    seq = best_wrapper.sequential()
    for layer in seq.layers:
        layer_data = {"type": type(layer).__name__, "params": {}}
        for name, param in layer.params.items():
            layer_data["params"][name] = param.tolist()
        if hasattr(layer, "k"):
            layer_data["kernel_size"] = int(layer.k)
        if hasattr(layer, "h"):
            layer_data["hidden_dim"] = int(layer.h)
        if hasattr(layer, "in_dim"):
            layer_data["in_dim"] = int(layer.in_dim)
        if hasattr(layer, "rate"):
            layer_data["rate"] = float(layer.rate)
        if hasattr(layer, "target_shape"):
            layer_data["target_shape"] = list(layer.target_shape)
        dl_layers.append(layer_data)

    best_dl_model = {
        "model_name": best_name,
        "input_kind": best_wrapper.input_kind,
        "feature_columns": feature_cols,
        "scaler_mean": npz["scaler_mean"].tolist(),
        "scaler_scale": npz["scaler_scale"].tolist(),
        "layers": dl_layers,
    }
    with open(f"{BACKEND_DATA_DIR}/best_dl_model.json", "w") as f:
        json.dump(best_dl_model, f, indent=2)
    print(f"  saved best DL model weights -> {BACKEND_DATA_DIR}/best_dl_model.json")

    comparison_payload = {
        "dataset_summary": dataset_summary,
        "models": sorted(results, key=lambda r: -r["f1_score"]),
        "best_model": best_name,
        "optimization": {
            "model_name": opt_report["model_name"],
            "sparsity_target": opt_report["sparsity_target"],
            "params_pruned": opt_report["params_pruned"],
            "params_total": opt_report["params_total"],
            "baseline_size_kb": opt_report["baseline_size_kb"],
            "optimized_size_kb": opt_report["optimized_size_kb"],
            "size_reduction_pct": opt_report["size_reduction_pct"],
            "baseline_f1": opt_report["baseline"]["f1_score"],
            "optimized_f1": opt_report["optimized"]["f1_score"],
            "baseline_latency_ms": opt_report["baseline"]["inference_latency_ms"],
            "optimized_latency_ms": opt_report["optimized"]["inference_latency_ms"],
        },
        "explainability": importance_result,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    with open(f"{RESULTS_DIR}/model_comparison.json", "w") as f:
        json.dump(comparison_payload, f, indent=2)
    with open(f"{BACKEND_DATA_DIR}/model_comparison.json", "w") as f:
        json.dump(comparison_payload, f, indent=2)
    print(f"\nSaved comparison results -> {RESULTS_DIR}/model_comparison.json")
    print(f"Saved comparison results -> {BACKEND_DATA_DIR}/model_comparison.json")
    print(f"Saved edge model weights -> {BACKEND_DATA_DIR}/edge_model.json")


if __name__ == "__main__":
    main()
