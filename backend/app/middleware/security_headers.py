"""Security-headers + CSP middleware.

Sets conservative security headers on every response. A strict Content-Security-Policy
is applied to app routes, but the interactive API docs (``/docs``, ``/redoc``) and
``/openapi.json`` get a relaxed CSP that permits the Swagger/ReDoc CDN assets + the
inline styles/scripts they rely on — a strict policy would otherwise blank them out.

HSTS is only emitted when running prod-like AND cookies are already secure, to avoid
pinning HSTS on plain-HTTP local/dev origins.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import get_settings

# Paths that render HTML + load CDN scripts/styles and inline code.
_DOCS_PATHS = frozenset({"/docs", "/redoc", "/openapi.json"})

# Relaxed CSP for the Swagger UI / ReDoc pages only.
_DOCS_CSP = (
    "default-src 'self'; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "worker-src 'self' blob:; "
    "font-src 'self' https://cdn.jsdelivr.net; "
    "frame-ancestors 'none'"
)

_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app) -> None:
        super().__init__(app)
        self._settings = get_settings()

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Permissions-Policy", _PERMISSIONS_POLICY)

        path = request.url.path
        if path in _DOCS_PATHS:
            csp = _DOCS_CSP
        else:
            csp = self._settings.SECURITY_CSP
        response.headers.setdefault("Content-Security-Policy", csp)

        # Only advertise HSTS on prod-like deployments that are already HTTPS-only.
        if (
            self._settings.APP_ENV in {"staging", "production"}
            and self._settings.COOKIE_SECURE
        ):
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )

        return response
