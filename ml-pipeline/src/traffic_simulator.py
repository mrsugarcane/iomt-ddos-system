"""
Synthesizes per-flow network records for simulated IoMT device sessions,
optionally injecting a contiguous DDoS attack window into a session.

A "flow" here is a short aggregation of packets (matching the per-flow
feature style of CICFlowMeter-type extractors referenced in the source
research): duration, packet/byte counts, rates, and protocol flags.
"""

import numpy as np
from device_profiles import DEVICE_PROFILES, ATTACK_TYPES, PROTOCOL_CODES


def _sample_range(rng, lo_hi):
    lo, hi = lo_hi
    if lo == hi:
        return lo
    return rng.uniform(lo, hi)


def generate_normal_session(rng, device_type, session_id, duration_s):
    profile = DEVICE_PROFILES[device_type]
    rows = []
    t = rng.uniform(0, profile["mean_interval_s"])
    while t < duration_s:
        is_burst = profile.get("bursty") and rng.random() < profile.get("burst_prob", 0)
        n_in_burst = 1
        if is_burst:
            n_in_burst = rng.integers(profile["burst_size"][0], profile["burst_size"][1] + 1)
        for _ in range(n_in_burst):
            packets = rng.integers(profile["packets_per_flow"][0], profile["packets_per_flow"][1] + 1)
            payload = _sample_range(rng, profile["payload_bytes"]) * rng.lognormal(0, 0.18)
            total_bytes = payload * packets
            duration = max(0.01, rng.normal(0.05, 0.025))
            packet_rate = packets / duration
            byte_rate = total_bytes / duration
            rows.append({
                "session_id": session_id,
                "device_type": device_type,
                "device_type_code": profile["code"],
                "t": t,
                "duration": duration,
                "total_packets": packets,
                "total_bytes": total_bytes,
                "packet_rate": packet_rate,
                "byte_rate": byte_rate,
                "mean_packet_size": total_bytes / packets,
                "protocol_code": PROTOCOL_CODES[profile["protocol"]],
                "syn_count": 1 if profile["protocol"] == "TCP" else 0,
                "fin_count": 1 if profile["protocol"] == "TCP" else 0,
                "label_binary": 0,
                "label_multiclass": 0,
            })
            t += rng.normal(0, 0.05)
        jitter = rng.normal(0, profile["jitter_s"])
        t += max(0.05, profile["mean_interval_s"] + jitter)
    return rows


def generate_attack_window(rng, device_type, session_id, attack_type, start_t, window_len_s):
    profile = DEVICE_PROFILES[device_type]
    atk = ATTACK_TYPES[attack_type]
    rows = []
    t = start_t
    ramp_s = min(15.0, window_len_s * 0.25)
    while t < start_t + window_len_s:
        progress = t - start_t
        remaining = (start_t + window_len_s) - t
        ramp = min(1.0, progress / max(ramp_s, 1e-6), remaining / max(ramp_s, 1e-6))
        ramp = max(0.15, ramp)
        intensity = ramp * rng.uniform(0.5, 1.0) if rng.random() < 0.25 else ramp

        duration = _sample_range(rng, atk["flow_duration"])
        packet_rate = _sample_range(rng, atk["packet_rate"]) * intensity * rng.lognormal(0, 0.12)
        mean_pkt_size = _sample_range(rng, atk["mean_packet_size"]) * rng.lognormal(0, 0.1)
        packets = max(1, int(packet_rate * duration))
        total_bytes = packets * mean_pkt_size
        byte_rate = total_bytes / duration
        rows.append({
            "session_id": session_id,
            "device_type": device_type,
            "device_type_code": profile["code"],
            "t": t,
            "duration": duration,
            "total_packets": packets,
            "total_bytes": total_bytes,
            "packet_rate": packet_rate,
            "byte_rate": byte_rate,
            "mean_packet_size": mean_pkt_size,
            "protocol_code": PROTOCOL_CODES[atk["protocol"]],
            "syn_count": int(_sample_range(rng, atk["syn_count"]) * intensity),
            "fin_count": int(_sample_range(rng, atk["fin_count"])),
            "label_binary": 1,
            "label_multiclass": atk["label"],
        })
        t += duration
    return rows


def generate_dataset(n_sessions_per_device=20, session_duration_s=6 * 3600,
                      attack_fraction=0.35, seed=42):
    """Generates the full set of flow records across all device profiles.

    Returns a list of dict rows. A fraction of sessions get one injected
    attack window of a randomly chosen type, at a random point in the
    session, with a random duration between 30s and 10 minutes.
    """
    rng = np.random.default_rng(seed)
    all_rows = []
    session_id = 0
    attack_names = list(ATTACK_TYPES.keys())

    for device_type in DEVICE_PROFILES:
        for _ in range(n_sessions_per_device):
            session_id += 1
            rows = generate_normal_session(rng, device_type, session_id, session_duration_s)

            if rng.random() < attack_fraction:
                attack_type = attack_names[rng.integers(0, len(attack_names))]
                window_len = rng.uniform(180, 3600)
                start_t = rng.uniform(session_duration_s * 0.1, session_duration_s * 0.85)
                attack_rows = generate_attack_window(
                    rng, device_type, session_id, attack_type, start_t, window_len
                )
                rows.extend(attack_rows)

            rows.sort(key=lambda r: r["t"])
            all_rows.extend(rows)

    return all_rows
