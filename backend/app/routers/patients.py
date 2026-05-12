from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Appointment, MedicalRecord, Patient, Transcription, User, Vitals
from app.models.enums import UserRole
from app.schemas.patient import PatientCreate, PatientListItem, PatientListResponse, PatientRead, PatientUpdate
from app.schemas.transcription import TranscriptionRead
from app.schemas.vitals import VitalsCreate, VitalsRead
from app.services.authorization_service import can_record_vitals
from app.services import patient_service
from app.utils.deps import get_current_user, get_db, require_role

router = APIRouter(prefix="/patients", tags=["Patients"])

_ALLOWED_PATIENT_SORT = frozenset(
    {"mrn", "full_name", "age", "gender", "phone", "blood_group", "last_visit", "created_at", "updated_at"}
)


async def _get_patient_or_404(db: AsyncSession, patient_id: UUID) -> Patient:
    patient = await db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    return patient


@router.get("", response_model=PatientListResponse, status_code=status.HTTP_200_OK)
async def list_patients(
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    search: str | None = Query(None, description="Search by name, MRN, or phone"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sort_by: str | None = Query(None, description="Sort field"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
) -> PatientListResponse:
    sort_key = sort_by.lower() if sort_by and sort_by.lower() in _ALLOWED_PATIENT_SORT else None
    items, total = await patient_service.list_patients(
        db,
        current,
        search=search,
        skip=skip,
        limit=limit,
        sort_by=sort_key,
        sort_order=sort_order,
    )
    last_visit_by_patient_id: dict[UUID, datetime | None] = {}
    patient_ids = [p.id for p in items]
    if patient_ids:
        last_visit_stmt = (
            select(Appointment.patient_id, func.max(Appointment.scheduled_at))
            .where(Appointment.patient_id.in_(patient_ids))
            .group_by(Appointment.patient_id)
        )
        for patient_id, last_visit in (await db.execute(last_visit_stmt)).all():
            last_visit_by_patient_id[patient_id] = last_visit

    list_items = [
        PatientListItem(
            **PatientRead.model_validate(p).model_dump(mode="json"),
            last_visit=last_visit_by_patient_id.get(p.id),
        )
        for p in items
    ]
    return PatientListResponse(items=list_items, total=total)


@router.post(
    "",
    response_model=PatientRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_patient(
    body: PatientCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.receptionist, UserRole.doctor))],
) -> Patient:
    patient = await patient_service.create_patient(db, body)
    await db.commit()
    return patient


@router.get(
    "/{patient_id}/transcriptions",
    response_model=list[TranscriptionRead],
    status_code=status.HTTP_200_OK,
)
async def list_patient_transcriptions(
    patient_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> list[Transcription]:
    await _get_patient_or_404(db, patient_id)
    if not await patient_service.user_can_view_patient(db, current, patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this patient.")
    stmt = (
        select(Transcription)
        .join(MedicalRecord, Transcription.medical_record_id == MedicalRecord.id)
        .where(MedicalRecord.patient_id == patient_id)
        .order_by(Transcription.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


@router.get("/{patient_id}", response_model=PatientRead, status_code=status.HTTP_200_OK)
async def get_patient(
    patient_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Patient:
    patient = await _get_patient_or_404(db, patient_id)
    if not await patient_service.user_can_view_patient(db, current, patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this patient.")
    return patient


@router.patch("/{patient_id}", response_model=PatientRead, status_code=status.HTTP_200_OK)
async def update_patient(
    patient_id: UUID,
    body: PatientUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Patient:
    patient = await _get_patient_or_404(db, patient_id)
    if not await patient_service.user_can_view_patient(db, current, patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this patient.")
    if not await patient_service.user_can_edit_patient(current):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and receptionists may update demographic records.",
        )
    patient = await patient_service.update_patient(db, patient, body)
    await db.commit()
    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.admin))],
) -> None:
    patient = await _get_patient_or_404(db, patient_id)
    await db.delete(patient)
    await db.commit()


@router.post(
    "/{patient_id}/vitals",
    response_model=VitalsRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_vitals(
    patient_id: UUID,
    body: VitalsCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Vitals:
    patient = await _get_patient_or_404(db, patient_id)
    if not await patient_service.user_can_view_patient(db, current, patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this patient.")
    if not can_record_vitals(current):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot record vitals.")

    vital = Vitals(
        patient_id=patient.id,
        recorded_by=current.id,
        blood_pressure_systolic=body.blood_pressure_systolic,
        blood_pressure_diastolic=body.blood_pressure_diastolic,
        heart_rate=body.heart_rate,
        temperature_celsius=body.temperature_celsius,
        weight_kg=body.weight_kg,
        height_cm=body.height_cm,
    )
    db.add(vital)
    await db.flush()
    await db.refresh(vital)
    await db.commit()
    return vital


@router.get(
    "/{patient_id}/vitals",
    response_model=list[VitalsRead],
    status_code=status.HTTP_200_OK,
)
async def list_vitals(
    patient_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> list[Vitals]:
    await _get_patient_or_404(db, patient_id)
    if not await patient_service.user_can_view_patient(db, current, patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this patient.")
    result = await db.execute(
        select(Vitals).where(Vitals.patient_id == patient_id).order_by(Vitals.recorded_at.desc())
    )
    return list(result.scalars().all())
