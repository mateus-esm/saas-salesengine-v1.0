from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.config import get_settings
from app.db import get_pg_pool


def _get_postgres_db_class() -> type[Any]:
    from agno.db.postgres import PostgresDb

    return PostgresDb


def _normalize_postgres_url(database_url: str) -> str:
    if database_url.startswith("postgresql+"):
        return database_url
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    return database_url


@lru_cache
def get_storage() -> Any:
    settings = get_settings()
    get_pg_pool()

    postgres_db_cls = _get_postgres_db_class()
    return postgres_db_cls(
        db_url=_normalize_postgres_url(settings.database_url),
        db_schema=settings.agno_schema,
        create_schema=False,
    )


def get_memory() -> Any:
    return get_storage()


def session_id_for_opportunity(opportunity_id: str) -> str:
    session_id = str(opportunity_id).strip()
    if not session_id:
        raise ValueError("opportunity_id is required for Agno session persistence")
    return session_id
