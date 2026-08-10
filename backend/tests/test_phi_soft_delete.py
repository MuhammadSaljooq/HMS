from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.main import app
from app.models import AuditLog, MedicalRecord, Patient, Transcription
from app.models.enums import TranscriptionStatus, UserRole


async def _as_role(make_user, role):
    user = await make_user(role)
    app.state.test_current_user = user
    return user


async def _make_patient(db) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        mrn=f"MRN-SD-{uuid.uuid4().hex[:6]}",
        full_name="Soft Delete Pat",
        date_of_birth=date(1990, 1, 1),
    )
    db.add(patient)
    await db.flush()
    return patient


@pytest.mark.asyncio
async def test_delete_patient_soft_deletes_and_audits(client, make_user, db_session):
    admin = await _as_role(make_user, UserRole.admin)
    patient = await _make_patient(db_session)

    # DELETE returns 204.
    resp = await client.delete(f"/api/patients/{patient.id}")
    assert resp.status_code == 204

    # GET now 404.
    get_resp = await client.get(f"/api/patients/{patient.id}")
    assert get_resp.status_code == 404

    # Absent from the list.
    list_resp = await client.get("/api/patients")
    assert list_resp.status_code == 200
    ids = [item["id"] for item in list_resp.json()["items"]]
    assert str(patient.id) not in ids

    # Row still exists in the DB with deleted_at set (read raw columns to avoid
    # lazy-load IO on identity-mapped/expired ORM instances).
    row = (
        await db_session.execute(
            select(Patient.id, Patient.deleted_at, Patient.deleted_by).where(Patient.id == patient.id)
        )
    ).one_or_none()
    assert row is not None
    assert row.deleted_at is not None
    assert row.deleted_by == admin.id

    # An audit log row was written for the delete.
    audit = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "patient.delete",
                AuditLog.entity_id == patient.id,
            )
        )
    ).scalar_one_or_none()
    assert audit is not None
    assert audit.actor_user_id == admin.id
    assert audit.entity_type == "patient"


@pytest.mark.asyncio
async def test_delete_patient_cascades_to_children(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    doctor = await make_user(UserRole.doctor)
    patient = await _make_patient(db_session)

    record = MedicalRecord(
        id=uuid.uuid4(),
        patient_id=patient.id,
        doctor_id=doctor.id,
        diagnosis="dx",
    )
    db_session.add(record)
    await db_session.flush()

    resp = await client.delete(f"/api/patients/{patient.id}")
    assert resp.status_code == 204

    rec = (
        await db_session.execute(
            select(MedicalRecord.deleted_at).where(MedicalRecord.id == record.id)
        )
    ).one()
    assert rec.deleted_at is not None

    # The record is hidden from the records listing.
    list_resp = await client.get(f"/api/records?patient_id={patient.id}")
    assert list_resp.status_code == 404 or (
        list_resp.status_code == 200 and record_absent(list_resp.json(), record.id)
    )


def record_absent(rows, record_id) -> bool:
    return str(record_id) not in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_delete_record_hides_it_and_unlinks_transcriptions(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    doctor = await make_user(UserRole.doctor)
    patient = await _make_patient(db_session)

    record = MedicalRecord(
        id=uuid.uuid4(),
        patient_id=patient.id,
        doctor_id=doctor.id,
        diagnosis="dx",
    )
    db_session.add(record)
    await db_session.flush()

    transcription = Transcription(
        id=uuid.uuid4(),
        medical_record_id=record.id,
        audio_file_url="https://example.test/audio.webm",
        status=TranscriptionStatus.completed,
    )
    db_session.add(transcription)
    await db_session.flush()

    # Record visible before delete.
    before = await client.get(f"/api/records?patient_id={patient.id}")
    assert before.status_code == 200
    assert str(record.id) in [r["id"] for r in before.json()]

    # Soft-delete the record.
    resp = await client.delete(f"/api/records/{record.id}")
    assert resp.status_code == 204

    # Hidden from the list.
    after = await client.get(f"/api/records?patient_id={patient.id}")
    assert after.status_code == 200
    assert str(record.id) not in [r["id"] for r in after.json()]

    # GET 404.
    get_resp = await client.get(f"/api/records/{record.id}")
    assert get_resp.status_code == 404

    # Record row still present with deleted_at.
    rec = (
        await db_session.execute(
            select(MedicalRecord.deleted_at).where(MedicalRecord.id == record.id)
        )
    ).one()
    assert rec.deleted_at is not None

    # Transcription NOT deleted, but unlinked.
    tr = (
        await db_session.execute(
            select(Transcription.deleted_at, Transcription.medical_record_id).where(
                Transcription.id == transcription.id
            )
        )
    ).one()
    assert tr.deleted_at is None
    assert tr.medical_record_id is None

    # Audit row for record.delete.
    audit = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "record.delete",
                AuditLog.entity_id == record.id,
            )
        )
    ).scalar_one_or_none()
    assert audit is not None
