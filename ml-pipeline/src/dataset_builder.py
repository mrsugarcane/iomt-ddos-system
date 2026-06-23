"""
Orchestrates dataset synthesis end to end:

1. Generate raw per-flow records across all device sessions (traffic_simulator).
2. Compute inter-arrival features per session.
3. Persist the full labeled flow table to CSV.
4. Split into train/val/test (stratified by label_binary).
5. Standardize tabular features (fit on train only).
6. Build sliding-window sequences per session for the sequence models
   (LSTM, Hybrid CNN-LSTM).
7. Persist processed arrays as a single .npz for fast model training.
"""

import json
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

from traffic_simulator import generate_dataset
from device_profiles import FEATURE_COLUMNS

WINDOW_SIZE = 10
WINDOW_STRIDE = 5


def build_flow_table(n_sessions_per_device=20, session_duration_s=6 * 3600,
                      attack_fraction=0.35, seed=42):
    rows = generate_dataset(n_sessions_per_device, session_duration_s, attack_fraction, seed)
    df = pd.DataFrame(rows)
    df.sort_values(["session_id", "t"], inplace=True)
    df.reset_index(drop=True, inplace=True)

    df["inter_arrival"] = df.groupby("session_id")["t"].diff().fillna(0.0)
    df["inter_arrival_roll_std"] = (
        df.groupby("session_id")["inter_arrival"]
        .rolling(window=5, min_periods=1)
        .std()
        .fillna(0.0)
        .reset_index(drop=True)
    )
    return df


def make_windows(df, feature_cols, window_size=WINDOW_SIZE, stride=WINDOW_STRIDE):
    """Builds (X_seq, y_seq) where each sample is a window of `window_size`
    consecutive flows from the same session, label = label of the last
    flow in the window (i.e. "is the current moment under attack")."""
    X_list, y_bin_list, y_multi_list, meta = [], [], [], []
    for session_id, group in df.groupby("session_id"):
        feats = group[feature_cols].values
        labels_bin = group["label_binary"].values
        labels_multi = group["label_multiclass"].values
        n = len(group)
        if n < window_size:
            continue
        for start in range(0, n - window_size + 1, stride):
            end = start + window_size
            X_list.append(feats[start:end])
            y_bin_list.append(labels_bin[end - 1])
            y_multi_list.append(labels_multi[end - 1])
            meta.append(session_id)
    return (
        np.array(X_list, dtype=np.float64),
        np.array(y_bin_list, dtype=np.float64),
        np.array(y_multi_list, dtype=np.int64),
        np.array(meta),
    )


def run(output_dir, n_sessions_per_device=32, session_duration_s=6 * 3600,
        attack_fraction=0.8, seed=42):
    print("Synthesizing IoMT traffic + DDoS attack flows...")
    df = build_flow_table(n_sessions_per_device, session_duration_s, attack_fraction, seed)
    print(f"  total flows: {len(df):,}  attack flows: {int(df['label_binary'].sum()):,} "
          f"({df['label_binary'].mean() * 100:.1f}%)")

    csv_path = f"{output_dir}/flows.csv"
    df.to_csv(csv_path, index=False)
    print(f"  saved flow table -> {csv_path}")

    train_idx, holdout_idx = train_test_split(
        df.index, test_size=0.333, random_state=seed, stratify=df["label_binary"]
    )
    val_idx, test_idx = train_test_split(
        holdout_idx, test_size=0.70, random_state=seed, stratify=df.loc[holdout_idx, "label_binary"]
    )

    scaler = StandardScaler()
    X_all = df[FEATURE_COLUMNS].values
    scaler.fit(X_all[df.index.isin(train_idx)])
    X_scaled = scaler.transform(X_all)

    df_scaled = df.copy()
    df_scaled[FEATURE_COLUMNS] = X_scaled

    def subset(idx):
        sub = df_scaled.loc[idx]
        return (
            sub[FEATURE_COLUMNS].values,
            sub["label_binary"].values,
            sub["label_multiclass"].values,
        )

    X_train, y_train, y_train_m = subset(train_idx)
    X_val, y_val, y_val_m = subset(val_idx)
    X_test, y_test, y_test_m = subset(test_idx)

    raw_test_cols = ["session_id", "device_type", "t"] + FEATURE_COLUMNS + ["label_multiclass"]
    df.loc[test_idx, raw_test_cols].to_csv(f"{output_dir}/test_flows_raw.csv", index=False)

    print("Building sliding-window sequences for sequence models...")
    train_sessions = set(df.loc[train_idx, "session_id"].unique())
    val_sessions = set(df.loc[val_idx, "session_id"].unique())
    test_sessions = set(df.loc[test_idx, "session_id"].unique())

    Xs_train, ys_train, _, _ = make_windows(df_scaled[df_scaled.session_id.isin(train_sessions)], FEATURE_COLUMNS)
    Xs_val, ys_val, _, _ = make_windows(df_scaled[df_scaled.session_id.isin(val_sessions)], FEATURE_COLUMNS)
    Xs_test, ys_test, ys_test_m, _ = make_windows(df_scaled[df_scaled.session_id.isin(test_sessions)], FEATURE_COLUMNS)

    print(f"  tabular: train {X_train.shape}, val {X_val.shape}, test {X_test.shape}")
    print(f"  sequence: train {Xs_train.shape}, val {Xs_val.shape}, test {Xs_test.shape}")

    np.savez_compressed(
        f"{output_dir}/processed.npz",
        X_train=X_train, y_train=y_train, y_train_m=y_train_m,
        X_val=X_val, y_val=y_val, y_val_m=y_val_m,
        X_test=X_test, y_test=y_test, y_test_m=y_test_m,
        Xs_train=Xs_train, ys_train=ys_train,
        Xs_val=Xs_val, ys_val=ys_val,
        Xs_test=Xs_test, ys_test=ys_test, ys_test_m=ys_test_m,
        feature_cols=np.array(FEATURE_COLUMNS),
        scaler_mean=scaler.mean_, scaler_scale=scaler.scale_,
    )
    print(f"  saved processed arrays -> {output_dir}/processed.npz")

    meta = {
        "n_flows": int(len(df)),
        "n_attack_flows": int(df["label_binary"].sum()),
        "attack_fraction": float(df["label_binary"].mean()),
        "device_types": df["device_type"].value_counts().to_dict(),
        "attack_type_counts": df["label_multiclass"].value_counts().to_dict(),
        "n_sequence_windows": int(len(Xs_train) + len(Xs_val) + len(Xs_test)),
        "window_size": WINDOW_SIZE,
        "feature_columns": FEATURE_COLUMNS,
    }
    with open(f"{output_dir}/dataset_summary.json", "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  saved dataset summary -> {output_dir}/dataset_summary.json")
    return df


if __name__ == "__main__":
    run("../data")
