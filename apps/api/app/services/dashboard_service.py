"""Per-user KPI/series/device dashboard — extracted from GET /admin/user/{id}
/dashboard so it can be reused by both the admin route (admin.py) and the
doctor route (doctor.py) against an arbitrary already-authorized target user.
"""
from pydantic import BaseModel
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import List, Optional

from app.models.user import User, Profile
from app.models.health import Device, SensorReading, DeviceCalibration, KetoneLog


class DashboardDevice(BaseModel):
    id: str
    kind: str
    sensor_model: Optional[str]
    active: bool
    needs_recalibration: bool
    last_calibrated_at: Optional[datetime]
    last_seen_at: Optional[datetime]
    baseline_voc: Optional[float]
    drift_score: Optional[float]
    total_readings: int


class DashboardReading(BaseModel):
    time: datetime
    device_id: str
    # Core acetone / VOC
    ambient_voc: Optional[float] = None
    breath_voc: Optional[float] = None
    acetone_delta: Optional[float] = None
    voc_ppb: Optional[float] = None
    ketone_mmol: Optional[float] = None
    # Environment
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    pressure_mean: Optional[float] = None
    pressure_std: Optional[float] = None
    breath_duration: Optional[float] = None
    # Quality / signal shape
    quality_score: Optional[float] = None
    reliability_score: Optional[float] = None
    environment_penalty: Optional[float] = None
    slope: Optional[float] = None
    time_to_peak: Optional[float] = None
    recovery_rate: Optional[float] = None
    # Classification
    label: Optional[str] = None
    metabolic_risk_index: Optional[int] = None
    confidence_score: Optional[float] = None
    # Raw payload (kept small — used for debug view only)
    raw: Optional[dict] = None


class DashboardKPI(BaseModel):
    total_readings: int
    active_days: int
    avg_acetone_delta: Optional[float]
    avg_quality_score: Optional[float]
    avg_reliability_score: Optional[float]
    last_reading_at: Optional[datetime]


class DashboardKetoneLog(BaseModel):
    ts: datetime
    ketone_type: str
    value_mmol: Optional[float]
    urine_category: Optional[str]
    source: Optional[str]


class UserDashboardOut(BaseModel):
    user: dict          # id, email, username, display_name, created_at
    window_days: int
    kpi: DashboardKPI
    devices: List[DashboardDevice]
    label_counts: dict  # {clean, low, moderate, high, unreliable}
    series: List[DashboardReading]     # ≤ 200 downsampled points for chart
    recent: List[DashboardReading]     # last 20 raw
    ketone_logs: List[DashboardKetoneLog]


def _to_dashboard_reading(r: SensorReading, include_raw: bool) -> DashboardReading:
    return DashboardReading(
        time=r.time, device_id=str(r.device_id),
        ambient_voc=r.ambient_voc, breath_voc=r.breath_voc,
        acetone_delta=r.acetone_delta, voc_ppb=r.voc_ppb, ketone_mmol=r.ketone_mmol,
        temp_c=r.temp_c, humidity_pct=r.humidity_pct,
        pressure_mean=r.pressure_mean, pressure_std=r.pressure_std,
        breath_duration=r.breath_duration,
        quality_score=r.quality_score, reliability_score=r.reliability_score,
        environment_penalty=r.environment_penalty,
        slope=r.slope, time_to_peak=r.time_to_peak, recovery_rate=r.recovery_rate,
        label=r.label, metabolic_risk_index=r.metabolic_risk_index,
        confidence_score=r.confidence_score,
        raw=r.raw if include_raw else None,
    )


async def build_user_dashboard(
    db: AsyncSession,
    target_user: User,
    days: int = 7,
) -> UserDashboardOut:
    """Return everything a per-user dashboard needs (KPI, devices, label
    distribution, a downsampled acetone-over-time series, recent raw
    readings, ketone logs) for a single user — used by both the admin
    per-user dashboard and a doctor's view of an assigned patient.
    `target_user` must already be authorized by the caller — this function
    does no authorization of its own.
    """
    days = max(1, min(days, 90))
    since = datetime.utcnow() - timedelta(days=days)

    profile_result = await db.exec(select(Profile).where(Profile.user_id == target_user.id))
    profile = profile_result.first()

    # ── Devices for this user ────────────────────────────────────────────────
    devices_result = await db.exec(select(Device).where(Device.user_id == target_user.id))
    devices = list(devices_result.all())
    device_ids = [d.id for d in devices]

    if not device_ids:
        return UserDashboardOut(
            user={
                "id": str(target_user.id),
                "email": target_user.email,
                "username": target_user.username,
                "display_name": profile.display_name if profile else None,
                "created_at": target_user.created_at.isoformat(),
            },
            window_days=days,
            kpi=DashboardKPI(total_readings=0, active_days=0, avg_acetone_delta=None,
                             avg_quality_score=None, avg_reliability_score=None, last_reading_at=None),
            devices=[], label_counts={}, series=[], recent=[], ketone_logs=[],
        )

    # ── Readings in window ───────────────────────────────────────────────────
    readings_result = await db.exec(
        select(SensorReading)
        .where(SensorReading.device_id.in_(device_ids), SensorReading.time >= since)
        .order_by(SensorReading.time.asc())
    )
    readings = list(readings_result.all())

    # ── Per-device stats (last_seen, baseline, drift, total) ─────────────────
    device_out: List[DashboardDevice] = []
    for d in devices:
        last_read_result = await db.exec(
            select(SensorReading)
            .where(SensorReading.device_id == d.id)
            .order_by(SensorReading.time.desc())
        )
        last_read = last_read_result.first()

        cal_result = await db.exec(
            select(DeviceCalibration)
            .where(DeviceCalibration.device_id == d.id)
            .order_by(DeviceCalibration.calibrated_at.desc())
        )
        cal = cal_result.first()

        count_result = await db.exec(
            select(func.count(SensorReading.time)).where(SensorReading.device_id == d.id)
        )
        total = count_result.one() or 0

        device_out.append(DashboardDevice(
            id=str(d.id),
            kind=d.kind,
            sensor_model=d.sensor_model,
            active=d.active,
            needs_recalibration=d.needs_recalibration,
            last_calibrated_at=d.last_calibrated_at,
            last_seen_at=last_read.time if last_read else None,
            baseline_voc=cal.baseline_voc if cal else None,
            drift_score=cal.drift_score if cal else None,
            total_readings=total,
        ))

    # ── KPI ──────────────────────────────────────────────────────────────────
    valid_acetone = [r.acetone_delta for r in readings if r.acetone_delta is not None and r.label != "unreliable"]
    valid_quality = [r.quality_score for r in readings if r.quality_score is not None]
    valid_reliab  = [r.reliability_score for r in readings if r.reliability_score is not None]
    active_days   = len({r.time.date() for r in readings})
    last_read     = readings[-1] if readings else None

    kpi = DashboardKPI(
        total_readings=len(readings),
        active_days=active_days,
        avg_acetone_delta=round(sum(valid_acetone) / len(valid_acetone), 2) if valid_acetone else None,
        avg_quality_score=round(sum(valid_quality) / len(valid_quality), 1) if valid_quality else None,
        avg_reliability_score=round(sum(valid_reliab) / len(valid_reliab), 1) if valid_reliab else None,
        last_reading_at=last_read.time if last_read else None,
    )

    # ── Label distribution ───────────────────────────────────────────────────
    label_counts: dict = {}
    for r in readings:
        lbl = r.label or "unknown"
        label_counts[lbl] = label_counts.get(lbl, 0) + 1

    # ── Downsample series → ≤ 200 points (skip raw JSON to keep payload lean) ─
    MAX_POINTS = 200
    stride = max(1, len(readings) // MAX_POINTS)
    sampled = readings[::stride][:MAX_POINTS]
    series = [_to_dashboard_reading(r, include_raw=False) for r in sampled]

    # ── Recent 20 raw (full detail, incl. raw JSONB for expand-row view) ─────
    recent_result = await db.exec(
        select(SensorReading)
        .where(SensorReading.device_id.in_(device_ids))
        .order_by(SensorReading.time.desc())
    )
    recent_all = list(recent_result.all())[:20]
    recent = [_to_dashboard_reading(r, include_raw=True) for r in recent_all]

    # ── Ketone logs (last 30 days) ───────────────────────────────────────────
    ket_result = await db.exec(
        select(KetoneLog)
        .where(KetoneLog.user_id == target_user.id, KetoneLog.ts >= datetime.utcnow() - timedelta(days=30))
        .order_by(KetoneLog.ts.desc())
    )
    ketone_logs = [
        DashboardKetoneLog(
            ts=k.ts, ketone_type=k.ketone_type,
            value_mmol=k.value_mmol, urine_category=k.urine_category,
            source=k.source,
        )
        for k in ket_result.all()
    ]

    return UserDashboardOut(
        user={
            "id": str(target_user.id),
            "email": target_user.email,
            "username": target_user.username,
            "display_name": profile.display_name if profile else None,
            "created_at": target_user.created_at.isoformat(),
        },
        window_days=days,
        kpi=kpi,
        devices=device_out,
        label_counts=label_counts,
        series=series,
        recent=recent,
        ketone_logs=ketone_logs,
    )
