"""Doctor router — a doctor can only ever see patients where
Profile.assigned_doctor_id == their own id (enforced by get_assigned_patient,
app.core.deps). Every patient-scoped endpoint here is a thin wrapper around
the same service functions the self-serve (/sensor/report, /ai/interpret)
and admin (/admin/user/{id}/dashboard) routes already use — see
report_service.py, interpret_service.py, dashboard_service.py — so a doctor
never sees a value (e.g. "average ppm") computed any differently than the
patient would see about themselves.
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from app.core.deps import get_current_doctor, get_assigned_patient, get_db
from app.models.user import User, Profile
from app.models.health import Device, SensorReading
from app.services import report_service, interpret_service, dashboard_service
from app.services.report_service import SensorReport
from app.services.interpret_service import InterpretResponse
from app.services.dashboard_service import UserDashboardOut

router = APIRouter(prefix="/doctor", tags=["doctor"])


class DoctorPatientOut(BaseModel):
    id: str
    username: str
    email: str
    display_name: Optional[str]
    device_count: int
    last_reading_at: Optional[datetime]
    last_label: Optional[str]


@router.get("/patients", response_model=List[DoctorPatientOut])
async def list_my_patients(
    doctor: User = Depends(get_current_doctor),
    db: AsyncSession = Depends(get_db),
):
    """Every active patient currently assigned to this doctor, with a light
    per-patient summary — same shape of query as admin.list_users, scoped
    down to just this doctor's (typically small) patient roster."""
    profiles_result = await db.exec(
        select(Profile).where(Profile.assigned_doctor_id == doctor.id)
    )
    profiles = profiles_result.all()
    patient_ids = [p.user_id for p in profiles]
    if not patient_ids:
        return []

    users_result = await db.exec(
        select(User).where(User.id.in_(patient_ids), User.is_active == True)  # noqa: E712
    )
    users_by_id = {u.id: u for u in users_result.all()}
    profile_by_user = {p.user_id: p for p in profiles}

    devices_result = await db.exec(select(Device).where(Device.user_id.in_(patient_ids)))
    device_ids_by_user: dict = {}
    for d in devices_result.all():
        device_ids_by_user.setdefault(d.user_id, []).append(d.id)

    out: List[DoctorPatientOut] = []
    for uid, user in users_by_id.items():
        profile = profile_by_user.get(uid)
        device_ids = device_ids_by_user.get(uid, [])

        last_reading_at = None
        last_label = None
        if device_ids:
            latest_result = await db.exec(
                select(SensorReading)
                .where(SensorReading.device_id.in_(device_ids))
                .order_by(SensorReading.time.desc())
            )
            latest = latest_result.first()
            if latest:
                last_reading_at = latest.time
                last_label = latest.label

        out.append(DoctorPatientOut(
            id=str(uid),
            username=user.username,
            email=user.email,
            display_name=profile.display_name if profile else None,
            device_count=len(device_ids),
            last_reading_at=last_reading_at,
            last_label=last_label,
        ))

    out.sort(key=lambda p: p.last_reading_at or datetime.min, reverse=True)
    return out


class DoctorInterpretRequest(BaseModel):
    device_id: UUID
    time: Optional[datetime] = None


@router.get("/patients/{patient_id}/dashboard", response_model=UserDashboardOut)
async def get_patient_dashboard(
    days: int = Query(default=7),
    patient: User = Depends(get_assigned_patient),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.build_user_dashboard(db, patient, days)


@router.get("/patients/{patient_id}/report", response_model=SensorReport)
async def get_patient_report(
    device_id: Optional[UUID] = Query(default=None),
    session_days: int = Query(default=90, ge=1, le=365),
    log_days: int = Query(default=14, ge=1, le=90),
    trend_readings: int = Query(default=14, ge=1, le=90),
    patient: User = Depends(get_assigned_patient),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.build_health_report(
        db, patient, device_id, session_days, log_days, trend_readings,
    )


@router.post("/patients/{patient_id}/interpret", response_model=InterpretResponse)
async def interpret_patient_reading(
    body: DoctorInterpretRequest,
    patient: User = Depends(get_assigned_patient),
    db: AsyncSession = Depends(get_db),
):
    return await interpret_service.build_interpretation(db, patient, body.device_id, body.time)
