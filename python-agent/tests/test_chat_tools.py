"""Sprint 11 · Onda 6 · T63 — the chat's read tools.

What these tests protect: the period defaults to the month so far and ends the
day after (local time); links point at the real screens with the Sprint 11 URL
filters; an unknown dimension or missing line answers with an error without
touching the database; names resolve to ids; a failing query becomes data, never
an exception; every tool runs as the user (the SQL sees the user's claims).
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.copilot.tools import TOOLS, UserDB, deal_link, list_link, period, run_tool

TODAY = date(2026, 9, 14)
LINE = {"id": "11111111-1111-4111-8111-111111111111", "nome": "Usinas"}


class FakeDB:
    """Answers by the first SQL keyword that matches; records every call."""

    def __init__(self, answers: dict[str, object] | None = None, fail: bool = False):
        self.answers = answers or {}
        self.fail = fail
        self.calls: list[tuple[str, tuple]] = []

    def call(self, sql, params=()):
        self.calls.append((sql, params))
        if self.fail:
            raise RuntimeError("permission denied")
        for key, value in self.answers.items():
            if key in sql:
                return value
        return None


def test_the_period_is_the_month_so_far_in_local_days():
    p = period({}, TODAY)
    assert (p["de"], p["ate"]) == ("2026-09-01", "2026-09-14")
    assert p["from"] == "2026-09-01T00:00:00-03:00" and p["to"] == "2026-09-15T00:00:00-03:00"
    assert period({"de": "2026-09-10", "ate": "2026-09-01"}, TODAY)["de"] == "2026-09-01"


def test_links_point_at_the_real_screens():
    assert deal_link("p1", "Maria Souza") == "/crm?tab=pipeline&pipeline=p1&q=Maria%20Souza"
    assert list_link("p1", owner_ids=["u1"], stage_ids=["s1", "s2"], statuses=["open"]) == \
        "/crm?tab=pipeline&pipeline=p1&view=table&resp=u1&etapa=s1,s2&status=open"


def test_unknown_dimension_and_missing_line_answer_without_touching_the_database():
    db = FakeDB()
    assert "erro" in run_tool(db, "quebra", {"dimensao": "signo"}, TODAY)
    assert "erro" in run_tool(db, "placar", {}, TODAY)
    assert "erro" in run_tool(db, "negocios", {}, TODAY)
    assert "erro" in run_tool(db, "ferramenta_que_nao_existe", {}, TODAY)
    assert db.calls == []


def test_the_breakdown_resolves_the_line_by_name_and_keeps_the_period():
    db = FakeDB({"from public.pipelines p": LINE, "get_funnel_breakdown": [{"label": "Verão"}] * 20})
    out = run_tool(db, "quebra", {"dimensao": "campanha", "linha": "usinas"}, TODAY)
    assert out["filtro"] == {"linha": "Usinas"} and out["periodo"] == {"de": "2026-09-01", "ate": "2026-09-14"}
    assert len(out["linhas"]) == 15
    sql, params = db.calls[-1]
    assert "get_funnel_breakdown" in sql and params[0] == "campaign" and params[3] == [LINE["id"]]


def test_deal_lists_carry_the_filters_and_the_table_link():
    db = FakeDB({
        "from public.pipelines p": LINE,
        "crm_team_members": {"id": "22222222-2222-4222-8222-222222222222", "nome": "Bia"},
        "crm_opp_table": [{"id": "o1", "lead": {"name": "Ana"}, "value": 1000, "owner_name": "Bia", "status": "open"}],
    })
    out = run_tool(db, "negocios", {"linha": "Usinas", "responsavel": "bia", "limite": 99}, TODAY)
    assert out["negocios"] == [{"id": "o1", "contato": "Ana", "valor": 1000, "responsavel": "Bia", "status": "open"}]
    assert out["link"] == f"/crm?tab=pipeline&pipeline={LINE['id']}&view=table&resp=22222222-2222-4222-8222-222222222222&status=open"
    sql, params = db.calls[-1]
    assert json.loads(params[1]) == {"statuses": ["open"], "owner_ids": ["22222222-2222-4222-8222-222222222222"]}
    assert params[3] == 20  # limite capped


def test_a_failing_query_becomes_data():
    out = run_tool(FakeDB(fail=True), "resumo", {}, TODAY)
    assert out["erro"].startswith("a consulta falhou")


def test_every_tool_is_documented_for_the_planner():
    for name, (fn, label, doc) in TOOLS.items():
        assert callable(fn) and label and doc


class FakeCursor:
    def __init__(self, log):
        self.log = log

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.log.append((sql, params))

    def fetchone(self):
        return ({"ok": True},)


class FakeConn:
    def __init__(self, log):
        self.log = log

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def transaction(self):
        return self

    def cursor(self):
        return FakeCursor(self.log)


class FakePool:
    closed = False

    def __init__(self):
        self.log: list = []

    def connection(self):
        return FakeConn(self.log)


def test_the_user_db_runs_as_the_user_inside_a_transaction():
    pool = FakePool()
    assert UserDB(pool, "u-1").call("select 1") == {"ok": True}
    assert pool.log[0][0] == "set local role authenticated"
    assert json.loads(pool.log[1][1][0]) == {"sub": "u-1", "role": "authenticated"}
    assert pool.log[2][0] == "select 1"
