from __future__ import annotations

import hashlib
import time
from threading import Lock

import redis.asyncio as redis

from app.config import get_settings

settings = get_settings()
_PREFIX = "hms:revoked_refresh:"
_local_lock = Lock()
_local_revoked: dict[str, float] = {}
_redis_client: redis.Redis | None = None


def _fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _cleanup_local(now: float) -> None:
    expired = [key for key, expiry in _local_revoked.items() if expiry <= now]
    for key in expired:
        _local_revoked.pop(key, None)


def _get_redis() -> redis.Redis | None:
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    if not settings.REDIS_URL:
        return None
    _redis_client = redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
    return _redis_client


async def revoke_refresh_token(token: str, exp_epoch_seconds: int | None) -> None:
    now = int(time.time())
    if not exp_epoch_seconds or exp_epoch_seconds <= now:
        return
    ttl_seconds = exp_epoch_seconds - now
    key = _fingerprint(token)

    client = _get_redis()
    if client is not None:
        try:
            await client.setex(f"{_PREFIX}{key}", ttl_seconds, "1")
            return
        except Exception:
            # Fall back to process-local denylist when Redis is unavailable.
            pass

    with _local_lock:
        _cleanup_local(float(now))
        _local_revoked[key] = float(exp_epoch_seconds)


async def is_refresh_token_revoked(token: str) -> bool:
    key = _fingerprint(token)
    client = _get_redis()
    if client is not None:
        try:
            return bool(await client.exists(f"{_PREFIX}{key}"))
        except Exception:
            pass

    now = time.time()
    with _local_lock:
        _cleanup_local(now)
        expiry = _local_revoked.get(key)
    return expiry is not None and expiry > now
