"""
Pressure-driven synthetic acetone signal.

Workaround for a broken TGS1820 gas sensor: the chip outputs a steady
negative/near-zero voltage regardless of breath, but the XGZP6847A pressure
sensor is unaffected and still correctly detects real blows. When
`Device.simulate_acetone` is set, `mqtt_subscriber.process_reading()` calls
`step()` in place of the real voltage-delta computation.

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
# production logs (~7 kPa during a deliberate blow, ~0.5 kPa at idle).
BLOW_ON_KPA = 1.0
BLOW_OFF_KPA = 0.4

# Calibrated so a typical solid blow (~7 kPa) produces ~22 mV (~2.2 ppm) —
# most detections should land around 1-3 ppm, not near the cap.
GAIN_MV_PER_KPA = 3.0

# Hard ceiling — reached only on unusually strong/sustained blows. 65 mV is
# ~11.5x under the real 750 mV safety_alert ceiling.
CAP_MV = 65.0
IDLE_MV = 1.0

# Real gas cells adsorb faster than they desorb — rise quicker than decay.
TAU_RISE_S = 1.4
TAU_DECAY_S = 4.5

# Matches the ~1-2 mV jitter observed in real production sensor logs.
NOISE_STD_MV = 1.0


@dataclass
class _SimState:
    value_mv: float = IDLE_MV
    blowing: bool = False
    last_ts: float = 0.0


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
    elif s.blowing and p < BLOW_OFF_KPA:
        s.blowing = False

    target = min(CAP_MV, IDLE_MV + GAIN_MV_PER_KPA * p) if s.blowing else IDLE_MV
    tau = TAU_RISE_S if s.blowing else TAU_DECAY_S

    s.value_mv += (target - s.value_mv) * (1 - math.exp(-dt / tau))
    s.value_mv += random.gauss(0.0, NOISE_STD_MV)
    s.value_mv = max(0.0, min(CAP_MV, s.value_mv))  # hard clamp, always, last

    s.last_ts = now_ts
    return round(s.value_mv, 4)


def reset(device_id: UUID) -> None:
    """Drop a device's simulation state (e.g. when simulate_acetone is disabled)."""
    _STATE.pop(device_id, None)
