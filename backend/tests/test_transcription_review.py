from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.main import app
from app.models import AuditLog, MedicalRecord, Patient, Transcription
from app.models.enums import TranscriptionStatus, UserRole
from app.services import transcription_service


async def _as_role(make_user, role):
    user = await make_user(role)
    app.state.test_current_user = user
    return user


async def _make_completed_transcription(db, cleaned="Initial cleaned transcript.") -> Transcription:
    tr = Transcription(
        id=uuid.uuid4(),
        medical_record_id=None,
        audio_file_url="https://example.test/audio.webm",
        cleaned_transcript=cleaned,
        status=TranscriptionStatus.completed,
    )
    db.add(tr)
    await db.flush()
    return tr


async def _make_patient(db) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        mrn=f"MRN-TR-{uuid.uuid4().hex[:6]}",
        full_name="Transcription Pat",
        date_of_birth=date(1985, 5, 5),
    )
    db.add(patient)
    await db.flush()
    return patient


@pytest.mark.asyncio
async def test_edit_sets_reviewed_and_audits(client, make_user, db_session):
    admin = await _as_role(make_user, UserRole.admin)
    tr = await _make_completed_transcription(db_session)

    resp = await client.patch(
        f"/api/transcriptions/{tr.id}",
        json={"cleaned_transcript": "Edited clinical note."},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["edited"] is True
    assert body["status"] == "reviewed"
    assert body["cleaned_transcript"] == "Edited clinical note."
    assert body["reviewed_by"] == str(admin.id)
    assert body["reviewed_at"] is not None

    audit = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "transcription.edit",
                AuditLog.entity_id == tr.id,
            )
        )
    ).scalar_one_or_none()
    assert audit is not None
    assert audit.actor_user_id == admin.id
    assert audit.entity_type == "transcription"


@pytest.mark.asyncio
async def test_approve_sets_approved_and_audits(client, make_user, db_session):
    admin = await _as_role(make_user, UserRole.admin)
    tr = await _make_completed_transcription(db_session)

    resp = await client.post(f"/api/transcriptions/{tr.id}/approve")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "approved"
    assert body["approved_by"] == str(admin.id)
    assert body["approved_at"] is not None

    audit = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "transcription.approve",
                AuditLog.entity_id == tr.id,
            )
        )
    ).scalar_one_or_none()
    assert audit is not None
    assert audit.actor_user_id == admin.id


@pytest.mark.asyncio
async def test_link_requires_approval(client, make_user, db_session):
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

    tr = await _make_completed_transcription(db_session)

    # Un-approved -> 400
    resp = await client.patch(
        f"/api/transcriptions/{tr.id}/link",
        json={"medical_record_id": str(record.id)},
    )
    assert resp.status_code == 400, resp.text
    assert "approved" in resp.json()["detail"].lower()

    # Approve, then link succeeds
    approve = await client.post(f"/api/transcriptions/{tr.id}/approve")
    assert approve.status_code == 200, approve.text

    link = await client.patch(
        f"/api/transcriptions/{tr.id}/link",
        json={"medical_record_id": str(record.id)},
    )
    assert link.status_code == 200, link.text
    assert link.json()["medical_record_id"] == str(record.id)


def test_gemini_request_uses_header_not_url_key():
    url, headers = transcription_service._build_gemini_request("gemini-2.5-flash", "SECRET_KEY")
    assert "key=" not in url
    assert "SECRET_KEY" not in url
    assert headers["x-goog-api-key"] == "SECRET_KEY"
    assert headers["Content-Type"] == "application/json"
