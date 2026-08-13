from sqlmodel import SQLModel, Field
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional

class AIProvider(SQLModel, table=True):
    """Configures which AI providers are enabled and their priority order."""
    __tablename__ = "ai_providers"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    key: str = Field(unique=True, max_length=30)   # openai|gemini|claude
    display_name: str = Field(max_length=50)
    priority: int = Field(default=1, index=True)   # 1=first, 2=second, 3=third
    enabled: bool = Field(default=True)
    model: str = Field(max_length=80)
    timeout_s: int = Field(default=8)
    # Admin-configured global fallback key (openai/gemini), encrypted at rest
    # via app.core.secrets (Fernet). Used by app.services.ai_fallback when the
    # primary Claude call in app/routers/ai.py fails or isn't configured.
    api_key_encrypted: Optional[str] = Field(default=None)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AISession(SQLModel, table=True):
    __tablename__ = "ai_sessions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    provider: str = Field(max_length=30)
    model: str = Field(max_length=80)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AIMessage(SQLModel, table=True):
    __tablename__ = "ai_messages"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="ai_sessions.id", index=True)
    role: str = Field(max_length=20)  # user|assistant|system
    content: str
    tokens: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AICallLog(SQLModel, table=True):
    """Audit log for every AI API call — tracks provider used, latency, cost."""
    __tablename__ = "ai_call_log"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, foreign_key="users.id", index=True)
    session_id: Optional[UUID] = Field(default=None, foreign_key="ai_sessions.id")
    provider: str = Field(max_length=30)
    model: str = Field(max_length=80)
    latency_ms: Optional[int] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    success: bool = Field(default=True)
    error: Optional[str] = Field(default=None, max_length=500)
    ts: datetime = Field(default_factory=datetime.utcnow, index=True)
