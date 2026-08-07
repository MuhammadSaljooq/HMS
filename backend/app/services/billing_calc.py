from __future__ import annotations

from decimal import Decimal

from app.models.enums import InvoiceStatus, PaymentType

CENTS = Decimal("0.01")


class PaymentValidationError(ValueError):
    """Raised when a payment/refund is not allowed."""


def _q(value: Decimal) -> Decimal:
    return value.quantize(CENTS)


def compute_line_total(unit_price: Decimal, quantity: int) -> Decimal:
    return _q(unit_price * Decimal(quantity))


def compute_totals(
    line_totals: list[Decimal], discount_total: Decimal, tax_total: Decimal
) -> tuple[Decimal, Decimal]:
    subtotal = _q(sum(line_totals, Decimal("0")))
    total = _q(subtotal - discount_total + tax_total)
    return subtotal, total


def net_paid(entries: list[tuple[PaymentType, Decimal]]) -> Decimal:
    total = Decimal("0")
    for kind, amount in entries:
        total += amount if kind == PaymentType.payment else -amount
    return _q(total)


def derive_status(
    *, total_amount: Decimal, amount_paid: Decimal, issued: bool, voided: bool
) -> InvoiceStatus:
    if voided:
        return InvoiceStatus.void
    if not issued:
        return InvoiceStatus.draft
    if amount_paid <= 0:
        return InvoiceStatus.issued
    if amount_paid >= total_amount:
        return InvoiceStatus.paid
    return InvoiceStatus.partially_paid


def validate_payment(
    *,
    payment_type: PaymentType,
    amount: Decimal,
    current_amount_paid: Decimal,
    total_amount: Decimal,
) -> None:
    if amount <= 0:
        raise PaymentValidationError("Amount must be positive.")
    if payment_type == PaymentType.payment:
        if current_amount_paid + amount > total_amount:
            raise PaymentValidationError("Payment exceeds the invoice balance.")
    else:  # refund
        if amount > current_amount_paid:
            raise PaymentValidationError("Refund exceeds the amount paid.")
