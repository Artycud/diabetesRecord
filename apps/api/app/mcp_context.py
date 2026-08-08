"""
Per-request context for MCP tools.

MCP tools don't have FastAPI Depends injection, so we propagate the current
user + DB session via contextvars. Both the mounted /mcp endpoint (external
Claude clients) and the internal /ai/chat call path set these before invoking
MCP protocol methods.
"""
from __future__ import annotations

from contextvars import ContextVar
from typing import Optional
from uuid import UUID
from contextlib import asynccontextmanager

from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import AsyncSessionLocal

_current_user_id: ContextVar[Optional[UUID]] = ContextVar("mcp_current_user_id", default=None)
_current_db: ContextVar[Optional[AsyncSession]] = ContextVar("mcp_current_db", default=None)
_current_device_id: ContextVar[Optional[UUID]] = ContextVar("mcp_current_device_id", default=None)


def get_user_id() -> UUID:
    uid = _current_user_id.get()
    if not uid:
        raise RuntimeError("No MCP user context — tool called without auth setup")
    return uid


def get_db() -> AsyncSession:
    db = _current_db.get()
    if not db:
        raise RuntimeError("No MCP db context — tool called without session setup")
    return db


def get_device_id() -> Optional[UUID]:
    return _current_device_id.get()


@asynccontextmanager
async def mcp_scope(user_id: UUID, device_id: Optional[UUID] = None):
    """
    Set up MCP tool context for the duration of the async block.
    Creates a fresh DB session; caller does not need to manage it.
    """
    async with AsyncSessionLocal() as db:
        tok_user = _current_user_id.set(user_id)
        tok_db = _current_db.set(db)
        tok_dev = _current_device_id.set(device_id)
        try:
            yield db
        finally:
            _current_device_id.reset(tok_dev)
            _current_db.reset(tok_db)
            _current_user_id.reset(tok_user)
