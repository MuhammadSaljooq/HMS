"""MFA (TOTP) enrollment, activation, disable, and login-challenge verification.

Router owns the DB transaction (commit); services flush/refresh only. All state
changes are audited. Login remains unchanged for MFA-disabled users — see
routers/auth.py::login.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import User
from app.rate_limit import limiter
from app.routers.auth import attach_auth_cookies
from app.schemas.user import (
    AuthUserResponse,
    MfaCodeRequest,
    MfaEnrollResponse,
    MfaVerifyRequest,
    UserRead,
)
from app.services import audit_service, auth_service, mfa_service
from app.utils.deps import get_current_user, get_db
from app.utils.security import decode_mfa_challenge_token

router = APIRouter(prefix="/auth/mfa", tags=["Auth", "MFA"])
settings = get_settings()


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/enroll", response_model=MfaEnrollResponse, status_code=status.HTTP_200_OK)
@limiter.limit(settings.RATE_LIMIT_MFA)
async def enroll_mfa(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> MfaEnrollResponse:
    secret, uri = mfa_service.begin_enrollment(current)
    await db.flush()
    await audit_service.record(
        db,
        actor=current,
        action="user.mfa_enroll",
        entity_type="user",
        entity_id=current.id,
        metadata=None,
        ip=_client_ip(request),
    )
    await db.commit()
    return MfaEnrollResponse(secret=secret, otpauth_uri=uri)


@router.post("/activate", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.RATE_LIMIT_MFA)
async def activate_mfa(
    request: Request,
    body: MfaCodeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Response:
    if not mfa_service.activate(current, body.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid MFA code or no pending enrollment.",
        )
    await db.flush()
    await audit_service.record(
        db,
        actor=current,
        action="user.mfa_activate",
        entity_type="user",
        entity_id=current.id,
        metadata=None,
        ip=_client_ip(request),
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/disable", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.RATE_LIMIT_MFA)
async def disable_mfa(
    request: Request,
    body: MfaCodeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Response:
    # Admins may disable without a code (recovery); everyone else must prove a code.
    from app.models.enums import UserRole

    if current.role != UserRole.admin:
        if not current.mfa_enabled or not mfa_service.verify_code(current.mfa_secret or "", body.code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid MFA code is required to disable MFA.",
            )
    mfa_service.disable(current)
    await db.flush()
    await audit_service.record(
        db,
        actor=current,
        action="user.mfa_disable",
        entity_type="user",
        entity_id=current.id,
        metadata=None,
        ip=_client_ip(request),
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/verify", response_model=AuthUserResponse, status_code=status.HTTP_200_OK)
@limiter.limit(settings.RATE_LIMIT_MFA)
async def verify_mfa(
    request: Request,
    body: MfaVerifyRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JSONResponse:
    """Complete a login challenge: validate the challenge token + TOTP code, issue tokens."""
    try:
        payload = decode_mfa_challenge_token(body.mfa_token)
        sub = payload.get("sub")
        if not sub:
            raise JWTError()
        user_id = UUID(sub)
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired MFA challenge.",
        ) from None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired MFA challenge.",
        )
    if not mfa_service.verify_code(user.mfa_secret or "", body.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid MFA code.",
        )

    access, refresh = auth_service.issue_tokens(user)
    await db.commit()
    content = AuthUserResponse(
        user=UserRead.model_validate(user), access_token=access
    ).model_dump(mode="json")
    response = JSONResponse(content=content)
    attach_auth_cookies(response, access, refresh)
    return response
