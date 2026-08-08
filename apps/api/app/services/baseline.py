"""
MetaBreath personal (physiological) baseline.

This is DIFFERENT from `DeviceCalibration` in app/models/health.py, which is
a per-DEVICE hardware calibration baseline (clean-air sensor voltage used to
zero the gas sensor). This module computes a per-USER "what's normal for
*this person*" range from their own acetone_delta reading history, so the
frontend/chat/report can say things like "higher than your usual" instead of
only comparing against the fixed Anderson (2015) population thresholds.

Method (documented here since there's no single agreed-upon standard for
this): a **trimmed mean over the trailing N days** (default 30) of the
user's own acetone_delta readings.
  - Window: 30 days. Long enough to smooth out day-to-day noise (diet,
    hydration, measurement timing) while still reflecting a fairly current
    metabolic baseline rather than a stale one from months ago.
  - Trim: drop the top/bottom 10% of values before averaging. Breath-ketone
    readings taken during an active fast, post-exercise, or right after a
    high-carb meal are legitimate but not "baseline" — trimming reduces
    their influence without requiring us to know the measurement context.
  - Range: the trimmed [10th, 90th] percentile band of the same window,
    given back alongside the mean so callers can render a band, not just a
    point estimate.

Computed on-the-fly from `sensor_readings` (no new table/migration) — cheap
enough at typical per-user read volumes (a few hundred rows/month) to not
need caching yet.
"""
from __future__ import annotations

import statistics as _stats
from typing import Optional, TypedDict

# Minimum number of readings before we're willing to call something a
# "baseline" at all — below this, the range is too noisy to be meaningful
# (e.g. a brand new judge-demo account with 1-2 test blows).
MIN_SAMPLES_FOR_BASELINE = 5

BASELINE_WINDOW_DAYS = 30
TRIM_FRACTION = 0.10  # drop 10% from each tail

MV_PER_PPM = 10.0  # matches app.services.chat_tools.MV_PER_PPM


class BaselineResult(TypedDict):
    insufficient_data: bool
    sample_count: int
    computed_from_days: int
    baseline_mean_mv: Optional[float]
    baseline_range_mv: Optional[list]   # [low, high]
    baseline_mean_ppm: Optional[float]
    baseline_range_ppm: Optional[list]  # [low, high]
    method: str


def _trimmed(values: list[float], trim_fraction: float = TRIM_FRACTION) -> list[float]:
    """Sort and drop `trim_fraction` from each tail. Falls back to the full
    (sorted) list if trimming would remove everything."""
    values = sorted(values)
    n = len(values)
    k = int(n * trim_fraction)
    trimmed = values[k: n - k] if n - 2 * k > 0 else values
    return trimmed


def compute_personal_baseline(
    acetone_delta_values: list[float],
    window_days: int = BASELINE_WINDOW_DAYS,
) -> BaselineResult:
    """
    Compute a personal baseline from a list of acetone_delta readings (mV,
    as stored on SensorReading) already filtered to the caller's desired
    window (e.g. last `window_days`).

    Returns an `insufficient_data: True` shape (all values None) when there
    aren't enough samples yet — this matters for a judge demoing with a
    fresh account, which should show a clear "not enough data" state rather
    than a misleading number from 1-2 readings.
    """
    values = [v for v in acetone_delta_values if v is not None]
    sample_count = len(values)

    if sample_count < MIN_SAMPLES_FOR_BASELINE:
        return BaselineResult(
            insufficient_data=True,
            sample_count=sample_count,
            computed_from_days=window_days,
            baseline_mean_mv=None,
            baseline_range_mv=None,
            baseline_mean_ppm=None,
            baseline_range_ppm=None,
            method=f"trimmed_mean_{int(TRIM_FRACTION * 100)}pct_{window_days}d",
        )

    trimmed = _trimmed(values)
    mean_mv = _stats.mean(trimmed)
    low_mv = trimmed[0]
    high_mv = trimmed[-1]

    return BaselineResult(
        insufficient_data=False,
        sample_count=sample_count,
        computed_from_days=window_days,
        baseline_mean_mv=round(mean_mv, 4),
        baseline_range_mv=[round(low_mv, 4), round(high_mv, 4)],
        baseline_mean_ppm=round(mean_mv / MV_PER_PPM, 4),
        baseline_range_ppm=[round(low_mv / MV_PER_PPM, 4), round(high_mv / MV_PER_PPM, 4)],
        method=f"trimmed_mean_{int(TRIM_FRACTION * 100)}pct_{window_days}d",
    )


def compare_to_baseline(value_mv: float, baseline: BaselineResult) -> Optional[dict]:
    """Compare a single reading (mV) against a computed baseline.

    Returns None if the baseline is insufficient_data. Otherwise a small
    dict with pct_change and a coarse `direction` label, meant for natural-
    language interpretation (Task 3) rather than raw chart data.
    """
    if baseline["insufficient_data"] or baseline["baseline_mean_mv"] in (None, 0):
        return None
    mean_mv = baseline["baseline_mean_mv"]
    pct_change = round((value_mv - mean_mv) / mean_mv * 100, 1) if mean_mv else None
    low, high = baseline["baseline_range_mv"]
    if value_mv < low:
        direction = "below_baseline_range"
    elif value_mv > high:
        direction = "above_baseline_range"
    else:
        direction = "within_baseline_range"
    return {
        "pct_change_vs_baseline": pct_change,
        "direction": direction,
    }
