from __future__ import annotations

import pytest
from cryptography.fernet import Fernet, MultiFernet

from app.utils import encryption


def test_encrypt_decrypt_roundtrip() -> None:
    plaintext = "JBSWY3DPEHPK3PXP-secret"
    token = encryption.encrypt(plaintext)
    assert token != plaintext
    assert encryption.decrypt(token) == plaintext


def test_decrypt_tolerates_legacy_plaintext() -> None:
    # A value written before encryption was enabled must not crash on read.
    assert encryption.decrypt("plain-legacy-value") == "plain-legacy-value"


def test_multifernet_rotation_old_key_still_decrypts() -> None:
    old_key = Fernet.generate_key()
    new_key = Fernet.generate_key()

    # Encrypt with only the old key.
    old_only = MultiFernet([Fernet(old_key)])
    token = old_only.encrypt(b"rotate-me").decode()

    # After rotation, new key is primary but old key remains for decryption.
    rotated = MultiFernet([Fernet(new_key), Fernet(old_key)])
    assert rotated.decrypt(token.encode()).decode() == "rotate-me"

    # And a value encrypted with the rotated set is readable too.
    fresh = rotated.encrypt(b"fresh").decode()
    assert rotated.decrypt(fresh.encode()).decode() == "fresh"
