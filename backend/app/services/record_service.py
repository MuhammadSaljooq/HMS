from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Appointment, MedicalRecord, Patient, Prescription, Transcription, User
from app.models.enums import UserRole
from app.schemas.medical_record import MedicalRecordCreate, MedicalRecordUpdate
from app.schemas.prescription import PrescriptionCreate
from app.services.soft_delete import not_deleted


async def get_record_or_404(db: AsyncSession, record_id: UUID) -> MedicalRecord:
    result = await db.execute(
        select(MedicalRecord)
        .options(
            selectinload(
                MedicalRecord.prescriptions.and_(Prescription.deleted_at.is_(None))
            ),
            selectinload(MedicalRecord.doctor),
        )
        .where(MedicalRecord.id == record_id, not_deleted(MedicalRecord))
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found.")
    return record


async def _validate_related_entities(
    db: AsyncSession,
    *,
    patient_id: UUID,
    doctor_id: UUID,
    appointment_id: UUID | None,
) -> Appointment | None:
    patient_exists = await db.get(Patient, patient_id)
    if patient_exists is None or patient_exists.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    doctor = await db.get(User, doctor_id)
    if doctor is None or doctor.role != UserRole.doctor or not doctor.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found.")

    if appointment_id is None:
        return None

    appointment = await db.get(Appointment, appointment_id)
    if appointment is None or appointment.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")
    if appointment.patient_id != patient_id or appointment.doctor_id != doctor_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Appointment must belong to the same patient and doctor as the medical record.",
        )
    return appointment


async def create_record(
    db: AsyncSession, body: MedicalRecordCreate, actor: User | None = None
) -> MedicalRecord:
    await _validate_related_entities(
        db,
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
        appointment_id=body.appointment_id,
    )

    record = MedicalRecord(**body.model_dump(exclude={"prescriptions"}))
    if actor is not None:
        record.created_by = actor.id
    db.add(record)
    await db.flush()

    if body.prescriptions:
        for prescription in body.prescriptions:
            rx = Prescription(medical_record_id=record.id, **prescription.model_dump())
            if actor is not None:
                rx.created_by = actor.id
            db.add(rx)

    await db.flush()
    await db.refresh(record)
    return record


async def update_record(
    db: AsyncSession, record: MedicalRecord, body: MedicalRecordUpdate, actor: User | None = None
) -> MedicalRecord:
    data = body.model_dump(exclude_unset=True)
    if "appointment_id" in data:
        await _validate_related_entities(
            db,
            patient_id=record.patient_id,
            doctor_id=record.doctor_id,
            appointment_id=data["appointment_id"],
        )

    for key, value in data.items():
        setattr(record, key, value)
    if actor is not None:
        record.updated_by = actor.id
    await db.flush()
    await db.refresh(record)
    return record


async def add_prescription(
    db: AsyncSession, record: MedicalRecord, body: PrescriptionCreate, actor: User | None = None
) -> Prescription:
    rx = Prescription(medical_record_id=record.id, **body.model_dump())
    if actor is not None:
        rx.created_by = actor.id
    db.add(rx)
    await db.flush()
    await db.refresh(rx)
    return rx


async def delete_record(db: AsyncSession, record: MedicalRecord, actor: User | None = None) -> None:
    now = datetime.now(timezone.utc)
    actor_id = actor.id if actor is not None else None

    record.deleted_at = now
    record.deleted_by = actor_id

    # Soft-delete the record's prescriptions that are not already deleted.
    await db.execute(
        update(Prescription)
        .where(Prescription.medical_record_id == record.id, Prescription.deleted_at.is_(None))
        .values(deleted_at=now, deleted_by=actor_id)
    )
    # Unlink (do NOT delete) the record's transcriptions.
    await db.execute(
        update(Transcription)
        .where(Transcription.medical_record_id == record.id)
        .values(medical_record_id=None)
    )
    await db.flush()
