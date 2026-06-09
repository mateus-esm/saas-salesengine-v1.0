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
    doorman_model: str = "gpt-4o-mini"
    worker_model: str = "gpt-4o"
    shaper_model: str = "gpt-4o"
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


# Cheap model swaps documented for operators:
# doorman_model: deepseek-chat, glm-4-flash, claude-haiku
# worker_model / shaper_model: claude-sonnet-4-6, deepseek-reasoner


@lru_cache
def get_settings() -> Settings:
    return Settings()

