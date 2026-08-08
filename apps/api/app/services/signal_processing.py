"""
MetaBreath signal processing pipeline.

Implements sensor compensation, feature extraction, quality scoring,
and drift detection for TGS1820 VOC sensor readings.
"""
from __future__ import annotations

import math
import statistics
from typing import Optional


# TGS1820 temperature-sensitivity coefficients (from datasheet)
_TEMP_REF = 20.0       # °C reference temperature
_HUMIDITY_REF = 65.0   # %RH reference humidity
_PRESSURE_REF = 1013.25  # hPa reference pressure


# ── Urine ketone strip reference scale ──────────────────────────────────────
# Standard nitroprusside strips (e.g. Ketostix) read acetoacetate as a colour
# band. This is a FIXED clinical reference — not an average of any dataset.
# `rank` is the ordinal position (use for Spearman correlation);
# `mg_dl` / `mmol` are the conventional midpoint values per band.
# Note: urine measures acetoacetate; breath measures acetone. They correlate
# but with a time lag, so agreement is expected to be strong-but-imperfect.
URINE_KETONE_SCALE = [
    {"category": "negative", "rank": 0, "mg_dl": 0.0,  "mmol": 0.0},
    {"category": "trace",    "rank": 1, "mg_dl": 5.0,  "mmol": 0.5},
    {"category": "small",    "rank": 2, "mg_dl": 15.0, "mmol": 1.5},
    {"category": "moderate", "rank": 3, "mg_dl": 40.0, "mmol": 4.0},
    {"category": "large",    "rank": 4, "mg_dl": 80.0, "mmol": 8.0},
]
_URINE_BY_CATEGORY = {b["category"]: b for b in URINE_KETONE_SCALE}


def urine_category_to_mmol(category: str) -> Optional[float]:
    """Approximate blood-equivalent mmol/L midpoint for a urine strip band."""
    band = _URINE_BY_CATEGORY.get((category or "").strip().lower())
    return band["mmol"] if band else None


def urine_category_rank(category: str) -> Optional[int]:
    """Ordinal rank (0–4) of a urine strip band, for rank correlation."""
    band = _URINE_BY_CATEGORY.get((category or "").strip().lower())
    return band["rank"] if band else None


def urine_mg_dl_to_category(mg_dl: float) -> str:
    """Snap an exact mg/dL strip value to the nearest standard band."""
    best = min(URINE_KETONE_SCALE, key=lambda b: abs(b["mg_dl"] - mg_dl))
    return best["category"]


# Provisional breath-acetone → blood-ketone-equivalent conversion.
# Anchored to the SAME clinical band midpoints the classifier already uses:
#   firmware/classify thresholds  30 mV → "low/moderate" boundary (~1.5 mmol/L),
#                                  80 mV → "moderate/high" boundary (~4.0 mmol/L).
#   Both anchors satisfy mmol ≈ mV / 20, so this factor is self-consistent with
#   the rest of the pipeline rather than an invented number.
# This is UNCALIBRATED per device — the Bland-Altman bias against urine is exactly
# the offset that per-device calibration (Phase 5) should correct.
_BREATH_MV_PER_MMOL = 20.0


def breath_acetone_to_mmol_estimate(acetone_delta_mv: Optional[float]) -> Optional[float]:
    """Rough blood-ketone-equivalent (mmol/L) from breath acetone delta (mV)."""
    if acetone_delta_mv is None:
        return None
    return max(0.0, acetone_delta_mv / _BREATH_MV_PER_MMOL)


def baseline_subtract(raw_voc: float, baseline_voc: float, gain: float = 1.0, offset: float = 0.0) -> float:
    """Apply calibration baseline correction: corrected = (raw − baseline) * gain + offset."""
    return (raw_voc - baseline_voc) * gain + offset


def env_compensate(voc: float, temp_c: Optional[float], humidity_pct: Optional[float]) -> float:
    """
    Correct VOC reading for ambient temperature and humidity.

    TGS1820 sensitivity drops ~1.5% per °C above reference and
    ~0.8% per %RH above reference (manufacturer approximation).
    """
    if temp_c is not None:
        delta_t = temp_c - _TEMP_REF
        voc = voc / (1.0 + 0.015 * delta_t)

    if humidity_pct is not None:
        delta_h = humidity_pct - _HUMIDITY_REF
        voc = voc / (1.0 + 0.008 * delta_h)

    return max(voc, 0.0)


def pressure_normalize(voc: float, pressure_mean: Optional[float], breath_duration: Optional[float]) -> float:
    """
    Normalize VOC for breath pressure and duration.

    Higher pressure / longer breath = more analyte delivered → divide out.
    Returns normalised concentration estimate (ppm equivalent).
    """
    if pressure_mean and pressure_mean > 0:
        voc = voc * (_PRESSURE_REF / pressure_mean)

    # Duration normalisation: model assumes 3-s standard breath
    if breath_duration and breath_duration > 0:
        voc = voc * (3.0 / breath_duration)

    return max(voc, 0.0)


def compute_features(sequence: list[float]) -> dict:
    """
    Extract temporal signal features from a sensor response sequence.

    sequence: list of VOC readings during a single breath measurement (time-ordered).
    Returns slope, time_to_peak (index), recovery_rate.
    """
    if not sequence or len(sequence) < 2:
        return {"slope": None, "time_to_peak": None, "recovery_rate": None}

    peak_idx = sequence.index(max(sequence))
    n = len(sequence)

    # Slope: linear regression over full sequence (rise phase)
    xs = list(range(n))
    x_mean = statistics.mean(xs)
    y_mean = statistics.mean(sequence)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, sequence))
    denominator = sum((x - x_mean) ** 2 for x in xs)
    slope = numerator / denominator if denominator else 0.0

    # Recovery rate: (peak − final) / (n − peak_idx) sample-steps
    tail_len = n - peak_idx
    if tail_len > 1:
        recovery_rate = (sequence[peak_idx] - sequence[-1]) / tail_len
    else:
        recovery_rate = 0.0

    return {
        "slope": round(slope, 6),
        "time_to_peak": peak_idx,
        "recovery_rate": round(recovery_rate, 6),
    }


def quality_score(
    sensor_voltage: Optional[float] = None,
    baseline_voltage: Optional[float] = None,
    pressure_kpa: Optional[float] = None,
    temp_c: Optional[float] = None,
    humidity_pct: Optional[float] = None,
    # Legacy kwargs kept for backward compat
    ambient_voc: Optional[float] = None,
    breath_voc: Optional[float] = None,
    breath_duration: Optional[float] = None,
    pressure_mean: Optional[float] = None,
    pressure_std: Optional[float] = None,
) -> float:
    """
    Compute 0–100 quality score for a MetaBreath reading.

    Firmware `metabreath.ino` reports:
      - sensor_voltage (V, TGS1820 direct read)
      - baseline_voltage (V, calibrated in clean air at boot)
      - pressure_kpa (0–10 kPa, XGZP6847A breath differential pressure)
      - temperature (°C, SHT31)
      - humidity (%, SHT31)

    Deductions:
    - Sensor voltage < 0.05 V (disconnected): -60
    - Missing baseline (never calibrated): -20
    - Pressure < 0.2 kPa (no meaningful breath): -20
    - Extreme temperature (<10 °C or >40 °C): -10
    - Extreme humidity (<20 % or >95 %): -10
    """
    score = 100.0

    if sensor_voltage is not None and sensor_voltage < 0.05:
        score -= 60

    if baseline_voltage is None or baseline_voltage <= 0.0:
        score -= 20

    if pressure_kpa is None or pressure_kpa < 0.2:
        score -= 20

    if temp_c is not None and (temp_c < 10 or temp_c > 40):
        score -= 10

    if humidity_pct is not None and (humidity_pct < 20 or humidity_pct > 95):
        score -= 10

    return max(0.0, min(100.0, score))


def reliability_score(quality: float, drift_score: float, calibration_age_days: float) -> float:
    """
    Combine quality, sensor drift, and calibration age into 0–100 reliability.

    drift_score: 0 (new) → 1 (severe drift) from DeviceCalibration.drift_score
    calibration_age_days: days since last calibration (>30 days → penalty)
    """
    base = quality

    # Drift penalty: up to -30 points
    base -= drift_score * 30

    # Stale calibration penalty
    if calibration_age_days > 30:
        excess = min(calibration_age_days - 30, 60)
        base -= (excess / 60) * 20

    return max(0.0, min(100.0, base))


def environment_penalty(temp_c: Optional[float], humidity_pct: Optional[float]) -> float:
    """
    Return 0–50 penalty score reflecting how far environment is from ideal.

    Used for environment_penalty column in sensor_readings.
    """
    penalty = 0.0

    if temp_c is not None:
        delta = abs(temp_c - _TEMP_REF)
        penalty += min(delta * 1.0, 25)

    if humidity_pct is not None:
        delta = abs(humidity_pct - _HUMIDITY_REF)
        penalty += min(delta * 0.5, 25)

    return round(penalty, 2)


def classify_acetone(acetone_delta_mv: float, confidence: float = 1.0) -> dict:
    """
    Map TGS1820 voltage delta (in millivolts) to metabolic label + risk index.

    Boundaries match ESP32 firmware `classifyAcetone(delta_mV)`:
      < 5  mV   → clean       (0) — clean air / not exhaling
      < 30 mV   → low         (1) — no significant acetone
      < 80 mV   → moderate    (2) — mild ketosis / fat burning
      ≥ 80 mV   → high        (3) — strong ketosis
    Confidence < 0.6 or negative delta → "unreliable"
    """
    if confidence < 0.6:
        return {"label": "unreliable", "metabolic_risk_index": None}

    if acetone_delta_mv is None:
        return {"label": "unreliable", "metabolic_risk_index": None}
    elif acetone_delta_mv < 0.0:
        # Sensor voltage below baseline is physically impossible; treat
        # as a fault rather than clean air so callers can gate/retry.
        return {"label": "unreliable", "metabolic_risk_index": None}
    elif acetone_delta_mv < 5.0:
        return {"label": "clean", "metabolic_risk_index": 0}
    elif acetone_delta_mv < 30.0:
        return {"label": "low", "metabolic_risk_index": 1}
    elif acetone_delta_mv < 80.0:
        return {"label": "moderate", "metabolic_risk_index": 2}
    else:
        return {"label": "high", "metabolic_risk_index": 3}


def detect_drift(calibration_history: list[dict]) -> dict:
    """
    Analyse calibration history to detect sensor drift.

    calibration_history: list of dicts with keys baseline_voc, calibrated_at (datetime).
    Returns drift_slope (ppm/day), drift_score (0–1), and whether recalibration is needed.
    """
    if len(calibration_history) < 2:
        return {"drift_slope_ppm_per_day": 0.0, "drift_score": 0.0, "needs_recalibration": False}

    # Sort by time
    sorted_cal = sorted(calibration_history, key=lambda c: c["calibrated_at"])
    first = sorted_cal[0]
    last = sorted_cal[-1]

    baseline_delta = last["baseline_voc"] - first["baseline_voc"]
    time_delta_days = (last["calibrated_at"] - first["calibrated_at"]).total_seconds() / 86400

    if time_delta_days <= 0:
        return {"drift_slope_ppm_per_day": 0.0, "drift_score": 0.0, "needs_recalibration": False}

    slope = baseline_delta / time_delta_days  # ppm/day

    # Normalise: >0.5 ppm/day drift is considered severe (score → 1.0)
    drift_score = min(abs(slope) / 0.5, 1.0)

    return {
        "drift_slope_ppm_per_day": round(slope, 4),
        "drift_score": round(drift_score, 4),
        "needs_recalibration": drift_score > 0.6,
    }
