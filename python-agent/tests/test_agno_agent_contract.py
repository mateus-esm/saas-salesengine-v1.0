"""Guards against Agno API drift.

The doormen / shaper / autonomous-team tests all MOCK `agno.agent.Agent`, so a
wrong constructor kwarg (e.g. `system_prompt` instead of `system_message`) passes
the suite but crashes in production with TypeError. These tests construct the
REAL Agno Agent with the exact kwargs our code uses — no network — so the
contract is verified for real. This is the test that would have caught the
production `system_prompt` TypeError.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest


@pytest.fixture(autouse=True)
def _dummy_openai_key(monkeypatch):
    # Model construction must not require a real key.
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-dummy")


def test_doorman_shaper_agent_kwargs_are_valid():
    """tower/floor/track_shaper construct Agent(model, output_schema, system_message, telemetry)."""
    from agno.agent import Agent
    from agno.models.openai import OpenAIChat

    from app.schemas import RouteDecision

    agent = Agent(
        model=OpenAIChat(id="gpt-4o-mini"),
        output_schema=RouteDecision,
        system_message="system message",
        telemetry=False,
    )
    assert agent is not None


def test_autonomous_team_agent_kwargs_are_valid():
    """autonomous_team constructs Agent(model, tools, tool_call_limit, system_message, telemetry)."""
    from agno.agent import Agent
    from agno.models.openai import OpenAIChat

    agent = Agent(
        model=OpenAIChat(id="gpt-4o"),
        tools=[],
        tool_call_limit=3,
        system_message="system message",
        telemetry=False,
    )
    assert agent is not None
