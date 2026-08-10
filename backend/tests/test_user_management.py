import uuid

import pytest
from sqlalchemy import select

from app.main import app
from app.models import AuditLog, User
from app.models.enums import UserRole
from app.services import auth_service


async def _as_role(make_user, role):
    user = await make_user(role)
    app.state.test_current_user = user
    return user


@pytest.mark.asyncio
async def test_non_admin_cannot_list_or_update_users(client, make_user):
    await _as_role(make_user, UserRole.doctor)
    target = await make_user(UserRole.doctor)

    resp = await client.get("/api/users")
    assert resp.status_code == 403

    resp2 = await client.patch(f"/api/users/{target.id}", json={"is_active": False})
    assert resp2.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_list_users(client, make_user):
    await _as_role(make_user, UserRole.admin)
    await make_user(UserRole.doctor)

    resp = await client.get("/api/users")
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body and "total" in body
    assert body["total"] >= 2
    assert isinstance(body["items"], list)


@pytest.mark.asyncio
async def test_admin_can_update_user_and_audit_written(client, make_user, db_session):
    await _as_role(make_user, UserRole.admin)
    target = await make_user(UserRole.doctor)

    resp = await client.patch(
        f"/api/users/{target.id}",
        json={"is_active": False, "role": UserRole.receptionist.value},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_active"] is False
    assert body["role"] == UserRole.receptionist.value

    rows = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "user.update",
                AuditLog.entity_id == target.id,
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert set(rows[0].audit_metadata["fields"]) == {"is_active", "role"}


@pytest.mark.asyncio
async def test_admin_cannot_deactivate_self(client, make_user):
    admin = await _as_role(make_user, UserRole.admin)
    resp = await client.patch(f"/api/users/{admin.id}", json={"is_active": False})
    assert resp.status_code == 400
    assert "your own account" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_admin_cannot_demote_own_role(client, make_user):
    admin = await _as_role(make_user, UserRole.admin)
    resp = await client.patch(
        f"/api/users/{admin.id}", json={"role": UserRole.doctor.value}
    )
    assert resp.status_code == 400
    assert "your own role" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_cannot_deactivate_or_demote_last_active_admin(client, make_user, db_session):
    # Make a dedicated admin who will be the sole active admin, and an actor admin
    # to perform the mutation (avoiding the self-guard path). To isolate the
    # last-admin guard, first deactivate every OTHER active admin in the DB
    # (including the one the `client` fixture created) directly in the DB.
    acting = await _as_role(make_user, UserRole.admin)
    sole_admin = await make_user(UserRole.admin)

    other_active_admins = (
        await db_session.execute(
            select(User).where(
                User.role == UserRole.admin,
                User.is_active.is_(True),
                User.id.notin_([acting.id, sole_admin.id]),
            )
        )
    ).scalars().all()
    for u in other_active_admins:
        u.is_active = False
    # `acting` is the actor; deactivate acting too so `sole_admin` is truly the last.
    await db_session.flush()

    # Deactivating `sole_admin` while `acting` is still active is allowed.
    resp = await client.patch(f"/api/users/{sole_admin.id}", json={"is_active": False})
    assert resp.status_code == 200

    # Now only `acting` remains active. `acting` acting on itself is self-guarded,
    # so instead re-activate sole_admin and make it the sole active admin, then
    # have `acting` try to deactivate it -> last-admin guard fires.
    sole_admin.is_active = True
    acting.is_active = False
    await db_session.flush()

    resp2 = await client.patch(f"/api/users/{sole_admin.id}", json={"is_active": False})
    assert resp2.status_code == 400
    assert "last active admin" in resp2.json()["detail"]

    # Demotion of the last active admin is likewise rejected.
    resp3 = await client.patch(
        f"/api/users/{sole_admin.id}", json={"role": UserRole.doctor.value}
    )
    assert resp3.status_code == 400
    assert "last active admin" in resp3.json()["detail"]


@pytest.mark.asyncio
async def test_change_password_wrong_current(client, make_user):
    await _as_role(make_user, UserRole.doctor)
    resp = await client.post(
        "/api/auth/change-password",
        json={"current_password": "WrongPassword1", "new_password": "BrandNewPass123"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Current password is incorrect."


@pytest.mark.asyncio
async def test_change_password_success_then_authenticate(client, make_user, db_session):
    user = await _as_role(make_user, UserRole.doctor)
    resp = await client.post(
        "/api/auth/change-password",
        json={"current_password": "Test12345!", "new_password": "BrandNewPass123"},
    )
    assert resp.status_code == 204, resp.text

    # Old password no longer works; new password authenticates.
    assert await auth_service.authenticate_user(db_session, user.email, "Test12345!") is None
    authed = await auth_service.authenticate_user(db_session, user.email, "BrandNewPass123")
    assert authed is not None
    assert authed.id == user.id
