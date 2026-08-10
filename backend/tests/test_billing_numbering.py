import pytest

from app.services import billing_service


@pytest.mark.asyncio
async def test_invoice_and_receipt_numbers_are_unique(db_session):
    a = await billing_service.generate_unique_invoice_number(db_session)
    b = await billing_service.generate_unique_invoice_number(db_session)
    assert a.startswith("INV-") and b.startswith("INV-") and a != b
    r = await billing_service.generate_unique_receipt_number(db_session)
    assert r.startswith("RCP-")
