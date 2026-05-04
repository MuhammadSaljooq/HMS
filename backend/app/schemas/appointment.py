from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AppointmentStatus
from app.schemas.patient import PatientRead
from app.schemas.user import UserRead


class AppointmentBase(BaseModel):
    patient_id: uuid.UUID
    doctor_id: uuid.UUID
    scheduled_at: datetime
    status: AppointmentStatus = AppointmentStatus.scheduled
    chief_complaint: str | None = Field(default=None, max_length=4000)
    notes: str | None = Field(default=None, max_length=8000)


class AppointmentCreate(AppointmentBase):
    pass


class AppointmentUpdate(BaseModel):
    doctor_id: uuid.UUID | None = None
    scheduled_at: datetime | None = None
    status: AppointmentStatus | None = None
    chief_complaint: str | None = Field(default=None, max_length=4000)
    notes: str | None = Field(default=None, max_length=8000)


class AppointmentRead(AppointmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime


class AppointmentListItem(AppointmentRead):
    patient_full_name: str
    doctor_full_name: str


class AppointmentDetailRead(AppointmentRead):
    doctor: UserRead | None = None
    patient: PatientRead | None = None


class AppointmentSlot(BaseModel):
    start: datetime
    end: datetime
    available: bool
