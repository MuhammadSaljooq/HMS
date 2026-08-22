from __future__ import annotations

import uuid

import pytest

from app.main import app
from app.models.enums import UserRole
from app.services import clinic_service

pytestmark = pytest.mark.asyncio


def _region_payload() -> dict:
    suffix = uuid.uuid4().hex[:8]
    return {"name": f"Region {suffix}", "code": f"REG-{suffix}"}


def _clinic_payload(region_id: str | None = None) -> dict:
    suffix = uuid.uuid4().hex[:8]
    body = {"name": f"Clinic {suffix}", "code": f"CL-{suffix}", "timezone": "Asia/Karachi"}
    if region_id is not None:
        body["region_id"] = region_id
    return body


async def test_create_region_admin(client):
    resp = await client.post("/api/regions", json=_region_payload())
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["is_active"] is True
    assert data["code"].startswith("REG-")


async def test_create_clinic_admin(client):
    region = (await client.post("/api/regions", json=_region_payload())).json()
    resp = await client.post("/api/clinics", json=_clinic_payload(region["id"]))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["region_id"] == region["id"]
    assert data["timezone"] == "Asia/Karachi"


async def test_create_clinic_non_admin_forbidden(client, make_user):
    # Swap the authenticated user to a non-admin (receptionist).
    app.state.test_current_user = await make_user(UserRole.receptionist)
    resp = await client.post("/api/clinics", json=_clinic_payload())
    assert resp.status_code == 403, resp.text


async def test_list_clinics(client):
    created = (await client.post("/api/clinics", json=_clinic_payload())).json()
    resp = await client.get("/api/clinics")
    assert resp.status_code == 200
    ids = {c["id"] for c in resp.json()}
    assert created["id"] in ids


async def test_get_clinic_and_404(client):
    created = (await client.post("/api/clinics", json=_clinic_payload())).json()
    ok = await client.get(f"/api/clinics/{created['id']}")
    assert ok.status_code == 200
    missing = await client.get(f"/api/clinics/{uuid.uuid4()}")
    assert missing.status_code == 404


async def test_add_list_remove_membership(client, make_user):
    clinic = (await client.post("/api/clinics", json=_clinic_payload())).json()
    member = await make_user(UserRole.nurse)

    add = await client.post(
        f"/api/clinics/{clinic['id']}/members",
        json={"user_id": str(member.id), "is_primary": True},
    )
    assert add.status_code == 201, add.text
    assert add.json()["is_primary"] is True

    # Duplicate membership rejected.
    dup = await client.post(
        f"/api/clinics/{clinic['id']}/members",
        json={"user_id": str(member.id)},
    )
    assert dup.status_code == 409

    listed = await client.get(f"/api/clinics/{clinic['id']}/members")
    assert listed.status_code == 200
    assert any(m["user_id"] == str(member.id) for m in listed.json())

    removed = await client.delete(f"/api/clinics/{clinic['id']}/members/{member.id}")
    assert removed.status_code == 204

    listed_after = await client.get(f"/api/clinics/{clinic['id']}/members")
    assert all(m["user_id"] != str(member.id) for m in listed_after.json())


async def test_resolver_returns_primary_clinic(client, db_session, make_user):
    # Create two clinics directly via the service; make the second the primary.
    from app.schemas.clinic import ClinicCreate

    c1 = await clinic_service.create_clinic(db_session, ClinicCreate(**_clinic_payload()))
    c2 = await clinic_service.create_clinic(db_session, ClinicCreate(**_clinic_payload()))
    user = await make_user(UserRole.doctor)

    await clinic_service.add_member(db_session, c1.id, user.id, is_primary=False)
    await clinic_service.add_member(db_session, c2.id, user.id, is_primary=True)
    await db_session.flush()

    primary = await clinic_service.resolve_primary_clinic_id(db_session, user.id)
    assert primary == c2.id

    clinics = await clinic_service.resolve_user_clinics(db_session, user)
    clinic_ids = {c.id for c in clinics}
    assert {c1.id, c2.id}.issubset(clinic_ids)
