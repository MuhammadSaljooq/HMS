from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.enums import UserRole
from app.schemas.user import UserRead
from app.utils.deps import get_current_user, get_db

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/doctors", response_model=list[UserRead], status_code=status.HTTP_200_OK)
async def list_active_doctors(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[User]:
    stmt = (
        select(User)
        .where(User.role == UserRole.doctor, User.is_active.is_(True))
        .order_by(User.full_name.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)
