"""Tests for app.routers.shape — shape_track and Supabase RPC calls are mocked.

The router is mounted on a throwaway FastAPI() app (no main.py needed).
get_tenant_context is overridden via app.dependency_overrides to inject a fake
TenantContext without touching JWT/DB plumbing.

get_settings is patched at the module level to avoid loading .env in CI.
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deps import get_tenant_context
from app.routers.shape import router
from app.schemas import (
    CustomFieldBlueprint,
    PipelineBlueprint,
    StageBlueprint,
)
from app.security import TenantContext

# ---------------------------------------------------------------------------
# Test fixtures / helpers
# ---------------------------------------------------------------------------

EQUIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
FAKE_PIPELINE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

FAKE_CTX = TenantContext(equipe_id=EQUIPE_ID, actor_user_id=ACTOR_ID, role="admin")

# Fake settings object so tests never need a real .env file
FAKE_SETTINGS = MagicMock(shaper_model="gpt-4o")


def _make_app() -> FastAPI:
    """Mount the shape router on a throwaway FastAPI app and inject the fake tenant."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_tenant_context] = lambda: FAKE_CTX
    return app


def _make_blueprint() -> PipelineBlueprint:
    return PipelineBlueprint(
        pipeline_name="Pipeline de Teste",
        description="Um pipeline de teste para o shape router",
        stages=[
            StageBlueprint(name="Prospeccao", position=0),
            StageBlueprint(name="Qualificacao", position=1),
            StageBlueprint(name="Fechamento", position=2, stage_type="won"),
        ],
        custom_fields=[
            CustomFieldBlueprint(key="valor_contrato", label="Valor do Contrato", type="currency", position=0),
            CustomFieldBlueprint(key="numero_funcionarios", label="Numero de Funcionarios", type="number", position=1),
        ],
    )


# ---------------------------------------------------------------------------
# POST /api/v1/shape/preview — success
# ---------------------------------------------------------------------------


def test_preview_returns_blueprint_json_on_valid_prompt() -> None:
    """preview calls shape_track and returns its blueprint as JSON (200)."""
    blueprint = _make_blueprint()

    with patch("app.routers.shape.shape_track", new_callable=AsyncMock) as mock_shape, \
         patch("app.routers.shape.get_settings", return_value=FAKE_SETTINGS):
        mock_shape.return_value = blueprint
        client = TestClient(_make_app())
        resp = client.post("/api/v1/shape/preview", json={"prompt": "Pipeline de vendas B2B"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["pipeline_name"] == "Pipeline de Teste"
    assert len(body["stages"]) == 3
    assert len(body["custom_fields"]) == 2


def test_preview_passes_prompt_and_locale_to_shape_track() -> None:
    """preview forwards prompt and locale (and shaper_model from settings) to shape_track."""
    blueprint = _make_blueprint()

    with patch("app.routers.shape.shape_track", new_callable=AsyncMock) as mock_shape, \
         patch("app.routers.shape.get_settings", return_value=FAKE_SETTINGS):
        mock_shape.return_value = blueprint
        client = TestClient(_make_app())
        resp = client.post(
            "/api/v1/shape/preview",
            json={"prompt": "Venda de software", "locale": "en-US"},
        )

    assert resp.status_code == 200
    call_kwargs = mock_shape.call_args.kwargs
    assert call_kwargs["prompt"] == "Venda de software"
    assert call_kwargs["locale"] == "en-US"
    assert call_kwargs["model_id"] == "gpt-4o"  # FAKE_SETTINGS.shaper_model


def test_preview_uses_default_locale_when_omitted() -> None:
    """preview defaults locale to pt-BR when not supplied by the client."""
    blueprint = _make_blueprint()

    with patch("app.routers.shape.shape_track", new_callable=AsyncMock) as mock_shape, \
         patch("app.routers.shape.get_settings", return_value=FAKE_SETTINGS):
        mock_shape.return_value = blueprint
        client = TestClient(_make_app())
        resp = client.post("/api/v1/shape/preview", json={"prompt": "Pipeline imobiliario"})

    assert resp.status_code == 200
    call_kwargs = mock_shape.call_args.kwargs
    assert call_kwargs["locale"] == "pt-BR"


# ---------------------------------------------------------------------------
# POST /api/v1/shape/preview — ValidationError → 422
# ---------------------------------------------------------------------------


def test_preview_returns_422_when_shape_track_raises_validation_error() -> None:
    """If shape_track raises pydantic.ValidationError, the route returns HTTP 422."""
    from pydantic import ValidationError

    # Trigger a real ValidationError from PipelineBlueprint validation
    try:
        PipelineBlueprint.model_validate({"pipeline_name": "Bad", "stages": []})
    except ValidationError as exc:
        real_validation_error = exc
    else:
        pytest.fail("Expected ValidationError was not raised")

    with patch("app.routers.shape.shape_track", new_callable=AsyncMock) as mock_shape, \
         patch("app.routers.shape.get_settings", return_value=FAKE_SETTINGS):
        mock_shape.side_effect = real_validation_error
        client = TestClient(_make_app())
        resp = client.post("/api/v1/shape/preview", json={"prompt": "qualquer coisa"})

    assert resp.status_code == 422


def test_preview_returns_422_when_prompt_is_missing() -> None:
    """preview body requires 'prompt'; omitting it returns HTTP 422 from FastAPI."""
    client = TestClient(_make_app())
    resp = client.post("/api/v1/shape/preview", json={"locale": "pt-BR"})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/v1/shape/apply — success
# ---------------------------------------------------------------------------


def test_apply_calls_rpc_with_equipe_id_from_context() -> None:
    """apply calls the shape_pipeline RPC using ctx.equipe_id (never from the body)."""
    blueprint = _make_blueprint()

    mock_execute = MagicMock()
    mock_execute.data = FAKE_PIPELINE_ID  # RPC returns a uuid scalar

    mock_rpc_chain = MagicMock()
    mock_rpc_chain.execute.return_value = mock_execute

    mock_client = MagicMock()
    mock_client.rpc.return_value = mock_rpc_chain

    with patch("app.routers.shape.get_service_client", return_value=mock_client):
        client = TestClient(_make_app())
        resp = client.post("/api/v1/shape/apply", json=blueprint.model_dump())

    assert resp.status_code == 200
    # Verify RPC was called with the context equipe_id
    call_args = mock_client.rpc.call_args
    assert call_args.args[0] == "shape_pipeline"
    rpc_params = call_args.args[1]
    assert rpc_params["p_equipe_id"] == EQUIPE_ID


def test_apply_returns_pipeline_id_from_rpc() -> None:
    """apply returns {pipeline_id: <uuid>} from the RPC response."""
    blueprint = _make_blueprint()

    mock_execute = MagicMock()
    mock_execute.data = FAKE_PIPELINE_ID

    mock_rpc_chain = MagicMock()
    mock_rpc_chain.execute.return_value = mock_execute

    mock_client = MagicMock()
    mock_client.rpc.return_value = mock_rpc_chain

    with patch("app.routers.shape.get_service_client", return_value=mock_client):
        client = TestClient(_make_app())
        resp = client.post("/api/v1/shape/apply", json=blueprint.model_dump())

    assert resp.status_code == 200
    assert resp.json() == {"pipeline_id": FAKE_PIPELINE_ID}


def test_apply_passes_full_blueprint_payload_to_rpc() -> None:
    """apply forwards the entire blueprint as p_payload to the RPC."""
    blueprint = _make_blueprint()

    mock_execute = MagicMock()
    mock_execute.data = FAKE_PIPELINE_ID

    mock_rpc_chain = MagicMock()
    mock_rpc_chain.execute.return_value = mock_execute

    mock_client = MagicMock()
    mock_client.rpc.return_value = mock_rpc_chain

    with patch("app.routers.shape.get_service_client", return_value=mock_client):
        client = TestClient(_make_app())
        resp = client.post("/api/v1/shape/apply", json=blueprint.model_dump())

    assert resp.status_code == 200
    rpc_params = mock_client.rpc.call_args.args[1]
    assert rpc_params["p_payload"]["pipeline_name"] == blueprint.pipeline_name
    assert len(rpc_params["p_payload"]["stages"]) == len(blueprint.stages)


# ---------------------------------------------------------------------------
# POST /api/v1/shape/apply — invalid body → 422, RPC NOT called
# ---------------------------------------------------------------------------


def test_apply_returns_422_and_does_not_call_rpc_when_body_is_malformed() -> None:
    """An invalid blueprint body must return 422 without ever calling the Supabase RPC."""
    mock_client = MagicMock()

    with patch("app.routers.shape.get_service_client", return_value=mock_client):
        client = TestClient(_make_app())
        # Missing required 'stages', 'pipeline_name' — will fail PipelineBlueprint validation
        resp = client.post("/api/v1/shape/apply", json={"description": "bad payload"})

    assert resp.status_code == 422
    mock_client.rpc.assert_not_called()


def test_apply_returns_422_when_stages_have_non_contiguous_positions() -> None:
    """stages with non-contiguous positions (Pydantic validator) → 422, RPC NOT called."""
    mock_client = MagicMock()

    bad_body = {
        "pipeline_name": "Broken",
        "stages": [
            {"name": "A", "position": 0, "stage_type": "open", "color": "#64748b"},
            {"name": "B", "position": 5, "stage_type": "won", "color": "#64748b"},  # gap
        ],
        "custom_fields": [],
    }

    with patch("app.routers.shape.get_service_client", return_value=mock_client):
        client = TestClient(_make_app())
        resp = client.post("/api/v1/shape/apply", json=bad_body)

    assert resp.status_code == 422
    mock_client.rpc.assert_not_called()
