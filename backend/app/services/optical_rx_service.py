from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ContactLensRx, MedicalRecord, Patient, SpectacleRx, User
from app.schemas.optical_rx import (
    ContactLensRxCreate,
    ContactLensRxUpdate,
    SpectacleRxCreate,
    SpectacleRxUpdate,
)
from app.services.soft_delete import not_deleted


async def _get_patient_or_404(db: AsyncSession, patient_id: UUID) -> Patient:
    patient = await db.get(Patient, patient_id)
    if patient is None or patient.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    return patient


async def _derive_clinic_id(
    db: AsyncSession, patient: Patient, medical_record_id: UUID | None
) -> UUID | None:
    if medical_record_id is not None:
        record = await db.get(MedicalRecord, medical_record_id)
        if record is None or record.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found."
            )
        if record.patient_id != patient.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Medical record must belong to the same patient.",
            )
        return record.clinic_id
    return patient.clinic_id


# --- Spectacle Rx ---
async def get_spectacle_or_404(db: AsyncSession, rx_id: UUID) -> SpectacleRx:
    result = await db.execute(
        select(SpectacleRx).where(SpectacleRx.id == rx_id, not_deleted(SpectacleRx))
    )
    rx = result.scalar_one_or_none()
    if rx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Spectacle Rx not found.")
    return rx


async def list_spectacle_for_patient(
    db: AsyncSession, patient_id: UUID, *, skip: int = 0, limit: int = 100
) -> list[SpectacleRx]:
    stmt = (
        select(SpectacleRx)
        .where(SpectacleRx.patient_id == patient_id, not_deleted(SpectacleRx))
        .order_by(SpectacleRx.prescribed_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_spectacle(
    db: AsyncSession, patient_id: UUID, body: SpectacleRxCreate, actor: User
) -> SpectacleRx:
    patient = await _get_patient_or_404(db, patient_id)
    clinic_id = await _derive_clinic_id(db, patient, body.medical_record_id)
    rx = SpectacleRx(
        patient_id=patient.id,
        clinic_id=clinic_id,
        prescribed_by=actor.id,
        created_by=actor.id,
        **body.model_dump(exclude_unset=True),
    )
    db.add(rx)
    await db.flush()
    await db.refresh(rx)
    return rx


async def update_spectacle(
    db: AsyncSession, rx: SpectacleRx, body: SpectacleRxUpdate, actor: User
) -> SpectacleRx:
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(rx, key, value)
    rx.updated_by = actor.id
    await db.flush()
    await db.refresh(rx)
    return rx


async def delete_spectacle(db: AsyncSession, rx: SpectacleRx, actor: User) -> None:
    rx.deleted_at = datetime.now(timezone.utc)
    rx.deleted_by = actor.id
    await db.flush()


# --- Contact lens Rx ---
async def get_contact_or_404(db: AsyncSession, rx_id: UUID) -> ContactLensRx:
    result = await db.execute(
        select(ContactLensRx).where(ContactLensRx.id == rx_id, not_deleted(ContactLensRx))
    )
    rx = result.scalar_one_or_none()
    if rx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contact lens Rx not found."
        )
    return rx


async def list_contact_for_patient(
    db: AsyncSession, patient_id: UUID, *, skip: int = 0, limit: int = 100
) -> list[ContactLensRx]:
    stmt = (
        select(ContactLensRx)
        .where(ContactLensRx.patient_id == patient_id, not_deleted(ContactLensRx))
        .order_by(ContactLensRx.prescribed_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_contact(
    db: AsyncSession, patient_id: UUID, body: ContactLensRxCreate, actor: User
) -> ContactLensRx:
    patient = await _get_patient_or_404(db, patient_id)
    clinic_id = await _derive_clinic_id(db, patient, body.medical_record_id)
    rx = ContactLensRx(
        patient_id=patient.id,
        clinic_id=clinic_id,
        prescribed_by=actor.id,
        created_by=actor.id,
        **body.model_dump(exclude_unset=True),
    )
    db.add(rx)
    await db.flush()
    await db.refresh(rx)
    return rx


async def update_contact(
    db: AsyncSession, rx: ContactLensRx, body: ContactLensRxUpdate, actor: User
) -> ContactLensRx:
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(rx, key, value)
    rx.updated_by = actor.id
    await db.flush()
    await db.refresh(rx)
    return rx


async def delete_contact(db: AsyncSession, rx: ContactLensRx, actor: User) -> None:
    rx.deleted_at = datetime.now(timezone.utc)
    rx.deleted_by = actor.id
    await db.flush()
