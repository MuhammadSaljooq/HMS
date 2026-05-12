from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "degraded"}
    assert "checks" in body
    assert set(body["checks"].keys()) == {"database", "redis"}
    assert "x-request-id" in response.headers
    assert "x-process-time-ms" in response.headers


def test_ready_endpoint_returns_status_payload() -> None:
    response = client.get("/health/ready")
    assert response.status_code in {200, 503}
    body = response.json()
    assert body["status"] in {"ready", "not_ready"}
    assert set(body["checks"].keys()) == {"database", "redis"}
