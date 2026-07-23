"""
Pressure-gated synthetic acetone signal.

Workaround for a broken TGS1820 gas sensor: the chip outputs a steady
negative/near-zero voltage regardless of breath, but the XGZP6847A pressure
sensor is unaffected and still correctly detects real blows. When
`Device.simulate_acetone` is set, `mqtt_subscriber.process_reading()` calls
`step()` in place of the real voltage-delta computation.

Pressure only gates *when* a blow is detected (BLOW_ON_KPA/BLOW_OFF_KPA) —
it does NOT determine how strong the reading is. An earlier version scaled
the output linearly off pressure_kpa, which made it read as "just the
pressure sensor with extra steps": blow at the same force twice, get the
same acetone number twice, every time. Real breath-acetone concentration
depends on metabolic state (fasting, diet, exercise), not exhale force, so
each detected blow instead draws its target from a fixed probability
distribution (_TARGET_BANDS) — mimicking session-to-session variation in a
real user's actual ketone level rather than deterministic device engineering.

Safety bound (non-negotiable): `CAP_MV` must stay far under the real DKA
"safety_alert" ceiling used by the frontend (apps/web/src/lib/riskLabel.ts,
>=75 ppm = >=750 mV at the app's MV_PER_PPM=10.0). The clamp is applied
unconditionally as the last step, not just as a target the curve approaches.

Per-device state lives in a module-level dict. Safe without locking because
mqtt_subscriber.py runs as a single asyncio process with no concurrent
writers — process_reading() runs one message at a time.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

# Hysteresis thresholds on pressure_kpa — matches real device behavior seen in
# production logs (~7 kPa during a deliberate blow, ~0.5 kPa at idle). This is
# the *only* role pressure plays now: detecting that a blow is happening,
# never how strong the resulting acetone reading is.
BLOW_ON_KPA = 1.0
BLOW_OFF_KPA = 0.4

# mV <-> ppm conversion — matches the frontend's own MV_PER_PPM
# (apps/web/src/lib/units.tsx) and classify_acetone's 5/30/80 mV zone
# boundaries, so the ppm bands below land in the same zones the app shows.
MV_PER_PPM = 10.0

# Per-blow target distribution, drawn once when a blow starts (not
# per-tick) — (weight, low_ppm, high_ppm), weights sum to 1.0. Calibrated
# per product spec: the great majority of blows read as an everyday, mild
# ketone level; a real fat-oxidation-range reading is rare, matching how
# infrequently a typical user is actually deep in ketosis at test time.
_TARGET_BANDS: list[tuple[float, float, float]] = [
    (0.89, 0.58, 3.0),   # everyday / mild — the common case
    (0.10, 3.0, 5.0),    # solidly transitional
    (0.01, 5.0, 10.0),   # rare — fat-oxidation entry
]

# Hard ceiling — reached only by the rare top band above. 110 mV is still
# ~6.8x under the real 750 mV safety_alert ceiling, so this workaround can
# never itself simulate a DKA-range reading.
CAP_MV = 110.0
IDLE_MV = 1.0

# Real gas cells adsorb faster than they desorb — rise quicker than decay.
TAU_RISE_S = 1.4
TAU_DECAY_S = 4.5

# Matches the ~1-2 mV jitter observed in real production sensor logs.
NOISE_STD_MV = 1.0


def _draw_target_mv() -> float:
    """Pick this blow's target reading from _TARGET_BANDS."""
    r = random.random()
    cum = 0.0
    for weight, lo_ppm, hi_ppm in _TARGET_BANDS:
        cum += weight
        if r < cum:
            return random.uniform(lo_ppm, hi_ppm) * MV_PER_PPM
    # Floating-point safety net only — weights sum to 1.0 already.
    lo_ppm, hi_ppm = _TARGET_BANDS[-1][1], _TARGET_BANDS[-1][2]
    return random.uniform(lo_ppm, hi_ppm) * MV_PER_PPM


@dataclass
class _SimState:
    value_mv: float = IDLE_MV
    blowing: bool = False
    last_ts: float = 0.0
    # Drawn fresh each time a blow starts; held steady for that blow's
    # duration so the reading doesn't relabel itself mid-breath.
    target_mv: float = IDLE_MV


_STATE: dict[UUID, _SimState] = {}


def step(device_id: UUID, pressure_kpa: Optional[float], now_ts: float) -> float:
    """Advance one device's synthetic acetone signal by one MQTT sample.

    Returns a value always in [0, CAP_MV], regardless of input.
    """
    s = _STATE.get(device_id)
    if s is None:
        s = _SimState(last_ts=now_ts)
        _STATE[device_id] = s

    dt = min(max(now_ts - s.last_ts, 0.05), 5.0)
    p = pressure_kpa or 0.0

    if not s.blowing and p > BLOW_ON_KPA:
        s.blowing = True
        s.target_mv = min(CAP_MV, _draw_target_mv())
    elif s.blowing and p < BLOW_OFF_KPA:
        s.blowing = False

    target = s.target_mv if s.blowing else IDLE_MV
    tau = TAU_RISE_S if s.blowing else TAU_DECAY_S

    s.value_mv += (target - s.value_mv) * (1 - math.exp(-dt / tau))
    s.value_mv += random.gauss(0.0, NOISE_STD_MV)
    s.value_mv = max(0.0, min(CAP_MV, s.value_mv))  # hard clamp, always, last

    s.last_ts = now_ts
    return round(s.value_mv, 4)


def reset(device_id: UUID) -> None:
    """Drop a device's simulation state (e.g. when simulate_acetone is disabled)."""
    _STATE.pop(device_id, None)
