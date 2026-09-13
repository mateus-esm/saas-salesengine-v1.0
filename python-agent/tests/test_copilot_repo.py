"""Sprint 11 · Onda 6 — the keeper's SQL calls say the types the verbs declare.

Postgres picks a function by the types of the arguments it receives. psycopg
sends a Python float as double precision, and double precision → numeric is
only an assignment cast, so crm_copilot_apply(..., 0.9, ...) with
p_confidence numeric was "function does not exist": every pass of the Copilot
died at the last step, after the model had already answered (13/09).

What these tests protect: every placeholder of the repo's calls carries the
type the migration declares for that parameter. The signatures are read from
the migrations themselves, so the two sides can't drift apart silently.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.copilot.repo import CopilotRepo

MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

ALIASES = {
    "int": "integer",
    "int4": "integer",
    "float8": "double precision",
    "timestamptz": "timestamp with time zone",
    "bool": "boolean",
}


def _norm(type_name: str) -> str:
    t = " ".join(type_name.lower().split())
    return ALIASES.get(t, t)


def _inside_parens(text: str, start: int) -> str:
    """The text between the parenthesis at `start` and the one that closes it."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i]
    raise ValueError("unbalanced parentheses")


def _split_args(args: str) -> list[str]:
    parts, depth, current = [], 0, ""
    for ch in args:
        if ch == "," and depth == 0:
            parts.append(current.strip())
            current = ""
            continue
        depth += ch == "("
        depth -= ch == ")"
        current += ch
    if current.strip():
        parts.append(current.strip())
    return parts


def declared_types(function: str) -> list[str]:
    """Parameter types of the latest migration that (re)creates public.<function>."""
    pattern = re.compile(rf"create\s+or\s+replace\s+function\s+public\.{function}\s*\(", re.I)
    latest = None
    for path in sorted(MIGRATIONS.glob("*.sql")):
        text = path.read_text(encoding="utf-8")
        for match in pattern.finditer(text):
            latest = _inside_parens(text, match.end() - 1)
    if latest is None:
        raise AssertionError(f"no migration creates public.{function}")
    types = []
    for param in _split_args(re.sub(r"--[^\n]*", "", latest)):
        param = re.split(r"\s+default\s+|\s*=\s*", param, maxsplit=1, flags=re.I)[0]
        _name, type_name = param.split(None, 1)
        types.append(_norm(type_name))
    return types


def called_types(sql: str) -> tuple[str, list[str | None]]:
    """The function a repo statement calls and the cast of each argument (None = no cast)."""
    match = re.search(r"public\.(\w+)\s*\(", sql)
    assert match, f"no public function call in: {sql}"
    casts: list[str | None] = []
    for arg in _split_args(_inside_parens(sql, match.end() - 1)):
        cast = re.fullmatch(r"%s::([\w ]+(?:\[\])?)", arg)
        casts.append(_norm(cast.group(1)) if cast else None)
    return match.group(1), casts


class _Recorder:
    """A pool whose cursor records the statement and hands back one empty row."""

    def __init__(self) -> None:
        self.statements: list[tuple[str, tuple[Any, ...]]] = []
        self.closed = False

    def connection(self) -> "_Recorder":
        return self

    def cursor(self) -> "_Recorder":
        return self

    def __enter__(self) -> "_Recorder":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...]) -> None:
        self.statements.append((sql, params))

    def fetchone(self) -> tuple[Any]:
        return ({},)

    def fetchall(self) -> list[tuple[Any]]:
        return []


CALLS = {
    "crm_copilot_claim": lambda repo: repo.claim(10),
    "crm_copilot_context": lambda repo: repo.context("22222222-2222-4222-8222-222222222222"),
    "crm_copilot_apply": lambda repo: repo.apply(
        opportunity_id="22222222-2222-4222-8222-222222222222",
        run_id="33333333-3333-4333-8333-333333333333",
        actions=[],
        summary="Leu a conversa.",
        confidence=0.9,  # a Python float: double precision on the wire
        cursor="2026-09-13T17:46:19+00:00",
        model="deepseek-v4-flash",
    ),
    "crm_copilot_finish": lambda repo: repo.finish("11111111-1111-4111-8111-111111111111", "done", None, {"applied": 1}),
}


@pytest.mark.skipif(not MIGRATIONS.is_dir(), reason="the migrations live next to the agent only in the repo")
@pytest.mark.parametrize("function", sorted(CALLS))
def test_every_argument_carries_the_declared_type(function: str) -> None:
    pool = _Recorder()
    CALLS[function](CopilotRepo(pool))
    assert len(pool.statements) == 1
    name, casts = called_types(pool.statements[0][0])
    assert name == function
    declared = declared_types(function)
    assert len(casts) == len(declared), f"{function}: {len(casts)} arguments for {len(declared)} parameters"
    for position, (cast, want) in enumerate(zip(casts, declared), start=1):
        assert cast == want, f"{function} argument {position}: sent as {cast or 'untyped'}, the function declares {want}"


def test_the_parser_reads_the_apply_signature() -> None:
    if not MIGRATIONS.is_dir():
        pytest.skip("the migrations live next to the agent only in the repo")
    assert declared_types("crm_copilot_apply") == [
        "uuid",
        "uuid",
        "jsonb",
        "text",
        "numeric",
        "timestamp with time zone",
        "text",
    ]
