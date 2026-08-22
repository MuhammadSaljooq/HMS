"""Multi-clinic foundation: regions, clinics, memberships + additive clinic_id

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-21

Additive-only. New anchor-table clinic_id columns are nullable and backfilled to
a default clinic. Nothing existing is removed or renamed.
"""

from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: Union[str, Sequence[str], None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ANCHOR_TABLES = (
    "patients",
    "appointments",
    "medical_records",
    "invoices",
    "transcriptions",
    "service_catalog",
)


def upgrade() -> None:
    # --- New tables ---
    op.create_table(
        "regions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.UniqueConstraint("code", name="uq_regions_code"),
    )
    op.create_index("ix_regions_code", "regions", ["code"], unique=True)

    op.create_table(
        "clinics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("region_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("regions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("address_line1", sa.String(length=255), nullable=True),
        sa.Column("address_line2", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=128), nullable=True),
        sa.Column("state", sa.String(length=128), nullable=True),
        sa.Column("postal_code", sa.String(length=32), nullable=True),
        sa.Column("country", sa.String(length=128), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Asia/Karachi"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.UniqueConstraint("code", name="uq_clinics_code"),
    )
    op.create_index("ix_clinics_code", "clinics", ["code"], unique=True)
    op.create_index("ix_clinics_region_id", "clinics", ["region_id"])

    op.create_table(
        "clinic_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("clinic_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "clinic_id", name="uq_clinic_memberships_user_clinic"),
    )
    op.create_index("ix_clinic_memberships_user_id", "clinic_memberships", ["user_id"])
    op.create_index("ix_clinic_memberships_clinic_id", "clinic_memberships", ["clinic_id"])

    # --- Additive nullable clinic_id on anchor tables ---
    for table in _ANCHOR_TABLES:
        op.add_column(
            table,
            sa.Column("clinic_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            f"fk_{table}_clinic_id",
            table,
            "clinics",
            ["clinic_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(f"ix_{table}_clinic_id", table, ["clinic_id"])

    # --- Data backfill (idempotent-safe) ---
    bind = op.get_bind()

    region_id = bind.execute(
        sa.text("SELECT id FROM regions WHERE code = 'DEFAULT'")
    ).scalar()
    if region_id is None:
        region_id = uuid4()
        bind.execute(
            sa.text(
                "INSERT INTO regions (id, name, code, is_active) "
                "VALUES (:id, :name, :code, true)"
            ),
            {"id": str(region_id), "name": "Default Region", "code": "DEFAULT"},
        )

    clinic_id = bind.execute(
        sa.text("SELECT id FROM clinics WHERE code = 'NECH'")
    ).scalar()
    if clinic_id is None:
        clinic_id = uuid4()
        bind.execute(
            sa.text(
                "INSERT INTO clinics (id, name, code, region_id, timezone, is_active) "
                "VALUES (:id, :name, :code, :region_id, :tz, true)"
            ),
            {
                "id": str(clinic_id),
                "name": "National Eye Care Hospital",
                "code": "NECH",
                "region_id": str(region_id),
                "tz": "Asia/Karachi",
            },
        )

    # Point every existing anchor row at the default clinic.
    for table in _ANCHOR_TABLES:
        bind.execute(
            sa.text(f"UPDATE {table} SET clinic_id = :cid WHERE clinic_id IS NULL"),
            {"cid": str(clinic_id)},
        )

    # Give every existing user a primary membership in the default clinic.
    existing_user_ids = bind.execute(
        sa.text(
            "SELECT u.id FROM users u WHERE NOT EXISTS ("
            "  SELECT 1 FROM clinic_memberships m "
            "  WHERE m.user_id = u.id AND m.clinic_id = :cid"
            ")"
        ),
        {"cid": str(clinic_id)},
    ).scalars().all()
    for user_id in existing_user_ids:
        bind.execute(
            sa.text(
                "INSERT INTO clinic_memberships (id, user_id, clinic_id, is_primary) "
                "VALUES (:id, :uid, :cid, true)"
            ),
            {"id": str(uuid4()), "uid": str(user_id), "cid": str(clinic_id)},
        )


def downgrade() -> None:
    for table in _ANCHOR_TABLES:
        op.drop_index(f"ix_{table}_clinic_id", table_name=table)
        op.drop_constraint(f"fk_{table}_clinic_id", table, type_="foreignkey")
        op.drop_column(table, "clinic_id")

    op.drop_index("ix_clinic_memberships_clinic_id", table_name="clinic_memberships")
    op.drop_index("ix_clinic_memberships_user_id", table_name="clinic_memberships")
    op.drop_table("clinic_memberships")

    op.drop_index("ix_clinics_region_id", table_name="clinics")
    op.drop_index("ix_clinics_code", table_name="clinics")
    op.drop_table("clinics")

    op.drop_index("ix_regions_code", table_name="regions")
    op.drop_table("regions")
