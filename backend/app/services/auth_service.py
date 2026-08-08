from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.enums import UserRole
from app.schemas.user import UserCreate
from app.utils.security import create_access_token, create_refresh_token, hash_password, verify_password

# Precomputed once at import time. Used to keep authentication constant-time when
# the account is missing or inactive, so we always spend a bcrypt verify and do not
# leak account existence/state through a timing side-channel.
_DUMMY_HASH = hash_password("not-a-real-password-placeholder")


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    user = await get_user_by_email(db, email)
    if user is None or not user.is_active:
        # Perform a dummy verify so the response time does not reveal whether the
        # account exists or is active. Result is discarded.
        verify_password(password, _DUMMY_HASH)
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def create_user(db: AsyncSession, data: UserCreate, *, force_role: UserRole | None = None) -> User:
    existing = await get_user_by_email(db, str(data.email))
    if existing:
        raise ValueError("A user with this email already exists.")
    role = force_role if force_role is not None else data.role
    user = User(
        email=str(data.email).lower(),
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


def issue_tokens(user: User) -> tuple[str, str]:
    subject = str(user.id)
    access = create_access_token(
        subject,
        extra_claims={"role": user.role.value, "email": user.email},
    )
    refresh = create_refresh_token(subject, extra_claims={"role": user.role.value})
    return access, refresh


async def get_user_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
