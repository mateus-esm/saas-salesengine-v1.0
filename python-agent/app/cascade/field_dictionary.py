"""Field dictionaries — the bounded vocabulary the Enricher may write into.

Two namespaces:
  • pipeline fields — read live from ``pipelines.custom_fields_schema`` (per pipeline)
  • contact fields  — a canonical baseline set (Wave 1). Wave 2 makes this
                      tenant-editable and adds richer descriptions.

The Enricher matches each extracted fact against these dictionaries and MAY ONLY
write into a field that appears here. No match → no write. This is the single
guarantee that the agent never invents a field in the contact base or a pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FieldDef:
    key: str            # contact: snake_case key; pipeline: the field_id
    label: str
    type: str
    description: str | None = None


# Canonical contact-base fields (Wave 1 baseline; Wave 2 → tenant-editable).
CANONICAL_CONTACT_FIELDS: tuple[FieldDef, ...] = (
    FieldDef("cargo", "Cargo", "text", "Cargo/função do contato (ex.: CFO, comprador)."),
    FieldDef("empresa", "Empresa", "text", "Empresa/organização do contato."),
    FieldDef("segmento", "Segmento", "text", "Segmento ou setor de atuação."),
    FieldDef("decisor", "É decisor", "boolean", "Se o contato é o tomador de decisão."),
    FieldDef("orcamento", "Orçamento", "currency", "Verba/orçamento mencionado pelo contato."),
    FieldDef("dores", "Dores", "text", "Dores/problemas relatados pelo contato."),
)


def contact_dictionary(client: Any, equipe_id: str) -> dict[str, FieldDef]:
    """Tenant contact-field dictionary from equipes.contact_fields_schema.

    Falls back to the canonical baseline when the tenant has not defined any.
    """
    try:
        resp = (
            client.table("equipes")
            .select("contact_fields_schema")
            .eq("id", equipe_id)
            .limit(1)
            .execute()
        )
        rows = getattr(resp, "data", None) or []
        if isinstance(rows, dict):
            rows = [rows]
        schema = (rows[0].get("contact_fields_schema") if rows else None) or []
    except Exception:
        schema = []

    out: dict[str, FieldDef] = {}
    for field in schema:
        if field.get("is_deleted"):
            continue
        key = field.get("key")
        if not key:
            continue
        out[key] = FieldDef(
            key=key,
            label=field.get("label") or key,
            type=field.get("type") or "text",
            description=field.get("description"),
        )
    if out:
        return out
    return {f.key: f for f in CANONICAL_CONTACT_FIELDS}


def pipeline_dictionary(
    client: Any, equipe_id: str, pipeline_id: str | None
) -> dict[str, FieldDef]:
    """Live pipeline-field dictionary keyed by field_id, from custom_fields_schema.

    Returns ``{}`` when there is no pipeline or no matching row.
    """
    if not pipeline_id:
        return {}

    resp = (
        client.table("pipelines")
        .select("custom_fields_schema")
        .eq("equipe_id", equipe_id)
        .eq("id", pipeline_id)
        .limit(1)
        .execute()
    )
    rows = getattr(resp, "data", None) or []
    if isinstance(rows, dict):
        rows = [rows]
    if not rows:
        return {}

    schema = rows[0].get("custom_fields_schema") or []
    out: dict[str, FieldDef] = {}
    for field in schema:
        if field.get("is_deleted"):
            continue
        field_id = field.get("field_id")
        if not field_id:
            continue
        out[field_id] = FieldDef(
            key=field_id,
            label=field.get("label") or field.get("key") or field_id,
            type=field.get("type") or "text",
            description=field.get("description"),
        )
    return out
