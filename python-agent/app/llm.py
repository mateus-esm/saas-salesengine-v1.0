"""Central LLM model factory.

Every agent builds its chat model through ``build_chat_model`` so the provider
and models can be switched with **env vars only — no code change**:

  LLM_BASE_URL  OpenAI-compatible base URL. Set to a router like Verboo
                (https://code.verboo.ai/router/v1) to use open-source models.
                Unset → OpenAI's default endpoint.
  LLM_API_KEY   API key for that provider. Unset → falls back to OPENAI_API_KEY.

Model ids stay per-role and are also env-overridable, so swapping models is just
as fast:

  DOORMAN_MODEL  (tower + floor doormen)   e.g. deepseek-v4-flash
  WORKER_MODEL   (autonomous team)         e.g. deepseek-v4-flash
  SHAPER_MODEL   (track shaper)            e.g. deepseek-v4-flash

Because Verboo is OpenAI-compatible, we keep using Agno's ``OpenAIChat`` and only
point it at the configured base_url/api_key.
"""

from __future__ import annotations

import os
from typing import Any

from agno.models.openai import OpenAIChat


def build_chat_model(model_id: str) -> OpenAIChat:
    """Construct the chat model for ``model_id`` using the configured provider.

    Reads LLM_BASE_URL / LLM_API_KEY from the environment (not pydantic Settings)
    so it never raises in unit tests that don't provide full settings. When
    neither is set, behaves exactly like ``OpenAIChat(id=model_id)`` against
    OpenAI (using OPENAI_API_KEY).
    """
    kwargs: dict[str, Any] = {"id": model_id}

    base_url = os.getenv("LLM_BASE_URL")
    if base_url:
        kwargs["base_url"] = base_url
        # Agno's OpenAIChat maps the system role to OpenAI's newer "developer"
        # variant, which OpenAI-compatible routers (Verboo/deepseek/etc.) reject
        # ("unknown variant `developer`"). For a custom provider, force the
        # classic role names. Real OpenAI (no LLM_BASE_URL) keeps Agno's default.
        kwargs["role_map"] = {
            "system": "system",
            "user": "user",
            "assistant": "assistant",
            "tool": "tool",
            "model": "assistant",
        }

    api_key = os.getenv("LLM_API_KEY")
    if api_key:
        kwargs["api_key"] = api_key

    return OpenAIChat(**kwargs)
