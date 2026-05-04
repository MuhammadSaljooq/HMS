import pytest

from app.config import Settings


def test_staging_requires_non_default_secret() -> None:
    with pytest.raises(ValueError):
        Settings(APP_ENV="staging", SECRET_KEY="dev-secret-change-in-production", COOKIE_SECURE=True)


def test_staging_requires_secure_cookies() -> None:
    with pytest.raises(ValueError):
        Settings(APP_ENV="staging", SECRET_KEY="a-strong-secret", COOKIE_SECURE=False)


def test_development_allows_defaults() -> None:
    cfg = Settings(APP_ENV="development", SECRET_KEY="dev-secret-change-in-production", COOKIE_SECURE=False)
    assert cfg.APP_ENV == "development"
