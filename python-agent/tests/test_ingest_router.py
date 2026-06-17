"""Tests for app.routers.ingest — §P5/E7 gated ingest router.

Pattern mirrors test_shape_router.py:
  - Throwaway FastAPI app with the router mounted under /api/v1.
  - get_settings patched at app.routers.ingest to avoid needing a real .env.
  - Supabase client chain mocked; run_cascade patched with AsyncMock.
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.ingest import router

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EQUIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
LEAD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PIPELINE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
ROW_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
VALID_TOKEN = "super-secret-internal-token"

# ---------------------------------------------------------------------------
# Fake settings factories
# ---------------------------------------------------------------------------


def _fake_settings(*, ingest_enabled: bool = True, token: str = VALID_TOKEN) -> MagicMock:
    s = MagicMock()
    s.ingest_enabled = ingest_enabled
    s.agent_internal_token = token
    return s


# ---------------------------------------------------------------------------
# Fake Supabase client factories
# ---------------------------------------------------------------------------

QUEUE_ROW = {
    "id": ROW_ID,
    "equipe_id": EQUIPE_ID,
    "lead_id": LEAD_ID,
    "pipeline_id": PIPELINE_ID,
    "conversation_ref": None,
}


def _mock_execute_data(data: list | None) -> MagicMock:
    """Return a mock whose .execute() gives a response with .data = data."""
    resp = MagicMock()
    resp.data = data
    resp.error = None
    chain = MagicMock()
    chain.execute.return_value = resp
    return chain


class FakeClient:
    """Minimal fake Supabase client that records interactions for assertions."""

    def __init__(self, *, queue_rows: list[dict], agent_enabled: bool) -> None:
        self._queue_rows = list(queue_rows)
        self._agent_enabled = agent_enabled
        # Exposed for test assertions
        self.update_calls: list[dict] = []  # each item is the dict passed to update()

    def table(self, table_name: str) -> "FakeTable":
        return FakeTable(self, table_name)


class FakeTable:
    def __init__(self, client: FakeClient, table_name: str) -> None:
        self._client = client
        self._table_name = table_name
        # Tracked filters for copilot_ingest_queue reads
        self._eq_filters: dict[str, object] = {}
        self._filter_processed_at_null: bool = False

    # ── SELECT chain ────────────────────────────────────────────────────────

    def select(self, *_: object) -> "FakeTable":
        return self

    def is_(self, col: str, val: object) -> "FakeTable":
        if self._table_name == "copilot_ingest_queue" and col == "processed_at" and val == "null":
            self._filter_processed_at_null = True
        return self

    def lte(self, *_: object) -> "FakeTable":
        return self

    def eq(self, col: str, val: object) -> "FakeTable":
        if self._table_name == "copilot_ingest_queue":
            self._eq_filters[col] = val
        return self

    def limit(self, *_: object) -> "FakeTable":
        return self

    def execute(self) -> MagicMock:
        resp = MagicMock()
        resp.error = None
        if self._table_name == "copilot_ingest_queue":
            rows = list(self._client._queue_rows)
            # Apply eq filters
            for col, val in self._eq_filters.items():
                rows = [r for r in rows if r.get(col) == val]
            # Apply processed_at IS NULL filter
            if self._filter_processed_at_null:
                rows = [r for r in rows if r.get("processed_at") is None]
            resp.data = rows
        elif self._table_name == "equipes":
            resp.data = [{"is_crm_agent_enabled": self._client._agent_enabled}]
        else:
            resp.data = []
        return resp

    # ── UPDATE chain ────────────────────────────────────────────────────────

    def update(self, payload: dict) -> "FakeUpdateChain":
        self._client.update_calls.append(payload)
        return FakeUpdateChain()


class FakeUpdateChain:
    def eq(self, *_: object) -> "FakeUpdateChain":
        return self

    def execute(self) -> MagicMock:
        resp = MagicMock()
        resp.data = None
        resp.error = None
        return resp


def _make_client(
    *,
    queue_rows: list[dict] | None = None,
    agent_enabled: bool = True,
) -> FakeClient:
    """Build a fake Supabase client that responds to the three table queries."""
    if queue_rows is None:
        queue_rows = []
    return FakeClient(queue_rows=queue_rows, agent_enabled=agent_enabled)


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


# ---------------------------------------------------------------------------
# Helper to POST /api/v1/ingest
# ---------------------------------------------------------------------------


def _post(http_client: TestClient, token: str | None = VALID_TOKEN) -> "Response":  # noqa: F821
    headers = {}
    if token is not None:
        headers["X-Agent-Token"] = token
    return http_client.post("/api/v1/ingest", headers=headers)


# ---------------------------------------------------------------------------
# Test: 503 when ingest_enabled = False
# ---------------------------------------------------------------------------


def test_ingest_disabled_returns_503() -> None:
    """When settings.ingest_enabled is False the endpoint must return 503."""
    fake_settings = _fake_settings(ingest_enabled=False)

    with patch("app.routers.ingest.get_settings", return_value=fake_settings):
        client = TestClient(_make_app())
        resp = _post(client)

    assert resp.status_code == 503


def test_ingest_disabled_returns_503_even_with_valid_token() -> None:
    """503 is returned before token check — feature gate is first."""
    fake_settings = _fake_settings(ingest_enabled=False, token=VALID_TOKEN)

    with patch("app.routers.ingest.get_settings", return_value=fake_settings):
        client = TestClient(_make_app())
        resp = _post(client, token=VALID_TOKEN)

    assert resp.status_code == 503


# ---------------------------------------------------------------------------
# Test: 401 on bad / missing token
# ---------------------------------------------------------------------------


def test_missing_token_returns_401() -> None:
    """No X-Agent-Token header → 401."""
    fake_settings = _fake_settings(ingest_enabled=True, token=VALID_TOKEN)

    with patch("app.routers.ingest.get_settings", return_value=fake_settings):
        client = TestClient(_make_app())
        resp = _post(client, token=None)

    assert resp.status_code == 401


def test_wrong_token_returns_401() -> None:
    """Wrong X-Agent-Token value → 401."""
    fake_settings = _fake_settings(ingest_enabled=True, token=VALID_TOKEN)

    with patch("app.routers.ingest.get_settings", return_value=fake_settings):
        client = TestClient(_make_app())
        resp = _post(client, token="totally-wrong-token")

    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Test: 202 with one enabled-team row → cascade called, row marked processed
# ---------------------------------------------------------------------------


def test_one_enabled_row_calls_cascade_and_returns_202() -> None:
    """Happy path: one queue row whose team is enabled → cascade invoked, 202 returned."""
    fake_settings = _fake_settings()
    mock_client = _make_client(queue_rows=[QUEUE_ROW], agent_enabled=True)

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=mock_client),
        patch("app.routers.ingest.run_cascade", new_callable=AsyncMock) as mock_cascade,
    ):
        mock_cascade.return_value = {"status": "executed"}
        client = TestClient(_make_app())
        resp = _post(client)

    assert resp.status_code == 202
    body = resp.json()
    assert body["processed"] == 1
    assert body["skipped"] == 0


def test_cascade_called_with_trigger_ingest() -> None:
    """run_cascade must be called with trigger='ingest' and the correct IDs."""
    fake_settings = _fake_settings()
    mock_client = _make_client(queue_rows=[QUEUE_ROW], agent_enabled=True)

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=mock_client),
        patch("app.routers.ingest.run_cascade", new_callable=AsyncMock) as mock_cascade,
    ):
        mock_cascade.return_value = {"status": "executed"}
        client = TestClient(_make_app())
        _post(client)

    mock_cascade.assert_awaited_once()
    kwargs = mock_cascade.call_args.kwargs
    assert kwargs["trigger"] == "ingest"
    assert kwargs["lead_id"] == LEAD_ID
    assert kwargs["pipeline_id"] == PIPELINE_ID
    assert kwargs["opportunity_id"] is None


def test_row_marked_processed_after_cascade() -> None:
    """After a successful cascade the queue row must be updated with processed_at."""
    fake_settings = _fake_settings()
    fake_client = _make_client(queue_rows=[QUEUE_ROW], agent_enabled=True)

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=fake_client),
        patch("app.routers.ingest.run_cascade", new_callable=AsyncMock) as mock_cascade,
    ):
        mock_cascade.return_value = {"status": "executed"}
        client = TestClient(_make_app())
        _post(client)

    # update() was called once on copilot_ingest_queue with a processed_at value
    assert len(fake_client.update_calls) == 1
    assert "processed_at" in fake_client.update_calls[0]


# ---------------------------------------------------------------------------
# Test: toggled-off team — cascade NOT called
# ---------------------------------------------------------------------------


def test_disabled_team_skips_cascade() -> None:
    """When is_crm_agent_enabled is False, run_cascade must not be called."""
    fake_settings = _fake_settings()
    mock_client = _make_client(queue_rows=[QUEUE_ROW], agent_enabled=False)

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=mock_client),
        patch("app.routers.ingest.run_cascade", new_callable=AsyncMock) as mock_cascade,
    ):
        client = TestClient(_make_app())
        resp = _post(client)

    assert resp.status_code == 202
    body = resp.json()
    assert body["processed"] == 0
    assert body["skipped"] == 1
    mock_cascade.assert_not_awaited()


# ---------------------------------------------------------------------------
# Test: empty queue → 202 with zeroes
# ---------------------------------------------------------------------------


def test_empty_queue_returns_202_with_zeroes() -> None:
    """No settled rows → 202 with processed=0, skipped=0."""
    fake_settings = _fake_settings()
    mock_client = _make_client(queue_rows=[], agent_enabled=True)

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=mock_client),
        patch("app.routers.ingest.run_cascade", new_callable=AsyncMock) as mock_cascade,
    ):
        client = TestClient(_make_app())
        resp = _post(client)

    assert resp.status_code == 202
    assert resp.json() == {"processed": 0, "skipped": 0}
    mock_cascade.assert_not_awaited()


# ---------------------------------------------------------------------------
# Test: TenantContext constructed correctly (server-to-server)
# ---------------------------------------------------------------------------


def test_tenant_context_has_correct_equipe_id() -> None:
    """The TenantContext passed to run_cascade must carry the row's equipe_id."""
    from app.security import TenantContext

    fake_settings = _fake_settings()
    mock_client = _make_client(queue_rows=[QUEUE_ROW], agent_enabled=True)

    captured_ctx: list[TenantContext] = []

    async def _capture_cascade(**kwargs: object) -> dict:
        captured_ctx.append(kwargs["ctx"])  # type: ignore[arg-type]
        return {"status": "executed"}

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=mock_client),
        patch("app.routers.ingest.run_cascade", side_effect=_capture_cascade),
    ):
        client = TestClient(_make_app())
        _post(client)

    assert len(captured_ctx) == 1
    ctx = captured_ctx[0]
    assert ctx.equipe_id == EQUIPE_ID
    assert ctx.role == "service"


# ===========================================================================
# T5 — Reactive fast-path: POST /api/v1/ingest/row
# ===========================================================================


def _post_row(
    http_client: TestClient,
    *,
    row_id: str = ROW_ID,
    token: str | None = VALID_TOKEN,
) -> "Response":  # noqa: F821
    headers = {}
    if token is not None:
        headers["X-Agent-Token"] = token
    return http_client.post("/api/v1/ingest/row", headers=headers, json={"id": row_id})


# ── 503 when ingest disabled ───────────────────────────────────────────────


def test_row_ingest_disabled_returns_503() -> None:
    """Feature gate: 503 when settings.ingest_enabled is False."""
    fake_settings = _fake_settings(ingest_enabled=False)

    with patch("app.routers.ingest.get_settings", return_value=fake_settings):
        client = TestClient(_make_app())
        resp = _post_row(client)

    assert resp.status_code == 503


# ── 401 on missing / wrong token ───────────────────────────────────────────


def test_row_missing_token_returns_401() -> None:
    fake_settings = _fake_settings(ingest_enabled=True, token=VALID_TOKEN)

    with patch("app.routers.ingest.get_settings", return_value=fake_settings):
        client = TestClient(_make_app())
        resp = _post_row(client, token=None)

    assert resp.status_code == 401


def test_row_wrong_token_returns_401() -> None:
    fake_settings = _fake_settings(ingest_enabled=True, token=VALID_TOKEN)

    with patch("app.routers.ingest.get_settings", return_value=fake_settings):
        client = TestClient(_make_app())
        resp = _post_row(client, token="totally-wrong-token")

    assert resp.status_code == 401


# ── Happy path: pending row + enabled team → cascade once, marked, 202 ──────


def test_row_happy_path_calls_cascade_marks_processed() -> None:
    fake_settings = _fake_settings()
    fake_client = _make_client(queue_rows=[QUEUE_ROW], agent_enabled=True)

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=fake_client),
        patch("app.routers.ingest.run_cascade", new_callable=AsyncMock) as mock_cascade,
    ):
        mock_cascade.return_value = {"status": "executed"}
        client = TestClient(_make_app())
        resp = _post_row(client)

    assert resp.status_code == 202
    assert resp.json() == {"processed": 1, "skipped": 0}
    mock_cascade.assert_awaited_once()
    kwargs = mock_cascade.call_args.kwargs
    assert kwargs["trigger"] == "ingest"
    assert kwargs["lead_id"] == LEAD_ID
    assert kwargs["pipeline_id"] == PIPELINE_ID
    assert kwargs["opportunity_id"] is None
    assert len(fake_client.update_calls) == 1
    assert "processed_at" in fake_client.update_calls[0]


def test_row_tenant_context_is_service() -> None:
    from app.security import TenantContext

    fake_settings = _fake_settings()
    fake_client = _make_client(queue_rows=[QUEUE_ROW], agent_enabled=True)
    captured_ctx: list[TenantContext] = []

    async def _capture_cascade(**kwargs: object) -> dict:
        captured_ctx.append(kwargs["ctx"])  # type: ignore[arg-type]
        return {"status": "executed"}

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=fake_client),
        patch("app.routers.ingest.run_cascade", side_effect=_capture_cascade),
    ):
        client = TestClient(_make_app())
        _post_row(client)

    assert len(captured_ctx) == 1
    assert captured_ctx[0].equipe_id == EQUIPE_ID
    assert captured_ctx[0].role == "service"
    assert captured_ctx[0].actor_user_id is None


# ── Skip path: disabled team → processed:0, skipped:1, no cascade ───────────


def test_row_disabled_team_skips_cascade() -> None:
    fake_settings = _fake_settings()
    fake_client = _make_client(queue_rows=[QUEUE_ROW], agent_enabled=False)

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=fake_client),
        patch("app.routers.ingest.run_cascade", new_callable=AsyncMock) as mock_cascade,
    ):
        client = TestClient(_make_app())
        resp = _post_row(client)

    assert resp.status_code == 202
    assert resp.json() == {"processed": 0, "skipped": 1}
    mock_cascade.assert_not_awaited()
    assert len(fake_client.update_calls) == 0


# ── Not-found / already-processed id → processed:0 reason, no cascade ───────


def test_row_not_found_returns_reason_no_cascade() -> None:
    fake_settings = _fake_settings()
    fake_client = _make_client(queue_rows=[], agent_enabled=True)

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=fake_client),
        patch("app.routers.ingest.run_cascade", new_callable=AsyncMock) as mock_cascade,
    ):
        client = TestClient(_make_app())
        resp = _post_row(client)

    assert resp.status_code == 202
    body = resp.json()
    assert body["processed"] == 0
    assert body["skipped"] == 0
    assert body["reason"] == "not_found_or_processed"
    mock_cascade.assert_not_awaited()
    assert len(fake_client.update_calls) == 0


def test_row_already_processed_is_skipped() -> None:
    """Idempotency: a row with processed_at set must be treated as not found.

    The fake now honours the .is_("processed_at", "null") filter, so
    _load_pending_row returns None for an already-processed row, run_cascade
    is never awaited, no update is written, and the response carries the
    not_found_or_processed reason.
    """
    already_processed_row = {
        **QUEUE_ROW,
        "processed_at": "2026-01-01T00:00:00+00:00",
    }
    fake_settings = _fake_settings()
    fake_client = _make_client(queue_rows=[already_processed_row], agent_enabled=True)

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=fake_client),
        patch("app.routers.ingest.run_cascade", new_callable=AsyncMock) as mock_cascade,
    ):
        client = TestClient(_make_app())
        resp = _post_row(client, row_id=ROW_ID)

    assert resp.status_code == 202
    body = resp.json()
    assert body["processed"] == 0
    assert body["skipped"] == 0
    assert body["reason"] == "not_found_or_processed"
    mock_cascade.assert_not_awaited()
    assert len(fake_client.update_calls) == 0


# ── Cascade error → not marked processed, soft 202 with error reason ────────


def test_row_cascade_error_returns_soft_202_unmarked() -> None:
    fake_settings = _fake_settings()
    fake_client = _make_client(queue_rows=[QUEUE_ROW], agent_enabled=True)

    with (
        patch("app.routers.ingest.get_settings", return_value=fake_settings),
        patch("app.routers.ingest.get_service_client", return_value=fake_client),
        patch(
            "app.routers.ingest.run_cascade",
            new_callable=AsyncMock,
            side_effect=RuntimeError("boom"),
        ),
    ):
        client = TestClient(_make_app())
        resp = _post_row(client)

    assert resp.status_code == 202
    body = resp.json()
    assert body["processed"] == 0
    assert body["reason"] == "error"
    # Row left unprocessed so the cron backstop can retry.
    assert len(fake_client.update_calls) == 0
