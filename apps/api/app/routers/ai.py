import os
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import Optional, List, AsyncGenerator
from uuid import UUID
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User, Profile
from app.models.health import Device, DeviceCalibration, SensorReading
from app.services import ml_inference, llm_guardrail, flexibility_engine, chat_tools
from app.mcp_context import mcp_scope
from app.mcp_server import mcp as mcp_server

router = APIRouter(prefix="/ai", tags=["ai"])


class PredictRequest(BaseModel):
    device_id: UUID
    acetone_delta: Optional[float] = None
    quality_score: Optional[float] = None
    reliability_score: Optional[float] = None
    breath_duration: Optional[float] = None
    slope: Optional[float] = None
    time_to_peak: Optional[float] = None
    recovery_rate: Optional[float] = None
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None


class PredictResponse(BaseModel):
    label: Optional[str]
    metabolic_risk_index: Optional[int]
    confidence_score: float
    model_used: str
    recalibration_needed: bool
    acetone_delta: Optional[float]


class TrendResponse(BaseModel):
    device_id: UUID
    trend_direction: str
    slope_ppm_per_day: Optional[float]
    predicted_points: List[dict]
    confidence: float
    n_readings_used: int


class LstmPredictRequest(BaseModel):
    device_id: UUID
    # Optional: caller can supply the sequence explicitly (else last-5 from DB)
    sequence: Optional[List[dict]] = None


class LstmPredictResponse(BaseModel):
    label: Optional[str]
    metabolic_risk_index: Optional[int]
    confidence_score: float
    model_used: str
    recalibration_needed: bool
    sequence_length: int
    fallback_reason: Optional[str] = None


class TrendClassifyRequest(BaseModel):
    device_id: UUID
    # Optional: caller can supply the session sequence explicitly
    # (else last-N session-level readings are built from DB)
    sequence: Optional[List[dict]] = None
    sessions: int = 14   # how many recent sessions to consider


class TrendClassifyResponse(BaseModel):
    device_id: UUID
    trend: Optional[str]
    confidence: float
    probabilities: dict
    sequence_length: int
    min_required: int
    model_used: str
    fallback_reason: Optional[str] = None


class DriftResponse(BaseModel):
    device_id: UUID
    drift_detected: bool
    severity: str
    confidence: float
    recommendation: str
    drift_pct: Optional[float]
    baseline_voc: Optional[float] = None
    latest_voc: Optional[float] = None
    n_calibrations_used: int


class ChatRequest(BaseModel):
    message: str
    device_id: Optional[UUID] = None


class ChatResponse(BaseModel):
    reply: str
    refusal: bool
    disclaimer_appended: bool


class PromptInfo(BaseModel):
    name: str
    title: Optional[str]
    description: Optional[str]
    text: str


class PromptsResponse(BaseModel):
    prompts: List[PromptInfo]


class FlexibilityRequest(BaseModel):
    device_id: UUID
    context_tag: Optional[str] = None   # fasting | post_meal | post_exercise | evening
    fasting_hours: Optional[float] = None
    days: int = 14


class FlexibilityBreakdown(BaseModel):
    amplitude: float
    return_speed: float
    appropriateness: float


class FlexibilityResponse(BaseModel):
    score: int
    zone: str
    breakdown: FlexibilityBreakdown
    trend: str
    n_sessions: int
    message_th: str
    context_tag: Optional[str] = None


# ─── POST /ai/predict ─────────────────────────────────────────────────────────

@router.post("/predict", response_model=PredictResponse)
async def predict(
    body: PredictRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_result = await db.exec(
        select(Device).where(Device.id == body.device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    features = body.model_dump(exclude={"device_id"})
    result = ml_inference.predict_risk(features)

    return PredictResponse(
        label=result["label"],
        metabolic_risk_index=result.get("metabolic_risk_index"),
        confidence_score=result["confidence_score"],
        model_used=result["model_used"],
        recalibration_needed=result.get("recalibration_needed", False),
        acetone_delta=body.acetone_delta,
    )


# ─── GET /ai/trend ────────────────────────────────────────────────────────────

@router.get("/trend", response_model=TrendResponse)
async def get_trend(
    device_id: UUID = Query(...),
    days: int = Query(default=7, ge=3, le=30),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # History is user-scoped: filter by user_id so users can see their own trend
    # even from shared devices they no longer hold an active claim on.
    since = datetime.utcnow() - timedelta(days=days)
    readings_result = await db.exec(
        select(SensorReading)
        .where(
            SensorReading.device_id == device_id,
            SensorReading.user_id == user.id,
            SensorReading.time >= since,
        )
        .order_by(SensorReading.time)
    )
    readings = readings_result.all()

    readings_dicts = [
        {"time": r.time, "acetone_delta": r.acetone_delta}
        for r in readings
        if r.acetone_delta is not None
    ]

    trend = ml_inference.predict_trend(readings_dicts, horizon_days=days)

    return TrendResponse(
        device_id=device_id,
        trend_direction=trend["trend_direction"],
        slope_ppm_per_day=trend["slope_ppm_per_day"],
        predicted_points=trend["predicted_points"],
        confidence=trend["confidence"],
        n_readings_used=len(readings_dicts),
    )


# ─── GET /ai/prompts (list MCP prompts for UI slash menu) ────────────────────

@router.get("/prompts", response_model=PromptsResponse)
async def list_prompts(user: User = Depends(get_current_user)):
    """Return prompts registered on the MCP server so the UI can show a slash
    command menu. Text is pulled from each prompt's default rendering."""
    prompts_meta = await mcp_server.list_prompts()
    out: List[PromptInfo] = []
    for p in prompts_meta:
        try:
            got = await mcp_server.get_prompt(p.name, {})
            # get_prompt returns GetPromptResult with .messages
            text = ""
            for m in getattr(got, "messages", []) or []:
                content = getattr(m, "content", None)
                if content is None:
                    continue
                text += getattr(content, "text", "") or ""
        except Exception:
            text = ""
        out.append(PromptInfo(
            name=p.name,
            title=getattr(p, "title", None) or p.name,
            description=p.description,
            text=text.strip(),
        ))
    return PromptsResponse(prompts=out)


# ─── POST /ai/chat ────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    should_refuse, _reason = llm_guardrail.is_refusal_needed(body.message)
    if should_refuse:
        return ChatResponse(
            reply=llm_guardrail.build_refusal_response(lang="th"),
            refusal=True,
            disclaimer_appended=True,
        )

    # Seed system prompt with a snapshot of the user's profile so the model
    # knows who it's talking to before it decides to call any tools.
    profile_res = await db.exec(select(Profile).where(Profile.user_id == user.id))
    profile = profile_res.first()
    goal_th_map = {
        "monitor": "ติดตามสุขภาพ",
        "keto": "คีโต (Keto)",
        "fasting": "intermittent fasting",
        "exercise": "ออกกำลังกาย",
    }
    goal_type = profile.goal_type if profile else None
    user_context = {
        "display_name": profile.display_name if profile else user.username,
        "sex": profile.sex if profile else None,
        "goal_type": goal_type,
        "goal_th": goal_th_map.get(goal_type or "", goal_type),
        "onboarded": bool(profile and profile.onboarded_at),
        "has_default_device_hint": body.device_id is not None,
    }
    system_prompt = llm_guardrail.build_system_prompt(user_context)

    api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
    model = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
    if not api_key:
        return ChatResponse(
            reply="ขอโทษนะคะ — MetaBreath ยังไม่พร้อมใช้งานในตอนนี้ (ไม่มี API key) รบกวนลองใหม่ภายหลังค่ะ"
                  + llm_guardrail.DISCLAIMER_TH,
            refusal=False,
            disclaimer_appended=True,
        )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        # All MCP tool calls happen inside this scope — tools read user + db
        # via contextvars set here.
        async with mcp_scope(user.id, device_id=body.device_id):
            # Discover tools from the MCP server (real protocol call).
            mcp_tools = await mcp_server.list_tools()
            anth_tools = [
                {
                    "name": t.name,
                    "description": t.description or "",
                    "input_schema": t.inputSchema,
                }
                for t in mcp_tools
            ]

            messages: list[dict] = [{"role": "user", "content": body.message}]
            raw_reply: Optional[str] = None

            for _ in range(6):
                response = client.messages.create(
                    model=model,
                    max_tokens=1024,
                    system=system_prompt,
                    tools=anth_tools,
                    messages=messages,
                )

                if response.stop_reason == "tool_use":
                    messages.append({"role": "assistant", "content": response.content})

                    tool_results = []
                    for block in response.content:
                        if getattr(block, "type", None) != "tool_use":
                            continue
                        try:
                            mcp_result = await mcp_server.call_tool(
                                block.name, block.input or {}
                            )
                            # MCP returns Sequence[Content] — text-flatten it.
                            text_out = "\n".join(
                                getattr(part, "text", str(part)) for part in mcp_result
                            )
                        except Exception as e:
                            text_out = f'{{"error": "tool {block.name} failed: {e}"}}'
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": text_out,
                        })
                    messages.append({"role": "user", "content": tool_results})
                    continue

                texts = [
                    getattr(b, "text", "")
                    for b in response.content
                    if getattr(b, "type", None) == "text"
                ]
                raw_reply = "\n".join(t for t in texts if t).strip()
                break

        if not raw_reply:
            raw_reply = (
                "ขอโทษนะคะ MetaBreath ยังคิดคำตอบไม่จบภายในรอบที่กำหนด "
                "ลองถามใหม่อีกครั้งได้ไหมคะ"
            )
    except Exception:
        raw_reply = "ขอโทษนะคะ เกิดข้อผิดพลาดชั่วคราว รบกวนลองใหม่อีกครั้งค่ะ"

    safe_reply = llm_guardrail.sanitise_response(raw_reply, lang="th")

    return ChatResponse(
        reply=safe_reply,
        refusal=False,
        disclaimer_appended=True,
    )


# ─── POST /ai/chat/stream (SSE) ──────────────────────────────────────────────

def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
async def chat_stream(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Server-Sent Events variant of /chat. Streams text deltas + tool status."""
    should_refuse, _reason = llm_guardrail.is_refusal_needed(body.message)

    profile_res = await db.exec(select(Profile).where(Profile.user_id == user.id))
    profile = profile_res.first()
    goal_th_map = {"monitor": "ติดตามสุขภาพ", "keto": "คีโต (Keto)",
                   "fasting": "intermittent fasting", "exercise": "ออกกำลังกาย"}
    goal_type = profile.goal_type if profile else None
    user_context = {
        "display_name": profile.display_name if profile else user.username,
        "sex": profile.sex if profile else None,
        "goal_type": goal_type,
        "goal_th": goal_th_map.get(goal_type or "", goal_type),
        "onboarded": bool(profile and profile.onboarded_at),
        "has_default_device_hint": body.device_id is not None,
    }
    system_prompt = llm_guardrail.build_system_prompt(user_context)
    api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
    model = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

    async def generator() -> AsyncGenerator[str, None]:
        if should_refuse:
            reply = llm_guardrail.build_refusal_response(lang="th")
            yield _sse({"type": "refusal", "reply": reply})
            yield _sse({"type": "done"})
            return

        if not api_key:
            yield _sse({"type": "text", "delta":
                "ขอโทษนะคะ — MetaBreath ยังไม่พร้อมใช้งานในตอนนี้ (ไม่มี API key)"})
            yield _sse({"type": "text", "delta": llm_guardrail.DISCLAIMER_TH})
            yield _sse({"type": "done"})
            return

        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)

            async with mcp_scope(user.id, device_id=body.device_id):
                mcp_tools = await mcp_server.list_tools()
                anth_tools = [
                    {"name": t.name, "description": t.description or "",
                     "input_schema": t.inputSchema}
                    for t in mcp_tools
                ]

                messages: list[dict] = [{"role": "user", "content": body.message}]
                full_text = ""

                for _round in range(6):
                    tool_use_blocks: list = []
                    assistant_content: list = []
                    round_text = ""

                    with client.messages.stream(
                        model=model,
                        max_tokens=1024,
                        system=system_prompt,
                        tools=anth_tools,
                        messages=messages,
                    ) as stream:
                        for event in stream:
                            etype = getattr(event, "type", "")
                            if etype == "text":
                                delta = getattr(event, "text", "")
                                if delta:
                                    round_text += delta
                                    yield _sse({"type": "text", "delta": delta})
                            elif etype == "content_block_stop":
                                blk = getattr(event, "content_block", None)
                                if blk and getattr(blk, "type", None) == "tool_use":
                                    tool_use_blocks.append(blk)

                        final_msg = stream.get_final_message()
                        assistant_content = final_msg.content
                        stop_reason = final_msg.stop_reason

                    full_text += round_text

                    if stop_reason == "tool_use":
                        messages.append({"role": "assistant", "content": assistant_content})
                        tool_results = []
                        for block in assistant_content:
                            if getattr(block, "type", None) != "tool_use":
                                continue
                            yield _sse({"type": "tool_use", "name": block.name})
                            try:
                                mcp_result = await mcp_server.call_tool(
                                    block.name, block.input or {}
                                )
                                text_out = "\n".join(
                                    getattr(part, "text", str(part)) for part in mcp_result
                                )
                            except Exception as e:
                                text_out = f'{{"error": "tool {block.name} failed: {e}"}}'
                            yield _sse({"type": "tool_result", "name": block.name})
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": text_out,
                            })
                        messages.append({"role": "user", "content": tool_results})
                        continue

                    break

            # Sanitize the accumulated text (strip any self-written disclaimer,
            # then append the canonical one as a final delta).
            sanitised = llm_guardrail.sanitise_response(full_text, lang="th")
            if sanitised != full_text:
                # Send the diff (usually just the disclaimer tail)
                tail = sanitised[len(full_text):] if sanitised.startswith(full_text) else \
                       llm_guardrail.DISCLAIMER_TH
                if tail:
                    yield _sse({"type": "text", "delta": tail})

            yield _sse({"type": "done"})
        except Exception as e:
            yield _sse({"type": "error", "message": str(e)})
            yield _sse({"type": "done"})

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── POST /ai/predict/lstm ────────────────────────────────────────────────────

@router.post("/predict/lstm", response_model=LstmPredictResponse)
async def predict_lstm(
    body: LstmPredictRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Predict risk from a sequence of readings using LSTM temporal model."""
    device_result = await db.exec(
        select(Device).where(Device.id == body.device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    if body.sequence:
        sequence = body.sequence
    else:
        readings_result = await db.exec(
            select(SensorReading)
            .where(SensorReading.device_id == body.device_id)
            .order_by(SensorReading.time.desc())
            .limit(5)
        )
        readings = list(readings_result.all())[::-1]  # oldest → newest
        sequence = [
            {
                "acetone_delta":     r.acetone_delta,
                "quality_score":     r.quality_score,
                "reliability_score": r.reliability_score,
                "ketosis_index":     None,   # not stored — LSTM default to 0
                "metabolic_score":   None,
                "pressure_mean":     r.pressure_mean,
                "temperature":       r.temp_c,
                "humidity":          r.humidity_pct,
            }
            for r in readings
        ]

    result = ml_inference.predict_risk_lstm(sequence)
    return LstmPredictResponse(
        label=result.get("label"),
        metabolic_risk_index=result.get("metabolic_risk_index"),
        confidence_score=result.get("confidence_score", 0.0),
        model_used=result.get("model_used", "unknown"),
        recalibration_needed=result.get("recalibration_needed", False),
        sequence_length=result.get("sequence_length", len(sequence)),
        fallback_reason=result.get("reason"),
    )


# ─── POST /ai/predict/trend (Phase 3 — LSTM Trend Classifier) ────────────────

@router.post("/predict/trend", response_model=TrendClassifyResponse)
async def predict_trend_classification(
    body: TrendClassifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Classify the direction of the user's ΔVOC trend over recent sessions.

    Runs in PARALLEL to /ai/predict (per-reading classification) — the two
    endpoints answer different questions:
      - /ai/predict           : "What Anderson class is this single reading?"
      - /ai/predict/trend     : "How is the user's baseline changing over time?"
    Output labels: stable | increasing | decreasing | abnormal | None
    """
    # User-scoped: works for shared-device users who released their claim.
    if body.sequence:
        sequence = body.sequence
    else:
        readings_result = await db.exec(
            select(SensorReading)
            .where(
                SensorReading.device_id == body.device_id,
                SensorReading.user_id == user.id,
            )
            .order_by(SensorReading.time.desc())
            .limit(max(body.sessions, ml_inference.TREND_MIN_SEQUENCE_LENGTH))
        )
        readings = list(readings_result.all())[::-1]  # oldest → newest
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

    result = ml_inference.classify_trend(sequence)
    return TrendClassifyResponse(
        device_id=body.device_id,
        trend=result.get("trend"),
        confidence=result.get("confidence", 0.0),
        probabilities=result.get("probabilities", {}),
        sequence_length=result.get("sequence_length", len(sequence)),
        min_required=result.get("min_required", ml_inference.TREND_MIN_SEQUENCE_LENGTH),
        model_used=result.get("model_used", "unknown"),
        fallback_reason=result.get("fallback_reason"),
    )


# ─── GET /ai/drift ────────────────────────────────────────────────────────────

@router.get("/drift", response_model=DriftResponse)
async def check_drift(
    device_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check sensor drift from calibration history."""
    device_result = await db.exec(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    if not device_result.first():
        raise HTTPException(status_code=404, detail="Device not found")

    cal_result = await db.exec(
        select(DeviceCalibration)
        .where(DeviceCalibration.device_id == device_id)
        .order_by(DeviceCalibration.calibrated_at)
    )
    calibrations = list(cal_result.all())

    history = [
        {"ambient_voc": c.baseline_voc, "time": c.calibrated_at}
        for c in calibrations
    ]

    result = ml_inference.check_drift(history)
    return DriftResponse(
        device_id=device_id,
        drift_detected=result["drift_detected"],
        severity=result["severity"],
        confidence=result["confidence"],
        recommendation=result["recommendation"],
        drift_pct=result.get("drift_pct"),
        baseline_voc=result.get("baseline_voc"),
        latest_voc=result.get("latest_voc"),
        n_calibrations_used=len(calibrations),
    )


# ─── POST /ai/flexibility ─────────────────────────────────────────────────────

@router.post("/flexibility", response_model=FlexibilityResponse)
async def get_flexibility(
    body: FlexibilityRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compute Metabolic Flexibility Score (0-100) from recent breath sessions."""
    # User-scoped: works for shared-device users who released their claim.
    since = datetime.utcnow() - timedelta(days=body.days)
    readings_result = await db.exec(
        select(SensorReading)
        .where(
            SensorReading.device_id == body.device_id,
            SensorReading.user_id == user.id,
            SensorReading.time >= since,
        )
        .order_by(SensorReading.time)
    )
    readings = readings_result.all()

    # Group individual sensor readings into breath sessions.
    # A new session starts when there is a >5-minute gap between readings.
    SESSION_GAP_SECS = 300
    sessions = []
    current_group: list = []

    for r in readings:
        if r.acetone_delta is None:
            continue
        if current_group and (r.time - current_group[-1].time).total_seconds() > SESSION_GAP_SECS:
            # Flush current group as one session (take the peak reading)
            peak_r = max(current_group, key=lambda x: x.acetone_delta or 0)
            sessions.append({
                "peak_ppm": peak_r.acetone_delta,
                "mean_ppm": sum(x.acetone_delta for x in current_group) / len(current_group),
                "context_tag": None,
            })
            current_group = []
        current_group.append(r)

    if current_group:
        peak_r = max(current_group, key=lambda x: x.acetone_delta or 0)
        sessions.append({
            "peak_ppm": peak_r.acetone_delta,
            "mean_ppm": sum(x.acetone_delta for x in current_group) / len(current_group),
            "context_tag": None,
        })

    latest_ppm = sessions[-1]["peak_ppm"] if sessions else None
    result = flexibility_engine.compute_flexibility(
        sessions,
        latest_ppm=latest_ppm,
        context_tag=body.context_tag,
    )

    return FlexibilityResponse(
        score=result["score"],
        zone=result["zone"],
        breakdown=FlexibilityBreakdown(**result["breakdown"]),
        trend=result["trend"],
        n_sessions=result["n_sessions"],
        message_th=result["message_th"],
        context_tag=body.context_tag,
    )
