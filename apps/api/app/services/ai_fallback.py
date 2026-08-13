"""
Global admin-configured AI fallback.

Used by app/routers/ai.py (/ai/interpret, /ai/chat, /ai/chat/stream) as a
second tier when the primary Claude call fails or has no
ANTHROPIC_API_KEY/CLAUDE_API_KEY configured at all. An admin configures one
or both of OpenAI/Gemini via PUT /admin/ai-fallback/{provider} (see
app/routers/admin.py); keys are stored encrypted at rest
(app.core.secrets) in the existing `ai_providers` table and never sent to
the client — this module is the only place that ever decrypts and uses them.

Deliberately single-shot, no tool-calling: the primary path's MCP tool loop
(device-data lookups) is Anthropic-specific (tool_use/tool_result block
format) and translating that to OpenAI/Gemini's own function-calling shapes
is out of scope for a fallback path. Callers that want the fallback grounded
in real data should build a short context snippet themselves (e.g. via
chat_tools.tool_get_recent_readings) and fold it into `user_content`.
"""
import httpx
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models.ai import AIProvider
from app.core.secrets import decrypt_secret

_TIMEOUT_S = 15.0


async def _call_openai(api_key: str, model: str, system_prompt: str, user_content: str) -> str:
    async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "temperature": 0.4,
            },
        )
        res.raise_for_status()
        data = res.json()
        return data["choices"][0]["message"]["content"]


async def _call_gemini(api_key: str, model: str, system_prompt: str, user_content: str) -> str:
    async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
        res = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": api_key},
            json={
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": [{"text": user_content}]}],
            },
        )
        res.raise_for_status()
        data = res.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


_CALLERS = {"openai": _call_openai, "gemini": _call_gemini}


async def try_global_fallback(
    db: AsyncSession,
    system_prompt: str,
    user_content: str,
) -> Optional[str]:
    """Try each enabled + configured global-fallback provider in priority
    order (openai, then gemini, per ai_providers.priority). Returns the
    first successful completion's text, or None if none are configured or
    all fail — callers should fall through to their own existing canned
    reply in that case, exactly as before this feature existed."""
    result = await db.exec(
        select(AIProvider)
        .where(AIProvider.key.in_(list(_CALLERS.keys())))
        .where(AIProvider.enabled == True)  # noqa: E712 (SQLAlchemy comparison, not a bool identity check)
        .order_by(AIProvider.priority)
    )
    for provider in result.all():
        if not provider.api_key_encrypted:
            continue
        api_key = decrypt_secret(provider.api_key_encrypted)
        if not api_key:
            continue
        try:
            text = await _CALLERS[provider.key](api_key, provider.model, system_prompt, user_content)
            if text and text.strip():
                return text.strip()
        except Exception:
            continue  # try the next configured provider
    return None
