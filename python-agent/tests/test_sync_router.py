"""Tests for app.routers.sync — §P5/E8 sync router.

Pattern mirrors test_shape_router.py / test_ingest_router.py:
  - Throwaway FastAPI app with the router mounted under /api/v1.
  - get_tenant_context overridden via dependency_overrides to inject a fake
    TenantContext without touching JWT/DB plumbing.
  - run_cascade patched with AsyncMock so no real Supabase / LLM calls are made.

401 simulation: one test skips the dependency override entirely so
get_tenant_context executes normally; the missing Authorization header causes
tenant_from_jwt → _extract_bearer_token → HTTPException(401).  We also test
via an explicit override that raises HTTPException(401) for clarity.
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, HTTPException, status
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deps import get_tenant_context
from app.routers.sync import router
from app.security import TenantContext

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EQUIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
LEAD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
OPPORTUNITY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
PIPELINE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"

FAKE_CTX = TenantContext(equipe_id=EQUIPE_ID, actor_user_id=ACTOR_ID, role="admin")

FAKE_CASCADE_RESULT = {
    "status": "executed",
    "decision_id": "ffffffff-ffff-4fff-8fff-ffffffffffff",
    "result": {"skill": "add_note", "note": "Ação aplicada pelo Copilot"},
}

# ---------------------------------------------------------------------------
# App factories
# ---------------------------------------------------------------------------


def _make_app_with_auth() -> FastAPI:
    """Throwaway app with fake tenant injected (happy path)."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_tenant_context] = lambda: FAKE_CTX
    return app


def _make_app_no_auth() -> FastAPI:
    """Throwaway app WITHOUT any dependency override.

    get_tenant_context runs as-is; with no Authorization header, it raises
    HTTPException(401) — this is how we simulate a missing/invalid JWT.
    """
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


def _make_app_override_401() -> FastAPI:
    """Throwaway app whose tenant dependency explicitly raises 401.

    This is an alternative 401 simulation that doesn't rely on JWT internals.
    """

    def _raise_401() -> TenantContext:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Simulated missing auth",
        )

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_tenant_context] = _raise_401
    return app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _post_sync(
    http_client: TestClient,
    *,
    lead_id: str = LEAD_ID,
    opportunity_id: str | None = OPPORTUNITY_ID,
    pipeline_id: str | None = PIPELINE_ID,
) -> object:
    body: dict = {"lead_id": lead_id}
    if opportunity_id is not None:
        body["opportunity_id"] = opportunity_id
    if pipeline_id is not None:
        body["pipeline_id"] = pipeline_id
    return http_client.post("/api/v1/sync", json=body)


# ---------------------------------------------------------------------------
# Happy path — 200 with cascade result
# ---------------------------------------------------------------------------


def test_sync_returns_200_with_cascade_dict() -> None:
    """Valid request + fake ctx → 200 and body equals the mocked cascade dict."""
    with patch(
        "app.routers.sync.run_cascade", new_callable=AsyncMock
    ) as mock_cascade:
        mock_cascade.return_value = FAKE_CASCADE_RESULT
        client = TestClient(_make_app_with_auth())
        resp = _post_sync(client)

    assert resp.status_code == 200
    assert resp.json() == FAKE_CASCADE_RESULT


def test_sync_calls_cascade_with_trigger_sync() -> None:
    """run_cascade must be called with trigger='sync'."""
    with patch(
        "app.routers.sync.run_cascade", new_callable=AsyncMock
    ) as mock_cascade:
        mock_cascade.return_value = FAKE_CASCADE_RESULT
        client = TestClient(_make_app_with_auth())
        _post_sync(client)

    mock_cascade.assert_awaited_once()
    kwargs = mock_cascade.call_args.kwargs
    assert kwargs["trigger"] == "sync"


def test_sync_passes_ctx_equipe_id_to_cascade() -> None:
    """run_cascade must receive the ctx injected by the dependency."""
    with patch(
        "app.routers.sync.run_cascade", new_callable=AsyncMock
    ) as mock_cascade:
        mock_cascade.return_value = FAKE_CASCADE_RESULT
        client = TestClient(_make_app_with_auth())
        _post_sync(client)

    kwargs = mock_cascade.call_args.kwargs
    assert kwargs["ctx"].equipe_id == EQUIPE_ID


def test_sync_passes_all_body_fields_to_cascade() -> None:
    """lead_id, opportunity_id, and pipeline_id from the body reach run_cascade."""
    with patch(
        "app.routers.sync.run_cascade", new_callable=AsyncMock
    ) as mock_cascade:
        mock_cascade.return_value = FAKE_CASCADE_RESULT
        client = TestClient(_make_app_with_auth())
        _post_sync(client, lead_id=LEAD_ID, opportunity_id=OPPORTUNITY_ID, pipeline_id=PIPELINE_ID)

    kwargs = mock_cascade.call_args.kwargs
    assert kwargs["lead_id"] == LEAD_ID
    assert kwargs["opportunity_id"] == OPPORTUNITY_ID
    assert kwargs["pipeline_id"] == PIPELINE_ID


def test_sync_optional_fields_default_to_none() -> None:
    """When opportunity_id and pipeline_id are omitted the cascade gets None for both."""
    with patch(
        "app.routers.sync.run_cascade", new_callable=AsyncMock
    ) as mock_cascade:
        mock_cascade.return_value = FAKE_CASCADE_RESULT
        client = TestClient(_make_app_with_auth())
        resp = client.post("/api/v1/sync", json={"lead_id": LEAD_ID})

    assert resp.status_code == 200
    kwargs = mock_cascade.call_args.kwargs
    assert kwargs["opportunity_id"] is None
    assert kwargs["pipeline_id"] is None


# ---------------------------------------------------------------------------
# Auth failures — 401
# ---------------------------------------------------------------------------


def test_missing_auth_header_returns_401() -> None:
    """No Authorization header → get_tenant_context raises 401.

    We use the no-override app but override ``_get_db`` as a FastAPI dependency
    (returning a fake client) so that the auth path runs cleanly.  With no
    Authorization header, ``_extract_bearer_token`` raises HTTPException(401)
    before any JWT decode or profile lookup is attempted.
    """
    from unittest.mock import MagicMock

    from app.deps import _get_db

    fake_db = MagicMock()
    fake_settings = MagicMock()
    fake_settings.supabase_jwt_secret = "test-secret"

    # Build a fresh no-override app but inject a fake DB dependency so that
    # no real Supabase connection is attempted.
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[_get_db] = lambda: fake_db

    with patch("app.security.get_settings", return_value=fake_settings):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/api/v1/sync", json={"lead_id": LEAD_ID})

    assert resp.status_code == 401


def test_dependency_raising_401_returns_401() -> None:
    """When the dependency override itself raises HTTPException(401) → 401 response."""
    client = TestClient(_make_app_override_401())
    resp = _post_sync(client)
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Body validation
# ---------------------------------------------------------------------------


def test_missing_lead_id_returns_422() -> None:
    """lead_id is required; omitting it returns HTTP 422 before the handler runs."""
    client = TestClient(_make_app_with_auth())
    resp = client.post("/api/v1/sync", json={"opportunity_id": OPPORTUNITY_ID})
    assert resp.status_code == 422
