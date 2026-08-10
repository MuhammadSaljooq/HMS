from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.config import get_settings
from app.models import MedicalRecord, Transcription, User
from app.models.enums import TranscriptionStatus, UserRole
from app.schemas.transcription import (
    TranscriptionJobQueued,
    TranscriptionJobStatus,
    TranscriptionPipelineResult,
    TranscriptionSections,
)
from app.services import storage_service, transcription_service, transcription_workflow_service
from app.services.authorization_service import (
    can_read_unlinked_transcription,
    ensure_can_attach_transcription_to_record,
    ensure_can_view_record,
)
from app.utils.deps import get_current_user, get_db, require_role

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transcribe", tags=["Transcribe"])

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = {".webm", ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".mp4"}
# If client does not send duration, treat large files as long audio → async
ASYNC_FALLBACK_BYTES = 5 * 1024 * 1024


async def _optional_record_access(db: AsyncSession, current: User, medical_record_id: UUID | None) -> None:
    if medical_record_id is None:
        return
    record = await db.get(MedicalRecord, medical_record_id)
    if record is None or record.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found.")
    await ensure_can_attach_transcription_to_record(db, current, record)


def _validate_audio(file: UploadFile, raw_size: int) -> str:
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
    if suffix and suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    if raw_size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds maximum size of 50MB.",
        )
    return suffix


def _use_async(duration_seconds: int | None, file_size: int, threshold: int) -> bool:
    if duration_seconds is not None:
        return duration_seconds >= threshold
    return file_size >= ASYNC_FALLBACK_BYTES


def _to_pipeline_result(tr: Transcription) -> TranscriptionPipelineResult:
    payload = transcription_service.build_pipeline_payload(tr)
    sec = payload["sections"]
    return TranscriptionPipelineResult(
        transcription_id=tr.id,
        raw_transcript=tr.raw_transcript,
        cleaned_transcript=tr.cleaned_transcript,
        language_detected=tr.language_detected,
        status=tr.status,
        sections=TranscriptionSections(
            chief_complaint=sec.get("chief_complaint"),
            history=sec.get("history"),
            examination=sec.get("examination"),
            assessment=sec.get("assessment"),
            plan=sec.get("plan"),
        ),
    )


async def _assert_can_read_transcription(db: AsyncSession, current: User, tr: Transcription) -> None:
    if tr.medical_record_id is None:
        if not can_read_unlinked_transcription(current):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
        return
    record = await db.get(MedicalRecord, tr.medical_record_id)
    if record is None or record.deleted_at is not None:
        return
    await ensure_can_view_record(db, current, record)


@router.post("", response_model=TranscriptionPipelineResult, status_code=status.HTTP_201_CREATED)
async def transcribe_sync(
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
    file: UploadFile = File(..., description="Audio (webm, mp3, wav, m4a, …)"),
    medical_record_id: UUID | None = Form(default=None),
    duration_seconds: int | None = Form(
        default=None,
        description="Recording length in seconds; if ≥30, use POST /transcribe/async instead.",
    ),
) -> TranscriptionPipelineResult:
    settings = get_settings()
    raw = await file.read()
    _validate_audio(file, len(raw))
    await file.seek(0)

    if duration_seconds is None and len(raw) >= ASYNC_FALLBACK_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Large audio without a duration hint must use POST /api/transcribe/async.",
        )
    if _use_async(duration_seconds, len(raw), settings.TRANSCRIBE_ASYNC_THRESHOLD_SECONDS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio is at or above the sync threshold. Use POST /api/transcribe/async instead.",
        )

    await _optional_record_access(db, current, medical_record_id)

    url = await storage_service.save_upload(file, prefix="transcriptions")
    tr = await transcription_workflow_service.create_pending_transcription(
        db,
        medical_record_id=medical_record_id,
        audio_file_url=url,
        duration_seconds=duration_seconds,
    )

    tr = await transcription_service.process_transcription(db, tr.id)
    await db.commit()
    await db.refresh(tr)
    return _to_pipeline_result(tr)


@router.post("/async", response_model=TranscriptionJobQueued, status_code=status.HTTP_202_ACCEPTED)
async def transcribe_async(
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
    file: UploadFile = File(...),
    medical_record_id: UUID | None = Form(default=None),
    duration_seconds: int | None = Form(default=None),
) -> TranscriptionJobQueued:
    settings = get_settings()
    raw = await file.read()
    _validate_audio(file, len(raw))
    await file.seek(0)

    if duration_seconds is not None and duration_seconds < settings.TRANSCRIBE_ASYNC_THRESHOLD_SECONDS:
        if len(raw) < ASYNC_FALLBACK_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Short clips can use POST /api/transcribe for synchronous processing.",
            )

    await _optional_record_access(db, current, medical_record_id)

    url = await storage_service.save_upload(file, prefix="transcriptions")
    tr = await transcription_workflow_service.create_pending_transcription(
        db,
        medical_record_id=medical_record_id,
        audio_file_url=url,
        duration_seconds=duration_seconds,
    )
    await db.commit()

    try:
        from app.tasks.transcribe_task import process_transcription_async

        async_result = process_transcription_async.delay(str(tr.id))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to queue transcription")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Celery broker unavailable or misconfigured: {exc!s}. Check CELERY_BROKER_URL and Redis.",
        ) from exc

    return TranscriptionJobQueued(job_id=async_result.id, transcription_id=tr.id)


@router.get("/{job_id}/status", response_model=TranscriptionJobStatus, status_code=status.HTTP_200_OK)
async def transcribe_job_status(
    job_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    transcription_id: UUID | None = Query(
        default=None,
        description="ID returned with the job; include while the task is PENDING so status can load the row.",
    ),
) -> TranscriptionJobStatus:
    ar = AsyncResult(job_id, app=celery_app)
    meta_tid: str | None = None
    if isinstance(ar.info, dict):
        meta_tid = ar.info.get("transcription_id")

    tid: UUID | None = transcription_id
    if tid is None and meta_tid:
        try:
            tid = UUID(meta_tid)
        except ValueError:
            tid = None
    tr_status: TranscriptionStatus | None = None
    err: str | None = None

    if tid is not None:
        tr = await db.get(Transcription, tid)
        if tr is not None:
            await _assert_can_read_transcription(db, current, tr)
            tr_status = tr.status
        else:
            err = "Transcription row not found for this job."

    if ar.failed():
        err = str(ar.result) if ar.result is not None else "Celery task failed."

    return TranscriptionJobStatus(
        job_id=job_id,
        celery_state=ar.state,
        transcription_id=tid,
        transcription_status=tr_status,
        error=err,
    )


@router.get("/{transcription_id}", response_model=TranscriptionPipelineResult, status_code=status.HTTP_200_OK)
async def get_transcription_result(
    transcription_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TranscriptionPipelineResult:
    tr = await transcription_workflow_service.get_transcription_or_404(db, transcription_id)
    await _assert_can_read_transcription(db, current, tr)
    return _to_pipeline_result(tr)
