from __future__ import annotations

from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Invoice, Payment, ServiceCatalog, User
from app.models.enums import InvoiceStatus, UserRole
from app.schemas.billing import (
    DailyReport, InvoiceCreate, InvoiceDetail, InvoiceListResponse, InvoiceRead,
    LineItemCreate, LineItemRead, OutstandingItem, PatientLookupItem, PaymentCreate,
    PaymentRead, ReconciliationReport, RevenueByServiceItem, ServiceCatalogCreate,
    ServiceCatalogRead, ServiceCatalogUpdate, VoidRequest,
)
from app.services import authorization_service as authz
from app.services import billing_calc, billing_service
from app.utils.deps import get_current_user, get_db, require_role

router = APIRouter(prefix="/billing", tags=["Billing"])

BillingUser = Annotated[User, Depends(require_role(UserRole.admin, UserRole.cashier))]
AdminUser = Annotated[User, Depends(require_role(UserRole.admin))]
DB = Annotated[AsyncSession, Depends(get_db)]


async def _get_invoice_or_404(db: AsyncSession, invoice_id: UUID) -> Invoice:
    inv = await db.get(Invoice, invoice_id)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return inv


async def _get_service_or_404(db: AsyncSession, service_id: UUID) -> ServiceCatalog:
    svc = await db.get(ServiceCatalog, service_id)
    if svc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
    return svc


def _bad_request(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---- Service catalog ----
@router.get("/service-catalog", response_model=list[ServiceCatalogRead])
async def list_catalog(db: DB, current: BillingUser, active_only: bool = Query(False)):
    return await billing_service.list_services(db, active_only=active_only)


@router.post("/service-catalog", response_model=ServiceCatalogRead, status_code=status.HTTP_201_CREATED)
async def create_catalog(body: ServiceCatalogCreate, db: DB, current: AdminUser):
    svc = await billing_service.create_service(
        db, actor=current, code=body.code, name=body.name, description=body.description, default_price=body.default_price
    )
    await db.commit()
    return svc


@router.patch("/service-catalog/{service_id}", response_model=ServiceCatalogRead)
async def update_catalog(service_id: UUID, body: ServiceCatalogUpdate, db: DB, current: AdminUser):
    svc = await _get_service_or_404(db, service_id)
    svc = await billing_service.update_service(
        db, actor=current, service=svc, name=body.name, description=body.description,
        default_price=body.default_price, is_active=body.is_active,
    )
    await db.commit()
    return svc


# ---- Patient lookup ----
@router.get("/patients/lookup", response_model=list[PatientLookupItem])
async def patient_lookup(db: DB, current: BillingUser, q: str = Query(min_length=1)):
    return await billing_service.lookup_patients(db, q=q)


# ---- Invoices ----
@router.post("/invoices", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
async def create_invoice(body: InvoiceCreate, db: DB, current: BillingUser):
    inv = await billing_service.create_invoice(
        db, actor=current, patient_id=body.patient_id, appointment_id=body.appointment_id,
        medical_record_id=body.medical_record_id, notes=body.notes,
        discount_total=body.discount_total, tax_total=body.tax_total,
    )
    await db.commit()
    return inv


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    db: DB, current: BillingUser,
    patient_id: UUID | None = Query(None), status_filter: InvoiceStatus | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
):
    items, total = await billing_service.list_invoices(
        db, patient_id=patient_id, status_filter=status_filter, skip=skip, limit=limit
    )
    return InvoiceListResponse(items=items, total=total)


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetail)
async def get_invoice(invoice_id: UUID, db: DB, current: BillingUser):
    inv = await billing_service.get_invoice_detail(db, invoice_id)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return inv


@router.post("/invoices/{invoice_id}/line-items", response_model=LineItemRead, status_code=status.HTTP_201_CREATED)
async def add_line_item(invoice_id: UUID, body: LineItemCreate, db: DB, current: BillingUser):
    inv = await _get_invoice_or_404(db, invoice_id)
    try:
        line = await billing_service.add_line_item(
            db, actor=current, invoice=inv, service_id=body.service_id,
            description=body.description, unit_price=body.unit_price, quantity=body.quantity,
        )
    except ValueError as exc:
        raise _bad_request(exc)
    await db.commit()
    return line


@router.delete("/invoices/{invoice_id}/line-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_line_item(invoice_id: UUID, item_id: UUID, db: DB, current: BillingUser):
    inv = await _get_invoice_or_404(db, invoice_id)
    try:
        await billing_service.remove_line_item(db, actor=current, invoice=inv, item_id=item_id)
    except ValueError as exc:
        raise _bad_request(exc)
    await db.commit()


@router.post("/invoices/{invoice_id}/issue", response_model=InvoiceRead)
async def issue_invoice(invoice_id: UUID, db: DB, current: BillingUser):
    inv = await _get_invoice_or_404(db, invoice_id)
    try:
        inv = await billing_service.issue_invoice(db, actor=current, invoice=inv)
    except ValueError as exc:
        raise _bad_request(exc)
    await db.commit()
    return inv


@router.post("/invoices/{invoice_id}/payments", response_model=PaymentRead, status_code=status.HTTP_201_CREATED)
async def record_payment(invoice_id: UUID, body: PaymentCreate, db: DB, current: BillingUser):
    try:
        payment = await billing_service.record_payment(
            db, actor=current, invoice_id=invoice_id, method=body.method, amount=body.amount,
            payment_type=body.payment_type, reference=body.reference, notes=body.notes,
        )
    except billing_calc.PaymentValidationError as exc:
        raise _bad_request(exc)
    except ValueError as exc:
        raise _bad_request(exc)
    await db.commit()
    return payment


@router.get("/invoices/{invoice_id}/payments", response_model=list[PaymentRead])
async def list_payments(invoice_id: UUID, db: DB, current: BillingUser):
    inv = await billing_service.get_invoice_detail(db, invoice_id)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return inv.payments


@router.get("/payments/{payment_id}/receipt", response_model=PaymentRead)
async def get_receipt(payment_id: UUID, db: DB, current: BillingUser):
    payment = await db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")
    return payment


@router.post("/invoices/{invoice_id}/void", response_model=InvoiceRead)
async def void_invoice(invoice_id: UUID, body: VoidRequest, db: DB, current: AdminUser):
    inv = await _get_invoice_or_404(db, invoice_id)
    try:
        inv = await billing_service.void_invoice(db, actor=current, invoice=inv, reason=body.reason)
    except ValueError as exc:
        raise _bad_request(exc)
    await db.commit()
    return inv


@router.get("/patients/{patient_id}/invoices", response_model=InvoiceListResponse)
async def patient_invoices(patient_id: UUID, db: DB, current: BillingUser, skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)):
    items, total = await billing_service.list_invoices(db, patient_id=patient_id, skip=skip, limit=limit)
    return InvoiceListResponse(items=items, total=total)


# ---- Reports ----
@router.get("/reports/daily", response_model=DailyReport)
async def report_daily(db: DB, current: BillingUser, day: str = Query(alias="date", default_factory=billing_service.today_local)):
    cashier_id = None if authz.can_view_all_reconciliation(current) else current.id
    return await billing_service.daily_totals(db, day=day, cashier_id=cashier_id)


@router.get("/reports/reconciliation", response_model=ReconciliationReport)
async def report_reconciliation(db: DB, current: BillingUser, day: str = Query(alias="date", default_factory=billing_service.today_local), cashier_id: UUID | None = Query(None)):
    if authz.can_view_all_reconciliation(current):
        target = cashier_id or current.id
    else:
        target = current.id
    return await billing_service.reconciliation(db, day=day, cashier_id=target)


@router.get("/reports/outstanding", response_model=list[OutstandingItem])
async def report_outstanding(db: DB, current: AdminUser):
    return await billing_service.outstanding(db)


@router.get("/reports/revenue-by-service", response_model=list[RevenueByServiceItem])
async def report_revenue(db: DB, current: AdminUser, from_: str = Query(alias="from"), to: str = Query(...)):
    from datetime import datetime, timezone
    start = datetime.fromisoformat(from_).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(to).replace(tzinfo=timezone.utc)
    return await billing_service.revenue_by_service(db, start=start, end=end)
