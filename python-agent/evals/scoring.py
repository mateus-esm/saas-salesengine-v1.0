"""Sprint 11 · Onda 6 · T66 — how the Copilot's answers are scored.

Deterministic, so the scoring itself is unit-tested in CI (tests/test_eval_scoring.py)
while the model evals that use it run pre-deploy:

  invalid_refs   — an action that points at an id the context never gave
                   (the database would refuse it; the model should not try);
  score_case     — which expected actions came, which forbidden ones came;
  stray_numbers  — numbers in a chat answer that no result carried
                   (the one thing the chat must never do).
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Callable

Action = dict[str, Any]


def invalid_refs(actions: list[Action], ctx: dict[str, Any]) -> list[Action]:
    stage_ids = {s.get("id") for s in ctx.get("stages") or []}
    field_ids = {f.get("field_id") for f in ctx.get("fields") or []}
    bad = []
    for a in actions:
        if a.get("type") == "move_stage" and a.get("stage_id") not in stage_ids:
            bad.append(a)
        if a.get("type") == "set_field" and a.get("field_id") not in field_ids:
            bad.append(a)
    return bad


def _fold(text: Any) -> str:
    return unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode().lower().strip()


def _num(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.replace("R$", "").strip()
        if "," in text:
            text = text.replace(".", "").replace(",", ".")
        try:
            return float(text)
        except ValueError:
            return None
    return None


@dataclass
class Expect:
    """An action that should come: its type and, optionally, what it must say."""

    type: str
    key: dict[str, Any] = field(default_factory=dict)
    check: Callable[[Action], bool] | None = None
    any_of: list["Expect"] | None = None  # either this one or one of these

    def matches(self, action: Action) -> bool:
        if action.get("type") != self.type:
            return False
        for k, v in self.key.items():
            got = action.get(k)
            if isinstance(v, (int, float)):
                if _num(got) != float(v):
                    return False
            elif _fold(got) != _fold(v):
                return False
        return self.check(action) if self.check else True

    def found_in(self, actions: list[Action]) -> bool:
        options = [self, *(self.any_of or [])]
        return any(opt.matches(a) for opt in options for a in actions)


@dataclass
class CaseScore:
    hits: int
    expected: int
    violations: list[Action]
    invalid: list[Action]


def score_case(actions: list[Action], ctx: dict[str, Any], expected: list[Expect], forbidden: list[str]) -> CaseScore:
    hits = sum(1 for e in expected if e.found_in(actions))
    violations = [a for a in actions if a.get("type") in forbidden]
    return CaseScore(hits=hits, expected=len(expected), violations=violations, invalid=invalid_refs(actions, ctx))


_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def _numbers_in(text: str) -> set[float]:
    found: set[float] = set()
    for token in _NUMBER.findall(text):
        # 45.000,00 / 45,5 / 1.259 / 12 → as the Brazilian writes them; also the plain reading.
        candidates = {token}
        if "," in token:
            candidates.add(token.replace(".", "").replace(",", "."))
        elif re.fullmatch(r"\d{1,3}(\.\d{3})+", token):
            candidates.add(token.replace(".", ""))
        for c in candidates:
            try:
                found.add(float(c))
            except ValueError:
                pass
        for part in re.split(r"[.,]", token):  # dates (14/09), times and pieces of a period
            if part:
                found.add(float(part))
    return found


def stray_numbers(answer: str, results: Any, question: str = "") -> list[float]:
    """Numbers in the answer that neither the results nor the question carried.

    Allowed: every number in the results (as written, split in pieces for dates,
    and ÷1000 for "45 mil"), and numbers the question itself had.
    """
    source = json.dumps(results, ensure_ascii=False, default=str) + " " + question
    allowed = _numbers_in(source)
    allowed |= {round(n / 1000, 3) for n in allowed if n >= 1000}
    allowed |= {round(n / 1_000_000, 3) for n in allowed if n >= 1_000_000}
    stray = []
    for token in _NUMBER.findall(answer):
        readings = _numbers_in(token)
        if not readings & allowed:
            stray.append(sorted(readings)[0])
    return stray
