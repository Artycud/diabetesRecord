"""Unit tests for app.services.acetone_simulator — the pressure-driven
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
    _STATE,
    reset,
    step,
)


@pytest.fixture(autouse=True)
def _clean_state():
    _STATE.clear()
    yield
    _STATE.clear()


def test_idle_stays_near_baseline():
    device_id = uuid4()
    ts = 0.0
    values = []
    for _ in range(50):
        ts += 1.0
        values.append(step(device_id, 0.1, ts))
    assert all(0.0 <= v <= CAP_MV for v in values)
    assert max(values) < IDLE_MV + 5  # small jitter only, no rise


def test_sustained_blow_rises_but_stays_under_cap():
    device_id = uuid4()
    ts = 0.0
    values = []
    for _ in range(30):
        ts += 0.5
        values.append(step(device_id, 7.0, ts))  # typical solid blow, per real logs
    assert all(0.0 <= v <= CAP_MV for v in values)
    # Should rise meaningfully above idle once blowing is detected...
    assert values[-1] > IDLE_MV + 5
    # ...but land well within the "mostly 1-3 ppm" (10-30 mV) typical range,
    # not near the cap, for a normal blow.
    assert values[-1] < CAP_MV * 0.75


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
