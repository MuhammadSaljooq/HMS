import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.main import app
from app.models import Patient
from app.models.enums import UserRole
from app.utils.deps import get_current_user


async def _as_role(make_user, role):
    user = await make_user(role)
    app.state.test_current_user = user
    return user


@pytest.mark.asyncio
async def test_doctor_cannot_access_billing(client, make_user):
    await _as_role(make_user, UserRole.doctor)
    resp = await client.get("/api/billing/service-catalog")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cashier_can_list_catalog(client, make_user):
    await _as_role(make_user, UserRole.cashier)
    resp = await client.get("/api/billing/service-catalog")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_cashier_cannot_create_catalog_or_void(client, make_user, db_session):
    await _as_role(make_user, UserRole.cashier)
    resp = await client.post("/api/billing/service-catalog", json={"code": "X", "name": "X", "default_price": "10.00"})
    assert resp.status_code == 403
    resp2 = await client.post(f"/api/billing/invoices/{uuid.uuid4()}/void", json={"reason": "nope"})
    assert resp2.status_code == 403


@pytest.mark.asyncio
async def test_full_flow_over_http(client, make_user, db_session):
    await _as_role(make_user, UserRole.cashier)
    patient = Patient(id=uuid.uuid4(), mrn=f"MRN-H-{uuid.uuid4().hex[:6]}", full_name="HTTP Pat", date_of_birth=date(1990, 1, 1))
    db_session.add(patient)
    await db_session.flush()

    inv = (await client.post("/api/billing/invoices", json={"patient_id": str(patient.id)})).json()
    await client.post(f"/api/billing/invoices/{inv['id']}/line-items", json={"description": "Consult", "unit_price": "300.00", "quantity": 1})
    issued = (await client.post(f"/api/billing/invoices/{inv['id']}/issue")).json()
    assert issued["status"] == "issued"
    pay = await client.post(f"/api/billing/invoices/{inv['id']}/payments", json={"method": "cash", "amount": "300.00"})
    assert pay.status_code == 201
    detail = (await client.get(f"/api/billing/invoices/{inv['id']}")).json()
    assert detail["status"] == "paid"
    assert detail["balance_due"] == "0.00"


@pytest.mark.asyncio
async def test_cashier_reconciliation_forced_to_self(client, make_user, db_session):
    cashier = await _as_role(make_user, UserRole.cashier)
    patient = Patient(id=uuid.uuid4(), mrn=f"MRN-R-{uuid.uuid4().hex[:6]}", full_name="Recon Pat", date_of_birth=date(1990, 1, 1))
    db_session.add(patient)
    await db_session.flush()

    inv = (await client.post("/api/billing/invoices", json={"patient_id": str(patient.id)})).json()
    await client.post(f"/api/billing/invoices/{inv['id']}/line-items", json={"description": "Consult", "unit_price": "100.00", "quantity": 1})
    await client.post(f"/api/billing/invoices/{inv['id']}/issue")
    pay = await client.post(f"/api/billing/invoices/{inv['id']}/payments", json={"method": "cash", "amount": "100.00"})
    assert pay.status_code == 201

    other_id = uuid.uuid4()
    resp = await client.get(f"/api/billing/reports/reconciliation?cashier_id={other_id}")
    assert resp.status_code == 200
    body = resp.json()
    # A non-admin cannot scope the report to a different cashier; it is forced to self.
    assert body["cashier_id"] == str(cashier.id)
    assert body["cashier_id"] != str(other_id)
