from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AcuityDistance, Eye, IOPMethod, Laterality, RefractionType


# --- Visual acuity ---
class VisualAcuityBase(BaseModel):
    eye: Eye
    distance: AcuityDistance
    corrected: bool = False
    value: str = Field(max_length=16)
    pinhole: str | None = Field(default=None, max_length=16)


class VisualAcuityCreate(VisualAcuityBase):
    pass


class VisualAcuityRead(VisualAcuityBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    eye_exam_id: uuid.UUID


# --- Refraction ---
class RefractionBase(BaseModel):
    eye: Eye
    type: RefractionType
    sphere: Decimal | None = None
    cylinder: Decimal | None = None
    axis: int | None = Field(default=None, ge=0, le=180)
    add_power: Decimal | None = None
    prism: str | None = Field(default=None, max_length=32)
    pd: Decimal | None = None
    resulting_va: str | None = Field(default=None, max_length=16)


class RefractionCreate(RefractionBase):
    pass


class RefractionRead(RefractionBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    eye_exam_id: uuid.UUID


# --- IOP ---
class IOPMeasurementBase(BaseModel):
    eye: Eye
    mmhg: Decimal
    method: IOPMethod
    measured_at: datetime | None = None


class IOPMeasurementCreate(IOPMeasurementBase):
    pass


class IOPMeasurementRead(IOPMeasurementBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    eye_exam_id: uuid.UUID


# --- Keratometry ---
class KeratometryBase(BaseModel):
    eye: Eye
    k1: Decimal | None = None
    k2: Decimal | None = None
    axis: int | None = Field(default=None, ge=0, le=180)


class KeratometryCreate(KeratometryBase):
    pass


class KeratometryRead(KeratometryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    eye_exam_id: uuid.UUID


# --- Diagnosis ---
class DiagnosisBase(BaseModel):
    icd10_code: str = Field(max_length=16)
    description: str = Field(max_length=255)
    laterality: Laterality | None = None
    is_primary: bool = False


class DiagnosisCreate(DiagnosisBase):
    eye_exam_id: uuid.UUID | None = None


class DiagnosisRead(DiagnosisBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    medical_record_id: uuid.UUID
    eye_exam_id: uuid.UUID | None = None
    patient_id: uuid.UUID
    clinic_id: uuid.UUID | None = None


# --- Procedure ---
class ProcedureBase(BaseModel):
    cpt_code: str = Field(max_length=16)
    description: str = Field(max_length=255)
    eye: Eye | None = None
    quantity: int = Field(default=1, ge=1)


class ProcedureCreate(ProcedureBase):
    eye_exam_id: uuid.UUID | None = None


class ProcedureRead(ProcedureBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    medical_record_id: uuid.UUID
    eye_exam_id: uuid.UUID | None = None
    patient_id: uuid.UUID
    clinic_id: uuid.UUID | None = None


# --- Eye exam ---
class EyeExamBase(BaseModel):
    exam_date: datetime | None = None
    chief_complaint: str | None = Field(default=None, max_length=4000)
    history: str | None = Field(default=None, max_length=8000)
    assessment: str | None = Field(default=None, max_length=8000)
    plan: str | None = Field(default=None, max_length=8000)


class EyeExamCreate(EyeExamBase):
    # Optional nested children creatable in one shot.
    visual_acuities: list[VisualAcuityCreate] | None = None
    refractions: list[RefractionCreate] | None = None
    iop_measurements: list[IOPMeasurementCreate] | None = None
    keratometries: list[KeratometryCreate] | None = None
    diagnoses: list[DiagnosisCreate] | None = None
    procedures: list[ProcedureCreate] | None = None


class EyeExamUpdate(BaseModel):
    exam_date: datetime | None = None
    chief_complaint: str | None = Field(default=None, max_length=4000)
    history: str | None = Field(default=None, max_length=8000)
    assessment: str | None = Field(default=None, max_length=8000)
    plan: str | None = Field(default=None, max_length=8000)


class EyeExamRead(EyeExamBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    medical_record_id: uuid.UUID
    patient_id: uuid.UUID
    clinic_id: uuid.UUID | None = None
    exam_date: datetime
    created_at: datetime


class EyeExamDetailRead(EyeExamRead):
    visual_acuities: list[VisualAcuityRead] = []
    refractions: list[RefractionRead] = []
    iop_measurements: list[IOPMeasurementRead] = []
    keratometries: list[KeratometryRead] = []
    diagnoses: list[DiagnosisRead] = []
    procedures: list[ProcedureRead] = []
