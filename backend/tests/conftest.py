from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings
from app.main import app
from app.models import User
from app.models.enums import UserRole
from app.utils.security import hash_password
from app.utils.deps import get_current_user, get_db


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


# Dedicated test engine using NullPool so no connection is reused across
# pytest's per-test event loops (avoids "Event loop is closed" teardown noise).
test_engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """A session bound to a connection whose outer transaction is rolled back."""
    connection = await test_engine.connect()
    trans = await connection.begin()
    maker = async_sessionmaker(bind=connection, expire_on_commit=False, autoflush=False)
    session = maker()
    try:
        yield session
    finally:
        await session.close()
        await trans.rollback()
        await connection.close()


async def _make_user(db: AsyncSession, role: UserRole) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"{role.value}-{uuid.uuid4().hex[:8]}@test.example.com",
        password_hash=hash_password("Test12345!"),
        role=role,
        full_name=f"Test {role.value}",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def make_user(db_session: AsyncSession):
    async def _factory(role: UserRole) -> User:
        return await _make_user(db_session, role)
    return _factory


@pytest_asyncio.fixture
async def client(db_session: AsyncSession, make_user) -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient with DB + auth overridable per-test via client.app.state.current_user."""
    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    async def _override_user() -> User:
        return app.state.test_current_user

    app.state.test_current_user = await make_user(UserRole.admin)
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
