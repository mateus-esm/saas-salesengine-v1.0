import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


CustomFieldType = Literal[
    "text",
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


class CustomFieldBlueprint(BaseModel):
    key: str
    label: str
    type: CustomFieldType
    required: bool = False
    options: list[str] | None = None
    position: int = Field(..., ge=0)
    description: str | None = None

    @field_validator("key")
    @classmethod
    def snake_case(cls, value: str) -> str:
        if not re.fullmatch(r"[a-z][a-z0-9]*(?:_[a-z0-9]+)*", value):
            raise ValueError("key must be lowercase snake_case")
        return value


class StageBlueprint(BaseModel):
    name: str
    position: int = Field(..., ge=0)
    stage_type: Literal["open", "won", "lost"] = "open"
    color: str = "#64748b"
    max_idle_hours: int | None = Field(None, gt=0)
    cadence_value: int | None = Field(None, gt=0)
    cadence_unit: Literal["hours", "days"] | None = None

    @model_validator(mode="after")
    def cadence_pair(self) -> "StageBlueprint":
        if (self.cadence_value is None) != (self.cadence_unit is None):
            raise ValueError("cadence_value and cadence_unit must be set together")
        return self


class PipelineBlueprint(BaseModel):
    pipeline_name: str
    description: str | None = None
    stages: list[StageBlueprint] = Field(..., min_length=1)
    custom_fields: list[CustomFieldBlueprint] = Field(default_factory=list)

    @model_validator(mode="after")
    def contiguous_positions(self) -> "PipelineBlueprint":
        if sorted(stage.position for stage in self.stages) != list(range(len(self.stages))):
            raise ValueError("stage positions must be contiguous from 0")
        if sorted(field.position for field in self.custom_fields) != list(range(len(self.custom_fields))):
            raise ValueError("custom field positions must be contiguous from 0")
        return self


def _none_to_empty_dict(value: Any) -> Any:
    """LLMs (esp. small models) emit ``null`` for empty objects; coerce to {}."""
    return {} if value is None else value


class RouteDecision(BaseModel):
    contact_type: Literal["lead", "contact", "spam", "other"]
    pipeline_id: str | None = None
    stage_id: str | None = None
    confidence: float = Field(ge=0, le=1)
    extracted: dict[str, Any] = Field(default_factory=dict)
    reason: str

    _coerce_extracted = field_validator("extracted", mode="before")(_none_to_empty_dict)


class IntentDecision(BaseModel):
    relevant: bool
    automation_kind: Literal["none", "deterministic", "agentic"] = "none"
    skill: str | None = None
    args: dict[str, Any] = Field(default_factory=dict)
    urgency: Literal["normal", "urgent"] = "normal"
    confidence: float = Field(ge=0, le=1)
    reason: str

    _coerce_args = field_validator("args", mode="before")(_none_to_empty_dict)


class ActionResult(BaseModel):
    success: bool
    detail: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None

    _coerce_detail = field_validator("detail", mode="before")(_none_to_empty_dict)


class PlannedAction(BaseModel):
    """A single action the cascade intends to execute."""

    verb: str
    args: dict[str, Any] = Field(default_factory=dict)
    requires_confirmation: bool = False
    skill: str = "core_table"

    _coerce_args = field_validator("args", mode="before")(_none_to_empty_dict)


class ActionPlan(BaseModel):
    """A Floor-doorman output: an ORDERED list of actions for one pulse."""

    relevant: bool
    actions: list[PlannedAction] = Field(default_factory=list)
    automation_kind: Literal["none", "deterministic", "agentic"] = "deterministic"
    urgency: Literal["normal", "urgent"] = "normal"
    confidence: float = Field(ge=0, le=1)
    reason: str

