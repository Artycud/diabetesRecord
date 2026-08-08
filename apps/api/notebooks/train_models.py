"""
MetaBreath AI Model Training Script — Anderson 2015 Five-Class Edition
Train Random Forest + XGBoost on the acetone delta demo dataset.

Two variants are trained back-to-back:

  VERIFICATION variant  — 13 features INCLUDING acetone_delta (and derived
                          ketosis_index, metabolic_score, fat_burning_index).
                          Labels are computed by applying the Anderson threshold
                          to acetone_delta, so the model reproduces that rule.
                          High reported accuracy is EXPECTED and does NOT
                          constitute independent predictive validity — it is a
                          pipeline rule-consistency check.

  PREDICTIVE variant    — 9 engineering features only. acetone_delta and its
                          three derived features are removed to break
                          label-feature circularity. Because Anderson labels
                          are a deterministic function of acetone_delta, this
                          model has no signal in the current synthetic dataset
                          and is expected to perform near chance level. It
                          exists as an honest baseline for the NSC report and
                          will be revisited once pilot BOHB labels are
                          available (Section 7.2 / L9).

Labels follow Anderson (2015) five-pattern breath acetone classification:
  basal              0.5–2 ppm   standard diet
  light_ketosis      2–4 ppm     mild caloric restriction
  nutritional_ketosis 4–30 ppm   HFLC/keto diet, BOHB 0.5–3 mM
  deep_ketosis       30–75 ppm   fasting / extended restriction
  dka_risk           ≥ 75 ppm    diabetic ketoacidosis range
Source: Anderson JC. Obesity (2015) 23:2327-2334. doi:10.1002/oby.21242

Usage:
    python apps/api/notebooks/train_models.py

Output:
    apps/api/models/rf_classifier.joblib               (verification, deployed)
    apps/api/models/xgb_classifier.joblib              (verification, deployed)
    apps/api/models/rf_classifier_predictive.joblib    (predictive baseline)
    apps/api/models/xgb_classifier_predictive.joblib   (predictive baseline)
    apps/api/models/feature_columns.json
    apps/api/models/training_metrics.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent.parent.parent   # repo root
DATASET = (
    ROOT
    / "แข่งชนะ by Coach Bright_NSC"
    / "NSC 2026"
    / "1. Data set สำหรับเทรน AI"
    / "metabreath_acetone_delta_demo_dataset.csv"
)
MODEL_DIR = ROOT / "apps" / "api" / "models"
MODEL_DIR.mkdir(exist_ok=True)

# VERIFICATION variant — 13 features (includes acetone_delta + derived).
# Reproduces the Anderson threshold rule; metrics are a rule-consistency check.
VERIFICATION_FEATURE_COLS = [
    "acetone_delta",         # LEAKY — label is a deterministic function of this
    "quality_score",
    "reliability_score",
    "ambient_voc",
    "pressure_mean",
    "pressure_std",
    "breath_duration",
    "temperature",
    "humidity",
    "environment_penalty",
    "ketosis_index",         # LEAKY — derived from acetone_delta
    "metabolic_score",       # LEAKY — composite including acetone_delta
    "fat_burning_index",     # LEAKY — derived from acetone_delta
]

# PREDICTIVE variant — 9 engineering features, no label-feature circularity.
# Expected to perform near chance-level on Anderson labels; kept as an honest
# baseline until pilot BOHB labels are available.
PREDICTIVE_FEATURE_COLS = [
    "quality_score",
    "reliability_score",
    "ambient_voc",
    "pressure_mean",
    "pressure_std",
    "breath_duration",
    "temperature",
    "humidity",
    "environment_penalty",
]

LEAKY_FEATURES = sorted(set(VERIFICATION_FEATURE_COLS) - set(PREDICTIVE_FEATURE_COLS))

# Anderson 2015 five-class thresholds applied to acetone_delta (ppm)
FIVE_CLASS_THRESHOLDS = [(2.0, "basal"), (4.0, "light_ketosis"),
                          (30.0, "nutritional_ketosis"), (75.0, "deep_ketosis")]
TRAIN_LABELS = ["basal", "light_ketosis", "nutritional_ketosis", "deep_ketosis", "dka_risk"]
LABEL_ORDER = TRAIN_LABELS


def anderson_label(ppm: float) -> str:
    for thresh, lbl in FIVE_CLASS_THRESHOLDS:
        if ppm < thresh:
            return lbl
    return "dka_risk"


# ─── Load data ────────────────────────────────────────────────────────────────
# TRAINING-DATA POLICY (see app/services/ml_data.py):
#   This script reads from a curated CSV (data/processed/*.csv) — it does NOT
#   pull directly from production sensor_readings. When a future refactor moves
#   this loader to the DB, it MUST route through:
#       from app.services.ml_data import get_training_readings
#   which enforces:
#     - users.exclude_from_training = FALSE
#     - session_id NOT LIKE '%-sim-%' / '%-pilot-%' / 'demo-%'
#     - raw->>'source' NOT matching simulated_ / excel_pilot_import / demo_ / synthetic_
#   The sunbright admin account and any imported/simulated rows are excluded
#   by design so their data never influences training.
print(f"Loading dataset: {DATASET}")
df = pd.read_csv(DATASET, encoding="utf-8-sig")
print(f"  Rows total: {len(df)} | Original labels: {df['label'].value_counts().to_dict()}")

# Drop unreliable rows (handled by reliability gate at inference)
df = df[df["label"] != "unreliable"].copy()

# Re-label all rows using Anderson 2015 thresholds
df["label"] = df["acetone_delta"].apply(anderson_label)
print(f"  5-class label distribution:\n{df['label'].value_counts().to_dict()}")

y_raw = df["label"].copy()

le = LabelEncoder()
le.fit(TRAIN_LABELS)
y = le.transform(y_raw)

# Same stratified split reused for both variants so metrics are directly comparable
X_full = df[VERIFICATION_FEATURE_COLS].copy()
X_train_idx, X_test_idx = train_test_split(
    X_full.index, test_size=0.2, random_state=42, stratify=y
)
y_train = y[X_full.index.get_indexer(X_train_idx)]
y_test  = y[X_full.index.get_indexer(X_test_idx)]
print(f"  Train: {len(X_train_idx)} | Test: {len(X_test_idx)}")


def train_variant(variant_name: str, feature_cols: list[str]) -> dict:
    """Train RF + XGB on the given feature subset and return a metrics dict."""
    print(f"\n{'=' * 70}\n>>> VARIANT: {variant_name}  ({len(feature_cols)} features)\n{'=' * 70}")
    print(f"    features: {feature_cols}")

    X_train = df.loc[X_train_idx, feature_cols].copy()
    X_test  = df.loc[X_test_idx,  feature_cols].copy()
    X_all   = df[feature_cols].copy()

    # --- Random Forest ---
    print(f"\n[{variant_name}] Training Random Forest ...")
    rf = RandomForestClassifier(
        n_estimators=200, max_depth=10, min_samples_leaf=3,
        class_weight="balanced", random_state=42, n_jobs=-1,
    )
    rf.fit(X_train, y_train)
    rf_pred = rf.predict(X_test)
    rf_acc = float((rf_pred == y_test).mean())
    rf_f1 = f1_score(y_test, rf_pred, average="weighted")
    print(classification_report(y_test, rf_pred, target_names=LABEL_ORDER, zero_division=0))
    print(f"  Random Forest — test acc: {rf_acc:.4f} | weighted F1: {rf_f1:.4f}")

    rf_cv = cross_val_score(
        rf, X_all, y,
        cv=StratifiedKFold(5, shuffle=True, random_state=42),
        scoring="f1_weighted", n_jobs=-1,
    )
    print(f"  Random Forest — 5-fold CV F1: {rf_cv.mean():.4f} ± {rf_cv.std():.4f}")

    suffix = "" if variant_name == "verification" else "_predictive"
    rf_path = MODEL_DIR / f"rf_classifier{suffix}.joblib"
    joblib.dump(rf, rf_path)
    print(f"  Saved: {rf_path}")

    feat_imp = sorted(zip(feature_cols, rf.feature_importances_), key=lambda x: -x[1])
    print(f"  Top-5 RF feature importances:")
    for feat, imp in feat_imp[:5]:
        print(f"    {feat}: {imp:.4f}")

    # --- XGBoost ---
    print(f"\n[{variant_name}] Training XGBoost ...")
    xgb = XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, eval_metric="mlogloss",
        num_class=len(TRAIN_LABELS), objective="multi:softprob",
        random_state=42, n_jobs=-1,
    )
    xgb.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    xgb_pred = xgb.predict(X_test)
    xgb_acc = float((xgb_pred == y_test).mean())
    xgb_f1 = f1_score(y_test, xgb_pred, average="weighted")
    print(classification_report(y_test, xgb_pred, target_names=LABEL_ORDER, zero_division=0))
    print(f"  XGBoost — test acc: {xgb_acc:.4f} | weighted F1: {xgb_f1:.4f}")

    xgb_cv = cross_val_score(
        xgb, X_all, y,
        cv=StratifiedKFold(5, shuffle=True, random_state=42),
        scoring="f1_weighted", n_jobs=-1,
    )
    print(f"  XGBoost — 5-fold CV F1: {xgb_cv.mean():.4f} ± {xgb_cv.std():.4f}")

    xgb_path = MODEL_DIR / f"xgb_classifier{suffix}.joblib"
    joblib.dump(xgb, xgb_path)
    print(f"  Saved: {xgb_path}")

    return {
        "feature_columns": feature_cols,
        "n_features": len(feature_cols),
        "rf": {
            "test_accuracy":       round(rf_acc, 4),
            "f1_weighted_test":    round(float(rf_f1), 4),
            "f1_weighted_cv_mean": round(float(rf_cv.mean()), 4),
            "f1_weighted_cv_std":  round(float(rf_cv.std()), 4),
        },
        "xgb": {
            "test_accuracy":       round(xgb_acc, 4),
            "f1_weighted_test":    round(float(xgb_f1), 4),
            "f1_weighted_cv_mean": round(float(xgb_cv.mean()), 4),
            "f1_weighted_cv_std":  round(float(xgb_cv.std()), 4),
        },
    }


verification_metrics = train_variant("verification", VERIFICATION_FEATURE_COLS)
predictive_metrics   = train_variant("predictive",   PREDICTIVE_FEATURE_COLS)

# Chance-level reference for a 5-class stratified problem
class_freq = pd.Series(y_test).value_counts(normalize=True).sort_index()
chance_acc = float((class_freq ** 2).sum())  # accuracy of a proportional random guesser

# ─── Save metadata ────────────────────────────────────────────────────────────
feature_meta = {
    "feature_columns": VERIFICATION_FEATURE_COLS,   # kept for backward compat with ml_inference.py
    "verification_features": VERIFICATION_FEATURE_COLS,
    "predictive_features":   PREDICTIVE_FEATURE_COLS,
    "leaky_features":        LEAKY_FEATURES,
    "label_classes":         TRAIN_LABELS,
    "label_encoder_classes": le.classes_.tolist(),
    "anderson_five_class_labels": TRAIN_LABELS,
    "anderson_thresholds_ppm": [t for t, _ in FIVE_CLASS_THRESHOLDS],
    "anderson_reference": "Anderson JC. Obesity (2015) 23:2327-2334. doi:10.1002/oby.21242",
}
with open(MODEL_DIR / "feature_columns.json", "w") as f:
    json.dump(feature_meta, f, indent=2)
print(f"\nSaved: {MODEL_DIR / 'feature_columns.json'}")

metrics = {
    "dataset": {
        "source_file": DATASET.name,
        "dataset_rows": int(len(df)),
        "n_train": int(len(X_train_idx)),
        "n_test":  int(len(X_test_idx)),
        "label_system": "Anderson 2015 five-class",
        "labels": TRAIN_LABELS,
    },
    "chance_level_accuracy_stratified": round(chance_acc, 4),
    "leaky_features_removed_in_predictive": LEAKY_FEATURES,
    "verification": {
        "note": (
            "13 features including acetone_delta and derived indices. "
            "Anderson labels are a deterministic function of acetone_delta, "
            "so the classifier reproduces the labelling rule. Reported metrics "
            "measure pipeline rule-consistency under noise, NOT independent "
            "predictive validity. See report Section 4 Interpretation Note and Section 7.1 L9."
        ),
        **verification_metrics,
    },
    "predictive": {
        "note": (
            "9 engineering features only (acetone_delta, ketosis_index, metabolic_score, "
            "fat_burning_index removed). No feature in this set is a function of the label, "
            "so accuracy above chance would indicate genuine predictive signal in the "
            "sensor/environment features. Expected to be at or near chance for the synthetic "
            "demo dataset; kept as an honest baseline until pilot BOHB labels are collected."
        ),
        **predictive_metrics,
    },
}
with open(MODEL_DIR / "training_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2, ensure_ascii=False)
print(f"Saved: {MODEL_DIR / 'training_metrics.json'}")

print("\n" + "=" * 70)
print(" Summary — Verification vs. Predictive")
print("=" * 70)
print(f"  Chance-level accuracy (stratified): {chance_acc:.4f}")
print(f"  VERIFICATION  RF  acc={verification_metrics['rf']['test_accuracy']:.4f}  "
      f"F1={verification_metrics['rf']['f1_weighted_test']:.4f}")
print(f"  VERIFICATION  XGB acc={verification_metrics['xgb']['test_accuracy']:.4f}  "
      f"F1={verification_metrics['xgb']['f1_weighted_test']:.4f}")
print(f"  PREDICTIVE    RF  acc={predictive_metrics['rf']['test_accuracy']:.4f}  "
      f"F1={predictive_metrics['rf']['f1_weighted_test']:.4f}")
print(f"  PREDICTIVE    XGB acc={predictive_metrics['xgb']['test_accuracy']:.4f}  "
      f"F1={predictive_metrics['xgb']['f1_weighted_test']:.4f}")
print(f"\nAll files saved to: {MODEL_DIR}")
print("Done.")
