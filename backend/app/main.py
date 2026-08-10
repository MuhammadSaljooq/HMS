from __future__ import annotations

import logging
import redis.asyncio as redis
import time
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.config import get_settings
from app.database import engine
from app.rate_limit import limiter
from app.routers import appointments, auth, billing, dashboard, patients, records, transcribe, transcriptions, users

settings = get_settings()
logger = logging.getLogger("hms.api")

app = FastAPI(
    title=settings.APP_NAME,
    description="National Eye Care Hospital REST API",
    version="0.1.0",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_observability_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid4())
    request.state.request_id = request_id
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["x-request-id"] = request_id
    response.headers["x-process-time-ms"] = f"{elapsed_ms:.2f}"
    logger.info(
        "request completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "elapsed_ms": round(elapsed_ms, 2),
        },
    )
    return response


app.include_router(auth.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(appointments.router, prefix="/api")
app.include_router(records.router, prefix="/api")
app.include_router(transcribe.router, prefix="/api")
app.include_router(transcriptions.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(billing.router, prefix="/api")


async def _database_ok() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def _redis_ok() -> bool:
    redis_url = settings.REDIS_URL or settings.CELERY_BROKER_URL
    if not redis_url:
        return False
    client = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
    try:
        await client.ping()
        return True
    except Exception:
        return False
    finally:
        await client.aclose()


@app.get("/health", tags=["Health"])
async def health() -> dict[str, object]:
    db_ok, redis_ok = await _database_ok(), await _redis_ok()
    checks = {"database": "ok" if db_ok else "error", "redis": "ok" if redis_ok else "error"}
    status = "ok" if db_ok and redis_ok else "degraded"
    return {"status": status, "checks": checks}


@app.get("/health/ready", tags=["Health"])
async def ready() -> JSONResponse:
    db_ok, redis_ok = await _database_ok(), await _redis_ok()
    checks = {"database": "ok" if db_ok else "error", "redis": "ok" if redis_ok else "error"}
    ok = db_ok and redis_ok
    payload = {"status": "ready" if ok else "not_ready", "checks": checks}
    return JSONResponse(content=payload, status_code=200 if ok else 503)
