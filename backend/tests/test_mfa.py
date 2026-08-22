from __future__ import annotations

import uuid

import pyotp
import pytest
from sqlalchemy import text

from app.models import User
from app.models.enums import UserRole
from app.utils import encryption


@pytest.mark.asyncio
async def test_mfa_secret_stored_encrypted_but_reads_back(db_session) -> None:
    secret = pyotp.random_base32()
    user = User(
        id=uuid.uuid4(),
        email=f"enc-{uuid.uuid4().hex[:8]}@test.example.com",
        password_hash="x",
        role=UserRole.doctor,
        full_name="Enc User",
        is_active=True,
        mfa_secret=secret,
    )
    db_session.add(user)
    await db_session.flush()

    # Raw column value must NOT equal the plaintext secret.
    raw = (
        await db_session.execute(
            text("SELECT mfa_secret FROM users WHERE id = :id"), {"id": user.id}
        )
    ).scalar_one()
    assert raw != secret
    assert isinstance(raw, str) and len(raw) > 0

    # The raw ciphertext decrypts back to the original (transparent read path).
    assert encryption.decrypt(raw) == secret


@pytest.mark.asyncio
async def test_login_unchanged_for_mfa_disabled_user(client, db_session) -> None:
    # Create a normal MFA-disabled user with a known password.
    from app.utils.security import hash_password

    email = f"nomfa-{uuid.uuid4().hex[:8]}@test.example.com"
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Test12345678!"),
        role=UserRole.doctor,
        full_name="No MFA",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    resp = await client.post("/api/auth/login", json={"email": email, "password": "Test12345678!"})
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body.get("mfa_required") is None
    assert body["user"]["email"] == email


@pytest.mark.asyncio
async def test_mfa_full_flow_enroll_activate_challenge_verify(client, db_session) -> None:
    from app.utils.security import hash_password

    email = f"mfa-{uuid.uuid4().hex[:8]}@test.example.com"
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Test12345678!"),
        role=UserRole.doctor,
        full_name="MFA User",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    # Authenticate as this user for the enroll/activate calls.
    from app.main import app

    app.state.test_current_user = user

    enroll = await client.post("/api/auth/mfa/enroll")
    assert enroll.status_code == 200
    secret = enroll.json()["secret"]
    assert enroll.json()["otpauth_uri"].startswith("otpauth://")

    # Wrong code fails activation.
    bad = await client.post("/api/auth/mfa/activate", json={"code": "000000"})
    assert bad.status_code == 400

    # Correct code activates.
    good_code = pyotp.TOTP(secret).now()
    act = await client.post("/api/auth/mfa/activate", json={"code": good_code})
    assert act.status_code == 204
    assert user.mfa_enabled is True

    # Login now returns an MFA challenge, not tokens.
    login = await client.post(
        "/api/auth/login", json={"email": email, "password": "Test12345678!"}
    )
    assert login.status_code == 200
    assert login.json().get("mfa_required") is True
    mfa_token = login.json()["mfa_token"]

    # Wrong code at verify fails.
    wrong = await client.post(
        "/api/auth/mfa/verify", json={"mfa_token": mfa_token, "code": "000000"}
    )
    assert wrong.status_code == 401

    # Correct code completes login.
    code = pyotp.TOTP(secret).now()
    verify = await client.post(
        "/api/auth/mfa/verify", json={"mfa_token": mfa_token, "code": code}
    )
    assert verify.status_code == 200
    assert "access_token" in verify.json()


@pytest.mark.asyncio
async def test_mfa_verify_rejects_bogus_token(client) -> None:
    resp = await client.post(
        "/api/auth/mfa/verify", json={"mfa_token": "not-a-real-token", "code": "123456"}
    )
    assert resp.status_code == 401
