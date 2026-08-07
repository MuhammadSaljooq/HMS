"""Concurrency test proving ``record_payment``'s ``with_for_update()`` row lock
serializes concurrent payments so an invoice cannot be overpaid.

This test intentionally does NOT use the rollback ``db_session`` fixture: the
row lock only serializes across two *real* database transactions, so we open
two independent ``AsyncSessionLocal`` sessions that each commit. Rows created
here are cleaned up in a ``finally`` block so the dev DB is not polluted.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import delete

from app.database import AsyncSessionLocal
from app.models import AuditLog, Invoice, InvoiceLineItem, Patient, Payment, User
from app.models.enums import PaymentMethod, PaymentType, UserRole
from app.services import billing_calc, billing_service
from app.utils.security import hash_password


@pytest.mark.asyncio
async def test_concurrent_payments_cannot_overpay():
    patient_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    invoice_id = None

    # ---- Setup: create actor, patient, issued invoice with a 100.00 line ----
    async with AsyncSessionLocal() as setup:
        actor = User(
            id=actor_id,
            email=f"concurrency-{uuid.uuid4().hex[:8]}@test.example.com",
            password_hash=hash_password("Test12345!"),
            role=UserRole.cashier,
            full_name="Concurrency Cashier",
            is_active=True,
        )
        patient = Patient(id=patient_id, mrn=f"MRN-C-{uuid.uuid4().hex[:6]}", full_name="Concurrency Pat", date_of_birth=date(1990, 1, 1))
        setup.add_all([actor, patient])
        await setup.flush()

        inv = await billing_service.create_invoice(setup, actor=actor, patient_id=patient_id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
        await billing_service.add_line_item(setup, actor=actor, invoice=inv, service_id=None, description="Consult", unit_price=Decimal("100.00"), quantity=1)
        await billing_service.issue_invoice(setup, actor=actor, invoice=inv)
        invoice_id = inv.id
        await setup.commit()

    try:
        async def pay_full():
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    actor = await session.get(User, actor_id)
                    await billing_service.record_payment(session, actor=actor, invoice_id=invoice_id, method=PaymentMethod.cash, amount=Decimal("100.00"), payment_type=PaymentType.payment, reference=None, notes=None)

        results = await asyncio.gather(pay_full(), pay_full(), return_exceptions=True)

        successes = [r for r in results if r is None]
        overpay_errors = [r for r in results if isinstance(r, billing_calc.PaymentValidationError)]
        other = [r for r in results if r is not None and not isinstance(r, billing_calc.PaymentValidationError)]

        assert other == [], f"Unexpected errors from concurrent payments: {other}"
        assert len(successes) == 1, f"Expected exactly one success, got results: {results}"
        assert len(overpay_errors) == 1, f"Expected exactly one overpayment rejection, got results: {results}"

        # Invoice ends fully paid, not double-paid.
        async with AsyncSessionLocal() as check:
            inv = await check.get(Invoice, invoice_id)
            assert inv.amount_paid == Decimal("100.00")
            assert inv.balance_due == Decimal("0.00")
    finally:
        async with AsyncSessionLocal() as cleanup:
            await cleanup.execute(delete(Payment).where(Payment.invoice_id == invoice_id))
            await cleanup.execute(delete(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id))
            await cleanup.execute(delete(Invoice).where(Invoice.id == invoice_id))
            await cleanup.execute(delete(Patient).where(Patient.id == patient_id))
            # audit_logs has a RESTRICT FK to users; remove them before the actor.
            await cleanup.execute(delete(AuditLog).where(AuditLog.actor_user_id == actor_id))
            await cleanup.execute(delete(User).where(User.id == actor_id))
            await cleanup.commit()
