from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import asc, desc, func, nulls_last, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Appointment, MedicalRecord, Patient, User
from app.models.enums import UserRole
from app.schemas.patient import PatientCreate, PatientUpdate


async def generate_unique_mrn(db: AsyncSession) -> str:
    for _ in range(50):
        suffix = secrets.token_hex(3).upper()
        year = datetime.now(timezone.utc).year
        mrn = f"MRN-{year}-{suffix}"
        exists = await db.execute(select(Patient.id).where(Patient.mrn == mrn).limit(1))
        if exists.scalar_one_or_none() is None:
            return mrn
    raise RuntimeError("Could not generate a unique MRN.")


async def doctor_patient_ids(db: AsyncSession, doctor_id: UUID) -> set[UUID]:
    appt = select(Appointment.patient_id).where(Appointment.doctor_id == doctor_id)
    rec = select(MedicalRecord.patient_id).where(MedicalRecord.doctor_id == doctor_id)
    ids: set[UUID] = set()
    for row in (await db.execute(appt)).all():
        ids.add(row[0])
    for row in (await db.execute(rec)).all():
        ids.add(row[0])
    return ids


async def user_can_view_patient(db: AsyncSession, user: User, patient_id: UUID) -> bool:
    if user.role == UserRole.admin:
        return True
    if user.role in (UserRole.nurse, UserRole.receptionist):
        return True
    if user.role == UserRole.doctor:
        allowed = await doctor_patient_ids(db, user.id)
        return patient_id in allowed
    return False


async def user_can_edit_patient(user: User) -> bool:
    return user.role in (UserRole.admin, UserRole.receptionist)


async def create_patient(db: AsyncSession, data: PatientCreate) -> Patient:
    mrn = await generate_unique_mrn(db)
    patient = Patient(
        mrn=mrn,
        full_name=data.full_name,
        date_of_birth=data.date_of_birth,
        gender=data.gender,
        phone=data.phone,
        address=data.address,
        blood_group=data.blood_group,
        emergency_contact_name=data.emergency_contact_name,
        emergency_contact_phone=data.emergency_contact_phone,
    )
    db.add(patient)
    await db.flush()
    await db.refresh(patient)
    return patient


async def update_patient(db: AsyncSession, patient: Patient, data: PatientUpdate) -> Patient:
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(patient, field, value)
    patient.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(patient)
    return patient


def _patient_list_order(sort_by: str | None, sort_order: str) -> list:
    """Build ORDER BY clause for patient list (newest patients first when unset)."""
    descending = sort_order.lower() == "desc"
    direction = desc if descending else asc

    key = (sort_by or "created_at").lower()
    if key == "age":
        # Descending age column = oldest patients first (earliest DOB). Ascending = youngest first.
        dob_order = asc(Patient.date_of_birth) if descending else desc(Patient.date_of_birth)
        return [dob_order, desc(Patient.created_at)]
    if key == "last_visit":
        last_appt = (
            select(func.max(Appointment.scheduled_at))
            .where(Appointment.patient_id == Patient.id)
            .scalar_subquery()
        )
        return [nulls_last(direction(last_appt)), desc(Patient.created_at)]

    column_map = {
        "mrn": Patient.mrn,
        "full_name": Patient.full_name,
        "gender": Patient.gender,
        "phone": Patient.phone,
        "blood_group": Patient.blood_group,
        "updated_at": Patient.updated_at,
        "created_at": Patient.created_at,
    }
    col = column_map.get(key, Patient.created_at)
    return [direction(col), desc(Patient.created_at)]


async def list_patients(
    db: AsyncSession,
    user: User,
    *,
    search: str | None,
    skip: int,
    limit: int,
    sort_by: str | None = None,
    sort_order: str = "desc",
) -> tuple[list[Patient], int]:
    stmt = select(Patient)
    count_stmt = select(func.count()).select_from(Patient)

    if user.role == UserRole.doctor:
        allowed_ids = await doctor_patient_ids(db, user.id)
        if not allowed_ids:
            return [], 0
        stmt = stmt.where(Patient.id.in_(allowed_ids))
        count_stmt = count_stmt.where(Patient.id.in_(allowed_ids))

    if search:
        term = f"%{search.strip()}%"
        cond = or_(
            Patient.full_name.ilike(term),
            Patient.mrn.ilike(term),
            Patient.phone.ilike(term),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total = int((await db.execute(count_stmt)).scalar_one())
    stmt = stmt.order_by(*_patient_list_order(sort_by, sort_order)).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def count_patients_registered_since(db: AsyncSession, since: datetime) -> int:
    stmt = select(func.count()).select_from(Patient).where(Patient.created_at >= since)
    return int((await db.execute(stmt)).scalar_one())
