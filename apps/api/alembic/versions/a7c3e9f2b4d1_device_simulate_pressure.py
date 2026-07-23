"""device.simulate_pressure: full hardware-fault workaround toggle

Revision ID: a7c3e9f2b4d1
Revises: f1a2b3c4d5e6
Create Date: 2026-07-23

Adds:
- devices.simulate_pressure   bool, default false

Full hardware-fault workaround: when true (on top of simulate_acetone, which
stays independently controlled), ingestion (mqtt_subscriber.process_reading)
also substitutes a synthetic pressure curve (app.services.pressure_simulator)
instead of the real (broken) pressure_kpa, since there is no real signal left
at all to gate acetone's own blow detection on. Self-service toggle (the
device owner's own hardware, not admin-only) via
POST /sensor/device/{id}/simulation — mirrors simulate_acetone's pattern but
user-facing rather than admin-only.
"""
from alembic import op
import sqlalchemy as sa

revision = "a7c3e9f2b4d1"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "devices",
        sa.Column("simulate_pressure", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade():
    op.drop_column("devices", "simulate_pressure")
