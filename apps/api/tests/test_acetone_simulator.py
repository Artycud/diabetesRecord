"""Unit tests for app.services.acetone_simulator — the pressure-gated
synthetic acetone signal used as a workaround while the gas sensor is broken.

The one invariant that must never regress: the output is always in
[0, CAP_MV], regardless of input, since CAP_MV is the safety margin under
the real DKA "safety_alert" ceiling (see module docstring).
"""
from __future__ import annotations

import random
from uuid import uuid4

import pytest

from app.services.acetone_simulator import (
    BLOW_ON_KPA,
    CAP_MV,
    IDLE_MV,
    MV_PER_PPM,
    _STATE,
    _TARGET_BANDS,
    reset,
    step,
)


@pytest.fixture(autouse=True)
def _clean_state():
    _STATE.clear()
    yield
    _STATE.clear()


def test_idle_stays_near_baseline():
    # Pre-existing flakiness, unrelated to the amplitude/pressure redesign
    # below (this path never enters "blowing"): the idle value follows an
    # AR(1)-like process with stationary std ~1.67mV given NOISE_STD_MV=1.0
    # and TAU_DECAY_S=4.5 at these 1s steps, so an unseeded max-of-50 check
    # against a tight +5 bound was an ~few-sigma event, not impossible.
    # Seeded for reproducibility; bound widened to a comfortably-safe ~6
    # stationary-sigma margin instead of a bound the process can plausibly
    # exceed by chance.
    random.seed(2024)
    device_id = uuid4()
    ts = 0.0
    values = []
    for _ in range(50):
        ts += 1.0
        values.append(step(device_id, 0.1, ts))
    assert all(0.0 <= v <= CAP_MV for v in values)
    assert max(values) < IDLE_MV + 10  # small jitter only, no rise


def test_sustained_blow_rises_but_stays_under_cap():
    # Target is now a random per-blow draw (can be as low as ~5.8mV, the
    # bottom of the lowest band) rather than a fixed formula, so assert
    # convergence *toward whatever target was actually drawn* instead of a
    # fixed margin above idle — the latter doesn't hold near the low end
    # of the distribution's range.
    device_id = uuid4()
    ts = 0.0
    values = []
    for _ in range(30):
        ts += 0.5
        values.append(step(device_id, 7.0, ts))  # typical solid blow, per real logs
    assert all(0.0 <= v <= CAP_MV for v in values)
    drawn_target = _STATE[device_id].target_mv
    assert drawn_target > IDLE_MV  # a blow was actually detected and a target drawn
    # 15s of blowing at TAU_RISE_S=1.4s is >10 time constants — should have
    # converged to within a small tolerance of its drawn target.
    assert abs(values[-1] - drawn_target) < 3.0


def test_blow_amplitude_is_not_proportional_to_pressure():
    # The whole point of the redesign: two blows at wildly different
    # pressures should NOT reliably produce proportionally different
    # readings — amplitude comes from the random per-blow draw, pressure
    # only gates on/off. Run many trials at each pressure and compare
    # distributions rather than single draws (which could coincidentally
    # differ) — under the old proportional design this gap would be huge
    # and consistent; under the new design it should be small/inconsistent.
    random.seed(7)
    gentle_finals, hard_finals = [], []
    for trial in range(40):
        for pressure, bucket in ((1.5, gentle_finals), (7.0, hard_finals)):
            device_id = uuid4()
            ts = 0.0
            v = IDLE_MV
            for _ in range(20):
                ts += 0.5
                v = step(device_id, pressure, ts)
            bucket.append(v)
    gentle_mean = sum(gentle_finals) / len(gentle_finals)
    hard_mean = sum(hard_finals) / len(hard_finals)
    # Both should be drawing from the same distribution regardless of
    # pressure, so their means should land close together — nowhere near
    # the ~4.6x gap the old GAIN_MV_PER_KPA formula would have produced
    # (7.0 kPa vs 1.5 kPa at 3.0 mV/kPa).
    assert abs(gentle_mean - hard_mean) < 0.35 * max(gentle_mean, hard_mean)


def test_target_distribution_matches_calibrated_bands():
    # Statistical check on _draw_target_mv() (via step()) across many
    # independent blows: roughly matches the calibrated band weights.
    random.seed(123)
    counts = {i: 0 for i in range(len(_TARGET_BANDS))}
    n = 4000
    for _ in range(n):
        device_id = uuid4()
        ts = 0.0
        v = IDLE_MV
        for _ in range(6):  # long enough to fully reach the drawn target
            ts += 0.5
            v = step(device_id, 7.0, ts)
        ppm = v / MV_PER_PPM
        for i, (_, lo, hi) in enumerate(_TARGET_BANDS):
            if lo <= ppm <= hi:
                counts[i] += 1
                break

    for i, (weight, lo, hi) in enumerate(_TARGET_BANDS):
        observed = counts[i] / n
        # Generous tolerance — this is a statistical check, not exact.
        assert abs(observed - weight) < 0.05, (
            f"band {lo}-{hi}ppm: expected ~{weight:.0%}, observed {observed:.0%}"
        )


def test_release_decays_back_toward_idle():
    device_id = uuid4()
    ts = 0.0
    for _ in range(20):
        ts += 0.5
        step(device_id, 7.0, ts)  # build up during a blow
    for _ in range(40):
        ts += 0.5
        v = step(device_id, 0.1, ts)  # release
    assert v < IDLE_MV + 5


def test_clamp_holds_under_adversarial_pressure_spikes():
    device_id = uuid4()
    rng = random.Random(1234)
    ts = 0.0
    for _ in range(5000):
        ts += rng.uniform(0.01, 2.0)
        # Adversarial: huge spikes, including implausible ones, and gaps.
        p = rng.choice([0.0, 0.3, 1.5, 7.0, 15.0, 50.0, 1000.0])
        v = step(device_id, p, ts)
        assert 0.0 <= v <= CAP_MV, f"value {v} escaped [0, {CAP_MV}] at t={ts}"


def test_multiple_devices_have_independent_state():
    # Seeded: device a's target is now a random per-blow draw, so an
    # unseeded run could (rarely) draw near the bottom of the lowest band
    # and shrink the a-vs-b gap below a fixed margin.
    random.seed(99)
    a, b = uuid4(), uuid4()
    ts = 0.0
    for _ in range(20):
        ts += 0.5
        step(a, 7.0, ts)   # device a blowing hard
        step(b, 0.0, ts)   # device b idle
    va = step(a, 7.0, ts + 0.5)
    vb = step(b, 0.0, ts + 0.5)
    assert va > vb + 5


def test_reset_clears_state():
    device_id = uuid4()
    step(device_id, 7.0, 0.0)
    assert device_id in _STATE
    reset(device_id)
    assert device_id not in _STATE


def test_none_pressure_treated_as_zero():
    device_id = uuid4()
    v = step(device_id, None, 0.0)
    assert 0.0 <= v <= CAP_MV
