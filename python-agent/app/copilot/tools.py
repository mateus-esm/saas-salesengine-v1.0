"""Sprint 11 · Onda 6 · T63 — the chat's read tools.

Each tool is ONE database call, run AS THE LOGGED-IN USER: inside a transaction
the connection takes the `authenticated` role with the user's id in
`request.jwt.claims` — what PostgREST does with the user's token — so the
permissions and the dashboard's scope (a seller sees their own deals) hold
exactly as on the screens. Nothing here writes.

Every result carries the period and filter it used, and links to the real screen
(the Kanban or the Tabela de Leads with the Sprint 11 URL filters), so the answer
can say where the number came from and the user can open it.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import quote

BRT = timezone(timedelta(hours=-3))
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)

BREAKDOWNS = {
    "canal": "channel",
    "campanha": "campaign",
    "plataforma": "platform",
    "entrada": "entry",
    "responsavel": "responsible",
    "linha": "pipeline",
    "produto": "product",
    "motivo_perda": "loss_reason",
    "grupo_origem": "origin_group",
}


class UserDB:
    """Runs SQL as the user (role authenticated + the user's claims), one transaction per call."""

    def __init__(self, pool: Any, user_id: str) -> None:
        self.pool = pool
        self.user_id = user_id

    def call(self, sql: str, params: tuple[Any, ...] = ()) -> Any:
        from app.copilot.repo import _ensure_open

        _ensure_open(self.pool)
        claims = json.dumps({"sub": self.user_id, "role": "authenticated"})
        with self.pool.connection() as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute("set local role authenticated")
                    cur.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
                    cur.execute(sql, params)
                    row = cur.fetchone()
                    return row[0] if row else None


# ── periods, ids, links ─────────────────────────────────────────────────────


def today_brt(now: datetime | None = None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(BRT).date()


def _day(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def period(args: dict[str, Any], today: date) -> dict[str, str]:
    """[de, ate] in local days; no period asked = the current month so far."""
    start = _day(args.get("de")) or today.replace(day=1)
    end = _day(args.get("ate")) or today
    if end < start:
        start, end = end, start
    lower = datetime(start.year, start.month, start.day, tzinfo=BRT)
    upper = datetime(end.year, end.month, end.day, tzinfo=BRT) + timedelta(days=1)
    return {"de": start.isoformat(), "ate": end.isoformat(), "from": lower.isoformat(), "to": upper.isoformat()}


def _uuid(value: Any) -> str | None:
    return value if isinstance(value, str) and _UUID.match(value) else None


def deal_link(pipeline_id: str, contact: str | None) -> str:
    link = f"/crm?tab=pipeline&pipeline={pipeline_id}"
    return link + (f"&q={quote(contact)}" if contact else "")


def list_link(pipeline_id: str, *, search: str | None = None, owner_ids: list[str] | None = None,
              stage_ids: list[str] | None = None, statuses: list[str] | None = None) -> str:
    link = f"/crm?tab=pipeline&pipeline={pipeline_id}&view=table"
    if search:
        link += f"&q={quote(search)}"
    if owner_ids:
        link += "&resp=" + ",".join(owner_ids)
    if stage_ids:
        link += "&etapa=" + ",".join(stage_ids)
    if statuses:
        link += "&status=" + ",".join(statuses)
    return link


# ── resolving names to ids (as the user) ────────────────────────────────────


def resolve_line(db: UserDB, value: Any) -> dict[str, str] | None:
    if not value:
        return None
    if _uuid(value):
        return db.call(
            "select jsonb_build_object('id', p.id, 'nome', p.name) from public.pipelines p where p.id = %s::uuid and p.deleted_at is null",
            (value,),
        )
    return db.call(
        "select jsonb_build_object('id', p.id, 'nome', p.name) from public.pipelines p "
        "where p.deleted_at is null and p.name ilike %s order by length(p.name) limit 1",
        (f"%{value}%",),
    )


def resolve_owner(db: UserDB, value: Any) -> dict[str, str] | None:
    if not value:
        return None
    if _uuid(value):
        return db.call(
            "select jsonb_build_object('id', m.id, 'nome', m.nome_completo) from public.crm_team_members() m where m.id = %s::uuid",
            (value,),
        )
    return db.call(
        "select jsonb_build_object('id', m.id, 'nome', m.nome_completo) from public.crm_team_members() m "
        "where m.nome_completo ilike %s order by length(m.nome_completo) limit 1",
        (f"%{value}%",),
    )


def _scope(db: UserDB, args: dict[str, Any]) -> tuple[dict | None, dict | None, list[str] | None, list[str] | None]:
    line = resolve_line(db, args.get("linha"))
    owner = resolve_owner(db, args.get("responsavel"))
    return line, owner, ([line["id"]] if line else None), ([owner["id"]] if owner else None)


def _filters_used(line: dict | None, owner: dict | None) -> dict[str, str]:
    used = {}
    if line:
        used["linha"] = line["nome"]
    if owner:
        used["responsavel"] = owner["nome"]
    return used or {"escopo": "tudo o que você pode ver"}


# ── the tools ───────────────────────────────────────────────────────────────


def t_resumo(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    p = period(args, today)
    line, owner, lines, owners = _scope(db, args)
    data = db.call(
        "select public.get_funnel_overview(%s::timestamptz, %s::timestamptz, %s::uuid[], %s::uuid[], null)",
        (p["from"], p["to"], lines, owners),
    )
    return {"periodo": {"de": p["de"], "ate": p["ate"]}, "filtro": _filters_used(line, owner), "dados": data}


def t_quebra(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    dimension = BREAKDOWNS.get(str(args.get("dimensao") or ""))
    if not dimension:
        return {"erro": "dimensão desconhecida", "dimensoes": sorted(BREAKDOWNS)}
    p = period(args, today)
    line, owner, lines, owners = _scope(db, args)
    rows = db.call(
        "select public.get_funnel_breakdown(%s, %s::timestamptz, %s::timestamptz, %s::uuid[], %s::uuid[], null)",
        (dimension, p["from"], p["to"], lines, owners),
    ) or []
    return {"periodo": {"de": p["de"], "ate": p["ate"]}, "filtro": _filters_used(line, owner),
            "dimensao": args.get("dimensao"), "linhas": rows[:15]}


def t_evolucao(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    granularity = args.get("granularidade") if args.get("granularidade") in ("day", "week", "month") else "week"
    p = period(args, today)
    line, owner, lines, owners = _scope(db, args)
    rows = db.call(
        "select public.get_funnel_series(%s::timestamptz, %s::timestamptz, %s, %s::uuid[], %s::uuid[], null)",
        (p["from"], p["to"], granularity, lines, owners),
    ) or []
    return {"periodo": {"de": p["de"], "ate": p["ate"]}, "filtro": _filters_used(line, owner),
            "granularidade": granularity, "pontos": rows[-26:]}


def t_retorno(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    p = period(args, today)
    line, owner, lines, owners = _scope(db, args)
    rows = db.call(
        "select public.crm_campaign_report(%s::timestamptz, %s::timestamptz, %s::uuid[], %s::uuid[])",
        (p["from"], p["to"], lines, owners),
    ) or []
    return {"periodo": {"de": p["de"], "ate": p["ate"]}, "filtro": _filters_used(line, owner),
            "campanhas": rows[:15], "link": "/crm?tab=campanhas"}


def t_placar(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    line = resolve_line(db, args.get("linha"))
    if not line:
        return {"erro": "diga a linha (pipeline) do placar"}
    start = today.replace(day=1)
    end = (start + timedelta(days=32)).replace(day=1)
    data = db.call(
        "select public.crm_placar(%s::uuid, %s::timestamptz, %s::timestamptz)",
        (line["id"], datetime(start.year, start.month, 1, tzinfo=BRT).isoformat(),
         datetime(end.year, end.month, 1, tzinfo=BRT).isoformat()),
    )
    return {"periodo": {"de": start.isoformat(), "ate": (end - timedelta(days=1)).isoformat()},
            "linha": line["nome"], "placar": data, "link": f"/crm?tab=pipeline&pipeline={line['id']}"}


def t_linhas(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    data = db.call(
        "select jsonb_build_object("
        " 'linhas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.name, 'etapas',"
        "   (select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.name, 'tipo', s.stage_type) order by s.position)"
        "      from public.pipeline_stages_v2 s where s.pipeline_id = p.id and s.deleted_at is null)) order by p.name)"
        "   from public.pipelines p where p.deleted_at is null), '[]'::jsonb),"
        " 'responsaveis', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome_completo) order by m.nome_completo)"
        "   from public.crm_team_members() m), '[]'::jsonb))"
    )
    return data or {}


def _compact_row(row: dict[str, Any]) -> dict[str, Any]:
    lead = row.get("lead") if isinstance(row.get("lead"), dict) else {}
    return {k: v for k, v in {
        "id": row.get("id"),
        "contato": lead.get("name") or row.get("lead_name") or row.get("name"),
        "etapa": row.get("stage_name") or row.get("stage"),
        "valor": row.get("value"),
        "responsavel": row.get("owner_name"),
        "status": row.get("status"),
        "proximo_contato": row.get("next_contact_at") or row.get("next_contact"),
    }.items() if v not in (None, "")}


def t_negocios(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    line = resolve_line(db, args.get("linha"))
    if not line:
        return {"erro": "diga a linha (pipeline); veja em 'linhas'"}
    owner = resolve_owner(db, args.get("responsavel"))
    stage_ids = None
    if args.get("etapa"):
        stage = db.call(
            "select s.id::text from public.pipeline_stages_v2 s where s.pipeline_id = %s::uuid and s.deleted_at is null "
            "and (s.id::text = %s or s.name ilike %s) order by length(s.name) limit 1",
            (line["id"], str(args["etapa"]), f"%{args['etapa']}%"),
        )
        stage_ids = [stage] if stage else None
    statuses = [s for s in (args.get("status") or ["open"]) if s in ("open", "won", "lost")] or ["open"]
    filters: dict[str, Any] = {"statuses": statuses}
    if args.get("texto"):
        filters["search"] = str(args["texto"])[:80]
    if owner:
        filters["owner_ids"] = [owner["id"]]
    if stage_ids:
        filters["stage_ids"] = stage_ids
    if args.get("proximo_contato") in ("overdue", "today", "week", "none"):
        filters["next_contact"] = args["proximo_contato"]
    sort_key = args.get("ordem") if args.get("ordem") in ("value", "created_at", "stage_entered_at", "next_contact") else "value"
    limit = max(1, min(int(args.get("limite") or 10), 20))
    rows = db.call(
        "select public.crm_opp_table(%s::uuid, %s::jsonb, %s::jsonb, %s, 0)",
        (line["id"], json.dumps(filters), json.dumps({"key": sort_key, "dir": "desc"}), limit),
    ) or []
    return {
        "linha": line["nome"], "filtro": {**filters, **({"responsavel": owner["nome"]} if owner else {})},
        "negocios": [_compact_row(r) for r in rows],
        "link": list_link(line["id"], search=filters.get("search"), owner_ids=filters.get("owner_ids"),
                          stage_ids=stage_ids, statuses=statuses),
    }


def t_buscar(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    text = str(args.get("texto") or "").strip()[:80]
    if len(text) < 2:
        return {"erro": "diga pelo menos 2 letras do nome"}
    rows = db.call(
        "select coalesce(jsonb_agg(x), '[]'::jsonb) from ("
        " select o.id, l.name as contato, pl.id as linha_id, pl.name as linha, s.name as etapa, o.value as valor, o.status"
        "   from public.opportunities o join public.leads l on l.id = o.lead_id"
        "   left join public.pipelines pl on pl.id = o.pipeline_id"
        "   left join public.pipeline_stages_v2 s on s.id = o.stage_id"
        "  where o.deleted_at is null and l.deleted_at is null and l.name ilike %s"
        "  order by o.updated_at desc nulls last limit 8) x",
        (f"%{text}%",),
    ) or []
    for r in rows:
        r["link"] = deal_link(r.pop("linha_id"), r.get("contato"))
    return {"texto": text, "negocios": rows}


def t_negocio(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    deal_id = _uuid(args.get("id"))
    if not deal_id and args.get("texto"):
        found = t_buscar(db, {"texto": args["texto"]}, today).get("negocios") or []
        if len(found) != 1:
            return {"escolha": found} if found else {"erro": "nenhum negócio com esse nome"}
        deal_id = found[0]["id"]
    if not deal_id:
        return {"erro": "diga o negócio (nome do contato)"}
    brief = db.call("select public.crm_copilot_deal_brief(%s::uuid)", (deal_id,)) or {}
    opp = brief.get("opportunity") or {}
    pipeline_id = db.call("select o.pipeline_id::text from public.opportunities o where o.id = %s::uuid", (deal_id,))
    if pipeline_id:
        brief["link"] = deal_link(pipeline_id, opp.get("contact"))
    return brief


def t_onde_focar(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    owner = resolve_owner(db, args.get("responsavel"))
    limit = max(1, min(int(args.get("limite") or 7), 15))
    rows = db.call("select public.crm_focus_list(%s::uuid, %s)", (owner["id"] if owner else None, limit)) or []
    if rows:
        lines = db.call(
            "select jsonb_object_agg(o.id::text, o.pipeline_id::text) from public.opportunities o where o.id = any(%s::uuid[])",
            ([r["opportunity_id"] for r in rows],),
        ) or {}
        for r in rows:
            if lines.get(r["opportunity_id"]):
                r["link"] = deal_link(lines[r["opportunity_id"]], r.get("contact"))
    return {"filtro": _filters_used(None, owner), "negocios": rows,
            "como_pontua": "cliente esperando +25; escreveu em 24 h +35 (72 h +20); parado além do SLA +20; "
                           "tarefa atrasada +15; sugestão esperando +15; valor até +30"}


def t_perdas(db: UserDB, args: dict[str, Any], today: date) -> dict[str, Any]:
    p = period(args, today)
    line, owner, lines, owners = _scope(db, args)
    rows = db.call(
        "select public.get_loss_reasons(%s::timestamptz, %s::timestamptz, %s::uuid[], %s::uuid[])",
        (p["from"], p["to"], lines, owners),
    ) or []
    return {"periodo": {"de": p["de"], "ate": p["ate"]}, "filtro": _filters_used(line, owner), "motivos": rows[:15]}


Tool = Callable[[UserDB, dict[str, Any], date], dict[str, Any]]

TOOLS: dict[str, tuple[Tool, str, str]] = {
    "resumo": (t_resumo, "Resumo do período",
               "números do funil no período: leads, negócios, qualificados, propostas, reuniões, ganhos, perdas, receita. args: de, ate, linha?, responsavel?"),
    "quebra": (t_quebra, "Quebra",
               f"os mesmos números por dimensão. args: dimensao ({', '.join(BREAKDOWNS)}), de, ate, linha?, responsavel?"),
    "evolucao": (t_evolucao, "Evolução",
                 "a série no tempo. args: de, ate, granularidade (day|week|month), linha?, responsavel?"),
    "retorno": (t_retorno, "Retorno das campanhas",
                "por campanha: leads, negócios, ganhos, receita, investimento, CPL, custo por ganho, ROAS, ROI. args: de, ate, linha?, responsavel?"),
    "placar": (t_placar, "Placar", "meta, realizado, ritmo e o que falta no mês de uma linha. args: linha"),
    "linhas": (t_linhas, "Linhas e equipe", "as linhas (pipelines) com etapas e as pessoas da equipe. args: nenhum"),
    "negocios": (t_negocios, "Negócios",
                 "lista de negócios de uma linha. args: linha, etapa?, responsavel?, texto?, status? (open|won|lost), "
                 "proximo_contato? (overdue|today|week|none), ordem? (value|created_at|stage_entered_at|next_contact), limite?"),
    "buscar": (t_buscar, "Busca", "acha negócios pelo nome do contato. args: texto"),
    "negocio": (t_negocio, "Negócio",
                "um negócio: resumo do Copilot, origem, tarefas, pendências, últimas ações. args: id ou texto (nome do contato)"),
    "onde_focar": (t_onde_focar, "Onde focar",
                   "os negócios que pedem atenção agora, com o motivo. args: responsavel?, limite?"),
    "perdas": (t_perdas, "Motivos de perda", "por que os negócios foram perdidos no período. args: de, ate, linha?, responsavel?"),
}


def run_tool(db: UserDB, name: str, args: dict[str, Any], today: date) -> dict[str, Any]:
    """Run one tool; never raises — an error comes back as data the answer can mention."""
    spec = TOOLS.get(name)
    if not spec:
        return {"erro": f"ferramenta desconhecida: {name}"}
    try:
        return spec[0](db, args if isinstance(args, dict) else {}, today)
    except Exception as exc:  # the answer says the query failed; nothing is invented
        return {"erro": f"a consulta falhou: {str(exc)[:200]}"}
