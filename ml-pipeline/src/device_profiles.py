"""
Device profiles for IoMT traffic simulation.

Each profile encodes the transmission behaviour of a representative medical
device type, derived from the device descriptions in the source research
(wearable ECG monitor, glucose sensor, infusion pump, implantable pacemaker).
These parameters drive the synthetic "normal traffic" generator.
"""

PROTOCOL_CODES = {"TCP": 0, "UDP": 1, "HTTP": 2}

DEVICE_PROFILES = {
    "ecg_wearable": {
        "code": 0,
        "protocol": "TCP",
        "mean_interval_s": 5.0,
        "jitter_s": 0.4,
        "payload_bytes": (48, 96),
        "packets_per_flow": (1, 2),
        "bursty": False,
    },
    "glucose_sensor": {
        "code": 1,
        "protocol": "UDP",
        "mean_interval_s": 300.0,
        "jitter_s": 12.0,
        "payload_bytes": (24, 56),
        "packets_per_flow": (1, 1),
        "bursty": False,
    },
    "infusion_pump": {
        "code": 2,
        "protocol": "HTTP",
        "mean_interval_s": 90.0,
        "jitter_s": 30.0,
        "payload_bytes": (96, 320),
        "packets_per_flow": (2, 6),
        "bursty": True,
        "burst_prob": 0.04,
        "burst_size": (3, 10),
    },
    "pacemaker": {
        "code": 3,
        "protocol": "TCP",
        "mean_interval_s": 240.0,
        "jitter_s": 60.0,
        "payload_bytes": (32, 80),
        "packets_per_flow": (1, 3),
        "bursty": True,
        "burst_prob": 0.05,
        "burst_size": (3, 8),
    },
}

ATTACK_TYPES = {
    "volumetric": {
        "label": 1,
        "protocol": "UDP",
        "packet_rate": (300, 9000),
        "mean_packet_size": (60, 512),
        "syn_count": (0, 0),
        "fin_count": (0, 0),
        "flow_duration": (0.5, 3.0),
    },
    "protocol": {
        "label": 2,
        "protocol": "TCP",
        "packet_rate": (150, 5000),
        "mean_packet_size": (40, 90),
        "syn_count": (40, 5000),
        "fin_count": (0, 3),
        "flow_duration": (0.5, 4.0),
    },
    "application_layer": {
        "label": 3,
        "protocol": "HTTP",
        "packet_rate": (35, 250),
        "mean_packet_size": (110, 700),
        "syn_count": (1, 20),
        "fin_count": (1, 20),
        "flow_duration": (2.0, 20.0),
    },
}

FEATURE_COLUMNS = [
    "duration",
    "total_packets",
    "total_bytes",
    "packet_rate",
    "byte_rate",
    "mean_packet_size",
    "protocol_code",
    "syn_count",
    "fin_count",
    "device_type_code",
    "inter_arrival",
    "inter_arrival_roll_std",
]
