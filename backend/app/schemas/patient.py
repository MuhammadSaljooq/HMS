from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class PatientBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    date_of_birth: date
    gender: str | None = Field(default=None, max_length=32)
    phone: str | None = Field(default=None, max_length=64)
    address: str | None = Field(default=None, max_length=512)
    blood_group: str | None = Field(default=None, max_length=8)
    emergency_contact_name: str | None = Field(default=None, max_length=255)
    emergency_contact_phone: str | None = Field(default=None, max_length=64)


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=32)
    phone: str | None = Field(default=None, max_length=64)
    address: str | None = Field(default=None, max_length=512)
    blood_group: str | None = Field(default=None, max_length=8)
    emergency_contact_name: str | None = Field(default=None, max_length=255)
    emergency_contact_phone: str | None = Field(default=None, max_length=64)


class PatientRead(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    mrn: str
    created_at: datetime
    updated_at: datetime


class PatientListItem(PatientRead):
    last_visit: datetime | None = None


class PatientListResponse(BaseModel):
    items: list[PatientListItem]
    total: int
