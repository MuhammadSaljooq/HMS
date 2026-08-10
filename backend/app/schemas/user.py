from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import UserRole

_PASSWORD_POLICY_MESSAGE = "Password must be at least 12 characters and include a letter and a digit."


def _validate_password_policy(value: str | None) -> str | None:
    if value is None:
        return value
    if not (any(c.isalpha() for c in value) and any(c.isdigit() for c in value)):
        raise ValueError(_PASSWORD_POLICY_MESSAGE)
    return value


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role: UserRole


class UserCreate(UserBase):
    password: str = Field(min_length=12, max_length=128)

    @field_validator("password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        return _validate_password_policy(value)


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=12, max_length=128)

    @field_validator("password")
    @classmethod
    def _password_policy(cls, value: str | None) -> str | None:
        return _validate_password_policy(value)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime


class UserListResponse(BaseModel):
    items: list[UserRead]
    total: int


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        return _validate_password_policy(value)


class TokenPayload(BaseModel):
    sub: str
    type: str


class AuthUserResponse(BaseModel):
    user: UserRead
    access_token: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
