"""PHI hardening: soft-delete, authorship, FK indexes, appointment slot uniqueness

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, Sequence[str], None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SOFT_DELETE_TABLES = (
    "patients",
    "appointments",
    "medical_records",
    "prescriptions",
    "vitals",
    "transcriptions",
)


def upgrade() -> None:
    # Soft-delete columns on the six PHI tables.
    for table in _SOFT_DELETE_TABLES:
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(
            table,
            sa.Column(
                "deleted_by",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="RESTRICT"),
                nullable=True,
            ),
        )

    # Authorship columns.
    op.add_column(
        "medical_records",
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "medical_records",
        sa.Column(
            "updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "prescriptions",
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "prescriptions",
        sa.Column(
            "updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "prescriptions",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # FK indexes.
    op.create_index("ix_medical_records_patient_id", "medical_records", ["patient_id"])
    op.create_index("ix_medical_records_doctor_id", "medical_records", ["doctor_id"])
    op.create_index("ix_medical_records_appointment_id", "medical_records", ["appointment_id"])
    op.create_index("ix_vitals_patient_id", "vitals", ["patient_id"])
    op.create_index("ix_vitals_recorded_by", "vitals", ["recorded_by"])
    op.create_index("ix_transcriptions_medical_record_id", "transcriptions", ["medical_record_id"])
    op.create_index("ix_prescriptions_medical_record_id", "prescriptions", ["medical_record_id"])

    # Audit-log indexes.
    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"])
    op.create_index("ix_audit_logs_actor_at", "audit_logs", ["actor_user_id", "at"])

    # Partial unique index: no double-booking of an active scheduled slot.
    op.create_index(
        "uq_appointments_active_slot",
        "appointments",
        ["doctor_id", "scheduled_at"],
        unique=True,
        postgresql_where=sa.text("status = 'scheduled' AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_appointments_active_slot", table_name="appointments")

    op.drop_index("ix_audit_logs_actor_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_entity", table_name="audit_logs")

    op.drop_index("ix_prescriptions_medical_record_id", table_name="prescriptions")
    op.drop_index("ix_transcriptions_medical_record_id", table_name="transcriptions")
    op.drop_index("ix_vitals_recorded_by", table_name="vitals")
    op.drop_index("ix_vitals_patient_id", table_name="vitals")
    op.drop_index("ix_medical_records_appointment_id", table_name="medical_records")
    op.drop_index("ix_medical_records_doctor_id", table_name="medical_records")
    op.drop_index("ix_medical_records_patient_id", table_name="medical_records")

    op.drop_column("prescriptions", "created_at")
    op.drop_column("prescriptions", "updated_by")
    op.drop_column("prescriptions", "created_by")
    op.drop_column("medical_records", "updated_by")
    op.drop_column("medical_records", "created_by")

    for table in reversed(_SOFT_DELETE_TABLES):
        op.drop_column(table, "deleted_by")
        op.drop_column(table, "deleted_at")
