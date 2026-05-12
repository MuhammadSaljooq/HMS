from __future__ import annotations

from datetime import date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Appointment
from app.models.enums import AppointmentStatus

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
    doctor_key = int.from_bytes(doctor_id.bytes[:4], byteorder="big", signed=False)
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
