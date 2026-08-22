from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.main import app
from app.models import MedicalRecord, Patient, User
from app.models.enums import UserRole
from app.utils.security import hash_password


async def _as_role(make_user, role: UserRole) -> User:
    user = await make_user(role)
    app.state.test_current_user = user
    return user


async def _make_patient(db_session) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        mrn=f"MRN-EYE-{uuid.uuid4().hex[:6]}",
        full_name="Eye Patient",
        date_of_birth=date(1985, 5, 5),
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
        full_name="Eye Doctor",
        is_active=True,
    )
    db_session.add(doctor)
    await db_session.flush()
    return doctor


async def _make_record(db_session, patient: Patient, doctor: User) -> MedicalRecord:
    record = MedicalRecord(
        id=uuid.uuid4(),
        patient_id=patient.id,
        doctor_id=doctor.id,
        diagnosis="baseline",
    )
    db_session.add(record)
    await db_session.flush()
    return record


@pytest.mark.asyncio
async def test_create_eye_exam_with_nested_children(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    doctor = await _make_doctor(db_session)
    patient = await _make_patient(db_session)
    record = await _make_record(db_session, patient, doctor)

    # Act as the doctor for creation.
    app.state.test_current_user = doctor

    payload = {
        "chief_complaint": "blurry vision / نظر دھندلی",
        "history": "1 month",
        "visual_acuities": [
            {"eye": "od", "distance": "distance", "corrected": False, "value": "20/40"}
        ],
        "refractions": [
            {"eye": "od", "type": "manifest", "sphere": "-1.25", "cylinder": "-0.50", "axis": 90}
        ],
        "iop_measurements": [{"eye": "od", "mmhg": "16.5", "method": "applanation"}],
        "keratometries": [{"eye": "od", "k1": "43.25", "k2": "44.00", "axis": 180}],
        "diagnoses": [
            {"icd10_code": "H52.13", "description": "Myopia, right eye", "laterality": "right",
             "is_primary": True}
        ],
        "procedures": [{"cpt_code": "92015", "description": "Refraction", "eye": "od", "quantity": 1}],
    }
    resp = await client.post(f"/api/medical-records/{record.id}/eye-exams", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["patient_id"] == str(patient.id)
    assert body["medical_record_id"] == str(record.id)
    assert body["chief_complaint"] == "blurry vision / نظر دھندلی"
    assert len(body["visual_acuities"]) == 1
    assert len(body["refractions"]) == 1
    assert len(body["iop_measurements"]) == 1
    assert len(body["keratometries"]) == 1
    assert len(body["diagnoses"]) == 1
    assert len(body["procedures"]) == 1
    assert body["diagnoses"][0]["is_primary"] is True


@pytest.mark.asyncio
async def test_add_children_then_get_with_children(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    doctor = await _make_doctor(db_session)
    patient = await _make_patient(db_session)
    record = await _make_record(db_session, patient, doctor)

    app.state.test_current_user = doctor
    resp = await client.post(f"/api/medical-records/{record.id}/eye-exams", json={})
    assert resp.status_code == 201
    exam_id = resp.json()["id"]

    assert (await client.post(
        f"/api/eye-exams/{exam_id}/acuities",
        json={"eye": "os", "distance": "near", "value": "20/25"},
    )).status_code == 201
    assert (await client.post(
        f"/api/eye-exams/{exam_id}/refractions",
        json={"eye": "os", "type": "cycloplegic", "sphere": "0.75"},
    )).status_code == 201
    assert (await client.post(
        f"/api/eye-exams/{exam_id}/iop",
        json={"eye": "os", "mmhg": "14.0", "method": "noncontact"},
    )).status_code == 201
    assert (await client.post(
        f"/api/eye-exams/{exam_id}/diagnoses",
        json={"icd10_code": "H40.11", "description": "POAG"},
    )).status_code == 201
    assert (await client.post(
        f"/api/eye-exams/{exam_id}/procedures",
        json={"cpt_code": "92083", "description": "Visual field"},
    )).status_code == 201

    got = await client.get(f"/api/eye-exams/{exam_id}")
    assert got.status_code == 200
    data = got.json()
    assert len(data["visual_acuities"]) == 1
    assert len(data["refractions"]) == 1
    assert len(data["iop_measurements"]) == 1
    assert len(data["diagnoses"]) == 1
    assert len(data["procedures"]) == 1


@pytest.mark.asyncio
async def test_cashier_cannot_create_exam(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    doctor = await _make_doctor(db_session)
    patient = await _make_patient(db_session)
    record = await _make_record(db_session, patient, doctor)

    await _as_role(make_user, UserRole.cashier)
    resp = await client.post(f"/api/medical-records/{record.id}/eye-exams", json={})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_nurse_can_view_but_not_edit(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    doctor = await _make_doctor(db_session)
    patient = await _make_patient(db_session)
    record = await _make_record(db_session, patient, doctor)

    app.state.test_current_user = doctor
    resp = await client.post(f"/api/medical-records/{record.id}/eye-exams", json={})
    exam_id = resp.json()["id"]

    await _as_role(make_user, UserRole.nurse)
    assert (await client.get(f"/api/eye-exams/{exam_id}")).status_code == 200
    assert (await client.get(f"/api/medical-records/{record.id}/eye-exams")).status_code == 200
    # Nurse cannot create/edit.
    assert (await client.post(f"/api/medical-records/{record.id}/eye-exams", json={})).status_code == 403
    assert (await client.patch(f"/api/eye-exams/{exam_id}", json={"plan": "x"})).status_code == 403


@pytest.mark.asyncio
async def test_soft_delete_hides_exam(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    doctor = await _make_doctor(db_session)
    patient = await _make_patient(db_session)
    record = await _make_record(db_session, patient, doctor)

    app.state.test_current_user = doctor
    resp = await client.post(f"/api/medical-records/{record.id}/eye-exams", json={})
    exam_id = resp.json()["id"]

    assert (await client.delete(f"/api/eye-exams/{exam_id}")).status_code == 204
    assert (await client.get(f"/api/eye-exams/{exam_id}")).status_code == 404
    listed = await client.get(f"/api/medical-records/{record.id}/eye-exams")
    assert listed.status_code == 200
    assert listed.json() == []
