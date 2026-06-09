"""Tests for app.cascade.tower_doorman — all LLM calls are mocked."""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cascade.tower_doorman import classify_and_route
from app.schemas import RouteDecision
from app.security import TenantContext

EQUIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ACTOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PIPELINE_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
PIPELINE_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

CTX = TenantContext(equipe_id=EQUIPE_ID, actor_user_id=ACTOR_ID, role="admin")

PIPELINES = [
    {"id": PIPELINE_A, "name": "Gestão de Imóveis", "description": "Captação de proprietários"},
    {"id": PIPELINE_B, "name": "Vendas B2B", "description": "Empresas e parceiros"},
]

LEAD = {"id": "lead-1", "name": "João Silva", "email": "joao@exemplo.com"}


def _mock_response(decision: RouteDecision) -> MagicMock:
    resp = MagicMock()
    resp.content = decision
    return resp


def _make_decision(**kwargs) -> RouteDecision:
    defaults = {
        "contact_type": "lead",
        "pipeline_id": PIPELINE_A,
        "stage_id": None,
        "confidence": 0.9,
        "extracted": {},
        "reason": "Lead com intenção clara de contratar.",
    }
    defaults.update(kwargs)
    return RouteDecision(**defaults)


@pytest.mark.asyncio
async def test_valid_lead_routed_to_known_pipeline() -> None:
    decision = _make_decision(pipeline_id=PIPELINE_A)

    with patch("app.cascade.tower_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(decision))
        result = await classify_and_route(
            ctx=CTX,
            conversation="Tenho um apartamento na planta e quero gestão profissional.",
            lead=LEAD,
            pipelines=PIPELINES,
            model_id="gpt-4o-mini",
        )

    assert result.contact_type == "lead"
    assert result.pipeline_id == PIPELINE_A
    assert 0.0 <= result.confidence <= 1.0


@pytest.mark.asyncio
async def test_pipeline_id_in_supplied_set() -> None:
    """pipeline_id must always be one of the supplied IDs."""
    decision = _make_decision(pipeline_id=PIPELINE_B)

    with patch("app.cascade.tower_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(decision))
        result = await classify_and_route(
            ctx=CTX,
            conversation="Preciso de uma solução B2B para minha empresa.",
            lead=LEAD,
            pipelines=PIPELINES,
            model_id="gpt-4o-mini",
        )

    assert result.pipeline_id in {p["id"] for p in PIPELINES}


@pytest.mark.asyncio
async def test_hallucinated_pipeline_id_is_reset_to_none() -> None:
    """If the LLM returns a pipeline_id not in the supplied list, guard resets it to None."""
    bad_decision = _make_decision(pipeline_id="99999999-fake-fake-fake-999999999999")

    with patch("app.cascade.tower_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(bad_decision))
        result = await classify_and_route(
            ctx=CTX,
            conversation="Quero comprar um imóvel.",
            lead=LEAD,
            pipelines=PIPELINES,
            model_id="gpt-4o-mini",
        )

    assert result.pipeline_id is None
    assert result.stage_id is None


@pytest.mark.asyncio
async def test_spam_returns_null_pipeline() -> None:
    spam_decision = _make_decision(
        contact_type="spam",
        pipeline_id=None,
        confidence=0.99,
        reason="Mensagem de spam sem intenção comercial.",
    )

    with patch("app.cascade.tower_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(spam_decision))
        result = await classify_and_route(
            ctx=CTX,
            conversation="Ganhe 1000 reais agora! Clique aqui!",
            lead=LEAD,
            pipelines=PIPELINES,
            model_id="gpt-4o-mini",
        )

    assert result.contact_type == "spam"
    assert result.pipeline_id is None


@pytest.mark.asyncio
async def test_empty_pipelines_list_always_null_pipeline() -> None:
    decision = _make_decision(pipeline_id=PIPELINE_A)

    with patch("app.cascade.tower_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(decision))
        result = await classify_and_route(
            ctx=CTX,
            conversation="Tenho interesse no serviço.",
            lead=LEAD,
            pipelines=[],  # no pipelines available
            model_id="gpt-4o-mini",
        )

    assert result.pipeline_id is None


@pytest.mark.asyncio
async def test_confidence_within_bounds() -> None:
    decision = _make_decision(confidence=0.75)

    with patch("app.cascade.tower_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(decision))
        result = await classify_and_route(
            ctx=CTX,
            conversation="Gostaria de mais informações.",
            lead=LEAD,
            pipelines=PIPELINES,
            model_id="gpt-4o-mini",
        )

    assert 0.0 <= result.confidence <= 1.0


@pytest.mark.asyncio
async def test_extracted_data_preserved() -> None:
    decision = _make_decision(extracted={"quartos": 3, "cidade": "Florianópolis"})

    with patch("app.cascade.tower_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=_mock_response(decision))
        result = await classify_and_route(
            ctx=CTX,
            conversation="Tenho um apto de 3 quartos em Florianópolis.",
            lead=LEAD,
            pipelines=PIPELINES,
            model_id="gpt-4o-mini",
        )

    assert result.extracted["quartos"] == 3
    assert result.extracted["cidade"] == "Florianópolis"


@pytest.mark.asyncio
async def test_dict_response_content_is_validated() -> None:
    """If Agno returns a plain dict instead of RouteDecision, model_validate is called."""
    raw_dict = {
        "contact_type": "contact",
        "pipeline_id": None,
        "stage_id": None,
        "confidence": 0.5,
        "extracted": {},
        "reason": "Contato existente sem nova intenção.",
    }
    resp = MagicMock()
    resp.content = raw_dict  # dict, not RouteDecision instance

    with patch("app.cascade.tower_doorman.Agent") as MockAgent:
        MockAgent.return_value.arun = AsyncMock(return_value=resp)
        result = await classify_and_route(
            ctx=CTX,
            conversation="Olá, preciso de suporte.",
            lead=LEAD,
            pipelines=PIPELINES,
            model_id="gpt-4o-mini",
        )

    assert isinstance(result, RouteDecision)
    assert result.contact_type == "contact"
