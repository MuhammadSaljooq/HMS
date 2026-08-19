from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.main import app
from app.models import Patient, User
from app.models.enums import UserRole
from app.utils.security import hash_password

TZ = ZoneInfo("Asia/Karachi")


async def _as_role(make_user, role: UserRole) -> User:
    user = await make_user(role)
    app.state.test_current_user = user
    return user


async def _seed_patient(db_session) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        mrn=f"MRN-RBAC-{uuid.uuid4().hex[:6]}",
        full_name="RBAC Patient",
        date_of_birth=date(1990, 1, 1),
    )
    db_session.add(patient)
    await db_session.flush()
    return patient


async def _seed_doctor(db_session) -> User:
    doctor = User(
        id=uuid.uuid4(),
        email=f"doctor-{uuid.uuid4().hex[:8]}@test.example.com",
        password_hash=hash_password("Test12345!"),
        role=UserRole.doctor,
        full_name="RBAC Doctor",
        is_active=True,
    )
    db_session.add(doctor)
    await db_session.flush()
    return doctor


def _future_slot() -> datetime:
    day = date.today() + timedelta(days=1)
    return datetime.combine(day, time(10, 0), tzinfo=TZ)


# --- cashier is excluded from clinical reads ---------------------------------


@pytest.mark.asyncio
async def test_cashier_cannot_list_patients(client, make_user):
    await _as_role(make_user, UserRole.cashier)
    resp = await client.get("/api/patients")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cashier_cannot_list_appointments(client, make_user):
    await _as_role(make_user, UserRole.cashier)
    resp = await client.get("/api/appointments")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cashier_cannot_list_records(client, make_user):
    await _as_role(make_user, UserRole.cashier)
    resp = await client.get(f"/api/records?patient_id={uuid.uuid4()}")
    assert resp.status_code == 403


# --- nurse can manage appointments and view (not write) records --------------


@pytest.mark.asyncio
async def test_nurse_can_create_appointment(client, make_user, db_session):
    await _as_role(make_user, UserRole.nurse)
    patient = await _seed_patient(db_session)
    doctor = await _seed_doctor(db_session)
    resp = await client.post(
        "/api/appointments",
        json={
            "patient_id": str(patient.id),
            "doctor_id": str(doctor.id),
            "scheduled_at": _future_slot().isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_nurse_can_view_records(client, make_user, db_session):
    await _as_role(make_user, UserRole.nurse)
    patient = await _seed_patient(db_session)
    resp = await client.get(f"/api/records?patient_id={patient.id}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_nurse_cannot_create_record(client, make_user, db_session):
    await _as_role(make_user, UserRole.nurse)
    patient = await _seed_patient(db_session)
    doctor = await _seed_doctor(db_session)
    resp = await client.post(
        "/api/records",
        json={"patient_id": str(patient.id), "doctor_id": str(doctor.id)},
    )
    assert resp.status_code == 403


# --- receptionist: view records, no write, no transcriptions -----------------


@pytest.mark.asyncio
async def test_receptionist_can_view_records(client, make_user, db_session):
    await _as_role(make_user, UserRole.receptionist)
    patient = await _seed_patient(db_session)
    resp = await client.get(f"/api/records?patient_id={patient.id}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_receptionist_cannot_create_record(client, make_user, db_session):
    await _as_role(make_user, UserRole.receptionist)
    patient = await _seed_patient(db_session)
    doctor = await _seed_doctor(db_session)
    resp = await client.post(
        "/api/records",
        json={"patient_id": str(patient.id), "doctor_id": str(doctor.id)},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_receptionist_cannot_list_transcriptions(client, make_user):
    await _as_role(make_user, UserRole.receptionist)
    resp = await client.get("/api/transcriptions")
    assert resp.status_code == 403


# --- doctor: transcriptions allowed, billing forbidden -----------------------


@pytest.mark.asyncio
async def test_doctor_can_list_transcriptions(client, make_user):
    await _as_role(make_user, UserRole.doctor)
    resp = await client.get("/api/transcriptions")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_doctor_cannot_list_invoices(client, make_user):
    await _as_role(make_user, UserRole.doctor)
    resp = await client.get("/api/billing/invoices")
    assert resp.status_code == 403
