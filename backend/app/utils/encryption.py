"""PHI encryption-at-rest helpers.

A thin wrapper over ``cryptography.fernet.MultiFernet`` so we get authenticated
symmetric encryption with key rotation: the FIRST key in ``PHI_ENCRYPTION_KEYS``
encrypts new values, while every key can decrypt (so rotating a key does not
break already-stored ciphertext).

Also exposes an SQLAlchemy ``TypeDecorator`` (:class:`EncryptedString`) that
encrypts on write and decrypts on read transparently. It is deliberately tolerant
of ``None`` and of legacy plaintext values (a value that was written before the
column was encrypted decrypts to itself instead of raising).

This is additive groundwork (Milestone 1B). Existing populated columns are NOT
retrofitted here — that needs a data migration and is handled later.
"""

from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

from app.config import get_settings


@lru_cache
def _get_multifernet() -> MultiFernet:
    keys = get_settings().phi_encryption_key_list()
    if not keys:
        raise RuntimeError("PHI_ENCRYPTION_KEYS is not configured; cannot encrypt PHI.")
    return MultiFernet([Fernet(k.encode()) for k in keys])


def encrypt(plaintext: str) -> str:
    """Encrypt a string, returning urlsafe-base64 ciphertext (a ``str``)."""
    token = _get_multifernet().encrypt(plaintext.encode("utf-8"))
    return token.decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """Decrypt a ciphertext produced by :func:`encrypt`.

    If the value is not a valid Fernet token (e.g. legacy plaintext written before
    encryption was enabled), it is returned unchanged rather than raising.
    """
    try:
        return _get_multifernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        # Tolerate already-plaintext / non-token legacy values.
        return ciphertext


class EncryptedString(TypeDecorator):
    """A ``String`` column whose value is encrypted at rest.

    Transparently encrypts on the way to the DB and decrypts on the way back.
    Tolerant of ``None`` and of legacy plaintext values.
    """

    impl = String
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        return encrypt(value)

    def process_result_value(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        return decrypt(value)
