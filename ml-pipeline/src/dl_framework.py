"""
A small from-scratch NumPy deep learning toolkit.

This sandbox has no network access and no TensorFlow/PyTorch installed, so
the four architectures used in this study (CNN, LSTM, autoencoder, hybrid
CNN-LSTM) are implemented here directly: real forward and backward passes,
real gradient descent via Adam. This is a genuine, if compact, neural
network engine -- not a mocked-up stand-in.

If you later run this on a machine with TensorFlow/PyTorch, the same
architectures could be re-expressed in those frameworks with no change to
the experiment design (see models.py for the architecture definitions).
"""

import numpy as np


class Layer:
    def __init__(self):
        self.params = {}
        self.grads = {}

    def forward(self, x, training=True):
        raise NotImplementedError

    def backward(self, dout):
        raise NotImplementedError


class Dense(Layer):
    def __init__(self, in_dim, out_dim):
        super().__init__()
        limit = np.sqrt(6.0 / (in_dim + out_dim))
        self.params["W"] = np.random.uniform(-limit, limit, (in_dim, out_dim))
        self.params["b"] = np.zeros(out_dim)

    def forward(self, x, training=True):
        self.x = x
        return x @ self.params["W"] + self.params["b"]

    def backward(self, dout):
        self.grads["W"] = self.x.T @ dout
        self.grads["b"] = dout.sum(axis=0)
        return dout @ self.params["W"].T


class TimeDistributedDense(Layer):
    """Applies the same Dense weights at every timestep of a
    (batch, T, in_dim) sequence -- used by the hybrid model's
    feature-compression stage."""

    def __init__(self, in_dim, out_dim):
        super().__init__()
        limit = np.sqrt(6.0 / (in_dim + out_dim))
        self.params["W"] = np.random.uniform(-limit, limit, (in_dim, out_dim))
        self.params["b"] = np.zeros(out_dim)

    def forward(self, x, training=True):
        self.x = x
        return np.einsum("btf,fo->bto", x, self.params["W"]) + self.params["b"]

    def backward(self, dout):
        self.grads["W"] = np.einsum("btf,bto->fo", self.x, dout)
        self.grads["b"] = dout.sum(axis=(0, 1))
        return np.einsum("bto,fo->btf", dout, self.params["W"])


class ReLU(Layer):
    def forward(self, x, training=True):
        self.mask = x > 0
        return x * self.mask

    def backward(self, dout):
        return dout * self.mask


class Tanh(Layer):
    def forward(self, x, training=True):
        self.out = np.tanh(x)
        return self.out

    def backward(self, dout):
        return dout * (1 - self.out ** 2)


class Dropout(Layer):
    def __init__(self, rate=0.2):
        super().__init__()
        self.rate = rate

    def forward(self, x, training=True):
        if training and self.rate > 0:
            self.mask = (np.random.rand(*x.shape) > self.rate) / (1 - self.rate)
            return x * self.mask
        return x

    def backward(self, dout):
        if hasattr(self, "mask"):
            return dout * self.mask
        return dout


class Flatten(Layer):
    def forward(self, x, training=True):
        self.shape = x.shape
        return x.reshape(x.shape[0], -1)

    def backward(self, dout):
        return dout.reshape(self.shape)


class Reshape(Layer):
    def __init__(self, target_shape):
        super().__init__()
        self.target_shape = target_shape

    def forward(self, x, training=True):
        self.in_shape = x.shape
        return x.reshape(x.shape[0], *self.target_shape)

    def backward(self, dout):
        return dout.reshape(self.in_shape)


class Conv1D(Layer):
    """Convolves along axis 1 of a (batch, length, in_channels) tensor."""

    def __init__(self, in_channels, out_channels, kernel_size):
        super().__init__()
        limit = np.sqrt(6.0 / (in_channels * kernel_size + out_channels))
        self.params["W"] = np.random.uniform(
            -limit, limit, (kernel_size, in_channels, out_channels)
        )
        self.params["b"] = np.zeros(out_channels)
        self.k = kernel_size

    def forward(self, x, training=True):
        self.x = x
        batch, length, cin = x.shape
        out_len = length - self.k + 1
        windows = np.stack([x[:, i:i + self.k, :] for i in range(out_len)], axis=1)
        self.windows = windows
        Wf = self.params["W"].reshape(self.k * cin, -1)
        out = windows.reshape(batch, out_len, self.k * cin) @ Wf + self.params["b"]
        return out

    def backward(self, dout):
        batch, out_len, cout = dout.shape
        k, cin, _ = self.params["W"].shape
        windows_flat = self.windows.reshape(batch, out_len, k * cin)
        dW = np.einsum("blf,blc->fc", windows_flat, dout)
        self.grads["W"] = dW.reshape(k, cin, cout)
        self.grads["b"] = dout.sum(axis=(0, 1))
        Wf = self.params["W"].reshape(k * cin, cout)
        dwindows_flat = dout @ Wf.T
        dwindows = dwindows_flat.reshape(batch, out_len, k, cin)
        dx = np.zeros_like(self.x)
        for i in range(out_len):
            dx[:, i:i + k, :] += dwindows[:, i, :, :]
        return dx


class LSTM(Layer):
    """Standard gated LSTM cell, unrolled over T timesteps.
    Input (batch, T, in_dim); output is the final hidden state
    (batch, hidden_dim) unless return_sequence=True."""

    def __init__(self, in_dim, hidden_dim, return_sequence=False):
        super().__init__()
        self.in_dim = in_dim
        self.h = hidden_dim
        self.return_sequence = return_sequence
        limit = np.sqrt(6.0 / (in_dim + hidden_dim))
        self.params["W"] = np.random.uniform(-limit, limit, (in_dim + hidden_dim, 4 * hidden_dim))
        self.params["b"] = np.zeros(4 * hidden_dim)

    def forward(self, x, training=True):
        batch, T, _ = x.shape
        h = np.zeros((batch, self.h))
        c = np.zeros((batch, self.h))
        self.cache = []
        hs = []
        H = self.h
        for t in range(T):
            xt = x[:, t, :]
            concat = np.concatenate([xt, h], axis=1)
            gates = concat @ self.params["W"] + self.params["b"]
            i = 1 / (1 + np.exp(-np.clip(gates[:, 0:H], -30, 30)))
            f = 1 / (1 + np.exp(-np.clip(gates[:, H:2 * H], -30, 30)))
            o = 1 / (1 + np.exp(-np.clip(gates[:, 2 * H:3 * H], -30, 30)))
            g = np.tanh(gates[:, 3 * H:4 * H])
            c_new = f * c + i * g
            h_new = o * np.tanh(c_new)
            self.cache.append((h, c, i, f, o, g, c_new, concat))
            h, c = h_new, c_new
            hs.append(h)
        self.hs = np.stack(hs, axis=1)
        return self.hs if self.return_sequence else h

    def backward(self, dout):
        T = len(self.cache)
        batch = dout.shape[0]
        H = self.h
        dW = np.zeros_like(self.params["W"])
        db = np.zeros_like(self.params["b"])
        dh_next = np.zeros((batch, H))
        dc_next = np.zeros((batch, H))
        dx = np.zeros((batch, T, self.in_dim))

        if self.return_sequence:
            dh_seq = dout
        else:
            dh_seq = np.zeros((batch, T, H))
            dh_seq[:, -1, :] = dout

        for t in reversed(range(T)):
            h_prev, c_prev, i, f, o, g, c_new, concat = self.cache[t]
            dh = dh_seq[:, t, :] + dh_next
            tanh_c = np.tanh(c_new)
            do = dh * tanh_c
            dc = dh * o * (1 - tanh_c ** 2) + dc_next
            di = dc * g
            df = dc * c_prev
            dg = dc * i
            dgate_i = di * i * (1 - i)
            dgate_f = df * f * (1 - f)
            dgate_o = do * o * (1 - o)
            dgate_g = dg * (1 - g ** 2)
            dgates = np.concatenate([dgate_i, dgate_f, dgate_o, dgate_g], axis=1)
            dW += concat.T @ dgates
            db += dgates.sum(axis=0)
            dconcat = dgates @ self.params["W"].T
            dx[:, t, :] = dconcat[:, :self.in_dim]
            dh_next = dconcat[:, self.in_dim:]
            dc_next = dc * f

        self.grads["W"] = dW
        self.grads["b"] = db
        return dx


class Adam:
    def __init__(self, layers, lr=1e-3, beta1=0.9, beta2=0.999, eps=1e-8):
        self.layers = layers
        self.lr = lr
        self.b1 = beta1
        self.b2 = beta2
        self.eps = eps
        self.m, self.v, self.t = {}, {}, 0
        for li, layer in enumerate(layers):
            for name in layer.params:
                key = (li, name)
                self.m[key] = np.zeros_like(layer.params[name])
                self.v[key] = np.zeros_like(layer.params[name])

    def step(self):
        self.t += 1
        for li, layer in enumerate(self.layers):
            for name in layer.params:
                key = (li, name)
                g = layer.grads.get(name)
                if g is None:
                    continue
                self.m[key] = self.b1 * self.m[key] + (1 - self.b1) * g
                self.v[key] = self.b2 * self.v[key] + (1 - self.b2) * (g ** 2)
                mhat = self.m[key] / (1 - self.b1 ** self.t)
                vhat = self.v[key] / (1 - self.b2 ** self.t)
                layer.params[name] -= self.lr * mhat / (np.sqrt(vhat) + self.eps)


class Sequential:
    def __init__(self, layers):
        self.layers = layers

    def forward(self, x, training=True):
        for layer in self.layers:
            x = layer.forward(x, training=training)
        return x

    def backward(self, dout):
        for layer in reversed(self.layers):
            dout = layer.backward(dout)
        return dout

    def predict_logits(self, x, batch_size=2048):
        outs = []
        for s in range(0, len(x), batch_size):
            outs.append(self.forward(x[s:s + batch_size], training=False))
        return np.concatenate(outs, axis=0)

    def n_params(self):
        return sum(p.size for layer in self.layers for p in layer.params.values())


def sigmoid(x):
    return 1 / (1 + np.exp(-np.clip(x, -30, 30)))


def train_binary_classifier(model, X_train, y_train, X_val, y_val,
                             epochs=15, batch_size=256, lr=1e-3,
                             class_weight=None, verbose=True):
    """Trains `model` (a Sequential producing raw logits) against a binary
    target using BCE-with-logits, mini-batch SGD via Adam, and optional
    per-class loss weighting to counter the attack-class imbalance."""
    opt = Adam(model.layers, lr=lr)
    n = len(X_train)
    y_train = y_train.reshape(-1, 1)
    y_val = y_val.reshape(-1, 1)
    history = []
    for epoch in range(epochs):
        idx = np.random.permutation(n)
        for start in range(0, n, batch_size):
            b = idx[start:start + batch_size]
            xb, yb = X_train[b], y_train[b]
            logits = model.forward(xb, training=True)
            p = sigmoid(logits)
            grad = (p - yb)
            if class_weight is not None:
                w = np.where(yb == 1, class_weight[1], class_weight[0])
                grad = grad * w
            grad = grad / len(b)
            model.backward(grad)
            opt.step()
        val_logits = model.predict_logits(X_val)
        val_p = sigmoid(val_logits)
        eps = 1e-7
        val_loss = -np.mean(y_val * np.log(val_p + eps) + (1 - y_val) * np.log(1 - val_p + eps))
        history.append(float(val_loss))
        if verbose and (epoch % 3 == 0 or epoch == epochs - 1):
            print(f"    epoch {epoch + 1}/{epochs}  val_loss={val_loss:.4f}")
    return history


def train_autoencoder(model_encoder_decoder, X_train_benign, X_val,
                       epochs=15, batch_size=256, lr=1e-3, verbose=True):
    """Trains an autoencoder (Sequential mapping features -> reconstructed
    features) on benign traffic only, using MSE reconstruction loss."""
    opt = Adam(model_encoder_decoder.layers, lr=lr)
    n = len(X_train_benign)
    history = []
    for epoch in range(epochs):
        idx = np.random.permutation(n)
        for start in range(0, n, batch_size):
            b = idx[start:start + batch_size]
            xb = X_train_benign[b]
            recon = model_encoder_decoder.forward(xb, training=True)
            grad = 2 * (recon - xb) / len(b)
            model_encoder_decoder.backward(grad)
            opt.step()
        recon_val = model_encoder_decoder.predict_logits(X_val)
        val_loss = float(np.mean((recon_val - X_val) ** 2))
        history.append(val_loss)
        if verbose and (epoch % 3 == 0 or epoch == epochs - 1):
            print(f"    epoch {epoch + 1}/{epochs}  val_mse={val_loss:.4f}")
    return history
