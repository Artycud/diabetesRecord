"""
MetaBreath MCP server (FastMCP).

Exposes:
  - Tools (8): get_user_profile, get_recent_readings, get_metabolic_trend,
               get_recent_logs, explain_reading, log_meal, log_activity, calibrate_device
  - Resources (3): acetone_ranges, sensor_datasheet, personal_report
  - Prompts (3): daily_coaching, summary_today, analyze_metabolic

Consumed by:
  - Internal /ai/chat (in-process MCP client) — see routers/ai.py
  - External Claude Desktop / IDE via mounted /mcp HTTP endpoint — see main.py
"""
import json
from typing import Optional

from mcp.server.fastmcp import FastMCP
from sqlmodel import select

from app.mcp_context import get_db, get_user_id, get_device_id
from app.models.user import User
from app.services import chat_tools


mcp = FastMCP("metabreath")


async def _current_user() -> User:
    db = get_db()
    uid = get_user_id()
    res = await db.exec(select(User).where(User.id == uid))
    user = res.first()
    if not user:
        raise RuntimeError(f"user {uid} not found in DB")
    return user


# ─── Tools ────────────────────────────────────────────────────────────────────

@mcp.tool()
async def get_user_profile() -> dict:
    """ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน: ชื่อ, เพศ, อายุ, ส่วนสูง, น้ำหนัก, BMI, เป้าหมาย."""
    return await chat_tools.tool_get_user_profile(get_db(), await _current_user())


@mcp.tool()
async def get_recent_readings(days: int = 30, limit: int = 10) -> dict:
    """ดึงค่า sensor ลมหายใจของผู้ใช้ (acetone_delta, label, confidence, quality) ย้อนหลัง N วัน (1-90).

    หา readings ทั้งหมดของ user (ผูกด้วย user_id) — ทำงานได้แม้อุปกรณ์ไม่ได้เชื่อมอยู่ตอนนี้.
    ควรเรียก tool นี้ก่อนพูดว่า 'ไม่มีข้อมูล' เสมอ. ค่า default 30 วันเพื่อเห็น history."""
    return await chat_tools.tool_get_recent_readings(
        get_db(), await _current_user(), get_device_id(), days=days, limit=limit,
    )


@mcp.tool()
async def get_metabolic_trend(days: int = 14) -> dict:
    """วิเคราะห์แนวโน้ม acetone (เพิ่ม/ลด/คงที่) ในช่วง N วัน (3-90) พร้อม slope + confidence.

    ทำงานได้แม้อุปกรณ์ไม่ได้เชื่อมอยู่ตอนนี้ (ใช้ readings ทั้งหมดของ user)."""
    return await chat_tools.tool_get_metabolic_trend(
        get_db(), await _current_user(), get_device_id(), days=days,
    )


@mcp.tool()
async def get_recent_logs(days: int = 30) -> dict:
    """ดึงบันทึกล่าสุด: มื้ออาหาร, กิจกรรม, น้ำหนัก, ketone ย้อนหลัง N วัน (1-30)."""
    return await chat_tools.tool_get_recent_logs(get_db(), await _current_user(), days=days)


@mcp.tool()
def explain_reading(acetone_ppm: float, context: Optional[str] = None) -> dict:
    """แปลค่า acetone หนึ่งค่า (ppm) เป็นสถานะทางเมตาบอลิก + คำแนะนำเบื้องต้น.

    context: fasting | post_meal | post_exercise | morning | evening
    """
    return chat_tools.tool_explain_reading(acetone_ppm=acetone_ppm, context=context)


@mcp.tool()
async def log_meal(name: str, kcal: Optional[float] = None, carbs_g: Optional[float] = None) -> dict:
    """บันทึกมื้ออาหารของผู้ใช้ปัจจุบัน."""
    return await chat_tools.tool_log_meal(
        get_db(), await _current_user(), name=name, kcal=kcal, carbs_g=carbs_g,
    )


@mcp.tool()
async def log_activity(kind: str, duration_min: int, kcal: Optional[float] = None) -> dict:
    """บันทึกกิจกรรมการออกกำลังกาย (walk / run / cycle / gym / yoga)."""
    return await chat_tools.tool_log_activity(
        get_db(), await _current_user(), kind=kind, duration_min=duration_min, kcal=kcal,
    )


@mcp.tool()
async def calibrate_device(
    baseline_voc: float,
    temp_c: Optional[float] = None,
    humidity_pct: Optional[float] = None,
) -> dict:
    """Calibrate อุปกรณ์ MetaBreath ด้วยค่า ambient VOC baseline ปัจจุบัน (ppm)."""
    return await chat_tools.tool_calibrate_device(
        get_db(), await _current_user(), get_device_id(),
        baseline_voc=baseline_voc, temp_c=temp_c, humidity_pct=humidity_pct,
    )


# ─── Resources ────────────────────────────────────────────────────────────────

@mcp.resource("metabreath://reference/acetone-ranges")
def acetone_ranges() -> str:
    """ค่าอ้างอิง breath acetone (ppm) แยกตามสถานะเมตาบอลิก."""
    return json.dumps({
        "measurement": "acetone_delta = breath_voc - ambient_voc",
        "unit": "ppm",
        "ranges": [
            {"label": "healthy",     "min": 0.3, "max": 0.9,  "meaning": "ปกติ ใช้กลูโคสเป็นหลัก"},
            {"label": "fat_burning", "min": 1.0, "max": 5.0,  "meaning": "เริ่มเผาไขมัน"},
            {"label": "ketosis",     "min": 5.0, "max": 40.0, "meaning": "อยู่ในภาวะ ketosis"},
            {"label": "deep_ketosis","min": 40.0,"max": 75.0, "meaning": "ketosis ลึก ระวังขาดน้ำ/อิเล็กโทรไลต์"},
            {"label": "elevated",    "min": 75.0,"max": None, "meaning": "สูงมาก ควรพบแพทย์"},
        ],
    }, ensure_ascii=False, indent=2)


@mcp.resource("metabreath://reference/tgs1820-datasheet")
def tgs1820_datasheet() -> str:
    """สเปคของเซ็นเซอร์ TGS1820 (VOC/acetone) ที่ใช้ในอุปกรณ์ MetaBreath."""
    return json.dumps({
        "sensor": "TGS1820",
        "manufacturer": "Figaro Engineering",
        "target_gas": "Acetone / VOC",
        "cross_sensitivity": {"Ethanol": "~30%", "Hydrogen": "~15%", "CO": "<5%"},
        "operating_temp_c": [20, 60],
        "operating_humidity_pct": [10, 95],
        "drift_baseline_ppm_per_month": [0.2, 0.5],
        "recalibration_recommended": "monthly",
        "lod_typical_ppm": 0.01,
    }, ensure_ascii=False, indent=2)


@mcp.resource("metabreath://user/personal-snapshot")
async def personal_snapshot() -> str:
    """Snapshot ปัจจุบันของผู้ใช้: profile + latest reading + recent logs summary."""
    db = get_db()
    user = await _current_user()
    profile = await chat_tools.tool_get_user_profile(db, user)
    readings = await chat_tools.tool_get_recent_readings(
        db, user, get_device_id(), days=7, limit=1
    )
    logs = await chat_tools.tool_get_recent_logs(db, user, days=7)
    return json.dumps(
        {
            "profile": profile,
            "latest_reading": (readings.get("readings") or [None])[0],
            "logs_last_7d_summary": {
                "meals": len(logs.get("meals", [])),
                "activities": len(logs.get("activities", [])),
                "weights": len(logs.get("weights", [])),
                "ketones": len(logs.get("ketones", [])),
            },
        },
        ensure_ascii=False, indent=2, default=str,
    )


# ─── Prompts ──────────────────────────────────────────────────────────────────

@mcp.prompt(description="สรุปข้อมูลสุขภาพของฉันวันนี้ (โปรไฟล์ + ค่าล่าสุด + บันทึก)")
def summary_today() -> str:
    return (
        "ช่วยสรุปข้อมูลสุขภาพของฉันวันนี้ให้หน่อย — โปรไฟล์เบื้องต้น, "
        "ค่าลมหายใจล่าสุด, บันทึกกิจกรรม/อาหารในช่วง 7 วันที่ผ่านมา และคำแนะนำ 1–2 ข้อ"
    )


@mcp.prompt(description="ข้อความโค้ชประจำวันตามเป้าหมาย")
def daily_coaching() -> str:
    return (
        "ให้ข้อความโค้ชสั้น ๆ สำหรับวันนี้ ตามเป้าหมายของฉัน "
        "(ดูจาก get_user_profile) พร้อมกิจกรรมที่ทำได้เลย 1 อย่าง"
    )


@mcp.prompt(description="วิเคราะห์สถานะเมตาบอลิกจากข้อมูลล่าสุด")
def analyze_metabolic() -> str:
    return (
        "วิเคราะห์สถานะเมตาบอลิกของฉันจากข้อมูล 14 วันล่าสุด — "
        "ค่าเฉลี่ย, แนวโน้ม, ความสม่ำเสมอ, และคำแนะนำ 2–3 ข้อ"
    )
