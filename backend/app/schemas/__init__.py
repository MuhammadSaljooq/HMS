from __future__ import annotations

from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentDetailRead,
    AppointmentRead,
    AppointmentUpdate,
)
from app.schemas.dashboard import DashboardStats
from app.schemas.medical_record import (
    MedicalRecordCreate,
    MedicalRecordDetailRead,
    MedicalRecordRead,
    MedicalRecordUpdate,
)
from app.schemas.patient import PatientCreate, PatientListResponse, PatientRead, PatientUpdate
from app.schemas.prescription import PrescriptionCreate, PrescriptionRead
from app.schemas.transcription import (
    TranscriptionCreate,
    TranscriptionJobQueued,
    TranscriptionJobStatus,
    TranscriptionPipelineResult,
    TranscriptionRead,
    TranscriptionSections,
    TranscriptionUpdate,
    TranscriptionUploadResponse,
)
from app.schemas.user import AuthUserResponse, UserCreate, UserRead, UserUpdate
from app.schemas.vitals import VitalsCreate, VitalsRead

__all__ = [
    "AppointmentCreate",
    "AppointmentDetailRead",
    "AppointmentRead",
    "AppointmentUpdate",
    "AuthUserResponse",
    "DashboardStats",
    "MedicalRecordCreate",
    "MedicalRecordDetailRead",
    "MedicalRecordRead",
    "MedicalRecordUpdate",
    "PatientCreate",
    "PatientListResponse",
    "PatientRead",
    "PatientUpdate",
    "PrescriptionCreate",
    "PrescriptionRead",
    "TranscriptionCreate",
    "TranscriptionJobQueued",
    "TranscriptionJobStatus",
    "TranscriptionPipelineResult",
    "TranscriptionRead",
    "TranscriptionSections",
    "TranscriptionUpdate",
    "TranscriptionUploadResponse",
    "UserCreate",
    "UserRead",
    "UserUpdate",
    "VitalsCreate",
    "VitalsRead",
]
