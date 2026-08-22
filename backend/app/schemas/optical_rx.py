from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SpectacleRxBase(BaseModel):
    medical_record_id: uuid.UUID | None = None
    eye_exam_id: uuid.UUID | None = None

    od_sphere: Decimal | None = None
    od_cylinder: Decimal | None = None
    od_axis: int | None = Field(default=None, ge=0, le=180)
    od_add: Decimal | None = None
    od_prism: str | None = Field(default=None, max_length=32)

    os_sphere: Decimal | None = None
    os_cylinder: Decimal | None = None
    os_axis: int | None = Field(default=None, ge=0, le=180)
    os_add: Decimal | None = None
    os_prism: str | None = Field(default=None, max_length=32)

    pd: Decimal | None = None
    lens_type: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=4000)
    expires_at: datetime | None = None


class SpectacleRxCreate(SpectacleRxBase):
    pass


class SpectacleRxUpdate(SpectacleRxBase):
    pass


class SpectacleRxRead(SpectacleRxBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    clinic_id: uuid.UUID | None = None
    prescribed_by: uuid.UUID
    prescribed_at: datetime
    created_at: datetime


class ContactLensRxBase(BaseModel):
    medical_record_id: uuid.UUID | None = None
    eye_exam_id: uuid.UUID | None = None

    od_brand: str | None = Field(default=None, max_length=64)
    od_base_curve: Decimal | None = None
    od_diameter: Decimal | None = None
    od_power: Decimal | None = None
    od_cylinder: Decimal | None = None
    od_axis: int | None = Field(default=None, ge=0, le=180)
    od_add: Decimal | None = None

    os_brand: str | None = Field(default=None, max_length=64)
    os_base_curve: Decimal | None = None
    os_diameter: Decimal | None = None
    os_power: Decimal | None = None
    os_cylinder: Decimal | None = None
    os_axis: int | None = Field(default=None, ge=0, le=180)
    os_add: Decimal | None = None

    modality: str | None = Field(default=None, max_length=32)
    notes: str | None = Field(default=None, max_length=4000)
    expires_at: datetime | None = None


class ContactLensRxCreate(ContactLensRxBase):
    pass


class ContactLensRxUpdate(ContactLensRxBase):
    pass


class ContactLensRxRead(ContactLensRxBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    clinic_id: uuid.UUID | None = None
    prescribed_by: uuid.UUID
    prescribed_at: datetime
    created_at: datetime
