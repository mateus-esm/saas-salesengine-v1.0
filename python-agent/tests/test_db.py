import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db


def test_service_client_is_memoised(monkeypatch):
    db.get_service_client.cache_clear()
    calls = []
    client = object()
    settings = SimpleNamespace(
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="service-role",
    )

    monkeypatch.setattr(db, "get_settings", lambda: settings)

    def fake_create_client(url, key):
        calls.append((url, key))
        return client

    monkeypatch.setattr(db, "create_client", fake_create_client)

    assert db.get_service_client() is client
    assert db.get_service_client() is client
    assert calls == [("https://example.supabase.co", "service-role")]


def test_pg_pool_is_created_lazily_and_memoised(monkeypatch):
    created = []
    settings = SimpleNamespace(database_url="postgresql://user:pass@example/db")

    class FakePool:
        def __init__(self, **kwargs):
            created.append(kwargs)

    monkeypatch.setattr(db, "_pg_pool", None)
    monkeypatch.setattr(db, "PsycopgConnectionPool", FakePool)
    monkeypatch.setattr(db, "get_settings", lambda: settings)

    assert created == []
    first = db.get_pg_pool()
    second = db.get_pg_pool()

    assert first is second
    assert created == [
        {
            "conninfo": "postgresql://user:pass@example/db",
            "min_size": 0,
            "max_size": 4,
            "open": False,
            "kwargs": {"autocommit": True},
        }
    ]


def test_get_db_returns_service_client(monkeypatch):
    client = object()

    monkeypatch.setattr(db, "get_service_client", lambda: client)

    assert db.get_db() is client
