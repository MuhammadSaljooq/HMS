"""Add opt-in MFA (TOTP) columns to users.

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-22

Additive-only. All three columns are nullable / have safe defaults so existing
rows are unaffected and MFA stays disabled for every current user. ``mfa_secret``
is stored encrypted at rest (see app.utils.encryption.EncryptedString) but is a
plain String at the DB level.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, Sequence[str], None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("mfa_secret", sa.String(length=255), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "mfa_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "users",
        sa.Column("mfa_enrolled_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "mfa_enrolled_at")
    op.drop_column("users", "mfa_enabled")
    op.drop_column("users", "mfa_secret")
