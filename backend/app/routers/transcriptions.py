from __future__ import annotations

from typing import Annotated
from uuid import UUID

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MedicalRecord, Transcription, User
from app.models.enums import TranscriptionStatus, UserRole
from app.schemas.transcription import (
    TranscriptionEdit,
    TranscriptionLinkBody,
    TranscriptionListItem,
    TranscriptionRead,
    TranscriptionUploadResponse,
)
from app.services import audit_service, storage_service, transcription_service, transcription_workflow_service
from app.services.authorization_service import (
    can_read_unlinked_transcription,
    ensure_can_attach_transcription_to_record,
    ensure_can_view_record,
)
from app.utils.deps import get_db, require_role

router = APIRouter(prefix="/transcriptions", tags=["Transcriptions"])

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = {".webm", ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".mp4"}


async def _optional_record_access(db: AsyncSession, current: User, medical_record_id: UUID | None) -> None:
    if medical_record_id is None:
        return
    record = await db.get(MedicalRecord, medical_record_id)
    if record is None or record.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found.")
    await ensure_can_attach_transcription_to_record(db, current, record)


async def _ensure_can_access_transcription(db: AsyncSession, current: User, tr: Transcription) -> None:
    """Mirror the read-access checks: unlinked transcriptions need admin/doctor;
    linked ones require view access to the underlying record."""
    if tr.medical_record_id is None:
        if not can_read_unlinked_transcription(current):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
        return
    record = await db.get(MedicalRecord, tr.medical_record_id)
    if record is None or record.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found.")
    await ensure_can_view_record(db, current, record)


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
    tr = await transcription_workflow_service.create_pending_transcription(
        db,
        medical_record_id=medical_record_id,
        audio_file_url=url,
    )
    tr = await transcription_service.process_transcription(db, tr.id)
    await db.commit()
    await db.refresh(tr)

    return TranscriptionUploadResponse(
        transcription=TranscriptionRead.model_validate(tr),
        message="Transcription processed.",
    )


def _transcription_list_select():
    return transcription_workflow_service.build_list_select()


@router.get("", response_model=list[TranscriptionListItem], status_code=status.HTTP_200_OK)
async def list_transcriptions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
    medical_record_id: UUID | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> list[TranscriptionListItem]:
    stmt = _transcription_list_select()
    if medical_record_id is not None:
        stmt = stmt.where(Transcription.medical_record_id == medical_record_id)
        record = await db.get(MedicalRecord, medical_record_id)
        if record is None or record.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found.")
        await ensure_can_view_record(db, current, record)
    elif current.role == UserRole.doctor:
        stmt = stmt.where(MedicalRecord.doctor_id == current.id).where(Transcription.medical_record_id.is_not(None))
    elif current.role == UserRole.admin:
        pass
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Provide medical_record_id or use an administrator account to list all transcriptions.",
        )
    stmt = stmt.offset(skip).limit(limit)
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
    tr = await transcription_workflow_service.get_transcription_or_404(db, transcription_id)
    if tr.status != TranscriptionStatus.approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transcription must be approved before linking.",
        )
    await _optional_record_access(db, current, body.medical_record_id)
    tr = await transcription_workflow_service.link_transcription_to_record(db, tr, body)
    await db.commit()
    return tr


@router.patch(
    "/{transcription_id}",
    response_model=TranscriptionRead,
    status_code=status.HTTP_200_OK,
)
async def edit_transcription(
    transcription_id: UUID,
    body: TranscriptionEdit,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
) -> Transcription:
    tr = await transcription_workflow_service.get_transcription_or_404(db, transcription_id)
    await _ensure_can_access_transcription(db, current, tr)
    tr.cleaned_transcript = body.cleaned_transcript
    tr.edited = True
    tr.status = TranscriptionStatus.reviewed
    tr.reviewed_at = datetime.now(timezone.utc)
    tr.reviewed_by = current.id
    await db.flush()
    await audit_service.record(
        db,
        actor=current,
        action="transcription.edit",
        entity_type="transcription",
        entity_id=tr.id,
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(tr)
    return tr


@router.post(
    "/{transcription_id}/approve",
    response_model=TranscriptionRead,
    status_code=status.HTTP_200_OK,
)
async def approve_transcription(
    transcription_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
) -> Transcription:
    tr = await transcription_workflow_service.get_transcription_or_404(db, transcription_id)
    await _ensure_can_access_transcription(db, current, tr)
    tr.status = TranscriptionStatus.approved
    tr.approved_at = datetime.now(timezone.utc)
    tr.approved_by = current.id
    await db.flush()
    await audit_service.record(
        db,
        actor=current,
        action="transcription.approve",
        entity_type="transcription",
        entity_id=tr.id,
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(tr)
    return tr


@router.get("/{transcription_id}", response_model=TranscriptionRead, status_code=status.HTTP_200_OK)
async def get_transcription(
    transcription_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
) -> Transcription:
    tr = await transcription_workflow_service.get_transcription_or_404(db, transcription_id)
    if tr.medical_record_id is None:
        if not can_read_unlinked_transcription(current):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
        return tr
    record = await db.get(MedicalRecord, tr.medical_record_id)
    if record is None or record.deleted_at is not None:
        return tr
    await ensure_can_view_record(db, current, record)
    return tr
