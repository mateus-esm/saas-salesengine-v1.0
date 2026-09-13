"""What the keeper's model answers.

The model only proposes. Every action is checked again by the database
(crm_copilot_apply: ids from the context, the field's type, the pipeline's
stages, no duplicates) and classified there as safe or risky — so this schema is
deliberately loose: it guarantees the shape, not the content.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

ACTION_TYPES = (
    "note",
    "set_field",
    "set_contact",
    "create_task",
    "add_tag",
    "move_stage",
    "set_outcome",
    "set_value",
)


class KeeperOutput(BaseModel):
    """The deal's updated summary, how sure the model is, and the proposed actions."""

    summary: str = Field(default="", max_length=4000)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    actions: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("actions", mode="before")
    @classmethod
    def _dicts_only(cls, value: Any) -> list[dict[str, Any]]:
        # A model that answers `actions: null` or a stray string proposes nothing;
        # anything that is not an object cannot be an action. The database refuses
        # what is left over (unknown type, unknown id) with a reason.
        if not isinstance(value, list):
            return []
        return [a for a in value if isinstance(a, dict)][:20]
