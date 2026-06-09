"""Tests for app.config.Settings — focus on the CORS_ORIGINS parsing regression.

DBG-1: a comma-separated CORS_ORIGINS env value crashed boot because
pydantic-settings JSON-decodes complex (list) fields before validators run.
The NoDecode annotation fixes it; these tests lock that behaviour in.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings

_REQUIRED = {
    "SUPABASE_URL": "https://x.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "k",
    "SUPABASE_JWT_SECRET": "s",
    "DATABASE_URL": "postgresql://u:p@h:5432/postgres",
    "OPENAI_API_KEY": "o",
    "AGENT_INTERNAL_TOKEN": "t",
}


def _set_required(monkeypatch):
    for key, value in _REQUIRED.items():
        monkeypatch.setenv(key, value)


def test_cors_origins_comma_separated(monkeypatch):
    """Regression for DBG-1: comma-separated value parses to a list, no SettingsError."""
    _set_required(monkeypatch)
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "https://a.com,https://b.com,http://localhost:5173",
    )
    settings = Settings(_env_file=None)
    assert settings.cors_origins == [
        "https://a.com",
        "https://b.com",
        "http://localhost:5173",
    ]


def test_cors_origins_single_value(monkeypatch):
    _set_required(monkeypatch)
    monkeypatch.setenv("CORS_ORIGINS", "https://only.com")
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ["https://only.com"]


def test_cors_origins_whitespace_trimmed(monkeypatch):
    _set_required(monkeypatch)
    monkeypatch.setenv("CORS_ORIGINS", " https://a.com , https://b.com ")
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ["https://a.com", "https://b.com"]


def test_cors_origins_empty_string_is_empty_list(monkeypatch):
    _set_required(monkeypatch)
    monkeypatch.setenv("CORS_ORIGINS", "")
    settings = Settings(_env_file=None)
    assert settings.cors_origins == []


def test_cors_origins_default_when_unset(monkeypatch):
    _set_required(monkeypatch)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ["http://localhost:5173"]
