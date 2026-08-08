from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import Appointment, User
from app.models.enums import AppointmentStatus, UserRole
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentDetailRead,
    AppointmentListItem,
    AppointmentRead,
    AppointmentSlot,
    AppointmentUpdate,
)
from app.services.appointment_service import (
    SLOT_STEP,
    cancel_appointment as cancel_appointment_service,
    create_appointment as create_appointment_service,
    day_bounds_local,
    doctor_or_404,
    get_appointment_or_404,
    has_scheduling_conflict,
    intervals_overlap,
    lock_doctor_day_schedule,
    normalize_to_karachi,
    scheduled_blocks_for_day,
    update_appointment as update_appointment_service,
    working_day_bounds,
)
from app.services import audit_service
from app.services.authorization_service import (
    can_view_doctor_schedule,
    ensure_can_manage_appointment,
    ensure_can_view_patient,
)
from app.services.soft_delete import not_deleted
from app.utils.deps import get_current_user, get_db, require_role

router = APIRouter(prefix="/appointments", tags=["Appointments"])


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
    if not can_view_doctor_schedule(current, doctor_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot view this doctor's schedule.")
    await doctor_or_404(db, doctor_id)

    work_start, work_end = working_day_bounds(day)
    blocks = await scheduled_blocks_for_day(db, doctor_id=doctor_id, day=day)

    slots: list[AppointmentSlot] = []
    t = work_start
    while t + SLOT_STEP <= work_end:
        slot_start = t
        slot_end = t + SLOT_STEP
        available = not any(
            intervals_overlap(slot_start, slot_end, b0, b1) for b0, b1 in blocks
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
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> list[AppointmentListItem]:
    stmt = (
        select(Appointment)
        .options(joinedload(Appointment.doctor), joinedload(Appointment.patient))
        .where(not_deleted(Appointment))
        .order_by(Appointment.scheduled_at.asc())
    )

    if current.role == UserRole.doctor:
        stmt = stmt.where(Appointment.doctor_id == current.id)

    if patient_id:
        await ensure_can_view_patient(db, current, patient_id, detail="Cannot view appointments for this patient.")
        stmt = stmt.where(Appointment.patient_id == patient_id)
    if doctor_id:
        if not can_view_doctor_schedule(current, doctor_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot filter by this doctor.")
        stmt = stmt.where(Appointment.doctor_id == doctor_id)
    if status is not None:
        stmt = stmt.where(Appointment.status == status)

    if filter_date is not None:
        d0, d1 = day_bounds_local(filter_date)
        stmt = stmt.where(Appointment.scheduled_at >= d0, Appointment.scheduled_at < d1)
    else:
        if from_date is not None:
            stmt = stmt.where(Appointment.scheduled_at >= from_date)
        if to_date is not None:
            stmt = stmt.where(Appointment.scheduled_at <= to_date)

    stmt = stmt.offset(skip).limit(limit)
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
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.receptionist, UserRole.doctor))],
) -> Appointment:
    appt = await create_appointment_service(db, current, body)
    await audit_service.record(
        db,
        actor=current,
        action="appointment.create",
        entity_type="appointment",
        entity_id=appt.id,
        metadata={"patient_id": str(appt.patient_id), "doctor_id": str(appt.doctor_id)},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    return appt


@router.get("/{appointment_id}", response_model=AppointmentDetailRead, status_code=status.HTTP_200_OK)
async def get_appointment(
    appointment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Appointment:
    appt = await get_appointment_or_404(db, appointment_id)
    if current.role == UserRole.doctor and appt.doctor_id != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your appointment.")
    await ensure_can_view_patient(db, current, appt.patient_id, detail="Access denied.")
    return appt


@router.patch("/{appointment_id}", response_model=AppointmentRead, status_code=status.HTTP_200_OK)
async def update_appointment(
    appointment_id: UUID,
    body: AppointmentUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Appointment:
    appt = await get_appointment_or_404(db, appointment_id)
    ensure_can_manage_appointment(current, appt)
    changed_fields = sorted(body.model_dump(exclude_unset=True).keys())
    appt = await update_appointment_service(db, current, appt, body)
    await audit_service.record(
        db,
        actor=current,
        action="appointment.update",
        entity_type="appointment",
        entity_id=appt.id,
        metadata={"fields": changed_fields},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    return appt


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_appointment(
    appointment_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    """Mark appointment as cancelled (soft cancel)."""
    appt = await get_appointment_or_404(db, appointment_id)
    ensure_can_manage_appointment(current, appt)
    await cancel_appointment_service(db, appt)
    await audit_service.record(
        db,
        actor=current,
        action="appointment.cancel",
        entity_type="appointment",
        entity_id=appt.id,
        metadata={"patient_id": str(appt.patient_id), "doctor_id": str(appt.doctor_id)},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
