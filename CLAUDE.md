# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**National Eye Care Hospital (HMS)** — a monorepo hospital management system.

- **`backend/`** — FastAPI (async SQLAlchemy 2 + Alembic), PostgreSQL, Redis, Celery worker for async transcription. JWT auth via cookies. Python 3.12+ (local venv is 3.13).
- **`frontend/`** — Next.js 14 App Router + TypeScript, Tailwind + CSS Modules, TanStack React Query, Zustand auth store, react-hook-form + zod, lucide-react icons.
- **`docs/superpowers/`** — design specs (`specs/`) and implementation plans (`plans/`) for the major features. Read these before touching billing, PHI/soft-delete, or the transcriber — they capture the "why".

## Environment gotchas (read first)

- **The project directory name ends with a trailing space** (`hospital mangemnet `). Always quote paths in shell commands (`cd "/Users/.../hospital mangemnet /backend"`). This also occasionally trips the Edit/Write "suspicious Windows path" guard — if an edit is blocked, write the file via a shell heredoc instead.
- **Do NOT run `npm run build` while `next dev` is running** — the production build overwrites `.next` out from under the dev server, causing 404s on JS chunks (blank/"Loading…" screens). If you must build, restart dev afterward: `pkill -f "next dev"; rm -rf frontend/.next; (cd frontend && npm run dev)`.
- Local Docker maps Postgres to host **5433** and Redis to **6380** (see `backend/.env`), even though `docker-compose.yml` defaults to 5432/6379 (override via root `.env` `POSTGRES_PORT`/`REDIS_PORT`).

## Commands

### Run the stack locally
```bash
# 1. Postgres + Redis
cp .env.example .env && docker compose up -d          # from repo root

# 2. Backend (from backend/)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                   # then set DATABASE_URL/REDIS_URL to the mapped ports
alembic upgrade head                                   # migrations; head is 0007
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Celery worker (async transcription; separate shell):
celery -A app.celery_app worker --loglevel=info

# 3. Frontend (from frontend/)
npm install
cp .env.local.example .env.local
npm run dev                                            # http://localhost:3000
```

The frontend calls the API **same-origin at `/api`** (Next rewrites proxy to `NEXT_PUBLIC_API_URL`) so auth cookies apply to the app host.

### Create users / seed
```bash
# from backend/, venv active. Passwords must be >=12 chars incl. a letter and a digit.
# Emails: the validator rejects reserved TLDs like .local (use .com).
python -m app.utils.create_admin   --email admin@example.com  --password 'ChangeMe12345'
python -m app.utils.create_cashier --email cashier@example.com --password 'ChangeMe12345'
python -m app.utils.seed_service_catalog
```

### Tests / checks
```bash
# Backend (from backend/) — requires the DB up + migrated (integration tests use it)
./.venv/bin/python -m pytest -q
./.venv/bin/python -m pytest tests/test_billing_flow.py::test_full_invoice_payment_flow -v   # single test

# Frontend (from frontend/)
npm run typecheck        # tsc --noEmit
npm run lint             # next lint
npm run test:smoke       # node --test on tests/**/*.test.ts (rbac/policy/pure-logic; NOT component tests)
npm run build            # production build (see the dev-server gotcha above)
```
There is no separate backend lint config; correctness is enforced by the test suite. Reports/reconciliation tests are timezone-sensitive — run with `TZ=UTC` if a bounds test is flaky.

## Backend architecture

**Layering:** `routers/` (HTTP + authz gating, own `_get_*_or_404` helpers) → `services/` (business logic) → `models/` (ORM). Rule: **services `flush`/`refresh` but do NOT commit; the router commits.** Follow this or transactions won't behave.

- **Auth (`utils/deps.py`, `services/auth_service.py`, `routers/auth.py`):** `get_current_user` reads the JWT from cookie or `Authorization: Bearer`. `require_role(*roles)` gates endpoints and **admin passes every role check** (superuser). Refresh-token rotation with a Redis-backed denylist (SHA-256 fingerprints). Login is constant-time (dummy-hash for unknown users); password policy min 12 + letter + digit lives on the Pydantic schemas in `schemas/user.py`.
- **Authorization (`services/authorization_service.py`):** centralizes all role/ownership predicates (`can_manage_billing`, `can_void_invoice`, `ensure_can_view_patient`, doctor-scoped record/appointment access, etc.). Put access logic here, not inline in routers.
- **Audit + soft-delete (PHI safety):** `services/audit_service.record(...)` appends to the append-only `audit_logs` table (flush-only; committed atomically with the mutation) — call it on create/update/delete of clinical + financial + user entities. Clinical/financial entities use a `SoftDeleteMixin` (`deleted_at`/`deleted_by`); **deletes are soft (cascade + audit), never hard.** Every read must exclude soft-deleted rows (`models/… .deleted_at.is_(None)` / `services/soft_delete.py`). List endpoints stay bare arrays but enforce `skip`/`limit` caps — do not change list response shapes.
- **Billing:** money is `Numeric(12,2)` / `Decimal` and serializes to JSON **strings** (Pydantic v2) — the frontend treats money as `string`. `services/billing_calc.py` is pure, unit-tested math; `record_payment` row-locks the invoice (`SELECT … FOR UPDATE`). Daily/reconciliation reports bucket by **Asia/Karachi** day.
- **Transcriber:** `routers/transcribe.py` / `transcriptions.py` + `services/transcription_service.py`. Provider selection at runtime: Gemini (primary, if `GOOGLE_API_KEY`) else Whisper + Claude (`claude-sonnet-4-6`) cleanup. Prompts are bilingual (Urdu + English, preserved, not translated away); `WHISPER_LANGUAGE` must stay unset (auto). Long clips go async via Celery (`tasks/transcribe_task.py`). A transcription must be **approved** (review/edit/approve workflow) before it can be linked to a medical record.
- **Config (`config.py`):** `APP_ENV`/`DEBUG`/`SQL_ECHO` with a `model_validator` that hard-fails in staging/production if `SECRET_KEY` is default or `DEBUG`/`SQL_ECHO` are on. SQL echo is gated on `SQL_ECHO` (never log PHI). `render.yaml` sets `APP_ENV=production`.
- **Migrations (`alembic/versions/`):** linear `0001…0007`. Enum types are created with `create_type=False` then `.create(bind, checkfirst=True)`; adding an enum VALUE (`ALTER TYPE … ADD VALUE`) must run **non-transactionally** in its own migration (see `0003`, `0007`). New models must be exported from `models/__init__.py` and the router registered in `main.py`.
- **Tests (`tests/conftest.py`):** async harness using a **NullPool** engine, a rollback-per-test `db_session`, and an httpx `ASGITransport` `client` whose `get_current_user` is overridden via `app.state.test_current_user`. Reuse these fixtures for new DB/endpoint tests.

## Frontend architecture

- **Shell:** `app/dashboard/layout.tsx` → `DashboardChrome` → `MockupDashboardShell` (a single **floating collapsible sidebar**; there is no top nav). Nav items (with lucide `icon` components) come from `lib/navigation.ts`; the sidebar renders those icons, a shared animated active indicator, collapse/expand (⌘B, persisted to `localStorage`, logo acts as the expand control when collapsed), and a mobile drawer.
- **RBAC (client, advisory — real enforcement is server-side):** `lib/rbac.ts` holds route rules + `DEFAULT_ROLE_HOME_PATHS` + `hasRequiredRole` (admin always allowed); `middleware.ts` decodes the JWT cookie to gate `/dashboard/*`; `components/layout/RoleGuard.tsx` guards admin-only pages. `UserRole` is a `Record`-keyed type — adding a role means updating `types/index.ts`, `lib/rbac.ts` (both `Record<UserRole,…>` maps), `lib/roles.ts`, and `lib/navigation.ts`.
- **Auth store (`store/authStore.ts`):** Zustand, persisted to `localStorage`. `lib/api.ts` is the axios client (same-origin `/api`, attaches bearer, and on 401 auto-calls `/auth/refresh` once then retries). Errors are normalized through `lib/api-errors.ts` `getApiErrorMessage` — use it everywhere instead of hand-rolling `e.message`.
- **Data fetching:** canonical pattern is React Query hooks in `hooks/queries/` (e.g. `useInvoiceDetail`, `usePatientDirectoryQuery`). A few pages still use legacy `useState`+`api` hooks (`hooks/useAppointments.ts`, `usePatients.ts`) — prefer the `queries/` pattern for new work.
- **Money:** always a `string` from the API; format via `lib/money.ts` `formatCurrency` / `todayInClinicTz` (Asia/Karachi). Never do float math on money for display.
- **Theming:** the dashboard uses per-directory CSS Modules (`app/dashboard/theme-*.module.css`) with tokens on `.page` (`--bg/--surface/--card/--accent-teal/…`, all pure white backgrounds + motion tokens `--ease-standard`/`--dur-*`). Shared shadcn-style `components/ui/*` read HSL tokens from `app/globals.css` (`--background`, `--card`, `--primary` = teal, `--secondary`/`--muted` retinted faint-teal). Accent is teal `#6bbfcc`; destructive/CTA is `--accent-red` `#f05c3a`.

## Deployment (per README)

- **DB:** managed Postgres; set `DATABASE_URL` as an async URL (`postgresql+asyncpg://…`).
- **API + worker:** Render Blueprint from `backend/render.yaml` (Dockerfile at `backend/Dockerfile`, context `backend`); run `alembic upgrade head` once; set `CORS_ORIGINS`, `COOKIE_SECURE=true`, secrets.
- **Frontend:** Vercel, project root `frontend`; set `NEXT_PUBLIC_API_URL` to the public API URL and ensure it's in the API's `CORS_ORIGINS`.

## Known deferred work (infrastructure/vendor — not doable locally)

Documented in the specs: encryption-at-rest (KMS/S3) and MFA; vendor BAAs and migrating Gemini off the AI-Studio key endpoint to Vertex AI; speaker diarization; real backends for the room/pharmacy/inventory pages (currently honest "coming soon"); an admin cashier-picker on the reconciliation report (needs a list-users endpoint).
