from __future__ import annotations

import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    doctor = "doctor"
    nurse = "nurse"
    receptionist = "receptionist"
    cashier = "cashier"


class AppointmentStatus(str, enum.Enum):
    scheduled = "scheduled"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


class TranscriptionStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    issued = "issued"
    partially_paid = "partially_paid"
    paid = "paid"
    void = "void"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    bank_transfer = "bank_transfer"
    mobile_wallet = "mobile_wallet"
    other = "other"


class PaymentType(str, enum.Enum):
    payment = "payment"
    refund = "refund"
