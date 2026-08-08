from __future__ import annotations

import getpass
from functools import lru_cache
from typing import Literal
from urllib.parse import quote

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_database_url() -> str:
    """
    When DATABASE_URL is not set (no backend/.env), pick a URL that works on common setups:

    - macOS Homebrew / Postgres.app: OS login role (peer/trust), DB `hms_db` on localhost.
    - Docker Compose: copy `.env.example` → `.env` and use the `postgres:postgres@...` URL instead.
    """
    user = quote(getpass.getuser(), safe="")
    return f"postgresql+asyncpg://{user}@127.0.0.1:5432/hms_db"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "National Eye Care Hospital API"
    APP_ENV: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = False
    SQL_ECHO: bool = False

    SECRET_KEY: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"

    DATABASE_URL: str = Field(default_factory=_default_database_url)

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    ACCESS_TOKEN_COOKIE_NAME: str = "access_token"
    REFRESH_TOKEN_COOKIE_NAME: str = "refresh_token"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"

    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # S3-compatible storage (optional)
    S3_ENDPOINT_URL: str | None = None
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    S3_BUCKET_NAME: str | None = None
    S3_PUBLIC_BASE_URL: str | None = None

    GOOGLE_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_FALLBACK_MODEL: str | None = "gemini-2.0-flash"
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None

    # Whisper language hint. Must stay unset/None (auto-detect) for code-switched
    # Urdu+English consultations: forcing a single language would drop the other language.
    # Only set "ur"/"en" for known single-language audio; leave None for bilingual clinics.
    WHISPER_LANGUAGE: str | None = None

    # Celery (async transcription); Redis by default
    REDIS_URL: str | None = "redis://localhost:6379"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"
    RATE_LIMIT_STORAGE_URL: str | None = None

    # Audio longer than this (seconds) uses POST /transcribe/async when duration not known (see router heuristics)
    TRANSCRIBE_ASYNC_THRESHOLD_SECONDS: int = 30
    BOOTSTRAP_ADMIN_TOKEN: str | None = None

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def split_origins(cls, v: str | list[str]) -> str:
        if isinstance(v, list):
            return ",".join(v)
        return v

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def validate_security_defaults(self) -> "Settings":
        is_prod_like = self.APP_ENV in {"staging", "production"}
        if is_prod_like and (
            not self.SECRET_KEY or self.SECRET_KEY.strip() == "dev-secret-change-in-production"
        ):
            raise ValueError("SECRET_KEY must be configured to a non-default value in staging/production.")
        if is_prod_like and not self.COOKIE_SECURE:
            raise ValueError("COOKIE_SECURE must be true in staging/production.")
        if is_prod_like and self.DEBUG is True:
            raise ValueError("DEBUG must be false in staging/production.")
        if is_prod_like and self.SQL_ECHO is True:
            raise ValueError("SQL_ECHO must be false in staging/production.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
