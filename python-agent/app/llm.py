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

import json
import os
from typing import Any, TypeVar

from agno.models.openai import OpenAIChat
from pydantic import BaseModel

ModelT = TypeVar("ModelT", bound=BaseModel)


class ModelProviderError(RuntimeError):
    """The provider failed and its message came back where model output belongs.

    WHY THIS EXISTS: an OpenAI-compatible router answers a bad credential with
    ``401 {"error": "invalid or expired token"}``, and Agno flattens that into
    ``RunOutput.content`` as a plain string. Handing that string to
    ``Schema.model_validate`` produced:

        422 {"detail":[{"type":"model_type","loc":[],
             "msg":"Input should be a valid dictionary or instance of
                    PipelineBlueprint",
             "input":"invalid or expired token"}]}

    which told the founder his pipeline blueprint was invalid when the service
    simply could not authenticate — and sent the diagnosis to the wrong place
    entirely. The provider's failure has to be able to say so.
    """


def structured_output_kwargs(schema: type[BaseModel]) -> dict[str, Any]:
    """Agent kwargs that ask the provider to coerce the reply into ``schema``.

    Structured output is a PLAN FEATURE, not something every OpenAI-compatible
    endpoint has. The Verboo router answers this account with::

        403 {"code": "structured_output_not_enabled",
             "error": "structured output is not enabled for this plan"}

    and because all five agents asked for it, every Copilot call died there —
    creating a pipeline and syncing alike.

    Dropping it is safe: each agent's system prompt already carries the contract
    on its own ("Responda APENAS com o JSON do schema X — sem texto adicional",
    followed by a SCHEMA DE SAIDA block), and ``parse_model_output`` accepts JSON
    that arrives as text. Verified against the live router: the model returns a
    clean JSON object that validates with no provider coercion at all.

    Default follows the same reasoning as ``role_map`` above — a custom base_url
    means an unknown router, so assume the conservative thing — and
    ``LLM_STRUCTURED_OUTPUT`` overrides it either way for a provider that does
    support it.
    """
    raw = os.getenv("LLM_STRUCTURED_OUTPUT")
    if raw is not None:
        enabled = raw.strip().lower() not in {"0", "false", "no", "off", ""}
    else:
        enabled = not os.getenv("LLM_BASE_URL")

    if not enabled:
        return {}
    return {"output_schema": schema, "use_json_mode": True}


def parse_model_output(content: Any, schema: type[ModelT]) -> ModelT:
    """Turn an Agno run's ``content`` into ``schema``, or say who actually failed.

    Three cases, deliberately kept apart:

    * already the parsed model -> return it;
    * a JSON object (or JSON text) -> validate it, so genuinely malformed model
      output still raises ``ValidationError`` and still becomes a 422;
    * anything else that is a bare string -> the provider talked to us instead of
      the model. That is ``ModelProviderError``, never a validation error.
    """
    if isinstance(content, schema):
        return content

    if isinstance(content, str):
        text = content.strip()
        try:
            decoded = json.loads(text)
        except ValueError as exc:
            # Not JSON at all: a provider/gateway message, not model output.
            raise ModelProviderError(text) from exc
        if not isinstance(decoded, dict):
            # Valid JSON, but a scalar — still not something a schema describes.
            raise ModelProviderError(text)
        content = decoded

    return schema.model_validate(content)


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


def build_reasoning_model(model_id: str, *, effort: str = "medium") -> OpenAIChat:
    """Construct a strategic-tier model for high-stakes reasoning.

    Native OpenAI reasoning models may honor ``reasoning_effort``. For
    OpenAI-compatible routers, keep the plain chat-model shape so providers that
    do not support the parameter do not reject the request.
    """
    model = build_chat_model(model_id)
    if not os.getenv("LLM_BASE_URL"):
        try:
            model.reasoning_effort = effort
        except Exception:
            pass
    return model
