from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class VitalsBase(BaseModel):
    blood_pressure_systolic: int | None = Field(default=None, ge=40, le=300)
    blood_pressure_diastolic: int | None = Field(default=None, ge=20, le=200)
    heart_rate: int | None = Field(default=None, ge=20, le=300)
    temperature_celsius: float | None = Field(default=None, ge=30.0, le=45.0)
    weight_kg: float | None = Field(default=None, ge=0.5, le=500.0)
    height_cm: float | None = Field(default=None, ge=20.0, le=300.0)


class VitalsCreate(VitalsBase):
    """Used when patient_id is provided separately (e.g. path param)."""

    pass


class VitalsRead(VitalsBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    recorded_by: uuid.UUID
    recorded_at: datetime
