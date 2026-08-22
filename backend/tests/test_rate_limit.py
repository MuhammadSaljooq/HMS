from __future__ import annotations

import pytest

from app.rate_limit import limiter


@pytest.mark.asyncio
async def test_login_rate_limit_triggers_when_enabled(client) -> None:
    """When the limiter is enabled, repeated logins eventually return 429.

    Rate limiting is disabled by default (dev/test) so the rest of the suite is
    unaffected; here we flip it on for a single test and reset it afterwards.
    """
    limiter.enabled = True
    # slowapi keeps per-key state in its storage; clear so this test is deterministic.
    try:
        limiter.reset()
    except Exception:
        pass
    try:
        statuses = []
        for _ in range(8):
            resp = await client.post(
                "/api/auth/login",
                json={"email": "nobody@test.example.com", "password": "whatever12345"},
            )
            statuses.append(resp.status_code)
        # The configured limit is 5/minute, so at least one later attempt is 429.
        assert 429 in statuses, statuses
    finally:
        limiter.enabled = False
        try:
            limiter.reset()
        except Exception:
            pass
