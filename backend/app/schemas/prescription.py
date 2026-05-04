from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class PrescriptionBase(BaseModel):
    medication_name: str = Field(min_length=1, max_length=255)
    dosage: str = Field(min_length=1, max_length=255)
    frequency: str = Field(min_length=1, max_length=255)
    duration_days: int | None = Field(default=None, ge=1, le=3650)
    instructions: str | None = Field(default=None, max_length=4000)


class PrescriptionCreate(PrescriptionBase):
    pass


class PrescriptionRead(PrescriptionBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    medical_record_id: uuid.UUID
