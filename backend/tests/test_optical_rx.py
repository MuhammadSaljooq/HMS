from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import text

from app.main import app
from app.models import Patient, User
from app.models.enums import UserRole
from app.utils.security import hash_password


async def _as_role(make_user, role: UserRole) -> User:
    user = await make_user(role)
    app.state.test_current_user = user
    return user


async def _make_patient(db_session) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        mrn=f"MRN-RX-{uuid.uuid4().hex[:6]}",
        full_name="Rx Patient",
        date_of_birth=date(1970, 3, 3),
    )
    db_session.add(patient)
    await db_session.flush()
    return patient


async def _make_doctor(db_session) -> User:
    doctor = User(
        id=uuid.uuid4(),
        email=f"doctor-{uuid.uuid4().hex[:8]}@test.example.com",
        password_hash=hash_password("Test12345!"),
        role=UserRole.doctor,
        full_name="Rx Doctor",
        is_active=True,
    )
    db_session.add(doctor)
    await db_session.flush()
    return doctor


@pytest.mark.asyncio
async def test_create_and_get_spectacle_rx(client, make_user, db_session):
    admin = await _as_role(make_user, UserRole.admin)
    patient = await _make_patient(db_session)

    payload = {
        "od_sphere": "-2.00",
        "od_cylinder": "-0.75",
        "od_axis": 175,
        "os_sphere": "-1.75",
        "pd": "63.0",
        "lens_type": "single vision",
        "notes": "photochromic requested / فوٹو کرومک",
    }
    resp = await client.post(f"/api/patients/{patient.id}/spectacle-rx", json=payload)
    assert resp.status_code == 201, resp.text
    rx_id = resp.json()["id"]
    assert resp.json()["prescribed_by"] == str(admin.id)

    got = await client.get(f"/api/spectacle-rx/{rx_id}")
    assert got.status_code == 200
    assert got.json()["notes"] == "photochromic requested / فوٹو کرومک"

    listed = await client.get(f"/api/patients/{patient.id}/spectacle-rx")
    assert listed.status_code == 200
    assert len(listed.json()) == 1


@pytest.mark.asyncio
async def test_spectacle_notes_encrypted_at_rest(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    patient = await _make_patient(db_session)

    secret = "sensitive PHI note / رازداری"
    resp = await client.post(
        f"/api/patients/{patient.id}/spectacle-rx", json={"notes": secret}
    )
    assert resp.status_code == 201
    rx_id = uuid.UUID(resp.json()["id"])

    # API decrypts round-trip.
    assert resp.json()["notes"] == secret

    # Raw DB value must be ciphertext (not the plaintext).
    raw = (
        await db_session.execute(
            text("SELECT notes FROM spectacle_rx WHERE id = :id"), {"id": str(rx_id)}
        )
    ).scalar_one()
    assert raw is not None
    assert raw != secret


@pytest.mark.asyncio
async def test_create_and_get_contact_lens_rx(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    patient = await _make_patient(db_session)

    payload = {
        "od_brand": "Acuvue",
        "od_base_curve": "8.50",
        "od_diameter": "14.20",
        "od_power": "-3.00",
        "modality": "daily",
        "notes": "trial fit",
    }
    resp = await client.post(f"/api/patients/{patient.id}/contact-lens-rx", json=payload)
    assert resp.status_code == 201, resp.text
    rx_id = resp.json()["id"]

    got = await client.get(f"/api/contact-lens-rx/{rx_id}")
    assert got.status_code == 200
    assert got.json()["od_brand"] == "Acuvue"
    assert got.json()["notes"] == "trial fit"

    # Ciphertext check.
    raw = (
        await db_session.execute(
            text("SELECT notes FROM contact_lens_rx WHERE id = :id"), {"id": rx_id}
        )
    ).scalar_one()
    assert raw != "trial fit"


@pytest.mark.asyncio
async def test_cashier_cannot_create_or_view_rx(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    patient = await _make_patient(db_session)
    resp = await client.post(f"/api/patients/{patient.id}/spectacle-rx", json={})
    rx_id = resp.json()["id"]

    await _as_role(make_user, UserRole.cashier)
    assert (await client.post(f"/api/patients/{patient.id}/spectacle-rx", json={})).status_code == 403
    assert (await client.get(f"/api/spectacle-rx/{rx_id}")).status_code == 403


@pytest.mark.asyncio
async def test_soft_delete_hides_spectacle_rx(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    patient = await _make_patient(db_session)
    resp = await client.post(f"/api/patients/{patient.id}/spectacle-rx", json={})
    rx_id = resp.json()["id"]

    assert (await client.delete(f"/api/spectacle-rx/{rx_id}")).status_code == 204
    assert (await client.get(f"/api/spectacle-rx/{rx_id}")).status_code == 404
    listed = await client.get(f"/api/patients/{patient.id}/spectacle-rx")
    assert listed.json() == []
