const DEVICE_PROFILES = {
  ecg_wearable: { code: 0, protocol: 0, meanInterval: 5.0, jitter: 0.4, payload: [48, 96], packets: [1, 2] },
  glucose_sensor: { code: 1, protocol: 1, meanInterval: 300.0, jitter: 12.0, payload: [24, 56], packets: [1, 1] },
  infusion_pump: { code: 2, protocol: 2, meanInterval: 90.0, jitter: 30.0, payload: [96, 320], packets: [2, 6] },
  pacemaker: { code: 3, protocol: 0, meanInterval: 240.0, jitter: 60.0, payload: [32, 80], packets: [1, 3] },
};

const ATTACK_TYPES = {
  volumetric: { code: 1, protocol: 1, packetRate: [300, 9000], packetSize: [60, 512], syn: [0, 0] },
  protocol: { code: 2, protocol: 0, packetRate: [150, 5000], packetSize: [40, 90], syn: [40, 5000] },
  application_layer: { code: 3, protocol: 2, packetRate: [35, 250], packetSize: [110, 700], syn: [1, 20] },
};

function randUniform(lo, hi) {
  return lo + Math.random() * (hi - lo);
}
function randInt(lo, hi) {
  return Math.floor(randUniform(lo, hi + 1));
}
function gaussianNoise(mean, std) {
  const u = Math.random() || 1e-9;
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + std * z;
}
function lognormalNoise(sigma) {
  return Math.exp(gaussianNoise(0, sigma));
}
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

class VirtualDevice {
  constructor(id, deviceType) {
    this.id = id;
    this.deviceType = deviceType;
    this.profile = DEVICE_PROFILES[deviceType];
    this.simTime = 0;
    this.recentGaps = [];
    this.attack = null;
  }

  maybeStartAttack() {
    if (!this.attack && Math.random() < 0.004) {
      const types = Object.keys(ATTACK_TYPES);
      const type = types[randInt(0, types.length - 1)];
      const durationSimSeconds = randUniform(30, 180);
      this.attack = { type, startTime: this.simTime, endTime: this.simTime + durationSimSeconds };
    }
  }

  nextFlow() {
    this.maybeStartAttack();
    let gap, row;

    if (this.attack && this.simTime < this.attack.endTime) {
      const atk = ATTACK_TYPES[this.attack.type];
      const progress = this.simTime - this.attack.startTime;
      const remaining = this.attack.endTime - this.simTime;
      const rampS = Math.min(15, (this.attack.endTime - this.attack.startTime) * 0.25);
      let ramp = Math.min(1, progress / Math.max(rampS, 1e-6), remaining / Math.max(rampS, 1e-6));
      ramp = Math.max(0.15, ramp);

      const duration = randUniform(0.5, 4.0);
      const packetRate = randUniform(atk.packetRate[0], atk.packetRate[1]) * ramp * lognormalNoise(0.12);
      const meanPktSize = randUniform(atk.packetSize[0], atk.packetSize[1]) * lognormalNoise(0.1);
      const packets = Math.max(1, Math.floor(packetRate * duration));
      const totalBytes = packets * meanPktSize;
      const byteRate = totalBytes / duration;
      gap = duration;

      row = {
        duration, total_packets: packets, total_bytes: totalBytes,
        packet_rate: packetRate, byte_rate: byteRate, mean_packet_size: meanPktSize,
        protocol_code: atk.protocol,
        syn_count: Math.floor(randUniform(atk.syn[0], atk.syn[1]) * ramp),
        fin_count: randInt(0, 3),
        device_type_code: this.profile.code,
        groundTruthLabel: 1, attackType: this.attack.type,
      };
      if (this.simTime + gap >= this.attack.endTime) this.attack = null;
    } else {
      const packets = randInt(this.profile.packets[0], this.profile.packets[1]);
      const payload = randUniform(this.profile.payload[0], this.profile.payload[1]) * lognormalNoise(0.18);
      const totalBytes = payload * packets;
      const duration = Math.max(0.01, gaussianNoise(0.05, 0.025));
      const packetRate = packets / duration;
      const byteRate = totalBytes / duration;
      gap = Math.max(0.05, this.profile.meanInterval + gaussianNoise(0, this.profile.jitter));

      row = {
        duration, total_packets: packets, total_bytes: totalBytes,
        packet_rate: packetRate, byte_rate: byteRate, mean_packet_size: totalBytes / packets,
        protocol_code: this.profile.protocol,
        syn_count: this.profile.protocol === 0 ? 1 : 0,
        fin_count: this.profile.protocol === 0 ? 1 : 0,
        device_type_code: this.profile.code,
        groundTruthLabel: 0, attackType: null,
      };
    }

    this.recentGaps.push(gap);
    if (this.recentGaps.length > 5) this.recentGaps.shift();
    row.inter_arrival = gap;
    row.inter_arrival_roll_std = stdDev(this.recentGaps);
    this.simTime += gap;
    return row;
  }
}

function createFleet() {
  return [
    new VirtualDevice("ECG-01", "ecg_wearable"),
    new VirtualDevice("ECG-02", "ecg_wearable"),
    new VirtualDevice("GLU-01", "glucose_sensor"),
    new VirtualDevice("PUMP-01", "infusion_pump"),
    new VirtualDevice("PUMP-02", "infusion_pump"),
    new VirtualDevice("PACE-01", "pacemaker"),
  ];
}

function featuresFromRow(row, featureColumns) {
  return featureColumns.map((col) => row[col]);
}

module.exports = { createFleet, featuresFromRow, DEVICE_PROFILES, ATTACK_TYPES };
