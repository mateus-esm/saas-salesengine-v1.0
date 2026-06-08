import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import agno_store


def test_storage_is_lazy_memoised_and_uses_agno_schema(monkeypatch):
    agno_store.get_storage.cache_clear()
    pool_calls = []
    created = []

    class FakePostgresDb:
        def __init__(self, **kwargs):
            created.append(kwargs)

    settings = SimpleNamespace(
        database_url="postgresql://user:pass@example.supabase.co:5432/postgres",
        agno_schema="agno",
    )

    monkeypatch.setattr(agno_store, "get_settings", lambda: settings)
    monkeypatch.setattr(agno_store, "get_pg_pool", lambda: pool_calls.append(True))
    monkeypatch.setattr(agno_store, "_get_postgres_db_class", lambda: FakePostgresDb)

    first = agno_store.get_storage()
    second = agno_store.get_storage()

    assert first is second
    assert pool_calls == [True]
    assert created == [
        {
            "db_url": "postgresql+psycopg://user:pass@example.supabase.co:5432/postgres",
            "db_schema": "agno",
            "create_schema": False,
        }
    ]


def test_memory_reuses_storage(monkeypatch):
    storage = object()

    monkeypatch.setattr(agno_store, "get_storage", lambda: storage)

    assert agno_store.get_memory() is storage


def test_session_id_for_opportunity_uses_opportunity_id():
    assert agno_store.session_id_for_opportunity(" opp-123 ") == "opp-123"
