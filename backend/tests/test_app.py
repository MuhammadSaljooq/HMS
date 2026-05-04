from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_openapi_schema_available() -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    body = response.json()
    assert body.get("openapi", "").startswith("3.")
