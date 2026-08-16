"""
Admin router — manual sensor reading entry + user data overview.
Access is granted either by role-based login (User.role == "admin", e.g. the
seeded "admin" account) or, for backwards compatibility, the legacy path where
the JWT belongs to ADMIN_EMAIL and the X-Admin-Password header matches
ADMIN_PASSWORD. See app.core.deps.get_admin_user.
"""
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import List, Optional
from uuid import UUID, uuid4
import math
import re
import secrets as _secrets

from app.core.config import settings
from app.core.deps import get_admin_user, get_db
from app.core.secrets import encrypt_secret
from app.core.security import hash_password
from app.models.user import User, Profile
from app.models.health import Device, SensorReading, DeviceCalibration, KetoneLog
from app.models.ai import AIProvider
from app.models.gamification import Streak
from app.services import signal_processing as sp
from app.services.auth import deactivate_user
from app.services import dashboard_service
from app.services.dashboard_service import (
    DashboardDevice, DashboardReading, DashboardKPI, DashboardKetoneLog, UserDashboardOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AdminVerifyRequest(BaseModel):
    password: str


class AdminDeviceOut(BaseModel):
    id: str
    kind: str
    sensor_model: Optional[str]
    active: bool
    needs_recalibration: bool
    last_calibrated_at: Optional[datetime]
    simulate_acetone: bool = False


class AdminReadingSummary(BaseModel):
    total_readings: int
    last_reading_at: Optional[datetime]
    last_label: Optional[str]
    last_acetone_delta: Optional[float]
    last_quality_score: Optional[float]


class AdminUserOut(BaseModel):
    id: str
    email: str
    username: str
    display_name: Optional[str]
    role: str
    assigned_doctor_id: Optional[str]
    created_at: datetime
    devices: List[AdminDeviceOut]
    reading_summary: AdminReadingSummary


class AdminReadingCreate(BaseModel):
    device_id: str
    time: Optional[datetime] = None

    ambient_voc: Optional[float] = None
    breath_voc: Optional[float] = None
    pressure_mean: Optional[float] = None
    pressure_std: Optional[float] = None
    breath_duration: Optional[float] = None
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    note: Optional[str] = None


class AdminReadingOut(BaseModel):
    time: datetime
    device_id: str
    ambient_voc: Optional[float]
    breath_voc: Optional[float]
    acetone_delta: Optional[float]
    quality_score: Optional[float]
    reliability_score: Optional[float]
    environment_penalty: Optional[float]
    metabolic_risk_index: Optional[int]
    confidence_score: Optional[float]
    label: Optional[str]

    class Config:
        from_attributes = True


class DoctorOut(BaseModel):
    id: str
    username: str
    display_name: Optional[str]


class CreateDoctorRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    display_name: str

    # Same rules as RegisterRequest (app/schemas/auth.py) — a doctor account
    # is still a login, so it shouldn't be held to weaker constraints than a
    # normal signup just because admin is the one creating it.
    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[a-zA-Z0-9_]{3,30}$", v):
            raise ValueError("username: 3-30 chars, letters/numbers/underscore only")
        return v

    @field_validator("password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v

    @field_validator("display_name")
    @classmethod
    def display_name_valid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("display_name is required")
        return v


class RoleUpdateRequest(BaseModel):
    role: str  # patient|doctor|admin


class AssignDoctorRequest(BaseModel):
    doctor_id: Optional[str] = None  # null unassigns


# ─── Verify (no JWT needed — just admin password) ─────────────────────────────

@router.post("/verify")
async def verify_admin(body: AdminVerifyRequest):
    """Check if the admin password is correct (used by frontend gate)."""
    if not settings.ADMIN_PASSWORD or body.password != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")
    return {"ok": True}


# ─── Users list with reading summary ─────────────────────────────────────────

@router.get("/users", response_model=List[AdminUserOut])
async def list_users(
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    users_result = await db.exec(select(User).where(User.is_active == True).order_by(User.created_at))
    users = users_result.all()

    profiles_result = await db.exec(select(Profile))
    profiles = {str(p.user_id): p for p in profiles_result.all()}

    devices_result = await db.exec(select(Device))
    all_devices = devices_result.all()
    devices_by_user: dict[str, list] = {}
    for d in all_devices:
        devices_by_user.setdefault(str(d.user_id), []).append(d)

    out = []
    for u in users:
        uid = str(u.id)
        profile = profiles.get(uid)
        devs = devices_by_user.get(uid, [])

        # Fetch reading summary per user (across all their devices)
        device_ids = [d.id for d in devs]
        summary = AdminReadingSummary(total_readings=0, last_reading_at=None, last_label=None, last_acetone_delta=None, last_quality_score=None)

        if device_ids:
            count_result = await db.exec(
                select(func.count(SensorReading.time))
                .where(SensorReading.device_id.in_(device_ids))
            )
            total = count_result.one() or 0

            latest_result = await db.exec(
                select(SensorReading)
                .where(SensorReading.device_id.in_(device_ids))
                .order_by(SensorReading.time.desc())
            )
            latest = latest_result.first()

            summary = AdminReadingSummary(
                total_readings=total,
                last_reading_at=latest.time if latest else None,
                last_label=latest.label if latest else None,
                last_acetone_delta=latest.acetone_delta if latest else None,
                last_quality_score=latest.quality_score if latest else None,
            )

        out.append(AdminUserOut(
            id=uid,
            email=u.email,
            username=u.username,
            display_name=profile.display_name if profile else None,
            role=u.role,
            assigned_doctor_id=str(profile.assigned_doctor_id) if profile and profile.assigned_doctor_id else None,
            created_at=u.created_at,
            devices=[
                AdminDeviceOut(
                    id=str(d.id),
                    kind=d.kind,
                    sensor_model=d.sensor_model,
                    active=d.active,
                    needs_recalibration=d.needs_recalibration,
                    last_calibrated_at=d.last_calibrated_at,
                    simulate_acetone=d.simulate_acetone,
                )
                for d in devs
            ],
            reading_summary=summary,
        ))
    return out


# ─── Delete a user's account (force — unlinks devices first) ─────────────────

@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    if uid == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    target_result = await db.exec(select(User).where(User.id == uid, User.is_active == True))
    target = target_result.first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete another admin account")

    await deactivate_user(target, db)


# ─── Doctors list (for assignment dropdown) ───────────────────────────────────

@router.get("/doctors", response_model=List[DoctorOut])
async def list_doctors(
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    users_result = await db.exec(
        select(User).where(User.role == "doctor", User.is_active == True).order_by(User.username)
    )
    doctors = users_result.all()

    profiles_result = await db.exec(
        select(Profile).where(Profile.user_id.in_([d.id for d in doctors]))
    )
    profiles = {str(p.user_id): p for p in profiles_result.all()}

    return [
        DoctorOut(
            id=str(d.id),
            username=d.username,
            display_name=profiles[str(d.id)].display_name if str(d.id) in profiles else None,
        )
        for d in doctors
    ]


# ─── Create a doctor account directly (not a promoted patient) ────────────────

@router.post("/doctors", response_model=DoctorOut, status_code=201)
async def create_doctor(
    body: CreateDoctorRequest,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only account creation for a doctor persona — distinct from the
    normal signup flow (POST /auth/register), which always creates a
    role="patient" account. Mirrors register_user's duplicate-check +
    hashing (app/services/auth.py) but sets role="doctor" from the start and
    marks the profile onboarded immediately: the patient onboarding
    questionnaire (goal_type, etc.) doesn't apply to a doctor account, so
    there's nothing to collect before they can use /doctor.
    """
    existing = await db.exec(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if existing.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already taken")

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
        role="doctor",
    )
    db.add(user)
    await db.flush()  # user.id for FKs below

    profile = Profile(
        user_id=user.id,
        display_name=body.display_name,
        onboarded_at=datetime.utcnow(),
    )
    db.add(profile)
    db.add(Streak(user_id=user.id))
    await db.commit()

    return DoctorOut(id=str(user.id), username=user.username, display_name=profile.display_name)


# ─── Set a user's role (needed to create doctors) ─────────────────────────────

@router.post("/users/{user_id}/role")
async def set_user_role(
    user_id: str,
    body: RoleUpdateRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if body.role not in ("patient", "doctor", "admin"):
        raise HTTPException(status_code=400, detail="role must be patient|doctor|admin")

    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    target_result = await db.exec(select(User).where(User.id == uid, User.is_active == True))
    target = target_result.first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.role = body.role
    db.add(target)
    await db.commit()
    return {"ok": True, "role": target.role}


# ─── Assign (or unassign) a patient's doctor ──────────────────────────────────

@router.post("/users/{user_id}/assign-doctor")
async def assign_doctor(
    user_id: str,
    body: AssignDoctorRequest,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    profile_result = await db.exec(select(Profile).where(Profile.user_id == uid))
    profile = profile_result.first()
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    if body.doctor_id is None:
        profile.assigned_doctor_id = None
    else:
        try:
            doctor_uid = UUID(body.doctor_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid doctor_id")

        doctor_result = await db.exec(
            select(User).where(User.id == doctor_uid, User.role == "doctor", User.is_active == True)
        )
        if not doctor_result.first():
            raise HTTPException(status_code=400, detail="doctor_id does not belong to an active doctor account")
        profile.assigned_doctor_id = doctor_uid

    db.add(profile)
    await db.commit()
    return {"ok": True, "assigned_doctor_id": str(profile.assigned_doctor_id) if profile.assigned_doctor_id else None}


# ─── Ensure manual device ────────────────────────────────────────────────────

@router.post("/device/ensure/{user_id}", response_model=AdminDeviceOut, status_code=201)
async def ensure_manual_device(
    user_id: str,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    user_result = await db.exec(select(User).where(User.id == uid, User.is_active == True))
    if not user_result.first():
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.exec(
        select(Device).where(Device.user_id == uid, Device.kind == "manual")
    )
    device = existing.first()
    if device:
        return AdminDeviceOut(
            id=str(device.id), kind=device.kind, sensor_model=device.sensor_model,
            active=device.active, needs_recalibration=device.needs_recalibration,
            last_calibrated_at=device.last_calibrated_at,
            simulate_acetone=device.simulate_acetone,
        )

    device = Device(
        user_id=uid, kind="manual", sensor_model="manual_entry",
        firmware_version="admin", active=True,
        mqtt_topic=f"manual/{str(uuid4())}",
        secret=_secrets.token_hex(8),
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)

    return AdminDeviceOut(
        id=str(device.id), kind=device.kind, sensor_model=device.sensor_model,
        active=device.active, needs_recalibration=device.needs_recalibration,
        last_calibrated_at=device.last_calibrated_at,
        simulate_acetone=device.simulate_acetone,
    )


# ─── Register MAC device ─────────────────────────────────────────────────────

class MacDeviceRequest(BaseModel):
    mac: str          # เช่น 88F155302810
    user_email: str   # email ของ user ที่จะ link ด้วย

@router.post("/device/mac", response_model=AdminDeviceOut, status_code=201)
async def register_mac_device(
    body: MacDeviceRequest,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    ลงทะเบียน ESP32 ด้วย MAC address — ทีมทำครั้งเดียวต่ออุปกรณ์
    MAC จะถูกใช้เป็น MQTT topic: metabreath/<MAC>/reading
    """
    mac = body.mac.upper().replace(":", "").replace("-", "")
    if len(mac) != 12:
        raise HTTPException(status_code=400, detail="MAC ต้องมี 12 hex chars เช่น 88F155302810")

    mqtt_topic = f"metabreath/{mac}/reading"

    # หา user จาก email
    user_result = await db.exec(select(User).where(User.email == body.user_email, User.is_active == True))
    user = user_result.first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User not found: {body.user_email}")

    # ถ้า device MAC นี้มีอยู่แล้ว → return ตัวเดิม (idempotent)
    existing = await db.exec(select(Device).where(Device.mqtt_topic == mqtt_topic))
    device = existing.first()
    if device:
        # update user_id ถ้าต้องการเปลี่ยน owner
        if device.user_id != user.id:
            device.user_id = user.id
            await db.commit()
            await db.refresh(device)
        return AdminDeviceOut(
            id=str(device.id), kind=device.kind, sensor_model=device.sensor_model,
            active=device.active, needs_recalibration=device.needs_recalibration,
            last_calibrated_at=device.last_calibrated_at,
            simulate_acetone=device.simulate_acetone,
        )

    device = Device(
        user_id=user.id,
        kind="breath",
        sensor_model="TGS1820",
        firmware_version="v2-mac",
        active=True,
        mqtt_topic=mqtt_topic,
        secret=_secrets.token_hex(16),
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)

    return AdminDeviceOut(
        id=str(device.id), kind=device.kind, sensor_model=device.sensor_model,
        active=device.active, needs_recalibration=device.needs_recalibration,
        last_calibrated_at=device.last_calibrated_at,
        simulate_acetone=device.simulate_acetone,
    )


# ─── Assign existing device to a user ────────────────────────────────────────

class AssignDeviceRequest(BaseModel):
    user_id: str

@router.post("/device/{device_id}/assign", response_model=AdminDeviceOut)
async def assign_device_to_user(
    device_id: str,
    body: AssignDeviceRequest,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """โอน device ที่มีอยู่แล้วให้ user อื่น (admin only)"""
    try:
        dev_uuid = UUID(device_id)
        user_uuid = UUID(body.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")

    device_result = await db.exec(select(Device).where(Device.id == dev_uuid))
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    user_result = await db.exec(select(User).where(User.id == user_uuid, User.is_active == True))
    if not user_result.first():
        raise HTTPException(status_code=404, detail="User not found")

    device.user_id = user_uuid
    await db.commit()
    await db.refresh(device)

    return AdminDeviceOut(
        id=str(device.id), kind=device.kind, sensor_model=device.sensor_model,
        active=device.active, needs_recalibration=device.needs_recalibration,
        last_calibrated_at=device.last_calibrated_at,
        simulate_acetone=device.simulate_acetone,
    )


# ─── Simulated acetone toggle (hardware-fault workaround) ────────────────────

class SimulateAcetoneRequest(BaseModel):
    enabled: bool

@router.post("/device/{device_id}/simulate-acetone", response_model=AdminDeviceOut)
async def set_simulate_acetone(
    device_id: str,
    body: SimulateAcetoneRequest,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle pressure-driven synthetic acetone for a device whose gas sensor
    is broken. Instant, no redeploy — flip back off the moment hardware is fixed."""
    try:
        dev_uuid = UUID(device_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")

    device_result = await db.exec(select(Device).where(Device.id == dev_uuid))
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    device.simulate_acetone = body.enabled
    await db.commit()
    await db.refresh(device)

    return AdminDeviceOut(
        id=str(device.id), kind=device.kind, sensor_model=device.sensor_model,
        active=device.active, needs_recalibration=device.needs_recalibration,
        last_calibrated_at=device.last_calibrated_at,
        simulate_acetone=device.simulate_acetone,
    )


# ─── Submit reading ──────────────────────────────────────────────────────────

@router.post("/reading", response_model=AdminReadingOut, status_code=201)
async def submit_reading(
    body: AdminReadingCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        device_uuid = UUID(body.device_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid device_id")

    device_result = await db.exec(select(Device).where(Device.id == device_uuid))
    device = device_result.first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    cal_result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == device_uuid)
        .order_by(DeviceCalibration.calibrated_at.desc())
    )
    calibration = cal_result.first()

    ambient = body.ambient_voc or 0.0
    breath = body.breath_voc or 0.0

    if calibration:
        breath_corrected = sp.baseline_subtract(breath, calibration.baseline_voc, calibration.gain_factor, calibration.offset)
    else:
        breath_corrected = breath - ambient

    breath_compensated = sp.env_compensate(breath_corrected, body.temp_c, body.humidity_pct)
    acetone_delta = sp.pressure_normalize(breath_compensated, body.pressure_mean, body.breath_duration)

    q_score = sp.quality_score(
        ambient_voc=body.ambient_voc, breath_voc=body.breath_voc,
        breath_duration=body.breath_duration, pressure_mean=body.pressure_mean,
        pressure_std=body.pressure_std, temp_c=body.temp_c, humidity_pct=body.humidity_pct,
    )

    cal_age_days = 0.0
    if calibration:
        cal_age_days = (datetime.utcnow() - calibration.calibrated_at).total_seconds() / 86400
    r_score = sp.reliability_score(q_score, calibration.drift_score if calibration else 0.0, cal_age_days)

    confidence = r_score / 100.0
    classification = sp.classify_acetone(acetone_delta, confidence)

    # Admin-submitted readings are attributed to the device owner explicitly
    # (bypasses shared-session takeover — admin picks the target via device_id).
    reading = SensorReading(
        time=body.time or datetime.utcnow(),
        device_id=device_uuid,
        user_id=device.user_id,
        ambient_voc=body.ambient_voc, breath_voc=body.breath_voc,
        acetone_delta=round(acetone_delta, 4),
        pressure_mean=body.pressure_mean, pressure_std=body.pressure_std,
        breath_duration=body.breath_duration, temp_c=body.temp_c, humidity_pct=body.humidity_pct,
        quality_score=round(q_score, 2), reliability_score=round(r_score, 2),
        environment_penalty=sp.environment_penalty(body.temp_c, body.humidity_pct),
        metabolic_risk_index=classification["metabolic_risk_index"],
        confidence_score=round(confidence, 4),
        label=classification["label"],
        raw={"admin_entry": True, "submitted_by": admin.email, "note": body.note},
    )
    db.add(reading)
    await db.commit()
    await db.refresh(reading)
    return reading


# ─── Per-user dashboard ──────────────────────────────────────────────────────
# Dashboard*/UserDashboardOut + the build logic now live in dashboard_service.py
# (shared with the doctor-facing GET /doctor/patients/{id}/dashboard route).

@router.get("/user/{user_id}/dashboard", response_model=UserDashboardOut)
async def user_dashboard(
    user_id: str,
    days: int = 7,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Return everything the admin dashboard needs for a single user."""
    try:
        uid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    user_result = await db.exec(select(User).where(User.id == uid, User.is_active == True))
    user = user_result.first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return await dashboard_service.build_user_dashboard(db, user, days)


# ─── Breath ↔ urine ketone agreement ──────────────────────────────────────────

class KetonePair(BaseModel):
    ts: datetime
    acetone_delta: float
    breath_label: Optional[str]
    urine_category: str
    urine_rank: int
    urine_mmol: float
    breath_mmol_est: float  # breath acetone converted to mmol/L equivalent


class AgreementMatrixRow(BaseModel):
    breath_label: str
    counts: dict  # {urine_category: count}


class BlandAltmanPoint(BaseModel):
    mean: float   # (breath_est + urine) / 2
    diff: float   # breath_est − urine
    ts: datetime


class BlandAltman(BaseModel):
    n: int
    bias: Optional[float]         # mean difference (breath − urine), = calibration offset
    sd: Optional[float]          # SD of differences
    loa_lower: Optional[float]   # bias − 1.96·SD
    loa_upper: Optional[float]   # bias + 1.96·SD
    unit: str
    interpretation: str
    points: List[BlandAltmanPoint]


class KetoneAgreementOut(BaseModel):
    n: int
    spearman_r: Optional[float]
    interpretation: str
    pairs: List[KetonePair]
    agreement_matrix: List[AgreementMatrixRow]
    bland_altman: BlandAltman


def _rankdata(values: list[float]) -> list[float]:
    """Average-rank of each value (ties share the mean rank), 1-based."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0  # 1-based average rank
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def _spearman(xs: list[float], ys: list[float]) -> Optional[float]:
    """Spearman rank correlation — correct choice for ordinal urine bands."""
    n = len(xs)
    if n < 3:
        return None
    rx, ry = _rankdata(xs), _rankdata(ys)
    mx = sum(rx) / n
    my = sum(ry) / n
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    if den == 0:
        return None
    return num / den


@router.get("/ketone-agreement", response_model=KetoneAgreementOut)
async def ketone_agreement(
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Compare breath acetone (device) against paired urine-strip ketone (ground truth).

    Urine bands are ordinal, so agreement uses Spearman rank correlation — NOT
    Pearson. Breath measures acetone, urine measures acetoacetate, so strong-but-
    imperfect agreement is the expected, honest result.
    """
    logs_result = await db.exec(
        select(KetoneLog).where(
            KetoneLog.ketone_type == "urine",
            KetoneLog.urine_category.isnot(None),
            KetoneLog.paired_reading_time.isnot(None),
            KetoneLog.paired_device_id.isnot(None),
        ).order_by(KetoneLog.ts)
    )
    logs = logs_result.all()

    pairs: list[KetonePair] = []
    for lg in logs:
        reading_result = await db.exec(
            select(SensorReading).where(
                SensorReading.device_id == lg.paired_device_id,
                SensorReading.time == lg.paired_reading_time,
            )
        )
        reading = reading_result.first()
        if not reading or reading.acetone_delta is None:
            continue
        rank = sp.urine_category_rank(lg.urine_category)
        if rank is None:
            continue
        pairs.append(KetonePair(
            ts=lg.ts,
            acetone_delta=reading.acetone_delta,
            breath_label=reading.label,
            urine_category=lg.urine_category,
            urine_rank=rank,
            urine_mmol=lg.value_mmol,
            breath_mmol_est=round(sp.breath_acetone_to_mmol_estimate(reading.acetone_delta) or 0.0, 3),
        ))

    n = len(pairs)
    r = _spearman([p.acetone_delta for p in pairs], [float(p.urine_rank) for p in pairs])

    if n < 3:
        interp = f"ข้อมูลยังไม่พอ (มี {n} คู่ ต้องการอย่างน้อย 3 คู่ที่จับคู่ลมหายใจกับแถบปัสสาวะ)"
    elif r is None:
        interp = "คำนวณสหสัมพันธ์ไม่ได้ (ค่าคงที่เกินไป)"
    else:
        strength = (
            "แข็งแรงมาก" if r >= 0.8 else
            "แข็งแรง" if r >= 0.6 else
            "ปานกลาง" if r >= 0.4 else
            "อ่อน" if r >= 0.2 else
            "แทบไม่มี"
        )
        interp = (
            f"Spearman r = {r:.2f} ({strength}) จาก {n} คู่ — "
            "ลมหายใจวัด acetone ส่วนปัสสาวะวัด acetoacetate จึงคาดว่าสอดคล้องแต่ไม่สมบูรณ์"
        )

    # Confusion-style matrix: breath label (rows) × urine band (cols)
    breath_labels = ["clean", "low", "moderate", "high", "unreliable"]
    urine_cats = [b["category"] for b in sp.URINE_KETONE_SCALE]
    matrix: list[AgreementMatrixRow] = []
    for bl in breath_labels:
        counts = {c: 0 for c in urine_cats}
        for p in pairs:
            if (p.breath_label or "unreliable") == bl:
                counts[p.urine_category] += 1
        if sum(counts.values()) > 0:
            matrix.append(AgreementMatrixRow(breath_label=bl, counts=counts))

    # ── Bland-Altman: agreement on a common mmol/L scale ──
    # Both methods placed on estimated blood-ketone mmol/L. The mean difference
    # (bias) is exactly the systematic offset per-device calibration should remove.
    ba_points = [
        BlandAltmanPoint(
            mean=round((p.breath_mmol_est + p.urine_mmol) / 2.0, 3),
            diff=round(p.breath_mmol_est - p.urine_mmol, 3),
            ts=p.ts,
        )
        for p in pairs
    ]
    diffs = [pt.diff for pt in ba_points]
    if len(diffs) >= 3:
        bias = sum(diffs) / len(diffs)
        sd = math.sqrt(sum((d - bias) ** 2 for d in diffs) / (len(diffs) - 1))
        loa_lower, loa_upper = bias - 1.96 * sd, bias + 1.96 * sd
        direction = "สูงกว่า" if bias > 0 else "ต่ำกว่า"
        ba_interp = (
            f"Bias = {bias:+.2f} mmol/L (ลมหายใจอ่าน{direction}แถบปัสสาวะโดยเฉลี่ย) · "
            f"Limits of Agreement {loa_lower:.2f} ถึง {loa_upper:.2f} mmol/L · "
            f"ค่า bias นี้คือ offset ที่ควรใช้ปรับเทียบเครื่อง (calibration)"
        )
    else:
        bias = sd = loa_lower = loa_upper = None
        ba_interp = f"ข้อมูลยังไม่พอสำหรับ Bland-Altman (มี {len(diffs)} คู่ ต้องการ ≥3)"

    bland_altman = BlandAltman(
        n=len(ba_points),
        bias=(round(bias, 3) if bias is not None else None),
        sd=(round(sd, 3) if sd is not None else None),
        loa_lower=(round(loa_lower, 3) if loa_lower is not None else None),
        loa_upper=(round(loa_upper, 3) if loa_upper is not None else None),
        unit="mmol/L",
        interpretation=ba_interp,
        points=ba_points,
    )

    return KetoneAgreementOut(
        n=n, spearman_r=(round(r, 4) if r is not None else None),
        interpretation=interp, pairs=pairs, agreement_matrix=matrix,
        bland_altman=bland_altman,
    )


# ─── Global AI fallback keys (OpenAI/Gemini) ─────────────────────────────────
# Admin-configured, server-stored (encrypted) API keys used by
# app.services.ai_fallback as a second-tier fallback when the primary Claude
# call in app/routers/ai.py fails or has no key configured at all. Never
# returns the decrypted key to the client — only whether one is stored.

class AiFallbackProviderOut(BaseModel):
    key: str
    display_name: str
    enabled: bool
    priority: int
    model: str
    configured: bool


class AiFallbackConfigOut(BaseModel):
    providers: List[AiFallbackProviderOut]


class AiFallbackProviderUpdate(BaseModel):
    # Omit to leave the stored key unchanged; "" clears it; a non-empty
    # string replaces it (encrypted before storage).
    api_key: Optional[str] = None
    enabled: Optional[bool] = None


def _ai_fallback_out(p: AIProvider) -> AiFallbackProviderOut:
    return AiFallbackProviderOut(
        key=p.key, display_name=p.display_name, enabled=p.enabled,
        priority=p.priority, model=p.model, configured=bool(p.api_key_encrypted),
    )


@router.get("/ai-fallback", response_model=AiFallbackConfigOut)
async def get_ai_fallback_config(
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.exec(
        select(AIProvider)
        .where(AIProvider.key.in_(["openai", "gemini"]))
        .order_by(AIProvider.priority)
    )
    return AiFallbackConfigOut(providers=[_ai_fallback_out(p) for p in result.all()])


@router.put("/ai-fallback/{provider_key}", response_model=AiFallbackProviderOut)
async def update_ai_fallback_provider(
    provider_key: str,
    body: AiFallbackProviderUpdate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if provider_key not in ("openai", "gemini"):
        raise HTTPException(status_code=400, detail="Only openai/gemini fallback keys can be set here")

    result = await db.exec(select(AIProvider).where(AIProvider.key == provider_key))
    provider = result.first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    if body.api_key is not None:
        provider.api_key_encrypted = encrypt_secret(body.api_key) if body.api_key else None
    if body.enabled is not None:
        provider.enabled = body.enabled
    provider.updated_at = datetime.utcnow()

    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return _ai_fallback_out(provider)
