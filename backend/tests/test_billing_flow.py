from decimal import Decimal

import pytest

from app.models.enums import InvoiceStatus, PaymentMethod, PaymentType, UserRole
from app.services import billing_calc, billing_service
from app.models import Patient
import uuid
from datetime import date


async def _patient(db):
    p = Patient(id=uuid.uuid4(), mrn=f"MRN-T-{uuid.uuid4().hex[:6]}", full_name="Pat", date_of_birth=date(1990, 1, 1))
    db.add(p)
    await db.flush()
    return p


@pytest.mark.asyncio
async def test_full_invoice_payment_flow(db_session, make_user):
    cashier = await make_user(UserRole.cashier)
    patient = await _patient(db_session)
    svc = await billing_service.create_service(db_session, actor=cashier, code="CONSULT", name="Consult", description=None, default_price=Decimal("300.00"))

    inv = await billing_service.create_invoice(db_session, actor=cashier, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
    assert inv.status == InvoiceStatus.draft

    await billing_service.add_line_item(db_session, actor=cashier, invoice=inv, service_id=svc.id, description=None, unit_price=None, quantity=2)
    await db_session.refresh(inv)
    assert inv.subtotal == Decimal("600.00")
    assert inv.total_amount == Decimal("600.00")

    await billing_service.issue_invoice(db_session, actor=cashier, invoice=inv)
    await db_session.refresh(inv)
    assert inv.status == InvoiceStatus.issued
    assert inv.invoice_number is not None

    pay = await billing_service.record_payment(db_session, actor=cashier, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("250.00"), payment_type=PaymentType.payment, reference=None, notes=None)
    await db_session.refresh(inv)
    assert inv.status == InvoiceStatus.partially_paid
    assert inv.amount_paid == Decimal("250.00")
    assert inv.balance_due == Decimal("350.00")
    assert pay.receipt_number.startswith("RCP-")

    await billing_service.record_payment(db_session, actor=cashier, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("350.00"), payment_type=PaymentType.payment, reference=None, notes=None)
    await db_session.refresh(inv)
    assert inv.status == InvoiceStatus.paid
    assert inv.balance_due == Decimal("0.00")


@pytest.mark.asyncio
async def test_overpayment_rejected(db_session, make_user):
    cashier = await make_user(UserRole.cashier)
    patient = await _patient(db_session)
    inv = await billing_service.create_invoice(db_session, actor=cashier, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
    await billing_service.add_line_item(db_session, actor=cashier, invoice=inv, service_id=None, description="Ad hoc", unit_price=Decimal("100.00"), quantity=1)
    await billing_service.issue_invoice(db_session, actor=cashier, invoice=inv)
    with pytest.raises(billing_calc.PaymentValidationError):
        await billing_service.record_payment(db_session, actor=cashier, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("500.00"), payment_type=PaymentType.payment, reference=None, notes=None)


@pytest.mark.asyncio
async def test_issue_rejects_discount_over_subtotal(db_session, make_user):
    cashier = await make_user(UserRole.cashier)
    patient = await _patient(db_session)
    inv = await billing_service.create_invoice(db_session, actor=cashier, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("500.00"), tax_total=Decimal("0"))
    await billing_service.add_line_item(db_session, actor=cashier, invoice=inv, service_id=None, description="Ad hoc", unit_price=Decimal("100.00"), quantity=1)
    with pytest.raises(ValueError):
        await billing_service.issue_invoice(db_session, actor=cashier, invoice=inv)


@pytest.mark.asyncio
async def test_void_blocks_payment(db_session, make_user):
    admin = await make_user(UserRole.admin)
    patient = await _patient(db_session)
    inv = await billing_service.create_invoice(db_session, actor=admin, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
    await billing_service.add_line_item(db_session, actor=admin, invoice=inv, service_id=None, description="X", unit_price=Decimal("100.00"), quantity=1)
    await billing_service.issue_invoice(db_session, actor=admin, invoice=inv)
    await billing_service.void_invoice(db_session, actor=admin, invoice=inv, reason="test")
    await db_session.refresh(inv)
    assert inv.status == InvoiceStatus.void
    with pytest.raises(ValueError):
        await billing_service.record_payment(db_session, actor=admin, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("10.00"), payment_type=PaymentType.payment, reference=None, notes=None)
