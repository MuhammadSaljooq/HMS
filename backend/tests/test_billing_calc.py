from decimal import Decimal

import pytest

from app.models.enums import InvoiceStatus, PaymentType
from app.services import billing_calc as calc


def test_line_total():
    assert calc.compute_line_total(Decimal("150.00"), 3) == Decimal("450.00")


def test_totals_with_discount_and_tax():
    subtotal, total = calc.compute_totals(
        [Decimal("450.00"), Decimal("50.00")], Decimal("100.00"), Decimal("0.00")
    )
    assert subtotal == Decimal("500.00")
    assert total == Decimal("400.00")


def test_net_paid_nets_refunds():
    entries = [
        (PaymentType.payment, Decimal("300.00")),
        (PaymentType.payment, Decimal("100.00")),
        (PaymentType.refund, Decimal("50.00")),
    ]
    assert calc.net_paid(entries) == Decimal("350.00")


@pytest.mark.parametrize(
    "total,paid,issued,voided,expected",
    [
        (Decimal("400"), Decimal("0"), False, False, InvoiceStatus.draft),
        (Decimal("400"), Decimal("0"), True, False, InvoiceStatus.issued),
        (Decimal("400"), Decimal("150"), True, False, InvoiceStatus.partially_paid),
        (Decimal("400"), Decimal("400"), True, False, InvoiceStatus.paid),
        (Decimal("400"), Decimal("450"), True, False, InvoiceStatus.paid),
        (Decimal("400"), Decimal("400"), True, True, InvoiceStatus.void),
    ],
)
def test_derive_status(total, paid, issued, voided, expected):
    assert calc.derive_status(total_amount=total, amount_paid=paid, issued=issued, voided=voided) == expected


def test_validate_payment_rejects_overpayment():
    with pytest.raises(calc.PaymentValidationError):
        calc.validate_payment(
            payment_type=PaymentType.payment,
            amount=Decimal("500.00"),
            current_amount_paid=Decimal("0.00"),
            total_amount=Decimal("400.00"),
        )


def test_validate_payment_rejects_refund_larger_than_paid():
    with pytest.raises(calc.PaymentValidationError):
        calc.validate_payment(
            payment_type=PaymentType.refund,
            amount=Decimal("100.00"),
            current_amount_paid=Decimal("50.00"),
            total_amount=Decimal("400.00"),
        )


def test_validate_payment_rejects_nonpositive():
    with pytest.raises(calc.PaymentValidationError):
        calc.validate_payment(
            payment_type=PaymentType.payment,
            amount=Decimal("0.00"),
            current_amount_paid=Decimal("0.00"),
            total_amount=Decimal("400.00"),
        )
