"""
Phase 3C — Train the LSTM Trend Classifier.

Architecture (plan.md §4.7 / sender's design doc §3-5):
    Input:  (batch, L=14, 8 features)
    LSTM1:  hidden_size=64, batch_first
    Drop:   p=0.30
    LSTM2:  hidden_size=32, batch_first
    Drop:   p=0.30 (last time-step only)
    FC1:    32 → 16, ReLU
    FC2:    16 → 4 (softmax)

Training config (plan.md §4.7):
    Optimizer:    Adam, lr=1e-3
    Loss:         CrossEntropyLoss
    Batch:        16
    Epochs:       150 (max)
    EarlyStop:    patience=15 on val_loss
    LR scheduler: ReduceLROnPlateau, factor=0.5, patience=5
    Split:        PARTICIPANT-WISE 80/20 by patient_id

Non-negotiables:
    - Fit StandardScaler on train patients only, never touch val patients
    - Split at patient_id — no session leakage
    - Report per-class F1 + confusion matrix

Usage:
    python apps/api/notebooks/train_lstm_trend.py

Output:
    apps/api/models/lstm_trend.pt
    data/processed/scaler_lstm_trend_mean.npy
    data/processed/scaler_lstm_trend_scale.npy
    apps/api/models/lstm_trend_metrics.json
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from torch import nn
from torch.utils.data import DataLoader, Dataset

ROOT = Path(__file__).parent.parent.parent.parent
DATA_PATH = ROOT / "data" / "processed" / "longitudinal_synthetic.csv"
MODEL_DIR = ROOT / "apps" / "api" / "models"
SCALER_DIR = ROOT / "data" / "processed"

MODEL_DIR.mkdir(parents=True, exist_ok=True)
SCALER_DIR.mkdir(parents=True, exist_ok=True)

FEATURE_COLS = [
    "acetone_delta",
    "pressure_mean",
    "pressure_std",
    "breath_duration",
    "temperature",
    "humidity",
    "quality_score",
    "reliability_score",
]
TREND_LABELS = ["stable", "increasing", "decreasing", "abnormal"]
LABEL_TO_IDX = {lbl: i for i, lbl in enumerate(TREND_LABELS)}

SEED = 42
BATCH_SIZE = 16
LR = 1e-3
MAX_EPOCHS = 150
EARLY_STOP_PATIENCE = 15
LR_SCHED_PATIENCE = 5
LR_SCHED_FACTOR = 0.5
DROPOUT = 0.30
HIDDEN_1 = 64
HIDDEN_2 = 32
FC_HIDDEN = 16

torch.manual_seed(SEED)
np.random.seed(SEED)
random.seed(SEED)


# ─── Dataset ──────────────────────────────────────────────────────────────────

class TrendSequenceDataset(Dataset):
    """One sample per patient — full 14-session sequence + one trend label."""

    def __init__(self, sequences: np.ndarray, labels: np.ndarray):
        self.sequences = torch.tensor(sequences, dtype=torch.float32)
        self.labels = torch.tensor(labels, dtype=torch.long)

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, idx: int):
        return self.sequences[idx], self.labels[idx]


def build_patient_sequences(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """(N_patients, L, F) sequences, (N_patients,) labels, patient_id order."""
    pids = sorted(df["patient_id"].unique())
    L = df.groupby("patient_id").size().min()
    seqs = np.zeros((len(pids), L, len(FEATURE_COLS)), dtype=np.float32)
    labels = np.zeros(len(pids), dtype=np.int64)

    for i, pid in enumerate(pids):
        pat = df[df["patient_id"] == pid].sort_values("session_idx")
        assert len(pat) >= L, f"patient {pid} has only {len(pat)} sessions"
        seqs[i] = pat[FEATURE_COLS].iloc[:L].values
        labels[i] = LABEL_TO_IDX[pat["trend_label"].iloc[0]]

    return seqs, labels, pids


# ─── Model ────────────────────────────────────────────────────────────────────

class LSTMTrendClassifier(nn.Module):
    def __init__(self, n_features: int, n_classes: int):
        super().__init__()
        self.lstm1 = nn.LSTM(input_size=n_features, hidden_size=HIDDEN_1, batch_first=True)
        self.drop1 = nn.Dropout(DROPOUT)
        self.lstm2 = nn.LSTM(input_size=HIDDEN_1, hidden_size=HIDDEN_2, batch_first=True)
        self.drop2 = nn.Dropout(DROPOUT)
        self.fc1 = nn.Linear(HIDDEN_2, FC_HIDDEN)
        self.fc2 = nn.Linear(FC_HIDDEN, n_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h1, _ = self.lstm1(x)             # (B, L, HIDDEN_1)
        h1 = self.drop1(h1)
        h2, _ = self.lstm2(h1)            # (B, L, HIDDEN_2)
        last = h2[:, -1, :]               # (B, HIDDEN_2) — last time step
        last = self.drop2(last)
        z = torch.relu(self.fc1(last))
        return self.fc2(z)                # logits


# ─── Training loop ────────────────────────────────────────────────────────────

def train_epoch(model, loader, opt, loss_fn, device) -> float:
    model.train()
    total = 0.0
    n = 0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        opt.zero_grad()
        logits = model(x)
        loss = loss_fn(logits, y)
        loss.backward()
        opt.step()
        total += loss.item() * y.size(0)
        n += y.size(0)
    return total / max(n, 1)


@torch.no_grad()
def eval_epoch(model, loader, loss_fn, device) -> tuple[float, np.ndarray, np.ndarray]:
    model.eval()
    total, n = 0.0, 0
    ys, ps = [], []
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        logits = model(x)
        loss = loss_fn(logits, y)
        total += loss.item() * y.size(0)
        n += y.size(0)
        ys.append(y.cpu().numpy())
        ps.append(logits.argmax(-1).cpu().numpy())
    return total / max(n, 1), np.concatenate(ys), np.concatenate(ps)


def main() -> None:
    # TRAINING-DATA POLICY (see app/services/ml_data.py):
    #   Reads from a curated CSV, not production DB. If migrated to DB later,
    #   MUST use app.services.ml_data.get_training_readings() which enforces:
    #     users.exclude_from_training = FALSE   (excludes sunbright, admin/demo)
    #     session_id NOT LIKE '%-sim-%' / '%-pilot-%' / 'demo-%'
    #     raw->>'source' NOT matching simulated_/excel_pilot_import/demo_/synthetic_
    print(f"Loading: {DATA_PATH.relative_to(ROOT)}")
    df = pd.read_csv(DATA_PATH)
    print(f"  rows={len(df):,}  patients={df['patient_id'].nunique()}")

    seqs, labels, pids = build_patient_sequences(df)
    print(f"  shape sequences={seqs.shape}  labels={labels.shape}")
    print(f"  class distribution: {dict(zip(*np.unique(labels, return_counts=True)))}")

    # ─── Participant-wise split ─────────────────────────────────────────────
    train_idx, val_idx = train_test_split(
        np.arange(len(pids)),
        test_size=0.20,
        random_state=SEED,
        stratify=labels,
    )
    train_pids = [pids[i] for i in train_idx]
    val_pids = [pids[i] for i in val_idx]
    print(f"\nParticipant-wise split:")
    print(f"  train patients: {len(train_pids)}  val patients: {len(val_pids)}")
    assert set(train_pids).isdisjoint(val_pids), "patient leakage between splits"

    # ─── Fit scaler on TRAIN ONLY ───────────────────────────────────────────
    train_flat = seqs[train_idx].reshape(-1, len(FEATURE_COLS))
    scaler = StandardScaler().fit(train_flat)

    seqs_scaled = (seqs - scaler.mean_) / scaler.scale_

    train_ds = TrendSequenceDataset(seqs_scaled[train_idx], labels[train_idx])
    val_ds   = TrendSequenceDataset(seqs_scaled[val_idx],   labels[val_idx])
    train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,  drop_last=False)
    val_dl   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, drop_last=False)

    # ─── Model / optim ──────────────────────────────────────────────────────
    device = torch.device("cpu")
    model = LSTMTrendClassifier(n_features=len(FEATURE_COLS), n_classes=len(TREND_LABELS)).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\nModel: {n_params:,} trainable parameters  (device={device})")

    opt = torch.optim.Adam(model.parameters(), lr=LR)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        opt, mode="min", factor=LR_SCHED_FACTOR, patience=LR_SCHED_PATIENCE
    )
    loss_fn = nn.CrossEntropyLoss()

    # ─── Fit ────────────────────────────────────────────────────────────────
    best_val = float("inf")
    best_state = None
    patience = 0
    history = []

    for epoch in range(1, MAX_EPOCHS + 1):
        tr_loss = train_epoch(model, train_dl, opt, loss_fn, device)
        va_loss, y_true, y_pred = eval_epoch(model, val_dl, loss_fn, device)
        va_acc = accuracy_score(y_true, y_pred)
        scheduler.step(va_loss)
        history.append({"epoch": epoch, "train_loss": tr_loss,
                        "val_loss": va_loss, "val_acc": va_acc,
                        "lr": opt.param_groups[0]["lr"]})

        if epoch == 1 or epoch % 10 == 0 or va_loss < best_val:
            print(f"  epoch {epoch:>3d}  tr_loss={tr_loss:.4f}  "
                  f"va_loss={va_loss:.4f}  va_acc={va_acc:.4f}  "
                  f"lr={opt.param_groups[0]['lr']:.5f}")

        if va_loss < best_val - 1e-4:
            best_val = va_loss
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            patience = 0
        else:
            patience += 1
            if patience >= EARLY_STOP_PATIENCE:
                print(f"  early-stop at epoch {epoch} (patience {patience})")
                break

    assert best_state is not None
    model.load_state_dict(best_state)

    # ─── Final evaluation ───────────────────────────────────────────────────
    _, y_true, y_pred = eval_epoch(model, val_dl, loss_fn, device)
    val_acc = accuracy_score(y_true, y_pred)
    val_f1_weighted = f1_score(y_true, y_pred, average="weighted", zero_division=0)
    val_f1_macro    = f1_score(y_true, y_pred, average="macro",    zero_division=0)

    print("\n=== Final Validation Report ===")
    print(classification_report(y_true, y_pred, target_names=TREND_LABELS, zero_division=0))
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(TREND_LABELS))))
    print("Confusion matrix (rows=true, cols=pred):")
    print(f"  {'':<12s}" + "".join(f"{lbl:>12s}" for lbl in TREND_LABELS))
    for i, lbl in enumerate(TREND_LABELS):
        print(f"  {lbl:<12s}" + "".join(f"{cm[i, j]:>12d}" for j in range(len(TREND_LABELS))))

    # ─── Persist artifacts ──────────────────────────────────────────────────
    model_path = MODEL_DIR / "lstm_trend.pt"
    torch.save(model.state_dict(), model_path)
    print(f"\nSaved: {model_path.relative_to(ROOT)}")

    scaler_mean_path  = SCALER_DIR / "scaler_lstm_trend_mean.npy"
    scaler_scale_path = SCALER_DIR / "scaler_lstm_trend_scale.npy"
    np.save(scaler_mean_path,  scaler.mean_)
    np.save(scaler_scale_path, scaler.scale_)
    print(f"Saved: {scaler_mean_path.relative_to(ROOT)}")
    print(f"Saved: {scaler_scale_path.relative_to(ROOT)}")

    metrics = {
        "dataset": {
            "source_file": str(DATA_PATH.relative_to(ROOT)),
            "n_patients": len(pids),
            "sessions_per_patient": int(seqs.shape[1]),
            "n_features": len(FEATURE_COLS),
            "trend_labels": TREND_LABELS,
        },
        "split": {
            "strategy": "participant-wise stratified 80/20",
            "train_patients": len(train_pids),
            "val_patients": len(val_pids),
            "seed": SEED,
        },
        "training": {
            "batch_size": BATCH_SIZE,
            "learning_rate": LR,
            "dropout": DROPOUT,
            "max_epochs": MAX_EPOCHS,
            "early_stop_patience": EARLY_STOP_PATIENCE,
            "epochs_run": len(history),
            "best_val_loss": round(float(best_val), 4),
        },
        "final_val": {
            "accuracy":     round(float(val_acc), 4),
            "f1_weighted":  round(float(val_f1_weighted), 4),
            "f1_macro":     round(float(val_f1_macro),    4),
            "confusion_matrix": cm.tolist(),
        },
        "feature_columns": FEATURE_COLS,
        "notes": (
            "LSTM Trend Classifier — 4-class trend detection over 14-session "
            "sequences. Labels derived from OLS slope + spike-vs-median rule "
            "(app.services.trend_label). No feature in x_t is a function of "
            "the sequence-level label, so accuracy above chance reflects "
            "genuine temporal signal extraction, not label-feature circularity."
        ),
    }
    metrics_path = MODEL_DIR / "lstm_trend_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)
    print(f"Saved: {metrics_path.relative_to(ROOT)}")

    print("\n=== Summary ===")
    print(f"  val_acc={val_acc:.4f}  f1_w={val_f1_weighted:.4f}  f1_m={val_f1_macro:.4f}  "
          f"epochs={len(history)}  best_val_loss={best_val:.4f}")


if __name__ == "__main__":
    main()
