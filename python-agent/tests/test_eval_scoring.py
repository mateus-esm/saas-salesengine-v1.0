"""Sprint 11 · Onda 6 · T66 — the scoring of the evals, checked without a model.

What these tests protect: an id the context never gave is caught; an expected
action matches by type and value (numbers in Brazilian writing, text without
accents or case), or by one of its alternatives; forbidden actions are counted;
a number in a chat answer that no result carried is caught — and dates, "mil",
R$ with cents and the question's own numbers are not false alarms.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evals.keeper_cases import KEEPER_CASES
from evals.scoring import Expect, invalid_refs, score_case, stray_numbers

CTX = KEEPER_CASES[0].ctx


def test_an_id_the_context_never_gave_is_caught():
    actions = [
        {"type": "move_stage", "stage_id": "st-qualif"},
        {"type": "move_stage", "stage_id": "etapa-inventada"},
        {"type": "set_field", "field_id": "f-consumo", "value": 1},
        {"type": "set_field", "field_id": "tipo_de_telhado", "value": "x"},
    ]
    assert [a.get("stage_id") or a.get("field_id") for a in invalid_refs(actions, CTX)] == ["etapa-inventada", "tipo_de_telhado"]


def test_expected_actions_match_by_value_and_alternatives():
    assert Expect("set_field", {"field_id": "f-consumo", "value": 450}).found_in([{"type": "set_field", "field_id": "f-consumo", "value": "450,0"}])
    assert Expect("set_field", {"field_id": "f-telhado", "value": "cerâmica"}).found_in([{"type": "set_field", "field_id": "f-telhado", "value": "CERAMICA"}])
    won = Expect("set_outcome", {"outcome": "won"}, any_of=[Expect("move_stage", {"stage_id": "st-ganho"})])
    assert won.found_in([{"type": "move_stage", "stage_id": "st-ganho"}])
    assert not won.found_in([{"type": "move_stage", "stage_id": "st-prop"}])


def test_score_counts_hits_violations_and_invalid_ids():
    case = KEEPER_CASES[0]
    score = score_case(
        [{"type": "set_field", "field_id": "f-consumo", "value": 450}, {"type": "set_outcome", "outcome": "won"}],
        case.ctx, case.expected, case.forbidden,
    )
    assert (score.hits, score.expected, len(score.violations), score.invalid) == (1, 3, 1, [])


def test_every_case_has_valid_expectations():
    for case in KEEPER_CASES:
        for e in case.expected:
            ids = [e.key.get("stage_id"), e.key.get("field_id")]
            assert not invalid_refs([{"type": e.type, **e.key}], case.ctx) or not any(ids), case.name


RESULTS = {"periodo": {"de": "2026-09-01", "ate": "2026-09-14"}, "dados": {"new_leads": 124, "deals_won": 6, "won_value": 213500.0}}


def test_numbers_from_the_results_are_allowed_in_any_brazilian_writing():
    answer = "De 01/09 a 14/09 entraram 124 leads e 6 ganhos, com R$ 213.500,00 (213,5 mil) de receita."
    assert stray_numbers(answer, RESULTS) == []


def test_an_invented_number_is_caught():
    assert stray_numbers("Entraram 124 leads e a conversão foi de 37%.", RESULTS) == [37.0]


def test_the_questions_own_numbers_are_not_invented():
    assert stray_numbers("Nos últimos 30 dias: 124 leads.", RESULTS, "como foram os últimos 30 dias?") == []
