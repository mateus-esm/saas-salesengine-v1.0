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
