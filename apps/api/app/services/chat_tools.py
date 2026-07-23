"""
MetaBreath chat tools — Anthropic tool_use format.

Each tool reads directly from the DB using the current authenticated user +
optional device_id. No HTTP round-trip to MCP server.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, date
from typing import Optional
from uuid import UUID

from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, Profile
from app.models.health import (
    Device, SensorReading, MealLog, ActivityLog, WeightLog, KetoneLog,
    DeviceCalibration,
)
from app.services import ml_inference

# mV -> ppm — matches apps/web/src/lib/units.tsx's MV_PER_PPM and
# classify_acetone's mV zone boundaries. SensorReading.acetone_delta is
# stored in mV; converted here so the reference ranges quoted in the system
# prompt/tool_explain_reading (which are all in ppm) actually match what
# gets handed to the model.
MV_PER_PPM = 10.0


# ─── Tool schemas (Anthropic tool_use format) ────────────────────────────────

TOOL_SCHEMAS = [
    {
        "name": "get_user_profile",
        "description": (
            "ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน: ชื่อ, เพศ, อายุ, ส่วนสูง, น้ำหนัก, BMI, "
            "และเป้าหมาย (goal_type). ใช้เมื่อจะให้คำแนะนำที่เกี่ยวกับสภาพร่างกาย "
            "หรือเมื่อผู้ใช้ถามถึงข้อมูลของตัวเอง"
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_recent_readings",
        "description": (
            "ดึงค่า sensor ลมหายใจล่าสุด (acetone_ppm, label, confidence, quality) "
            "ของผู้ใช้ ย้อนหลัง N วัน พร้อม last_3_tests (3 ครั้งล่าสุด) และ "
            "comparison_to_7day_avg (เทียบค่าเฉลี่ย 3 ครั้งล่าสุดกับค่าเฉลี่ย 7 วัน — "
            "สูงกว่า/ต่ำกว่ากี่ %) ใช้ตอบคำถาม เช่น 'ค่าตอนนี้เป็นยังไง' เสมอเรียกอันนี้ก่อน "
            "แล้วใช้ comparison_to_7day_avg ในคำตอบ อย่าตอบแค่ค่าล่าสุดเฉย ๆ"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "จำนวนวันย้อนหลัง (1-30)", "default": 7},
                "limit": {"type": "integer", "description": "จำนวน readings สูงสุดที่ส่งกลับ", "default": 10},
            },
        },
    },
    {
        "name": "get_metabolic_trend",
        "description": (
            "วิเคราะห์แนวโน้ม acetone ของผู้ใช้ (เพิ่ม/ลด/คงที่) ในช่วง N วัน "
            "พร้อม slope และ confidence ใช้เมื่อผู้ใช้ถามเรื่องแนวโน้มระยะปานกลาง"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "หน้าต่างวิเคราะห์ (3-30)", "default": 7},
            },
        },
    },
    {
        "name": "get_recent_logs",
        "description": (
            "ดึงบันทึกล่าสุด: มื้ออาหาร, กิจกรรม, น้ำหนัก, ketone (blood/urine) "
            "ย้อนหลัง N วัน ใช้เมื่อผู้ใช้ถามเชิงพฤติกรรม เช่น 'ทำไมค่าถึงขึ้น' "
            "หรือจะเชื่อมโยงอาหาร/ออกกำลังกายกับผลลม"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "จำนวนวันย้อนหลัง (1-30)", "default": 7},
            },
        },
    },
    {
        "name": "explain_reading",
        "description": (
            "แปลค่า acetone หนึ่งค่า (ppm) เป็นสถานะทางเมตาบอลิก + คำแนะนำเบื้องต้น "
            "ใช้เมื่อผู้ใช้ยกตัวเลขค่าใดค่าหนึ่งขึ้นมาถาม (ไม่ต้องดึงจากประวัติ)"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "acetone_ppm": {"type": "number", "description": "ค่า acetone delta (ppm)"},
                "context": {
                    "type": "string",
                    "description": "บริบทที่วัด (ถ้ามี)",
                    "enum": ["fasting", "post_meal", "post_exercise", "morning", "evening"],
                },
            },
            "required": ["acetone_ppm"],
        },
    },
]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _age_from_dob(dob) -> Optional[int]:
    if not dob:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _bmi(weight_kg: Optional[float], height_cm: Optional[float]) -> Optional[float]:
    if not weight_kg or not height_cm:
        return None
    h_m = height_cm / 100.0
    return round(weight_kg / (h_m * h_m), 1)


async def _pick_device_id(
    db: AsyncSession, user: User, requested: Optional[UUID]
) -> Optional[UUID]:
    """Prefer requested device (if owned by user); else user's active device."""
    if requested:
        res = await db.exec(
            select(Device).where(Device.id == requested, Device.user_id == user.id)
        )
        if res.first():
            return requested
    res = await db.exec(
        select(Device).where(Device.user_id == user.id, Device.active == True)  # noqa: E712
    )
    dev = res.first()
    return dev.id if dev else None


# ─── Tool implementations ────────────────────────────────────────────────────

async def tool_get_user_profile(db: AsyncSession, user: User) -> dict:
    res = await db.exec(select(Profile).where(Profile.user_id == user.id))
    profile = res.first()
    if not profile:
        return {"error": "ยังไม่มีโปรไฟล์ (ผู้ใช้ยังไม่ผ่านขั้น onboarding)"}
    return {
        "display_name": profile.display_name,
        "sex": profile.sex,
        "age": _age_from_dob(profile.dob),
        "height_cm": profile.height_cm,
        "weight_kg": profile.weight_kg,
        "bmi": _bmi(profile.weight_kg, profile.height_cm),
        "goal_type": profile.goal_type,
        "onboarded": profile.onboarded_at is not None,
    }


async def tool_get_recent_readings(
    db: AsyncSession, user: User, device_id: Optional[UUID],
    days: int = 7, limit: int = 10,
) -> dict:
    days = max(1, min(days, 90))
    limit = max(1, min(limit, 50))
    dev = await _pick_device_id(db, user, device_id)
    since = datetime.utcnow() - timedelta(days=days)

    # Always scope by user_id (attribution). Filter by device_id ONLY if we
    # have one — this way historical readings surface even if the user's
    # device is currently disconnected or the shared-device session lapsed.
    stmt = (
        select(SensorReading)
        .where(
            SensorReading.user_id == user.id,
            SensorReading.time >= since,
        )
        .order_by(SensorReading.time.desc())
    )
    if dev:
        stmt = stmt.where(SensorReading.device_id == dev)

    res = await db.exec(stmt)
    rows = res.all()[:limit]

    readings_out = [
        {
            "time": r.time.isoformat() if r.time else None,
            "acetone_ppm": round(r.acetone_delta / MV_PER_PPM, 2) if r.acetone_delta is not None else None,
            "label": r.label,
            "confidence": r.confidence_score,
            "quality_score": r.quality_score,
        }
        for r in rows
    ]

    # Separate, always-7-day window for the comparison baseline — regardless
    # of whatever `days` was requested, so "last few tests vs. the past
    # week" stays a stable reference frame instead of shifting with it.
    since_7d = datetime.utcnow() - timedelta(days=7)
    week_stmt = (
        select(SensorReading.acetone_delta)
        .where(
            SensorReading.user_id == user.id,
            SensorReading.time >= since_7d,
            SensorReading.acetone_delta.is_not(None),
        )
    )
    if dev:
        week_stmt = week_stmt.where(SensorReading.device_id == dev)
    week_res = await db.exec(week_stmt)
    week_ppm_values = [v / MV_PER_PPM for v in week_res.all()]

    last_3 = readings_out[:3]
    comparison = None
    last_3_ppm = [r["acetone_ppm"] for r in last_3 if r["acetone_ppm"] is not None]
    if last_3_ppm and week_ppm_values:
        avg_last_3 = round(sum(last_3_ppm) / len(last_3_ppm), 2)
        avg_7day = round(sum(week_ppm_values) / len(week_ppm_values), 2)
        pct_change = round((avg_last_3 - avg_7day) / avg_7day * 100, 1) if avg_7day else None
        comparison = {
            "avg_last_3_tests_ppm": avg_last_3,
            "avg_7day_ppm": avg_7day,
            "n_readings_7day": len(week_ppm_values),
            "pct_change_vs_7day_avg": pct_change,
        }

    return {
        "device_id": str(dev) if dev else None,
        "device_currently_connected": dev is not None,
        "n_readings": len(rows),
        "window_days": days,
        "readings": readings_out,
        "last_3_tests": last_3,
        "comparison_to_7day_avg": comparison,
    }


async def tool_get_metabolic_trend(
    db: AsyncSession, user: User, device_id: Optional[UUID], days: int = 7,
) -> dict:
    days = max(3, min(days, 90))
    dev = await _pick_device_id(db, user, device_id)
    since = datetime.utcnow() - timedelta(days=days)

    stmt = (
        select(SensorReading)
        .where(
            SensorReading.user_id == user.id,
            SensorReading.time >= since,
        )
        .order_by(SensorReading.time)
    )
    if dev:
        stmt = stmt.where(SensorReading.device_id == dev)

    res = await db.exec(stmt)
    readings = res.all()
    dicts = [
        {"time": r.time, "acetone_delta": r.acetone_delta}
        for r in readings
        if r.acetone_delta is not None
    ]
    trend = ml_inference.predict_trend(dicts, horizon_days=days)
    return {
        "device_id": str(dev) if dev else None,
        "device_currently_connected": dev is not None,
        "window_days": days,
        "n_readings_used": len(dicts),
        "trend_direction": trend.get("trend_direction"),
        "slope_ppm_per_day": trend.get("slope_ppm_per_day"),
        "confidence": trend.get("confidence"),
    }


async def tool_get_recent_logs(
    db: AsyncSession, user: User, days: int = 7,
) -> dict:
    days = max(1, min(days, 30))
    since = datetime.utcnow() - timedelta(days=days)

    meals_res = await db.exec(
        select(MealLog).where(MealLog.user_id == user.id, MealLog.ts >= since).order_by(MealLog.ts.desc())
    )
    acts_res = await db.exec(
        select(ActivityLog).where(ActivityLog.user_id == user.id, ActivityLog.ts >= since).order_by(ActivityLog.ts.desc())
    )
    weights_res = await db.exec(
        select(WeightLog).where(WeightLog.user_id == user.id, WeightLog.ts >= since).order_by(WeightLog.ts.desc())
    )
    ketones_res = await db.exec(
        select(KetoneLog).where(KetoneLog.user_id == user.id, KetoneLog.ts >= since).order_by(KetoneLog.ts.desc())
    )

    meals = meals_res.all()[:15]
    acts = acts_res.all()[:15]
    weights = weights_res.all()[:10]
    ketones = ketones_res.all()[:15]

    return {
        "window_days": days,
        "meals": [
            {"ts": m.ts.isoformat(), "name": m.name, "kcal": m.kcal, "carbs_g": m.carbs_g}
            for m in meals
        ],
        "activities": [
            {"ts": a.ts.isoformat(), "kind": a.kind, "duration_min": a.duration_min, "kcal": a.kcal}
            for a in acts
        ],
        "weights": [{"ts": w.ts.isoformat(), "kg": w.kg} for w in weights],
        "ketones": [
            {"ts": k.ts.isoformat(), "value_mmol": k.value_mmol, "type": k.ketone_type}
            for k in ketones
        ],
    }


def tool_explain_reading(acetone_ppm: float, context: Optional[str] = None) -> dict:
    ppm = float(acetone_ppm)
    if ppm < 1.0:
        state = "healthy"
        note = "ค่าอยู่ในช่วงปกติ ร่างกายกำลังใช้กลูโคสเป็นพลังงานหลัก"
    elif ppm < 5.0:
        state = "fat_burning"
        note = "ร่างกายเริ่มเผาไขมัน (fat burning) เหมาะกับ IF/คีโตช่วงเริ่มต้น"
    elif ppm < 40.0:
        state = "ketosis"
        note = "อยู่ในภาวะ ketosis กำลังใช้คีโตนเป็นพลังงาน"
    elif ppm < 75.0:
        state = "deep_ketosis"
        note = "คีโตนสูง — ถ้าตั้งใจทำคีโตควรระวังการขาดน้ำ/อิเล็กโทรไลต์"
    else:
        state = "elevated"
        note = "ค่าสูงมาก ควรปรึกษาแพทย์เพื่อความปลอดภัย"

    context_note = ""
    if context == "post_meal":
        context_note = " (วัดหลังอาหาร — ค่าอาจต่างจาก fasting)"
    elif context == "post_exercise":
        context_note = " (วัดหลังออกกำลังกาย — เผาไขมันชั่วคราวเพิ่มขึ้น)"
    elif context == "fasting":
        context_note = " (วัดตอน fasting — ค่าจะสะท้อนสถานะเมตาบอลิกพื้นฐานที่สุด)"

    return {
        "acetone_ppm": ppm,
        "state": state,
        "note": note + context_note,
        "reference_ranges_ppm": {
            "healthy": "0.3–0.9",
            "fat_burning": "1–5",
            "ketosis": "5–40",
            "elevated": ">75",
        },
    }


async def tool_log_meal(
    db: AsyncSession, user: User,
    name: str, kcal: Optional[float] = None, carbs_g: Optional[float] = None,
) -> dict:
    log = MealLog(user_id=user.id, name=name.strip()[:200], kcal=kcal, carbs_g=carbs_g)
    db.add(log)
    await db.commit()
    return {"ok": True, "id": str(log.id), "name": log.name, "ts": log.ts.isoformat()}


async def tool_log_activity(
    db: AsyncSession, user: User,
    kind: str, duration_min: int, kcal: Optional[float] = None,
) -> dict:
    log = ActivityLog(
        user_id=user.id,
        kind=kind.strip()[:50],
        duration_min=int(duration_min),
        kcal=kcal,
    )
    db.add(log)
    await db.commit()
    return {"ok": True, "id": str(log.id), "kind": log.kind, "duration_min": log.duration_min}


async def tool_calibrate_device(
    db: AsyncSession, user: User, device_id: Optional[UUID],
    baseline_voc: float,
    temp_c: Optional[float] = None,
    humidity_pct: Optional[float] = None,
) -> dict:
    dev = await _pick_device_id(db, user, device_id)
    if not dev:
        return {"error": "ไม่พบอุปกรณ์ของผู้ใช้"}
    cal = DeviceCalibration(
        device_id=dev,
        baseline_voc=float(baseline_voc),
        baseline_temp=temp_c,
        baseline_humidity=humidity_pct,
        method="mcp_chat",
        notes="calibrated via MetaBreath chat",
    )
    db.add(cal)
    # Also clear the needs_recalibration flag on the device
    dev_res = await db.exec(select(Device).where(Device.id == dev))
    device = dev_res.first()
    if device:
        device.needs_recalibration = False
        device.last_calibrated_at = datetime.utcnow()
        db.add(device)
    await db.commit()
    return {
        "ok": True,
        "device_id": str(dev),
        "baseline_voc": baseline_voc,
        "calibrated_at": cal.calibrated_at.isoformat(),
    }


# ─── Dispatcher ──────────────────────────────────────────────────────────────

async def run_tool(
    name: str,
    arguments: dict,
    *,
    db: AsyncSession,
    user: User,
    device_id: Optional[UUID],
) -> str:
    """Run a tool by name. Returns JSON string (tool_result content)."""
    try:
        if name == "get_user_profile":
            result = await tool_get_user_profile(db, user)
        elif name == "get_recent_readings":
            result = await tool_get_recent_readings(
                db, user, device_id,
                days=int(arguments.get("days", 7)),
                limit=int(arguments.get("limit", 10)),
            )
        elif name == "get_metabolic_trend":
            result = await tool_get_metabolic_trend(
                db, user, device_id,
                days=int(arguments.get("days", 7)),
            )
        elif name == "get_recent_logs":
            result = await tool_get_recent_logs(
                db, user, days=int(arguments.get("days", 7))
            )
        elif name == "explain_reading":
            result = tool_explain_reading(
                acetone_ppm=arguments["acetone_ppm"],
                context=arguments.get("context"),
            )
        else:
            result = {"error": f"unknown tool: {name}"}
    except Exception as e:
        result = {"error": f"tool {name} failed: {e}"}

    return json.dumps(result, ensure_ascii=False, default=str)
