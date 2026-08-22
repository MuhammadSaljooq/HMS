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
    reviewed = "reviewed"
    approved = "approved"


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


class Eye(str, enum.Enum):
    od = "od"
    os = "os"
    ou = "ou"


class AcuityDistance(str, enum.Enum):
    distance = "distance"
    near = "near"


class RefractionType(str, enum.Enum):
    manifest = "manifest"
    cycloplegic = "cycloplegic"
    autorefraction = "autorefraction"


class IOPMethod(str, enum.Enum):
    applanation = "applanation"
    noncontact = "noncontact"
    tonopen = "tonopen"
    other = "other"


class Laterality(str, enum.Enum):
    right = "right"
    left = "left"
    bilateral = "bilateral"
