"""device.simulate_acetone: pressure-driven synthetic signal toggle

Revision ID: f1a2b3c4d5e6
Revises: 963d4fc0ed40
Create Date: 2026-07-22

Adds:
- devices.simulate_acetone   bool, default false

Hardware-fault workaround: when true, ingestion (mqtt_subscriber.process_reading)
substitutes a pressure-driven synthetic acetone value (app.services.acetone_simulator)
instead of the real (broken) TGS1820 voltage delta. Toggled per-device via
POST /admin/device/{id}/simulate-acetone — no redeploy needed to turn off once
the sensor is replaced.
"""
from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"
down_revision = "963d4fc0ed40"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "devices",
        sa.Column("simulate_acetone", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade():
    op.drop_column("devices", "simulate_acetone")
