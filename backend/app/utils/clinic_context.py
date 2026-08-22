from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.enums import UserRole
from app.services import clinic_service
from app.utils.deps import get_current_user, get_db

CLINIC_HEADER = "X-Clinic-Id"


async def get_active_clinic_id(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> UUID | None:
    """Resolve the active clinic for this request.

    NON-ENFORCING in this milestone: it is provided as a dependency/utility but
    is deliberately NOT wired into existing patient/appointment/record/invoice
    queries. Resolution order:

    1. Optional ``X-Clinic-Id`` header, validated against the user's
       memberships (admins may pass any existing clinic id).
    2. Otherwise the user's primary membership clinic.
    3. ``None`` if nothing resolves.
    """
    header_value = request.headers.get(CLINIC_HEADER)
    if header_value:
        try:
            requested = UUID(header_value)
        except ValueError:
            return await clinic_service.resolve_primary_clinic_id(db, user.id)

        if user.role == UserRole.admin:
            clinic = await clinic_service.get_clinic(db, requested)
            return clinic.id if clinic is not None else None

        membership = await clinic_service.get_membership(db, requested, user.id)
        if membership is not None:
            return membership.clinic_id
        # Requested a clinic the user is not a member of: fall back to primary.
        return await clinic_service.resolve_primary_clinic_id(db, user.id)

    return await clinic_service.resolve_primary_clinic_id(db, user.id)
