from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import AcuityDistance, Eye, IOPMethod, Laterality, RefractionType
from app.models.mixins import SoftDeleteMixin
from app.utils.encryption import EncryptedString

if TYPE_CHECKING:
    from app.models.medical_record import MedicalRecord
    from app.models.patient import Patient


class EyeExam(Base, SoftDeleteMixin):
    __tablename__ = "eye_exams"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    medical_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("medical_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clinic_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True, index=True
    )
    exam_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    chief_complaint: Mapped[Optional[str]] = mapped_column(EncryptedString(4000), nullable=True)
    history: Mapped[Optional[str]] = mapped_column(EncryptedString(8000), nullable=True)
    assessment: Mapped[Optional[str]] = mapped_column(EncryptedString(8000), nullable=True)
    plan: Mapped[Optional[str]] = mapped_column(EncryptedString(8000), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    medical_record: Mapped["MedicalRecord"] = relationship()
    patient: Mapped["Patient"] = relationship()

    visual_acuities: Mapped[list["VisualAcuity"]] = relationship(
        back_populates="eye_exam", cascade="all, delete-orphan"
    )
    refractions: Mapped[list["Refraction"]] = relationship(
        back_populates="eye_exam", cascade="all, delete-orphan"
    )
    iop_measurements: Mapped[list["IOPMeasurement"]] = relationship(
        back_populates="eye_exam", cascade="all, delete-orphan"
    )
    keratometries: Mapped[list["Keratometry"]] = relationship(
        back_populates="eye_exam", cascade="all, delete-orphan"
    )
    diagnoses: Mapped[list["Diagnosis"]] = relationship(
        back_populates="eye_exam", cascade="all, delete-orphan"
    )
    procedures: Mapped[list["Procedure"]] = relationship(
        back_populates="eye_exam", cascade="all, delete-orphan"
    )


class VisualAcuity(Base):
    __tablename__ = "visual_acuities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    eye_exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eye_exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    eye: Mapped[Eye] = mapped_column(Enum(Eye, name="eye"), nullable=False)
    distance: Mapped[AcuityDistance] = mapped_column(
        Enum(AcuityDistance, name="acuity_distance"), nullable=False
    )
    corrected: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    value: Mapped[str] = mapped_column(String(16), nullable=False)
    pinhole: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    eye_exam: Mapped["EyeExam"] = relationship(back_populates="visual_acuities")


class Refraction(Base):
    __tablename__ = "refractions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    eye_exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eye_exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    eye: Mapped[Eye] = mapped_column(Enum(Eye, name="eye"), nullable=False)
    type: Mapped[RefractionType] = mapped_column(
        Enum(RefractionType, name="refraction_type"), nullable=False
    )
    sphere: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    cylinder: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    axis: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    add_power: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)
    prism: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    pd: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 1), nullable=True)
    resulting_va: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    eye_exam: Mapped["EyeExam"] = relationship(back_populates="refractions")


class IOPMeasurement(Base):
    __tablename__ = "iop_measurements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    eye_exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eye_exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    eye: Mapped[Eye] = mapped_column(Enum(Eye, name="eye"), nullable=False)
    mmhg: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    method: Mapped[IOPMethod] = mapped_column(Enum(IOPMethod, name="iop_method"), nullable=False)
    measured_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    eye_exam: Mapped["EyeExam"] = relationship(back_populates="iop_measurements")


class Keratometry(Base):
    __tablename__ = "keratometries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    eye_exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eye_exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    eye: Mapped[Eye] = mapped_column(Enum(Eye, name="eye"), nullable=False)
    k1: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    k2: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    axis: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    eye_exam: Mapped["EyeExam"] = relationship(back_populates="keratometries")


class Diagnosis(Base, SoftDeleteMixin):
    __tablename__ = "diagnoses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    medical_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("medical_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    eye_exam_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eye_exams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clinic_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True, index=True
    )
    icd10_code: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    laterality: Mapped[Optional[Laterality]] = mapped_column(
        Enum(Laterality, name="laterality"), nullable=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    eye_exam: Mapped[Optional["EyeExam"]] = relationship(back_populates="diagnoses")


class Procedure(Base, SoftDeleteMixin):
    __tablename__ = "procedures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    medical_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("medical_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    eye_exam_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eye_exams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clinic_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cpt_code: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    eye: Mapped[Optional[Eye]] = mapped_column(Enum(Eye, name="eye"), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    eye_exam: Mapped[Optional["EyeExam"]] = relationship(back_populates="procedures")
