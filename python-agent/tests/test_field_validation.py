import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cascade.field_dictionary import FieldDef
from app.cascade.field_validation import validate_field_action
from app.schemas import PlannedAction

_PIPE = {
    "f_valor": FieldDef("f_valor", "Valor da Conta", "currency"),
    "f_conta": FieldDef("f_conta", "Conta de Energia", "file"),
}
_CONTACT = {"cargo": FieldDef("cargo", "Cargo", "text")}


def _v(action):
    return validate_field_action(action, pipeline_fields=_PIPE, contact_fields=_CONTACT)


def test_set_contact_field_known_key_allowed():
    assert _v(PlannedAction(verb="set_contact_field", args={"key": "cargo", "value": "CFO"})) is True


def test_set_contact_field_unknown_key_rejected():
    assert _v(PlannedAction(verb="set_contact_field", args={"key": "cor", "value": "azul"})) is False


def test_set_field_known_id_allowed():
    assert _v(PlannedAction(verb="set_field", args={"field_id": "f_valor", "value": "1000"})) is True


def test_set_field_unknown_id_rejected():
    assert _v(PlannedAction(verb="set_field", args={"field_id": "nope", "value": "x"})) is False


def test_attach_file_only_to_file_type():
    assert _v(PlannedAction(verb="attach_file", args={"field_id": "f_conta", "file_url": "u"})) is True
    assert _v(PlannedAction(verb="attach_file", args={"field_id": "f_valor", "file_url": "u"})) is False


def test_non_core_table_skill_rejected():
    assert _v(PlannedAction(verb="set_field", args={"field_id": "f_valor", "value": "1"}, skill="other")) is False
