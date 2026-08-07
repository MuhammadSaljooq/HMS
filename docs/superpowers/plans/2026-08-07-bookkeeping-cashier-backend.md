# Bookkeeping / Cashier — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-grade bookkeeping/cashier backend — fee schedule, invoices, line items, payments/refunds, void, receipts, and reports — plus the shared audit-log foundation, all behind a new `cashier` role.

**Architecture:** New billing vertical slice following the repo's existing conventions: models in `app/models/`, Pydantic schemas in `app/schemas/billing.py`, business logic in `app/services/` (async, flush+refresh, **no commit** — routers commit), endpoints in `app/routers/billing.py` registered in `app/main.py` under `/api`. Money is `Decimal`/`Numeric(12,2)`. Payment math lives in a **pure, unit-tested** module (`app/services/billing_calc.py`) so the risky logic is testable without a database. A new append-only `audit_logs` table records every financial mutation atomically with the mutation.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, Postgres, Pydantic v2, pytest (+ pytest-asyncio for DB integration tests), httpx ASGITransport.

**Spec:** `docs/superpowers/specs/2026-08-07-bookkeeping-cashier-design.md`

**Scope:** Backend only (spec PR 1). The frontend (spec §9) is a separate companion plan.

---

## File map

**Create:**
- `backend/tests/conftest.py` — async test harness (rollback-per-test session + app client + auth helpers)
- `backend/app/services/billing_calc.py` — pure Decimal math + status derivation + payment validation
- `backend/app/models/audit.py` — `AuditLog`
- `backend/app/models/billing.py` — `ServiceCatalog`, `Invoice`, `InvoiceLineItem`, `Payment`
- `backend/app/services/audit_service.py` — `record(...)`
- `backend/app/services/billing_service.py` — catalog, patient lookup, invoice/line-item/issue, payment/refund/void, number generators, reports
- `backend/app/schemas/billing.py` — request/response models
- `backend/app/routers/billing.py` — endpoints
- `backend/app/utils/create_cashier.py` — seed a cashier user
- `backend/app/utils/seed_service_catalog.py` — seed starter fee schedule
- `backend/alembic/versions/0003_add_cashier_role.py`
- `backend/alembic/versions/0004_billing_and_audit_tables.py`
- `backend/alembic/versions/0005_billing_indexes.py`
- Test files: `tests/test_billing_calc.py`, `tests/test_billing_authorization.py`, `tests/test_billing_numbering.py`, `tests/test_billing_flow.py`, `tests/test_billing_reports.py`, `tests/test_billing_authz_api.py`

**Modify:**
- `backend/app/models/enums.py` — add `cashier`, `InvoiceStatus`, `PaymentMethod`, `PaymentType`
- `backend/app/models/__init__.py` — export new models
- `backend/app/services/authorization_service.py` — billing predicates
- `backend/app/main.py:63-70` — register billing router
- `backend/requirements.txt` — add `pytest-asyncio`

---

## Task 1: Async test harness

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/tests/conftest.py`

Existing tests are pure-unit (no DB). Billing needs DB-backed integration tests. This harness runs each test in a transaction that is rolled back, against the same Postgres the app uses (migrations must already be applied via `alembic upgrade head`).

- [ ] **Step 1: Add pytest-asyncio to requirements**

Add this line to `backend/requirements.txt` (after `pytest>=8.3.0`):

```
pytest-asyncio>=0.24.0
```

- [ ] **Step 2: Install it**

Run: `cd backend && ./.venv/bin/python -m pip install -q -r requirements.txt`
Expected: no errors.

- [ ] **Step 3: Write `tests/conftest.py`**

```python
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import engine
from app.main import app
from app.models import User
from app.models.enums import UserRole
from app.services.auth_service import get_password_hash
from app.utils.deps import get_current_user, get_db


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """A session bound to a connection whose outer transaction is rolled back."""
    connection = await engine.connect()
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
        password_hash=get_password_hash("Test12345!"),
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
```

- [ ] **Step 4: Verify `get_password_hash` exists (adjust import if named differently)**

Run: `cd backend && grep -n "def get_password_hash\|def hash_password\|pwd_context" app/services/auth_service.py`
Expected: a hashing helper. If it is named `hash_password`, update the import and call in Step 3 accordingly.

- [ ] **Step 5: Add pytest asyncio config**

Create `backend/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 6: Sanity-run existing suite (harness must not break it)**

Run: `cd backend && ./.venv/bin/python -m pytest -q`
Expected: existing 16 tests still pass (new conftest imports cleanly).

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/tests/conftest.py backend/pytest.ini
git commit -m "test: add async DB test harness for billing"
```

---

## Task 2: Enums (cashier role + billing enums)

**Files:**
- Modify: `backend/app/models/enums.py`

- [ ] **Step 1: Add the enums**

Append to `backend/app/models/enums.py`:

```python
class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    issued = "issued"
    partially_paid = "partially_paid"
    paid = "paid"
    void = "void"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    bank_transfer = "bank_transfer"
    mobile_wallet = "mobile_wallet"
    other = "other"


class PaymentType(str, enum.Enum):
    payment = "payment"
    refund = "refund"
```

And add `cashier` to `UserRole`:

```python
class UserRole(str, enum.Enum):
    admin = "admin"
    doctor = "doctor"
    nurse = "nurse"
    receptionist = "receptionist"
    cashier = "cashier"
```

- [ ] **Step 2: Verify it imports**

Run: `cd backend && ./.venv/bin/python -c "from app.models.enums import UserRole, InvoiceStatus, PaymentMethod, PaymentType; print(UserRole.cashier, InvoiceStatus.paid, PaymentMethod.cash, PaymentType.refund)"`
Expected: `UserRole.cashier InvoiceStatus.paid PaymentMethod.cash PaymentType.refund`

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/enums.py
git commit -m "feat: add cashier role and billing enums"
```

---

## Task 3: Migration 0003 — add cashier role value (non-transactional)

**Files:**
- Create: `backend/alembic/versions/0003_add_cashier_role.py`

`ALTER TYPE ... ADD VALUE` cannot run inside a transaction block, so this migration disables the per-migration transaction.

- [ ] **Step 1: Write the migration**

```python
"""Add cashier role value

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-07

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE cannot run in a transaction; commit the ambient one first.
    op.execute("COMMIT")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cashier'")


def downgrade() -> None:
    # Postgres cannot drop an enum value; no-op by design.
    pass
```

- [ ] **Step 2: Apply it**

Run: `cd backend && ./.venv/bin/alembic upgrade head`
Expected: upgrades to 0003 with no error.

- [ ] **Step 3: Verify the value exists**

Run: `cd backend && ./.venv/bin/python -c "import asyncio; from sqlalchemy import text; from app.database import engine; asyncio.run(__import__('app').__dict__ and None)"` — simpler, use psql:
Run: `docker exec hms-postgres psql -U postgres -d hms_db -c "SELECT unnest(enum_range(NULL::user_role));"`
Expected: list includes `cashier`.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/0003_add_cashier_role.py
git commit -m "feat: migration adds cashier enum value"
```

---

## Task 4: Pure payment math (`billing_calc.py`) — TDD

**Files:**
- Create: `backend/app/services/billing_calc.py`
- Test: `backend/tests/test_billing_calc.py`

This is the highest-risk logic; keep it pure and fully tested.

- [ ] **Step 1: Write failing tests**

```python
from decimal import Decimal

import pytest

from app.models.enums import InvoiceStatus, PaymentType
from app.services import billing_calc as calc


def test_line_total():
    assert calc.compute_line_total(Decimal("150.00"), 3) == Decimal("450.00")


def test_totals_with_discount_and_tax():
    subtotal, total = calc.compute_totals(
        [Decimal("450.00"), Decimal("50.00")], Decimal("100.00"), Decimal("0.00")
    )
    assert subtotal == Decimal("500.00")
    assert total == Decimal("400.00")


def test_net_paid_nets_refunds():
    entries = [
        (PaymentType.payment, Decimal("300.00")),
        (PaymentType.payment, Decimal("100.00")),
        (PaymentType.refund, Decimal("50.00")),
    ]
    assert calc.net_paid(entries) == Decimal("350.00")


@pytest.mark.parametrize(
    "total,paid,issued,voided,expected",
    [
        (Decimal("400"), Decimal("0"), False, False, InvoiceStatus.draft),
        (Decimal("400"), Decimal("0"), True, False, InvoiceStatus.issued),
        (Decimal("400"), Decimal("150"), True, False, InvoiceStatus.partially_paid),
        (Decimal("400"), Decimal("400"), True, False, InvoiceStatus.paid),
        (Decimal("400"), Decimal("450"), True, False, InvoiceStatus.paid),
        (Decimal("400"), Decimal("400"), True, True, InvoiceStatus.void),
    ],
)
def test_derive_status(total, paid, issued, voided, expected):
    assert calc.derive_status(total_amount=total, amount_paid=paid, issued=issued, voided=voided) == expected


def test_validate_payment_rejects_overpayment():
    with pytest.raises(calc.PaymentValidationError):
        calc.validate_payment(
            payment_type=PaymentType.payment,
            amount=Decimal("500.00"),
            current_amount_paid=Decimal("0.00"),
            total_amount=Decimal("400.00"),
        )


def test_validate_payment_rejects_refund_larger_than_paid():
    with pytest.raises(calc.PaymentValidationError):
        calc.validate_payment(
            payment_type=PaymentType.refund,
            amount=Decimal("100.00"),
            current_amount_paid=Decimal("50.00"),
            total_amount=Decimal("400.00"),
        )


def test_validate_payment_rejects_nonpositive():
    with pytest.raises(calc.PaymentValidationError):
        calc.validate_payment(
            payment_type=PaymentType.payment,
            amount=Decimal("0.00"),
            current_amount_paid=Decimal("0.00"),
            total_amount=Decimal("400.00"),
        )
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_calc.py -q`
Expected: FAIL (module `billing_calc` not found).

- [ ] **Step 3: Implement `billing_calc.py`**

```python
from __future__ import annotations

from decimal import Decimal

from app.models.enums import InvoiceStatus, PaymentType

CENTS = Decimal("0.01")


class PaymentValidationError(ValueError):
    """Raised when a payment/refund is not allowed."""


def _q(value: Decimal) -> Decimal:
    return value.quantize(CENTS)


def compute_line_total(unit_price: Decimal, quantity: int) -> Decimal:
    return _q(unit_price * Decimal(quantity))


def compute_totals(
    line_totals: list[Decimal], discount_total: Decimal, tax_total: Decimal
) -> tuple[Decimal, Decimal]:
    subtotal = _q(sum(line_totals, Decimal("0")))
    total = _q(subtotal - discount_total + tax_total)
    return subtotal, total


def net_paid(entries: list[tuple[PaymentType, Decimal]]) -> Decimal:
    total = Decimal("0")
    for kind, amount in entries:
        total += amount if kind == PaymentType.payment else -amount
    return _q(total)


def derive_status(
    *, total_amount: Decimal, amount_paid: Decimal, issued: bool, voided: bool
) -> InvoiceStatus:
    if voided:
        return InvoiceStatus.void
    if not issued:
        return InvoiceStatus.draft
    if amount_paid <= 0:
        return InvoiceStatus.issued
    if amount_paid >= total_amount:
        return InvoiceStatus.paid
    return InvoiceStatus.partially_paid


def validate_payment(
    *,
    payment_type: PaymentType,
    amount: Decimal,
    current_amount_paid: Decimal,
    total_amount: Decimal,
) -> None:
    if amount <= 0:
        raise PaymentValidationError("Amount must be positive.")
    if payment_type == PaymentType.payment:
        if current_amount_paid + amount > total_amount:
            raise PaymentValidationError("Payment exceeds the invoice balance.")
    else:  # refund
        if amount > current_amount_paid:
            raise PaymentValidationError("Refund exceeds the amount paid.")
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_calc.py -q`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/billing_calc.py backend/tests/test_billing_calc.py
git commit -m "feat: pure billing math with tests"
```

---

## Task 5: AuditLog model + billing models

**Files:**
- Create: `backend/app/models/audit.py`, `backend/app/models/billing.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Write `audit.py`**

```python
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    audit_metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
```

- [ ] **Step 2: Write `billing.py`**

```python
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import InvoiceStatus, PaymentMethod, PaymentType

if TYPE_CHECKING:
    from app.models.patient import Patient


class ServiceCatalog(Base):
    __tablename__ = "service_catalog"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_number: Mapped[Optional[str]] = mapped_column(String(32), unique=True, index=True, nullable=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False
    )
    appointment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True
    )
    medical_record_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medical_records.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status"), nullable=False, default=InvoiceStatus.draft
    )
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    discount_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    tax_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    balance_due: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    void_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    patient: Mapped["Patient"] = relationship()
    line_items: Mapped[list["InvoiceLineItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice")


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    service_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_catalog.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=False
    )
    receipt_number: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    payment_type: Mapped[PaymentType] = mapped_column(
        Enum(PaymentType, name="payment_type"), nullable=False, default=PaymentType.payment
    )
    method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod, name="payment_method"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    received_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    invoice: Mapped["Invoice"] = relationship(back_populates="payments")
```

- [ ] **Step 3: Export from `app/models/__init__.py`**

Read the file first, then add these imports and `__all__` entries alongside the existing ones:

```python
from app.models.audit import AuditLog
from app.models.billing import Invoice, InvoiceLineItem, Payment, ServiceCatalog
```

Add `"AuditLog"`, `"ServiceCatalog"`, `"Invoice"`, `"InvoiceLineItem"`, `"Payment"` to `__all__`.

- [ ] **Step 4: Verify models import**

Run: `cd backend && ./.venv/bin/python -c "from app.models import AuditLog, ServiceCatalog, Invoice, InvoiceLineItem, Payment; print('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/audit.py backend/app/models/billing.py backend/app/models/__init__.py
git commit -m "feat: audit + billing ORM models"
```

---

## Task 6: Migration 0004 — audit + billing tables

**Files:**
- Create: `backend/alembic/versions/0004_billing_and_audit_tables.py`

- [ ] **Step 1: Write the migration**

```python
"""Audit + billing tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

invoice_status = postgresql.ENUM(
    "draft", "issued", "partially_paid", "paid", "void", name="invoice_status", create_type=False
)
payment_method = postgresql.ENUM(
    "cash", "card", "bank_transfer", "mobile_wallet", "other", name="payment_method", create_type=False
)
payment_type = postgresql.ENUM("payment", "refund", name="payment_type", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    invoice_status.create(bind, checkfirst=True)
    payment_method.create(bind, checkfirst=True)
    payment_type.create(bind, checkfirst=True)

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
    )

    op.create_table(
        "service_catalog",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("default_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("code", name="uq_service_catalog_code"),
    )

    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("invoice_number", sa.String(length=32), nullable=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("appointment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("medical_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("medical_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", invoice_status, nullable=False, server_default="draft"),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("discount_total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("tax_total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("amount_paid", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("balance_due", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("invoice_number", name="uq_invoices_invoice_number"),
    )

    op.create_table(
        "invoice_line_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("service_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("service_catalog.id", ondelete="SET NULL"), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("receipt_number", sa.String(length=32), nullable=False),
        sa.Column("payment_type", payment_type, nullable=False, server_default="payment"),
        sa.Column("method", payment_method, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reference", sa.String(length=128), nullable=True),
        sa.Column("received_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("receipt_number", name="uq_payments_receipt_number"),
    )


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_table("invoice_line_items")
    op.drop_table("invoices")
    op.drop_table("service_catalog")
    op.drop_table("audit_logs")
    bind = op.get_bind()
    payment_type.drop(bind, checkfirst=True)
    payment_method.drop(bind, checkfirst=True)
    invoice_status.drop(bind, checkfirst=True)
```

- [ ] **Step 2: Apply and round-trip test the migration**

Run: `cd backend && ./.venv/bin/alembic upgrade head && ./.venv/bin/alembic downgrade 0003 && ./.venv/bin/alembic upgrade head`
Expected: upgrades to 0004, downgrades to 0003 (drops tables), re-upgrades cleanly — proves both directions work.

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/0004_billing_and_audit_tables.py
git commit -m "feat: migration for audit + billing tables"
```

---

## Task 7: Migration 0005 — billing indexes

**Files:**
- Create: `backend/alembic/versions/0005_billing_indexes.py`

- [ ] **Step 1: Write the migration**

```python
"""Billing indexes

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-07

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_invoices_patient_created", "invoices", ["patient_id", "created_at"])
    op.create_index("ix_invoices_status", "invoices", ["status"])
    op.create_index("ix_payments_receivedby_receivedat", "payments", ["received_by", "received_at"])
    op.create_index("ix_payments_received_at", "payments", ["received_at"])
    op.create_index("ix_invoice_line_items_service", "invoice_line_items", ["service_id"])


def downgrade() -> None:
    op.drop_index("ix_invoice_line_items_service", table_name="invoice_line_items")
    op.drop_index("ix_payments_received_at", table_name="payments")
    op.drop_index("ix_payments_receivedby_receivedat", table_name="payments")
    op.drop_index("ix_invoices_status", table_name="invoices")
    op.drop_index("ix_invoices_patient_created", table_name="invoices")
```

- [ ] **Step 2: Apply**

Run: `cd backend && ./.venv/bin/alembic upgrade head`
Expected: upgrades to 0005.

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/0005_billing_indexes.py
git commit -m "feat: billing indexes migration"
```

---

## Task 8: Authorization predicates — TDD

**Files:**
- Modify: `backend/app/services/authorization_service.py`
- Test: `backend/tests/test_billing_authorization.py`

- [ ] **Step 1: Write failing tests**

```python
from types import SimpleNamespace
from uuid import uuid4

from app.models.enums import UserRole
from app.services import authorization_service as authz


def _user(role: UserRole):
    return SimpleNamespace(role=role, id=uuid4())


def test_can_manage_billing():
    assert authz.can_manage_billing(_user(UserRole.cashier)) is True
    assert authz.can_manage_billing(_user(UserRole.admin)) is True
    assert authz.can_manage_billing(_user(UserRole.doctor)) is False
    assert authz.can_manage_billing(_user(UserRole.nurse)) is False


def test_can_void_and_catalog_are_admin_only():
    assert authz.can_void_invoice(_user(UserRole.admin)) is True
    assert authz.can_void_invoice(_user(UserRole.cashier)) is False
    assert authz.can_manage_service_catalog(_user(UserRole.admin)) is True
    assert authz.can_manage_service_catalog(_user(UserRole.cashier)) is False


def test_reconciliation_visibility():
    assert authz.can_view_all_reconciliation(_user(UserRole.admin)) is True
    assert authz.can_view_all_reconciliation(_user(UserRole.cashier)) is False
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_authorization.py -q`
Expected: FAIL (predicates not defined).

- [ ] **Step 3: Add predicates to `authorization_service.py`**

Append:

```python
def can_manage_billing(user: User) -> bool:
    return user.role in (UserRole.admin, UserRole.cashier)


def can_void_invoice(user: User) -> bool:
    return user.role == UserRole.admin


def can_manage_service_catalog(user: User) -> bool:
    return user.role == UserRole.admin


def can_view_all_reconciliation(user: User) -> bool:
    return user.role == UserRole.admin
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_authorization.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/authorization_service.py backend/tests/test_billing_authorization.py
git commit -m "feat: billing authorization predicates"
```

---

## Task 9: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/billing.py`

- [ ] **Step 1: Write the schemas**

```python
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import InvoiceStatus, PaymentMethod, PaymentType


# ---- Service catalog ----
class ServiceCatalogCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    default_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class ServiceCatalogUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    default_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    is_active: bool | None = None


class ServiceCatalogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    default_price: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---- Invoices / line items ----
class InvoiceCreate(BaseModel):
    patient_id: uuid.UUID
    appointment_id: uuid.UUID | None = None
    medical_record_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)
    discount_total: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    tax_total: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)


class LineItemCreate(BaseModel):
    service_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=255)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    quantity: int = Field(default=1, ge=1)


class LineItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    service_id: uuid.UUID | None
    description: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal


class PaymentCreate(BaseModel):
    method: PaymentMethod
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    payment_type: PaymentType = PaymentType.payment
    reference: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=2000)


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    invoice_id: uuid.UUID
    receipt_number: str
    payment_type: PaymentType
    method: PaymentMethod
    amount: Decimal
    reference: str | None
    received_by: uuid.UUID
    received_at: datetime
    notes: str | None


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    invoice_number: str | None
    patient_id: uuid.UUID
    appointment_id: uuid.UUID | None
    medical_record_id: uuid.UUID | None
    status: InvoiceStatus
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total_amount: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    notes: str | None
    created_by: uuid.UUID
    issued_at: datetime | None
    voided_at: datetime | None
    void_reason: str | None
    created_at: datetime
    updated_at: datetime


class InvoiceDetail(InvoiceRead):
    line_items: list[LineItemRead] = []
    payments: list[PaymentRead] = []


class InvoiceListResponse(BaseModel):
    items: list[InvoiceRead]
    total: int


class VoidRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class PatientLookupItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str
    mrn: str


# ---- Reports ----
class MethodTotal(BaseModel):
    method: PaymentMethod
    payments: Decimal
    refunds: Decimal
    net: Decimal


class DailyReport(BaseModel):
    date: str
    totals: list[MethodTotal]
    net_total: Decimal


class ReconciliationReport(BaseModel):
    date: str
    cashier_id: uuid.UUID
    totals: list[MethodTotal]
    net_total: Decimal


class OutstandingItem(BaseModel):
    invoice_id: uuid.UUID
    invoice_number: str | None
    patient_id: uuid.UUID
    patient_name: str
    balance_due: Decimal
    status: InvoiceStatus


class RevenueByServiceItem(BaseModel):
    service_id: uuid.UUID | None
    description: str
    total_revenue: Decimal
```

- [ ] **Step 2: Verify import**

Run: `cd backend && ./.venv/bin/python -c "import app.schemas.billing as b; print(b.InvoiceDetail.__name__)"`
Expected: `InvoiceDetail`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/billing.py
git commit -m "feat: billing pydantic schemas"
```

---

## Task 10: `audit_service` + number generators

**Files:**
- Create: `backend/app/services/audit_service.py`
- Create: `backend/app/services/billing_service.py` (numbering only in this task)
- Test: `backend/tests/test_billing_numbering.py`

- [ ] **Step 1: Write `audit_service.py`**

```python
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, User


async def record(
    db: AsyncSession,
    *,
    actor: User,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    metadata: dict | None = None,
    ip: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_user_id=actor.id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        audit_metadata=metadata,
        ip=ip,
    )
    db.add(entry)
    await db.flush()
    return entry
```

- [ ] **Step 2: Write failing numbering test**

```python
import pytest

from app.services import billing_service


@pytest.mark.asyncio
async def test_invoice_and_receipt_numbers_are_unique(db_session):
    a = await billing_service.generate_unique_invoice_number(db_session)
    b = await billing_service.generate_unique_invoice_number(db_session)
    assert a.startswith("INV-") and b.startswith("INV-") and a != b
    r = await billing_service.generate_unique_receipt_number(db_session)
    assert r.startswith("RCP-")
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_numbering.py -q`
Expected: FAIL (module/functions missing).

- [ ] **Step 4: Create `billing_service.py` with generators**

```python
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Invoice, Payment


async def _generate_unique(db: AsyncSession, prefix: str, column, model) -> str:
    for _ in range(50):
        year = datetime.now(timezone.utc).year
        candidate = f"{prefix}-{year}-{secrets.token_hex(3).upper()}"
        exists = await db.execute(select(model.id).where(column == candidate).limit(1))
        if exists.scalar_one_or_none() is None:
            return candidate
    raise RuntimeError(f"Could not generate a unique {prefix} number.")


async def generate_unique_invoice_number(db: AsyncSession) -> str:
    return await _generate_unique(db, "INV", Invoice.invoice_number, Invoice)


async def generate_unique_receipt_number(db: AsyncSession) -> str:
    return await _generate_unique(db, "RCP", Payment.receipt_number, Payment)
```

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_numbering.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/audit_service.py backend/app/services/billing_service.py backend/tests/test_billing_numbering.py
git commit -m "feat: audit service + billing number generators"
```

---

## Task 11: Billing service — catalog, lookup, invoice lifecycle, payments, void

**Files:**
- Modify: `backend/app/services/billing_service.py`
- Test: `backend/tests/test_billing_flow.py`

- [ ] **Step 1: Write failing flow test**

```python
from decimal import Decimal

import pytest

from app.models.enums import InvoiceStatus, PaymentMethod, PaymentType, UserRole
from app.services import billing_calc, billing_service
from app.models import Patient
import uuid
from datetime import date


async def _patient(db):
    p = Patient(id=uuid.uuid4(), mrn=f"MRN-T-{uuid.uuid4().hex[:6]}", full_name="Pat", date_of_birth=date(1990, 1, 1))
    db.add(p)
    await db.flush()
    return p


@pytest.mark.asyncio
async def test_full_invoice_payment_flow(db_session, make_user):
    cashier = await make_user(UserRole.cashier)
    patient = await _patient(db_session)
    svc = await billing_service.create_service(db_session, actor=cashier, code="CONSULT", name="Consult", description=None, default_price=Decimal("300.00"))

    inv = await billing_service.create_invoice(db_session, actor=cashier, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
    assert inv.status == InvoiceStatus.draft

    await billing_service.add_line_item(db_session, actor=cashier, invoice=inv, service_id=svc.id, description=None, unit_price=None, quantity=2)
    await db_session.refresh(inv)
    assert inv.subtotal == Decimal("600.00")
    assert inv.total_amount == Decimal("600.00")

    await billing_service.issue_invoice(db_session, actor=cashier, invoice=inv)
    await db_session.refresh(inv)
    assert inv.status == InvoiceStatus.issued
    assert inv.invoice_number is not None

    pay = await billing_service.record_payment(db_session, actor=cashier, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("250.00"), payment_type=PaymentType.payment, reference=None, notes=None)
    await db_session.refresh(inv)
    assert inv.status == InvoiceStatus.partially_paid
    assert inv.amount_paid == Decimal("250.00")
    assert inv.balance_due == Decimal("350.00")
    assert pay.receipt_number.startswith("RCP-")

    await billing_service.record_payment(db_session, actor=cashier, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("350.00"), payment_type=PaymentType.payment, reference=None, notes=None)
    await db_session.refresh(inv)
    assert inv.status == InvoiceStatus.paid
    assert inv.balance_due == Decimal("0.00")


@pytest.mark.asyncio
async def test_overpayment_rejected(db_session, make_user):
    cashier = await make_user(UserRole.cashier)
    patient = await _patient(db_session)
    inv = await billing_service.create_invoice(db_session, actor=cashier, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
    await billing_service.add_line_item(db_session, actor=cashier, invoice=inv, service_id=None, description="Ad hoc", unit_price=Decimal("100.00"), quantity=1)
    await billing_service.issue_invoice(db_session, actor=cashier, invoice=inv)
    with pytest.raises(billing_calc.PaymentValidationError):
        await billing_service.record_payment(db_session, actor=cashier, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("500.00"), payment_type=PaymentType.payment, reference=None, notes=None)


@pytest.mark.asyncio
async def test_void_blocks_payment(db_session, make_user):
    admin = await make_user(UserRole.admin)
    patient = await _patient(db_session)
    inv = await billing_service.create_invoice(db_session, actor=admin, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
    await billing_service.add_line_item(db_session, actor=admin, invoice=inv, service_id=None, description="X", unit_price=Decimal("100.00"), quantity=1)
    await billing_service.issue_invoice(db_session, actor=admin, invoice=inv)
    await billing_service.void_invoice(db_session, actor=admin, invoice=inv, reason="test")
    await db_session.refresh(inv)
    assert inv.status == InvoiceStatus.void
    with pytest.raises(ValueError):
        await billing_service.record_payment(db_session, actor=admin, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("10.00"), payment_type=PaymentType.payment, reference=None, notes=None)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_flow.py -q`
Expected: FAIL (service functions missing).

- [ ] **Step 3: Append service functions to `billing_service.py`**

```python
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.models import Invoice, InvoiceLineItem, Patient, Payment, ServiceCatalog, User
from app.models.enums import InvoiceStatus, PaymentMethod, PaymentType
from app.services import audit_service, billing_calc


# ---- Service catalog ----
async def create_service(db, *, actor, code, name, description, default_price):
    svc = ServiceCatalog(code=code, name=name, description=description, default_price=default_price)
    db.add(svc)
    await db.flush()
    await audit_service.record(db, actor=actor, action="service.create", entity_type="service_catalog", entity_id=svc.id, metadata={"code": code})
    await db.refresh(svc)
    return svc


async def update_service(db, *, actor, service, name=None, description=None, default_price=None, is_active=None):
    if name is not None:
        service.name = name
    if description is not None:
        service.description = description
    if default_price is not None:
        service.default_price = default_price
    if is_active is not None:
        service.is_active = is_active
    await db.flush()
    await audit_service.record(db, actor=actor, action="service.update", entity_type="service_catalog", entity_id=service.id)
    await db.refresh(service)
    return service


async def list_services(db, *, active_only=False):
    stmt = select(ServiceCatalog).order_by(ServiceCatalog.code)
    if active_only:
        stmt = stmt.where(ServiceCatalog.is_active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


# ---- Patient lookup (billing-scoped) ----
async def lookup_patients(db, *, q, limit=20):
    like = f"%{q}%"
    stmt = (
        select(Patient)
        .where(or_(Patient.full_name.ilike(like), Patient.mrn.ilike(like)))
        .order_by(Patient.full_name)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


# ---- Invoice recompute ----
async def _recompute_invoice(db, invoice):
    lines = (await db.execute(select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice.id))).scalars().all()
    subtotal, total = billing_calc.compute_totals(
        [l.line_total for l in lines], invoice.discount_total, invoice.tax_total
    )
    pays = (await db.execute(select(Payment.payment_type, Payment.amount).where(Payment.invoice_id == invoice.id))).all()
    amount_paid = billing_calc.net_paid([(t, a) for t, a in pays])
    invoice.subtotal = subtotal
    invoice.total_amount = total
    invoice.amount_paid = amount_paid
    invoice.balance_due = (total - amount_paid).quantize(Decimal("0.01"))
    invoice.status = billing_calc.derive_status(
        total_amount=total,
        amount_paid=amount_paid,
        issued=invoice.issued_at is not None,
        voided=invoice.voided_at is not None,
    )
    await db.flush()


# ---- Invoice lifecycle ----
async def create_invoice(db, *, actor, patient_id, appointment_id, medical_record_id, notes, discount_total, tax_total):
    if await db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    inv = Invoice(
        patient_id=patient_id,
        appointment_id=appointment_id,
        medical_record_id=medical_record_id,
        notes=notes,
        discount_total=discount_total,
        tax_total=tax_total,
        status=InvoiceStatus.draft,
        created_by=actor.id,
    )
    db.add(inv)
    await db.flush()
    await _recompute_invoice(db, inv)
    await audit_service.record(db, actor=actor, action="invoice.create", entity_type="invoice", entity_id=inv.id, metadata={"patient_id": str(patient_id)})
    await db.refresh(inv)
    return inv


async def add_line_item(db, *, actor, invoice, service_id, description, unit_price, quantity):
    if invoice.status != InvoiceStatus.draft:
        raise ValueError("Cannot modify line items after the invoice is issued.")
    if service_id is not None:
        svc = await db.get(ServiceCatalog, service_id)
        if svc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
        desc = svc.name
        price = svc.default_price
    else:
        if description is None or unit_price is None:
            raise ValueError("Ad-hoc line items require description and unit_price.")
        desc = description
        price = unit_price
    line = InvoiceLineItem(
        invoice_id=invoice.id,
        service_id=service_id,
        description=desc,
        unit_price=price,
        quantity=quantity,
        line_total=billing_calc.compute_line_total(price, quantity),
    )
    db.add(line)
    await db.flush()
    await _recompute_invoice(db, invoice)
    await audit_service.record(db, actor=actor, action="invoice.add_line", entity_type="invoice", entity_id=invoice.id, metadata={"line_total": str(line.line_total)})
    return line


async def remove_line_item(db, *, actor, invoice, item_id):
    if invoice.status != InvoiceStatus.draft:
        raise ValueError("Cannot modify line items after the invoice is issued.")
    line = await db.get(InvoiceLineItem, item_id)
    if line is None or line.invoice_id != invoice.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found.")
    await db.delete(line)
    await db.flush()
    await _recompute_invoice(db, invoice)
    await audit_service.record(db, actor=actor, action="invoice.remove_line", entity_type="invoice", entity_id=invoice.id)


async def issue_invoice(db, *, actor, invoice):
    if invoice.status != InvoiceStatus.draft:
        raise ValueError("Only draft invoices can be issued.")
    if invoice.invoice_number is None:
        invoice.invoice_number = await generate_unique_invoice_number(db)
    invoice.issued_at = datetime.now(timezone.utc)
    await _recompute_invoice(db, invoice)
    await audit_service.record(db, actor=actor, action="invoice.issue", entity_type="invoice", entity_id=invoice.id, metadata={"invoice_number": invoice.invoice_number})
    await db.refresh(invoice)
    return invoice


async def record_payment(db, *, actor, invoice_id, method, amount, payment_type, reference, notes):
    # Row-lock the invoice so concurrent payments serialize.
    locked = await db.execute(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
    invoice = locked.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    if invoice.status in (InvoiceStatus.draft, InvoiceStatus.void):
        raise ValueError("Cannot record a payment on a draft or void invoice.")
    billing_calc.validate_payment(
        payment_type=payment_type,
        amount=amount,
        current_amount_paid=invoice.amount_paid,
        total_amount=invoice.total_amount,
    )
    payment = Payment(
        invoice_id=invoice.id,
        receipt_number=await generate_unique_receipt_number(db),
        payment_type=payment_type,
        method=method,
        amount=amount,
        reference=reference,
        received_by=actor.id,
        notes=notes,
    )
    db.add(payment)
    await db.flush()
    await _recompute_invoice(db, invoice)
    await audit_service.record(db, actor=actor, action="payment.record", entity_type="payment", entity_id=payment.id, metadata={"invoice_id": str(invoice.id), "amount": str(amount), "type": payment_type.value})
    await db.refresh(payment)
    return payment


async def void_invoice(db, *, actor, invoice, reason):
    if invoice.status == InvoiceStatus.void:
        raise ValueError("Invoice is already void.")
    invoice.voided_at = datetime.now(timezone.utc)
    invoice.voided_by = actor.id
    invoice.void_reason = reason
    invoice.status = InvoiceStatus.void
    await db.flush()
    await audit_service.record(db, actor=actor, action="invoice.void", entity_type="invoice", entity_id=invoice.id, metadata={"reason": reason})
    await db.refresh(invoice)
    return invoice


async def get_invoice_detail(db, invoice_id):
    stmt = (
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(selectinload(Invoice.line_items), selectinload(Invoice.payments))
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_invoices(db, *, patient_id=None, status_filter=None, skip=0, limit=50):
    stmt = select(Invoice)
    count_stmt = select(func.count(Invoice.id))
    if patient_id is not None:
        stmt = stmt.where(Invoice.patient_id == patient_id)
        count_stmt = count_stmt.where(Invoice.patient_id == patient_id)
    if status_filter is not None:
        stmt = stmt.where(Invoice.status == status_filter)
        count_stmt = count_stmt.where(Invoice.status == status_filter)
    stmt = stmt.order_by(Invoice.created_at.desc()).offset(skip).limit(limit)
    items = list((await db.execute(stmt)).scalars().all())
    total = (await db.execute(count_stmt)).scalar_one()
    return items, total
```

- [ ] **Step 4: Run flow tests to verify pass**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_flow.py -q`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/billing_service.py backend/tests/test_billing_flow.py
git commit -m "feat: billing service lifecycle + payments + void"
```

---

## Task 12: Billing service — reports

**Files:**
- Modify: `backend/app/services/billing_service.py`
- Test: `backend/tests/test_billing_reports.py`

- [ ] **Step 1: Write failing report test**

```python
from decimal import Decimal
from datetime import date, timezone

import pytest

from app.models.enums import PaymentMethod, PaymentType, UserRole
from app.services import billing_service
from app.models import Patient
import uuid
from datetime import date as _date


async def _patient(db):
    p = Patient(id=uuid.uuid4(), mrn=f"MRN-R-{uuid.uuid4().hex[:6]}", full_name="RPat", date_of_birth=_date(1990, 1, 1))
    db.add(p)
    await db.flush()
    return p


@pytest.mark.asyncio
async def test_daily_report_nets_by_method(db_session, make_user):
    cashier = await make_user(UserRole.cashier)
    patient = await _patient(db_session)
    inv = await billing_service.create_invoice(db_session, actor=cashier, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
    await billing_service.add_line_item(db_session, actor=cashier, invoice=inv, service_id=None, description="X", unit_price=Decimal("500.00"), quantity=1)
    await billing_service.issue_invoice(db_session, actor=cashier, invoice=inv)
    await billing_service.record_payment(db_session, actor=cashier, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("400.00"), payment_type=PaymentType.payment, reference=None, notes=None)
    await billing_service.record_payment(db_session, actor=cashier, invoice_id=inv.id, method=PaymentMethod.cash, amount=Decimal("50.00"), payment_type=PaymentType.refund, reference=None, notes=None)

    today = date.today().isoformat()
    report = await billing_service.daily_totals(db_session, day=today, cashier_id=cashier.id)
    cash = next(t for t in report["totals"] if t["method"] == PaymentMethod.cash)
    assert cash["payments"] == Decimal("400.00")
    assert cash["refunds"] == Decimal("50.00")
    assert cash["net"] == Decimal("350.00")
    assert report["net_total"] == Decimal("350.00")


@pytest.mark.asyncio
async def test_outstanding_lists_unpaid(db_session, make_user):
    cashier = await make_user(UserRole.cashier)
    patient = await _patient(db_session)
    inv = await billing_service.create_invoice(db_session, actor=cashier, patient_id=patient.id, appointment_id=None, medical_record_id=None, notes=None, discount_total=Decimal("0"), tax_total=Decimal("0"))
    await billing_service.add_line_item(db_session, actor=cashier, invoice=inv, service_id=None, description="X", unit_price=Decimal("200.00"), quantity=1)
    await billing_service.issue_invoice(db_session, actor=cashier, invoice=inv)
    rows = await billing_service.outstanding(db_session)
    assert any(r["invoice_id"] == inv.id and r["balance_due"] == Decimal("200.00") for r in rows)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_reports.py -q`
Expected: FAIL (report functions missing).

- [ ] **Step 3: Append report functions to `billing_service.py`**

```python
from datetime import date as _date_type


def _day_bounds(day: str):
    d = _date_type.fromisoformat(day)
    start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    end = datetime(d.year, d.month, d.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    return start, end


async def _method_totals(db, *, start, end, cashier_id=None):
    stmt = select(Payment.method, Payment.payment_type, func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.received_at >= start, Payment.received_at <= end
    )
    if cashier_id is not None:
        stmt = stmt.where(Payment.received_by == cashier_id)
    stmt = stmt.group_by(Payment.method, Payment.payment_type)
    rows = (await db.execute(stmt)).all()
    by_method: dict[PaymentMethod, dict] = {}
    for method, ptype, amount in rows:
        entry = by_method.setdefault(method, {"payments": Decimal("0"), "refunds": Decimal("0")})
        if ptype == PaymentType.payment:
            entry["payments"] += Decimal(amount)
        else:
            entry["refunds"] += Decimal(amount)
    totals = []
    net_total = Decimal("0")
    for method, entry in by_method.items():
        net = (entry["payments"] - entry["refunds"]).quantize(Decimal("0.01"))
        net_total += net
        totals.append({"method": method, "payments": entry["payments"], "refunds": entry["refunds"], "net": net})
    return totals, net_total.quantize(Decimal("0.01"))


async def daily_totals(db, *, day, cashier_id=None):
    start, end = _day_bounds(day)
    totals, net_total = await _method_totals(db, start=start, end=end, cashier_id=cashier_id)
    return {"date": day, "totals": totals, "net_total": net_total}


async def reconciliation(db, *, day, cashier_id):
    start, end = _day_bounds(day)
    totals, net_total = await _method_totals(db, start=start, end=end, cashier_id=cashier_id)
    return {"date": day, "cashier_id": cashier_id, "totals": totals, "net_total": net_total}


async def outstanding(db):
    stmt = (
        select(Invoice, Patient.full_name)
        .join(Patient, Patient.id == Invoice.patient_id)
        .where(Invoice.status.in_([InvoiceStatus.issued, InvoiceStatus.partially_paid]), Invoice.balance_due > 0)
        .order_by(Invoice.created_at.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "invoice_id": inv.id,
            "invoice_number": inv.invoice_number,
            "patient_id": inv.patient_id,
            "patient_name": name,
            "balance_due": inv.balance_due,
            "status": inv.status,
        }
        for inv, name in rows
    ]


async def revenue_by_service(db, *, start, end):
    stmt = (
        select(
            InvoiceLineItem.service_id,
            func.min(InvoiceLineItem.description),
            func.coalesce(func.sum(InvoiceLineItem.line_total), 0),
        )
        .join(Invoice, Invoice.id == InvoiceLineItem.invoice_id)
        .where(Invoice.status != InvoiceStatus.void, Invoice.issued_at >= start, Invoice.issued_at <= end)
        .group_by(InvoiceLineItem.service_id)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"service_id": service_id, "description": desc, "total_revenue": Decimal(total)}
        for service_id, desc, total in rows
    ]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_reports.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/billing_service.py backend/tests/test_billing_reports.py
git commit -m "feat: billing reports (daily, reconciliation, outstanding, revenue)"
```

---

## Task 13: Router + registration + API authz tests

**Files:**
- Create: `backend/app/routers/billing.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_billing_authz_api.py`

- [ ] **Step 1: Write the router**

```python
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Invoice, Payment, ServiceCatalog, User
from app.models.enums import InvoiceStatus, UserRole
from app.schemas.billing import (
    DailyReport, InvoiceCreate, InvoiceDetail, InvoiceListResponse, InvoiceRead,
    LineItemCreate, LineItemRead, OutstandingItem, PatientLookupItem, PaymentCreate,
    PaymentRead, ReconciliationReport, RevenueByServiceItem, ServiceCatalogCreate,
    ServiceCatalogRead, ServiceCatalogUpdate, VoidRequest,
)
from app.services import authorization_service as authz
from app.services import billing_calc, billing_service
from app.utils.deps import get_current_user, get_db, require_role

router = APIRouter(prefix="/billing", tags=["Billing"])

BillingUser = Annotated[User, Depends(require_role(UserRole.admin, UserRole.cashier))]
AdminUser = Annotated[User, Depends(require_role(UserRole.admin))]
DB = Annotated[AsyncSession, Depends(get_db)]


async def _get_invoice_or_404(db: AsyncSession, invoice_id: UUID) -> Invoice:
    inv = await db.get(Invoice, invoice_id)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return inv


async def _get_service_or_404(db: AsyncSession, service_id: UUID) -> ServiceCatalog:
    svc = await db.get(ServiceCatalog, service_id)
    if svc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
    return svc


def _bad_request(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---- Service catalog ----
@router.get("/service-catalog", response_model=list[ServiceCatalogRead])
async def list_catalog(db: DB, current: BillingUser, active_only: bool = Query(False)):
    return await billing_service.list_services(db, active_only=active_only)


@router.post("/service-catalog", response_model=ServiceCatalogRead, status_code=status.HTTP_201_CREATED)
async def create_catalog(body: ServiceCatalogCreate, db: DB, current: AdminUser):
    svc = await billing_service.create_service(
        db, actor=current, code=body.code, name=body.name, description=body.description, default_price=body.default_price
    )
    await db.commit()
    return svc


@router.patch("/service-catalog/{service_id}", response_model=ServiceCatalogRead)
async def update_catalog(service_id: UUID, body: ServiceCatalogUpdate, db: DB, current: AdminUser):
    svc = await _get_service_or_404(db, service_id)
    svc = await billing_service.update_service(
        db, actor=current, service=svc, name=body.name, description=body.description,
        default_price=body.default_price, is_active=body.is_active,
    )
    await db.commit()
    return svc


# ---- Patient lookup ----
@router.get("/patients/lookup", response_model=list[PatientLookupItem])
async def patient_lookup(db: DB, current: BillingUser, q: str = Query(min_length=1)):
    return await billing_service.lookup_patients(db, q=q)


# ---- Invoices ----
@router.post("/invoices", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
async def create_invoice(body: InvoiceCreate, db: DB, current: BillingUser):
    inv = await billing_service.create_invoice(
        db, actor=current, patient_id=body.patient_id, appointment_id=body.appointment_id,
        medical_record_id=body.medical_record_id, notes=body.notes,
        discount_total=body.discount_total, tax_total=body.tax_total,
    )
    await db.commit()
    return inv


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    db: DB, current: BillingUser,
    patient_id: UUID | None = Query(None), status_filter: InvoiceStatus | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
):
    items, total = await billing_service.list_invoices(
        db, patient_id=patient_id, status_filter=status_filter, skip=skip, limit=limit
    )
    return InvoiceListResponse(items=items, total=total)


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetail)
async def get_invoice(invoice_id: UUID, db: DB, current: BillingUser):
    inv = await billing_service.get_invoice_detail(db, invoice_id)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return inv


@router.post("/invoices/{invoice_id}/line-items", response_model=LineItemRead, status_code=status.HTTP_201_CREATED)
async def add_line_item(invoice_id: UUID, body: LineItemCreate, db: DB, current: BillingUser):
    inv = await _get_invoice_or_404(db, invoice_id)
    try:
        line = await billing_service.add_line_item(
            db, actor=current, invoice=inv, service_id=body.service_id,
            description=body.description, unit_price=body.unit_price, quantity=body.quantity,
        )
    except ValueError as exc:
        raise _bad_request(exc)
    await db.commit()
    return line


@router.delete("/invoices/{invoice_id}/line-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_line_item(invoice_id: UUID, item_id: UUID, db: DB, current: BillingUser):
    inv = await _get_invoice_or_404(db, invoice_id)
    try:
        await billing_service.remove_line_item(db, actor=current, invoice=inv, item_id=item_id)
    except ValueError as exc:
        raise _bad_request(exc)
    await db.commit()


@router.post("/invoices/{invoice_id}/issue", response_model=InvoiceRead)
async def issue_invoice(invoice_id: UUID, db: DB, current: BillingUser):
    inv = await _get_invoice_or_404(db, invoice_id)
    try:
        inv = await billing_service.issue_invoice(db, actor=current, invoice=inv)
    except ValueError as exc:
        raise _bad_request(exc)
    await db.commit()
    return inv


@router.post("/invoices/{invoice_id}/payments", response_model=PaymentRead, status_code=status.HTTP_201_CREATED)
async def record_payment(invoice_id: UUID, body: PaymentCreate, db: DB, current: BillingUser):
    try:
        payment = await billing_service.record_payment(
            db, actor=current, invoice_id=invoice_id, method=body.method, amount=body.amount,
            payment_type=body.payment_type, reference=body.reference, notes=body.notes,
        )
    except billing_calc.PaymentValidationError as exc:
        raise _bad_request(exc)
    except ValueError as exc:
        raise _bad_request(exc)
    await db.commit()
    return payment


@router.get("/invoices/{invoice_id}/payments", response_model=list[PaymentRead])
async def list_payments(invoice_id: UUID, db: DB, current: BillingUser):
    inv = await billing_service.get_invoice_detail(db, invoice_id)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return inv.payments


@router.get("/payments/{payment_id}/receipt", response_model=PaymentRead)
async def get_receipt(payment_id: UUID, db: DB, current: BillingUser):
    payment = await db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")
    return payment


@router.post("/invoices/{invoice_id}/void", response_model=InvoiceRead)
async def void_invoice(invoice_id: UUID, body: VoidRequest, db: DB, current: AdminUser):
    inv = await _get_invoice_or_404(db, invoice_id)
    try:
        inv = await billing_service.void_invoice(db, actor=current, invoice=inv, reason=body.reason)
    except ValueError as exc:
        raise _bad_request(exc)
    await db.commit()
    return inv


@router.get("/patients/{patient_id}/invoices", response_model=InvoiceListResponse)
async def patient_invoices(patient_id: UUID, db: DB, current: BillingUser, skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)):
    items, total = await billing_service.list_invoices(db, patient_id=patient_id, skip=skip, limit=limit)
    return InvoiceListResponse(items=items, total=total)


# ---- Reports ----
@router.get("/reports/daily", response_model=DailyReport)
async def report_daily(db: DB, current: BillingUser, day: str = Query(alias="date", default_factory=lambda: date.today().isoformat())):
    cashier_id = None if authz.can_view_all_reconciliation(current) else current.id
    return await billing_service.daily_totals(db, day=day, cashier_id=cashier_id)


@router.get("/reports/reconciliation", response_model=ReconciliationReport)
async def report_reconciliation(db: DB, current: BillingUser, day: str = Query(alias="date", default_factory=lambda: date.today().isoformat()), cashier_id: UUID | None = Query(None)):
    if authz.can_view_all_reconciliation(current):
        target = cashier_id or current.id
    else:
        target = current.id
    return await billing_service.reconciliation(db, day=day, cashier_id=target)


@router.get("/reports/outstanding", response_model=list[OutstandingItem])
async def report_outstanding(db: DB, current: AdminUser):
    return await billing_service.outstanding(db)


@router.get("/reports/revenue-by-service", response_model=list[RevenueByServiceItem])
async def report_revenue(db: DB, current: AdminUser, from_: str = Query(alias="from"), to: str = Query(...)):
    from datetime import datetime, timezone
    start = datetime.fromisoformat(from_).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(to).replace(tzinfo=timezone.utc)
    return await billing_service.revenue_by_service(db, start=start, end=end)
```

- [ ] **Step 2: Register the router in `app/main.py`**

After line `app.include_router(dashboard.router, prefix="/api")` (main.py:70), add:

```python
app.include_router(billing.router, prefix="/api")
```

And add `billing` to the routers import at the top of `main.py` (find the line importing `dashboard, patients, ...` from `app.routers` and add `billing`).

- [ ] **Step 3: Write API authorization tests**

```python
import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.main import app
from app.models import Patient
from app.models.enums import UserRole
from app.utils.deps import get_current_user


async def _as_role(make_user, role):
    user = await make_user(role)
    app.state.test_current_user = user
    return user


@pytest.mark.asyncio
async def test_doctor_cannot_access_billing(client, make_user):
    await _as_role(make_user, UserRole.doctor)
    resp = await client.get("/api/billing/service-catalog")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cashier_can_list_catalog(client, make_user):
    await _as_role(make_user, UserRole.cashier)
    resp = await client.get("/api/billing/service-catalog")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_cashier_cannot_create_catalog_or_void(client, make_user, db_session):
    await _as_role(make_user, UserRole.cashier)
    resp = await client.post("/api/billing/service-catalog", json={"code": "X", "name": "X", "default_price": "10.00"})
    assert resp.status_code == 403
    resp2 = await client.post(f"/api/billing/invoices/{uuid.uuid4()}/void", json={"reason": "nope"})
    assert resp2.status_code == 403


@pytest.mark.asyncio
async def test_full_flow_over_http(client, make_user, db_session):
    await _as_role(make_user, UserRole.cashier)
    patient = Patient(id=uuid.uuid4(), mrn=f"MRN-H-{uuid.uuid4().hex[:6]}", full_name="HTTP Pat", date_of_birth=date(1990, 1, 1))
    db_session.add(patient)
    await db_session.flush()

    inv = (await client.post("/api/billing/invoices", json={"patient_id": str(patient.id)})).json()
    await client.post(f"/api/billing/invoices/{inv['id']}/line-items", json={"description": "Consult", "unit_price": "300.00", "quantity": 1})
    issued = (await client.post(f"/api/billing/invoices/{inv['id']}/issue")).json()
    assert issued["status"] == "issued"
    pay = await client.post(f"/api/billing/invoices/{inv['id']}/payments", json={"method": "cash", "amount": "300.00"})
    assert pay.status_code == 201
    detail = (await client.get(f"/api/billing/invoices/{inv['id']}")).json()
    assert detail["status"] == "paid"
    assert detail["balance_due"] == "0.00"
```

Note: because the test session rolls back and `client` overrides `get_db` with the same `db_session`, router `await db.commit()` calls commit to the nested transaction; the outer rollback still cleans up. If commits inside the app close the nested transaction prematurely, switch the router-commit tests to assert via the API responses only (as above) rather than re-querying `db_session`.

- [ ] **Step 4: Run the API tests**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_billing_authz_api.py -q`
Expected: PASS. If commit/rollback interaction fails, wrap `get_db` override to use a `SAVEPOINT` (nested) session via `db_session.begin_nested()` and restart savepoints on commit — a standard pattern; apply and re-run.

- [ ] **Step 5: Run the whole suite**

Run: `cd backend && ./.venv/bin/python -m pytest -q`
Expected: all tests pass (original 16 + new billing tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/billing.py backend/app/main.py backend/tests/test_billing_authz_api.py
git commit -m "feat: billing router + API authorization tests"
```

---

## Task 14: Seed utilities

**Files:**
- Create: `backend/app/utils/create_cashier.py`, `backend/app/utils/seed_service_catalog.py`

- [ ] **Step 1: Read `app/utils/create_admin.py`** to copy its session/argument style.

Run: `cd backend && sed -n '1,60p' app/utils/create_admin.py`

- [ ] **Step 2: Write `create_cashier.py`** mirroring `create_admin.py`, but constructing the user with `role=UserRole.cashier`. Reuse the same `UserCreate`/service path `create_admin.py` uses; only the role differs. (Copy the file, rename the CLI description, and set the role to `cashier`.)

- [ ] **Step 3: Write `seed_service_catalog.py`** — an async script that inserts starter services if absent:

```python
from __future__ import annotations

import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import ServiceCatalog

STARTERS = [
    ("CONSULT-OPD", "OPD Consultation", Decimal("500.00")),
    ("LAB-BASIC", "Basic Lab Panel", Decimal("1500.00")),
    ("PROC-MINOR", "Minor Procedure", Decimal("3000.00")),
]


async def _run() -> None:
    async with AsyncSessionLocal() as db:
        for code, name, price in STARTERS:
            exists = (await db.execute(select(ServiceCatalog.id).where(ServiceCatalog.code == code))).scalar_one_or_none()
            if exists is None:
                db.add(ServiceCatalog(code=code, name=name, default_price=price))
        await db.commit()
    print("Seeded service catalog.")


if __name__ == "__main__":
    asyncio.run(_run())
```

- [ ] **Step 4: Run the seed against the dev DB**

Run: `cd backend && ./.venv/bin/python -m app.utils.seed_service_catalog`
Expected: `Seeded service catalog.`

- [ ] **Step 5: Create a cashier and smoke-test login via the running app** (if the dev server from earlier is up)

Run: `cd backend && ./.venv/bin/python -m app.utils.create_cashier --email cashier@nech.com --password 'Cash12345!'`
Expected: prints created cashier id.

- [ ] **Step 6: Commit**

```bash
git add backend/app/utils/create_cashier.py backend/app/utils/seed_service_catalog.py
git commit -m "feat: cashier + service-catalog seed utilities"
```

---

## Self-review results

**Spec coverage (spec §):**
- §4 Phase 0 audit + authorship → Tasks 5 (AuditLog), 10 (audit_service). Soft-delete mixin is deferred to workstream B (billing uses void, not soft-delete) — noted in spec §4.2; **no billing task needs it**, so no gap.
- §5 data model → Tasks 2, 5, 6, 7.
- §6 payment math/state machine/concurrency → Tasks 4 (pure math), 11 (row lock, status, void guards).
- §7 roles/authz → Tasks 2, 8, 13 (endpoint gates).
- §8 API (all ~18 endpoints) → Task 13 (every endpoint present: catalog×3, lookup, invoices×3, line-items×2, issue, payments×2, receipt, void, patient-invoices, reports×4).
- §10 migrations → Tasks 3, 6, 7. §11 tests → Tasks 4, 8, 10, 11, 12, 13. Seeds → Task 14.

**Placeholder scan:** Task 14 Step 2 says "copy `create_admin.py`… set role to cashier" rather than reproducing code — acceptable because it explicitly instructs reading the source file in Step 1 and states the single change; the file is environment-specific (its exact `UserCreate` call wasn't read in this plan). All logic-bearing steps include full code.

**Type/name consistency:** `record_payment`, `create_invoice`, `add_line_item`, `issue_invoice`, `void_invoice`, `get_invoice_detail`, `list_invoices`, `daily_totals`, `reconciliation`, `outstanding`, `revenue_by_service`, `generate_unique_invoice_number`, `generate_unique_receipt_number`, `billing_calc.{compute_line_total,compute_totals,net_paid,derive_status,validate_payment,PaymentValidationError}` — names match across service, tests, and router. `AuditLog.audit_metadata` maps to DB column `metadata` consistently in model (Task 5) and migration (Task 6).

**Known risk flagged inline:** the commit/rollback interaction in Task 13 Step 3–4 (router commits vs test rollback) — mitigation (savepoint restart) is spelled out in Step 4.

---

## Execution handoff

This backend plan is complete. The frontend (spec §9 — cashier dashboard, invoice pages, payment/receipt UI, reports, rbac/nav wiring) is a **separate companion plan** I can write next.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.
