from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.enums import UserRole
from app.schemas.user import UserListResponse, UserRead, UserUpdate
from app.services import auth_service, audit_service
from app.utils.deps import get_current_user, get_db, require_role
from app.utils.security import hash_password

router = APIRouter(prefix="/users", tags=["Users"])


async def _get_user_or_404(db: AsyncSession, user_id: UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


async def _count_active_admins(db: AsyncSession) -> int:
    stmt = select(func.count()).select_from(User).where(
        User.role == UserRole.admin, User.is_active.is_(True)
    )
    return int((await db.execute(stmt)).scalar_one())


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


@router.get("", response_model=UserListResponse, status_code=status.HTTP_200_OK)
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.admin))],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    role: UserRole | None = Query(None),
    is_active: bool | None = Query(None),
) -> UserListResponse:
    filters = []
    if role is not None:
        filters.append(User.role == role)
    if is_active is not None:
        filters.append(User.is_active.is_(is_active))

    count_stmt = select(func.count()).select_from(User)
    list_stmt = select(User).order_by(User.created_at.desc())
    for f in filters:
        count_stmt = count_stmt.where(f)
        list_stmt = list_stmt.where(f)
    list_stmt = list_stmt.offset(skip).limit(limit)

    total = int((await db.execute(count_stmt)).scalar_one())
    rows = (await db.execute(list_stmt)).scalars().all()
    return UserListResponse(items=[UserRead.model_validate(u) for u in rows], total=total)


@router.get("/{user_id}", response_model=UserRead, status_code=status.HTTP_200_OK)
async def get_user(
    user_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.admin))],
) -> User:
    return await _get_user_or_404(db, user_id)


@router.patch("/{user_id}", response_model=UserRead, status_code=status.HTTP_200_OK)
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(require_role(UserRole.admin))],
) -> User:
    user = await _get_user_or_404(db, user_id)
    changes = body.model_dump(exclude_unset=True)

    is_self = user.id == current.id
    deactivating = "is_active" in changes and changes["is_active"] is False and user.is_active
    demoting = (
        "role" in changes
        and changes["role"] != UserRole.admin
        and user.role == UserRole.admin
    )

    # Self-protection: an admin cannot lock themselves out.
    if is_self and deactivating:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )
    if is_self and demoting:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role away from admin.",
        )

    # Last-active-admin protection: never remove the final admin/active admin.
    if (deactivating or demoting) and user.role == UserRole.admin and user.is_active:
        active_admins = await _count_active_admins(db)
        if active_admins <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate or demote the last active admin.",
            )

    # Email change: enforce uniqueness.
    if "email" in changes and changes["email"] is not None:
        new_email = str(changes["email"]).lower()
        if new_email != user.email:
            existing = await auth_service.get_user_by_email(db, new_email)
            if existing is not None and existing.id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A user with this email already exists.",
                )
        user.email = new_email

    if "full_name" in changes and changes["full_name"] is not None:
        user.full_name = changes["full_name"]
    if "role" in changes and changes["role"] is not None:
        user.role = changes["role"]
    if "is_active" in changes and changes["is_active"] is not None:
        user.is_active = changes["is_active"]
    if "password" in changes and changes["password"] is not None:
        user.password_hash = hash_password(changes["password"])

    await db.flush()

    await audit_service.record(
        db,
        actor=current,
        action="user.update",
        entity_type="user",
        entity_id=user.id,
        metadata={"fields": sorted(changes.keys())},
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(user)
    return user
