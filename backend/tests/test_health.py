from fastapi.testclient import TestClient

import app.main as main_module

client = TestClient(main_module.app)


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


def test_ready_endpoint_returns_503_when_dependencies_fail(monkeypatch) -> None:
    async def db_ok() -> bool:
        return True

    async def redis_fail() -> bool:
        return False

    monkeypatch.setattr(main_module, "_database_ok", db_ok)
    monkeypatch.setattr(main_module, "_redis_ok", redis_fail)

    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"


def test_health_endpoint_reports_degraded_without_failing_liveness(monkeypatch) -> None:
    async def db_fail() -> bool:
        return False

    async def redis_ok() -> bool:
        return True

    monkeypatch.setattr(main_module, "_database_ok", db_fail)
    monkeypatch.setattr(main_module, "_redis_ok", redis_ok)

    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
