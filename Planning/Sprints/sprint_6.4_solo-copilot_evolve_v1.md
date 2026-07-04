# Copilot Cockpit — Full Implementation Plan (Waves 1–4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

> **Execution order:** Implement one wave at a time, in order (W1 → W2 → W3 →
> W4). Each wave declares what it consumes from the previous one. A wave's tasks
> are not started until the previous wave is implemented and verified (backend
> gate `python -m pytest tests/ -q`; frontend gate `npm run build`). All four
> waves are documented here at the user's request, but they remain sequentially
> dependent.

> **STATUS (2026-06-18):** **Wave 1 is IMPLEMENTED + reviewed** on branch
> `sprint6.4-wave1-precision-spine` (commits `87437ec`→`075c04c`; full suite 245
> passed; whole-branch review clean). Wave 1 Task 5 (prod deploy/flag) is
> pending the human. Waves 2–4 below are not yet started.

**Goal (whole plan):** Evolve the Solo Copilot into the **Copilot Cockpit** — a
configurable team of named copilots over the existing Tower→Floor→Worker
cascade, with a precision execution spine (W1), training sourced from CRM
descriptions (W2), a top-level config section + autonomy dial + humanized
approvals (W3), and a live observability Control Room (W4).

**Architecture:** Three frontend personas (🗗 Chat Copilot, 📇 Base de Contatos
Copilot, 🏭 Pipeline Copilot) map onto the existing backend agents
(Tower/Floor/Worker). Cognition (the Enricher routes; never writes) is separated
from execution (the arms write, dictionary-bounded). Full design:
`docs/superpowers/specs/2026-06-18-copilot-cockpit-foundation-design.md`.

---

## WAVE 1 — The Precision Spine

**Goal:** Make the Copilot's "arms" trustworthy — enrich the right field in the
right place, never invent a field, attach files to file fields, scope notes to
the deal — and confirm the engine runs end-to-end in prod.

**Wave architecture:** Hardens the **execution spine** of the existing Agno
cascade: a new field-dictionary module bounds what the Enricher may write; the
Enricher becomes a dictionary-bounded **router** (extract → match → route,
no-match → drop); a new `attach_file` verb + `file` field type land media on the
right field; notes gain an `opportunity_id` so they live on the deal. The "never
invent a field" rule is enforced for ALL producers at the executor seam (Task
added during review). No new UI — that is Wave 3.

**Tech Stacapllk:** Python 3.12 + FastAPI + Agno 2.6 (service in
`python-agent/`); Supabase Postgres (SQL migrations in `supabase/migrations/`);
React + Vite + TypeScript frontend (`src/`); pytest backend tests; `supabase-py`
table client.

## Global Constraints

- Backend test gate (run from `python-agent/`): `python -m pytest tests/ -q` —
  all pass, 0 new failures.
- Frontend build gate (run from repo root): `npm run build` — must be green (tsc
  passing ≠ build passing; the build is the real gate).
- All DB writes go through `CoreTableSkill` and are tenant-scoped: every query
  is filtered by `equipe_id` (the skill enforces this; never bypass it).
- The agent MUST NOT create tables or invent fields. A fact may only be written
  to a field that already exists in a dictionary (`field_dictionary.py`). No
  match → no write.
- Custom field keys are lowercase `snake_case` (enforced by
  `CustomFieldBlueprint.snake_case`).
- PT-BR for all user-/LLM-facing strings, matching the existing cascade
  convention.
- Migrations are additive only (`ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`); never drop or rewrite existing columns.

## File Structure

| File                                                                     | Responsibility                                                                                                     | Action     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------- |
| `python-agent/app/cascade/field_dictionary.py`                           | The bounded vocabulary: load pipeline-field dict (live from `custom_fields_schema`) + canonical contact-field dict | **Create** |
| `python-agent/tests/test_field_dictionary.py`                            | Tests for the dictionary loader                                                                                    | **Create** |
| `python-agent/app/schemas.py`                                            | Add `"file"` to `CustomFieldType`                                                                                  | Modify     |
| `python-agent/app/skills/core_table.py`                                  | Add `attach_file` verb; add `opportunity_id` param to `add_note`                                                   | Modify     |
| `python-agent/tests/test_core_table.py`                                  | Tests for `attach_file` + deal-scoped `add_note`                                                                   | Modify     |
| `python-agent/app/cascade/enricher.py`                                   | Rewrite as dictionary-bounded router (set_field / set_contact_field / attach_file, drop unmatched)                 | Modify     |
| `python-agent/tests/test_enricher.py`                                    | Replace assertions with bounded-router behavior                                                                    | Modify     |
| `python-agent/app/cascade/agno_workflow.py`                              | Pass `opportunity_id` to the "notify" `add_note` call                                                              | Modify     |
| `src/types/pipelines.ts`                                                 | Add `"file"` to FE `CustomFieldType`                                                                               | Modify     |
| `supabase/migrations/20260618000000_sprint64_note_opportunity_scope.sql` | Add nullable `opportunity_id` to `lead_activities`                                                                 | **Create** |

**Dependency order:** T1 (dictionary) → T2 (attach_file + file type) → T3
(enricher router, consumes T1+T2) → T4 (deal-scoped notes) → T5 (prod deploy
verification, human/infra).

---

### Task 1: Field dictionary module

**Files:**

- Create: `python-agent/app/cascade/field_dictionary.py`
- Test: `python-agent/tests/test_field_dictionary.py`

**Interfaces:**

- Produces:
  - `FieldDef` dataclass: `key: str`, `label: str`, `type: str`,
    `description: str | None = None` (frozen).
  - `CANONICAL_CONTACT_FIELDS: tuple[FieldDef, ...]`
  - `contact_dictionary() -> dict[str, FieldDef]` — keyed by `snake_case` key.
  - `pipeline_dictionary(client, equipe_id: str, pipeline_id: str | None) -> dict[str, FieldDef]`
    — keyed by `field_id`; reads `pipelines.custom_fields_schema`; skips
    `is_deleted`; returns `{}` when `pipeline_id` is falsy or no row.

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

Run: `python -m pytest tests/test_field_dictionary.py -v` Expected: FAIL with
`ModuleNotFoundError: No module named 'app.cascade.field_dictionary'`

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

Run: `python -m pytest tests/test_field_dictionary.py -v` Expected: PASS (3
passed)

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
  — writes `{"url": file_url, "name": file_name}` into
  `opportunities.custom_data[field_id]`; returns
  `ActionResult(success=False, error="opportunity_not_found")` when the opp is
  missing.

- [ ] **Step 1: Write the failing test**

Add to `python-agent/tests/test_core_table.py` (the `FakeClient`, `FakeQuery`,
and `filters_for` helpers already exist at the top of that file):

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

Run:
`python -m pytest tests/test_core_table.py::test_attach_file_writes_file_ref_into_custom_data -v`
Expected: FAIL with
`AttributeError: 'CoreTableSkill' object has no attribute 'attach_file'`

- [ ] **Step 3: Add `attach_file` to `CoreTableSkill`**

In `python-agent/app/skills/core_table.py`, add this method right after
`set_field` (after line 121):

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

In `python-agent/app/schemas.py`, add `"file"` to the `CustomFieldType` Literal
(after `"text",` on line 8):

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

In `src/types/pipelines.ts`, add `"file"` to the union (after `| "text"` on line
5):

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

Run: `python -m pytest tests/test_core_table.py -v` Expected: PASS (new tests +
existing tests green)

Run (repo root): `npm run build` Expected: build succeeds (the new union member
type-checks)

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

- Consumes: `field_dictionary.contact_dictionary()`,
  `field_dictionary.pipeline_dictionary(client, equipe_id, pipeline_id)`,
  `FieldDef` (Task 1); `CoreTableSkill.attach_file` verb name (Task 2).
- Produces: `enrich(...)` keeps its signature
  `async def enrich(*, ctx, conversation, lead, opportunity, rules, client) -> ActionPlan`
  and the same call site in `agno_workflow.py`. Behavior change: every returned
  action is **validated against the dictionaries**; unmatched actions are
  dropped; `set_field`/`attach_file` target a real `field_id`;
  `set_contact_field` targets a real canonical `key`; `attach_file` requires the
  target field's `type == "file"`.

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

Run: `python -m pytest tests/test_enricher.py -v` Expected: FAIL — the current
enricher ignores the dictionaries, so
`test_drops_contact_fact_not_in_dictionary` and
`test_attach_file_only_for_file_type_field` fail (and the pipeline test fails
because the current code doesn't load the schema).

- [ ] **Step 3a: Add the dictionary import**

In `python-agent/app/cascade/enricher.py`, add this import after
`from app.security import TenantContext` (line 16):

```python
from app.cascade.field_dictionary import FieldDef, contact_dictionary, pipeline_dictionary
```

- [ ] **Step 3b: Replace `_ALLOWED_VERBS`, `_noop`, `_valid_action`,
      `_sanitize_plan`**

Replace the contiguous block (lines ~63–89: `_ALLOWED_VERBS`, then `_noop`, then
`_valid_action`, then `_sanitize_plan`) — this replaces the _only_ existing
`_noop` definition, so no duplicate is created — with:

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

Replace the `_build_agent` signature line and its
`"system_message": _SYSTEM_PT,` line so it reads:

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

Run: `python -m pytest tests/test_enricher.py -v` Expected: PASS (4 passed)

- [ ] **Step 5: Run the full backend suite (catch regressions)**

Run: `python -m pytest tests/ -q` Expected: all pass (the `agno_workflow` test
stubs `enrich`, so it is unaffected).

- [ ] **Step 6: Commit**

```bash
git add python-agent/app/cascade/enricher.py python-agent/tests/test_enricher.py
git commit -m "feat(copilot): enricher is a dictionary-bounded router (no invented fields)"
```

---

### Task 4: Deal-scoped notes

**Files:**

- Create:
  `supabase/migrations/20260618000000_sprint64_note_opportunity_scope.sql`
- Modify: `python-agent/app/skills/core_table.py` (`add_note` gains
  `opportunity_id`)
- Modify: `python-agent/app/cascade/agno_workflow.py` (pass `opportunity_id` to
  the notify `add_note`)
- Test: `python-agent/tests/test_core_table.py`

**Interfaces:**

- Produces:
  `add_note(self, lead_id: str, content: str, opportunity_id: str | None = None) -> ActionResult`
  — inserts `opportunity_id` into the `lead_activities` payload **only when
  provided** (keeps existing lead-only calls valid). The sequential executor
  auto-injects `opportunity_id` because the param name matches
  (`executor._dispatch`), so plan-driven `add_note` actions become deal-scoped
  for free.

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

Run:
`python -m pytest tests/test_core_table.py::test_add_note_scopes_to_opportunity_when_given -v`
Expected: FAIL —
`add_note() got an unexpected keyword argument 'opportunity_id'`

- [ ] **Step 4: Add the `opportunity_id` param to `add_note`**

In `python-agent/app/skills/core_table.py`, replace the `add_note` method (lines
152–167) with:

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

In `python-agent/app/cascade/agno_workflow.py`, search for `add_note`. If a
"notify" call exists (below-threshold branch), change it to pass the in-scope
opportunity id (`opp_id`):

```python
await skill.add_note(
    lead_id,
    f"{note_prefix}Ação pendente de aprovação: {decision.reason}",
    opportunity_id=opp_id,
)
```

Also update the same call in `python-agent/app/cascade/workflow.py` (legacy
path, around line 398) the same way — `opp_id` is in scope there too. If a
module has no such `add_note` call, skip it.

- [ ] **Step 6: Run the backend tests**

Run:
`python -m pytest tests/test_core_table.py tests/test_workflow.py tests/test_agno_workflow.py -v`
Expected: PASS (new note tests pass; workflow tests unaffected — when `opp_id`
is `None` the note stays contact-level).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260618000000_sprint64_note_opportunity_scope.sql python-agent/app/skills/core_table.py python-agent/app/cascade/agno_workflow.py python-agent/app/cascade/workflow.py python-agent/tests/test_core_table.py
git commit -m "feat(copilot): deal-scoped notes (lead_activities.opportunity_id)"
```

---

### Task 5: Confirm the engine runs end-to-end in prod (HUMAN / INFRA — Mateus)

This task closes the "Sync feels dead" gap. It is **infra, not code** — Mateus
runs it on the VPS/Dokploy + remote Supabase. No automated test; verification is
by observation. (See design spec §1 Bug 1 and the Sprint 6.1 execution status
H4/H5.)

- [ ] **Step 1: Confirm whether the streaming path is active.** The HUD reads
      `GET /api/v1/sync/stream`; the workflow path runs only when
      `COPILOT_WORKFLOW_ENABLED=true`. Check the Dokploy env for
      `agent.soloventures.com.br`. If the flag is `false`, the legacy `/sync`
      works but the new streaming/run-events path does not — confirm which path
      the deployed frontend calls.

- [ ] **Step 2: Apply the pending migrations to the remote DB** (the
      `20260614000*` run_events/credit/router/knowledge set, plus this wave's
      `20260618000000_sprint64_note_opportunity_scope.sql`). URL-encode the DB
      password in the connection string.

- [ ] **Step 3: Flip `COPILOT_WORKFLOW_ENABLED=true`** in Dokploy only after the
      migrations are applied; redeploy the agent service.

- [ ] **Step 4: Smoke-test the alive feeling.** Open a deal on an agent-enabled
      team, click ⚡ Sync, and confirm the `TelemetryHUD` drawer opens and
      streams events (`action_start` / `action_done` / `done`). If the drawer
      opens but is empty, capture the browser Network tab for
      `/api/v1/sync/stream` (status + body) and the agent logs — that
      distinguishes a deploy gap (this task) from a frontend wiring bug (defer
      to Wave 4 design).

- [ ] **Step 5: Record the result** in the Wave 4 section planning notes (does
      Sync feel alive end-to-end? Y/N + evidence), so Wave 4 (Control Room +
      HUD) is designed against reality, not assumption.

---

### Wave 1 hand-off

Wave 1 is done (✅ implemented). The contract Wave 2 builds on:

- `app/cascade/field_dictionary.py`: `FieldDef(key,label,type,description)`,
  `contact_dictionary()`, `pipeline_dictionary(client, equipe_id, pipeline_id)`.
- `app/cascade/field_validation.py`:
  `validate_field_action(action, *, pipeline_fields, contact_fields)` +
  `FIELD_WRITE_VERBS` — enforced in BOTH the enricher and `executor.run_plan`.
- `CoreTableSkill.attach_file(...)`,
  `CoreTableSkill.add_note(..., opportunity_id=None)`, `"file"` custom-field
  type (BE + FE).

---

## WAVE 2 — Training-via-descriptions

**Goal:** The user teaches the agent by _describing their own CRM_. Stages gain
a `description`; the contact-field dictionary becomes tenant-editable (canonical
baseline + custom, each with a description) and is read live; stage
descriptions + SLA are fed into the Floor triage prompt so the Pipeline Copilot
knows _when to move a deal where_. No new agent personalities — just richer,
live-read training data.

**Consumes from W1:** `field_dictionary.contact_dictionary` /
`pipeline_dictionary` (W2 extends the contact one to read tenant data);
`field_validation.validate_field_action` (unchanged, now backed by
tenant-defined contact fields).

**Design decision (resolves spec §11.1):** the contact-field dictionary lives in
a new JSONB column `equipes.contact_fields_schema` — same item shape as
`pipelines.custom_fields_schema`
(`{field_id,key,label,type,required,options,position,is_deleted,description}`),
one per tenant, RLS already scopes `equipes`. Empty column → fall back to the W1
`CANONICAL_CONTACT_FIELDS` baseline.

### File Structure (Wave 2)

| File                                                                                                         | Responsibility                                                                                         | Action        |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------- |
| `supabase/migrations/20260619000000_sprint64_w2_training.sql`                                                | `pipeline_stages_v2.description` + `equipes.contact_fields_schema`                                     | **Create**    |
| `python-agent/app/schemas.py`                                                                                | add `description` to `StageBlueprint`                                                                  | Modify        |
| `python-agent/app/cascade/field_dictionary.py`                                                               | `contact_dictionary(client, equipe_id)` reads `equipes.contact_fields_schema`, falls back to canonical | Modify        |
| `python-agent/app/cascade/enricher.py` + `executor.py`                                                       | pass `client, ctx.equipe_id` to `contact_dictionary`                                                   | Modify        |
| `python-agent/app/cascade/stages.py`                                                                         | `load_stage_guide(client, equipe_id, pipeline_id) -> list[StageInfo]`                                  | **Create**    |
| `python-agent/app/cascade/floor_doorman.py`                                                                  | inject the stage guide into `_build_user_message`                                                      | Modify        |
| `python-agent/tests/test_field_dictionary.py`, `test_stages.py`, `test_floor_doorman.py`, `test_enricher.py` | tests                                                                                                  | Modify/Create |
| `src/types/pipelines.ts`                                                                                     | `description?` already present on `CustomFieldSchema`; add `description?` to the stage type            | Modify        |
| `src/components/crm/**` (stage + field editors) + `useContactFields` hook                                    | UI to edit descriptions + contact dictionary                                                           | Modify/Create |

### Task W2.1: Stage `description` + contact-dictionary column (migration + schema)

**Files:**

- Create: `supabase/migrations/20260619000000_sprint64_w2_training.sql`
- Modify: `python-agent/app/schemas.py` (StageBlueprint),
  `src/types/pipelines.ts`
- Test: `python-agent/tests/test_schemas.py`

**Interfaces:**

- Produces: `equipes.contact_fields_schema jsonb DEFAULT '[]'`;
  `pipeline_stages_v2.description text`;
  `StageBlueprint.description: str | None = None`.

- [ ] **Step 1: Write the migration**

```sql
-- Sprint 6.4 · Wave 2 — training-via-descriptions.
-- Stages gain a human description (the Pipeline Copilot reads it to know when to
-- move a deal here). Tenants gain an editable contact-field dictionary, same shape
-- as pipelines.custom_fields_schema. Additive + nullable.

ALTER TABLE public.pipeline_stages_v2
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.pipeline_stages_v2.description IS
  'Sprint 6.4 W2: what this stage means / when a deal belongs here. Read by the Floor triage as training.';

ALTER TABLE public.equipes
  ADD COLUMN IF NOT EXISTS contact_fields_schema jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.equipes.contact_fields_schema IS
  'Sprint 6.4 W2: tenant contact-base field dictionary {field_id,key,label,type,required,options,position,is_deleted,description}. Empty = canonical baseline.';
```

- [ ] **Step 2: Write the failing test** in
      `python-agent/tests/test_schemas.py`:

```python
def test_stage_blueprint_accepts_description():
    from app.schemas import StageBlueprint
    s = StageBlueprint(name="Proposta", position=0, description="Cliente recebeu a proposta.")
    assert s.description == "Proposta recebida." or s.description == "Cliente recebeu a proposta."
```

(Adjust the assertion to the value you pass; the point is `description` is an
accepted field.)

- [ ] **Step 3: Run → FAIL** (`StageBlueprint` rejects `description`):
      `cd python-agent && python -m pytest tests/test_schemas.py -k description -v`

- [ ] **Step 4: Add `description` to `StageBlueprint`** in
      `python-agent/app/schemas.py` (after the `color` field):

```python
color: str = "#64748b"
description: str | None = None
```

- [ ] **Step 5: Add `description?` to the FE stage type** in
      `src/types/pipelines.ts` (find the stage interface, e.g.
      `PipelineStageV2`, and add):

```typescript
description?: string;
```

- [ ] **Step 6: Run BE test + FE build.**
      `python -m pytest tests/test_schemas.py -v` (pass); `npm run build`
      (green).

- [ ] **Step 7: Commit** — `git add` the migration, `schemas.py`, `pipelines.ts`
      — `feat(copilot-w2): stage description + tenant contact_fields_schema`.

### Task W2.2: `contact_dictionary` reads tenant schema (live training)

**Files:**

- Modify: `python-agent/app/cascade/field_dictionary.py`, `enricher.py`,
  `executor.py`
- Test: `python-agent/tests/test_field_dictionary.py`

**Interfaces:**

- Changes: `contact_dictionary(client, equipe_id) -> dict[str, FieldDef]` (was
  no-arg). Reads `equipes.contact_fields_schema`; for each non-deleted item
  builds `FieldDef(key=item["key"], label, type, description)`. If the column is
  empty/missing → return the canonical fallback
  (`{f.key: f for f in CANONICAL_CONTACT_FIELDS}`).
- Consumers updated: `enricher.enrich` and `executor.run_plan` now call
  `contact_dictionary(client, ctx.equipe_id)`.

- [ ] **Step 1: Write failing tests** (add to `test_field_dictionary.py`):

```python
def test_contact_dictionary_reads_tenant_schema():
    client = _Client({"equipes": [[{"contact_fields_schema": [
        {"field_id": "c1", "key": "industria", "label": "Indústria", "type": "text",
         "description": "Setor industrial do contato."},
    ]}]]})
    d = fd.contact_dictionary(client, "team-1")
    assert "industria" in d and d["industria"].description.startswith("Setor")
    assert "cargo" not in d   # tenant schema replaces the canonical baseline


def test_contact_dictionary_falls_back_to_canonical_when_empty():
    client = _Client({"equipes": [[{"contact_fields_schema": []}]]})
    d = fd.contact_dictionary(client, "team-1")
    assert "cargo" in d       # canonical baseline
```

(Extend `_Query` in this test file with a no-op `.maybeSingle()`/`.single()` if
your read uses them; the existing `_Query` already supports
`select/eq/limit/execute`.)

- [ ] **Step 2: Run → FAIL** (`contact_dictionary()` takes no args):
      `python -m pytest tests/test_field_dictionary.py -k contact_dictionary -v`

- [ ] **Step 3: Implement** in `field_dictionary.py` — replace
      `contact_dictionary`:

```python
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
```

- [ ] **Step 4: Update the two call sites.** In `enricher.py` (`enrich`) change
      `contact_fields = contact_dictionary()` →
      `contact_fields = contact_dictionary(client, ctx.equipe_id)`. In
      `executor.py` (`run_plan`) change `contact_fields = contact_dictionary()`
      → `contact_fields = contact_dictionary(client, ctx.equipe_id)`.

- [ ] **Step 5: Fix existing tests that called `contact_dictionary()` no-arg**
      (`test_field_dictionary.py::test_contact_dictionary_is_canonical_and_keyed_by_key`):
      pass a client whose `equipes` select returns `[]`, e.g.
      `fd.contact_dictionary(_Client({"equipes": [[]]}), "t")`.

- [ ] **Step 6: Run**
      `python -m pytest tests/test_field_dictionary.py tests/test_enricher.py tests/test_executor.py -v`
      then full `python -m pytest tests/ -q`. All green.

- [ ] **Step 7: Commit** —
      `feat(copilot-w2): contact dictionary reads tenant schema (live training)`.

### Task W2.3: Feed the stage guide into the Floor triage prompt

**Files:**

- Create: `python-agent/app/cascade/stages.py`,
  `python-agent/tests/test_stages.py`
- Modify: `python-agent/app/cascade/floor_doorman.py`,
  `python-agent/app/cascade/agno_workflow.py` (+ `workflow.py`),
  `python-agent/tests/test_floor_doorman.py`

**Interfaces:**

- `stages.load_stage_guide(client, equipe_id, pipeline_id) -> list[dict]` —
  returns `[{"name","stage_type","description","max_idle_hours"}, ...]` ordered
  by `position`, non-deleted.
- `floor_doorman._build_user_message(conversation, opportunity, pipeline_rules, stage_guide=None)`
  — gains an optional `stage_guide`; when present, appends a `GUIA DE ETAPAS`
  block so the agent picks the right `stage_name_hint`.
- `triage_intent(...)` and `_triage_plan(...)` gain a
  `stage_guide: list | None = None` param threaded into `_build_user_message`.
  The workflow loads it once and passes it in.

- [ ] **Step 1: Write failing test** `tests/test_stages.py`:

```python
import sys
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.cascade import stages


class _Q:
    def __init__(self, c, t): self.c, self.t = c, t
    def select(self, *_): return self
    def eq(self, *_): return self
    def order(self, *a, **k): return self
    def execute(self):
        d = self.c.sel.get(self.t, [])
        return SimpleNamespace(data=(d.pop(0) if d else []), error=None)
class _C:
    def __init__(self, sel): self.sel = sel
    def table(self, t): return _Q(self, t)


def test_load_stage_guide_orders_and_filters_deleted():
    client = _C({"pipeline_stages_v2": [[
        {"name": "Lead", "stage_type": "open", "description": "Novo lead.", "max_idle_hours": 48, "position": 0, "deleted_at": None},
        {"name": "Morto", "stage_type": "open", "description": None, "max_idle_hours": None, "position": 1, "deleted_at": "2026-01-01"},
    ]]})
    guide = stages.load_stage_guide(client, "t", "p")
    assert [g["name"] for g in guide] == ["Lead"]      # deleted filtered
    assert guide[0]["description"] == "Novo lead."
```

- [ ] **Step 2: Run → FAIL** (no module):
      `python -m pytest tests/test_stages.py -v`

- [ ] **Step 3: Implement** `app/cascade/stages.py`:

```python
"""Stage guide — the Pipeline Copilot's training about WHEN to move a deal.

Reads pipeline_stages_v2 (name, type, description, SLA) so the Floor triage can
pick the right stage_name_hint. Tenant-scoped; never raises (returns [])."""
from __future__ import annotations
from typing import Any


def load_stage_guide(client: Any, equipe_id: str, pipeline_id: str | None) -> list[dict]:
    if not pipeline_id:
        return []
    try:
        resp = (
            client.table("pipeline_stages_v2")
            .select("name,stage_type,description,max_idle_hours,position,deleted_at")
            .eq("equipe_id", equipe_id)
            .eq("pipeline_id", pipeline_id)
            .order("position", desc=False)
            .execute()
        )
        rows = getattr(resp, "data", None) or []
    except Exception:
        return []
    if isinstance(rows, dict):
        rows = [rows]
    guide = []
    for r in rows:
        if r.get("deleted_at"):
            continue
        guide.append({
            "name": r.get("name"),
            "stage_type": r.get("stage_type"),
            "description": r.get("description"),
            "max_idle_hours": r.get("max_idle_hours"),
        })
    return guide
```

- [ ] **Step 4: Inject the guide into the Floor prompt.** In
      `floor_doorman.py::_build_user_message`, add
      `stage_guide: list | None = None` param and append, when present:

```python
blocks = [
    f"CONVERSA RECEBIDA:\n{conversation}\n",
    f"OPORTUNIDADE ATUAL:\n{json.dumps(opportunity_summary, ensure_ascii=False, indent=2)}\n",
    f"REGRAS DO PIPELINE:\n{json.dumps(rules_summary, ensure_ascii=False, indent=2)}",
]
if stage_guide:
    guide_lines = [
        f'  - "{s["name"]}" ({s["stage_type"]}): {s.get("description") or "sem descrição"}'
        + (f' [SLA {s["max_idle_hours"]}h]' if s.get("max_idle_hours") else "")
        for s in stage_guide
    ]
    blocks.append("GUIA DE ETAPAS (use o nome exato em stage_name_hint):\n" + "\n".join(guide_lines))
return "\n\n".join(blocks)
```

Thread `stage_guide` through `triage_intent` and `_triage_plan` (add the param,
pass it to `_build_user_message`).

- [ ] **Step 5: Load + pass the guide in the workflow.** In `agno_workflow.py`
      (and `workflow.py`), before the Floor call, add
      `stage_guide = load_stage_guide(client, equipe_id, pipe_id)` and pass
      `stage_guide=stage_guide` into the triage call(s). Import
      `from app.cascade.stages import load_stage_guide`.

- [ ] **Step 6: Add a floor_doorman test** asserting the rendered message
      contains a stage name + its description when a guide is supplied
      (`test_floor_doorman.py`). Use the existing `_build_user_message`
      directly.

- [ ] **Step 7: Run**
      `python -m pytest tests/test_stages.py tests/test_floor_doorman.py tests/test_agno_workflow.py -v`,
      then full suite. Green.

- [ ] **Step 8: Commit** —
      `feat(copilot-w2): stage guide (description+SLA) feeds Floor triage`.

### Task W2.4: FE — edit descriptions on fields & stages, and the contact dictionary

**Files:**

- Modify: the pipeline stage editor + custom-field editor components under
  `src/components/crm/` (read `PipelineSettings` page first to locate them).
- Create: `src/hooks/useContactFields.ts` (CRUD on
  `equipes.contact_fields_schema`) + a "Campos do Contato" editor surface in the
  base-de-contatos settings.

**Interfaces:**

- `useContactFields()` → `{ fields: ContactFieldSchema[], upsert, remove }`
  reading/writing `equipes.contact_fields_schema` for the current tenant (mirror
  `useAgentRules` patterns: react-query + supabase + toast).

- [ ] **Step 1: Read the existing editors.** Open the `/pipeline` settings page
      and the custom-field editor; identify where a field's `label`/`type` are
      edited and where stages are edited. (No code yet — locate the seams.)

- [ ] **Step 2: Add a `description` textarea** to the custom-field editor and
      the stage editor, bound to the field/stage `description`. Persist via the
      existing pipeline-save path (the schema already carries `description?`).
      Manual check: editing a field's description and saving round-trips to
      `pipelines.custom_fields_schema[].description`.

- [ ] **Step 3: Implement `useContactFields`** mirroring `useAgentRules` (read
      `equipes.contact_fields_schema`, upsert the array). Seed from
      `CANONICAL_CONTACT_FIELDS` equivalents on first open if empty.

- [ ] **Step 4: Build the "Campos do Contato" editor** (a section in the
      base-de-contatos / settings area): list contact fields,
      add/edit/soft-delete, each with key+label+type+description. Reuse the same
      field-row component as the pipeline custom-field editor where possible
      (DRY).

- [ ] **Step 5: `npm run build`** green; manual round-trip check for both
      editors.

- [ ] **Step 6: Commit** —
      `feat(copilot-w2): edit field/stage descriptions + contact dictionary UI`.

> **FE note:** W2.4 edits existing components this plan has not transcribed
> verbatim. The implementer MUST read the named components first and follow
> their established prop/state patterns; the steps above define the required
> behavior and acceptance, not line-level edits.

### Task W2.5 (cleanup): re-add Lead-Memory wiring tests

**Files:** Modify `python-agent/tests/test_enricher.py`.

- [ ] **Step 1:** Add two tests asserting `_build_agent` wires memory when
      storage is present and omits it when absent — monkeypatch
      `enricher._get_storage` to return a sentinel / `None`, build via
      `_build_agent`, and assert the resulting `Agent` kwargs
      (`enable_agentic_memory`, `user_id`, `db`) are present/absent accordingly.
      (Restores the W1-removed coverage flagged by the final review.)
- [ ] **Step 2:** Run `python -m pytest tests/test_enricher.py -v`; full suite
      green.
- [ ] **Step 3: Commit** —
      `test(copilot-w2): restore Lead-Memory wiring coverage`.

### Wave 2 hand-off

W2 done when the suite + build are green and a field/stage description
round-trips through the UI. W3 consumes: `equipes.contact_fields_schema` (for
the contact-base copilot config), the `description`-bearing dictionaries, and
the stage guide.

---

## WAVE 3 — The Cockpit: Garage + Autonomy Dial + Humanized Approvals

**Goal:** A top-level **Copiloto** section where the user configures the team
(per-copilot name + system prompt + autonomy dial), the dial is enforced in the
cascade, and approval cards speak natural language.

**Consumes from W1/W2:** the bounded write-path + dictionaries; stage guide.

**Design decision (resolves spec §11.3):** a new `copilot_agents` table is the
team's config home — one row per pipeline copilot + one row each for the Chat
and Base-de-Contatos copilots.

### File Structure (Wave 3)

| File                                                                | Responsibility                                                                  | Action        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------- |
| `supabase/migrations/20260620000000_sprint64_w3_copilot_agents.sql` | `copilot_agents` table + RLS + seed defaults                                    | **Create**    |
| `python-agent/app/cascade/agents_config.py`                         | load a copilot's `system_prompt` + `autonomy_mode` by (equipe, scope, pipeline) | **Create**    |
| `python-agent/app/cascade/agno_workflow.py` (+ `workflow.py`)       | enforce autonomy_mode in the gate; apply system_prompt override                 | Modify        |
| `python-agent/tests/test_agents_config.py`, `test_agno_workflow.py` | tests                                                                           | Create/Modify |
| `src/types/copilot.ts`                                              | `CopilotAgent`, `AutonomyMode` types                                            | Create        |
| `src/hooks/useCopilotAgents.ts`                                     | CRUD on `copilot_agents`                                                        | Create        |
| `src/pages/CopilotCockpit.tsx` (+ route/tab)                        | the Garage section listing the team                                             | Create        |
| `src/components/crm/copilot/CopilotConfigCard.tsx`                  | per-copilot editor: name, prompt, autonomy dial                                 | Create        |
| `src/components/crm/copilot/CopilotApprovalCard.tsx`                | humanize the approval prompt                                                    | Modify        |

### Task W3.1: `copilot_agents` table + seed

**Files:** Create
`supabase/migrations/20260620000000_sprint64_w3_copilot_agents.sql`.

**Interfaces:** table
`copilot_agents(id, equipe_id, scope, pipeline_id, name, system_prompt, autonomy_mode, created_at, updated_at)`;
`scope ∈ {chat, contact_base, pipeline}`;
`autonomy_mode ∈ {observe, suggest, autonomous} DEFAULT 'observe'`;
`UNIQUE(equipe_id, scope, pipeline_id)`.

- [ ] **Step 1: Write the migration**

```sql
-- Sprint 6.4 · Wave 3 — the copilot team config home.
CREATE TABLE IF NOT EXISTS public.copilot_agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id     uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  scope         text NOT NULL CHECK (scope IN ('chat','contact_base','pipeline')),
  pipeline_id   uuid REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Copiloto',
  system_prompt text,
  autonomy_mode text NOT NULL DEFAULT 'observe'
                CHECK (autonomy_mode IN ('observe','suggest','autonomous')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One config per (tenant, scope, pipeline). Global copilots use a NULL pipeline_id;
-- the partial unique index makes that NULL behave as a single slot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_copilot_agents_pipeline
  ON public.copilot_agents (equipe_id, scope, pipeline_id)
  WHERE pipeline_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_copilot_agents_global
  ON public.copilot_agents (equipe_id, scope)
  WHERE pipeline_id IS NULL;

ALTER TABLE public.copilot_agents ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_copilot_agents_updated_at ON public.copilot_agents;
CREATE TRIGGER set_copilot_agents_updated_at
  BEFORE UPDATE ON public.copilot_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

> Add RLS policies matching the tenant pattern used by other Sprint-6 tables
> (read the policies on `pipeline_agent_rules` and copy their `equipe_id`-scoped
> shape verbatim — same `USING`/`WITH CHECK`).

- [ ] **Step 2:** Migration is syntax-only locally (no DB). Commit —
      `feat(copilot-w3): copilot_agents config table`.

### Task W3.2: Backend reads system_prompt + autonomy_mode

**Files:** Create `python-agent/app/cascade/agents_config.py` +
`tests/test_agents_config.py`.

**Interfaces:**
`load_agent_config(client, equipe_id, scope, pipeline_id=None) -> dict` →
`{"name","system_prompt","autonomy_mode"}` with defaults
`{"name": <scope default>, "system_prompt": None, "autonomy_mode": "observe"}`
when no row.

- [ ] **Step 1: Failing test** (`test_agents_config.py`): a fake client
      returning a `copilot_agents` row yields its
      `autonomy_mode`/`system_prompt`; an empty result yields defaults
      (`autonomy_mode == "observe"`).

- [ ] **Step 2: Implement** the loader (mirror `stages.load_stage_guide`
      read/guard style; query by `equipe_id`+`scope` and `pipeline_id` when
      given; `maybeSingle`-style first row).

- [ ] **Step 3:** Run `python -m pytest tests/test_agents_config.py -v`; full
      suite green.

- [ ] **Step 4: Commit** — `feat(copilot-w3): agents_config loader`.

### Task W3.3: Enforce the autonomy dial in the cascade

**Files:** Modify `python-agent/app/cascade/agno_workflow.py` (+ `workflow.py`),
`tests/test_agno_workflow.py`.

**Interfaces:** the cascade resolves `autonomy_mode` (via `load_agent_config`
for the opportunity's pipeline) and gates execution:

- `observe` → never execute; record every proposed action as a decision with
  `status="proposed"` (new audit status); return `{"status": "observed", ...}`.
- `suggest` → force `pending_approval` for ALL actionable plans regardless of
  confidence (HITL).
- `autonomous` → current behavior (confidence-gated auto-apply; high-stakes
  still HITL).

- [ ] **Step 1: Failing tests** in `test_agno_workflow.py`: with
      `autonomy_mode="observe"` the run executes no worker action and records a
      proposed decision; with `"suggest"` an actionable plan returns
      `pending_approval` even at high confidence; with `"autonomous"` behavior
      is unchanged. Monkeypatch `load_agent_config` to return each mode.

- [ ] **Step 2: Implement the gate.** Resolve
      `mode = load_agent_config(client, equipe_id, "pipeline", pipe_id)["autonomy_mode"]`
      once. Branch before the execute step: `observe` short-circuits to
      recording proposed decisions (do not call `run_plan`); `suggest` sends the
      combined plan to the approval queue instead of executing; `autonomous`
      runs the existing path. Keep `trigger == "sync"` forcing execution ONLY
      when mode != "observe" (a manual ⚡ Sync still respects an explicit
      Observe shadow). Apply the same gate in `workflow.py`.

- [ ] **Step 3:** If `proposed` is a new `ai_decisions.status` value, ensure the
      audit insert accepts it (check `audit.record_decision` / the
      `ai_decisions` status CHECK — add a migration to extend the CHECK if one
      exists).

- [ ] **Step 4:** Run
      `python -m pytest tests/test_agno_workflow.py tests/test_workflow.py -v`;
      full suite green.

- [ ] **Step 5: Commit** —
      `feat(copilot-w3): enforce autonomy dial (observe/suggest/autonomous)`.

### Task W3.4: FE — `useCopilotAgents` + types

**Files:** Create `src/types/copilot.ts`, `src/hooks/useCopilotAgents.ts`.

**Interfaces:** `AutonomyMode = "observe" | "suggest" | "autonomous"`;
`CopilotAgent = { id, scope, pipeline_id, name, system_prompt, autonomy_mode }`;
`useCopilotAgents()` → `{ agents, upsert, isLoading }` (react-query + supabase,
mirror `useAgentRules`).

- [ ] **Step 1:** Define the types. **Step 2:** Implement the hook (list all
      rows for the tenant; `upsert(scope, pipeline_id, patch)`). **Step 3:**
      `npm run build` green. **Step 4: Commit** —
      `feat(copilot-w3): useCopilotAgents hook + types`.

### Task W3.5: FE — the Copiloto Garage section

**Files:** Create `src/pages/CopilotCockpit.tsx` +
`src/components/crm/copilot/CopilotConfigCard.tsx`; register a route/tab (add
`<Route path="/copiloto" ...>` in `src/App.tsx` mirroring `/crm`, and a nav
entry).

**Interfaces:** `CopilotConfigCard` props `{ agent: CopilotAgent, onSave }`
renders name input, system-prompt textarea, and the 3-way autonomy dial
(Observe/Suggest/Autonomous segmented control). The page lists: 🗗 Chat, 📇 Base
de Contatos, then 🏭 one card per pipeline (from the pipelines list), creating a
default `copilot_agents` row on first edit.

- [ ] **Step 1:** Build `CopilotConfigCard` (name, prompt, dial) — dial maps to
      `autonomy_mode`; show a one-line helper per mode ("Observa e propõe, não
      escreve" / "Pede sua aprovação" / "Age sozinho"). **Step 2:** Build
      `CopilotCockpit` page composing the team list (gate the whole section
      behind `equipe.is_crm_agent_enabled`, matching `SyncButton`). **Step 3:**
      Add route + nav. **Step 4:** `npm run build` green; manual check: changing
      a pipeline's dial persists. **Step 5: Commit** —
      `feat(copilot-w3): Copiloto Garage section (team config + autonomy dial)`.

> **FE note:** mirror existing patterns — read `CopilotCentralPanel.tsx`,
> `Billing.tsx`, and `App.tsx` routing before writing. Steps define behavior +
> acceptance, not line edits.

### Task W3.6: Humanized approval prompts

**Status:** [x] Completed by Codex on 2026-06-18. Commit `0020305`.

**Files:** Modify `src/components/crm/copilot/CopilotApprovalCard.tsx`; Test:
add/extend a component test if the project tests components, else manual.

**Interfaces:** Given a decision's `output_action` (verb + args) + the lead
name, render a PT-BR sentence: `move_stage`→"Mover {lead} para {stage}?";
`add_note`→"Adicionar esta nota para {lead}?";
`set_field`/`set_contact_field`→"Atualizar {label} de {lead} para “{value}”?";
`create_task`→"Criar tarefa “{title}” para {lead}?". Never show raw JSON (keep a
collapsible "ver detalhes" for the raw payload).

- [ ] **Step 1: Read `CopilotApprovalCard.tsx`.** **Step 2:** Add a
      `humanize(action, leadName)` helper mapping verb→sentence (fallback to a
      generic "Aplicar ação para {lead}?" for unknown verbs). **Step 3:** Render
      the sentence as the card title; move raw JSON behind a collapsible. **Step
      4:** `npm run build` green; manual check across the verbs. **Step 5:
      Commit** — `feat(copilot-w3): humanized approval prompts (no raw JSON)`.

### Wave 3 hand-off

W3 done when the suite + build are green, the dial round-trips and is enforced
(observe writes nothing; suggest queues; autonomous acts), and approvals read as
sentences. W4 consumes: the `copilot_agents` section shell (Control Room mounts
as its second face) and the `proposed`/`pending_approval`/`executed` decision
stream.

---

## WAVE 4 — The Control Room + Live "Alive" HUD

**Goal:** The user _feels the system is alive_ and can audit it: a discreet,
minimizable right-side telemetry drawer that streams the agents' actions, plus a
filterable decision/action log (pipeline, action, lead, time, field changed,
credits).

**Consumes from W1–W3:** run-event stream (`copilot_run_events`), `ai_decisions`
audit rows (incl. W3 `proposed`), the Copiloto section shell, the credit ledger.

**Precondition:** Wave 1 Task 5 (prod deploy/flag) should be closed first, or
the live stream has nothing to show. If still pending, W4 FE can be built and
verified against the local/dev agent; production "alive" verification waits on
the deploy.

### File Structure (Wave 4)

| File                                          | Responsibility                                                                              | Action     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| `python-agent/app/routers/decisions.py`       | `GET /decisions` — tenant decisions, filter by pipeline, joined lead name + field + credits | **Create** |
| `python-agent/app/main.py`                    | mount the decisions router                                                                  | Modify     |
| `python-agent/tests/test_decisions_router.py` | tests                                                                                       | Create     |
| `src/hooks/useCopilotDecisions.ts`            | fetch + filter the decision log                                                             | Create     |
| `src/components/crm/copilot/ControlRoom.tsx`  | filterable log table (mounts in the Copiloto section)                                       | Create     |
| `src/components/crm/copilot/TelemetryHUD.tsx` | make the drawer discreet, minimizable, persistent + done-toast                              | Modify     |

### Task W4.1: Backend decisions log endpoint

**Status:** [x] Completed by Codex on 2026-06-18. Commit `68f95a9`.

**Files:** Create `python-agent/app/routers/decisions.py` +
`tests/test_decisions_router.py`; modify `app/main.py`.

**Interfaces:** `GET /api/v1/decisions?pipeline_id=&limit=` (auth via
`get_tenant_context`) → list of
`{id, created_at, agent_role, decision_type, status, lead_id, lead_name, opportunity_id, pipeline_id, field, value, confidence, credits}`.
Derive `field`/`value` from `output_action`; `credits` from the ledger (or 1 per
executed action) — reuse existing audit/ledger reads.

- [ ] **Step 1: Failing test** (`test_decisions_router.py`, mirror
      `test_sync_router.py`'s TestClient + fake context): a seeded set of
      `ai_decisions` returns filtered by `pipeline_id`, newest first, with
      `lead_name` resolved.

- [ ] **Step 2: Implement** the router (tenant-scoped query on `ai_decisions`,
      optional `pipeline_id` filter, join/lookup lead name, map
      `output_action`→field/value). Mount it in `main.py` under `/api/v1`
      alongside the other routers.

- [ ] **Step 3:** Run `python -m pytest tests/test_decisions_router.py -v`; full
      suite green.

- [ ] **Step 4: Commit** — `feat(copilot-w4): decisions log endpoint`.

### Task W4.2: FE — the Control Room log

**Status:** [x] Completed by Codex on 2026-06-18. Commit `3a67fa9`.

**Files:** Create `src/hooks/useCopilotDecisions.ts` +
`src/components/crm/copilot/ControlRoom.tsx`; mount `ControlRoom` as the second
tab/face of `CopilotCockpit`.

**Interfaces:** `useCopilotDecisions(pipelineId?)` → `{ rows, isLoading }`
calling `GET /api/v1/decisions`. `ControlRoom` renders a filterable table:
columns Hora, Pipeline, Ação (humanized — reuse the W3.6 `humanize`), Lead,
Campo, Valor, Créditos, Status; a pipeline filter dropdown; empty + loading
states.

- [ ] **Step 1:** Implement the hook (uses `COPILOT_URL` + `getCopilotToken`
      like `useCopilotSync`). **Step 2:** Build `ControlRoom` table + pipeline
      filter, reusing `humanize` from W3.6 (extract it to a shared
      `copilotHumanize.ts` if not already). **Step 3:** Mount as the Control
      Room face of the Copiloto section. **Step 4:** `npm run build` green;
      manual check filtering. **Step 5: Commit** —
      `feat(copilot-w4): Control Room decision log`.

### Task W4.3: FE — the discreet, alive telemetry drawer

**Status:** [x] Completed by Codex on 2026-06-18. Commit `d6cfb5a`.

**Files:** Modify `src/components/crm/copilot/TelemetryHUD.tsx`.

**Interfaces:** the HUD is a right-side **Sheet/Drawer** (not a full-screen
blocking modal): slides from the right, leaves the pipeline interactive, is
**minimizable** (collapses to a small floating pill showing a spinner + current
action) and **persists until the run emits `done`**; on completion it surfaces a
non-intrusive toast `✓ Copilot concluiu as atualizações para {lead}` (the
SyncButton already fires a toast — keep exactly one). Streams events
sequentially as a log queue with PT-BR phrasing.

- [ ] **Step 1: Read `TelemetryHUD.tsx`** +
      `src/components/ui/drawer.tsx`/`sheet`. **Step 2:** Convert the container
      to a right-anchored, non-modal Sheet; remove any backdrop blur/lock so the
      background stays interactive. **Step 3:** Add a minimize control that
      collapses to a floating pill (running spinner + last event label) and
      restores on click; keep the run alive while minimized (state lives in the
      hook, not the drawer). **Step 4:** Render events as a sequential PT-BR
      log; ensure the completion toast fires exactly once (it already lives in
      `SyncButton`'s `done` effect — do not duplicate). **Step 5:**
      `npm run build` green; manual check: open ⚡ Sync, minimize, confirm
      background is usable and the run continues, toast on done. **Step 6:
      Commit** — `feat(copilot-w4): discreet minimizable telemetry drawer`.

> **FE note:** this polishes an existing component; read it first and preserve
> the existing `events`/`running` contract from
> `useCopilotSync`/`useCopilotSweep`.

### Task W4.4: Verify "alive" end-to-end (HUMAN / INFRA — Mateus)

- [ ] **Step 1:** Ensure Wave 1 Task 5 is done (migrations applied,
      `COPILOT_WORKFLOW_ENABLED=true`, redeployed). **Step 2:** Open a deal on
      an agent-enabled team, click ⚡ Sync, confirm the discreet drawer streams
      actions, can be minimized while the run continues, and the done-toast
      fires. **Step 3:** Open the Copiloto → Control Room, confirm the just-run
      decision appears with lead, field, credits, time, filterable by pipeline.
      **Step 4:** Record the result (Y/N + evidence) in this file's status line
      so the foundation is confirmed against reality.

### Wave 4 hand-off — Foundation complete

When W4 is green and verified, the Copilot Cockpit foundation is delivered: a
bounded, trustworthy execution spine; training sourced from CRM descriptions; a
configurable named team with an autonomy dial and humanized approvals; and a
live, auditable Control Room. Strategic intelligence (recommendations, suggested
messages, next-best-action) is the next floor up — explicitly out of scope here
per the design spec.
