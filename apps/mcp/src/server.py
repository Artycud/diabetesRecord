"""
MetaBreath MCP Server

Implements Model Context Protocol for AI coach integration.
Tools allow Claude to read sensor data, log health events,
and provide contextualised metabolic advice.

Run: python -m apps.mcp.src.server
Or configure in claude_desktop_config.json.
"""
from __future__ import annotations

import json
import os
import httpx
from datetime import datetime, timedelta
from typing import Optional

# ─── MCP SDK import (mcp[server] package) ─────────────────────────────────────
try:
    from mcp.server import Server
    from mcp.server.models import InitializationOptions
    import mcp.server.stdio as stdio_server
    from mcp.types import (
        Tool, TextContent, Resource, Prompt, PromptMessage,
        GetPromptResult, ListResourcesResult, ReadResourceResult,
        ListToolsResult, CallToolResult,
    )
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False
    # Stub for environments where mcp SDK is not installed
    class Server:
        def __init__(self, name: str): self.name = name
        def list_tools(self): return lambda f: f
        def call_tool(self): return lambda f: f
        def list_resources(self): return lambda f: f
        def read_resource(self): return lambda f: f
        def list_prompts(self): return lambda f: f
        def get_prompt(self): return lambda f: f

API_BASE = os.getenv("METABREATH_API_URL", "http://localhost:8000")
API_TOKEN = os.getenv("METABREATH_API_TOKEN", "")

server = Server("metabreath-mcp")


def _headers():
    return {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}


async def _get(path: str, params: dict = None) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{API_BASE}{path}", headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()


async def _post(path: str, body: dict) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(f"{API_BASE}{path}", headers=_headers(), json=body)
        r.raise_for_status()
        return r.json()


# ─── Tool definitions ────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "get_recent_readings",
        "description": "Get the most recent breath acetone sensor readings for the user. Returns acetone_delta, quality_score, reliability_score, label, and confidence.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_id": {"type": "string", "description": "UUID of the MetaBreath device"},
                "days": {"type": "integer", "default": 7, "description": "Number of days to look back (1–30)"},
            },
            "required": ["device_id"],
        },
    },
    {
        "name": "get_metabolic_trend",
        "description": "Predict the 7-day acetone trend (increasing/decreasing/stable) based on historical readings using linear regression.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_id": {"type": "string"},
                "days": {"type": "integer", "default": 7},
            },
            "required": ["device_id"],
        },
    },
    {
        "name": "explain_reading",
        "description": "Get a plain-language explanation of a specific acetone reading value in ppm, including metabolic state classification and actionable advice.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "acetone_ppm": {"type": "number", "description": "Acetone delta reading in ppm"},
                "context": {"type": "string", "description": "Optional context: fasting, post_meal, post_exercise"},
            },
            "required": ["acetone_ppm"],
        },
    },
    {
        "name": "log_meal",
        "description": "Log a meal entry for the current user. Helps correlate food intake with metabolic state changes.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "kcal": {"type": "number"},
                "carbs_g": {"type": "number"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "log_activity",
        "description": "Log a physical activity entry. Used to correlate exercise with ketone/acetone levels.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "description": "walk | run | cycle | gym | yoga"},
                "duration_min": {"type": "integer"},
                "kcal": {"type": "number"},
            },
            "required": ["kind", "duration_min"],
        },
    },
    {
        "name": "calibrate_device",
        "description": "Trigger a zero-point calibration for a MetaBreath device. Provide the current ambient VOC baseline reading.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "device_id": {"type": "string"},
                "baseline_voc": {"type": "number", "description": "Ambient VOC reading in clean air (ppm)"},
                "temp_c": {"type": "number"},
                "humidity_pct": {"type": "number"},
            },
            "required": ["device_id", "baseline_voc"],
        },
    },
]


@server.list_tools()
async def list_tools() -> ListToolsResult:
    return ListToolsResult(tools=[Tool(**t) for t in TOOLS])


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> CallToolResult:
    try:
        if name == "get_recent_readings":
            data = await _get("/sensor/readings", params={
                "device_id": arguments["device_id"],
                "days": arguments.get("days", 7),
            })
            # Return last 5 readings summary
            readings = data[-5:] if isinstance(data, list) else []
            summary = [
                {
                    "time": r.get("time"),
                    "acetone_delta": r.get("acetone_delta"),
                    "label": r.get("label"),
                    "quality_score": r.get("quality_score"),
                    "confidence_score": r.get("confidence_score"),
                }
                for r in readings
            ]
            return CallToolResult(content=[TextContent(type="text", text=json.dumps(summary, indent=2))])

        elif name == "get_metabolic_trend":
            data = await _get("/ai/trend", params={
                "device_id": arguments["device_id"],
                "days": arguments.get("days", 7),
            })
            return CallToolResult(content=[TextContent(type="text", text=json.dumps(data, indent=2))])

        elif name == "explain_reading":
            ppm = float(arguments["acetone_ppm"])
            context = arguments.get("context", "")

            if ppm < 1.0:
                state = "healthy"
                explanation = f"ค่า acetone {ppm:.2f} ppm อยู่ในช่วงปกติ (สุขภาพดี) ร่างกายกำลังใช้กลูโคสเป็นพลังงานหลัก"
            elif ppm < 5.0:
                state = "fat_burning"
                explanation = f"ค่า acetone {ppm:.2f} ppm บ่งบอกว่าร่างกายเริ่มเผาไขมัน (fat burning mode) เหมาะสำหรับ IF/keto ระยะเริ่มต้น"
            elif ppm < 75.0:
                state = "ketosis"
                explanation = f"ค่า acetone {ppm:.2f} ppm อยู่ในช่วง ketosis ร่างกายกำลังใช้คีโตนเป็นพลังงานอย่างมีประสิทธิภาพ"
            else:
                state = "elevated"
                explanation = f"ค่า acetone {ppm:.2f} ppm สูงมาก ควรปรึกษาแพทย์เพื่อตรวจสอบ"

            if context == "post_meal":
                explanation += " (วัดหลังอาหาร — ค่าอาจสูงกว่าปกติชั่วคราว)"
            elif context == "post_exercise":
                explanation += " (วัดหลังออกกำลังกาย — การเผาไขมันเพิ่มขึ้นชั่วคราว)"

            result = {"acetone_ppm": ppm, "state": state, "explanation": explanation,
                      "reference_ranges": {"healthy": "0.3-0.9", "fat_burning": "1-5", "ketosis": "5-40", "dka_risk": ">75"}}
            return CallToolResult(content=[TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))])

        elif name == "log_meal":
            data = await _post("/logs/meal", arguments)
            return CallToolResult(content=[TextContent(type="text", text=f"Meal logged: {data.get('id', 'ok')}")])

        elif name == "log_activity":
            data = await _post("/logs/activity", arguments)
            return CallToolResult(content=[TextContent(type="text", text=f"Activity logged: {data.get('id', 'ok')}")])

        elif name == "calibrate_device":
            device_id = arguments.pop("device_id")
            data = await _post(f"/sensor/device/{device_id}/calibrate", arguments)
            return CallToolResult(content=[TextContent(type="text", text=json.dumps(data, indent=2))])

        else:
            return CallToolResult(content=[TextContent(type="text", text=f"Unknown tool: {name}")])

    except Exception as e:
        return CallToolResult(content=[TextContent(type="text", text=f"Error: {e}")], isError=True)


# ─── Resources ───────────────────────────────────────────────────────────────

@server.list_resources()
async def list_resources() -> ListResourcesResult:
    return ListResourcesResult(resources=[
        Resource(
            uri="metabreath://reference/acetone-ranges",
            name="MetaBreath Acetone Reference Ranges",
            description="Acetone ppm thresholds and their metabolic meaning",
            mimeType="application/json",
        ),
        Resource(
            uri="metabreath://reference/tgs1820-datasheet",
            name="TGS1820 Sensor Characteristics",
            description="TGS1820 sensor specs, cross-sensitivity, drift characteristics",
            mimeType="application/json",
        ),
    ])


@server.read_resource()
async def read_resource(uri: str) -> ReadResourceResult:
    if uri == "metabreath://reference/acetone-ranges":
        data = {
            "ranges": [
                {"label": "healthy", "min_ppm": 0.3, "max_ppm": 0.9, "description": "Normal metabolic state"},
                {"label": "fat_burning", "min_ppm": 1.0, "max_ppm": 5.0, "description": "Early fat oxidation / IF"},
                {"label": "ketosis", "min_ppm": 5.0, "max_ppm": 40.0, "description": "Nutritional ketosis"},
                {"label": "diabetes_risk", "min_ppm": 75.0, "max_ppm": None, "description": "DKA risk — see doctor"},
            ],
            "sensor": "MetaBreath TGS1820",
            "measurement": "acetone_delta = breath_voc - ambient_voc",
        }
    elif uri == "metabreath://reference/tgs1820-datasheet":
        data = {
            "sensor": "TGS1820",
            "manufacturer": "Figaro Engineering",
            "target_gas": "Acetone / VOC",
            "cross_sensitivity": {"Ethanol": "~30%", "Hydrogen": "~15%", "CO": "<5%"},
            "operating_temp": "20–60°C",
            "operating_humidity": "10–95% RH",
            "drift_characteristics": "Baseline drift ~0.2–0.5 ppm/month; recalibration recommended monthly",
            "lod_typical": "0.01 ppm",
        }
    else:
        data = {"error": "Resource not found"}

    return ReadResourceResult(contents=[TextContent(type="text", text=json.dumps(data, indent=2))])


# ─── Prompts ─────────────────────────────────────────────────────────────────

PROMPTS = [
    {
        "name": "analyze_metabolic_state",
        "description": "Generate a detailed metabolic state analysis for the user based on recent sensor readings",
        "arguments": [
            {"name": "device_id", "description": "UUID of the MetaBreath device", "required": True},
        ],
    },
    {
        "name": "daily_coaching_message",
        "description": "Generate a personalised daily wellness coaching message",
        "arguments": [
            {"name": "goal_type", "description": "User goal: keto | if | exercise | diabetes_management", "required": True},
            {"name": "streak_days", "description": "Current streak in days", "required": False},
        ],
    },
]


@server.list_prompts()
async def list_prompts():
    return {"prompts": PROMPTS}


@server.get_prompt()
async def get_prompt(name: str, arguments: dict) -> GetPromptResult:
    from app.services.llm_guardrail import SYSTEM_PROMPT_TEMPLATE, DISCLAIMER_TH

    if name == "analyze_metabolic_state":
        device_id = arguments.get("device_id", "")
        prompt_text = (
            f"ใช้เครื่องมือ get_recent_readings (device_id={device_id}) "
            "เพื่อดึงข้อมูล sensor readings ล่าสุด แล้ววิเคราะห์สถานะ metabolic ของผู้ใช้ "
            "โดยอ้างอิงจาก reference ranges ใน metabreath://reference/acetone-ranges "
            "และให้คำแนะนำ 2–3 ข้อ ปิดท้ายด้วย disclaimer"
        )
    elif name == "daily_coaching_message":
        goal = arguments.get("goal_type", "keto")
        streak = arguments.get("streak_days", "0")
        prompt_text = (
            f"สร้างข้อความโค้ชประจำวันสำหรับผู้ใช้ที่มีเป้าหมาย: {goal} "
            f"streak ปัจจุบัน {streak} วัน "
            "ให้ข้อความสั้น กระชับ สร้างแรงบันดาลใจ ภาษาไทย 2–3 ประโยค"
        )
    else:
        prompt_text = f"Unknown prompt: {name}"

    return GetPromptResult(
        description=f"MetaBreath prompt: {name}",
        messages=[PromptMessage(role="user", content=TextContent(type="text", text=prompt_text))],
    )


# ─── Entry point ────────────────────────────────────────────────────────────

async def main():
    if not MCP_AVAILABLE:
        print("mcp SDK not installed. Install with: pip install mcp[server]")
        return

    options = InitializationOptions(
        server_name="metabreath-mcp",
        server_version="1.0.0",
        capabilities=server.get_capabilities(
            notification_options=None,
            experimental_capabilities={},
        ),
    )
    async with stdio_server.stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options, raise_exceptions=True)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
