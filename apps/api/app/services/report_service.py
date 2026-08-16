"""Health/doctor-facing report builder — extracted from GET /sensor/report so
it can be reused by both the self-serve route (sensor.py) and the doctor
route (doctor.py) against an arbitrary already-authorized target user.
NOT the device calibration QA report (GET /sensor/device/{id}/calibration
/report) — that stays untouched, it's a separate hardware-evidence artifact.
"""
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from app.models.user import User, Profile
from app.models.health import SensorReading
from app.services import baseline as baseline_service
from app.services import ml_inference, chat_tools


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


async def get_session_summaries(
    db: AsyncSession, user: User, days: int, limit: Optional[int] = None,
) -> List[SessionSummary]:
    """Shared implementation behind GET /sensor/sessions and the session
    history block of GET /sensor/report (and its doctor-scoped equivalent) —
    one row per recording session."""
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

    summaries = [
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
    return summaries[:limit] if limit else summaries


class BaselineOut(BaseModel):
    insufficient_data: bool
    sample_count: int
    computed_from_days: int
    baseline_mean_mv: Optional[float]
    baseline_range_mv: Optional[List[float]]
    baseline_mean_ppm: Optional[float]
    baseline_range_ppm: Optional[List[float]]
    method: str
    device_id: Optional[UUID] = None  # null when computed across all of the user's devices


class ReportUser(BaseModel):
    display_name: Optional[str]
    assigned_doctor_id: Optional[str] = None


class SensorReport(BaseModel):
    generated_at: datetime
    device_id: Optional[str]  # resolved device the trend section is scoped to (if any)
    user: ReportUser
    baseline: BaselineOut
    trend: dict                       # shape of ml_inference.classify_trend()'s return value
    recent_sessions: List[SessionSummary]
    lifestyle_summary: dict           # shape of chat_tools.tool_get_recent_logs()'s return value


async def build_health_report(
    db: AsyncSession,
    target_user: User,
    device_id: Optional[UUID] = None,
    session_days: int = 90,
    log_days: int = 14,
    trend_readings: int = 14,
) -> SensorReport:
    """Aggregates: trend classification (existing LSTM trend classifier),
    personal baseline, recent session history, and a lifestyle log summary —
    one payload for the frontend to render as a printable page (self view)
    or a doctor's patient report (doctor view). `target_user` must already be
    authorized by the caller (get_current_user for self, get_assigned_patient
    for a doctor) — this function does no authorization of its own.
    """
    resolved_device_id = await chat_tools._pick_device_id(db, target_user, device_id)

    profile_res = await db.exec(select(Profile).where(Profile.user_id == target_user.id))
    profile = profile_res.first()

    trend_result: dict = {
        "trend": None, "confidence": 0.0, "probabilities": {},
        "sequence_length": 0, "min_required": ml_inference.TREND_MIN_SEQUENCE_LENGTH,
        "model_used": "no_device", "fallback_reason": "user has no accessible device",
    }
    if resolved_device_id:
        readings_result = await db.exec(
            select(SensorReading)
            .where(
                SensorReading.device_id == resolved_device_id,
                SensorReading.user_id == target_user.id,
            )
            .order_by(SensorReading.time.desc())
            .limit(max(trend_readings, ml_inference.TREND_MIN_SEQUENCE_LENGTH))
        )
        readings = list(readings_result.all())[::-1]  # oldest -> newest
        sequence = [
            {
                "acetone_delta":     r.acetone_delta,
                "pressure_mean":     r.pressure_mean,
                "pressure_std":      r.pressure_std,
                "breath_duration":   r.breath_duration,
                "temperature":       r.temp_c,
                "humidity":          r.humidity_pct,
                "quality_score":     r.quality_score,
                "reliability_score": r.reliability_score,
            }
            for r in readings
        ]
        trend_result = ml_inference.classify_trend(sequence)

    since = datetime.utcnow() - timedelta(days=baseline_service.BASELINE_WINDOW_DAYS)
    baseline_stmt = select(SensorReading.acetone_delta).where(
        SensorReading.user_id == target_user.id,
        SensorReading.time >= since,
        SensorReading.acetone_delta.is_not(None),
    )
    baseline_values = [float(v) for v in (await db.exec(baseline_stmt)).all()]
    baseline_result = baseline_service.compute_personal_baseline(baseline_values)

    sessions = await get_session_summaries(db, target_user, session_days, limit=50)
    lifestyle = await chat_tools.tool_get_recent_logs(db, target_user, days=log_days)

    return SensorReport(
        generated_at=datetime.utcnow(),
        device_id=str(resolved_device_id) if resolved_device_id else None,
        user=ReportUser(
            display_name=profile.display_name if profile else target_user.username,
            assigned_doctor_id=str(profile.assigned_doctor_id)
                if profile and profile.assigned_doctor_id else None,
        ),
        baseline=BaselineOut(**baseline_result, device_id=None),
        trend=trend_result,
        recent_sessions=sessions,
        lifestyle_summary=lifestyle,
    )
