from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MedicalRecord, Prescription, User
from app.models.enums import UserRole
from app.schemas.medical_record import (
    MedicalRecordCreate,
    MedicalRecordDetailRead,
    MedicalRecordRead,
    MedicalRecordUpdate,
)
from app.schemas.prescription import PrescriptionCreate, PrescriptionRead
from app.services import audit_service, record_service
from app.services.soft_delete import not_deleted
from app.services.authorization_service import (
    ensure_can_view_patient,
    ensure_can_view_record,
    ensure_can_write_record,
    requires_patient_filter_for_records,
)
from app.utils.deps import get_current_user, get_db, require_role

router = APIRouter(prefix="/records", tags=["Medical Records"])


@router.get("", response_model=list[MedicalRecordRead], status_code=status.HTTP_200_OK)
async def list_records(
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    patient_id: UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> list[MedicalRecord]:
    if requires_patient_filter_for_records(current) and patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="patient_id is required for this role.",
        )
    stmt = select(MedicalRecord).where(not_deleted(MedicalRecord)).order_by(MedicalRecord.created_at.desc())
    if current.role == UserRole.doctor:
        stmt = stmt.where(MedicalRecord.doctor_id == current.id)
    if patient_id:
        await ensure_can_view_patient(db, current, patient_id)
        stmt = stmt.where(MedicalRecord.patient_id == patient_id)
    stmt = stmt.offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


@router.post("", response_model=MedicalRecordRead, status_code=status.HTTP_201_CREATED)
async def create_record(
    body: MedicalRecordCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
) -> MedicalRecord:
    await ensure_can_view_patient(db, current, body.patient_id)
    if current.role == UserRole.doctor and body.doctor_id != current.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctors may only create records with themselves as the author.",
        )
    record = await record_service.create_record(db, body, actor=current)
    await audit_service.record(
        db,
        actor=current,
        action="record.create",
        entity_type="medical_record",
        entity_id=record.id,
        metadata={"patient_id": str(record.patient_id), "doctor_id": str(record.doctor_id)},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    return record


@router.get("/{record_id}", response_model=MedicalRecordDetailRead, status_code=status.HTTP_200_OK)
async def get_record(
    record_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> MedicalRecord:
    record = await record_service.get_record_or_404(db, record_id)
    await ensure_can_view_record(db, current, record)
    return record


@router.patch("/{record_id}", response_model=MedicalRecordRead, status_code=status.HTTP_200_OK)
async def update_record(
    record_id: UUID,
    body: MedicalRecordUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> MedicalRecord:
    record = await record_service.get_record_or_404(db, record_id)
    ensure_can_write_record(current, record)
    changed_fields = sorted(body.model_dump(exclude_unset=True).keys())
    record = await record_service.update_record(db, record, body, actor=current)
    await audit_service.record(
        db,
        actor=current,
        action="record.update",
        entity_type="medical_record",
        entity_id=record.id,
        metadata={"fields": changed_fields},
        ip=request.client.host if request.client else None,
    )
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
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin, UserRole.doctor))],
) -> Prescription:
    record = await record_service.get_record_or_404(db, record_id)
    ensure_can_write_record(current, record, detail="Cannot add prescriptions to this record.")
    rx = await record_service.add_prescription(db, record, body, actor=current)
    await audit_service.record(
        db,
        actor=current,
        action="prescription.create",
        entity_type="prescription",
        entity_id=rx.id,
        metadata={"medical_record_id": str(record.id)},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    return rx


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_record(
    record_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin))],
) -> None:
    record = await record_service.get_record_or_404(db, record_id)
    await record_service.delete_record(db, record, actor=current)
    await audit_service.record(
        db,
        actor=current,
        action="record.delete",
        entity_type="medical_record",
        entity_id=record.id,
        metadata={"patient_id": str(record.patient_id)},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
