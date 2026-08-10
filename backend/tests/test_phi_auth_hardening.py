import uuid
from datetime import date

import pytest
from pydantic import ValidationError

from app.models import MedicalRecord, Patient
from app.models.enums import UserRole
from app.schemas.user import UserCreate
from app.services import auth_service


# --- B7: password policy ------------------------------------------------------


def test_password_policy_rejects_short_password():
    with pytest.raises(ValidationError):
        UserCreate(
            email="new@example.com",
            full_name="New User",
            role=UserRole.receptionist,
            password="short",
        )


def test_password_policy_rejects_missing_digit_or_letter():
    # 12+ chars but only letters -> must fail the letter+digit rule.
    with pytest.raises(ValidationError):
        UserCreate(
            email="new@example.com",
            full_name="New User",
            role=UserRole.receptionist,
            password="abcdefghijkl",
        )
    # 12+ chars but only digits -> must fail too.
    with pytest.raises(ValidationError):
        UserCreate(
            email="new2@example.com",
            full_name="New User",
            role=UserRole.receptionist,
            password="123456789012",
        )


def test_password_policy_accepts_compliant_password():
    body = UserCreate(
        email="ok@example.com",
        full_name="Ok User",
        role=UserRole.receptionist,
        password="TestPass1234",
    )
    assert body.password == "TestPass1234"


# --- B7: constant-time login still rejects unknown users ----------------------


@pytest.mark.asyncio
async def test_authenticate_user_returns_none_for_unknown_email(db_session):
    result = await auth_service.authenticate_user(
        db_session, "nobody-unknown@example.com", "AnyPassword123"
    )
    assert result is None


# --- B3: list endpoints honor the limit cap -----------------------------------


@pytest.mark.asyncio
async def test_list_records_honors_limit(client, make_user, db_session):
    doctor = await make_user(UserRole.doctor)
    patient = Patient(
        id=uuid.uuid4(),
        mrn=f"MRN-CAP-{uuid.uuid4().hex[:6]}",
        full_name="Cap Patient",
        date_of_birth=date(1990, 1, 1),
    )
    db_session.add(patient)
    await db_session.flush()

    for i in range(3):
        db_session.add(
            MedicalRecord(
                id=uuid.uuid4(),
                patient_id=patient.id,
                doctor_id=doctor.id,
                diagnosis=f"dx-{i}",
            )
        )
    await db_session.flush()

    resp = await client.get(f"/api/records?patient_id={patient.id}&limit=2")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 2
