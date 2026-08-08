from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Index
from sqlalchemy.dialects.postgresql import JSONB
from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional

class Device(SQLModel, table=True):
    __tablename__ = "devices"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    kind: str = Field(default="breath", max_length=20)  # breath|meter|manual
    mqtt_topic: Optional[str] = Field(default=None, max_length=255)
    secret: Optional[str] = Field(default=None, max_length=100)
    active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # MetaBreath additions
    needs_recalibration: bool = Field(default=False)
    last_calibrated_at: Optional[datetime] = None
    firmware_version: Optional[str] = Field(default=None, max_length=50)
    sensor_model: Optional[str] = Field(default="TGS1820", max_length=50)
    # If true, any signed-in user can claim this device via /devices/pool.
    # Readings during their session are attributed to the claimer, not user_id (owner).
    is_shared: bool = Field(default=False)

class SensorReading(SQLModel, table=True):
    """TimescaleDB hypertable — partitioned by time. Migration adds create_hypertable call.

    Columns aligned with MetaBreath demo dataset (18 features).
    """
    __tablename__ = "sensor_readings"
    __table_args__ = (
        Index("ix_sensor_readings_device_time", "device_id", "time"),
    )

    time: datetime = Field(primary_key=True)
    device_id: UUID = Field(foreign_key="devices.id", primary_key=True)
    # Attribution: whose reading this is. May differ from device.user_id when
    # a shared device is claimed by another user via a device_session.
    user_id: Optional[UUID] = Field(default=None, foreign_key="users.id", index=True)

    # Legacy fields (kept for backward compat)
    voc_ppb: Optional[float] = None
    ketone_mmol: Optional[float] = None
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    raw: Optional[dict] = Field(default=None, sa_column=Column(JSONB))

    # MetaBreath raw sensor values
    ambient_voc: Optional[float] = None        # background VOC (ppm)
    breath_voc: Optional[float] = None         # exhaled VOC (ppm, raw)
    acetone_delta: Optional[float] = None      # = breath_voc − ambient_voc
    pressure_mean: Optional[float] = None
    pressure_std: Optional[float] = None
    breath_duration: Optional[float] = None    # seconds

    # Quality / reliability
    quality_score: Optional[float] = None        # 0–100
    reliability_score: Optional[float] = None    # 0–100
    environment_penalty: Optional[float] = None

    # Derived signal features (for AI model)
    slope: Optional[float] = None                # signal slope
    time_to_peak: Optional[float] = None
    recovery_rate: Optional[float] = None

    # Prediction output
    metabolic_risk_index: Optional[int] = None   # 0=healthy, 1=watch, 2=high
    confidence_score: Optional[float] = None     # 0–1
    label: Optional[str] = Field(default=None, max_length=30)  # low|moderate|high|unreliable

    # Session grouping — sensor_readings within the same recording session
    # share this id, formatted as "{username}{seq}" (e.g. "sunbright1").
    session_id: Optional[str] = Field(default=None, max_length=64, index=True)


class DeviceCalibration(SQLModel, table=True):
    """Baseline + drift tracking per device (Judge #2, #3 evidence)."""
    __tablename__ = "device_calibration"
    __table_args__ = (
        Index("ix_device_calibration_device_time", "device_id", "calibrated_at"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    device_id: UUID = Field(foreign_key="devices.id", index=True)
    calibrated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    baseline_voc: float
    baseline_temp: Optional[float] = None
    baseline_humidity: Optional[float] = None
    baseline_pressure: Optional[float] = None

    gain_factor: float = Field(default=1.0)
    offset: float = Field(default=0.0)
    drift_score: float = Field(default=0.0)

    method: Optional[str] = Field(default=None, max_length=30)  # zero|span|drift_check
    reference_device: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = None


class PilotSession(SQLModel, table=True):
    """NSC pilot study session — matches ร่างวิธีเก็บข้อมูล protocol."""
    __tablename__ = "pilot_session"
    __table_args__ = (
        Index("ix_pilot_session_cohort_day", "cohort", "day_number"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    cohort: str = Field(max_length=30)     # "5day_20p" | "14day_10p"
    day_number: int                         # 1–14
    timepoint: str = Field(max_length=30)  # "fasting" | "post_meal_60" | "post_meal_120"
    recorded_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    # Day-1 demographics
    bmi: Optional[float] = None
    waist_cm: Optional[float] = None
    age: Optional[int] = None
    sex: Optional[str] = Field(default=None, max_length=10)

    # Daily context (per Judge #3 confounder tracking)
    fasting_hours: Optional[float] = None
    food_type: Optional[str] = Field(default=None, max_length=30)  # low_carb|high_carb|keto|mixed
    activity_min: Optional[int] = None
    sleep_hours: Optional[float] = None

    # Gold-standard reference (for Judge #4 correlation proof)
    homa_ir: Optional[float] = None
    blood_glucose: Optional[float] = None
    blood_ketone_mmol: Optional[float] = None

    # Optional link to sensor reading
    sensor_reading_time: Optional[datetime] = None
    sensor_device_id: Optional[UUID] = None
    notes: Optional[str] = None

class KetoneLog(SQLModel, table=True):
    __tablename__ = "ketone_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow, index=True)
    value_mmol: float
    source: str = Field(default="manual", max_length=20)  # sensor|manual
    device_id: Optional[UUID] = Field(default=None, foreign_key="devices.id")
    note: Optional[str] = Field(default=None, max_length=500)

    # Ground-truth reference type — blood (mmol/L) or urine strip (ordinal band)
    ketone_type: str = Field(default="blood", max_length=10)  # blood|urine
    # Urine strip reading: semi-quantitative colour band (negative|trace|small|moderate|large).
    # value_mmol stores the approximate mmol/L midpoint for the band so downstream
    # correlation code can treat blood + urine uniformly; urine_category keeps the raw band.
    urine_category: Optional[str] = Field(default=None, max_length=12)
    urine_mg_dl: Optional[float] = None  # exact strip value if the user entered a number

    # Pairing to a breath measurement (for breath↔ground-truth agreement analysis)
    paired_reading_time: Optional[datetime] = None
    paired_device_id: Optional[UUID] = Field(default=None, foreign_key="devices.id")

class WeightLog(SQLModel, table=True):
    __tablename__ = "weight_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow)
    kg: float

class MealLog(SQLModel, table=True):
    __tablename__ = "meal_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow)
    name: str = Field(max_length=200)
    kcal: Optional[float] = None
    carbs_g: Optional[float] = None
    tags: Optional[list] = Field(default=None, sa_column=Column(JSONB))

class ActivityLog(SQLModel, table=True):
    __tablename__ = "activity_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow)
    kind: str = Field(max_length=50)  # walk|run|cycle|gym|yoga|...
    duration_min: int
    kcal: Optional[float] = None


class DeviceSession(SQLModel, table=True):
    """One active claim on a shared device. Enforced one-per-device by partial
    unique index on (device_id) WHERE active. Claim takes over any prior
    session silently (see /device/{id}/claim endpoint)."""
    __tablename__ = "device_session"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    device_id: UUID = Field(foreign_key="devices.id", index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime  # started_at + sliding TTL (30 min default)
    active: bool = Field(default=True)
