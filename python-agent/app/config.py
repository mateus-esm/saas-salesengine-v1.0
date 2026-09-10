from functools import lru_cache
from typing import Annotated, Any

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: AnyHttpUrl
    supabase_service_role_key: str
    supabase_jwt_secret: str
    database_url: str
    openai_api_key: str
    agent_internal_token: str

    agno_schema: str = "agno"
    # Defaults follow LLM_BASE_URL, which points at the Verboo router in every
    # deployed environment. They used to be OpenAI ids (gpt-4o-mini / gpt-4o):
    # ids that Verboo does not serve, so any environment that set LLM_BASE_URL
    # without also setting all three MODEL vars would fall back to a model the
    # provider rejects.
    doorman_model: str = "deepseek-v4-flash-0731"
    worker_model: str = "deepseek-v4-flash-0731"
    shaper_model: str = "deepseek-v4-flash-0731"
    # Same model as the rest: the Verboo account serves one family today, and a
    # strategic tier pointing at an OpenAI id (o4-mini) was a model the provider
    # does not serve -- reached the moment copilot_workflow_enabled was turned on.
    strategic_model: str = "deepseek-v4-flash-0731"
    copilot_workflow_enabled: bool = False
    ingest_enabled: bool = False

    # G6 — Production CORS wiring
    # ─────────────────────────────────────────────────────────────────────────
    # Dev default: ["http://localhost:5173"]
    # Production:  set CORS_ORIGINS=https://app.<yourdomain> in Dokploy env vars
    #              (comma-separated list if multiple origins are needed, e.g.
    #               "https://app.<yourdomain>,https://www.<yourdomain>").
    # The Vite frontend reads VITE_COPILOT_URL=https://agent.<yourdomain> at
    # build time (see root .env.example) — that is the public URL of this service.
    # ─────────────────────────────────────────────────────────────────────────
    # NoDecode: pydantic-settings JSON-decodes complex (list/dict) fields from env
    # BEFORE field validators run. A comma-separated CORS_ORIGINS is not JSON, which
    # raised SettingsError on boot. NoDecode skips that decode so parse_cors_origins
    # (mode="before") receives the raw string and splits it.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    # CORS regex — every niche is a domain alias of ONE Netlify site, so rather than
    # listing each origin in CORS_ORIGINS we allow the whole *.soloventures.com.br
    # space by regex. New niches then need ZERO CORS maintenance. Starlette matches
    # this with re.fullmatch. Override with CORS_ORIGIN_REGEX; set "" to disable.
    cors_origin_regex: str | None = r"https://([a-z0-9-]+\.)*soloventures\.com\.br"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str]:
        if value is None or value == "":
            return []
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


# Model ids must be valid for whatever LLM_BASE_URL points at. What the Verboo
# router actually serves for this account (GET /router/v1/models):
#
#   deepseek-v4-flash        1M ctx, reasoning: high|max
#   deepseek-v4-flash-0731   1M ctx, reasoning: low|medium|high|max|xhigh  <- default
#   glm-5.3-flash            1M ctx, vision
#   mimo-v2.5                1M ctx, vision
#
# The slug is the BARE id. The `pro-old/` prefix seen in the API key
# (`vbk_pro-old_...`) is the account namespace; the router accepts it but strips
# it, and echoes the bare id back in the response. Use the bare id.
#
# Direct OpenAI (only when LLM_BASE_URL is unset): gpt-4o-mini, gpt-4o, o4-mini.


@lru_cache
def get_settings() -> Settings:
    return Settings()

