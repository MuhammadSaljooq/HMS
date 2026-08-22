from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from jose import JWTError
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import User
from app.models.enums import UserRole
from app.rate_limit import limiter
from app.schemas.user import (
    AuthUserResponse,
    ChangePasswordRequest,
    LoginRequest,
    MfaChallengeResponse,
    UserCreate,
    UserRead,
)
from app.services import audit_service, auth_service
from app.services.token_denylist import is_refresh_token_revoked, revoke_refresh_token
from app.utils.deps import get_current_user, get_db, require_role
from app.utils.security import (
    create_mfa_challenge_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Auth"])
settings = get_settings()


def _cookie_kwargs(max_age: int) -> dict:
    return {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
        "path": "/",
        "max_age": max_age,
    }


def attach_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie(
        settings.ACCESS_TOKEN_COOKIE_NAME,
        access,
        **_cookie_kwargs(settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60),
    )
    response.set_cookie(
        settings.REFRESH_TOKEN_COOKIE_NAME,
        refresh,
        **_cookie_kwargs(settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400),
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.ACCESS_TOKEN_COOKIE_NAME, path="/")
    response.delete_cookie(settings.REFRESH_TOKEN_COOKIE_NAME, path="/")


@router.post(
    "/login",
    response_model=AuthUserResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def login(
    request: Request,
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JSONResponse:
    user = await auth_service.authenticate_user(db, str(body.email), body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    # MFA-enabled accounts must complete a TOTP challenge before a session is issued.
    # MFA is disabled for all existing users, so this branch is never taken for them
    # and their login behaviour is byte-for-byte unchanged.
    if user.mfa_enabled:
        challenge = create_mfa_challenge_token(str(user.id))
        return JSONResponse(
            content=MfaChallengeResponse(mfa_token=challenge).model_dump(mode="json")
        )
    access, refresh = auth_service.issue_tokens(user)
    await db.commit()
    payload = AuthUserResponse(user=UserRead.model_validate(user), access_token=access).model_dump(mode="json")
    response = JSONResponse(content=payload)
    attach_auth_cookies(response, access, refresh)
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request) -> Response:
    raw_refresh = request.cookies.get(settings.REFRESH_TOKEN_COOKIE_NAME)
    if raw_refresh:
        try:
            payload = decode_refresh_token(raw_refresh)
            await revoke_refresh_token(raw_refresh, payload.get("exp"))
        except JWTError:
            pass
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(response)
    return response


@router.post(
    "/refresh",
    response_model=AuthUserResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit(settings.RATE_LIMIT_REFRESH)
async def refresh_session(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JSONResponse:
    raw = request.cookies.get(settings.REFRESH_TOKEN_COOKIE_NAME)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token.",
        )
    if await is_refresh_token_revoked(raw):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked.",
        )
    try:
        payload = decode_refresh_token(raw)
        sub = payload.get("sub")
        if not sub:
            raise JWTError()

        user = await auth_service.get_user_by_id(db, UUID(sub))
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        ) from None

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )
    access, refresh = auth_service.issue_tokens(user)
    await revoke_refresh_token(raw, payload.get("exp"))
    await db.commit()
    payload = AuthUserResponse(user=UserRead.model_validate(user), access_token=access).model_dump(mode="json")
    response = JSONResponse(content=payload)
    attach_auth_cookies(response, access, refresh)
    return response


@router.get("/me", response_model=UserRead, status_code=status.HTTP_200_OK)
async def read_me(current: Annotated[User, Depends(get_current_user)]) -> User:
    return current


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Response:
    if not verify_password(body.current_password, current.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    current.password_hash = hash_password(body.new_password)
    await db.flush()
    await audit_service.record(
        db,
        actor=current,
        action="user.change_password",
        entity_type="user",
        entity_id=current.id,
        metadata=None,
        ip=request.client.host if request.client else None,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("20/minute")
async def register_user(
    request: Request,
    body: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.admin))],
) -> User:
    try:
        user = await auth_service.create_user(db, body)
        await db.commit()
        return user
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/bootstrap",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def bootstrap_first_admin(
    request: Request,
    body: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_bootstrap_token: Annotated[str | None, Header(alias="X-Bootstrap-Token")] = None,
) -> User:
    if settings.BOOTSTRAP_ADMIN_TOKEN:
        if x_bootstrap_token != settings.BOOTSTRAP_ADMIN_TOKEN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid bootstrap token.",
            )
    elif not settings.DEBUG:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bootstrap is disabled unless BOOTSTRAP_ADMIN_TOKEN is configured.",
        )
    # Serialize concurrent bootstraps with a transaction-scoped advisory lock so the
    # count-check + insert cannot race and create more than one first admin.
    await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": 91847})
    count = int((await db.execute(select(func.count()).select_from(User))).scalar_one())
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bootstrap is only allowed when no users exist.",
        )
    try:
        user = await auth_service.create_user(db, body, force_role=UserRole.admin)
        await db.commit()
        return user
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
