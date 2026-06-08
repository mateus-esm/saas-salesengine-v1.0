"""Tests for app.cascade.track_shaper — all LLM calls are mocked."""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from pydantic import ValidationError

from app.cascade.track_shaper import shape_track
from app.schemas import (
    CustomFieldBlueprint,
    PipelineBlueprint,
    StageBlueprint,
)


def _make_blueprint(
    stages: list[StageBlueprint] | None = None,
    custom_fields: list[CustomFieldBlueprint] | None = None,
) -> PipelineBlueprint:
    if stages is None:
        stages = [
            StageBlueprint(name="Novo Proprietário", position=0),
            StageBlueprint(name="Qualificação Técnica", position=1),
            StageBlueprint(name="Vistoria Agendada", position=2, max_idle_hours=24),
            StageBlueprint(name="Contrato Pendente", position=3, stage_type="won"),
        ]
    if custom_fields is None:
        custom_fields = [
            CustomFieldBlueprint(key="numero_dormitorios", label="Número de Dormitórios", type="number", position=0),
            CustomFieldBlueprint(key="valor_condominio", label="Valor do Condomínio", type="currency", position=1),
        ]
    return PipelineBlueprint(
        pipeline_name="Gestão de Imóveis",
        description="Pipeline para gestão de proprietários de imóveis",
        stages=stages,
        custom_fields=custom_fields,
    )


def _mock_run_response(blueprint: PipelineBlueprint) -> MagicMock:
    response = MagicMock()
    response.content = blueprint
    return response


@pytest.fixture()
def story_a_prompt() -> str:
    return (
        "Eu preciso capturar proprietários de imóveis na planta em Florianópolis, "
        "descobrir o número de dormitórios e o valor do condomínio, agendar uma "
        "vistoria técnica presencial com no máximo 24 horas de prazo, e depois "
        "enviar o contrato padrão."
    )


@pytest.mark.asyncio
async def test_shape_track_returns_valid_blueprint(story_a_prompt: str) -> None:
    blueprint = _make_blueprint()
    mock_response = _mock_run_response(blueprint)

    with patch("app.cascade.track_shaper.Agent") as MockAgent:
        instance = MockAgent.return_value
        instance.arun = AsyncMock(return_value=mock_response)

        result = await shape_track(prompt=story_a_prompt, model_id="gpt-4o")

    assert isinstance(result, PipelineBlueprint)
    assert result.pipeline_name == "Gestão de Imóveis"


@pytest.mark.asyncio
async def test_story_a_yields_at_least_3_stages_and_2_fields(story_a_prompt: str) -> None:
    blueprint = _make_blueprint()
    mock_response = _mock_run_response(blueprint)

    with patch("app.cascade.track_shaper.Agent") as MockAgent:
        instance = MockAgent.return_value
        instance.arun = AsyncMock(return_value=mock_response)

        result = await shape_track(prompt=story_a_prompt, model_id="gpt-4o")

    assert len(result.stages) >= 3, f"Expected ≥3 stages, got {len(result.stages)}"
    assert len(result.custom_fields) >= 2, f"Expected ≥2 fields, got {len(result.custom_fields)}"


@pytest.mark.asyncio
async def test_stage_positions_are_contiguous(story_a_prompt: str) -> None:
    blueprint = _make_blueprint()
    mock_response = _mock_run_response(blueprint)

    with patch("app.cascade.track_shaper.Agent") as MockAgent:
        instance = MockAgent.return_value
        instance.arun = AsyncMock(return_value=mock_response)

        result = await shape_track(prompt=story_a_prompt, model_id="gpt-4o")

    positions = sorted(s.position for s in result.stages)
    assert positions == list(range(len(result.stages)))


@pytest.mark.asyncio
async def test_sla_preserved_from_blueprint(story_a_prompt: str) -> None:
    blueprint = _make_blueprint()
    mock_response = _mock_run_response(blueprint)

    with patch("app.cascade.track_shaper.Agent") as MockAgent:
        instance = MockAgent.return_value
        instance.arun = AsyncMock(return_value=mock_response)

        result = await shape_track(prompt=story_a_prompt, model_id="gpt-4o")

    sla_stages = [s for s in result.stages if s.max_idle_hours is not None]
    assert len(sla_stages) >= 1, "Expected at least one stage with max_idle_hours"
    assert sla_stages[0].max_idle_hours == 24


@pytest.mark.asyncio
async def test_invalid_positions_surface_validation_error() -> None:
    """If the LLM (or Agno fallback) returns a non-PipelineBlueprint dict with bad positions,
    model_validate must raise ValidationError."""
    bad_payload = {
        "pipeline_name": "Broken",
        "stages": [
            {"name": "A", "position": 0},
            {"name": "B", "position": 5},  # gap — not contiguous
        ],
        "custom_fields": [],
    }
    mock_response = MagicMock()
    mock_response.content = bad_payload  # dict, not PipelineBlueprint instance

    with patch("app.cascade.track_shaper.Agent") as MockAgent:
        instance = MockAgent.return_value
        instance.arun = AsyncMock(return_value=mock_response)

        with pytest.raises(ValidationError):
            await shape_track(prompt="test", model_id="gpt-4o")


@pytest.mark.asyncio
async def test_non_snake_key_surfaces_validation_error() -> None:
    """Custom field key with uppercase must trigger ValidationError."""
    bad_payload = {
        "pipeline_name": "Broken",
        "stages": [
            {"name": "Início", "position": 0},
            {"name": "Fim", "position": 1, "stage_type": "won"},
        ],
        "custom_fields": [
            {"key": "BadKey", "label": "Bad", "type": "text", "position": 0},
        ],
    }
    mock_response = MagicMock()
    mock_response.content = bad_payload

    with patch("app.cascade.track_shaper.Agent") as MockAgent:
        instance = MockAgent.return_value
        instance.arun = AsyncMock(return_value=mock_response)

        with pytest.raises(ValidationError):
            await shape_track(prompt="test", model_id="gpt-4o")


@pytest.mark.asyncio
async def test_mismatched_cadence_pair_surfaces_validation_error() -> None:
    """cadence_value without cadence_unit must raise ValidationError."""
    bad_payload = {
        "pipeline_name": "Broken",
        "stages": [
            {"name": "Início", "position": 0, "cadence_value": 2, "cadence_unit": None},
            {"name": "Fim", "position": 1, "stage_type": "won"},
        ],
        "custom_fields": [],
    }
    mock_response = MagicMock()
    mock_response.content = bad_payload

    with patch("app.cascade.track_shaper.Agent") as MockAgent:
        instance = MockAgent.return_value
        instance.arun = AsyncMock(return_value=mock_response)

        with pytest.raises(ValidationError):
            await shape_track(prompt="test", model_id="gpt-4o")


@pytest.mark.asyncio
async def test_locale_parameter_accepted() -> None:
    """locale is accepted without error (default pt-BR, also works with en-US)."""
    blueprint = _make_blueprint()
    mock_response = _mock_run_response(blueprint)

    with patch("app.cascade.track_shaper.Agent") as MockAgent:
        instance = MockAgent.return_value
        instance.arun = AsyncMock(return_value=mock_response)

        result = await shape_track(prompt="test process", locale="en-US", model_id="gpt-4o")

    assert isinstance(result, PipelineBlueprint)
