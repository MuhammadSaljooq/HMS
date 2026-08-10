"""Transcription review/approve workflow

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, Sequence[str], None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE cannot run inside a transaction; commit the ambient one first
    # (mirrors 0003_add_cashier_role.py). The column adds that follow run in
    # their own implicit transaction.
    op.execute("COMMIT")
    op.execute("ALTER TYPE transcription_status ADD VALUE IF NOT EXISTS 'reviewed'")
    op.execute("ALTER TYPE transcription_status ADD VALUE IF NOT EXISTS 'approved'")

    op.add_column(
        "transcriptions",
        sa.Column("edited", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "transcriptions",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "transcriptions",
        sa.Column(
            "reviewed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "transcriptions",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "transcriptions",
        sa.Column(
            "approved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("transcriptions", "approved_by")
    op.drop_column("transcriptions", "approved_at")
    op.drop_column("transcriptions", "reviewed_by")
    op.drop_column("transcriptions", "reviewed_at")
    op.drop_column("transcriptions", "edited")
    # Postgres cannot drop enum values; the 'reviewed'/'approved' values on
    # transcription_status remain (no-op by design, like 0003).
