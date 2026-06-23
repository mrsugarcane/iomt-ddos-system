"""
ML pipeline unit tests — Python stdlib unittest (no pytest required).
Run: python -m unittest tests/test_pipeline.py -v
"""

import sys
import os
import unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


class TestTrafficSimulator(unittest.TestCase):

    def setUp(self):
        from traffic_simulator import generate_dataset
        self.rows = generate_dataset(n_sessions_per_device=2, session_duration_s=600,
                                     attack_fraction=0.5, seed=99)

    def test_produces_rows(self):
        self.assertGreater(len(self.rows), 0)

    def test_labels_are_binary(self):
        for r in self.rows:
            self.assertIn(r["label_binary"], (0, 1))

    def test_multiclass_label_range(self):
        for r in self.rows:
            self.assertIn(r["label_multiclass"], (0, 1, 2, 3))

    def test_required_feature_keys_present(self):
        required = ["duration", "total_packets", "total_bytes", "packet_rate",
                    "byte_rate", "mean_packet_size", "protocol_code",
                    "syn_count", "fin_count", "device_type_code"]
        for key in required:
            self.assertIn(key, self.rows[0], f"missing key: {key}")

    def test_attack_rows_exist(self):
        attacks = [r for r in self.rows if r["label_binary"] == 1]
        self.assertGreater(len(attacks), 0)

    def test_no_negative_packet_rate(self):
        for r in self.rows:
            self.assertGreaterEqual(r["packet_rate"], 0)


class TestDLFramework(unittest.TestCase):

    def setUp(self):
        import dl_framework as dlf
        self.dlf = dlf

    def test_dense_forward_shape(self):
        dlf = self.dlf
        layer = dlf.Dense(4, 8)
        x = np.random.randn(3, 4)
        out = layer.forward(x)
        self.assertEqual(out.shape, (3, 8))

    def test_relu_zeros_negatives(self):
        dlf = self.dlf
        layer = dlf.ReLU()
        x = np.array([[-1.0, 0.5, -0.3, 2.0]])
        out = layer.forward(x)
        self.assertTrue(np.all(out >= 0))

    def test_conv1d_output_length(self):
        dlf = self.dlf
        layer = dlf.Conv1D(in_channels=4, out_channels=8, kernel_size=3)
        x = np.random.randn(2, 10, 4)   # batch=2, len=10, channels=4
        out = layer.forward(x)
        self.assertEqual(out.shape, (2, 8, 8))  # len=10-3+1=8, channels=8

    def test_lstm_output_shape(self):
        dlf = self.dlf
        layer = dlf.LSTM(in_dim=4, hidden_dim=16, return_sequence=False)
        x = np.random.randn(3, 5, 4)   # batch=3, T=5, features=4
        out = layer.forward(x)
        self.assertEqual(out.shape, (3, 16))

    def test_dense_backward_grad_shape(self):
        dlf = self.dlf
        layer = dlf.Dense(4, 8)
        x = np.random.randn(3, 4)
        layer.forward(x)
        dout = np.random.randn(3, 8)
        dx = layer.backward(dout)
        self.assertEqual(dx.shape, (3, 4))
        self.assertEqual(layer.grads["W"].shape, (4, 8))

    def test_numerical_gradient_dense(self):
        """Finite-difference gradient check on a single Dense layer."""
        dlf = self.dlf
        np.random.seed(0)
        layer = dlf.Dense(3, 2)
        x = np.random.randn(1, 3)
        eps = 1e-5
        out = layer.forward(x)
        dout = np.ones_like(out)
        dx_analytic = layer.backward(dout)
        dx_numeric = np.zeros_like(x)
        for i in range(x.shape[1]):
            xp = x.copy(); xp[0, i] += eps
            xm = x.copy(); xm[0, i] -= eps
            layer_p = dlf.Dense(3, 2); layer_p.params = {k: v.copy() for k, v in layer.params.items()}
            layer_m = dlf.Dense(3, 2); layer_m.params = {k: v.copy() for k, v in layer.params.items()}
            dx_numeric[0, i] = (layer_p.forward(xp).sum() - layer_m.forward(xm).sum()) / (2 * eps)
        np.testing.assert_allclose(dx_analytic, dx_numeric, rtol=1e-4, atol=1e-6)

    def test_adam_reduces_loss(self):
        dlf = self.dlf
        np.random.seed(42)
        model = dlf.Sequential([dlf.Dense(4, 1)])
        opt   = dlf.Adam(model.layers, lr=0.1)
        X = np.random.randn(32, 4)
        y = (X[:, 0] > 0).astype(float).reshape(-1, 1)
        losses = []
        for _ in range(20):
            logits = model.forward(X)
            p = dlf.sigmoid(logits)
            loss = -np.mean(y * np.log(p + 1e-7) + (1 - y) * np.log(1 - p + 1e-7))
            losses.append(float(loss))
            grad = (p - y) / len(X)
            model.backward(grad)
            opt.step()
        self.assertLess(losses[-1], losses[0], "Loss did not decrease over 20 Adam steps")


class TestEvaluation(unittest.TestCase):

    def test_perfect_predictions(self):
        from evaluate import evaluate_model

        class PerfectWrapper:
            name = "perfect"
            def predict_proba(self, X): return np.ones(len(X))
            def size_bytes(self): return 0
            def n_params(self): return 0

        X = np.zeros((20, 4))
        y = np.ones(20)
        metrics = evaluate_model(PerfectWrapper(), X, y, latency_samples=5)
        self.assertAlmostEqual(metrics["f1_score"], 1.0)
        self.assertAlmostEqual(metrics["precision"], 1.0)
        self.assertAlmostEqual(metrics["recall"], 1.0)

    def test_all_wrong_predictions(self):
        from evaluate import evaluate_model

        class WrongWrapper:
            name = "wrong"
            def predict_proba(self, X): return np.zeros(len(X))
            def size_bytes(self): return 0
            def n_params(self): return 0

        X = np.zeros((20, 4))
        y = np.ones(20)
        metrics = evaluate_model(WrongWrapper(), X, y, latency_samples=5)
        self.assertAlmostEqual(metrics["f1_score"], 0.0, places=2)


class TestOptimize(unittest.TestCase):

    def test_prune_reduces_nonzero_weights(self):
        import dl_framework as dlf
        from optimize import prune

        model = dlf.Sequential([dlf.Dense(8, 4), dlf.ReLU(), dlf.Dense(4, 1)])
        for layer in model.layers:
            for p in layer.params.values():
                p[:] = np.random.randn(*p.shape)

        before_nonzero = sum(
            np.count_nonzero(p)
            for layer in model.layers for p in layer.params.values()
        )
        n_pruned, n_total = prune(model, sparsity=0.3)
        after_nonzero = sum(
            np.count_nonzero(p)
            for layer in model.layers for p in layer.params.values()
        )
        self.assertGreater(before_nonzero, after_nonzero)
        self.assertAlmostEqual(n_pruned / n_total, 0.3, delta=0.05)

    def test_quantize_bounds_weights(self):
        import dl_framework as dlf
        from optimize import quantize_int8

        model = dlf.Sequential([dlf.Dense(4, 2)])
        np.random.seed(7)
        original = np.random.randn(4, 2) * 5
        model.layers[0].params["W"][:] = original
        original_max = np.max(np.abs(original))
        quantize_int8(model)
        W = model.layers[0].params["W"]
        # Quantization rounds to a grid derived from the original max, so it
        # can only shrink the max magnitude, never grow it.
        self.assertLessEqual(np.max(np.abs(W)), original_max * 1.01)


class TestExplainability(unittest.TestCase):

    def test_ranking_length_matches_features(self):
        from explainability import permutation_importance
        import dl_framework as dlf

        class DummyWrapper:
            name = "dummy"
            input_kind = "tabular"
            def predict_proba(self, X):
                return (X[:, 0] > 0).astype(float)

        features = ["a", "b", "c", "d"]
        X = np.random.randn(40, 4)
        y = (X[:, 0] > 0).astype(int)
        result = permutation_importance(DummyWrapper(), X, y, features, n_repeats=1)
        self.assertEqual(len(result["ranking"]), len(features))
        self.assertIn("baseline_f1", result)

    def test_first_feature_has_highest_importance(self):
        from explainability import permutation_importance

        class FirstFeatureWrapper:
            name = "first"
            input_kind = "tabular"
            def predict_proba(self, X): return (X[:, 0] > 0).astype(float)

        features = ["signal", "noise1", "noise2", "noise3"]
        np.random.seed(42)
        X = np.random.randn(100, 4)
        y = (X[:, 0] > 0).astype(int)
        result = permutation_importance(FirstFeatureWrapper(), X, y, features, n_repeats=2)
        top = result["ranking"][0]["feature"]
        self.assertEqual(top, "signal")


if __name__ == "__main__":
    unittest.main(verbosity=2)
