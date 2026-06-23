const fs = require("fs");
const path = require("path");

const edgeModel = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "edge_model.json"), "utf-8")
);

const DEVICE_CRITICALITY = {
  pacemaker: 1.0,
  infusion_pump: 0.9,
  ecg_wearable: 0.6,
  glucose_sensor: 0.5,
};

const ATTACK_TYPE_NAMES = {
  0: "benign",
  1: "volumetric",
  2: "protocol",
  3: "application_layer",
};

function sigmoid(z) {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/**
 * Runs the exported logistic-regression coefficients against a raw
 * (unscaled) feature vector, applying the same standardization used
 * during training. This is the lightweight model assumed to run on the
 * gateway/edge device for real-time scoring.
 */
function predictProbability(rawFeatures) {
  const { scaler_mean, scaler_scale, weights, bias } = edgeModel;
  let z = bias;
  for (let i = 0; i < weights.length; i++) {
    const scaled = (rawFeatures[i] - scaler_mean[i]) / scaler_scale[i];
    z += scaled * weights[i];
  }
  return sigmoid(z);
}

function severityFromProbability(probability, deviceType) {
  const criticality = DEVICE_CRITICALITY[deviceType] ?? 0.5;
  const score = Math.round(100 * (0.65 * probability + 0.35 * criticality));
  let tier = "Low";
  if (score >= 85) tier = "Critical";
  else if (score >= 65) tier = "High";
  else if (score >= 40) tier = "Medium";
  return { score, tier };
}

module.exports = {
  edgeModel,
  predictProbability,
  severityFromProbability,
  ATTACK_TYPE_NAMES,
  DEVICE_CRITICALITY,
};
