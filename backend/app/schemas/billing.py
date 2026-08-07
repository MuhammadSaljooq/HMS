from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import InvoiceStatus, PaymentMethod, PaymentType


# ---- Service catalog ----
class ServiceCatalogCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    default_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class ServiceCatalogUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    default_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    is_active: bool | None = None


class ServiceCatalogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    default_price: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---- Invoices / line items ----
class InvoiceCreate(BaseModel):
    patient_id: uuid.UUID
    appointment_id: uuid.UUID | None = None
    medical_record_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)
    discount_total: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    tax_total: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)


class LineItemCreate(BaseModel):
    service_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=255)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    quantity: int = Field(default=1, ge=1)


class LineItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    service_id: uuid.UUID | None
    description: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal


class PaymentCreate(BaseModel):
    method: PaymentMethod
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    payment_type: PaymentType = PaymentType.payment
    reference: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=2000)


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    invoice_id: uuid.UUID
    receipt_number: str
    payment_type: PaymentType
    method: PaymentMethod
    amount: Decimal
    reference: str | None
    received_by: uuid.UUID
    received_at: datetime
    notes: str | None


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    invoice_number: str | None
    patient_id: uuid.UUID
    appointment_id: uuid.UUID | None
    medical_record_id: uuid.UUID | None
    status: InvoiceStatus
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total_amount: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    notes: str | None
    created_by: uuid.UUID
    issued_at: datetime | None
    voided_at: datetime | None
    void_reason: str | None
    created_at: datetime
    updated_at: datetime


class InvoiceDetail(InvoiceRead):
    line_items: list[LineItemRead] = []
    payments: list[PaymentRead] = []


class InvoiceListResponse(BaseModel):
    items: list[InvoiceRead]
    total: int


class VoidRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class PatientLookupItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str
    mrn: str


# ---- Reports ----
class MethodTotal(BaseModel):
    method: PaymentMethod
    payments: Decimal
    refunds: Decimal
    net: Decimal


class DailyReport(BaseModel):
    date: str
    totals: list[MethodTotal]
    net_total: Decimal


class ReconciliationReport(BaseModel):
    date: str
    cashier_id: uuid.UUID
    totals: list[MethodTotal]
    net_total: Decimal


class OutstandingItem(BaseModel):
    invoice_id: uuid.UUID
    invoice_number: str | None
    patient_id: uuid.UUID
    patient_name: str
    balance_due: Decimal
    status: InvoiceStatus


class RevenueByServiceItem(BaseModel):
    service_id: uuid.UUID | None
    description: str
    total_revenue: Decimal
