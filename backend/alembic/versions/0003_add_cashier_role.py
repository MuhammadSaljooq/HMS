"""Add cashier role value

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-07

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE cannot run in a transaction; commit the ambient one first.
    op.execute("COMMIT")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cashier'")


def downgrade() -> None:
    # Postgres cannot drop an enum value; no-op by design.
    pass
