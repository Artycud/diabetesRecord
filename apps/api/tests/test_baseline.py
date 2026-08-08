"""Unit tests for the personal (physiological) baseline service.

app/services/baseline.py — trimmed-mean baseline over a user's own
acetone_delta history. Distinct from DeviceCalibration (hardware baseline).
"""
from __future__ import annotations

from app.services import baseline


def test_insufficient_data_below_minimum_samples():
    values = [10.0, 12.0, 11.0]  # fewer than MIN_SAMPLES_FOR_BASELINE (5)
    result = baseline.compute_personal_baseline(values)
    assert result["insufficient_data"] is True
    assert result["sample_count"] == 3
    assert result["baseline_mean_mv"] is None
    assert result["baseline_range_mv"] is None


def test_insufficient_data_empty_list():
    result = baseline.compute_personal_baseline([])
    assert result["insufficient_data"] is True
    assert result["sample_count"] == 0


def test_sufficient_data_computes_trimmed_mean():
    # 10 values; trimming 10% off each tail drops the min and max.
    values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 100]
    result = baseline.compute_personal_baseline(values)
    assert result["insufficient_data"] is False
    assert result["sample_count"] == 10
    # Outlier (100) should not blow up the mean since it's in the trimmed tail.
    assert result["baseline_mean_mv"] < 20
    assert result["baseline_range_mv"][0] <= result["baseline_mean_mv"] <= result["baseline_range_mv"][1]


def test_ppm_conversion_matches_mv_over_ten():
    values = [100.0, 110.0, 120.0, 130.0, 140.0, 150.0]
    result = baseline.compute_personal_baseline(values)
    assert result["baseline_mean_ppm"] == round(result["baseline_mean_mv"] / 10.0, 4)


def test_none_values_are_filtered_out():
    values = [10.0, None, 12.0, None, 11.0, 13.0, 14.0]
    result = baseline.compute_personal_baseline(values)
    assert result["sample_count"] == 5


def test_compare_to_baseline_within_range():
    values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
    b = baseline.compute_personal_baseline(values)
    cmp = baseline.compare_to_baseline(14.5, b)
    assert cmp is not None
    assert cmp["direction"] == "within_baseline_range"


def test_compare_to_baseline_above_range():
    values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
    b = baseline.compute_personal_baseline(values)
    cmp = baseline.compare_to_baseline(1000.0, b)
    assert cmp is not None
    assert cmp["direction"] == "above_baseline_range"
    assert cmp["pct_change_vs_baseline"] > 0


def test_compare_to_baseline_returns_none_when_insufficient_data():
    b = baseline.compute_personal_baseline([1.0, 2.0])
    assert baseline.compare_to_baseline(5.0, b) is None
