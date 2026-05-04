from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Appointment, Patient, Transcription, User
from app.models.enums import TranscriptionStatus, UserRole
from app.schemas.dashboard import DashboardStats
from app.utils.deps import get_db, require_role

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])
TZ = ZoneInfo("Asia/Karachi")


@router.get(
    "/stats",
    response_model=DashboardStats,
    status_code=status.HTTP_200_OK,
)
async def dashboard_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.admin))],
) -> DashboardStats:
    total_patients = int((await db.execute(select(func.count()).select_from(Patient))).scalar_one())

    local_now = datetime.now(TZ)
    local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = local_start.astimezone(timezone.utc)
    end = (local_start + timedelta(days=1)).astimezone(timezone.utc)
    appointments_today = int(
        (
            await db.execute(
                select(func.count()).select_from(Appointment).where(
                    Appointment.scheduled_at >= start,
                    Appointment.scheduled_at < end,
                )
            )
        ).scalar_one()
    )

    patients_registered_today = int(
        (
            await db.execute(
                select(func.count()).select_from(Patient).where(
                    Patient.created_at >= start,
                    Patient.created_at < end,
                )
            )
        ).scalar_one()
    )

    pending_transcriptions = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Transcription)
                .where(
                    Transcription.status.in_(
                        [TranscriptionStatus.pending, TranscriptionStatus.processing]
                    )
                )
            )
        ).scalar_one()
    )

    active_doctors = int(
        (
            await db.execute(
                select(func.count()).select_from(User).where(User.role == UserRole.doctor, User.is_active.is_(True))
            )
        ).scalar_one()
    )

    return DashboardStats(
        total_patients=total_patients,
        patients_registered_today=patients_registered_today,
        appointments_today=appointments_today,
        pending_transcriptions=pending_transcriptions,
        active_doctors=active_doctors,
    )
