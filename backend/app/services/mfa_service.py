"""TOTP (MFA) business logic.

Follows the repo convention: this service flushes/refreshes but never commits —
the router owns the transaction. The stored secret is written to
``User.mfa_secret`` which is an ``EncryptedString`` column, so it is encrypted
at rest transparently.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pyotp

from app.config import get_settings
from app.models import User

settings = get_settings()

_ISSUER = settings.APP_NAME


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, account_name: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=_ISSUER)


def verify_code(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    # valid_window=1 tolerates ~30s clock skew on either side.
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)


def begin_enrollment(user: User) -> tuple[str, str]:
    """Assign a pending (not-yet-enabled) secret and return (secret, otpauth_uri)."""
    secret = generate_secret()
    user.mfa_secret = secret
    # Do not enable yet — activation requires proving a valid code.
    uri = provisioning_uri(secret, user.email)
    return secret, uri


def activate(user: User, code: str) -> bool:
    """Verify the pending secret and, if valid, enable MFA. Returns success."""
    if not user.mfa_secret:
        return False
    if not verify_code(user.mfa_secret, code):
        return False
    user.mfa_enabled = True
    user.mfa_enrolled_at = datetime.now(timezone.utc)
    return True


def disable(user: User) -> None:
    user.mfa_secret = None
    user.mfa_enabled = False
    user.mfa_enrolled_at = None
