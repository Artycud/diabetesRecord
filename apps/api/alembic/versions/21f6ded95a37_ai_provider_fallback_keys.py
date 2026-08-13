"""ai_providers: add encrypted api_key column for admin-configured global fallback keys

Revision ID: 21f6ded95a37
Revises: a7c3e9f2b4d1
Create Date: 2026-08-12

Adds:
- ai_providers.api_key_encrypted   text, nullable

Lets an admin store a global OpenAI/Gemini API key server-side (Settings ->
AI Fallback in the admin console), encrypted at rest via app.core.secrets
(Fernet, keyed off JWT_SECRET). app.services.ai_fallback uses these as a
second-tier fallback when the primary Claude call in app/routers/ai.py fails
or has no ANTHROPIC_API_KEY/CLAUDE_API_KEY configured.

Note: the `ai_providers` table itself already exists in the deployed
database (created out-of-band, pre-dating this Alembic chain, and seeded
with openai/gemini/claude rows) — this migration only adds the new column.
"""
from alembic import op
import sqlalchemy as sa

revision = "21f6ded95a37"
down_revision = "a7c3e9f2b4d1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "ai_providers",
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column("ai_providers", "api_key_encrypted")
