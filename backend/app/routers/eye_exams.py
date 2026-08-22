from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.enums import UserRole
from app.schemas.eye_exam import (
    DiagnosisCreate,
    DiagnosisRead,
    EyeExamCreate,
    EyeExamDetailRead,
    EyeExamRead,
    EyeExamUpdate,
    IOPMeasurementCreate,
    IOPMeasurementRead,
    KeratometryCreate,
    KeratometryRead,
    ProcedureCreate,
    ProcedureRead,
    RefractionCreate,
    RefractionRead,
    VisualAcuityCreate,
    VisualAcuityRead,
)
from app.schemas.optical_rx import (
    ContactLensRxCreate,
    ContactLensRxRead,
    ContactLensRxUpdate,
    SpectacleRxCreate,
    SpectacleRxRead,
    SpectacleRxUpdate,
)
from app.services import audit_service, eye_exam_service, optical_rx_service
from app.services.authorization_service import ensure_can_view_patient
from app.utils.deps import get_db, require_role

router = APIRouter(tags=["Eye Care Clinical"])

# Role sets matching the records matrix.
_VIEW_ROLES = (UserRole.admin, UserRole.doctor, UserRole.nurse, UserRole.receptionist)
_EDIT_ROLES = (UserRole.admin, UserRole.doctor)


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


# ============================ Eye exams ============================
@router.post(
    "/medical-records/{record_id}/eye-exams",
    response_model=EyeExamDetailRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_eye_exam(
    record_id: UUID,
    body: EyeExamCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    record = await eye_exam_service.get_record_or_404(db, record_id)
    await ensure_can_view_patient(db, current, record.patient_id)
    exam = await eye_exam_service.create_exam(db, record, body, actor=current)
    await audit_service.record(
        db,
        actor=current,
        action="eye_exam.create",
        entity_type="eye_exam",
        entity_id=exam.id,
        metadata={"medical_record_id": str(record.id), "patient_id": str(record.patient_id)},
        ip=_client_ip(request),
    )
    await db.commit()
    return exam


@router.get(
    "/medical-records/{record_id}/eye-exams",
    response_model=list[EyeExamRead],
    status_code=status.HTTP_200_OK,
)
async def list_eye_exams(
    record_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_VIEW_ROLES))],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    record = await eye_exam_service.get_record_or_404(db, record_id)
    await ensure_can_view_patient(db, current, record.patient_id)
    return await eye_exam_service.list_exams_for_record(db, record_id, skip=skip, limit=limit)


@router.get(
    "/eye-exams/{exam_id}",
    response_model=EyeExamDetailRead,
    status_code=status.HTTP_200_OK,
)
async def get_eye_exam(
    exam_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_VIEW_ROLES))],
):
    exam = await eye_exam_service.get_exam_or_404(db, exam_id)
    await ensure_can_view_patient(db, current, exam.patient_id)
    return exam


@router.patch(
    "/eye-exams/{exam_id}",
    response_model=EyeExamDetailRead,
    status_code=status.HTTP_200_OK,
)
async def update_eye_exam(
    exam_id: UUID,
    body: EyeExamUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    exam = await eye_exam_service.get_exam_or_404(db, exam_id)
    await ensure_can_view_patient(db, current, exam.patient_id)
    changed = sorted(body.model_dump(exclude_unset=True).keys())
    exam = await eye_exam_service.update_exam(db, exam, body, actor=current)
    await audit_service.record(
        db,
        actor=current,
        action="eye_exam.update",
        entity_type="eye_exam",
        entity_id=exam.id,
        metadata={"fields": changed},
        ip=_client_ip(request),
    )
    await db.commit()
    return exam


@router.delete("/eye-exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_eye_exam(
    exam_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    exam = await eye_exam_service.get_exam_or_404(db, exam_id)
    await ensure_can_view_patient(db, current, exam.patient_id)
    await eye_exam_service.delete_exam(db, exam, actor=current)
    await audit_service.record(
        db,
        actor=current,
        action="eye_exam.delete",
        entity_type="eye_exam",
        entity_id=exam.id,
        metadata={"patient_id": str(exam.patient_id)},
        ip=_client_ip(request),
    )
    await db.commit()


# ==================== Nested measurements / dx / procedures ====================
async def _load_exam_for_edit(db: AsyncSession, exam_id: UUID, current: User):
    exam = await eye_exam_service.get_exam_or_404(db, exam_id)
    await ensure_can_view_patient(db, current, exam.patient_id)
    return exam


@router.post(
    "/eye-exams/{exam_id}/acuities",
    response_model=VisualAcuityRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_acuity(
    exam_id: UUID,
    body: VisualAcuityCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    exam = await _load_exam_for_edit(db, exam_id, current)
    row = await eye_exam_service.add_visual_acuity(db, exam, body)
    await audit_service.record(
        db, actor=current, action="visual_acuity.create", entity_type="visual_acuity",
        entity_id=row.id, metadata={"eye_exam_id": str(exam.id)}, ip=_client_ip(request),
    )
    await db.commit()
    return row


@router.post(
    "/eye-exams/{exam_id}/refractions",
    response_model=RefractionRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_refraction(
    exam_id: UUID,
    body: RefractionCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    exam = await _load_exam_for_edit(db, exam_id, current)
    row = await eye_exam_service.add_refraction(db, exam, body)
    await audit_service.record(
        db, actor=current, action="refraction.create", entity_type="refraction",
        entity_id=row.id, metadata={"eye_exam_id": str(exam.id)}, ip=_client_ip(request),
    )
    await db.commit()
    return row


@router.post(
    "/eye-exams/{exam_id}/iop",
    response_model=IOPMeasurementRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_iop(
    exam_id: UUID,
    body: IOPMeasurementCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    exam = await _load_exam_for_edit(db, exam_id, current)
    row = await eye_exam_service.add_iop(db, exam, body)
    await audit_service.record(
        db, actor=current, action="iop.create", entity_type="iop_measurement",
        entity_id=row.id, metadata={"eye_exam_id": str(exam.id)}, ip=_client_ip(request),
    )
    await db.commit()
    return row


@router.post(
    "/eye-exams/{exam_id}/keratometries",
    response_model=KeratometryRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_keratometry(
    exam_id: UUID,
    body: KeratometryCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    exam = await _load_exam_for_edit(db, exam_id, current)
    row = await eye_exam_service.add_keratometry(db, exam, body)
    await audit_service.record(
        db, actor=current, action="keratometry.create", entity_type="keratometry",
        entity_id=row.id, metadata={"eye_exam_id": str(exam.id)}, ip=_client_ip(request),
    )
    await db.commit()
    return row


@router.post(
    "/eye-exams/{exam_id}/diagnoses",
    response_model=DiagnosisRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_diagnosis(
    exam_id: UUID,
    body: DiagnosisCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    exam = await _load_exam_for_edit(db, exam_id, current)
    row = await eye_exam_service.add_diagnosis(db, exam, body, actor=current)
    await audit_service.record(
        db, actor=current, action="diagnosis.create", entity_type="diagnosis",
        entity_id=row.id, metadata={"eye_exam_id": str(exam.id)}, ip=_client_ip(request),
    )
    await db.commit()
    return row


@router.post(
    "/eye-exams/{exam_id}/procedures",
    response_model=ProcedureRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_procedure(
    exam_id: UUID,
    body: ProcedureCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    exam = await _load_exam_for_edit(db, exam_id, current)
    row = await eye_exam_service.add_procedure(db, exam, body, actor=current)
    await audit_service.record(
        db, actor=current, action="procedure.create", entity_type="procedure",
        entity_id=row.id, metadata={"eye_exam_id": str(exam.id)}, ip=_client_ip(request),
    )
    await db.commit()
    return row


# ============================ Spectacle Rx ============================
@router.post(
    "/patients/{patient_id}/spectacle-rx",
    response_model=SpectacleRxRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_spectacle_rx(
    patient_id: UUID,
    body: SpectacleRxCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    await ensure_can_view_patient(db, current, patient_id)
    rx = await optical_rx_service.create_spectacle(db, patient_id, body, actor=current)
    await audit_service.record(
        db, actor=current, action="spectacle_rx.create", entity_type="spectacle_rx",
        entity_id=rx.id, metadata={"patient_id": str(patient_id)}, ip=_client_ip(request),
    )
    await db.commit()
    return rx


@router.get(
    "/patients/{patient_id}/spectacle-rx",
    response_model=list[SpectacleRxRead],
    status_code=status.HTTP_200_OK,
)
async def list_spectacle_rx(
    patient_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_VIEW_ROLES))],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    await ensure_can_view_patient(db, current, patient_id)
    return await optical_rx_service.list_spectacle_for_patient(db, patient_id, skip=skip, limit=limit)


@router.get(
    "/spectacle-rx/{rx_id}",
    response_model=SpectacleRxRead,
    status_code=status.HTTP_200_OK,
)
async def get_spectacle_rx(
    rx_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_VIEW_ROLES))],
):
    rx = await optical_rx_service.get_spectacle_or_404(db, rx_id)
    await ensure_can_view_patient(db, current, rx.patient_id)
    return rx


@router.patch(
    "/spectacle-rx/{rx_id}",
    response_model=SpectacleRxRead,
    status_code=status.HTTP_200_OK,
)
async def update_spectacle_rx(
    rx_id: UUID,
    body: SpectacleRxUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    rx = await optical_rx_service.get_spectacle_or_404(db, rx_id)
    await ensure_can_view_patient(db, current, rx.patient_id)
    changed = sorted(body.model_dump(exclude_unset=True).keys())
    rx = await optical_rx_service.update_spectacle(db, rx, body, actor=current)
    await audit_service.record(
        db, actor=current, action="spectacle_rx.update", entity_type="spectacle_rx",
        entity_id=rx.id, metadata={"fields": changed}, ip=_client_ip(request),
    )
    await db.commit()
    return rx


@router.delete("/spectacle-rx/{rx_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_spectacle_rx(
    rx_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    rx = await optical_rx_service.get_spectacle_or_404(db, rx_id)
    await ensure_can_view_patient(db, current, rx.patient_id)
    await optical_rx_service.delete_spectacle(db, rx, actor=current)
    await audit_service.record(
        db, actor=current, action="spectacle_rx.delete", entity_type="spectacle_rx",
        entity_id=rx.id, metadata={"patient_id": str(rx.patient_id)}, ip=_client_ip(request),
    )
    await db.commit()


# ============================ Contact lens Rx ============================
@router.post(
    "/patients/{patient_id}/contact-lens-rx",
    response_model=ContactLensRxRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_contact_lens_rx(
    patient_id: UUID,
    body: ContactLensRxCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    await ensure_can_view_patient(db, current, patient_id)
    rx = await optical_rx_service.create_contact(db, patient_id, body, actor=current)
    await audit_service.record(
        db, actor=current, action="contact_lens_rx.create", entity_type="contact_lens_rx",
        entity_id=rx.id, metadata={"patient_id": str(patient_id)}, ip=_client_ip(request),
    )
    await db.commit()
    return rx


@router.get(
    "/patients/{patient_id}/contact-lens-rx",
    response_model=list[ContactLensRxRead],
    status_code=status.HTTP_200_OK,
)
async def list_contact_lens_rx(
    patient_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_VIEW_ROLES))],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    await ensure_can_view_patient(db, current, patient_id)
    return await optical_rx_service.list_contact_for_patient(db, patient_id, skip=skip, limit=limit)


@router.get(
    "/contact-lens-rx/{rx_id}",
    response_model=ContactLensRxRead,
    status_code=status.HTTP_200_OK,
)
async def get_contact_lens_rx(
    rx_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_VIEW_ROLES))],
):
    rx = await optical_rx_service.get_contact_or_404(db, rx_id)
    await ensure_can_view_patient(db, current, rx.patient_id)
    return rx


@router.patch(
    "/contact-lens-rx/{rx_id}",
    response_model=ContactLensRxRead,
    status_code=status.HTTP_200_OK,
)
async def update_contact_lens_rx(
    rx_id: UUID,
    body: ContactLensRxUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    rx = await optical_rx_service.get_contact_or_404(db, rx_id)
    await ensure_can_view_patient(db, current, rx.patient_id)
    changed = sorted(body.model_dump(exclude_unset=True).keys())
    rx = await optical_rx_service.update_contact(db, rx, body, actor=current)
    await audit_service.record(
        db, actor=current, action="contact_lens_rx.update", entity_type="contact_lens_rx",
        entity_id=rx.id, metadata={"fields": changed}, ip=_client_ip(request),
    )
    await db.commit()
    return rx


@router.delete("/contact-lens-rx/{rx_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact_lens_rx(
    rx_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(*_EDIT_ROLES))],
):
    rx = await optical_rx_service.get_contact_or_404(db, rx_id)
    await ensure_can_view_patient(db, current, rx.patient_id)
    await optical_rx_service.delete_contact(db, rx, actor=current)
    await audit_service.record(
        db, actor=current, action="contact_lens_rx.delete", entity_type="contact_lens_rx",
        entity_id=rx.id, metadata={"patient_id": str(rx.patient_id)}, ip=_client_ip(request),
    )
    await db.commit()
