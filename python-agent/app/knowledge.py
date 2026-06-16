"""G2 — Per-tenant PgVector Knowledge factory (RAG foundation).

Wired into NO agent this sprint. It exists so Sprint 6.2's in-house
conversational agent (see ``docs/INBOUND_AGENT_CONTRACT.md``) can do tenant-
scoped hybrid retrieval over ``copilot_knowledge``.

Degrades gracefully when the Agno knowledge/vector deps are not installed: the
factory still returns a ``TenantKnowledge`` (with ``vector_db=None``) so imports
and unit tests never fail on a missing optional dependency.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.config import get_settings

# Optional Agno deps — resolved best-effort. Tests monkeypatch these names.
try:  # pragma: no cover - import availability depends on the environment
    from agno.vectordb.pgvector import PgVector, SearchType
except Exception:  # pragma: no cover
    PgVector = None  # type: ignore[assignment]
    SearchType = None  # type: ignore[assignment]

try:  # pragma: no cover
    from agno.knowledge.embedder.openai import OpenAIEmbedder
except Exception:  # pragma: no cover
    try:
        from agno.embedder.openai import OpenAIEmbedder  # older layout
    except Exception:
        OpenAIEmbedder = None  # type: ignore[assignment]

KNOWLEDGE_TABLE = "copilot_knowledge"
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536


@dataclass
class TenantKnowledge:
    """A tenant-scoped handle over the shared ``copilot_knowledge`` table."""

    equipe_id: str
    table_name: str
    tenant_filter: dict[str, Any]
    vector_db: Any  # an Agno PgVector instance, or None when deps are absent

    async def ingest(self, client: Any, *, source: str, content: str,
                     metadata: dict | None = None) -> None:
        """Insert one tenant-scoped knowledge row.

        Computes an embedding when an embedder is available; otherwise stores the
        row with a null embedding (backfilled later). Always carries equipe_id.
        """
        import asyncio

        embedding = None
        if OpenAIEmbedder is not None and self.vector_db is not None:
            try:
                embedder = OpenAIEmbedder(id=EMBED_MODEL)
                get_embedding = getattr(embedder, "get_embedding", None)
                if callable(get_embedding):
                    embedding = await asyncio.to_thread(get_embedding, content)
            except Exception:
                embedding = None

        row = {
            "equipe_id": self.equipe_id,
            "source": source,
            "content": content,
            "metadata": metadata or {},
        }
        if embedding is not None:
            row["embedding"] = embedding

        await asyncio.to_thread(
            lambda: client.table(KNOWLEDGE_TABLE).insert(row).execute()
        )


def build_knowledge(equipe_id: str) -> TenantKnowledge:
    """Build a per-tenant hybrid-search knowledge handle over copilot_knowledge."""
    tenant_filter = {"equipe_id": equipe_id}
    vector_db: Any = None

    if PgVector is not None:
        embedder = OpenAIEmbedder(id=EMBED_MODEL) if OpenAIEmbedder is not None else None
        search_type = getattr(SearchType, "hybrid", "hybrid") if SearchType is not None else "hybrid"
        try:
            db_url = get_settings().database_url
        except Exception:
            db_url = None
        vector_db = PgVector(
            table_name=KNOWLEDGE_TABLE,
            db_url=db_url,
            search_type=search_type,
            embedder=embedder,
        )

    return TenantKnowledge(
        equipe_id=equipe_id,
        table_name=KNOWLEDGE_TABLE,
        tenant_filter=tenant_filter,
        vector_db=vector_db,
    )
