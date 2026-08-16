"""One-shot AI reading interpretation — extracted from POST /ai/interpret so
it can be reused by both the self-serve route (ai.py) and the doctor route
(doctor.py) against an arbitrary already-authorized target user.
"""
import os
import logging
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from app.models.user import User
from app.models.health import SensorReading
from app.services import ml_inference, llm_guardrail, chat_tools, ai_fallback
from app.services import baseline

logger = logging.getLogger(__name__)

# Explicit retry budget for the Anthropic client, applied at every call site
# in ai.py — the SDK default already retries transient errors (connection
# issues, 429, 5xx) with backoff, but a multi-round tool-calling turn can
# make several sequential calls per request, so a little extra headroom here
# meaningfully improves survival of a transient rate-limit/overload blip
# instead of falling straight through to the canned apology text.
ANTHROPIC_MAX_RETRIES = 3


class InterpretResponse(BaseModel):
    text: str
    refusal: bool
    based_on: dict


async def build_interpretation(
    db: AsyncSession,
    target_user: User,
    device_id: UUID,
    time: Optional[datetime] = None,
) -> InterpretResponse:
    """Generate a SHORT (1-3 sentence) natural-language interpretation of one
    reading (or target_user's latest, if `time` is omitted) — a one-shot
    blurb, not a multi-turn chat. Compares against the personal baseline when
    available, falling back to the fixed Anderson thresholds otherwise. Goes
    through the same llm_guardrail sanitisation as /ai/chat — this is still a
    health-adjacent AI output. `target_user` must already be authorized by
    the caller (get_current_user for self, get_assigned_patient for a
    doctor) — this function does no authorization of its own.
    """
    reading_stmt = select(SensorReading).where(
        SensorReading.device_id == device_id,
        SensorReading.user_id == target_user.id,
    )
    if time:
        reading_stmt = reading_stmt.where(SensorReading.time == time)
    reading_stmt = reading_stmt.order_by(SensorReading.time.desc())
    reading_result = await db.exec(reading_stmt)
    reading = reading_result.first()

    if not reading or reading.acetone_delta is None:
        text = (
            "ยังไม่มีข้อมูลการวัดให้ตีความ ลองเป่าเครื่องมือแล้วบันทึกผลก่อน "
            "แล้วค่อยกลับมาดูสรุปนี้อีกครั้ง"
        )
        return InterpretResponse(
            text=llm_guardrail.sanitise_response(text, lang="th"),
            refusal=False,
            based_on={"reading_found": False},
        )

    # Personal baseline (last 30 days, across all of target_user's devices —
    # reuses the exact same computation as GET /sensor/baseline).
    since = datetime.utcnow() - timedelta(days=baseline.BASELINE_WINDOW_DAYS)
    baseline_stmt = select(SensorReading.acetone_delta).where(
        SensorReading.user_id == target_user.id,
        SensorReading.time >= since,
        SensorReading.acetone_delta.is_not(None),
    )
    baseline_result = await db.exec(baseline_stmt)
    baseline_values = [float(v) for v in baseline_result.all()]
    personal_baseline = baseline.compute_personal_baseline(baseline_values)
    comparison = baseline.compare_to_baseline(reading.acetone_delta, personal_baseline)

    # Reuse the existing chat context-gathering tool for recent-trend framing
    # ("comparison_to_7day_avg") instead of re-deriving it.
    recent_ctx = await chat_tools.tool_get_recent_readings(
        db, target_user, device_id, days=7, limit=5,
    )

    acetone_ppm = round(reading.acetone_delta / chat_tools.MV_PER_PPM, 2)
    label = reading.label or ml_inference._anderson_label(acetone_ppm)

    based_on = {
        "reading_found": True,
        "reading_time": reading.time.isoformat() if reading.time else None,
        "acetone_ppm": acetone_ppm,
        "label": label,
        "confidence_score": reading.confidence_score,
        "personal_baseline": personal_baseline,
        "comparison_to_baseline": comparison,
        "comparison_to_7day_avg": recent_ctx.get("comparison_to_7day_avg"),
    }

    facts_th = (
        f"ค่าที่วัดได้: {acetone_ppm} ppm (label: {label}). "
        + (
            f"baseline ปกติของผู้ใช้คนนี้ (trimmed mean {baseline.BASELINE_WINDOW_DAYS} วันล่าสุด) "
            f"อยู่ที่ {personal_baseline['baseline_mean_ppm']} ppm "
            f"(ช่วง {personal_baseline['baseline_range_ppm'][0]}-{personal_baseline['baseline_range_ppm'][1]} ppm), "
            f"ค่านี้ {comparison['direction'] if comparison else 'n/a'} "
            f"({comparison['pct_change_vs_baseline'] if comparison else 'n/a'}% เทียบ baseline). "
            if not personal_baseline["insufficient_data"] and comparison
            else "ยังไม่มี baseline ส่วนตัว (ข้อมูลน้อยกว่า "
                 f"{baseline.MIN_SAMPLES_FOR_BASELINE} ครั้ง) — เทียบกับช่วง Anderson มาตรฐานแทน. "
        )
    )

    api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
    model = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

    system_prompt = llm_guardrail.build_system_prompt({
        "display_name": target_user.username,
        "task": "one_shot_reading_interpretation",
    })
    # Kept deliberately terse (1-2 sentences, single point, single reason) —
    # this renders in a compact card (AiInterpretCard), not a chat bubble, so
    # length/filler that would be fine in /ai/chat reads as bloated here.
    user_msg = (
        "สรุปค่านี้ให้ผู้ใช้แบบสั้นกระชับที่สุดใน 1-2 ประโยค เข้าประเด็นทันที "
        "ไม่ต้องมีคำนำหรือคำเชื่อมที่ไม่จำเป็น พูดใจความสำคัญที่สุดอย่างเดียว "
        "(ค่าตอนนี้เทียบ baseline เป็นยังไง) ถ้าจะให้เหตุผลประกอบ ให้เลือกเหตุผลเดียว "
        "ที่เป็นไปได้มากที่สุด อย่าเดาหลายทาง แน่นด้วยข้อมูลจริง ไม่ใช่คำพูดกว้าง ๆ ที่ไม่มีสาระ "
        "ห้ามใช้เครื่องหมาย — (em dash) ให้ขึ้นประโยคใหม่หรือใช้คอมม่าแทน "
        "ภาษาไทย น้ำเสียงเหมือนผู้ช่วยส่วนตัวที่เก่งเรื่องสุขภาพ มั่นใจตรงประเด็น สุภาพพอดี ๆ "
        "ไม่ใช่พนักงานบริการลูกค้าและไม่ใช่หุ่นยนต์ห้วน ๆ ห้ามลงท้ายด้วยค่ะ/ครับ/นะคะ/นะครับเด็ดขาด "
        "ห้ามวินิจฉัยโรค ห้ามแนะนำยา ห้ามใช้ emoji ห้ามใส่ disclaimer ท้ายข้อความ "
        "(ระบบจะจัดการ disclaimer เอง). ข้อมูล:\n" + facts_th
    )

    raw_reply: Optional[str] = None
    if api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key, max_retries=ANTHROPIC_MAX_RETRIES)
            response = client.messages.create(
                model=model,
                max_tokens=200,
                system=system_prompt,
                messages=[{"role": "user", "content": user_msg}],
            )
            texts = [getattr(b, "text", "") for b in response.content
                     if getattr(b, "type", None) == "text"]
            raw_reply = "\n".join(t for t in texts if t).strip() or None
        except Exception:
            logger.exception("interpret_service.build_interpretation: primary Claude call failed")
            raw_reply = None

    if not raw_reply:
        # Primary (Claude) unavailable or failed — try the admin-configured
        # global OpenAI/Gemini fallback before the canned deterministic
        # template below (see app/services/ai_fallback.py).
        raw_reply = await ai_fallback.try_global_fallback(db, system_prompt, user_msg)

    if not raw_reply:
        raw_reply = facts_th

    safe_reply = llm_guardrail.sanitise_response(raw_reply, lang="th")

    return InterpretResponse(text=safe_reply, refusal=False, based_on=based_on)
