"""Billing indexes

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-07

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_invoices_patient_created", "invoices", ["patient_id", "created_at"])
    op.create_index("ix_invoices_status", "invoices", ["status"])
    op.create_index("ix_payments_receivedby_receivedat", "payments", ["received_by", "received_at"])
    op.create_index("ix_payments_received_at", "payments", ["received_at"])
    op.create_index("ix_invoice_line_items_service", "invoice_line_items", ["service_id"])


def downgrade() -> None:
    op.drop_index("ix_invoice_line_items_service", table_name="invoice_line_items")
    op.drop_index("ix_payments_received_at", table_name="payments")
    op.drop_index("ix_payments_receivedby_receivedat", table_name="payments")
    op.drop_index("ix_invoices_status", table_name="invoices")
    op.drop_index("ix_invoices_patient_created", table_name="invoices")
