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
            return SimpleNamespace(data=[payload], error=None)
        return SimpleNamespace(data=None, error=None)


class FakeClient:
    def __init__(self, selects=None):
        self.selects = selects or {}
        self.calls = []
        self.inserts = []

    def table(self, table):
        return FakeQuery(self, table)


@pytest.mark.asyncio
async def test_resync_with_no_new_info_adds_no_duplicate_note():
    """Calling add_note twice with identical content should only insert once."""
    client = FakeClient(
        {
            "leads": [
                [{"id": "L1", "equipe_id": "team-1"}],
                [{"id": "L1", "equipe_id": "team-1"}],
            ],
            "lead_activities": [
                [],  # first call: no existing notes
                [{"id": "n1", "equipe_id": "team-1", "descricao": "same text"}],  # second call: existing note
            ],
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result1 = await skill.add_note("L1", "same text")
    assert result1.success is True
    assert result1.detail["action"] == "add_note"
    assert "deduped" not in result1.detail

    result2 = await skill.add_note("L1", "same text")
    assert result2.success is True
    assert result2.detail == {"action": "add_note", "deduped": True}

    # Only one insert should have happened
    assert len(client.inserts) == 1


@pytest.mark.asyncio
async def test_note_with_new_info_is_added():
    """Calling add_note with different content should insert each time."""
    client = FakeClient(
        {
            "leads": [
                [{"id": "L1", "equipe_id": "team-1"}],
                [{"id": "L1", "equipe_id": "team-1"}],
            ],
            "lead_activities": [
                [],  # first call: no existing notes
                [{"id": "n1", "equipe_id": "team-1", "descricao": "note one"}],  # second call: different text exists
            ],
        }
    )
    skill = CoreTableSkill(client, "team-1", "copilot")

    result1 = await skill.add_note("L1", "note one")
    assert result1.success is True
    assert result1.detail["action"] == "add_note"
    assert "deduped" not in result1.detail

    result2 = await skill.add_note("L1", "note two")
    assert result2.success is True
    assert result2.detail["action"] == "add_note"

    # Two inserts should have happened
    assert len(client.inserts) == 2
