from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as main_module

client = TestClient(main_module.app)


def test_security_headers_present_on_api_route() -> None:
    resp = client.get("/health")
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["Referrer-Policy"] == "no-referrer"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert "camera=()" in resp.headers["Permissions-Policy"]
    # Strict CSP on non-docs routes.
    assert "default-src 'none'" in resp.headers["Content-Security-Policy"]


def test_docs_reachable_with_relaxed_csp() -> None:
    resp = client.get("/docs")
    assert resp.status_code == 200
    csp = resp.headers["Content-Security-Policy"]
    # Relaxed policy that permits the Swagger CDN + inline for the docs page.
    assert "cdn.jsdelivr.net" in csp
    assert "'unsafe-inline'" in csp


def test_openapi_reachable() -> None:
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    assert "cdn.jsdelivr.net" in resp.headers["Content-Security-Policy"]


def test_no_hsts_in_development() -> None:
    resp = client.get("/health")
    assert "Strict-Transport-Security" not in resp.headers
