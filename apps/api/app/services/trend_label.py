"""
Phase 3B — Trend label rule for LSTM Trend Classifier.

Design (see plan.md §5.4): the label of a sequence must be a function of the
whole sequence (slope + variance/jumps) — NOT a threshold on a single point —
so that no single feature in x_t is a deterministic function of the label.
This is what breaks the label-feature circularity that RF/XGB in the verification
variant has (see plan.md §4.3-4.4, report §7.1 L9).

Returned labels:
    "stable"       — no significant slope, no anomaly
    "increasing"   — statistically distinguishable positive slope
    "decreasing"   — statistically distinguishable negative slope
    "abnormal"     — one or more session-to-session jumps far above the median

Thresholds are exposed on the module (TREND_LABEL_CONFIG) so downstream tests
and A/B experiments can tune them without editing this file.

Callers:
    - apps/api/notebooks/generate_longitudinal_data.py  (offline label backfill)
    - apps/api/app/services/ml_inference.predict_trend  (runtime — LSTM fallback)
    - apps/api/tests/test_trend_label_rule.py           (unit tests)
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Sequence


MIN_SEQUENCE_LENGTH = 7   # matches plan.md §4.7 fallback threshold


@dataclass(frozen=True)
class TrendLabelConfig:
    slope_threshold_ppm_per_session: float = 0.30
    p_value_significance: float = 0.10
    abnormal_absolute_jump_ppm: float = 4.0
    abnormal_relative_jump_ratio: float = 3.0
    # Floor for the relative-jump denominator. Prevents zero-noise sequences
    # (median_jump = 0) from evading the abnormal check, which would let a
    # single large spike bleed into the OLS slope and get mis-labelled.
    abnormal_relative_jump_floor: float = 0.30


TREND_LABEL_CONFIG = TrendLabelConfig()


def _ols_slope(y: Sequence[float]) -> tuple[float, float]:
    """Return (slope, two-sided p-value) via ordinary least squares.

    We avoid scipy so this stays importable from lightweight environments
    (e.g. the FastAPI container). p-value is a two-sided t-test on H0: slope=0.
    """
    import math

    n = len(y)
    if n < 3:
        return 0.0, 1.0

    x = list(range(n))
    mean_x = sum(x) / n
    mean_y = sum(y) / n

    num = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
    den_x = sum((xi - mean_x) ** 2 for xi in x)
    if den_x == 0:
        return 0.0, 1.0
    slope = num / den_x

    # Residual sum of squares
    intercept = mean_y - slope * mean_x
    resid = [yi - (intercept + slope * xi) for xi, yi in zip(x, y)]
    rss = sum(r * r for r in resid)
    if n <= 2 or rss <= 0:
        return slope, 0.0 if abs(slope) > 1e-9 else 1.0

    sigma2 = rss / (n - 2)
    se_slope = math.sqrt(sigma2 / den_x) if den_x > 0 else float("inf")
    if se_slope == 0:
        return slope, 0.0 if abs(slope) > 1e-9 else 1.0

    t = slope / se_slope
    # Two-sided p-value from t distribution df=n-2 via Student-t survival.
    # Wilson-Hilferty approx is fine for the small df we deal with (n≥7 → df≥5).
    df = n - 2
    # Abramowitz & Stegun 26.7.8 — approximate normal deviate for t
    z = t * math.sqrt(1 - (1 / (4 * df)))
    z = z / math.sqrt(1 + (t * t) / (2 * df))
    # Two-sided p from normal
    p = math.erfc(abs(z) / math.sqrt(2))
    return slope, p


def compute_trend_label(
    sequence: Sequence[float],
    config: TrendLabelConfig | None = None,
) -> str:
    """Classify a sequence of session-level ΔVOC into a trend label.

    Returns one of: "stable" | "increasing" | "decreasing" | "abnormal"
    Raises ValueError if the sequence is shorter than MIN_SEQUENCE_LENGTH.
    """
    if len(sequence) < MIN_SEQUENCE_LENGTH:
        raise ValueError(
            f"trend classification requires at least {MIN_SEQUENCE_LENGTH} "
            f"sessions, got {len(sequence)}"
        )
    cfg = config or TREND_LABEL_CONFIG
    y = [float(v) for v in sequence]

    # ── Abnormal check first: a single spike dominates any linear trend ──
    diffs = [abs(y[i + 1] - y[i]) for i in range(len(y) - 1)]
    max_jump = max(diffs)
    med_jump = median(diffs) if diffs else 0.0
    denom = max(med_jump, cfg.abnormal_relative_jump_floor)
    absolute_trip = max_jump > cfg.abnormal_absolute_jump_ppm
    relative_trip = max_jump > cfg.abnormal_relative_jump_ratio * denom
    if absolute_trip and relative_trip:
        return "abnormal"

    # ── Linear slope check ──
    slope, p = _ols_slope(y)
    if p < cfg.p_value_significance:
        if slope > cfg.slope_threshold_ppm_per_session:
            return "increasing"
        if slope < -cfg.slope_threshold_ppm_per_session:
            return "decreasing"

    return "stable"


__all__ = [
    "MIN_SEQUENCE_LENGTH",
    "TREND_LABEL_CONFIG",
    "TrendLabelConfig",
    "compute_trend_label",
]
