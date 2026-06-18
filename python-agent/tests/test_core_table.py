import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.skills.core_table import CoreTableSkill


class FakeQuery:
    def __init__(self, client, table, operation="select", payload=None):
        self.client = client
        self.table = table
        self.operation = operation
        self.payload = payload
        self.columns = None
        self.filters = []
        self.null_filters = []
        self.order_by = None
        self.limit_count = None
        self.single_called = False

    def select(self, columns):
        self.columns = columns
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def is_(self, key, value):
        self.null_filters.append((key, value))
        return self

    def order(self, key, desc=False):
        self.order_by = (key, desc)
        return self

    def limit(self, count):
        self.limit_count = count
        return self

    def single(self):
        self.single_called = True
        return self

    def execute(self):
        self.client.calls.append(self)
        if self.operation == "select":
            data = self.client.selects.get(self.table, [])
            data = data.pop(0) if data else []
            return SimpleNamespace(data=data, error=None)
        if self.operation == "insert":
            self.client.inserts.append(self)
            payload = dict(self.payload)
            payload.setdefault("id", f"{self.table}-id")
            return SimpleNamespace(data=payload if self.single_called else [payload], error=None)
        if self.operation == "update":
            self.client.updates.append(self)
            return SimpleNamespace(data=[self.payload], error=None)
        return SimpleNamespace(data=None, error=None)


class FakeClient:
    def __init__(self, selects=None):
        self.selects = selects or {}
        self.calls = []
        self.updates = []
        self.inserts = []

    def table(self, table):
        return FakeQuery(self, table)


def filters_for(query):
    return set(query.filters)


@pytest.mark.asyncio
async def test_set_field_merges_jsonb_and_filters_by_equipe():
    client = FakeClient(
        {
            "opportunities": [
                [{"id": "opp-1", "equipe_id": "team-1", "custom_data": {"keep": "yes"}}],
            ]
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.set_field("opp-1", "budget", 1000)

    assert result.success is True
    update = client.updates[0]
    assert update.table == "opportunities"
    assert ("equipe_id", "team-1") in filters_for(update)
    assert ("id", "opp-1") in filters_for(update)
    assert update.payload["custom_data"] == {"keep": "yes", "budget": 1000}


@pytest.mark.asyncio
async def test_set_contact_field_merges_personal_custom_data():
    client = FakeClient(
        {
            "leads": [
                [{"id": "lead-1", "equipe_id": "team-1", "personal_custom_data": {"city": "Floripa"}}],
            ]
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.set_contact_field("lead-1", "rooms", 3)

    assert result.success is True
    update = client.updates[0]
    assert update.table == "leads"
    assert ("equipe_id", "team-1") in filters_for(update)
    assert update.payload["personal_custom_data"] == {"city": "Floripa", "rooms": 3}


@pytest.mark.asyncio
async def test_cross_tenant_fetch_returns_guard_failure():
    client = FakeClient(
        {
            "opportunities": [
                [{"id": "opp-1", "equipe_id": "other-team", "custom_data": {}}],
            ]
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.set_field("opp-1", "budget", 1000)

    assert result.success is False
    assert "Tenant violation" in result.error


@pytest.mark.asyncio
async def test_add_tag_dedupes_existing_tag_without_update():
    client = FakeClient(
        {
            "leads": [
                [{"id": "lead-1", "equipe_id": "team-1", "tags": ["vip"]}],
            ]
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.add_tag("lead-1", "vip")

    assert result.success is True
    assert client.updates == []


@pytest.mark.asyncio
async def test_add_tag_appends_missing_tag_with_tenant_filter():
    client = FakeClient(
        {
            "leads": [
                [{"id": "lead-1", "equipe_id": "team-1", "tags": ["warm"]}],
            ]
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.add_tag("lead-1", "vip")

    assert result.success is True
    update = client.updates[0]
    assert update.payload["tags"] == ["warm", "vip"]
    assert ("equipe_id", "team-1") in filters_for(update)


@pytest.mark.asyncio
async def test_move_stage_resolves_target_and_stamps_latest_history():
    client = FakeClient(
        {
            "opportunities": [
                [{"id": "opp-1", "equipe_id": "team-1", "pipeline_id": "pipe-1", "stage_id": "old-stage"}],
            ],
            "pipeline_stages_v2": [
                [
                    {"id": "stage-1", "equipe_id": "team-1", "name": "Qualificacao", "position": 0},
                    {"id": "stage-2", "equipe_id": "team-1", "name": "Visita", "position": 1},
                ],
            ],
            "opportunity_stage_history": [
                [{"id": 10, "equipe_id": "team-1"}],
            ],
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.move_stage("opp-1", stage_type="open", stage_name_hint="Visita")

    assert result.success is True
    opp_update = client.updates[0]
    history_update = client.updates[1]
    assert opp_update.table == "opportunities"
    assert opp_update.payload["stage_id"] == "stage-2"
    assert ("equipe_id", "team-1") in filters_for(opp_update)
    assert history_update.table == "opportunity_stage_history"
    assert history_update.payload == {"actor": "copilot", "changed_by_type": "copilot"}
    assert ("equipe_id", "team-1") in filters_for(history_update)


@pytest.mark.asyncio
async def test_create_opportunity_dedupes_existing_lead_pipeline_pair():
    client = FakeClient(
        {
            "leads": [
                [{"id": "lead-1", "equipe_id": "team-1"}],
            ],
            "opportunities": [
                [{"id": "opp-existing", "equipe_id": "team-1", "pipeline_id": "pipe-1", "stage_id": "stage-1"}],
            ],
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.create_opportunity("lead-1", "pipe-1")

    assert result.success is True
    assert result.detail["created"] is False
    assert result.detail["opportunity_id"] == "opp-existing"
    assert client.inserts == []


@pytest.mark.asyncio
async def test_create_opportunity_inserts_with_resolved_stage():
    client = FakeClient(
        {
            "leads": [
                [{"id": "lead-1", "equipe_id": "team-1"}],
            ],
            "opportunities": [[]],
            "pipeline_stages_v2": [
                [{"id": "stage-1", "equipe_id": "team-1", "name": "Novo", "position": 0}],
            ],
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result = await skill.create_opportunity("lead-1", "pipe-1")

    assert result.success is True
    insert = client.inserts[0]
    assert insert.table == "opportunities"
    assert insert.payload["equipe_id"] == "team-1"
    assert insert.payload["lead_id"] == "lead-1"
    assert insert.payload["pipeline_id"] == "pipe-1"
    assert insert.payload["stage_id"] == "stage-1"


@pytest.mark.asyncio
async def test_insert_verbs_validate_lead_and_write_expected_tables():
    client = FakeClient(
        {
            "leads": [
                [{"id": "lead-1", "equipe_id": "team-1"}],
                [{"id": "lead-1", "equipe_id": "team-1"}],
                [{"id": "lead-1", "equipe_id": "team-1"}],
            ],
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    touchpoint = await skill.add_touchpoint("lead-1", "whatsapp", "msg {{lead_id}}")
    note = await skill.add_note("lead-1", "note {{lead_id}}")
    task = await skill.create_task("lead-1", "call {{lead_id}}", due_in_hours=2)

    assert touchpoint.success is True
    assert note.success is True
    assert task.success is True
    assert [insert.table for insert in client.inserts] == ["touchpoints", "lead_activities", "tasks"]
    assert client.inserts[0].payload["content"] == "msg lead-1"
    assert client.inserts[1].payload["descricao"] == "note lead-1"
    assert client.inserts[2].payload["title"] == "call lead-1"


@pytest.mark.asyncio
async def test_set_status_sets_closed_at_for_closed_statuses():
    client = FakeClient(
        {
            "opportunities": [
                [{"id": "opp-1", "equipe_id": "team-1"}],
            ]
        }
    )
    skill = CoreTableSkill(client, "team-1", "rep-1")

    result = await skill.set_status("opp-1", "won")

    assert result.success is True
    assert client.updates[0].payload["status"] == "won"
    assert "closed_at" in client.updates[0].payload


@pytest.mark.asyncio
async def test_trigger_webhook_uses_payload(monkeypatch):
    sent = []

    async def fake_post(url, payload):
        sent.append((url, payload))

    monkeypatch.setattr("app.skills.core_table._post_webhook", fake_post)
    skill = CoreTableSkill(FakeClient(), "team-1", "copilot")

    result = await skill.trigger_webhook("https://example.com/hook", {"lead_id": "lead-1"})

    assert result.success is True
    assert sent == [
        (
            "https://example.com/hook",
            {
                "event": "core_table_triggered",
                "equipe_id": "team-1",
                "actor": "copilot",
                "lead_id": "lead-1",
            },
        )
    ]


def test_high_stakes_verbs_require_confirmation():
    meta = CoreTableSkill.confirmation_required_verbs()
    assert "set_status" in meta            # won/lost close
    assert "trigger_webhook" in meta       # external side effect
    assert "set_field" not in meta         # routine enrichment is auto


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
