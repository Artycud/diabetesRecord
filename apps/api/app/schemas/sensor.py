from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional


class SensorReadingCreate(BaseModel):
    time: datetime
    device_id: UUID

    # MetaBreath firmware payload (metabreath.ino)
    sensor_voltage: Optional[float] = Field(None, ge=0.0, le=3.3, description="TGS1820 direct read (V)")
    baseline_voltage: Optional[float] = Field(None, ge=0.0, le=3.3, description="TGS1820 clean-air baseline (V)")
    acetone_delta_mv: Optional[float] = Field(None, description="(sensor - baseline) * 1000 (mV)")
    pressure_kpa: Optional[float] = Field(None, ge=0.0, le=15.0, description="XGZP6847A breath pressure (kPa)")

    # Legacy raw fields — populated from firmware equivalents by MQTT worker
    ambient_voc: Optional[float] = None
    breath_voc: Optional[float] = None
    pressure_mean: Optional[float] = None
    pressure_std: Optional[float] = None
    breath_duration: Optional[float] = None
    voc_ppb: Optional[float] = None
    ketone_mmol: Optional[float] = None
    temp_c: Optional[float] = Field(None, alias="temperature")
    humidity_pct: Optional[float] = Field(None, alias="humidity")
    raw: Optional[dict] = None

    class Config:
        populate_by_name = True


class SensorReadingOut(BaseModel):
    time: datetime
    device_id: UUID

    # Raw sensor values
    ambient_voc: Optional[float]
    breath_voc: Optional[float]
    acetone_delta: Optional[float]
    pressure_mean: Optional[float]
    pressure_std: Optional[float]
    breath_duration: Optional[float]

    # Legacy
    voc_ppb: Optional[float]
    ketone_mmol: Optional[float]
    temp_c: Optional[float]
    humidity_pct: Optional[float]

    # Quality
    quality_score: Optional[float]
    reliability_score: Optional[float]
    environment_penalty: Optional[float]

    # Signal features
    slope: Optional[float]
    time_to_peak: Optional[float]
    recovery_rate: Optional[float]

    # Prediction
    metabolic_risk_index: Optional[int]
    confidence_score: Optional[float]
    label: Optional[str]

    class Config:
        from_attributes = True


class CalibrationCreate(BaseModel):
    # baseline_voc column is reused to store TGS1820 baseline VOLTAGE (V) in the new pipeline
    baseline_voc: float = Field(..., ge=0.0, le=3.3, description="TGS1820 baseline voltage in V (0–3.3)")
    baseline_temp: Optional[float] = Field(None, ge=-40.0, le=85.0)
    baseline_humidity: Optional[float] = Field(None, ge=0.0, le=100.0)
    baseline_pressure: Optional[float] = Field(None, ge=0.0, le=15.0, description="Breath pressure at baseline (kPa)")
    method: Optional[str] = "clean_air"
    reference_device: Optional[str] = None
    notes: Optional[str] = None


class CalibrationOut(BaseModel):
    id: UUID
    device_id: UUID
    calibrated_at: datetime
    baseline_voc: float
    baseline_temp: Optional[float]
    baseline_humidity: Optional[float]
    baseline_pressure: Optional[float]
    gain_factor: float
    offset: float
    drift_score: float
    method: Optional[str]
    reference_device: Optional[str]
    notes: Optional[str]

    class Config:
        from_attributes = True


class CalibrationReportOut(BaseModel):
    device_id: UUID
    report_generated_at: datetime
    lod_ppm: float
    repeatability_cv_pct: float
    drift_slope_ppm_per_day: float
    cross_sensitivity_note: str
    n_calibrations: int
    latest_drift_score: float
    needs_recalibration: bool
    reference_comparison: Optional[dict] = None


class DeviceOut(BaseModel):
    id: UUID
    kind: str
    mqtt_topic: Optional[str]
    active: bool
    created_at: datetime
    needs_recalibration: bool
    last_calibrated_at: Optional[datetime]
    firmware_version: Optional[str]
    sensor_model: Optional[str]
    simulate_acetone: bool
    simulate_pressure: bool

    class Config:
        from_attributes = True
