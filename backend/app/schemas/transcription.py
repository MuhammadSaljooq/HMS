from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TranscriptionStatus


class TranscriptionBase(BaseModel):
    medical_record_id: uuid.UUID | None = None
    audio_file_url: str = Field(max_length=1024)
    duration_seconds: int | None = Field(default=None, ge=0, le=86400)


class TranscriptionCreate(TranscriptionBase):
    pass


class TranscriptionUpdate(BaseModel):
    raw_transcript: str | None = None
    cleaned_transcript: str | None = None
    language_detected: str | None = Field(default=None, max_length=64)
    status: TranscriptionStatus | None = None


class TranscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    medical_record_id: uuid.UUID | None
    audio_file_url: str
    raw_transcript: str | None
    cleaned_transcript: str | None
    language_detected: str | None
    status: TranscriptionStatus
    duration_seconds: int | None
    created_at: datetime


class TranscriptionListItem(TranscriptionRead):
    """Transcription row with optional patient name when linked to a record."""

    patient_full_name: str | None = None


class TranscriptionLinkBody(BaseModel):
    medical_record_id: uuid.UUID


class TranscriptionUploadResponse(BaseModel):
    transcription: TranscriptionRead
    message: str = "Upload received. Processing may continue asynchronously."


class TranscriptionSections(BaseModel):
    chief_complaint: str | None = None
    history: str | None = None
    examination: str | None = None
    assessment: str | None = None
    plan: str | None = None


class TranscriptionPipelineResult(BaseModel):
    """Structured result after Whisper + Claude (sync or completed async job)."""

    transcription_id: uuid.UUID
    raw_transcript: str | None
    cleaned_transcript: str | None
    language_detected: str | None
    status: TranscriptionStatus
    sections: TranscriptionSections


class TranscriptionJobQueued(BaseModel):
    job_id: str
    transcription_id: uuid.UUID
    message: str = "Transcription queued. Poll GET /api/transcribe/{job_id}/status until completed."


class TranscriptionJobStatus(BaseModel):
    job_id: str
    celery_state: str
    transcription_id: uuid.UUID | None = None
    transcription_status: TranscriptionStatus | None = None
    error: str | None = None
