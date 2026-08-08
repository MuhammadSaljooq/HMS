from __future__ import annotations

import secrets
import uuid
from datetime import date as _date_type
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

# The clinic operates in Pakistan; day boundaries for reports are computed in
# Asia/Karachi (matching app/routers/dashboard.py) and converted to UTC.
TZ = ZoneInfo("Asia/Karachi")

from app.models import Invoice, InvoiceLineItem, Patient, Payment, ServiceCatalog, User
from app.models.enums import InvoiceStatus, PaymentMethod, PaymentType
from app.services import audit_service, billing_calc
from app.services.soft_delete import not_deleted


# ---- Number generators ----
async def _generate_unique(db: AsyncSession, prefix: str, column, model) -> str:
    for _ in range(50):
        year = datetime.now(timezone.utc).year
        candidate = f"{prefix}-{year}-{secrets.token_hex(3).upper()}"
        exists = await db.execute(select(model.id).where(column == candidate).limit(1))
        if exists.scalar_one_or_none() is None:
            return candidate
    raise RuntimeError(f"Could not generate a unique {prefix} number.")


async def generate_unique_invoice_number(db: AsyncSession) -> str:
    return await _generate_unique(db, "INV", Invoice.invoice_number, Invoice)


async def generate_unique_receipt_number(db: AsyncSession) -> str:
    return await _generate_unique(db, "RCP", Payment.receipt_number, Payment)


# ---- Service catalog ----
async def create_service(db, *, actor, code, name, description, default_price):
    svc = ServiceCatalog(code=code, name=name, description=description, default_price=default_price)
    db.add(svc)
    await db.flush()
    await audit_service.record(db, actor=actor, action="service.create", entity_type="service_catalog", entity_id=svc.id, metadata={"code": code})
    await db.refresh(svc)
    return svc


async def update_service(db, *, actor, service, name=None, description=None, default_price=None, is_active=None):
    if name is not None:
        service.name = name
    if description is not None:
        service.description = description
    if default_price is not None:
        service.default_price = default_price
    if is_active is not None:
        service.is_active = is_active
    await db.flush()
    await audit_service.record(db, actor=actor, action="service.update", entity_type="service_catalog", entity_id=service.id)
    await db.refresh(service)
    return service


async def list_services(db, *, active_only=False):
    stmt = select(ServiceCatalog).order_by(ServiceCatalog.code)
    if active_only:
        stmt = stmt.where(ServiceCatalog.is_active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


# ---- Patient lookup (billing-scoped) ----
async def lookup_patients(db, *, q, limit=20):
    like = f"%{q}%"
    stmt = (
        select(Patient)
        .where(or_(Patient.full_name.ilike(like), Patient.mrn.ilike(like)), not_deleted(Patient))
        .order_by(Patient.full_name)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


# ---- Invoice recompute ----
async def _recompute_invoice(db, invoice):
    lines = (await db.execute(select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice.id))).scalars().all()
    subtotal, total = billing_calc.compute_totals(
        [l.line_total for l in lines], invoice.discount_total, invoice.tax_total
    )
    pays = (await db.execute(select(Payment.payment_type, Payment.amount).where(Payment.invoice_id == invoice.id))).all()
    amount_paid = billing_calc.net_paid([(t, a) for t, a in pays])
    invoice.subtotal = subtotal
    invoice.total_amount = total
    invoice.amount_paid = amount_paid
    invoice.balance_due = (total - amount_paid).quantize(Decimal("0.01"))
    invoice.status = billing_calc.derive_status(
        total_amount=total,
        amount_paid=amount_paid,
        issued=invoice.issued_at is not None,
        voided=invoice.voided_at is not None,
    )
    await db.flush()


# ---- Invoice lifecycle ----
async def create_invoice(db, *, actor, patient_id, appointment_id, medical_record_id, notes, discount_total, tax_total):
    _patient = await db.get(Patient, patient_id)
    if _patient is None or _patient.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    inv = Invoice(
        patient_id=patient_id,
        appointment_id=appointment_id,
        medical_record_id=medical_record_id,
        notes=notes,
        discount_total=discount_total,
        tax_total=tax_total,
        status=InvoiceStatus.draft,
        created_by=actor.id,
    )
    db.add(inv)
    await db.flush()
    await _recompute_invoice(db, inv)
    await audit_service.record(db, actor=actor, action="invoice.create", entity_type="invoice", entity_id=inv.id, metadata={"patient_id": str(patient_id)})
    await db.refresh(inv)
    return inv


async def add_line_item(db, *, actor, invoice, service_id, description, unit_price, quantity):
    if invoice.status != InvoiceStatus.draft:
        raise ValueError("Cannot modify line items after the invoice is issued.")
    if service_id is not None:
        svc = await db.get(ServiceCatalog, service_id)
        if svc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
        desc = svc.name
        price = svc.default_price
    else:
        if description is None or unit_price is None:
            raise ValueError("Ad-hoc line items require description and unit_price.")
        desc = description
        price = unit_price
    line = InvoiceLineItem(
        invoice_id=invoice.id,
        service_id=service_id,
        description=desc,
        unit_price=price,
        quantity=quantity,
        line_total=billing_calc.compute_line_total(price, quantity),
    )
    db.add(line)
    await db.flush()
    await _recompute_invoice(db, invoice)
    await audit_service.record(db, actor=actor, action="invoice.add_line", entity_type="invoice", entity_id=invoice.id, metadata={"line_total": str(line.line_total)})
    return line


async def remove_line_item(db, *, actor, invoice, item_id):
    if invoice.status != InvoiceStatus.draft:
        raise ValueError("Cannot modify line items after the invoice is issued.")
    line = await db.get(InvoiceLineItem, item_id)
    if line is None or line.invoice_id != invoice.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found.")
    await db.delete(line)
    await db.flush()
    await _recompute_invoice(db, invoice)
    await audit_service.record(db, actor=actor, action="invoice.remove_line", entity_type="invoice", entity_id=invoice.id)


async def issue_invoice(db, *, actor, invoice):
    if invoice.status != InvoiceStatus.draft:
        raise ValueError("Only draft invoices can be issued.")
    await _recompute_invoice(db, invoice)
    if invoice.discount_total > invoice.subtotal:
        raise ValueError("Discount cannot exceed the invoice subtotal.")
    if invoice.invoice_number is None:
        invoice.invoice_number = await generate_unique_invoice_number(db)
    invoice.issued_at = datetime.now(timezone.utc)
    await _recompute_invoice(db, invoice)
    await audit_service.record(db, actor=actor, action="invoice.issue", entity_type="invoice", entity_id=invoice.id, metadata={"invoice_number": invoice.invoice_number})
    await db.refresh(invoice)
    return invoice


async def record_payment(db, *, actor, invoice_id, method, amount, payment_type, reference, notes):
    # Row-lock the invoice so concurrent payments serialize.
    locked = await db.execute(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
    invoice = locked.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    if invoice.status in (InvoiceStatus.draft, InvoiceStatus.void):
        raise ValueError("Cannot record a payment on a draft or void invoice.")
    billing_calc.validate_payment(
        payment_type=payment_type,
        amount=amount,
        current_amount_paid=invoice.amount_paid,
        total_amount=invoice.total_amount,
    )
    payment = Payment(
        invoice_id=invoice.id,
        receipt_number=await generate_unique_receipt_number(db),
        payment_type=payment_type,
        method=method,
        amount=amount,
        reference=reference,
        received_by=actor.id,
        notes=notes,
    )
    db.add(payment)
    await db.flush()
    await _recompute_invoice(db, invoice)
    await audit_service.record(db, actor=actor, action="payment.record", entity_type="payment", entity_id=payment.id, metadata={"invoice_id": str(invoice.id), "amount": str(amount), "type": payment_type.value})
    await db.refresh(payment)
    return payment


async def void_invoice(db, *, actor, invoice, reason):
    if invoice.status == InvoiceStatus.void:
        raise ValueError("Invoice is already void.")
    invoice.voided_at = datetime.now(timezone.utc)
    invoice.voided_by = actor.id
    invoice.void_reason = reason
    invoice.status = InvoiceStatus.void
    await db.flush()
    await audit_service.record(db, actor=actor, action="invoice.void", entity_type="invoice", entity_id=invoice.id, metadata={"reason": reason})
    await db.refresh(invoice)
    return invoice


async def get_invoice_detail(db, invoice_id):
    stmt = (
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(selectinload(Invoice.line_items), selectinload(Invoice.payments))
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_invoices(db, *, patient_id=None, status_filter=None, skip=0, limit=50):
    stmt = select(Invoice)
    count_stmt = select(func.count(Invoice.id))
    if patient_id is not None:
        stmt = stmt.where(Invoice.patient_id == patient_id)
        count_stmt = count_stmt.where(Invoice.patient_id == patient_id)
    if status_filter is not None:
        stmt = stmt.where(Invoice.status == status_filter)
        count_stmt = count_stmt.where(Invoice.status == status_filter)
    stmt = stmt.order_by(Invoice.created_at.desc()).offset(skip).limit(limit)
    items = list((await db.execute(stmt)).scalars().all())
    total = (await db.execute(count_stmt)).scalar_one()
    return items, total


# ---- Reports ----
def today_local() -> str:
    """Today's date in the clinic timezone (Asia/Karachi) as ISO YYYY-MM-DD."""
    return datetime.now(TZ).date().isoformat()


def _day_bounds(day: str):
    """Interpret ``day`` as an Asia/Karachi calendar day and return UTC-comparable
    tz-aware start (00:00:00) and end (23:59:59.999999) datetimes."""
    d = _date_type.fromisoformat(day)
    start = datetime(d.year, d.month, d.day, tzinfo=TZ).astimezone(timezone.utc)
    end = datetime(d.year, d.month, d.day, 23, 59, 59, 999999, tzinfo=TZ).astimezone(timezone.utc)
    return start, end


async def _method_totals(db, *, start, end, cashier_id=None):
    stmt = select(Payment.method, Payment.payment_type, func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.received_at >= start, Payment.received_at <= end
    )
    if cashier_id is not None:
        stmt = stmt.where(Payment.received_by == cashier_id)
    stmt = stmt.group_by(Payment.method, Payment.payment_type)
    rows = (await db.execute(stmt)).all()
    by_method: dict[PaymentMethod, dict] = {}
    for method, ptype, amount in rows:
        entry = by_method.setdefault(method, {"payments": Decimal("0"), "refunds": Decimal("0")})
        if ptype == PaymentType.payment:
            entry["payments"] += Decimal(amount)
        else:
            entry["refunds"] += Decimal(amount)
    totals = []
    net_total = Decimal("0")
    for method, entry in by_method.items():
        net = (entry["payments"] - entry["refunds"]).quantize(Decimal("0.01"))
        net_total += net
        totals.append({"method": method, "payments": entry["payments"], "refunds": entry["refunds"], "net": net})
    return totals, net_total.quantize(Decimal("0.01"))


async def daily_totals(db, *, day, cashier_id=None):
    start, end = _day_bounds(day)
    totals, net_total = await _method_totals(db, start=start, end=end, cashier_id=cashier_id)
    return {"date": day, "totals": totals, "net_total": net_total}


async def reconciliation(db, *, day, cashier_id):
    start, end = _day_bounds(day)
    totals, net_total = await _method_totals(db, start=start, end=end, cashier_id=cashier_id)
    return {"date": day, "cashier_id": cashier_id, "totals": totals, "net_total": net_total}


async def outstanding(db):
    stmt = (
        select(Invoice, Patient.full_name)
        .join(Patient, Patient.id == Invoice.patient_id)
        .where(Invoice.status.in_([InvoiceStatus.issued, InvoiceStatus.partially_paid]), Invoice.balance_due > 0)
        .order_by(Invoice.created_at.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "invoice_id": inv.id,
            "invoice_number": inv.invoice_number,
            "patient_id": inv.patient_id,
            "patient_name": name,
            "balance_due": inv.balance_due,
            "status": inv.status,
        }
        for inv, name in rows
    ]


async def revenue_by_service(db, *, start, end):
    stmt = (
        select(
            InvoiceLineItem.service_id,
            func.min(InvoiceLineItem.description),
            func.coalesce(func.sum(InvoiceLineItem.line_total), 0),
        )
        .join(Invoice, Invoice.id == InvoiceLineItem.invoice_id)
        .where(Invoice.status != InvoiceStatus.void, Invoice.issued_at >= start, Invoice.issued_at <= end)
        .group_by(InvoiceLineItem.service_id)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"service_id": service_id, "description": desc, "total_revenue": Decimal(total)}
        for service_id, desc, total in rows
    ]
