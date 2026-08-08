from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, date as _date
from pathlib import Path
from typing import List, Optional
from uuid import UUID
import os

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.health import Device, SensorReading, DeviceCalibration
from app.schemas.sensor import (
    SensorReadingCreate, SensorReadingOut,
    CalibrationCreate, CalibrationOut,
    CalibrationReportOut, DeviceOut,
)
from app.services import signal_processing as sp
from app.services.device_session import (
    resolve_reading_user,
    get_active_session,
    claim_device as claim_session,
    release_device as release_session,
    SESSION_TTL,
)
from app.models.health import DeviceSession

from app.core.security import create_access_token

router = APIRouter(prefix="/sensor", tags=["sensor"])


# ─── Access helpers ─────────────────────────────────────────────────────────

async def _get_accessible_device(
    device_id: UUID, user: User, db: AsyncSession
) -> Optional[Device]:
    """Return device if the user owns it OR has an active claim on it (shared pool)."""
    result = await db.exec(select(Device).where(Device.id == device_id))
    device = result.first()
    if not device:
        return None
    if device.user_id == user.id:
        return device
    if device.is_shared:
        session = await get_active_session(device_id, db)
        if session and session.user_id == user.id:
            return device
    return None


# ─── BLE Provisioning token ───────────────────────────────────────────────────

class ProvisionTokenOut(BaseModel):
    token: str
    expires_in: int  # seconds
    api_base: str


@router.post("/provision/token", response_model=ProvisionTokenOut)
async def get_provision_token(
    user: User = Depends(get_current_user),
):
    """
    Generate a short-lived (10 min) token for ESP32 BLE provisioning.
    Web app calls this then sends the token to ESP32 via BLE.
    ESP32 uses it to call POST /sensor/device/pair without the user having to type anything.
    """
    import os
    token = create_access_token(user.id, expires_minutes=10)
    api_base = os.getenv("API_BASE_URL", "https://metabreath.duckdns.org/api")
    return ProvisionTokenOut(token=token, expires_in=600, api_base=api_base)


# ─── Device pairing ───────────────────────────────────────────────────────────

class DevicePairRequest(BaseModel):
    kind: str = "breath"
    sensor_model: str = "TGS1820"
    firmware_version: Optional[str] = None


class DevicePairResponse(BaseModel):
    device_id: str
    mqtt_topic: str
    mqtt_user: str
    mqtt_pass: str
    mqtt_broker: str
    mqtt_port: int
    secret: str
    message: str


@router.post("/device/pair", response_model=DevicePairResponse, status_code=201)
async def pair_device(
    body: DevicePairRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Pair a new MetaBreath device with the user account.
    Returns MQTT credentials and topic for the ESP32 firmware to use.
    """
    import secrets as _secrets
    import os

    device = Device(
        user_id=user.id,
        kind=body.kind,
        sensor_model=body.sensor_model,
        firmware_version=body.firmware_version,
        active=True,
    )
    db.add(device)
    await db.flush()  # get device.id

    device_id_str = str(device.id)
    mqtt_topic = f"metabreath/{device_id_str}/reading"
    secret = _secrets.token_hex(16)

    device.mqtt_topic = mqtt_topic
    device.secret = secret

    await db.commit()
    await db.refresh(device)

    mqtt_broker = os.getenv("MQTT_BROKER_PUBLIC", "metabreath.duckdns.org")
    mqtt_port = int(os.getenv("MQTT_PORT_PUBLIC", "1883"))
    mqtt_user = os.getenv("MQTT_ESP32_USER", "esp32")
    mqtt_pass = os.getenv("MQTT_ESP32_PASS", "")

    return DevicePairResponse(
        device_id=device_id_str,
        mqtt_topic=mqtt_topic,
        mqtt_user=mqtt_user,
        mqtt_pass=mqtt_pass,
        mqtt_broker=mqtt_broker,
        mqtt_port=mqtt_port,
        secret=secret,
        message=(
            f"อุปกรณ์จับคู่สำเร็จ! ตั้งค่า ESP32 ด้วย device_id={device_id_str[:8]}... "
            f"แล้ว publish ไปที่ topic: {mqtt_topic}"
        ),
    )


# ─── Device list ─────────────────────────────────────────────────────────────

@router.get("/devices", response_model=List[DeviceOut])
async def list_devices(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.exec(
        select(Device).where(Device.user_id == user.id, Device.active == True)  # noqa: E712
        .order_by(Device.created_at.desc())
    )
    return result.all()


@router.delete("/device/{device_id}", status_code=204)
async def unlink_device(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete the caller's owned device so they can pick a shared one."""
    result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    device = result.first()
    if not device:
        raise HTTPException(404, "Device not found or not owned by user")
    device.active = False
    db.add(device)
    await db.commit()
    return None


# ─── Shared device pool (session-based multi-user access) ────────────────────

class SharedDeviceOut(BaseModel):
    id: str
    kind: str
    sensor_model: Optional[str]
    active: bool
    needs_recalibration: bool
    last_seen_at: Optional[datetime]
    # Active claim, if any
    claimed_by_username: Optional[str] = None
    claimed_by_me: bool = False
    session_expires_at: Optional[datetime] = None


class ClaimResponse(BaseModel):
    device_id: str
    session_id: str
    expires_at: datetime
    displaced_username: Optional[str] = None  # user we kicked, if any


@router.get("/devices/pool", response_model=List[SharedDeviceOut])
async def list_shared_devices(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All is_shared=True devices, with their current active claimer (if any).

    Filter out ghosts: only include devices whose ESP32 has been publishing
    recently (heartbeat present in Redis) OR that have a MAC-shaped mqtt_topic.
    This hides orphan UUID-based dev records that no physical device maps to.
    """
    import redis.asyncio as aioredis
    from app.core.config import settings as _s
    r = aioredis.from_url(_s.CELERY_BROKER_URL, decode_responses=True)

    devices_result = await db.exec(
        select(Device).where(Device.is_shared == True, Device.active == True)  # noqa: E712
    )
    devices = list(devices_result.all())
    out: List[SharedDeviceOut] = []
    for d in devices:
        # Skip orphan devices: no live heartbeat AND no MAC-format topic
        mac = _device_mac_from_topic(d)
        has_heartbeat = bool(await r.exists(f"heartbeat:{mac}")) if mac else False
        is_mac_topic = bool(mac and len(mac) == 12 and all(c in "0123456789ABCDEFabcdef" for c in mac))
        if not has_heartbeat and not is_mac_topic:
            continue
        session = await get_active_session(d.id, db)
        claimer_username: Optional[str] = None
        if session:
            claimer_result = await db.exec(select(User).where(User.id == session.user_id))
            claimer = claimer_result.first()
            claimer_username = claimer.username if claimer else None

        # Last-seen from newest reading (small O(1) query per device)
        last_read_result = await db.exec(
            select(SensorReading)
            .where(SensorReading.device_id == d.id)
            .order_by(SensorReading.time.desc())
        )
        last_read = last_read_result.first()

        out.append(SharedDeviceOut(
            id=str(d.id),
            kind=d.kind,
            sensor_model=d.sensor_model,
            active=d.active,
            needs_recalibration=d.needs_recalibration,
            last_seen_at=last_read.time if last_read else None,
            claimed_by_username=claimer_username,
            claimed_by_me=bool(session and session.user_id == user.id),
            session_expires_at=session.expires_at if session else None,
        ))
    await r.aclose()
    return out


@router.post("/device/{device_id}/claim", response_model=ClaimResponse)
async def claim_shared_device(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Claim a shared device for the caller. Silently ends any prior session.

    All readings arriving while the session is active belong to the caller.
    """
    device_result = await db.exec(select(Device).where(Device.id == device_id))
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not device.is_shared and device.user_id != user.id:
        raise HTTPException(status_code=403, detail="Device is not shared")

    # Look up who's being displaced (for UX feedback)
    prior = await get_active_session(device_id, db)
    displaced_username: Optional[str] = None
    if prior and prior.user_id != user.id:
        prior_user_result = await db.exec(select(User).where(User.id == prior.user_id))
        prior_user = prior_user_result.first()
        displaced_username = prior_user.username if prior_user else None

    session = await claim_session(device_id, user.id, db)
    return ClaimResponse(
        device_id=str(device_id),
        session_id=str(session.id),
        expires_at=session.expires_at,
        displaced_username=displaced_username,
    )


@router.post("/device/{device_id}/release", status_code=204)
async def release_shared_device(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """End the caller's active session on this device. No-op if none."""
    await release_session(device_id, user.id, db)
    return None


# ─── Ingest sensor reading ────────────────────────────────────────────────────

@router.post("/readings", response_model=SensorReadingOut, status_code=201)
async def ingest_reading(
    body: SensorReadingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify device belongs to user
    device_result = await db.exec(
        select(Device).where(Device.id == body.device_id, Device.user_id == user.id)
    )
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Fetch latest calibration for this device
    cal_result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == body.device_id)
        .order_by(DeviceCalibration.calibrated_at.desc())
    )
    calibration = cal_result.first()

    # Firmware pipeline: delta = (sensor_voltage - baseline_voltage) * 1000  →  mV
    sensor_voltage    = body.sensor_voltage
    baseline_voltage  = body.baseline_voltage
    pressure_kpa      = body.pressure_kpa

    if calibration and calibration.baseline_voc:
        effective_baseline = calibration.baseline_voc  # server-calibrated overrides on-chip
    else:
        effective_baseline = baseline_voltage

    if body.acetone_delta_mv is not None:
        acetone_delta_mv = body.acetone_delta_mv
    elif sensor_voltage is not None and effective_baseline is not None:
        acetone_delta_mv = (sensor_voltage - effective_baseline) * 1000.0
    else:
        acetone_delta_mv = 0.0

    q_score = sp.quality_score(
        sensor_voltage=sensor_voltage,
        baseline_voltage=effective_baseline,
        pressure_kpa=pressure_kpa,
        temp_c=body.temp_c,
        humidity_pct=body.humidity_pct,
    )

    cal_age_days = 0.0
    if calibration:
        cal_age_days = (datetime.utcnow() - calibration.calibrated_at).total_seconds() / 86400
    r_score = sp.reliability_score(q_score, calibration.drift_score if calibration else 0.0, cal_age_days)

    env_pen = sp.environment_penalty(body.temp_c, body.humidity_pct)

    confidence = r_score / 100.0
    classification = sp.classify_acetone(acetone_delta_mv, confidence)

    # Reuse legacy columns: ambient_voc = baseline_voltage (V),
    #                       breath_voc  = sensor_voltage (V),
    #                       acetone_delta stored in mV,
    #                       pressure_mean = pressure_kpa (kPa)
    # Attribute to current shared-session claimer if any (else device owner).
    reading_user_id = await resolve_reading_user(device, db)

    reading = SensorReading(
        time=body.time,
        device_id=body.device_id,
        user_id=reading_user_id,
        voc_ppb=body.voc_ppb,
        ketone_mmol=body.ketone_mmol,
        temp_c=body.temp_c,
        humidity_pct=body.humidity_pct,
        raw=body.raw,
        ambient_voc=baseline_voltage,
        breath_voc=sensor_voltage,
        acetone_delta=round(acetone_delta_mv, 4),
        pressure_mean=pressure_kpa,
        pressure_std=None,
        breath_duration=None,
        quality_score=round(q_score, 2),
        reliability_score=round(r_score, 2),
        environment_penalty=env_pen,
        metabolic_risk_index=classification["metabolic_risk_index"],
        confidence_score=round(confidence, 4),
        label=classification["label"],
    )
    db.add(reading)
    await db.commit()
    await db.refresh(reading)
    return reading


# ─── Reading history ──────────────────────────────────────────────────────────

@router.get("/readings", response_model=List[SensorReadingOut])
async def get_readings(
    device_id: UUID = Query(...),
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=0, ge=0, le=10000),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # History is user-scoped: the WHERE clause already filters SensorReading.user_id == user.id,
    # so users can see their own past readings even after releasing a shared device claim.
    since = datetime.utcnow() - timedelta(days=days)
    if limit > 0:
        # Fetch newest N, then flip to ascending so callers still get chronological order.
        q = (
            select(SensorReading)
            .where(
                SensorReading.device_id == device_id,
                SensorReading.user_id == user.id,
                SensorReading.time >= since,
            )
            .order_by(SensorReading.time.desc())
            .limit(limit)
        )
        rows = (await db.exec(q)).all()
        return list(reversed(rows))
    result = await db.exec(
        select(SensorReading)
        .where(
            SensorReading.device_id == device_id,
            SensorReading.user_id == user.id,
            SensorReading.time >= since,
        )
        .order_by(SensorReading.time)
    )
    return result.all()


# ─── Session summaries (one row per "เป่า") ────────────────────────────────

class SessionSummary(BaseModel):
    session_id: str
    device_id: str
    started_at: datetime
    ended_at: datetime
    duration_seconds: float
    n_samples: int
    peak_acetone_delta: Optional[float]   # mV (raw, may be < 0 pre-clip)
    mean_acetone_delta: Optional[float]
    avg_pressure_kpa: Optional[float]
    avg_temp_c: Optional[float]
    avg_humidity_pct: Optional[float]
    dominant_label: Optional[str]


@router.get("/sessions", response_model=List[SessionSummary])
async def list_sessions(
    days: int = Query(default=7, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """One row per recording session (grouped by session_id)."""
    since = datetime.utcnow() - timedelta(days=days)

    rows = (await db.exec(
        select(
            SensorReading.session_id.label("sid"),
            SensorReading.device_id.label("device"),  # constant within a session — safe in GROUP BY
            func.min(SensorReading.time).label("started"),
            func.max(SensorReading.time).label("ended"),
            func.count().label("n"),
            func.max(SensorReading.acetone_delta).label("peak_ac"),
            func.avg(SensorReading.acetone_delta).label("avg_ac"),
            func.avg(SensorReading.pressure_mean).label("avg_p"),
            func.avg(SensorReading.temp_c).label("avg_t"),
            func.avg(SensorReading.humidity_pct).label("avg_h"),
        )
        .where(
            SensorReading.user_id == user.id,
            SensorReading.session_id.is_not(None),
            SensorReading.time >= since,
        )
        .group_by(SensorReading.session_id, SensorReading.device_id)
        .order_by(func.min(SensorReading.time).desc())
    )).all()

    # Dominant label per session
    label_rows = (await db.exec(
        select(
            SensorReading.session_id.label("sid"),
            SensorReading.label,
            func.count().label("n"),
        )
        .where(
            SensorReading.user_id == user.id,
            SensorReading.session_id.is_not(None),
            SensorReading.time >= since,
            SensorReading.label.is_not(None),
        )
        .group_by(SensorReading.session_id, SensorReading.label)
    )).all()

    dominant: dict = {}
    for sid, label, n in label_rows:
        cur = dominant.get(sid)
        if cur is None or n > cur[1]:
            dominant[sid] = (label, n)

    return [
        SessionSummary(
            session_id=r[0],
            device_id=str(r[1]),
            started_at=r[2],
            ended_at=r[3],
            duration_seconds=(r[3] - r[2]).total_seconds(),
            n_samples=int(r[4]),
            peak_acetone_delta=float(r[5]) if r[5] is not None else None,
            mean_acetone_delta=float(r[6]) if r[6] is not None else None,
            avg_pressure_kpa=float(r[7]) if r[7] is not None else None,
            avg_temp_c=float(r[8]) if r[8] is not None else None,
            avg_humidity_pct=float(r[9]) if r[9] is not None else None,
            dominant_label=dominant.get(r[0], (None,))[0],
        )
        for r in rows
    ]


# ─── Daily aggregated stats ────────────────────────────────────────────────

class DailyStat(BaseModel):
    date: _date
    count: int
    avg_acetone_delta: Optional[float]
    max_acetone_delta: Optional[float]
    min_acetone_delta: Optional[float]
    avg_temp_c: Optional[float]
    avg_humidity_pct: Optional[float]
    dominant_label: Optional[str]


@router.get("/daily-stats", response_model=List[DailyStat])
async def get_daily_stats(
    device_id: UUID = Query(...),
    days: int = Query(default=7, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Per-day aggregate for the CURRENT user's readings on this device.
    Shared-device semantics: each user sees their own recordings only —
    the WHERE clause filters user_id, so no cross-user leak even without an active claim.
    """
    since = datetime.utcnow() - timedelta(days=days)
    day = func.date(SensorReading.time).label("day")

    rows = (await db.exec(
        select(
            day,
            func.count().label("count"),
            func.avg(SensorReading.acetone_delta).label("avg_ac"),
            func.max(SensorReading.acetone_delta).label("max_ac"),
            func.min(SensorReading.acetone_delta).label("min_ac"),
            func.avg(SensorReading.temp_c).label("avg_t"),
            func.avg(SensorReading.humidity_pct).label("avg_h"),
        )
        .where(
            SensorReading.device_id == device_id,
            SensorReading.user_id == user.id,
            SensorReading.time >= since,
        )
        .group_by(day)
        .order_by(day.desc())
    )).all()

    # Dominant label per day (mode) — second cheap query
    label_rows = (await db.exec(
        select(
            day,
            SensorReading.label,
            func.count().label("n"),
        )
        .where(
            SensorReading.device_id == device_id,
            SensorReading.user_id == user.id,
            SensorReading.time >= since,
            SensorReading.label.isnot(None),
        )
        .group_by(day, SensorReading.label)
    )).all()

    dominant: dict = {}
    for d, label, n in label_rows:
        cur = dominant.get(d)
        if cur is None or n > cur[1]:
            dominant[d] = (label, n)

    return [
        DailyStat(
            date=r[0],
            count=int(r[1]),
            avg_acetone_delta=float(r[2]) if r[2] is not None else None,
            max_acetone_delta=float(r[3]) if r[3] is not None else None,
            min_acetone_delta=float(r[4]) if r[4] is not None else None,
            avg_temp_c=float(r[5]) if r[5] is not None else None,
            avg_humidity_pct=float(r[6]) if r[6] is not None else None,
            dominant_label=dominant.get(r[0], (None,))[0],
        )
        for r in rows
    ]


# ─── Calibrate device ────────────────────────────────────────────────────────

@router.post("/device/{device_id}/calibrate", response_model=CalibrationOut, status_code=201)
async def calibrate_device(
    device_id: UUID,
    body: CalibrationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Fetch history to compute drift
    cal_hist_result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == device_id)
        .order_by(DeviceCalibration.calibrated_at)
    )
    history = cal_hist_result.all()
    hist_dicts = [{"baseline_voc": c.baseline_voc, "calibrated_at": c.calibrated_at} for c in history]
    # Add new point
    hist_dicts.append({"baseline_voc": body.baseline_voc, "calibrated_at": datetime.utcnow()})
    drift_info = sp.detect_drift(hist_dicts)

    calibration = DeviceCalibration(
        device_id=device_id,
        calibrated_at=datetime.utcnow(),
        baseline_voc=body.baseline_voc,
        baseline_temp=body.baseline_temp,
        baseline_humidity=body.baseline_humidity,
        baseline_pressure=body.baseline_pressure,
        drift_score=drift_info["drift_score"],
        method=body.method,
        reference_device=body.reference_device,
        notes=body.notes,
    )
    db.add(calibration)

    # Update device flags
    device.last_calibrated_at = calibration.calibrated_at
    device.needs_recalibration = drift_info["needs_recalibration"]

    await db.commit()
    await db.refresh(calibration)
    return calibration


# ─── Calibration history ─────────────────────────────────────────────────────

@router.get("/device/{device_id}/calibration", response_model=List[CalibrationOut])
async def get_calibration_history(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == device_id)
        .order_by(DeviceCalibration.calibrated_at.desc())
    )
    return result.all()


# ─── Calibration report (LoD + drift + repeatability) ────────────────────────

@router.get("/device/{device_id}/calibration/report", response_model=CalibrationReportOut)
async def calibration_report(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    cal_hist_result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == device_id)
        .order_by(DeviceCalibration.calibrated_at)
    )
    history = cal_hist_result.all()

    if not history:
        raise HTTPException(status_code=404, detail="No calibration records found. Run calibration first.")

    baselines = [c.baseline_voc for c in history]
    hist_dicts = [{"baseline_voc": c.baseline_voc, "calibrated_at": c.calibrated_at} for c in history]
    drift_info = sp.detect_drift(hist_dicts)

    import statistics as _stats
    mean_baseline = _stats.mean(baselines)
    std_baseline = _stats.stdev(baselines) if len(baselines) > 1 else 0.0

    # LoD = 3σ / sensitivity_factor (TGS1820 approx sensitivity ~0.1)
    sensitivity_factor = 0.1
    lod_ppm = (3.0 * std_baseline) / sensitivity_factor if std_baseline > 0 else 0.01

    # Repeatability CV (coefficient of variation)
    cv_pct = (std_baseline / mean_baseline * 100) if mean_baseline > 0 else 0.0

    latest = history[-1]
    cross_sensitivity = (
        "TGS1820 cross-sensitivity: Ethanol ~30% relative to Acetone. "
        "Recommend fasting ≥2h before measurement to minimise interference."
    )

    return CalibrationReportOut(
        device_id=device_id,
        report_generated_at=datetime.utcnow(),
        lod_ppm=round(lod_ppm, 4),
        repeatability_cv_pct=round(cv_pct, 2),
        drift_slope_ppm_per_day=drift_info["drift_slope_ppm_per_day"],
        cross_sensitivity_note=cross_sensitivity,
        n_calibrations=len(history),
        latest_drift_score=latest.drift_score,
        needs_recalibration=device.needs_recalibration,
        reference_comparison={
            "method": latest.method,
            "reference_device": latest.reference_device,
        },
    )


# ─── Firmware generator (Arduino .ino) ───────────────────────────────────────

FIRMWARE_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "metabreath_firmware.ino.tmpl"


class FirmwareConfigRequest(BaseModel):
    wifi_ssid: str = Field(..., min_length=1, max_length=32)
    wifi_password: str = Field(..., max_length=63)


def _escape_c_string(s: str) -> str:
    """Escape a string so it's safe to embed inside a C double-quoted literal."""
    return (
        s.replace("\\", "\\\\")
         .replace('"', '\\"')
         .replace("\n", "\\n")
         .replace("\r", "\\r")
         .replace("\t", "\\t")
    )


@router.post("/device/{device_id}/firmware", response_class=PlainTextResponse)
async def generate_configured_firmware(
    device_id: UUID,
    body: FirmwareConfigRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a device-specific Arduino .ino file with WiFi + MQTT credentials
    pre-filled. User downloads and flashes via Arduino IDE.
    """
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if not FIRMWARE_TEMPLATE_PATH.exists():
        raise HTTPException(status_code=500, detail="Firmware template missing on server")

    template = FIRMWARE_TEMPLATE_PATH.read_text(encoding="utf-8")

    substitutions = {
        "{{WIFI_SSID}}":     _escape_c_string(body.wifi_ssid),
        "{{WIFI_PASSWORD}}": _escape_c_string(body.wifi_password),
        "{{DEVICE_ID}}":     str(device_id),
        "{{MQTT_BROKER}}":   os.getenv("MQTT_BROKER_PUBLIC", "metabreath.duckdns.org"),
        "{{MQTT_PORT}}":     os.getenv("MQTT_PORT_PUBLIC", "1883"),
        "{{MQTT_USER}}":     os.getenv("MQTT_ESP32_USER", "esp32"),
        "{{MQTT_PASS}}":     os.getenv("MQTT_ESP32_PASS", ""),
        "{{GENERATED_AT}}":  datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }
    for marker, value in substitutions.items():
        template = template.replace(marker, value)

    filename = f"metabreath_{str(device_id)[:8]}.ino"
    return PlainTextResponse(
        content=template,
        media_type="text/x-arduino",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ─── Remote WiFi reset ───────────────────────────────────────────────────────

@router.post("/device/{device_id}/reset-wifi", status_code=202)
async def reset_device_wifi(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send WiFi reset command to device via MQTT.
    Device will erase saved credentials, restart, and re-enter AP mode.
    """
    result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    device = result.first()
    if not device:
        raise HTTPException(404, "Device not found or not owned by user")

    if not device.mqtt_topic:
        raise HTTPException(400, "Device does not support remote commands")

    # mqtt_topic format: metabreath/{MAC}/reading → extract MAC
    mac = device.mqtt_topic.split("/")[1]

    from app.services.mqtt_publisher import publish_device_command
    cmd_id = await publish_device_command(mac, "reset_wifi")

    return {"cmd_id": cmd_id, "status": "sent"}


# ─── Recording session (gate for MQTT-triggered DB inserts) ──────────────────
# Only readings arriving while a session is active are persisted.
# TTL guards against orphaned sessions if the client forgets to stop.

RECORDING_TTL_SECONDS = 15 * 60


def _device_mac_from_topic(device: Device) -> Optional[str]:
    if not device.mqtt_topic:
        return None
    parts = device.mqtt_topic.split("/")
    return parts[1] if len(parts) >= 3 else None


@router.post("/device/{device_id}/recording/start", status_code=201)
async def start_recording(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Begin capturing MQTT readings to DB for this device."""
    device = await _get_accessible_device(device_id, user, db)
    if not device:
        raise HTTPException(404, "Device not found or not owned by user")

    mac = _device_mac_from_topic(device)
    if not mac:
        raise HTTPException(400, "Device has no MQTT topic assigned")

    import redis.asyncio as aioredis
    from app.core.config import settings
    import re

    # Compute next sequential number by inspecting existing session_ids
    # matching this user's prefix. Cheap (indexed) even at scale.
    username = (user.username or "user").lower()
    safe_prefix = re.sub(r"[^a-z0-9]", "", username) or "user"
    result = await db.exec(
        select(SensorReading.session_id)
        .where(
            SensorReading.user_id == user.id,
            SensorReading.session_id.is_not(None),
            SensorReading.session_id.like(f"{safe_prefix}%"),
        )
    )
    max_seq = 0
    for row in result:
        # row is the plain session_id string when only one column is selected
        sid = row if isinstance(row, str) else (row[0] if row else "")
        m = re.match(rf"^{re.escape(safe_prefix)}(\d+)$", sid)
        if m:
            max_seq = max(max_seq, int(m.group(1)))
    session_id = f"{safe_prefix}{max_seq + 1}"

    r = aioredis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
    try:
        await r.set(f"recording:{mac}", session_id, ex=RECORDING_TTL_SECONDS)
    finally:
        await r.aclose()

    return {
        "session_id": session_id,
        "expires_in": RECORDING_TTL_SECONDS,
    }


@router.post("/device/{device_id}/recording/stop", status_code=200)
async def stop_recording(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stop capturing MQTT readings to DB."""
    device = await _get_accessible_device(device_id, user, db)
    if not device:
        raise HTTPException(404, "Device not found or not owned by user")

    mac = _device_mac_from_topic(device)
    if not mac:
        raise HTTPException(400, "Device has no MQTT topic assigned")

    import redis.asyncio as aioredis
    from app.core.config import settings

    r = aioredis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
    try:
        deleted = await r.delete(f"recording:{mac}")
    finally:
        await r.aclose()

    return {"stopped": bool(deleted)}


@router.get("/device/{device_id}/recording/status")
async def recording_status(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check whether a recording session is currently active + device online status."""
    device = await _get_accessible_device(device_id, user, db)
    if not device:
        raise HTTPException(404, "Device not found or not owned by user")

    mac = _device_mac_from_topic(device)
    if not mac:
        return {"active": False, "online": False}

    import redis.asyncio as aioredis
    from app.core.config import settings

    r = aioredis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
    try:
        session_id = await r.get(f"recording:{mac}")
        ttl = await r.ttl(f"recording:{mac}") if session_id else -2
        online = bool(await r.exists(f"heartbeat:{mac}"))
    finally:
        await r.aclose()

    return {
        "active": bool(session_id),
        "session_id": session_id,
        "ttl_seconds": ttl if ttl > 0 else None,
        "online": online,
    }
