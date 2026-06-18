# Copilot Cockpit — Wave 1: The Precision Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Copilot's "arms" trustworthy — enrich the right field in the right place, never invent a field, attach files to file fields, scope notes to the deal — and confirm the engine runs end-to-end in prod.

**Architecture:** This is Wave 1 of the 4-wave Copilot Cockpit foundation (design spec: `docs/superpowers/specs/2026-06-18-copilot-cockpit-foundation-design.md`). It hardens the **execution spine** of the existing Agno cascade: a new field-dictionary module bounds what the Enricher may write; the Enricher becomes a dictionary-bounded **router** (extract → match → route, no-match → drop); a new `attach_file` verb + `file` field type land media on the right field; notes gain an `opportunity_id` so they live on the deal. No new UI — that is Wave 3.

**Tech Stack:** Python 3.12 + FastAPI + Agno 2.6 (service in `python-agent/`); Supabase Postgres (SQL migrations in `supabase/migrations/`); React + Vite + TypeScript frontend (`src/`); pytest backend tests; `supabase-py` table client.

## Global Constraints

- Backend test gate (run from `python-agent/`): `python -m pytest tests/ -q` — all pass, 0 new failures.
- Frontend build gate (run from repo root): `npm run build` — must be green (tsc passing ≠ build passing; the build is the real gate).
- All DB writes go through `CoreTableSkill` and are tenant-scoped: every query is filtered by `equipe_id` (the skill enforces this; never bypass it).
- The agent MUST NOT create tables or invent fields. A fact may only be written to a field that already exists in a dictionary (`field_dictionary.py`). No match → no write.
- Custom field keys are lowercase `snake_case` (enforced by `CustomFieldBlueprint.snake_case`).
- PT-BR for all user-/LLM-facing strings, matching the existing cascade convention.
- Migrations are additive only (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`); never drop or rewrite existing columns.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `python-agent/app/cascade/field_dictionary.py` | The bounded vocabulary: load pipeline-field dict (live from `custom_fields_schema`) + canonical contact-field dict | **Create** |
| `python-agent/tests/test_field_dictionary.py` | Tests for the dictionary loader | **Create** |
| `python-agent/app/schemas.py` | Add `"file"` to `CustomFieldType` | Modify |
| `python-agent/app/skills/core_table.py` | Add `attach_file` verb; add `opportunity_id` param to `add_note` | Modify |
| `python-agent/tests/test_core_table.py` | Tests for `attach_file` + deal-scoped `add_note` | Modify |
| `python-agent/app/cascade/enricher.py` | Rewrite as dictionary-bounded router (set_field / set_contact_field / attach_file, drop unmatched) | Modify |
| `python-agent/tests/test_enricher.py` | Replace assertions with bounded-router behavior | Modify |
| `python-agent/app/cascade/agno_workflow.py` | Pass `opportunity_id` to the "notify" `add_note` call | Modify |
| `src/types/pipelines.ts` | Add `"file"` to FE `CustomFieldType` | Modify |
| `supabase/migrations/20260618000000_sprint64_note_opportunity_scope.sql` | Add nullable `opportunity_id` to `lead_activities` | **Create** |

**Dependency order:** T1 (dictionary) → T2 (attach_file + file type) → T3 (enricher router, consumes T1+T2) → T4 (deal-scoped notes) → T5 (prod deploy verification, human/infra).

---

### Task 1: Field dictionary module

**Files:**
- Create: `python-agent/app/cascade/field_dictionary.py`
- Test: `python-agent/tests/test_field_dictionary.py`

**Interfaces:**
- Produces:
  - `FieldDef` dataclass: `key: str`, `label: str`, `type: str`, `description: str | None = None` (frozen).
  - `CANONICAL_CONTACT_FIELDS: tuple[FieldDef, ...]`
  - `contact_dictionary() -> dict[str, FieldDef]` — keyed by `snake_case` key.
  - `pipeline_dictionary(client, equipe_id: str, pipeline_id: str | None) -> dict[str, FieldDef]` — keyed by `field_id`; reads `pipelines.custom_fields_schema`; skips `is_deleted`; returns `{}` when `pipeline_id` is falsy or no row.

- [ ] **Step 1: Write the failing tests**

Create `python-agent/tests/test_field_dictionary.py`:

```python
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cascade import field_dictionary as fd


class _Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def limit(self, *_):
        return self

    def execute(self):
        data = self.client.selects.get(self.table, [])
        data = data.pop(0) if data else []
        return SimpleNamespace(data=data, error=None)


class _Client:
    def __init__(self, selects=None):
        self.selects = selects or {}

    def table(self, table):
        return _Query(self, table)


def test_contact_dictionary_is_canonical_and_keyed_by_key():
    d = fd.contact_dictionary()
    assert "cargo" in d
    assert d["cargo"].type == "text"
    # Every canonical field is keyed by its own snake_case key.
    assert all(k == v.key for k, v in d.items())


def test_pipeline_dictionary_loads_live_schema_and_skips_deleted():
    client = _Client({
        "pipelines": [[{
            "custom_fields_schema": [
                {"field_id": "f1", "key": "valor_conta", "label": "Valor da Conta",
                 "type": "currency", "description": "Valor mensal da conta de energia."},
                {"field_id": "f2", "key": "conta_energia", "label": "Conta de Energia",
                 "type": "file"},
                {"field_id": "f3", "key": "old", "label": "Old", "type": "text",
                 "is_deleted": True},
            ]
        }]]
    })
    d = fd.pipeline_dictionary(client, "team-1", "pipe-1")
    assert set(d.keys()) == {"f1", "f2"}          # f3 skipped (is_deleted)
    assert d["f1"].label == "Valor da Conta"
    assert d["f2"].type == "file"


def test_pipeline_dictionary_empty_when_no_pipeline_id():
    assert fd.pipeline_dictionary(object(), "team-1", None) == {}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_field_dictionary.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.cascade.field_dictionary'`

- [ ] **Step 3: Implement the module**

Create `python-agent/app/cascade/field_dictionary.py`:

```python
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


def contact_dictionary() -> dict[str, FieldDef]:
    """Canonical contact fields keyed by their snake_case key."""
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/test_field_dictionary.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add python-agent/app/cascade/field_dictionary.py python-agent/tests/test_field_dictionary.py
git commit -m "feat(copilot): field dictionary loader (pipeline live + canonical contact)"
```

---

### Task 2: `attach_file` verb + `file` field type

**Files:**
- Modify: `python-agent/app/schemas.py` (add `"file"` to `CustomFieldType`)
- Modify: `python-agent/app/skills/core_table.py` (add `attach_file`)
- Modify: `src/types/pipelines.ts` (add `"file"` to FE `CustomFieldType`)
- Test: `python-agent/tests/test_core_table.py`

**Interfaces:**
- Produces on `CoreTableSkill`:
  `async def attach_file(self, opportunity_id: str, field_id: str, file_url: str, file_name: str | None = None) -> ActionResult`
  — writes `{"url": file_url, "name": file_name}` into `opportunities.custom_data[field_id]`; returns `ActionResult(success=False, error="opportunity_not_found")` when the opp is missing.

- [ ] **Step 1: Write the failing test**

Add to `python-agent/tests/test_core_table.py` (the `FakeClient`, `FakeQuery`, and `filters_for` helpers already exist at the top of that file):

```python
@pytest.mark.asyncio
async def test_attach_file_writes_file_ref_into_custom_data():
    client = FakeClient(
        {
            "opportunities": [
                [{"id": "opp-1", "equipe_id": "team-1", "custom_data": {"keep": "yes"}}],
            ]
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.attach_file("opp-1", "f_conta", "https://x/conta.jpg", "conta.jpg")

    assert result.success is True
    update = client.updates[0]
    assert update.table == "opportunities"
    assert ("equipe_id", "team-1") in filters_for(update)
    assert update.payload["custom_data"] == {
        "keep": "yes",
        "f_conta": {"url": "https://x/conta.jpg", "name": "conta.jpg"},
    }


@pytest.mark.asyncio
async def test_attach_file_missing_opportunity_returns_error():
    client = FakeClient({"opportunities": [[]]})
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.attach_file("nope", "f_conta", "https://x/c.jpg")

    assert result.success is False
    assert result.error == "opportunity_not_found"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_core_table.py::test_attach_file_writes_file_ref_into_custom_data -v`
Expected: FAIL with `AttributeError: 'CoreTableSkill' object has no attribute 'attach_file'`

- [ ] **Step 3: Add `attach_file` to `CoreTableSkill`**

In `python-agent/app/skills/core_table.py`, add this method right after `set_field` (after line 121):

```python
    async def attach_file(
        self, opportunity_id: str, field_id: str, file_url: str, file_name: str | None = None
    ) -> ActionResult:
        try:
            opportunity = self._fetch_one("opportunities", {"id": opportunity_id}, "id,equipe_id,custom_data")
            if opportunity is None:
                return ActionResult(success=False, error="opportunity_not_found")

            custom_data = dict(opportunity.get("custom_data") or {})
            custom_data[field_id] = {"url": file_url, "name": file_name}
            self._update("opportunities", {"custom_data": custom_data}, {"id": opportunity_id})
            return ActionResult(success=True, detail={"action": "attach_file", "field_id": field_id})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "attach_file"})
```

- [ ] **Step 4: Add `"file"` to the backend `CustomFieldType`**

In `python-agent/app/schemas.py`, add `"file"` to the `CustomFieldType` Literal (after `"text",` on line 8):

```python
CustomFieldType = Literal[
    "text",
    "file",
    "number",
    "currency",
    "date",
    "boolean",
    "select",
    "multi_select",
    "url",
    "phone",
    "address",
    "property_ref",
    "company_ref",
    "contact_ref",
]
```

- [ ] **Step 5: Add `"file"` to the frontend `CustomFieldType`**

In `src/types/pipelines.ts`, add `"file"` to the union (after `| "text"` on line 5):

```typescript
export type CustomFieldType =
  | "text"
  | "file"
  | "number"
  | "currency"
  | "date"
  | "boolean"
  | "select"
  // Sprint 4 EPIC 1 additions
  | "multi_select"
  | "url"
  | "phone"
  | "address"
  | "property_ref"
  | "company_ref"
  | "contact_ref";
```

- [ ] **Step 6: Run the backend tests + frontend build**

Run: `python -m pytest tests/test_core_table.py -v`
Expected: PASS (new tests + existing tests green)

Run (repo root): `npm run build`
Expected: build succeeds (the new union member type-checks)

- [ ] **Step 7: Commit**

```bash
git add python-agent/app/skills/core_table.py python-agent/app/schemas.py python-agent/tests/test_core_table.py src/types/pipelines.ts
git commit -m "feat(copilot): attach_file verb + file custom-field type"
```

---

### Task 3: Enricher becomes a dictionary-bounded router

**Files:**
- Modify: `python-agent/app/cascade/enricher.py`
- Test: `python-agent/tests/test_enricher.py`

**Interfaces:**
- Consumes: `field_dictionary.contact_dictionary()`, `field_dictionary.pipeline_dictionary(client, equipe_id, pipeline_id)`, `FieldDef` (Task 1); `CoreTableSkill.attach_file` verb name (Task 2).
- Produces: `enrich(...)` keeps its signature `async def enrich(*, ctx, conversation, lead, opportunity, rules, client) -> ActionPlan` and the same call site in `agno_workflow.py`. Behavior change: every returned action is **validated against the dictionaries**; unmatched actions are dropped; `set_field`/`attach_file` target a real `field_id`; `set_contact_field` targets a real canonical `key`; `attach_file` requires the target field's `type == "file"`.

- [ ] **Step 1: Replace the enricher tests with bounded-router behavior**

Replace the entire contents of `python-agent/tests/test_enricher.py` with:

```python
"""Tests for app.cascade.enricher — dictionary-bounded enrichment router.

All Agno/LLM/DB calls are monkeypatched. No live connections.
"""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.schemas import ActionPlan, PlannedAction
from app.cascade import enricher
from app.security import TenantContext


def _ctx() -> TenantContext:
    return TenantContext(equipe_id="team-1", actor_user_id="u1", role="authenticated")


def _fake_settings():
    s = MagicMock()
    s.doorman_model = "gpt-4o-mini"
    return s


class _Query:
    def __init__(self, client, table):
        self.client, self.table = client, table

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def limit(self, *_):
        return self

    def execute(self):
        data = self.client.selects.get(self.table, [])
        data = data.pop(0) if data else []
        return SimpleNamespace(data=data, error=None)


class _Client:
    def __init__(self, selects=None):
        self.selects = selects or {}

    def table(self, table):
        return _Query(self, table)


def _pipeline_client():
    return _Client({
        "pipelines": [[{
            "custom_fields_schema": [
                {"field_id": "f_valor", "key": "valor_conta", "label": "Valor da Conta",
                 "type": "currency", "description": "Valor mensal da conta."},
                {"field_id": "f_conta", "key": "conta_energia", "label": "Conta de Energia",
                 "type": "file"},
            ]
        }]]
    })


def _patch_run(monkeypatch, plan: ActionPlan):
    async def fake_run(agent, message):
        return type("R", (), {"content": plan})()
    monkeypatch.setattr(enricher, "_arun_agent", fake_run)


@pytest.mark.asyncio
async def test_keeps_contact_fact_in_canonical_dictionary(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)
    _patch_run(monkeypatch, ActionPlan(
        relevant=True, confidence=0.8, reason="cargo",
        actions=[PlannedAction(verb="set_contact_field", args={"key": "cargo", "value": "CFO"})]))

    plan = await enricher.enrich(
        ctx=_ctx(), conversation="sou o CFO", lead={"id": "l1"},
        opportunity={"id": "o1"}, rules={}, client=object())

    assert plan.relevant is True
    assert plan.actions[0].args["key"] == "cargo"


@pytest.mark.asyncio
async def test_drops_contact_fact_not_in_dictionary(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)
    _patch_run(monkeypatch, ActionPlan(
        relevant=True, confidence=0.8, reason="invented",
        actions=[PlannedAction(verb="set_contact_field", args={"key": "cor_favorita", "value": "azul"})]))

    plan = await enricher.enrich(
        ctx=_ctx(), conversation="minha cor favorita é azul", lead={"id": "l1"},
        opportunity={"id": "o1"}, rules={}, client=object())

    assert plan.relevant is False          # invented field dropped → noop
    assert plan.actions == []


@pytest.mark.asyncio
async def test_keeps_pipeline_field_present_in_schema(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)
    _patch_run(monkeypatch, ActionPlan(
        relevant=True, confidence=0.8, reason="valor",
        actions=[PlannedAction(verb="set_field", args={"field_id": "f_valor", "value": "1000"})]))

    plan = await enricher.enrich(
        ctx=_ctx(), conversation="minha conta é 1000 reais", lead={"id": "l1"},
        opportunity={"id": "o1", "pipeline_id": "p1"}, rules={}, client=_pipeline_client())

    assert plan.actions[0].verb == "set_field"
    assert plan.actions[0].args["field_id"] == "f_valor"


@pytest.mark.asyncio
async def test_attach_file_only_for_file_type_field(monkeypatch):
    monkeypatch.setattr(enricher, "get_settings", _fake_settings)
    _patch_run(monkeypatch, ActionPlan(
        relevant=True, confidence=0.8, reason="foto da conta",
        actions=[
            PlannedAction(verb="attach_file", args={"field_id": "f_conta", "file_url": "https://x/c.jpg"}),
            PlannedAction(verb="attach_file", args={"field_id": "f_valor", "file_url": "https://x/c.jpg"}),
        ]))

    plan = await enricher.enrich(
        ctx=_ctx(), conversation="segue foto da conta", lead={"id": "l1"},
        opportunity={"id": "o1", "pipeline_id": "p1"}, rules={}, client=_pipeline_client())

    # f_conta is type "file" → kept; f_valor is currency → dropped.
    assert len(plan.actions) == 1
    assert plan.actions[0].args["field_id"] == "f_conta"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_enricher.py -v`
Expected: FAIL — the current enricher ignores the dictionaries, so `test_drops_contact_fact_not_in_dictionary` and `test_attach_file_only_for_file_type_field` fail (and the pipeline test fails because the current code doesn't load the schema).

- [ ] **Step 3a: Add the dictionary import**

In `python-agent/app/cascade/enricher.py`, add this import after `from app.security import TenantContext` (line 16):

```python
from app.cascade.field_dictionary import FieldDef, contact_dictionary, pipeline_dictionary
```

- [ ] **Step 3b: Replace `_ALLOWED_VERBS`, `_noop`, `_valid_action`, `_sanitize_plan`**

Replace the contiguous block (lines ~63–89: `_ALLOWED_VERBS`, then `_noop`, then `_valid_action`, then `_sanitize_plan`) — this replaces the *only* existing `_noop` definition, so no duplicate is created — with:

```python
_ALLOWED_VERBS = frozenset({"set_field", "set_contact_field", "attach_file"})


def _noop(reason: str) -> ActionPlan:
    return ActionPlan(relevant=False, actions=[], confidence=0.0, reason=reason)


def _valid_action(
    action: PlannedAction,
    *,
    pipeline_fields: dict[str, FieldDef],
    contact_fields: dict[str, FieldDef],
) -> bool:
    if action.skill != "core_table" or action.verb not in _ALLOWED_VERBS:
        return False

    if action.verb == "set_contact_field":
        key = action.args.get("key")
        return bool(key) and key in contact_fields and "value" in action.args

    if action.verb == "set_field":
        field_id = action.args.get("field_id")
        return bool(field_id) and field_id in pipeline_fields and "value" in action.args

    # attach_file: target must be a real pipeline field of type "file".
    field_id = action.args.get("field_id")
    return (
        bool(field_id)
        and field_id in pipeline_fields
        and pipeline_fields[field_id].type == "file"
        and bool(action.args.get("file_url"))
    )


def _sanitize_plan(
    plan: ActionPlan,
    *,
    pipeline_fields: dict[str, FieldDef],
    contact_fields: dict[str, FieldDef],
) -> ActionPlan:
    actions = [
        a for a in plan.actions
        if _valid_action(a, pipeline_fields=pipeline_fields, contact_fields=contact_fields)
    ]
    if not actions:
        return _noop(f"no valid enrichment actions. Motivo original: {plan.reason}")
    return ActionPlan(
        relevant=plan.relevant,
        actions=actions,
        automation_kind=plan.automation_kind,
        urgency=plan.urgency,
        confidence=plan.confidence,
        reason=plan.reason,
    )
```

- [ ] **Step 3c: Add the prompt builder**

Immediately after the `_SYSTEM_PT` string constant (it ends near line 61), add:

```python
def _render_fields(title: str, fields: dict[str, FieldDef], id_label: str) -> str:
    if not fields:
        return f"{title}: (nenhum campo disponível)\n"
    lines = [f"{title}:"]
    for ident, field in fields.items():
        desc = f" — {field.description}" if field.description else ""
        lines.append(f'  - {id_label}="{ident}" | label="{field.label}" | tipo={field.type}{desc}')
    return "\n".join(lines) + "\n"


def _build_system_prompt(
    pipeline_fields: dict[str, FieldDef], contact_fields: dict[str, FieldDef]
) -> str:
    return (
        _SYSTEM_PT
        + "\n\nCAMPOS DISPONÍVEIS (use APENAS estes — nunca invente um campo):\n"
        + _render_fields("CAMPOS DA OPORTUNIDADE (verbo set_field, use field_id)", pipeline_fields, "field_id")
        + _render_fields("CAMPOS DO CONTATO (verbo set_contact_field, use key)", contact_fields, "key")
        + "Para anexar um arquivo/foto a um campo do tipo 'file', use attach_file "
          "com { field_id, file_url }.\n"
    )
```

- [ ] **Step 3d: Make `_build_agent` accept a prompt**

Replace the `_build_agent` signature line and its `"system_message": _SYSTEM_PT,` line so it reads:

```python
def _build_agent(*, model_id: str, lead_id: str, system_prompt: str) -> Agent:
    """Build an Agno Agent with optional Lead Memory wiring."""
    agent_kwargs: dict[str, Any] = {
        "model": build_chat_model(model_id),
        "output_schema": ActionPlan,
        "system_message": system_prompt,
        "telemetry": False,
        "use_json_mode": True,
    }

    storage = _get_storage()
    if storage is not None:
        agent_kwargs["db"] = storage
        agent_kwargs["enable_agentic_memory"] = True
        agent_kwargs["user_id"] = lead_id

    return Agent(**agent_kwargs)
```

- [ ] **Step 3e: Rewrite the `enrich(...)` body**

Replace the whole `enrich(...)` function (lines 142–173) with:

```python
async def enrich(
    *,
    ctx: TenantContext,
    conversation: str,
    lead: dict | None,
    opportunity: dict | None,
    rules: dict | None,
    client: Any,
) -> ActionPlan:
    """Extract CRM enrichment actions, routed to the field that owns each fact.

    Every action is validated against the live pipeline-field dictionary and the
    canonical contact-field dictionary. A fact that matches no field is dropped —
    the enricher never invents a field. Never raises.
    """
    rules = rules or {}
    lead = lead or {}
    opportunity = opportunity or {}
    lead_id: str = lead.get("id") or ""
    pipeline_id = opportunity.get("pipeline_id")

    contact_fields = contact_dictionary()
    try:
        pipeline_fields = pipeline_dictionary(client, ctx.equipe_id, pipeline_id)
    except Exception:
        pipeline_fields = {}

    model_id: str = rules.get("doorman_model") or get_settings().doorman_model
    system_prompt = _build_system_prompt(pipeline_fields, contact_fields)

    try:
        agent = _build_agent(model_id=model_id, lead_id=lead_id, system_prompt=system_prompt)
        resp = await _arun_agent(agent, conversation or "")
    except Exception:
        return _noop("enricher unavailable")

    content = getattr(resp, "content", None)
    if isinstance(content, ActionPlan):
        return _sanitize_plan(content, pipeline_fields=pipeline_fields, contact_fields=contact_fields)

    return _noop("no content")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/test_enricher.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Run the full backend suite (catch regressions)**

Run: `python -m pytest tests/ -q`
Expected: all pass (the `agno_workflow` test stubs `enrich`, so it is unaffected).

- [ ] **Step 6: Commit**

```bash
git add python-agent/app/cascade/enricher.py python-agent/tests/test_enricher.py
git commit -m "feat(copilot): enricher is a dictionary-bounded router (no invented fields)"
```

---

### Task 4: Deal-scoped notes

**Files:**
- Create: `supabase/migrations/20260618000000_sprint64_note_opportunity_scope.sql`
- Modify: `python-agent/app/skills/core_table.py` (`add_note` gains `opportunity_id`)
- Modify: `python-agent/app/cascade/agno_workflow.py` (pass `opportunity_id` to the notify `add_note`)
- Test: `python-agent/tests/test_core_table.py`

**Interfaces:**
- Produces: `add_note(self, lead_id: str, content: str, opportunity_id: str | None = None) -> ActionResult` — inserts `opportunity_id` into the `lead_activities` payload **only when provided** (keeps existing lead-only calls valid). The sequential executor auto-injects `opportunity_id` because the param name matches (`executor._dispatch`), so plan-driven `add_note` actions become deal-scoped for free.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260618000000_sprint64_note_opportunity_scope.sql`:

```sql
-- Sprint 6.4 · Wave 1 — deal-scoped notes.
-- lead_activities notes were keyed by lead only; the Copilot writes notes about a
-- specific opportunity, so they must be scoped to the deal too. Additive + nullable
-- (legacy lead-only notes keep working).

ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS opportunity_id uuid
    REFERENCES public.opportunities(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lead_activities.opportunity_id IS
  'Sprint 6.4: when a note belongs to a specific deal, scope it to that opportunity. NULL = contact-level note.';

CREATE INDEX IF NOT EXISTS idx_lead_activities_opportunity
  ON public.lead_activities (opportunity_id)
  WHERE opportunity_id IS NOT NULL;
```

- [ ] **Step 2: Write the failing test**

Add to `python-agent/tests/test_core_table.py`:

```python
@pytest.mark.asyncio
async def test_add_note_scopes_to_opportunity_when_given():
    client = FakeClient({"leads": [[{"id": "lead-1", "equipe_id": "team-1"}]]})
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.add_note("lead-1", "Cliente pediu proposta", opportunity_id="opp-9")

    assert result.success is True
    insert = client.inserts[0]
    assert insert.table == "lead_activities"
    assert insert.payload["opportunity_id"] == "opp-9"
    assert insert.payload["lead_id"] == "lead-1"


@pytest.mark.asyncio
async def test_add_note_without_opportunity_stays_contact_level():
    client = FakeClient({"leads": [[{"id": "lead-1", "equipe_id": "team-1"}]]})
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.add_note("lead-1", "Nota geral do contato")

    assert result.success is True
    insert = client.inserts[0]
    assert "opportunity_id" not in insert.payload      # legacy lead-only note
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `python -m pytest tests/test_core_table.py::test_add_note_scopes_to_opportunity_when_given -v`
Expected: FAIL — `add_note() got an unexpected keyword argument 'opportunity_id'`

- [ ] **Step 4: Add the `opportunity_id` param to `add_note`**

In `python-agent/app/skills/core_table.py`, replace the `add_note` method (lines 152–167) with:

```python
    async def add_note(self, lead_id: str, content: str, opportunity_id: str | None = None) -> ActionResult:
        try:
            lead = self._fetch_one("leads", {"id": lead_id}, "id,equipe_id")
            if lead is None:
                return ActionResult(success=False, error="lead_not_found")

            payload = {
                "lead_id": lead_id,
                "tipo": "note",
                "descricao": _interpolate(content, lead_id=lead_id),
                "metadata": {"actor": self.actor},
            }
            if opportunity_id:
                payload["opportunity_id"] = opportunity_id
            self._insert("lead_activities", payload)
            return ActionResult(success=True, detail={"action": "add_note"})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "add_note"})
```

- [ ] **Step 5: Pass `opportunity_id` from the workflow's notify path**

In `python-agent/app/cascade/agno_workflow.py`, search for `add_note`. If a "notify" call exists (below-threshold branch), change it to pass the in-scope opportunity id (`opp_id`):

```python
    await skill.add_note(
        lead_id,
        f"{note_prefix}Ação pendente de aprovação: {decision.reason}",
        opportunity_id=opp_id,
    )
```

Also update the same call in `python-agent/app/cascade/workflow.py` (legacy path, around line 398) the same way — `opp_id` is in scope there too. If a module has no such `add_note` call, skip it.

- [ ] **Step 6: Run the backend tests**

Run: `python -m pytest tests/test_core_table.py tests/test_workflow.py tests/test_agno_workflow.py -v`
Expected: PASS (new note tests pass; workflow tests unaffected — when `opp_id` is `None` the note stays contact-level).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260618000000_sprint64_note_opportunity_scope.sql python-agent/app/skills/core_table.py python-agent/app/cascade/agno_workflow.py python-agent/app/cascade/workflow.py python-agent/tests/test_core_table.py
git commit -m "feat(copilot): deal-scoped notes (lead_activities.opportunity_id)"
```

---

### Task 5: Confirm the engine runs end-to-end in prod (HUMAN / INFRA — Mateus)

This task closes the "Sync feels dead" gap. It is **infra, not code** — Mateus runs it on the VPS/Dokploy + remote Supabase. No automated test; verification is by observation. (See design spec §1 Bug 1 and the Sprint 6.1 execution status H4/H5.)

- [ ] **Step 1: Confirm whether the streaming path is active.** The HUD reads `GET /api/v1/sync/stream`; the workflow path runs only when `COPILOT_WORKFLOW_ENABLED=true`. Check the Dokploy env for `agent.soloventures.com.br`. If the flag is `false`, the legacy `/sync` works but the new streaming/run-events path does not — confirm which path the deployed frontend calls.

- [ ] **Step 2: Apply the pending migrations to the remote DB** (the `20260614000*` run_events/credit/router/knowledge set, plus this wave's `20260618000000_sprint64_note_opportunity_scope.sql`). URL-encode the DB password in the connection string.

- [ ] **Step 3: Flip `COPILOT_WORKFLOW_ENABLED=true`** in Dokploy only after the migrations are applied; redeploy the agent service.

- [ ] **Step 4: Smoke-test the alive feeling.** Open a deal on an agent-enabled team, click ⚡ Sync, and confirm the `TelemetryHUD` drawer opens and streams events (`action_start` / `action_done` / `done`). If the drawer opens but is empty, capture the browser Network tab for `/api/v1/sync/stream` (status + body) and the agent logs — that distinguishes a deploy gap (this task) from a frontend wiring bug (defer to Wave 4 design).

- [ ] **Step 5: Record the result** in the Wave 4 section planning notes (does Sync feel alive end-to-end? Y/N + evidence), so Wave 4 (Control Room + HUD) is designed against reality, not assumption.

---

## Wave hand-off

Wave 1 is done when `python -m pytest tests/ -q` is fully green, `npm run build` is green, and Task 5's smoke-test result is recorded. **Do not plan Wave 2 (training-via-descriptions) until then** — per the spec's chaining rule (§9). Wave 2 will make the contact-field dictionary tenant-editable and add `description` to stages, building directly on `field_dictionary.py` from Task 1.
