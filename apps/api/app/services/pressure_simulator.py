"""
Synthetic pressure curve — full hardware-fault workaround.

acetone_simulator.py already handles a broken TGS1820 gas sensor by
deriving acetone from the (still-working) pressure sensor. This module is
for the escalated case where the pressure sensor is ALSO broken
(`Device.simulate_pressure`), so there is no real signal left at all —
not even a genuine blow to gate on.

Instead of gating on a real pressure reading, this is anchored to the
`recording:{mac}` Redis session mqtt_subscriber.process_reading() already
reads every message (set by POST /sensor/device/{id}/recording/start, the
same call BreathSession.tsx's "recording" phase makes on a real device).
A fresh session_id appearing means a new recording just started: draw a
random peak in [PEAK_LOW_KPA, PEAK_HIGH_KPA] and start a rise-then-ease
curve toward it, timed off elapsed seconds since that start — independent
of any physical blow signal, since none exists to read.

mqtt_subscriber.process_reading() overwrites pressure_kpa with this
module's step() output BEFORE calling acetone_simulator.step(), so
acetone's own blow-detection (BLOW_ON_KPA/BLOW_OFF_KPA) still works
correctly against this synthetic curve without any changes on that side —
it has no way to tell the difference from a real pressure signal.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

PEAK_LOW_KPA = 1.0
PEAK_HIGH_KPA = 5.0

# Resting value while no recording is active — kept above 0 so a device that
# never records still reports a plausible "not currently blowing" pressure,
# but comfortably under acetone_simulator.BLOW_ON_KPA (1.0) so it never
# itself triggers a false blow detection.
REST_KPA = 0.3

# Matches BreathSession.tsx's RECORDING_MS (5s) — the curve rises over the
# first RISE_FRACTION of this window, then eases back down.
NOMINAL_DURATION_S = 5.0
RISE_FRACTION = 0.6

NOISE_STD_KPA = 0.15


@dataclass
class _PressureState:
    session_id: Optional[str] = None
    start_ts: float = 0.0
    peak_kpa: float = PEAK_LOW_KPA


_STATE: dict[UUID, _PressureState] = {}


def step(device_id: UUID, active_session_id: Optional[str], now_ts: float) -> float:
    """Synthetic pressure_kpa for one MQTT sample.

    active_session_id is whatever mqtt_subscriber.process_reading() already
    read from Redis (`recording:{mac}`) this message — None when no
    recording is active for this device.
    """
    s = _STATE.get(device_id)
    if s is None:
        s = _PressureState()
        _STATE[device_id] = s

    if active_session_id and active_session_id != s.session_id:
        # A new recording just started — draw this test's peak and reset
        # the elapsed-time anchor.
        s.session_id = active_session_id
        s.start_ts = now_ts
        s.peak_kpa = random.uniform(PEAK_LOW_KPA, PEAK_HIGH_KPA)
    elif not active_session_id:
        s.session_id = None

    if not active_session_id:
        base = REST_KPA
    else:
        elapsed = max(0.0, now_ts - s.start_ts)
        t = min(1.0, elapsed / NOMINAL_DURATION_S)
        if t < RISE_FRACTION:
            frac = t / RISE_FRACTION
        else:
            # Ease down over the remainder of the window, never below ~70%
            # of peak — a real exhale doesn't drop straight back to zero
            # mid-test.
            frac = 1 - ((t - RISE_FRACTION) / (1 - RISE_FRACTION)) * 0.3
        base = REST_KPA + (s.peak_kpa - REST_KPA) * max(0.0, frac)

    return round(max(0.0, base + random.gauss(0.0, NOISE_STD_KPA)), 3)


def reset(device_id: UUID) -> None:
    """Drop a device's simulation state (e.g. when simulate_pressure is disabled)."""
    _STATE.pop(device_id, None)
