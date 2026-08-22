from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Clinic, ClinicMembership, Region, User
from app.models.enums import UserRole
from app.schemas.clinic import (
    ClinicCreate,
    ClinicMembershipCreate,
    ClinicMembershipRead,
    ClinicRead,
    ClinicUpdate,
    RegionCreate,
    RegionRead,
    RegionUpdate,
)
from app.services import audit_service, clinic_service
from app.utils.deps import get_current_user, get_db, require_role

router = APIRouter(prefix="/clinics", tags=["Clinics"])
regions_router = APIRouter(prefix="/regions", tags=["Regions"])

DB = Annotated[AsyncSession, Depends(get_db)]
AnyStaff = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[
    User,
    Depends(
        require_role(
            UserRole.admin,
            UserRole.doctor,
            UserRole.nurse,
            UserRole.receptionist,
            UserRole.cashier,
        )
    ),
]
# require_role always passes for admin; use a strict admin-only dependency for mutations.
StrictAdmin = Annotated[User, Depends(require_role(UserRole.admin))]


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


async def _get_clinic_or_404(db: AsyncSession, clinic_id: UUID) -> Clinic:
    clinic = await clinic_service.get_clinic(db, clinic_id)
    if clinic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found.")
    return clinic


async def _get_region_or_404(db: AsyncSession, region_id: UUID) -> Region:
    region = await clinic_service.get_region(db, region_id)
    if region is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Region not found.")
    return region


async def _get_user_or_404(db: AsyncSession, user_id: UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


# ---- Regions ----
@regions_router.get("", response_model=list[RegionRead])
async def list_regions(db: DB, current: AnyStaff) -> list[Region]:
    return await clinic_service.list_regions(db)


@regions_router.post("", response_model=RegionRead, status_code=status.HTTP_201_CREATED)
async def create_region(body: RegionCreate, request: Request, db: DB, current: StrictAdmin) -> Region:
    region = await clinic_service.create_region(db, body)
    await audit_service.record(
        db,
        actor=current,
        action="region.create",
        entity_type="region",
        entity_id=region.id,
        metadata={"code": region.code},
        ip=_client_ip(request),
    )
    await db.commit()
    return region


@regions_router.patch("/{region_id}", response_model=RegionRead)
async def update_region(
    region_id: UUID, body: RegionUpdate, request: Request, db: DB, current: StrictAdmin
) -> Region:
    region = await _get_region_or_404(db, region_id)
    changed = sorted(body.model_dump(exclude_unset=True).keys())
    region = await clinic_service.update_region(db, region, body)
    await audit_service.record(
        db,
        actor=current,
        action="region.update",
        entity_type="region",
        entity_id=region.id,
        metadata={"fields": changed},
        ip=_client_ip(request),
    )
    await db.commit()
    return region


# ---- Clinics ----
@router.get("", response_model=list[ClinicRead])
async def list_clinics(db: DB, current: AnyStaff) -> list[Clinic]:
    return await clinic_service.list_clinics(db)


@router.post("", response_model=ClinicRead, status_code=status.HTTP_201_CREATED)
async def create_clinic(body: ClinicCreate, request: Request, db: DB, current: StrictAdmin) -> Clinic:
    if body.region_id is not None:
        await _get_region_or_404(db, body.region_id)
    clinic = await clinic_service.create_clinic(db, body)
    await audit_service.record(
        db,
        actor=current,
        action="clinic.create",
        entity_type="clinic",
        entity_id=clinic.id,
        metadata={"code": clinic.code},
        ip=_client_ip(request),
    )
    await db.commit()
    return clinic


@router.get("/{clinic_id}", response_model=ClinicRead)
async def get_clinic(clinic_id: UUID, db: DB, current: AnyStaff) -> Clinic:
    return await _get_clinic_or_404(db, clinic_id)


@router.patch("/{clinic_id}", response_model=ClinicRead)
async def update_clinic(
    clinic_id: UUID, body: ClinicUpdate, request: Request, db: DB, current: StrictAdmin
) -> Clinic:
    clinic = await _get_clinic_or_404(db, clinic_id)
    if body.region_id is not None:
        await _get_region_or_404(db, body.region_id)
    changed = sorted(body.model_dump(exclude_unset=True).keys())
    clinic = await clinic_service.update_clinic(db, clinic, body)
    await audit_service.record(
        db,
        actor=current,
        action="clinic.update",
        entity_type="clinic",
        entity_id=clinic.id,
        metadata={"fields": changed},
        ip=_client_ip(request),
    )
    await db.commit()
    return clinic


# ---- Memberships ----
@router.get("/{clinic_id}/members", response_model=list[ClinicMembershipRead])
async def list_members(clinic_id: UUID, db: DB, current: AnyStaff) -> list[ClinicMembership]:
    await _get_clinic_or_404(db, clinic_id)
    return await clinic_service.list_members(db, clinic_id)


@router.post(
    "/{clinic_id}/members",
    response_model=ClinicMembershipRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    clinic_id: UUID, body: ClinicMembershipCreate, request: Request, db: DB, current: StrictAdmin
) -> ClinicMembership:
    await _get_clinic_or_404(db, clinic_id)
    await _get_user_or_404(db, body.user_id)
    existing = await clinic_service.get_membership(db, clinic_id, body.user_id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this clinic.",
        )
    membership = await clinic_service.add_member(
        db, clinic_id, body.user_id, is_primary=body.is_primary
    )
    await audit_service.record(
        db,
        actor=current,
        action="clinic.member.add",
        entity_type="clinic_membership",
        entity_id=membership.id,
        metadata={"clinic_id": str(clinic_id), "user_id": str(body.user_id)},
        ip=_client_ip(request),
    )
    await db.commit()
    return membership


@router.delete("/{clinic_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    clinic_id: UUID, user_id: UUID, request: Request, db: DB, current: StrictAdmin
) -> None:
    await _get_clinic_or_404(db, clinic_id)
    membership = await clinic_service.get_membership(db, clinic_id, user_id)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found.")
    membership_id = membership.id
    await clinic_service.remove_member(db, membership)
    await audit_service.record(
        db,
        actor=current,
        action="clinic.member.remove",
        entity_type="clinic_membership",
        entity_id=membership_id,
        metadata={"clinic_id": str(clinic_id), "user_id": str(user_id)},
        ip=_client_ip(request),
    )
    await db.commit()
