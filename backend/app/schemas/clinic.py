from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---- Region ----
class RegionBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=32)
    is_active: bool = True


class RegionCreate(RegionBase):
    pass


class RegionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=32)
    is_active: bool | None = None


class RegionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---- Clinic ----
class ClinicBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=32)
    region_id: uuid.UUID | None = None
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    state: str | None = Field(default=None, max_length=128)
    postal_code: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=128)
    phone: str | None = Field(default=None, max_length=64)
    email: EmailStr | None = None
    timezone: str = Field(default="Asia/Karachi", max_length=64)
    is_active: bool = True


class ClinicCreate(ClinicBase):
    pass


class ClinicUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=32)
    region_id: uuid.UUID | None = None
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    state: str | None = Field(default=None, max_length=128)
    postal_code: str | None = Field(default=None, max_length=32)
    country: str | None = Field(default=None, max_length=128)
    phone: str | None = Field(default=None, max_length=64)
    email: EmailStr | None = None
    timezone: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None


class ClinicRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str
    region_id: uuid.UUID | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    phone: str | None = None
    email: str | None = None
    timezone: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---- Clinic membership ----
class ClinicMembershipCreate(BaseModel):
    user_id: uuid.UUID
    is_primary: bool = False


class ClinicMembershipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    clinic_id: uuid.UUID
    is_primary: bool
    created_at: datetime
