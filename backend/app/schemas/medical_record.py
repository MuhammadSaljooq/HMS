from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.prescription import PrescriptionCreate, PrescriptionRead
from app.schemas.user import UserRead


class MedicalRecordBase(BaseModel):
    patient_id: uuid.UUID
    doctor_id: uuid.UUID
    appointment_id: uuid.UUID | None = None
    diagnosis: str | None = Field(default=None, max_length=8000)
    notes: str | None = Field(default=None, max_length=8000)


class MedicalRecordCreate(MedicalRecordBase):
    prescriptions: list[PrescriptionCreate] | None = None


class MedicalRecordUpdate(BaseModel):
    appointment_id: uuid.UUID | None = None
    diagnosis: str | None = Field(default=None, max_length=8000)
    notes: str | None = Field(default=None, max_length=8000)


class MedicalRecordRead(MedicalRecordBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime


class MedicalRecordDetailRead(MedicalRecordRead):
    doctor: UserRead | None = None
    prescriptions: list[PrescriptionRead] = []
