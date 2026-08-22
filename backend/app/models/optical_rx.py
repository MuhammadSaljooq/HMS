from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import SoftDeleteMixin
from app.utils.encryption import EncryptedString

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.user import User


class SpectacleRx(Base, SoftDeleteMixin):
    __tablename__ = "spectacle_rx"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    medical_record_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medical_records.id", ondelete="SET NULL"), nullable=True, index=True
    )
    eye_exam_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eye_exams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    clinic_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True, index=True
    )

    od_sphere: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    od_cylinder: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    od_axis: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    od_add: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)
    od_prism: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    os_sphere: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    os_cylinder: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    os_axis: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    os_add: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)
    os_prism: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    pd: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 1), nullable=True)
    lens_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(EncryptedString(4000), nullable=True)

    prescribed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    prescribed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

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

    patient: Mapped["Patient"] = relationship()
    prescriber: Mapped["User"] = relationship(foreign_keys=[prescribed_by])


class ContactLensRx(Base, SoftDeleteMixin):
    __tablename__ = "contact_lens_rx"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    medical_record_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medical_records.id", ondelete="SET NULL"), nullable=True, index=True
    )
    eye_exam_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eye_exams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    clinic_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True, index=True
    )

    od_brand: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    od_base_curve: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)
    od_diameter: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)
    od_power: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    od_cylinder: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    od_axis: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    od_add: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)

    os_brand: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    os_base_curve: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)
    os_diameter: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)
    os_power: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    os_cylinder: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    os_axis: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    os_add: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)

    modality: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(EncryptedString(4000), nullable=True)

    prescribed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    prescribed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

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

    patient: Mapped["Patient"] = relationship()
    prescriber: Mapped["User"] = relationship(foreign_keys=[prescribed_by])
