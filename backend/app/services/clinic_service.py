from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Clinic, ClinicMembership, Region, User
from app.schemas.clinic import (
    ClinicCreate,
    ClinicUpdate,
    RegionCreate,
    RegionUpdate,
)
from app.services.soft_delete import not_deleted


# ---- Regions ----
async def list_regions(db: AsyncSession, *, include_inactive: bool = True) -> list[Region]:
    stmt = select(Region).where(not_deleted(Region))
    if not include_inactive:
        stmt = stmt.where(Region.is_active.is_(True))
    stmt = stmt.order_by(Region.created_at.asc())
    return list((await db.execute(stmt)).scalars().all())


async def get_region(db: AsyncSession, region_id: UUID) -> Region | None:
    region = await db.get(Region, region_id)
    if region is None or region.deleted_at is not None:
        return None
    return region


async def create_region(db: AsyncSession, body: RegionCreate) -> Region:
    region = Region(name=body.name, code=body.code, is_active=body.is_active)
    db.add(region)
    await db.flush()
    await db.refresh(region)
    return region


async def update_region(db: AsyncSession, region: Region, body: RegionUpdate) -> Region:
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(region, field, value)
    await db.flush()
    await db.refresh(region)
    return region


# ---- Clinics ----
async def list_clinics(db: AsyncSession, *, include_inactive: bool = True) -> list[Clinic]:
    stmt = select(Clinic).where(not_deleted(Clinic))
    if not include_inactive:
        stmt = stmt.where(Clinic.is_active.is_(True))
    stmt = stmt.order_by(Clinic.created_at.asc())
    return list((await db.execute(stmt)).scalars().all())


async def get_clinic(db: AsyncSession, clinic_id: UUID) -> Clinic | None:
    clinic = await db.get(Clinic, clinic_id)
    if clinic is None or clinic.deleted_at is not None:
        return None
    return clinic


async def create_clinic(db: AsyncSession, body: ClinicCreate) -> Clinic:
    clinic = Clinic(
        name=body.name,
        code=body.code,
        region_id=body.region_id,
        address_line1=body.address_line1,
        address_line2=body.address_line2,
        city=body.city,
        state=body.state,
        postal_code=body.postal_code,
        country=body.country,
        phone=body.phone,
        email=body.email,
        timezone=body.timezone,
        is_active=body.is_active,
    )
    db.add(clinic)
    await db.flush()
    await db.refresh(clinic)
    return clinic


async def update_clinic(db: AsyncSession, clinic: Clinic, body: ClinicUpdate) -> Clinic:
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(clinic, field, value)
    await db.flush()
    await db.refresh(clinic)
    return clinic


# ---- Memberships ----
async def list_members(db: AsyncSession, clinic_id: UUID) -> list[ClinicMembership]:
    stmt = (
        select(ClinicMembership)
        .where(ClinicMembership.clinic_id == clinic_id)
        .order_by(ClinicMembership.created_at.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def get_membership(
    db: AsyncSession, clinic_id: UUID, user_id: UUID
) -> ClinicMembership | None:
    stmt = select(ClinicMembership).where(
        ClinicMembership.clinic_id == clinic_id,
        ClinicMembership.user_id == user_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def add_member(
    db: AsyncSession, clinic_id: UUID, user_id: UUID, *, is_primary: bool = False
) -> ClinicMembership:
    membership = ClinicMembership(
        clinic_id=clinic_id, user_id=user_id, is_primary=is_primary
    )
    db.add(membership)
    await db.flush()
    await db.refresh(membership)
    return membership


async def remove_member(db: AsyncSession, membership: ClinicMembership) -> None:
    await db.delete(membership)
    await db.flush()


# ---- Resolution helpers ----
async def get_user_memberships(db: AsyncSession, user_id: UUID) -> list[ClinicMembership]:
    stmt = (
        select(ClinicMembership)
        .where(ClinicMembership.user_id == user_id)
        .order_by(ClinicMembership.created_at.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def resolve_user_clinics(db: AsyncSession, user: User) -> list[Clinic]:
    """Clinics a user may access. Admin is a superuser and sees all clinics."""
    from app.models.enums import UserRole

    if user.role == UserRole.admin:
        return await list_clinics(db)
    stmt = (
        select(Clinic)
        .join(ClinicMembership, ClinicMembership.clinic_id == Clinic.id)
        .where(ClinicMembership.user_id == user.id, not_deleted(Clinic))
        .order_by(Clinic.created_at.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def resolve_primary_clinic_id(db: AsyncSession, user_id: UUID) -> UUID | None:
    """The user's primary clinic (or first membership) clinic id, if any."""
    memberships = await get_user_memberships(db, user_id)
    if not memberships:
        return None
    for m in memberships:
        if m.is_primary:
            return m.clinic_id
    return memberships[0].clinic_id
