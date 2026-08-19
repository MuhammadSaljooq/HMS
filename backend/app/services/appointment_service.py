from __future__ import annotations

from datetime import date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import Appointment, Patient, User
from app.models.enums import AppointmentStatus, UserRole
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate
from app.services import patient_service
from app.services.soft_delete import not_deleted

TZ = ZoneInfo("Asia/Karachi")
SLOT_STEP = timedelta(minutes=30)
APPOINTMENT_BLOCK = timedelta(minutes=30)


def day_bounds_local(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time(0, 0), tzinfo=TZ)
    return start, start + timedelta(days=1)


def working_day_bounds(d: date) -> tuple[datetime, datetime]:
    return datetime.combine(d, time(9, 0), tzinfo=TZ), datetime.combine(d, time(17, 0), tzinfo=TZ)


def normalize_to_karachi(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=TZ)
    return dt.astimezone(TZ)


def intervals_overlap(a0: datetime, a1: datetime, b0: datetime, b1: datetime) -> bool:
    return a0 < b1 and b0 < a1


async def lock_doctor_day_schedule(db: AsyncSession, *, doctor_id: UUID, slot_start: datetime) -> None:
    local_slot = normalize_to_karachi(slot_start)
    doctor_key = int.from_bytes(doctor_id.bytes[:4], byteorder="big", signed=True)
    day_key = local_slot.date().toordinal()
    await db.execute(
        text("SELECT pg_advisory_xact_lock(:doctor_key, :day_key)"),
        {"doctor_key": doctor_key, "day_key": day_key},
    )


async def scheduled_blocks_for_day(
    db: AsyncSession,
    *,
    doctor_id: UUID,
    day: date,
) -> list[tuple[datetime, datetime]]:
    day_start, day_end = day_bounds_local(day)
    stmt = (
        select(Appointment)
        .where(
            Appointment.doctor_id == doctor_id,
            Appointment.scheduled_at >= day_start,
            Appointment.scheduled_at < day_end,
            Appointment.status == AppointmentStatus.scheduled,
            not_deleted(Appointment),
        )
    )
    rows = (await db.execute(stmt)).scalars().all()
    blocks: list[tuple[datetime, datetime]] = []
    for appt in rows:
        start = normalize_to_karachi(appt.scheduled_at)
        blocks.append((start, start + APPOINTMENT_BLOCK))
    return blocks


async def has_scheduling_conflict(
    db: AsyncSession,
    *,
    doctor_id: UUID,
    slot_start: datetime,
    exclude_appointment_id: UUID | None = None,
) -> bool:
    local_start = normalize_to_karachi(slot_start)
    slot_end = local_start + APPOINTMENT_BLOCK
    day_start, day_end = day_bounds_local(local_start.date())
    stmt = select(Appointment).where(
        Appointment.doctor_id == doctor_id,
        Appointment.scheduled_at >= day_start,
        Appointment.scheduled_at < day_end,
        Appointment.status == AppointmentStatus.scheduled,
        not_deleted(Appointment),
    )
    if exclude_appointment_id is not None:
        stmt = stmt.where(Appointment.id != exclude_appointment_id)
    rows = (await db.execute(stmt)).scalars().all()
    for appt in rows:
        a0 = normalize_to_karachi(appt.scheduled_at)
        a1 = a0 + APPOINTMENT_BLOCK
        if intervals_overlap(local_start, slot_end, a0, a1):
            return True
    return False


async def get_appointment_or_404(db: AsyncSession, appointment_id: UUID) -> Appointment:
    result = await db.execute(
        select(Appointment)
        .options(joinedload(Appointment.doctor), joinedload(Appointment.patient))
        .where(Appointment.id == appointment_id, not_deleted(Appointment))
    )
    appt = result.scalar_one_or_none()
    if appt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")
    return appt


async def _patient_or_404(db: AsyncSession, patient_id: UUID) -> Patient:
    patient = await db.get(Patient, patient_id)
    if patient is None or patient.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    return patient


async def doctor_or_404(db: AsyncSession, doctor_id: UUID) -> User:
    doctor = await db.get(User, doctor_id)
    if doctor is None or doctor.role != UserRole.doctor or not doctor.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")
    return doctor


async def create_appointment(db: AsyncSession, current: User, body: AppointmentCreate) -> Appointment:
    await _patient_or_404(db, body.patient_id)
    if not await patient_service.user_can_view_patient(db, current, body.patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot schedule for this patient.")
    if current.role == UserRole.doctor and body.doctor_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctors may only create appointments where they are the assigned doctor.",
        )
    await doctor_or_404(db, body.doctor_id)

    payload = body.model_dump()
    slot_start = normalize_to_karachi(payload["scheduled_at"])
    payload["scheduled_at"] = slot_start
    await lock_doctor_day_schedule(db, doctor_id=body.doctor_id, slot_start=slot_start)
    if await has_scheduling_conflict(db, doctor_id=body.doctor_id, slot_start=slot_start):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That time slot is already booked for this doctor.",
        )

    appt = Appointment(**payload)
    db.add(appt)
    await db.flush()
    await db.refresh(appt)
    return appt


async def update_appointment(db: AsyncSession, current: User, appt: Appointment, body: AppointmentUpdate) -> Appointment:
    data = body.model_dump(exclude_unset=True)

    if "doctor_id" in data and data["doctor_id"] is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="doctor_id may not be null.")
    if "scheduled_at" in data and data["scheduled_at"] is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scheduled_at may not be null.")

    next_doctor_id = data.get("doctor_id", appt.doctor_id)
    next_status = data.get("status", appt.status)
    next_scheduled_at = normalize_to_karachi(data["scheduled_at"]) if "scheduled_at" in data else normalize_to_karachi(appt.scheduled_at)

    if current.role == UserRole.doctor and next_doctor_id != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot reassign to another doctor.")

    if "doctor_id" in data:
        await doctor_or_404(db, next_doctor_id)

    if ("doctor_id" in data or "scheduled_at" in data) and next_status == AppointmentStatus.scheduled:
        await lock_doctor_day_schedule(db, doctor_id=next_doctor_id, slot_start=next_scheduled_at)
        if await has_scheduling_conflict(
            db,
            doctor_id=next_doctor_id,
            slot_start=next_scheduled_at,
            exclude_appointment_id=appt.id,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That time slot is already booked for this doctor.",
            )

    if "scheduled_at" in data:
        data["scheduled_at"] = next_scheduled_at

    for key, value in data.items():
        setattr(appt, key, value)
    await db.flush()
    await db.refresh(appt)
    return appt


async def cancel_appointment(db: AsyncSession, appt: Appointment) -> None:
    appt.status = AppointmentStatus.cancelled
    await db.flush()
