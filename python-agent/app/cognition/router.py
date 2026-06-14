"""Cost-tiered cognition router for Copilot decisions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

Tier = Literal["cheap", "strategic"]


@dataclass(frozen=True)
class Stakes:
    stage_type: str = "open"
    deal_value: float | None = None
    cheap_confidence: float | None = None


def select_tier(
    stakes: Stakes,
    *,
    escalate_threshold: float = 0.60,
    deal_value_strategic_threshold: float | None = None,
) -> Tier:
    """Pick the cheapest tier allowed by the decision stakes."""
    if stakes.stage_type in {"won", "lost"}:
        return "strategic"
    if (
        deal_value_strategic_threshold is not None
        and stakes.deal_value is not None
        and stakes.deal_value >= deal_value_strategic_threshold
    ):
        return "strategic"
    if stakes.cheap_confidence is not None and stakes.cheap_confidence < escalate_threshold:
        return "strategic"
    return "cheap"


def _rule(rules: Any, key: str, default: Any = None) -> Any:
    if isinstance(rules, dict):
        return rules.get(key, default)
    return getattr(rules, key, default)


def select_model(stakes: Stakes, rules: Any, settings: Any) -> str:
    """Resolve the model id for the selected tier.

    Per-pipeline rules win over service settings. The cheap tier uses the
    doorman model; the strategic tier uses the strategic model with a worker
    model fallback for older settings objects.
    """
    threshold = _rule(rules, "escalate_threshold", 0.60)
    tier = select_tier(
        stakes,
        escalate_threshold=float(threshold if threshold is not None else 0.60),
        deal_value_strategic_threshold=_rule(rules, "deal_value_strategic_threshold"),
    )
    if tier == "strategic":
        return (
            _rule(rules, "strategic_model")
            or getattr(settings, "strategic_model", None)
            or getattr(settings, "worker_model")
        )
    return _rule(rules, "doorman_model") or getattr(settings, "doorman_model")
