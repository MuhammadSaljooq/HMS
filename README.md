# Riverside HMS (Hospital Management System)

Monorepo: **FastAPI** backend (`backend/`), **Next.js 14** frontend (`frontend/`), **PostgreSQL**, **Redis**, and **Celery** for async transcription jobs.

## Prerequisites

- **Docker** and Docker Compose v2 (for local Postgres + Redis)
- **Node.js 20+** and npm
- **Python 3.12+** (backend; Docker image uses 3.12)

## Local development

### 1. Start Postgres and Redis

From the repository root:

```bash
cp .env.example .env
docker compose up -d
```

Wait until both services are healthy (`docker compose ps`).

Default Postgres: user `postgres`, password `postgres`, database `hms_db`, port **5432**. Redis on **6379** (override via root `.env`).

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` so `DATABASE_URL` matches your Postgres (see comments in `.env.example`). Then:

```bash
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (middleware redirects to `/login` or `/dashboard`).

## First admin user

With the API configured and the database migrated, from **`backend/`** with the virtualenv active:

```bash
python -m app.utils.create_admin --email you@example.com --password 'your-secure-password'
```

Omit flags to be prompted. If users already exist, add `--force` to create another administrator (or use `POST /api/auth/register` as an existing admin).

Alternative when **no users exist** at all: `POST /api/auth/bootstrap` (see API docs).

## Docker image (API only)

Build from `backend/` (context must include `app/` and `alembic/`):

```bash
docker build -f backend/Dockerfile -t hms-api:latest backend
```

The image installs **ffmpeg** for Whisper-based audio processing and runs Uvicorn on port **8000** (or `PORT` when set, e.g. on Render).

## Deployment overview

### Database (Supabase or other Postgres)

Provision a managed PostgreSQL instance and set `DATABASE_URL` (async URL with `postgresql+asyncpg://...`) on the API and worker.

### Backend + worker (Render)

1. Create a **Redis** instance (Render Key Value, Redis Cloud, or similar) and set `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND`.
2. In the Render dashboard, create a **Blueprint** from `backend/render.yaml`. Paths in that file are relative to the **Git repository root** (`dockerfilePath: backend/Dockerfile`, `dockerContext: backend`). If your workflow only allows `render.yaml` at the repo root, copy the same `services:` block into a root-level `render.yaml`.
3. Set secret/sync env vars in the dashboard (`DATABASE_URL`, API keys, `CORS_ORIGINS` for your Vercel URL, etc.).
4. Run migrations once (e.g. Render shell): `alembic upgrade head`.

### Frontend (Vercel)

1. Connect the Git repo and set the project root to **`frontend`**.
2. Environment variables: `NEXT_PUBLIC_API_URL` = your public API URL (https://…), `NEXT_PUBLIC_APP_NAME`, and cookie name overrides if you changed them on the API.

Ensure `CORS_ORIGINS` on the API includes your Vercel origin and that production cookies use `COOKIE_SECURE=true` when served over HTTPS.

## Project layout

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Local Postgres 16 + Redis 7 |
| `backend/Dockerfile` | Production API image |
| `backend/render.yaml` | Render web + Celery worker blueprint |
| `backend/.env.example` | Backend environment template |
| `frontend/.env.local.example` | Frontend environment template |
