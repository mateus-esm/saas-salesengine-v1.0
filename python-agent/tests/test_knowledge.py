"""Tests for app.knowledge (G2) — per-tenant PgVector Knowledge factory.

Foundation only: wired into NO agent this sprint. We assert the factory points
at the right table and carries the tenant filter, with PgVector stubbed so no DB
or embedder is needed.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.knowledge as knowledge


class _FakePgVector:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


def test_build_knowledge_targets_table_and_tenant_filter(monkeypatch):
    monkeypatch.setattr(knowledge, "PgVector", _FakePgVector)
    monkeypatch.setattr(knowledge, "OpenAIEmbedder", lambda **kw: ("embedder", kw))

    tk = knowledge.build_knowledge("e1")

    assert tk.equipe_id == "e1"
    assert tk.table_name == "copilot_knowledge"
    assert tk.tenant_filter == {"equipe_id": "e1"}
    # the underlying vector store was configured for the knowledge table
    assert isinstance(tk.vector_db, _FakePgVector)
    assert tk.vector_db.kwargs["table_name"] == "copilot_knowledge"


def test_build_knowledge_degrades_when_deps_absent(monkeypatch):
    # Simulate Agno knowledge deps not installed → no crash, vector_db is None.
    monkeypatch.setattr(knowledge, "PgVector", None)
    tk = knowledge.build_knowledge("e2")
    assert tk.equipe_id == "e2"
    assert tk.table_name == "copilot_knowledge"
    assert tk.vector_db is None


@pytest.mark.asyncio
async def test_ingest_inserts_tenant_scoped_row(monkeypatch):
    monkeypatch.setattr(knowledge, "PgVector", _FakePgVector)
    monkeypatch.setattr(knowledge, "OpenAIEmbedder", None)  # no embedder → null embedding

    rows = []

    class _Client:
        def table(self, _):
            return self

        def insert(self, row):
            rows.append(row)
            return self

        def execute(self):
            class _R:
                data = None
                error = None

            return _R()

    tk = knowledge.build_knowledge("e1")
    await tk.ingest(_Client(), source="faq", content="12 kWp custa X")

    assert rows[0]["equipe_id"] == "e1"
    assert rows[0]["source"] == "faq"
    assert rows[0]["content"] == "12 kWp custa X"
