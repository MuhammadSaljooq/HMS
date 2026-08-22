from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

settings = get_settings()

# Brute-force protection. Gated by RATE_LIMIT_ENABLED (defaults off outside
# production) so the test suite / local dev can hammer auth endpoints freely.
# When disabled, slowapi's `enabled=False` makes every @limiter.limit(...) a no-op.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.RATE_LIMIT_STORAGE_URL or settings.REDIS_URL,
    enabled=settings.RATE_LIMIT_ENABLED,
)
