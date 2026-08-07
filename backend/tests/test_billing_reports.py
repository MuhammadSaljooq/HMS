from decimal import Decimal
from datetime import date, timezone

import pytest

from app.models.enums import PaymentMethod, PaymentType, UserRole
from app.services import billing_service
from app.models import Patient
import uuid
from datetime import date as _date


async def _patient(db):
    p = Patient(id=uuid.uuid4(), mrn=f"MRN-R-{uuid.uuid4().hex[:6]}", full_name="RPat", date_of_birth=_date(1990, 1, 1))
    db.add(p)
    await db.flush()
    return p


@pytest.mark.asyncio
async def test_daily_report_nets_by_method(db_session, make_user):
    cashier = await make_user(UserRole.cashier)
    patient = await _patient(db_session)
    inv = await billing_service.create_invoice(db_session, actor=cashier, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
    await billing_service.add_line_item(db_session, actor=cashier, invoice=inv, service_id=None, description="X", unit_price=Decimal("500.00"), quantity=1)
    await billing_service.issue_invoice(db_session, actor=cashier, invoice=inv)
    await billing_service.record_payment(db_session, actor=cashier, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("400.00"), payment_type=PaymentType.payment, reference=None, notes=None)
    await billing_service.record_payment(db_session, actor=cashier, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("50.00"), payment_type=PaymentType.refund, reference=None, notes=None)

    # Use the clinic-timezone "today" so a payment recorded "now" is bucketed
    # into the same Asia/Karachi day regardless of the host timezone.
    today = billing_service.today_local()
    report = await billing_service.daily_totals(db_session, day=today, cashier_id=cashier.id)
    cash = next(t for t in report["totals"] if t["method"] == PaymentMethod.cash)
    assert cash["payments"] == Decimal("400.00")
    assert cash["refunds"] == Decimal("50.00")
    assert cash["net"] == Decimal("350.00")
    assert report["net_total"] == Decimal("350.00")


@pytest.mark.asyncio
async def test_outstanding_lists_unpaid(db_session, make_user):
    cashier = await make_user(UserRole.cashier)
    patient = await _patient(db_session)
    inv = await billing_service.create_invoice(db_session, actor=cashier, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
    await billing_service.add_line_item(db_session, actor=cashier, invoice=inv, service_id=None, description="X", unit_price=Decimal("200.00"), quantity=1)
    await billing_service.issue_invoice(db_session, actor=cashier, invoice=inv)
    rows = await billing_service.outstanding(db_session)
    assert any(r["invoice_id"] == inv.id and r["balance_due"] == Decimal("200.00") for r in rows)
