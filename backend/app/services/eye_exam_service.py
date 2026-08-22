from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Diagnosis,
    EyeExam,
    IOPMeasurement,
    Keratometry,
    MedicalRecord,
    Procedure,
    Refraction,
    User,
    VisualAcuity,
)
from app.schemas.eye_exam import (
    DiagnosisCreate,
    EyeExamCreate,
    EyeExamUpdate,
    IOPMeasurementCreate,
    KeratometryCreate,
    ProcedureCreate,
    RefractionCreate,
    VisualAcuityCreate,
)
from app.services.soft_delete import not_deleted


def _exam_detail_options():
    return (
        selectinload(EyeExam.visual_acuities),
        selectinload(EyeExam.refractions),
        selectinload(EyeExam.iop_measurements),
        selectinload(EyeExam.keratometries),
        selectinload(EyeExam.diagnoses.and_(Diagnosis.deleted_at.is_(None))),
        selectinload(EyeExam.procedures.and_(Procedure.deleted_at.is_(None))),
    )


async def get_record_or_404(db: AsyncSession, record_id: UUID) -> MedicalRecord:
    result = await db.execute(
        select(MedicalRecord).where(MedicalRecord.id == record_id, not_deleted(MedicalRecord))
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found.")
    return record


async def get_exam_or_404(db: AsyncSession, exam_id: UUID) -> EyeExam:
    result = await db.execute(
        select(EyeExam)
        .options(*_exam_detail_options())
        .where(EyeExam.id == exam_id, not_deleted(EyeExam))
    )
    exam = result.scalar_one_or_none()
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eye exam not found.")
    return exam


async def list_exams_for_record(
    db: AsyncSession, record_id: UUID, *, skip: int = 0, limit: int = 100
) -> list[EyeExam]:
    stmt = (
        select(EyeExam)
        .where(EyeExam.medical_record_id == record_id, not_deleted(EyeExam))
        .order_by(EyeExam.exam_date.desc())
        .offset(skip)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_exam(
    db: AsyncSession, record: MedicalRecord, body: EyeExamCreate, actor: User
) -> EyeExam:
    data = body.model_dump(
        exclude={
            "visual_acuities",
            "refractions",
            "iop_measurements",
            "keratometries",
            "diagnoses",
            "procedures",
        },
        exclude_unset=True,
    )
    exam = EyeExam(
        medical_record_id=record.id,
        patient_id=record.patient_id,
        clinic_id=record.clinic_id,
        created_by=actor.id,
        **data,
    )
    db.add(exam)
    await db.flush()

    for va in body.visual_acuities or []:
        db.add(VisualAcuity(eye_exam_id=exam.id, **va.model_dump()))
    for refr in body.refractions or []:
        db.add(Refraction(eye_exam_id=exam.id, **refr.model_dump()))
    for iop in body.iop_measurements or []:
        db.add(IOPMeasurement(eye_exam_id=exam.id, **iop.model_dump()))
    for k in body.keratometries or []:
        db.add(Keratometry(eye_exam_id=exam.id, **k.model_dump()))
    for dx in body.diagnoses or []:
        db.add(
            Diagnosis(
                medical_record_id=record.id,
                eye_exam_id=exam.id,
                patient_id=record.patient_id,
                clinic_id=record.clinic_id,
                created_by=actor.id,
                **dx.model_dump(exclude={"eye_exam_id"}),
            )
        )
    for proc in body.procedures or []:
        db.add(
            Procedure(
                medical_record_id=record.id,
                eye_exam_id=exam.id,
                patient_id=record.patient_id,
                clinic_id=record.clinic_id,
                created_by=actor.id,
                **proc.model_dump(exclude={"eye_exam_id"}),
            )
        )

    await db.flush()
    return await get_exam_or_404(db, exam.id)


async def update_exam(
    db: AsyncSession, exam: EyeExam, body: EyeExamUpdate, actor: User
) -> EyeExam:
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(exam, key, value)
    exam.updated_by = actor.id
    await db.flush()
    return await get_exam_or_404(db, exam.id)


async def delete_exam(db: AsyncSession, exam: EyeExam, actor: User) -> None:
    now = datetime.now(timezone.utc)
    exam.deleted_at = now
    exam.deleted_by = actor.id
    await db.flush()


# --- Nested measurement / dx / procedure adders ---
async def add_visual_acuity(
    db: AsyncSession, exam: EyeExam, body: VisualAcuityCreate
) -> VisualAcuity:
    row = VisualAcuity(eye_exam_id=exam.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def add_refraction(db: AsyncSession, exam: EyeExam, body: RefractionCreate) -> Refraction:
    row = Refraction(eye_exam_id=exam.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def add_iop(db: AsyncSession, exam: EyeExam, body: IOPMeasurementCreate) -> IOPMeasurement:
    row = IOPMeasurement(eye_exam_id=exam.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def add_keratometry(db: AsyncSession, exam: EyeExam, body: KeratometryCreate) -> Keratometry:
    row = Keratometry(eye_exam_id=exam.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def add_diagnosis(
    db: AsyncSession, exam: EyeExam, body: DiagnosisCreate, actor: User
) -> Diagnosis:
    row = Diagnosis(
        medical_record_id=exam.medical_record_id,
        eye_exam_id=exam.id,
        patient_id=exam.patient_id,
        clinic_id=exam.clinic_id,
        created_by=actor.id,
        **body.model_dump(exclude={"eye_exam_id"}),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def add_procedure(
    db: AsyncSession, exam: EyeExam, body: ProcedureCreate, actor: User
) -> Procedure:
    row = Procedure(
        medical_record_id=exam.medical_record_id,
        eye_exam_id=exam.id,
        patient_id=exam.patient_id,
        clinic_id=exam.clinic_id,
        created_by=actor.id,
        **body.model_dump(exclude={"eye_exam_id"}),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row
