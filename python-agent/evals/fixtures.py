"""Seed fixtures for the Evals dyno.

DOORMAN_CASES feed the Tower+Floor path; each pins the expected contact route
and the expected first ActionPlan verb so accuracy regressions are caught.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DoormanCase:
    id: str
    conversation: str
    expected_contact_type: str  # lead | client | spam | other
    expected_first_verb: str    # the first structural verb we expect proposed
    note: str = ""


# A small, hand-labeled set. verboo can expand this; the regression guard
# (test_eval_reliability) only needs one known-correct case to fail loudly.
DOORMAN_CASES: list[DoormanCase] = [
    DoormanCase(
        id="solar_budget",
        conversation=(
            "Cliente: Oi, tenho uma conta de luz de uns 1200 reais por mês, "
            "consumo perto de 12 kWp. Queria um orçamento de energia solar."
        ),
        expected_contact_type="lead",
        expected_first_verb="set_field",
        note="Enrich consumption then advance — classic qualified lead.",
    ),
    DoormanCase(
        id="won_close",
        conversation=(
            "Cliente: Fechado! Pode emitir o contrato, vou pagar a entrada hoje."
        ),
        expected_contact_type="client",
        expected_first_verb="set_status",
        note="High-stakes won close → must route to strategic tier + HITL.",
    ),
    DoormanCase(
        id="spam",
        conversation="Promoção imperdível!!! Clique aqui para ganhar um iPhone grátis",
        expected_contact_type="spam",
        expected_first_verb="",
        note="Spam → no structural action.",
    ),
]


# A plan with a verb that does not exist on the Core-Table skill — the executor
# must REPORT it as failed, never invent a tool or fabricate tenant scope.
BOGUS_VERB = "definitely_not_a_real_verb"
