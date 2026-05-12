from __future__ import annotations

from uuid import UUID

from app.models import Appointment, MedicalRecord, User
from app.models.enums import UserRole


def can_manage_appointment(user: User, appt: Appointment) -> bool:
    if user.role in (UserRole.admin, UserRole.receptionist):
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


def can_record_vitals(user: User) -> bool:
    return user.role in (UserRole.admin, UserRole.doctor, UserRole.nurse, UserRole.receptionist)


def requires_patient_filter_for_records(user: User) -> bool:
    return user.role in (UserRole.nurse, UserRole.receptionist)
