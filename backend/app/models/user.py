from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import UserRole
from app.utils.encryption import EncryptedString

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.medical_record import MedicalRecord
    from app.models.vitals import Vitals


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # --- MFA (TOTP), opt-in. Additive & nullable; existing users have MFA disabled. ---
    # Stored encrypted at rest via EncryptedString (PHI-grade key handling).
    mfa_secret: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
    mfa_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false"), default=False, nullable=False
    )
    mfa_enrolled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    appointments_as_doctor: Mapped[list["Appointment"]] = relationship(
        back_populates="doctor", foreign_keys="Appointment.doctor_id"
    )
    medical_records: Mapped[list["MedicalRecord"]] = relationship(
        back_populates="doctor", foreign_keys="MedicalRecord.doctor_id"
    )
    vitals_recorded: Mapped[list["Vitals"]] = relationship(
        back_populates="recorded_by_user", foreign_keys="Vitals.recorded_by"
    )
