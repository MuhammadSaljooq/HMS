from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import MedicalRecord, Prescription, User
from app.models.enums import UserRole
from app.schemas.medical_record import (
    MedicalRecordCreate,
    MedicalRecordDetailRead,
    MedicalRecordRead,
    MedicalRecordUpdate,
)
from app.schemas.prescription import PrescriptionCreate, PrescriptionRead
from app.services.authorization_service import can_write_record, requires_patient_filter_for_records
from app.services import patient_service
from app.utils.deps import get_current_user, get_db, require_role

router = APIRouter(prefix="/records", tags=["Medical Records"])


async def _get_record(db: AsyncSession, record_id: UUID) -> MedicalRecord:
    result = await db.execute(
        select(MedicalRecord)
        .options(
            selectinload(MedicalRecord.prescriptions),
            selectinload(MedicalRecord.doctor),
        )
        .where(MedicalRecord.id == record_id)
    )
    rec = result.scalar_one_or_none()
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found.")
    return rec


@router.get("", response_model=list[MedicalRecordRead], status_code=status.HTTP_200_OK)
async def list_records(
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    patient_id: UUID | None = Query(None),
) -> list[MedicalRecord]:
    if requires_patient_filter_for_records(current) and patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="patient_id is required for this role.",
        )
    stmt = select(MedicalRecord).order_by(MedicalRecord.created_at.desc())
    if current.role == UserRole.doctor:
        stmt = stmt.where(MedicalRecord.doctor_id == current.id)
    if patient_id:
        if not await patient_service.user_can_view_patient(db, current, patient_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this patient.")
        stmt = stmt.where(MedicalRecord.patient_id == patient_id)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


@router.post("", response_model=MedicalRecordRead, status_code=status.HTTP_201_CREATED)
async def create_record(
    body: MedicalRecordCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
) -> MedicalRecord:
    if not await patient_service.user_can_view_patient(db, current, body.patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this patient.")
    if current.role == UserRole.doctor and body.doctor_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctors may only create records with themselves as the author.",
        )
    data = body.model_dump(exclude={"prescriptions"})
    record = MedicalRecord(**data)
    db.add(record)
    await db.flush()
    if body.prescriptions:
        for p in body.prescriptions:
            db.add(Prescription(medical_record_id=record.id, **p.model_dump()))
    await db.flush()
    await db.refresh(record)
    await db.commit()
    return record


@router.get("/{record_id}", response_model=MedicalRecordDetailRead, status_code=status.HTTP_200_OK)
async def get_record(
    record_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> MedicalRecord:
    record = await _get_record(db, record_id)
    if not await patient_service.user_can_view_patient(db, current, record.patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if current.role == UserRole.doctor and record.doctor_id != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your medical record.")
    return record


@router.patch("/{record_id}", response_model=MedicalRecordRead, status_code=status.HTTP_200_OK)
async def update_record(
    record_id: UUID,
    body: MedicalRecordUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> MedicalRecord:
    record = await _get_record(db, record_id)
    if not _can_write_record(current, record):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot update this record.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(record, k, v)
    await db.flush()
    await db.refresh(record)
    await db.commit()
    return record


@router.post(
    "/{record_id}/prescriptions",
    response_model=PrescriptionRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_prescription(
    record_id: UUID,
    body: PrescriptionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
) -> Prescription:
    record = await _get_record(db, record_id)
    if not _can_write_record(current, record):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot add prescriptions to this record.")
    rx = Prescription(medical_record_id=record.id, **body.model_dump())
    db.add(rx)
    await db.flush()
    await db.refresh(rx)
    await db.commit()
    return rx


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_record(
    record_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin))],
) -> None:
    record = await _get_record(db, record_id)
    await db.delete(record)
    await db.commit()
