from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Patient, Transcription
from app.models.enums import TranscriptionStatus
from app.schemas.transcription import TranscriptionLinkBody
from app.services.soft_delete import not_deleted


async def create_pending_transcription(
    db: AsyncSession,
    *,
    medical_record_id: UUID | None,
    audio_file_url: str,
    duration_seconds: int | None = None,
) -> Transcription:
    transcription = Transcription(
        medical_record_id=medical_record_id,
        audio_file_url=audio_file_url,
        status=TranscriptionStatus.pending,
        duration_seconds=duration_seconds,
    )
    db.add(transcription)
    await db.flush()
    await db.refresh(transcription)
    return transcription


async def get_transcription_or_404(db: AsyncSession, transcription_id: UUID) -> Transcription:
    transcription = await db.get(Transcription, transcription_id)
    if transcription is None or transcription.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found.")
    return transcription


async def link_transcription_to_record(
    db: AsyncSession,
    transcription: Transcription,
    body: TranscriptionLinkBody,
) -> Transcription:
    if transcription.medical_record_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This transcription is already linked to a medical record.",
        )
    transcription.medical_record_id = body.medical_record_id
    await db.flush()
    await db.refresh(transcription)
    return transcription


def build_list_select():
    from sqlalchemy import or_

    from app.models import MedicalRecord

    return (
        select(Transcription, Patient.full_name.label("patient_full_name"))
        .outerjoin(MedicalRecord, Transcription.medical_record_id == MedicalRecord.id)
        .outerjoin(Patient, MedicalRecord.patient_id == Patient.id)
        .where(not_deleted(Transcription))
        .where(or_(MedicalRecord.id.is_(None), MedicalRecord.deleted_at.is_(None)))
        .order_by(Transcription.created_at.desc())
    )
