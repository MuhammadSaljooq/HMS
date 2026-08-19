from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Appointment, MedicalRecord, User
from app.models.enums import UserRole
from app.services import patient_service


def can_manage_appointment(user: User, appt: Appointment) -> bool:
    if user.role in (UserRole.admin, UserRole.receptionist, UserRole.nurse):
        return True
    return user.role == UserRole.doctor and appt.doctor_id == user.id


def can_view_doctor_schedule(user: User, doctor_id: UUID) -> bool:
    if user.role in (UserRole.admin, UserRole.receptionist, UserRole.nurse):
        return True
    return user.role == UserRole.doctor and doctor_id == user.id


def can_write_record(user: User, record: MedicalRecord) -> bool:
    if user.role == UserRole.admin:
        return True
    return user.role == UserRole.doctor and record.doctor_id == user.id


def can_read_unlinked_transcription(user: User) -> bool:
    return user.role in (UserRole.admin, UserRole.doctor)


async def can_view_patient(db: AsyncSession, user: User, patient_id: UUID) -> bool:
    return await patient_service.user_can_view_patient(db, user, patient_id)


async def ensure_can_view_patient(
    db: AsyncSession,
    user: User,
    patient_id: UUID,
    *,
    detail: str = "Access denied for this patient.",
) -> None:
    if not await can_view_patient(db, user, patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


async def ensure_can_view_record(
    db: AsyncSession,
    user: User,
    record: MedicalRecord,
    *,
    detail: str = "Access denied.",
    doctor_detail: str = "Not your medical record.",
) -> None:
    await ensure_can_view_patient(db, user, record.patient_id, detail=detail)
    if user.role == UserRole.doctor and record.doctor_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=doctor_detail)


def ensure_can_write_record(user: User, record: MedicalRecord, *, detail: str = "Cannot update this record.") -> None:
    if not can_write_record(user, record):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


async def ensure_can_attach_transcription_to_record(
    db: AsyncSession,
    user: User,
    record: MedicalRecord,
) -> None:
    await ensure_can_view_patient(db, user, record.patient_id, detail="Access denied for linked record.")
    if user.role == UserRole.doctor and record.doctor_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctors may only attach transcriptions to their own medical records.",
        )


def ensure_can_manage_appointment(user: User, appt: Appointment) -> None:
    if not can_manage_appointment(user, appt):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot modify this appointment.")


def can_record_vitals(user: User) -> bool:
    return user.role in (UserRole.admin, UserRole.doctor, UserRole.nurse, UserRole.receptionist)


def requires_patient_filter_for_records(user: User) -> bool:
    return user.role in (UserRole.nurse, UserRole.receptionist)


def can_manage_billing(user: User) -> bool:
    return user.role in (UserRole.admin, UserRole.cashier)


def can_void_invoice(user: User) -> bool:
    return user.role == UserRole.admin


def can_manage_service_catalog(user: User) -> bool:
    return user.role == UserRole.admin


def can_view_all_reconciliation(user: User) -> bool:
    return user.role == UserRole.admin
