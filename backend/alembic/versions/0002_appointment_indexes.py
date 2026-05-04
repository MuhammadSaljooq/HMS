"""Add appointment indexes for conflict checks and listing

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-04
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_appointments_doctor_scheduled_status",
        "appointments",
        ["doctor_id", "scheduled_at", "status"],
        unique=False,
    )
    op.create_index(
        "ix_appointments_patient_scheduled_at",
        "appointments",
        ["patient_id", "scheduled_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_appointments_patient_scheduled_at", table_name="appointments")
    op.drop_index("ix_appointments_doctor_scheduled_status", table_name="appointments")
