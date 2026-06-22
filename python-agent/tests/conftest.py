"""Test configuration for the solo-copilot-agent.

Fixtures:
  db: psycopg connection to PostgreSQL (requires DATABASE_URL env).
    Every test wrapped in a transaction that rolls back on teardown.
    Tests are SKIPPED when DATABASE_URL is unset / unreachable.

DB-backed tests call PL/pgSQL functions that are already deployed to the
Supabase Postgres instance. No migration SQL is loaded by fixtures — the
production schema is used as-is.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import psycopg
import pytest
from dotenv import load_dotenv

# Load .env from the project root so DATABASE_URL is available
_env_path = Path(__file__).resolve().parents[1] / ".env"
if _env_path.exists():
    load_dotenv(_env_path, override=True)

pytest_plugins = []

# Valid equipe UUID from the production Supabase tenant
# Used by DB-backed tests that need a real equipe_id for FK compliance.
TEST_EQUIPE_ID = "99c68948-d041-48f3-9c53-0d2076ab6d05"

# Valid pipeline_stage_v2 UUID from the production tenant.
# Required because opportunities.stage_id is a FK to pipeline_stages_v2.
TEST_STAGE_ID = "3ef1a78c-4c10-4c29-8098-ff6243b21717"


@pytest.fixture
def equipe_id() -> str:
    """Return a valid equipe UUID that exists in the production database."""
    return TEST_EQUIPE_ID


# ── Marker registration ─────────────────────────────────────────────────────

def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "db: marks tests that require a live PostgreSQL connection (DATABASE_URL).",
    )


# ── DB fixture ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def db():
    """Function-scoped psycopg connection that rolls back after the test.

    Skips the test when DATABASE_URL is not set or unreachable.
    """
    conn_str = os.environ.get("DATABASE_URL")
    if not conn_str:
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")

    try:
        conn = psycopg.connect(conn_str, autocommit=False)
    except Exception as exc:
        pytest.skip(f"Cannot connect to database: {exc}")
        return  # unreachable, but keeps type-checkers happy

    try:
        yield conn
    finally:
        conn.rollback()
        conn.close()
