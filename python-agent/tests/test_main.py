"""E10 — tests for app.main (FastAPI application wiring).

Verifies:
  1. app imports and builds without any network calls.
  2. GET /health returns 200 {"status": "ok"}.
  3. OpenAPI schema exposes all expected route paths.

get_settings is patched via lru_cache clearing + env injection so that
no real .env file is required in CI.  The same pattern used by the other
router tests (MagicMock FAKE_SETTINGS) is used here.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# ---------------------------------------------------------------------------
# Fake settings — mirrors the pattern in test_shape_router / test_ingest_router
# ---------------------------------------------------------------------------

FAKE_SETTINGS = MagicMock(
    cors_origins=["http://localhost:5173"],
    cors_origin_regex=r"https://([a-z0-9-]+\.)*soloventures\.com\.br",
    supabase_url="https://fake.supabase.co",
    supabase_service_role_key="fake-key",
    supabase_jwt_secret="fake-jwt-secret",
    database_url="postgresql://fake/fake",
    openai_api_key="sk-fake",
    agent_internal_token="fake-token",
    agno_schema="agno",
    doorman_model="gpt-4o-mini",
    worker_model="gpt-4o",
    shaper_model="gpt-4o",
    ingest_enabled=False,
)

# ---------------------------------------------------------------------------
# Helper: build the app with settings patched so no .env is required
# ---------------------------------------------------------------------------


def _build_app():
    """Import and return app.main.app with get_settings patched.

    We patch app.config.get_settings before importing main so the module-level
    Settings() call never fires against a missing .env.
    """
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        # Re-import each time so the patch is applied on a fresh import when
        # running the test file in isolation.  If the module is already cached
        # the existing app object is returned — that is fine for our purposes
        # because the CORS and router wiring is fixed at construction time.
        import app.main as main_module  # noqa: PLC0415

        importlib.reload(main_module)
        return main_module.app


# ---------------------------------------------------------------------------
# 1. Import / build without network
# ---------------------------------------------------------------------------


def test_app_builds_without_network() -> None:
    """app.main.app constructs without making any real network calls."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import app.main  # noqa: PLC0415 (local import intentional)

        assert app.main.app is not None, "app.main.app should not be None"


# ---------------------------------------------------------------------------
# 2. GET /health
# ---------------------------------------------------------------------------


def test_health_endpoint_returns_200_ok() -> None:
    """GET /health returns HTTP 200 with body {"status": "ok"}."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        client = TestClient(main_module.app)

    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_api_v1_health_alias_returns_200_ok() -> None:
    """GET /api/v1/health (deploy-guide path) is an alias of /health."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        client = TestClient(main_module.app)

    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_root_returns_friendly_banner() -> None:
    """GET / returns a friendly banner instead of a bare 404."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        client = TestClient(main_module.app)

    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["service"] == "solo-copilot"


def test_cors_allows_any_soloventures_niche() -> None:
    """A new niche subdomain is allowed by the *.soloventures.com.br CORS regex
    without being listed explicitly — so new niches need zero CORS maintenance."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        client = TestClient(main_module.app)

    # A niche NOT in cors_origins, only matched by the regex.
    origin = "https://imob.soloventures.com.br"
    resp = client.options(
        "/api/v1/sync",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == origin


# ---------------------------------------------------------------------------
# 3. OpenAPI route coverage
# ---------------------------------------------------------------------------

EXPECTED_PATHS = [
    "/api/v1/shape/preview",
    "/api/v1/shape/apply",
    "/api/v1/sync",
    "/api/v1/ingest",
    "/api/v1/approvals/{decision_id}/resolve",
]


def test_openapi_exposes_all_required_paths() -> None:
    """app.openapi()['paths'] contains all five required API paths."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        schema = main_module.app.openapi()

    paths = schema.get("paths", {})
    for expected in EXPECTED_PATHS:
        assert expected in paths, (
            f"Expected path '{expected}' not found in OpenAPI schema. "
            f"Available paths: {sorted(paths.keys())}"
        )


def test_openapi_shape_preview_path_present() -> None:
    """/api/v1/shape/preview is individually confirmed in the OpenAPI schema."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        schema = main_module.app.openapi()

    assert "/api/v1/shape/preview" in schema["paths"]


def test_openapi_shape_apply_path_present() -> None:
    """/api/v1/shape/apply is individually confirmed in the OpenAPI schema."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        schema = main_module.app.openapi()

    assert "/api/v1/shape/apply" in schema["paths"]


def test_openapi_sync_path_present() -> None:
    """/api/v1/sync is individually confirmed in the OpenAPI schema."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        schema = main_module.app.openapi()

    assert "/api/v1/sync" in schema["paths"]


def test_openapi_ingest_path_present() -> None:
    """/api/v1/ingest is individually confirmed in the OpenAPI schema."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        schema = main_module.app.openapi()

    assert "/api/v1/ingest" in schema["paths"]


def test_openapi_approvals_resolve_path_present() -> None:
    """/api/v1/approvals/{decision_id}/resolve is individually confirmed."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        schema = main_module.app.openapi()

    assert "/api/v1/approvals/{decision_id}/resolve" in schema["paths"]


# ---------------------------------------------------------------------------
# 4. H2 — private admin ops surface (internal-token gated)
# ---------------------------------------------------------------------------


def test_admin_runs_requires_internal_token() -> None:
    """GET /admin/runs without the internal token → 401 (never tenant/public)."""
    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        client = TestClient(main_module.app, raise_server_exceptions=False)

    resp = client.get("/admin/runs")
    assert resp.status_code == 401


def test_admin_runs_with_token_returns_payload(monkeypatch) -> None:
    """With the correct X-Agent-Token, /admin/runs returns the ops payload."""

    class _FakeQuery:
        def table(self, _):
            return self

        def select(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            class _R:
                data: list = []
                error = None

            return _R()

    with patch("app.config.get_settings", return_value=FAKE_SETTINGS):
        import importlib

        import app.main as main_module

        importlib.reload(main_module)
        monkeypatch.setattr("app.routers.admin.get_service_client", lambda: _FakeQuery())
        client = TestClient(main_module.app)

    resp = client.get("/admin/runs", headers={"X-Agent-Token": "fake-token"})
    assert resp.status_code == 200
    body = resp.json()
    assert "run_events" in body and "ai_decisions" in body
