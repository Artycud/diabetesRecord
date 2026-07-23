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
The resting baseline between blows is drawn the same way (_IDLE_BANDS),
but wanders within a band for IDLE_BAND_REFRESH_S rather than snapping to
one exact number — see IDLE_BAND_REFRESH_S/IDLE_WANDER_REFRESH_S below.

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

# Resting-baseline distribution — same idea as _TARGET_BANDS but for what
# "not currently blowing" settles to. Mostly a low, unremarkable resting
# value; sometimes a touch higher. Unlike _TARGET_BANDS (one point per
# blow), idle picks a *band* (see IDLE_BAND_REFRESH_S below) and wanders
# within it, rather than a single fixed point — a real idle sensor doesn't
# hold one exact value indefinitely, but it also shouldn't visibly
# re-randomize every couple of seconds.
_IDLE_BANDS: list[tuple[float, float, float]] = [
    (0.70, 0.1, 0.3),
    (0.30, 0.3, 0.5),
]

# How long to stay within one idle band before picking a new one, and how
# often to move to a new point *within* the current band while there.
# Together: "settle near a value for ~20s, wandering a bit, then drift to
# a new one" instead of a fresh random number every sample.
IDLE_BAND_REFRESH_S = 20.0
IDLE_WANDER_REFRESH_S = 4.0

# Hard ceiling — reached only by the rare top band above. 110 mV is still
# ~6.8x under the real 750 mV safety_alert ceiling, so this workaround can
# never itself simulate a DKA-range reading.
CAP_MV = 110.0

# Real gas cells adsorb faster than they desorb — rise quicker than decay.
TAU_RISE_S = 1.4
TAU_DECAY_S = 4.5

# Matches the ~1-2 mV jitter observed in real production sensor logs —
# appropriate for the blow signal (up to 100mV), but was also being used
# for idle (only 1-5mV), where the same 1mV std is 20-100% of the whole
# signal and reads as constant re-randomizing. Idle gets its own much
# smaller jitter; the "settling near a range" motion comes from the
# band/wander mechanism above, not from noise.
NOISE_STD_MV = 1.0
NOISE_STD_IDLE_MV = 0.1


def _draw_from_bands(bands: list[tuple[float, float, float]]) -> float:
    """Weighted-random ppm draw from a (weight, low, high) band list, in mV."""
    r = random.random()
    cum = 0.0
    for weight, lo_ppm, hi_ppm in bands:
        cum += weight
        if r < cum:
            return random.uniform(lo_ppm, hi_ppm) * MV_PER_PPM
    # Floating-point safety net only — weights sum to 1.0 already.
    lo_ppm, hi_ppm = bands[-1][1], bands[-1][2]
    return random.uniform(lo_ppm, hi_ppm) * MV_PER_PPM


def _draw_target_mv() -> float:
    """Pick this blow's target reading from _TARGET_BANDS."""
    return _draw_from_bands(_TARGET_BANDS)


def _pick_idle_band_mv() -> tuple[float, float]:
    """Weighted-random band selection from _IDLE_BANDS, returned in mV."""
    r = random.random()
    cum = 0.0
    for weight, lo_ppm, hi_ppm in _IDLE_BANDS:
        cum += weight
        if r < cum:
            return (lo_ppm * MV_PER_PPM, hi_ppm * MV_PER_PPM)
    lo_ppm, hi_ppm = _IDLE_BANDS[-1][1], _IDLE_BANDS[-1][2]
    return (lo_ppm * MV_PER_PPM, hi_ppm * MV_PER_PPM)


@dataclass
class _SimState:
    """Always constructed fresh (one per device, on first `step()` call) via
    the no-arg defaults below — __post_init__ draws the actual starting
    baseline, since a plain field default can't call a random function."""
    value_mv: float = 0.0
    blowing: bool = False
    last_ts: float = 0.0
    # Drawn fresh each time a blow starts; held steady for that blow's
    # duration so the reading doesn't relabel itself mid-breath.
    target_mv: float = 0.0
    # Current idle wander-point (what value_mv decays toward while idle),
    # the band it's currently wandering within, and when each was last
    # (re)drawn — see IDLE_BAND_REFRESH_S/IDLE_WANDER_REFRESH_S.
    idle_mv: float = 0.0
    idle_band: tuple[float, float] = (0.0, 0.0)
    idle_band_ts: float = 0.0
    idle_wander_ts: float = 0.0

    def __post_init__(self):
        band = _pick_idle_band_mv()
        point = random.uniform(*band)
        self.value_mv = point
        self.target_mv = point
        self.idle_mv = point
        self.idle_band = band
        self.idle_band_ts = self.last_ts
        self.idle_wander_ts = self.last_ts


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
        # Fresh idle band + point the instant a blow ends, not a leftover
        # from however long ago the pre-blow idle period last refreshed.
        s.idle_band = _pick_idle_band_mv()
        s.idle_mv = random.uniform(*s.idle_band)
        s.idle_band_ts = now_ts
        s.idle_wander_ts = now_ts

    if not s.blowing:
        if now_ts - s.idle_band_ts >= IDLE_BAND_REFRESH_S:
            s.idle_band = _pick_idle_band_mv()
            s.idle_mv = random.uniform(*s.idle_band)
            s.idle_band_ts = now_ts
            s.idle_wander_ts = now_ts
        elif now_ts - s.idle_wander_ts >= IDLE_WANDER_REFRESH_S:
            s.idle_mv = random.uniform(*s.idle_band)
            s.idle_wander_ts = now_ts

    target = s.target_mv if s.blowing else s.idle_mv
    tau = TAU_RISE_S if s.blowing else TAU_DECAY_S
    noise_std = NOISE_STD_MV if s.blowing else NOISE_STD_IDLE_MV

    s.value_mv += (target - s.value_mv) * (1 - math.exp(-dt / tau))
    s.value_mv += random.gauss(0.0, noise_std)
    s.value_mv = max(0.0, min(CAP_MV, s.value_mv))  # hard clamp, always, last

    s.last_ts = now_ts
    return round(s.value_mv, 4)


def reset(device_id: UUID) -> None:
    """Drop a device's simulation state (e.g. when simulate_acetone is disabled)."""
    _STATE.pop(device_id, None)
