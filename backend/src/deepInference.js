"use strict";

// ---- Math helpers -------------------------------------------------------

function matMul(A, B, rowsA, colsA, colsB) {
  const C = new Float64Array(rowsA * colsB);
  for (let i = 0; i < rowsA; i++)
    for (let k = 0; k < colsA; k++) {
      const aik = A[i * colsA + k];
      for (let j = 0; j < colsB; j++)
        C[i * colsB + j] += aik * B[k * colsB + j];
    }
  return C;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
}

// ---- Layer forward passes -----------------------------------------------

function dense(x, W, b, rows, inDim, outDim) {
  // x: rows × inDim, W: inDim × outDim, b: outDim  →  rows × outDim
  const out = matMul(x, W, rows, inDim, outDim);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < outDim; j++)
      out[i * outDim + j] += b[j];
  return out;
}

function relu(x) {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] > 0 ? x[i] : 0;
  return out;
}

function tanh_(x) {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.tanh(x[i]);
  return out;
}

function flatten(x) { return x; }  // already Float64Array in our use

function reshape(x, newShape) { return x; }  // Float64Array, shape is tracked separately

function conv1d(x, W, b, length, inC, outC, kernelSize) {
  // x: length × inC, W: kernelSize × inC × outC, b: outC
  // → (length - kernelSize + 1) × outC
  const outLen = length - kernelSize + 1;
  const out = new Float64Array(outLen * outC);
  for (let t = 0; t < outLen; t++)
    for (let oc = 0; oc < outC; oc++) {
      let sum = b[oc];
      for (let k = 0; k < kernelSize; k++)
        for (let ic = 0; ic < inC; ic++)
          sum += x[(t + k) * inC + ic] * W[(k * inC + ic) * outC + oc];
      out[t * outC + oc] = sum;
    }
  return out;
}

function lstmStep(x, h, c, W, b, inDim, hidDim) {
  // x: inDim, h/c: hidDim, W: (inDim+hidDim)×(4*hidDim), b: 4*hidDim
  const concat = new Float64Array(inDim + hidDim);
  concat.set(x, 0);
  concat.set(h, inDim);
  const gates = dense(concat, W, b, 1, inDim + hidDim, 4 * hidDim);
  const H = hidDim;
  const i_ = new Float64Array(H), f_ = new Float64Array(H);
  const o_ = new Float64Array(H), g_ = new Float64Array(H);
  for (let j = 0; j < H; j++) {
    i_[j] = sigmoid(gates[j]);
    f_[j] = sigmoid(gates[H + j]);
    o_[j] = sigmoid(gates[2 * H + j]);
    g_[j] = Math.tanh(gates[3 * H + j]);
  }
  const cNew = new Float64Array(H);
  const hNew = new Float64Array(H);
  for (let j = 0; j < H; j++) {
    cNew[j] = f_[j] * c[j] + i_[j] * g_[j];
    hNew[j] = o_[j] * Math.tanh(cNew[j]);
  }
  return { h: hNew, c: cNew };
}

// ---- Full model forward pass --------------------------------------------

function forwardPass(model, rawFeatures) {
  const { layers, scaler_mean, scaler_scale, feature_columns } = model;

  // Standardize
  const x = new Float64Array(feature_columns.length);
  for (let i = 0; i < feature_columns.length; i++)
    x[i] = (rawFeatures[i] - scaler_mean[i]) / scaler_scale[i];

  let current = x;
  let currentRows = 1;
  let currentCols = feature_columns.length;
  let seqLen = null;

  for (const layer of layers) {
    const { type, params } = layer;

    if (type === "Reshape") {
      const ts = layer.target_shape;
      if (ts.length === 2) {
        seqLen = ts[0];
        currentCols = ts[1];
      }
      continue;
    }

    if (type === "Dense") {
      const W = new Float64Array(params.W.flat(Infinity));
      const b = new Float64Array(params.b);
      const inDim = params.W.length;
      const outDim = params.W[0].length;
      current = dense(current, W, b, currentRows * (seqLen || 1), inDim, outDim);
      currentCols = outDim;
      continue;
    }

    if (type === "ReLU") { current = relu(current); continue; }
    if (type === "Dropout") { continue; }  // inference mode — no dropout

    if (type === "Flatten") {
      currentRows = 1;
      currentCols = current.length;
      seqLen = null;
      continue;
    }

    if (type === "Conv1D") {
      const kernelSize = layer.kernel_size;
      const W_raw = params.W;
      const inC = W_raw[0].length;
      const outC = W_raw[0][0].length;
      const W = new Float64Array(W_raw.flat(Infinity));
      const b = new Float64Array(params.b);
      const length = seqLen || currentCols;
      current = conv1d(current, W, b, length, inC, outC, kernelSize);
      seqLen = length - kernelSize + 1;
      currentCols = outC;
      continue;
    }

    if (type === "LSTM") {
      const hidDim = layer.hidden_dim;
      const inDim = layer.in_dim;
      const W = new Float64Array(params.W.flat(Infinity));
      const b = new Float64Array(params.b);
      const T = seqLen || 1;
      let h = new Float64Array(hidDim);
      let c = new Float64Array(hidDim);
      for (let t = 0; t < T; t++) {
        const xt = current.slice(t * currentCols, (t + 1) * currentCols);
        const state = lstmStep(xt, h, c, W, b, inDim, hidDim);
        h = state.h;
        c = state.c;
      }
      current = h;
      currentCols = hidDim;
      seqLen = null;
      continue;
    }
  }

  return sigmoid(current[0]);
}

module.exports = { forwardPass };
