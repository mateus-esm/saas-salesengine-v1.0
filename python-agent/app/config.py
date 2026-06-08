from functools import lru_cache
from typing import Any

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

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

