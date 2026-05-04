from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import Appointment, Patient, User
from app.models.enums import AppointmentStatus, UserRole
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentDetailRead,
    AppointmentListItem,
    AppointmentRead,
    AppointmentSlot,
    AppointmentUpdate,
)
from app.services import patient_service
from app.utils.deps import get_current_user, get_db, require_role

router = APIRouter(prefix="/appointments", tags=["Appointments"])

TZ = ZoneInfo("Asia/Karachi")
SLOT_STEP = timedelta(minutes=30)
APPOINTMENT_BLOCK = timedelta(minutes=30)


def _day_bounds_local(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time(0, 0), tzinfo=TZ)
    return start, start + timedelta(days=1)


def _working_day_bounds(d: date) -> tuple[datetime, datetime]:
    """9:00–17:00 local (last bookable slot starts at 16:30)."""
    day_start = datetime.combine(d, time(0, 0), tzinfo=TZ)
    return datetime.combine(d, time(9, 0), tzinfo=TZ), datetime.combine(d, time(17, 0), tzinfo=TZ)


def _intervals_overlap(a0: datetime, a1: datetime, b0: datetime, b1: datetime) -> bool:
    return a0 < b1 and b0 < a1


async def _get_appointment(db: AsyncSession, appointment_id: UUID) -> Appointment:
    result = await db.execute(
        select(Appointment)
        .options(joinedload(Appointment.doctor), joinedload(Appointment.patient))
        .where(Appointment.id == appointment_id)
    )
    appt = result.scalar_one_or_none()
    if appt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")
    return appt


def _can_manage_appointment(user: User, appt: Appointment) -> bool:
    if user.role == UserRole.admin:
        return True
    if user.role == UserRole.receptionist:
        return True
    if user.role == UserRole.doctor and appt.doctor_id == user.id:
        return True
    return False


def _can_view_doctor_schedule(user: User, doctor_id: UUID) -> bool:
    if user.role in (UserRole.admin, UserRole.receptionist, UserRole.nurse):
        return True
    if user.role == UserRole.doctor and doctor_id == user.id:
        return True
    return False


async def _doctor_or_404(db: AsyncSession, doctor_id: UUID) -> User:
    doc = await db.get(User, doctor_id)
    if doc is None or doc.role != UserRole.doctor or not doc.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")
    return doc


async def _scheduled_blocks_for_day(
    db: AsyncSession,
    *,
    doctor_id: UUID,
    day: date,
) -> list[tuple[datetime, datetime]]:
    day_start, day_end = _day_bounds_local(day)
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
        start = appt.scheduled_at
        if start.tzinfo is None:
            start = start.replace(tzinfo=TZ)
        else:
            start = start.astimezone(TZ)
        blocks.append((start, start + APPOINTMENT_BLOCK))
    return blocks


async def _has_scheduling_conflict(
    db: AsyncSession,
    *,
    doctor_id: UUID,
    slot_start: datetime,
    exclude_appointment_id: UUID | None = None,
) -> bool:
    if slot_start.tzinfo is None:
        slot_start = slot_start.replace(tzinfo=TZ)
    else:
        slot_start = slot_start.astimezone(TZ)
    slot_end = slot_start + APPOINTMENT_BLOCK
    day = slot_start.date()
    day_start, day_end = _day_bounds_local(day)
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
        a0 = appt.scheduled_at
        if a0.tzinfo is None:
            a0 = a0.replace(tzinfo=TZ)
        else:
            a0 = a0.astimezone(TZ)
        a1 = a0 + APPOINTMENT_BLOCK
        if _intervals_overlap(slot_start, slot_end, a0, a1):
            return True
    return False


async def _lock_doctor_day_schedule(db: AsyncSession, *, doctor_id: UUID, slot_start: datetime) -> None:
    if slot_start.tzinfo is None:
        slot_start = slot_start.replace(tzinfo=TZ)
    else:
        slot_start = slot_start.astimezone(TZ)
    doctor_key = int.from_bytes(doctor_id.bytes[:4], byteorder="big", signed=False)
    day_key = slot_start.date().toordinal()
    await db.execute(
        text("SELECT pg_advisory_xact_lock(:doctor_key, :day_key)"),
        {"doctor_key": doctor_key, "day_key": day_key},
    )


@router.get(
    "/slots/{doctor_id}",
    response_model=list[AppointmentSlot],
    status_code=status.HTTP_200_OK,
)
async def list_available_slots(
    doctor_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    day: Annotated[date, Query(description="Calendar day (YYYY-MM-DD) in Asia/Karachi")],
) -> list[AppointmentSlot]:
    if not _can_view_doctor_schedule(current, doctor_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot view this doctor's schedule.")
    await _doctor_or_404(db, doctor_id)

    work_start, work_end = _working_day_bounds(day)
    blocks = await _scheduled_blocks_for_day(db, doctor_id=doctor_id, day=day)

    slots: list[AppointmentSlot] = []
    t = work_start
    while t + SLOT_STEP <= work_end:
        slot_start = t
        slot_end = t + SLOT_STEP
        available = not any(
            _intervals_overlap(slot_start, slot_end, b0, b1) for b0, b1 in blocks
        )
        slots.append(AppointmentSlot(start=slot_start, end=slot_end, available=available))
        t += SLOT_STEP
    return slots


@router.get("", response_model=list[AppointmentListItem], status_code=status.HTTP_200_OK)
async def list_appointments(
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    patient_id: UUID | None = Query(None),
    doctor_id: UUID | None = Query(None),
    status: AppointmentStatus | None = Query(None),
    filter_date: date | None = Query(None, alias="date"),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
) -> list[AppointmentListItem]:
    stmt = (
        select(Appointment)
        .options(joinedload(Appointment.doctor), joinedload(Appointment.patient))
        .order_by(Appointment.scheduled_at.asc())
    )

    if current.role == UserRole.doctor:
        stmt = stmt.where(Appointment.doctor_id == current.id)

    if patient_id:
        if not await patient_service.user_can_view_patient(db, current, patient_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot view appointments for this patient.")
        stmt = stmt.where(Appointment.patient_id == patient_id)
    if doctor_id:
        if not _can_view_doctor_schedule(current, doctor_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot filter by this doctor.")
        stmt = stmt.where(Appointment.doctor_id == doctor_id)
    if status is not None:
        stmt = stmt.where(Appointment.status == status)

    if filter_date is not None:
        d0, d1 = _day_bounds_local(filter_date)
        stmt = stmt.where(Appointment.scheduled_at >= d0, Appointment.scheduled_at < d1)
    else:
        if from_date is not None:
            stmt = stmt.where(Appointment.scheduled_at >= from_date)
        if to_date is not None:
            stmt = stmt.where(Appointment.scheduled_at <= to_date)

    rows = (await db.execute(stmt)).unique().scalars().all()
    out: list[AppointmentListItem] = []
    for appt in rows:
        ar = AppointmentRead.model_validate(appt)
        pn = appt.patient.full_name if appt.patient else ""
        dn = appt.doctor.full_name if appt.doctor else ""
        out.append(
            AppointmentListItem(
                **ar.model_dump(),
                patient_full_name=pn,
                doctor_full_name=dn,
            )
        )
    return out


@router.post("", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    body: AppointmentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.receptionist, UserRole.doctor))],
) -> Appointment:
    if not await patient_service.user_can_view_patient(db, current, body.patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot schedule for this patient.")
    if current.role == UserRole.doctor and body.doctor_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctors may only create appointments where they are the assigned doctor.",
        )
    await _doctor_or_404(db, body.doctor_id)

    dump = body.model_dump()
    st = dump["scheduled_at"]
    if st.tzinfo is None:
        st = st.replace(tzinfo=TZ)
    else:
        st = st.astimezone(TZ)
    dump["scheduled_at"] = st
    await _lock_doctor_day_schedule(db, doctor_id=body.doctor_id, slot_start=st)
    if await _has_scheduling_conflict(db, doctor_id=body.doctor_id, slot_start=st):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That time slot is already booked for this doctor.",
        )

    appt = Appointment(**dump)
    db.add(appt)
    await db.flush()
    await db.refresh(appt)
    await db.commit()
    return appt


@router.get("/{appointment_id}", response_model=AppointmentDetailRead, status_code=status.HTTP_200_OK)
async def get_appointment(
    appointment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Appointment:
    appt = await _get_appointment(db, appointment_id)
    if current.role == UserRole.doctor and appt.doctor_id != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your appointment.")
    if not await patient_service.user_can_view_patient(db, current, appt.patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return appt


@router.patch("/{appointment_id}", response_model=AppointmentRead, status_code=status.HTTP_200_OK)
async def update_appointment(
    appointment_id: UUID,
    body: AppointmentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Appointment:
    appt = await _get_appointment(db, appointment_id)
    if not _can_manage_appointment(current, appt):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot modify this appointment.")
    data = body.model_dump(exclude_unset=True)
    if "doctor_id" in data and current.role == UserRole.doctor and data["doctor_id"] != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot reassign to another doctor.")
    if "scheduled_at" in data and data["scheduled_at"] is not None:
        doc_id = data.get("doctor_id", appt.doctor_id)
        st = data["scheduled_at"]
        if st.tzinfo is None:
            st = st.replace(tzinfo=TZ)
        else:
            st = st.astimezone(TZ)
        await _lock_doctor_day_schedule(db, doctor_id=doc_id, slot_start=st)
        if await _has_scheduling_conflict(db, doctor_id=doc_id, slot_start=st, exclude_appointment_id=appt.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That time slot is already booked for this doctor.",
            )
    for k, v in data.items():
        setattr(appt, k, v)
    await db.flush()
    await db.refresh(appt)
    await db.commit()
    return appt


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_appointment(
    appointment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    """Mark appointment as cancelled (soft cancel)."""
    appt = await _get_appointment(db, appointment_id)
    if not _can_manage_appointment(current, appt):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot cancel this appointment.")
    appt.status = AppointmentStatus.cancelled
    await db.flush()
    await db.commit()
