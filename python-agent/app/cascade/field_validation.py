"""Single source of truth: may this action write to its target field?

Used by the enricher (filters its own proposals) AND the executor (bounds
EVERY producer's field-writes, including the Floor doorman). A field-writing
action survives only if its target exists in the relevant dictionary —
otherwise the agent would be inventing a field. No match → not allowed.
"""

from __future__ import annotations

from app.cascade.field_dictionary import FieldDef
from app.schemas import PlannedAction

# core_table verbs that write into a tenant-defined field.
FIELD_WRITE_VERBS = frozenset({"set_field", "set_contact_field", "attach_file"})


def validate_field_action(
    action: PlannedAction,
    *,
    pipeline_fields: dict[str, FieldDef],
    contact_fields: dict[str, FieldDef],
) -> bool:
    if action.skill != "core_table" or action.verb not in FIELD_WRITE_VERBS:
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
