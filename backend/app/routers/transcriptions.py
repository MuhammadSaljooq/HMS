from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MedicalRecord, Patient, Transcription, User
from app.models.enums import TranscriptionStatus, UserRole
from app.schemas.transcription import TranscriptionLinkBody, TranscriptionListItem, TranscriptionRead, TranscriptionUploadResponse
from app.services import patient_service, storage_service, transcription_service
from app.utils.deps import get_current_user, get_db, require_role

router = APIRouter(prefix="/transcriptions", tags=["Transcriptions"])

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = {".webm", ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".mp4"}


async def _optional_record_access(db: AsyncSession, current: User, medical_record_id: UUID | None) -> None:
    if medical_record_id is None:
        return
    record = await db.get(MedicalRecord, medical_record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found.")
    if not await patient_service.user_can_view_patient(db, current, record.patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for linked record.")
    if current.role == UserRole.doctor and record.doctor_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctors may only attach transcriptions to their own medical records.",
        )


@router.post(
    "/upload",
    response_model=TranscriptionUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_transcription(
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
    file: UploadFile = File(..., description="Audio file (webm, mp3, wav, m4a, etc.)"),
    medical_record_id: UUID | None = Form(default=None),
) -> TranscriptionUploadResponse:
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
    if suffix and suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds maximum size of 50MB.",
        )
    await file.seek(0)

    await _optional_record_access(db, current, medical_record_id)

    url = await storage_service.save_upload(file, prefix="transcriptions")
    tr = Transcription(
        medical_record_id=medical_record_id,
        audio_file_url=url,
        status=TranscriptionStatus.pending,
    )
    db.add(tr)
    await db.flush()
    await db.refresh(tr)

    tr = await transcription_service.process_transcription(db, tr.id)
    await db.commit()
    await db.refresh(tr)

    return TranscriptionUploadResponse(
        transcription=TranscriptionRead.model_validate(tr),
        message="Transcription processed.",
    )


def _transcription_list_select():
    return (
        select(Transcription, Patient.full_name.label("patient_full_name"))
        .outerjoin(MedicalRecord, Transcription.medical_record_id == MedicalRecord.id)
        .outerjoin(Patient, MedicalRecord.patient_id == Patient.id)
        .order_by(Transcription.created_at.desc())
    )


@router.get("", response_model=list[TranscriptionListItem], status_code=status.HTTP_200_OK)
async def list_transcriptions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    medical_record_id: UUID | None = None,
) -> list[TranscriptionListItem]:
    stmt = _transcription_list_select()
    if medical_record_id is not None:
        stmt = stmt.where(Transcription.medical_record_id == medical_record_id)
        record = await db.get(MedicalRecord, medical_record_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found.")
        if not await patient_service.user_can_view_patient(db, current, record.patient_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
        if current.role == UserRole.doctor and record.doctor_id != current.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    elif current.role == UserRole.doctor:
        stmt = stmt.where(MedicalRecord.doctor_id == current.id).where(Transcription.medical_record_id.is_not(None))
    elif current.role == UserRole.admin:
        pass
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Provide medical_record_id or use an administrator account to list all transcriptions.",
        )
    result = await db.execute(stmt)
    out: list[TranscriptionListItem] = []
    for tr, patient_full_name in result.all():
        base = TranscriptionRead.model_validate(tr).model_dump()
        out.append(TranscriptionListItem(**base, patient_full_name=patient_full_name))
    return out


@router.patch(
    "/{transcription_id}/link",
    response_model=TranscriptionRead,
    status_code=status.HTTP_200_OK,
)
async def link_transcription_to_record(
    transcription_id: UUID,
    body: TranscriptionLinkBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
) -> Transcription:
    tr = await db.get(Transcription, transcription_id)
    if tr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found.")
    if tr.medical_record_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This transcription is already linked to a medical record.",
        )
    await _optional_record_access(db, current, body.medical_record_id)
    tr.medical_record_id = body.medical_record_id
    await db.flush()
    await db.refresh(tr)
    await db.commit()
    return tr


@router.get("/{transcription_id}", response_model=TranscriptionRead, status_code=status.HTTP_200_OK)
async def get_transcription(
    transcription_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Transcription:
    tr = await db.get(Transcription, transcription_id)
    if tr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found.")
    if tr.medical_record_id is None:
        if current.role not in (UserRole.admin, UserRole.doctor):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
        return tr
    record = await db.get(MedicalRecord, tr.medical_record_id)
    if record is None:
        return tr
    if not await patient_service.user_can_view_patient(db, current, record.patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if current.role == UserRole.doctor and record.doctor_id != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return tr
