"""
MetaBreath AI inference service.

Models:
- RF/XGB classifier (13-feature snapshot → risk label)
- LSTM temporal (5-reading sequence → risk label)
- Drift detector (sensor calibration history → drift alert)

Feature order and label mapping are read from feature_columns.json at startup
so inference always matches training exactly.

Labels follow the Anderson (2015) five-pattern classification:
  basal            0.5–2 ppm   standard diet, basal ketosis
  light_ketosis    2–4 ppm     mild caloric restriction
  nutritional_ketosis  4–30 ppm    HFLC/keto diet, BOHB 0.5–3 mM
  deep_ketosis     30–75 ppm   fasting / extended restriction
  dka_risk         ≥ 75 ppm    diabetic ketoacidosis range
Source: Anderson JC. Obesity (2015) 23:2327-2334. doi:10.1002/oby.21242
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Optional

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")

_rf_model = None
_xgb_model = None
_lstm_model = None
_drift_model = None
_lstm_scaler_mean = None
_lstm_scaler_scale = None
_feature_columns: list[str] = []
_label_classes: list[str] = []   # ordered by integer class index (from LabelEncoder)

# Legacy per-reading LSTM (deprecated in Phase 3 — kept for backward compat)
LSTM_FEATURES = [
    "acetone_delta", "quality_score", "reliability_score",
    "ketosis_index", "metabolic_score", "pressure_mean",
    "temperature", "humidity",
]
LSTM_LABELS = ["low", "moderate", "high"]  # 3-class per-reading LSTM output; refined post-hoc to 5-class

# Phase 3 — LSTM Trend Classifier over session sequences
_lstm_trend_model = None
_lstm_trend_scaler_mean = None
_lstm_trend_scaler_scale = None

TREND_LSTM_FEATURES = [
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
TREND_MIN_SEQUENCE_LENGTH = 7

# Anderson 2015 five-pattern classification thresholds (ppm)
FIVE_CLASS_THRESHOLDS = [
    (2.0,  "basal"),               # 0.5–2 ppm
    (4.0,  "light_ketosis"),       # 2–4 ppm
    (30.0, "nutritional_ketosis"), # 4–30 ppm
    (75.0, "deep_ketosis"),        # 30–75 ppm
]
# ≥ 75 ppm → "dka_risk"

FIVE_CLASS_MRI = {
    "basal": 0,
    "light_ketosis": 1,
    "nutritional_ketosis": 2,
    "deep_ketosis": 3,
    "dka_risk": 4,
    "unreliable": None,
}


def _anderson_label(acetone_ppm: Optional[float]) -> str:
    """Anderson 2015 five-pattern label from breath acetone concentration (ppm)."""
    if acetone_ppm is None or acetone_ppm < 0:
        return "unreliable"
    for threshold, label in FIVE_CLASS_THRESHOLDS:
        if acetone_ppm < threshold:
            return label
    return "dka_risk"


def _load_models():
    global _rf_model, _xgb_model, _lstm_model, _drift_model
    global _feature_columns, _label_classes
    global _lstm_scaler_mean, _lstm_scaler_scale
    if _feature_columns:
        return
    try:
        import joblib

        meta_path = os.path.join(_MODEL_DIR, "feature_columns.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                meta = json.load(f)
            _feature_columns = meta["feature_columns"]
            _label_classes = meta.get("label_encoder_classes",
                                     meta.get("label_classes", ["low", "moderate", "high"]))

        rf_path  = os.path.join(_MODEL_DIR, "rf_classifier.joblib")
        xgb_path = os.path.join(_MODEL_DIR, "xgb_classifier.joblib")
        if os.path.exists(rf_path):  _rf_model  = joblib.load(rf_path)
        if os.path.exists(xgb_path): _xgb_model = joblib.load(xgb_path)

        # Drift detector (XGBoost)
        drift_path = os.path.join(_MODEL_DIR, "drift_model.joblib")
        if os.path.exists(drift_path):
            _drift_model = joblib.load(drift_path)

        # LSTM scaler (legacy 3-class metabolic)
        processed_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..",
                                     "data", "processed")
        mean_path  = os.path.join(processed_dir, "scaler_lstm_mean.npy")
        scale_path = os.path.join(processed_dir, "scaler_lstm_scale.npy")
        if os.path.exists(mean_path):
            import numpy as np
            _lstm_scaler_mean  = np.load(mean_path)
            _lstm_scaler_scale = np.load(scale_path)

        # Phase 3 — Trend LSTM scaler
        global _lstm_trend_scaler_mean, _lstm_trend_scaler_scale
        trend_mean_path  = os.path.join(processed_dir, "scaler_lstm_trend_mean.npy")
        trend_scale_path = os.path.join(processed_dir, "scaler_lstm_trend_scale.npy")
        if os.path.exists(trend_mean_path):
            import numpy as np
            _lstm_trend_scaler_mean  = np.load(trend_mean_path)
            _lstm_trend_scaler_scale = np.load(trend_scale_path)
    except Exception:
        pass


def _load_lstm():
    """Lazy-load PyTorch LSTM (only when needed — avoids torch import at startup)."""
    global _lstm_model
    if _lstm_model is not None:
        return _lstm_model
    try:
        import torch
        import torch.nn as nn

        class LSTMClassifier(nn.Module):
            def __init__(self, input_size=8, hidden=64, hidden2=32, n_classes=3, dropout=0.3):
                super().__init__()
                self.lstm1 = nn.LSTM(input_size, hidden, batch_first=True)
                self.drop1 = nn.Dropout(dropout)
                self.lstm2 = nn.LSTM(hidden, hidden2, batch_first=True)
                self.drop2 = nn.Dropout(dropout)
                self.fc1   = nn.Linear(hidden2, 16)
                self.relu  = nn.ReLU()
                self.fc2   = nn.Linear(16, n_classes)
            def forward(self, x):
                out, _ = self.lstm1(x)
                out = self.drop1(out)
                out, _ = self.lstm2(out)
                out = self.drop2(out[:, -1, :])
                out = self.relu(self.fc1(out))
                return self.fc2(out)

        model_path = os.path.join(_MODEL_DIR, "lstm_model.pt")
        if not os.path.exists(model_path):
            return None
        model = LSTMClassifier()
        model.load_state_dict(torch.load(model_path, map_location="cpu"))
        model.eval()
        _lstm_model = model
        return model
    except Exception:
        return None


def _load_lstm_trend():
    """Lazy-load PyTorch LSTM Trend Classifier (Phase 3)."""
    global _lstm_trend_model
    if _lstm_trend_model is not None:
        return _lstm_trend_model
    try:
        import torch
        import torch.nn as nn

        class LSTMTrendClassifier(nn.Module):
            def __init__(self, n_features=8, hidden1=64, hidden2=32,
                         n_classes=4, fc_hidden=16, dropout=0.30):
                super().__init__()
                self.lstm1 = nn.LSTM(n_features, hidden1, batch_first=True)
                self.drop1 = nn.Dropout(dropout)
                self.lstm2 = nn.LSTM(hidden1, hidden2, batch_first=True)
                self.drop2 = nn.Dropout(dropout)
                self.fc1 = nn.Linear(hidden2, fc_hidden)
                self.fc2 = nn.Linear(fc_hidden, n_classes)

            def forward(self, x):
                h, _ = self.lstm1(x)
                h = self.drop1(h)
                h, _ = self.lstm2(h)
                h = self.drop2(h[:, -1, :])
                return self.fc2(torch.relu(self.fc1(h)))

        model_path = os.path.join(_MODEL_DIR, "lstm_trend.pt")
        if not os.path.exists(model_path):
            return None
        model = LSTMTrendClassifier(n_features=len(TREND_LSTM_FEATURES),
                                    n_classes=len(TREND_LABELS))
        model.load_state_dict(torch.load(model_path, map_location="cpu"))
        model.eval()
        _lstm_trend_model = model
        return model
    except Exception:
        return None


def _build_feature_vector(features: dict) -> list[float]:
    """
    Build a feature vector in the exact order the models expect.

    Accepts keys using inference naming (temp_c, humidity_pct) and maps
    them to training naming (temperature, humidity). Missing derived
    features (ketosis_index, metabolic_score, fat_burning_index) default
    to 0 — acetone_delta alone is sufficient for correct classification.
    """
    alias = {
        "temp_c": "temperature",
        "humidity_pct": "humidity",
    }
    lookup = {}
    for k, v in features.items():
        lookup[alias.get(k, k)] = v if v is not None else 0.0

    return [float(lookup.get(col, 0.0)) for col in _feature_columns]


_RULE_CONF = {
    "basal": 0.78, "light_ketosis": 0.80, "nutritional_ketosis": 0.82,
    "deep_ketosis": 0.84, "dka_risk": 0.86,
}


def _rule_based_risk(acetone_delta: Optional[float]) -> dict:
    """Anderson 2015 five-pattern rule-based fallback (doi:10.1002/oby.21242)."""
    if acetone_delta is None or acetone_delta < 0:
        return {"label": "unreliable", "metabolic_risk_index": None, "confidence_score": 0.0}
    label = _anderson_label(acetone_delta)
    return {
        "label": label,
        "metabolic_risk_index": FIVE_CLASS_MRI[label],
        "confidence_score": _RULE_CONF.get(label, 0.75),
    }


def predict_risk(features: dict) -> dict:
    """
    Predict metabolic risk label from sensor features.

    Priority: XGBoost → RandomForest → rule-based fallback.
    Returns: label, metabolic_risk_index, confidence_score, model_used.
    """
    _load_models()

    reliability = features.get("reliability_score", 100) or 100
    if reliability < 40:
        return {
            "label": "unreliable",
            "metabolic_risk_index": None,
            "confidence_score": round(reliability / 100, 4),
            "model_used": "reliability_gate",
            "recalibration_needed": True,
        }

    feat_vec = _build_feature_vector(features)

    for model, model_name in [(_xgb_model, "xgboost"), (_rf_model, "random_forest")]:
        if model is None:
            continue
        try:
            import numpy as np
            arr = np.array([feat_vec])
            proba = model.predict_proba(arr)[0]
            pred_idx = int(proba.argmax())
            confidence = float(proba.max())

            if confidence < 0.6:
                label = "unreliable"
            else:
                # Anderson threshold is always authoritative — acetone_delta is the primary signal.
                # ML model provides confidence; Anderson provides deterministic 5-class label.
                acetone = features.get("acetone_delta")
                if acetone is not None:
                    label = _anderson_label(float(acetone))
                elif _label_classes and pred_idx < len(_label_classes):
                    label = _label_classes[pred_idx]
                else:
                    label = "unreliable"

            return {
                "label": label,
                "metabolic_risk_index": FIVE_CLASS_MRI.get(label),
                "confidence_score": round(confidence, 4),
                "model_used": model_name,
                "recalibration_needed": confidence < 0.6,
            }
        except Exception:
            continue

    result = _rule_based_risk(features.get("acetone_delta"))
    result["model_used"] = "rule_based"
    result["recalibration_needed"] = result["confidence_score"] < 0.6
    return result


def predict_trend(readings: list[dict], horizon_days: int = 7) -> dict:
    """
    Linear regression trend on acetone_delta over time.
    Minimum 3 readings required.
    """
    if len(readings) < 3:
        return {
            "trend_direction": "insufficient_data",
            "slope_ppm_per_day": None,
            "predicted_points": [],
            "confidence": 0.0,
        }

    times = [
        r["time"] if isinstance(r["time"], datetime) else datetime.fromisoformat(str(r["time"]))
        for r in readings
    ]
    values = [float(r.get("acetone_delta") or 0.0) for r in readings]

    t0 = times[0]
    xs = [(t - t0).total_seconds() / 86400 for t in times]

    import statistics as _stats
    x_mean = _stats.mean(xs)
    y_mean = _stats.mean(values)

    num = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, values))
    den = sum((x - x_mean) ** 2 for x in xs)
    slope = num / den if den else 0.0
    intercept = y_mean - slope * x_mean

    last_x = xs[-1]
    last_time = times[-1]

    predicted_points = [
        {
            "time": (last_time + timedelta(days=d)).isoformat(),
            "predicted_acetone": round(max(0.0, intercept + slope * (last_x + d)), 4),
        }
        for d in range(1, horizon_days + 1)
    ]

    ss_res = sum((v - (intercept + slope * x)) ** 2 for x, v in zip(xs, values))
    ss_tot = sum((v - y_mean) ** 2 for v in values)
    r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    confidence = max(0.0, min(1.0, r2))

    if slope > 0.05:
        direction = "increasing"
    elif slope < -0.05:
        direction = "decreasing"
    else:
        direction = "stable"

    return {
        "trend_direction": direction,
        "slope_ppm_per_day": round(slope, 4),
        "predicted_points": predicted_points,
        "confidence": round(confidence, 4),
    }


# ─── LSTM temporal prediction ──────────────────────────────────────────────

def predict_risk_lstm(sequence: list[dict]) -> dict:
    """
    Predict metabolic risk from a sequence of 5 recent readings.

    Each reading dict should contain LSTM_FEATURES. Missing values default to
    the training-set mean (via scaler), so partial readings still work.

    Returns: label, metabolic_risk_index, confidence_score, model_used.
    Falls back to XGBoost/RF single-point prediction if fewer than 5 readings.
    """
    _load_models()

    if len(sequence) < 5:
        latest = sequence[-1] if sequence else {}
        result = predict_risk(latest)
        result["model_used"] = f"{result.get('model_used', 'rule_based')}_fallback"
        result["reason"] = "insufficient_sequence_length"
        return result

    model = _load_lstm()
    if model is None:
        latest = sequence[-1]
        result = predict_risk(latest)
        result["model_used"] = f"{result.get('model_used', 'rule_based')}_fallback"
        result["reason"] = "lstm_unavailable"
        return result

    try:
        import numpy as np
        import torch

        # Take last 5 readings, extract LSTM features in the right order
        seq = sequence[-5:]
        X = np.array([[r.get(f, 0.0) or 0.0 for f in LSTM_FEATURES] for r in seq],
                     dtype=np.float32)

        # Apply the same StandardScaler used during training
        if _lstm_scaler_mean is not None and _lstm_scaler_scale is not None:
            X = (X - _lstm_scaler_mean) / _lstm_scaler_scale

        X_t = torch.FloatTensor(X).unsqueeze(0)  # (1, 5, 8)
        with torch.no_grad():
            logits = model(X_t)
            probs = torch.softmax(logits, dim=1).numpy()[0]
        pred_idx = int(probs.argmax())
        confidence = float(probs.max())

        if confidence < 0.6:
            label = "unreliable"
        else:
            # Refine LSTM's 3-class output to Anderson 2015 five-class using last reading
            last_acetone = sequence[-1].get("acetone_delta")
            label = _anderson_label(float(last_acetone)) if last_acetone is not None \
                else (LSTM_LABELS[pred_idx] if pred_idx < len(LSTM_LABELS) else "unreliable")

        return {
            "label": label,
            "metabolic_risk_index": FIVE_CLASS_MRI.get(label),
            "confidence_score": round(confidence, 4),
            "model_used": "lstm",
            "recalibration_needed": confidence < 0.6,
            "sequence_length": len(seq),
        }
    except Exception as e:
        latest = sequence[-1]
        result = predict_risk(latest)
        result["model_used"] = f"{result.get('model_used', 'rule_based')}_fallback"
        result["reason"] = f"lstm_error: {type(e).__name__}"
        return result


# ─── LSTM Trend Classification (Phase 3) ───────────────────────────────────

def classify_trend(session_sequence: list[dict]) -> dict:
    """
    Classify a user's ΔVOC trend over a sequence of sessions.

    Input:
        session_sequence: list of dicts, each containing TREND_LSTM_FEATURES
                          (typically one entry per session, most recent last).
                          Minimum length = TREND_MIN_SEQUENCE_LENGTH (7).

    Output:
        {
          "trend": "stable" | "increasing" | "decreasing" | "abnormal" | None,
          "confidence": float,
          "probabilities": {label: float, ...},
          "sequence_length": int,
          "min_required": int,
          "model_used": "lstm_trend" | "insufficient_data" | "trend_rule_fallback",
          "fallback_reason": str | None,
        }

    Unlike predict_risk_lstm, this does NOT return an Anderson 5-class label.
    Trend is a distinct classification about the direction of change over time.
    """
    _load_models()

    n = len(session_sequence)
    if n < TREND_MIN_SEQUENCE_LENGTH:
        return {
            "trend": None,
            "confidence": 0.0,
            "probabilities": {lbl: 0.0 for lbl in TREND_LABELS},
            "sequence_length": n,
            "min_required": TREND_MIN_SEQUENCE_LENGTH,
            "model_used": "insufficient_data",
            "fallback_reason": f"sequence has {n} sessions; need ≥{TREND_MIN_SEQUENCE_LENGTH}",
        }

    model = _load_lstm_trend()
    if model is None or _lstm_trend_scaler_mean is None:
        # Fall back to the deterministic rule so callers always get an answer
        return _classify_trend_rule_fallback(session_sequence, reason="model_unavailable")

    try:
        import numpy as np
        import torch

        # Missing / None values → substitute the training-set mean (post-scaling: 0)
        # so the LSTM sees an in-distribution input rather than a spurious zero.
        rows = []
        for r in session_sequence:
            row = []
            for i, f in enumerate(TREND_LSTM_FEATURES):
                v = r.get(f)
                row.append(float(v) if v is not None else float(_lstm_trend_scaler_mean[i]))
            rows.append(row)
        X = np.array(rows, dtype=np.float32)
        X = (X - _lstm_trend_scaler_mean) / _lstm_trend_scaler_scale

        X_t = torch.FloatTensor(X).unsqueeze(0)  # (1, L, 8)
        with torch.no_grad():
            logits = model(X_t)
            probs = torch.softmax(logits, dim=1).numpy()[0]

        pred_idx = int(probs.argmax())
        confidence = float(probs.max())

        return {
            "trend": TREND_LABELS[pred_idx],
            "confidence": round(confidence, 4),
            "probabilities": {lbl: round(float(p), 4) for lbl, p in zip(TREND_LABELS, probs)},
            "sequence_length": n,
            "min_required": TREND_MIN_SEQUENCE_LENGTH,
            "model_used": "lstm_trend",
            "fallback_reason": None,
        }
    except Exception as e:
        return _classify_trend_rule_fallback(
            session_sequence, reason=f"lstm_error:{type(e).__name__}"
        )


def _classify_trend_rule_fallback(session_sequence: list[dict], reason: str) -> dict:
    """Deterministic slope-based fallback using the same rule that generated labels."""
    try:
        from app.services.trend_label import compute_trend_label
        ppm = [float(r.get("acetone_delta") or 0.0) for r in session_sequence]
        label = compute_trend_label(ppm)
        # Rule fallback provides only the predicted class — no per-class probabilities,
        # so we return a moderate confidence and one-hot probability.
        probs = {lbl: (0.70 if lbl == label else 0.10) for lbl in TREND_LABELS}
        return {
            "trend": label,
            "confidence": 0.70,
            "probabilities": probs,
            "sequence_length": len(session_sequence),
            "min_required": TREND_MIN_SEQUENCE_LENGTH,
            "model_used": "trend_rule_fallback",
            "fallback_reason": reason,
        }
    except Exception as e:
        return {
            "trend": None,
            "confidence": 0.0,
            "probabilities": {lbl: 0.0 for lbl in TREND_LABELS},
            "sequence_length": len(session_sequence),
            "min_required": TREND_MIN_SEQUENCE_LENGTH,
            "model_used": "error",
            "fallback_reason": f"{reason};rule_fallback_also_failed:{type(e).__name__}",
        }


# ─── Drift Detection ──────────────────────────────────────────────────────

def check_drift(calibration_history: list[dict]) -> dict:
    """
    Detect sensor drift from calibration history.

    calibration_history: list of dicts with keys `ambient_voc` and `time`
    (most recent last). Compares recent readings against baseline.

    Returns: drift_detected, severity, confidence, recommendation, drift_pct.
    """
    if len(calibration_history) < 2:
        return {
            "drift_detected": False,
            "severity": "insufficient_data",
            "confidence": 0.0,
            "recommendation": "collect_more_calibrations",
            "drift_pct": None,
        }

    # Simple heuristic: compare latest ambient_voc against 3-reading baseline
    baseline_readings = [
        c.get("ambient_voc") for c in calibration_history[:3]
        if c.get("ambient_voc") is not None
    ]
    latest = calibration_history[-1].get("ambient_voc")

    if not baseline_readings or latest is None:
        return {
            "drift_detected": False,
            "severity": "insufficient_data",
            "confidence": 0.0,
            "recommendation": "collect_more_calibrations",
            "drift_pct": None,
        }

    baseline = sum(baseline_readings) / len(baseline_readings)
    if baseline == 0:
        drift_pct = 0.0
    else:
        drift_pct = abs(latest - baseline) / baseline * 100.0

    # Thresholds: <10% ok, 10-25% mild, >25% severe
    if drift_pct < 10:
        severity, recommendation, drift_detected = "none", "ok", False
    elif drift_pct < 25:
        severity, recommendation, drift_detected = "mild", "recalibrate_soon", True
    else:
        severity, recommendation, drift_detected = "severe", "recalibrate_now", True

    # Confidence scales with number of baseline readings
    confidence = min(1.0, len(baseline_readings) / 5.0)

    return {
        "drift_detected": drift_detected,
        "severity": severity,
        "confidence": round(confidence, 4),
        "recommendation": recommendation,
        "drift_pct": round(drift_pct, 2),
        "baseline_voc": round(baseline, 4),
        "latest_voc": round(latest, 4),
    }
