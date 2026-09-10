#!/usr/bin/env python3
"""Sprint 11 · T9 — reparo dos dados que a Sprint 10 importou torto.

A migração da Sprint 10 (scripts/migrate_solo_energia.py) deixou quatro coisas
erradas na base da Solo Energia:

  1. created_at de todo lead = dia da importação (parse_dt não aceitava a própria
     saída ISO; corrigido e testado em scripts/test_migrate_solo_energia.py).
  2. stage_entered_at de todo negócio = dia da importação ("tempo na etapa" e as
     SLAs contando do zero); closed_at de 564 ganhos/perdas em branco, e os eventos
     de funil de 137 ganhos e 503 perdas datados em setembro.
  3. responsável do Jestor guardado em custom_data, sem virar owner.
  4. dez campos gravados em custom_data sem declarar no pipeline — invisíveis.

Este script NÃO toca no banco. Ele relê os CSVs do Jestor, refaz a deduplicação e
o roteamento da Sprint 10 na mesma ordem, e pareia cada linha com o id que ela
recebeu, lendo o SQL que a Sprint 10 gerou (Planning/Assets/migration_solo_energia.sql).
Qualquer divergência de nome ou de vínculo no pareamento aborta.

Gera, fora do git:
  Planning/Assets/repair_solo_energia_sprint11.sql            o reparo (begin … commit)
  Planning/Assets/repair_solo_energia_sprint11.rehearsal.sql  o mesmo, com o DDL da
                                                              migration do owner (T2)
                                                              na frente, para ensaiar
                                                              antes do deploy
  Planning/Assets/repair_report_solo_energia.md               números do pareamento

Uso:
  python scripts/repair_solo_energia_sprint11.py
  python supabase/scripts/run_sql.py Planning/Assets/repair_solo_energia_sprint11.rehearsal.sql --rehearse
  python supabase/scripts/run_sql.py Planning/Assets/repair_solo_energia_sprint11.sql --commit   # só depois da T2 aplicada
"""
from __future__ import annotations

import collections
import io
import json
import os
import re
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from migrate_solo_energia import (  # noqa: E402
    ASSETS,
    CONTACTS_CSV,
    DEFAULT_STAGE,
    EQUIPE_ID,
    OPPS_CSV,
    OUT_SQL as SPRINT10_SQL,
    PIPELINE_ID,
    ROOT,
    STAGE_MAP,
    clean,
    dedup,
    fold,
    load,
    merge,
    norm_phone,
    parse_dt,
    q,
)

OUT_SQL = os.path.join(ASSETS, "repair_solo_energia_sprint11.sql")
OUT_REHEARSAL = os.path.join(ASSETS, "repair_solo_energia_sprint11.rehearsal.sql")
OUT_REPORT = os.path.join(ASSETS, "repair_report_solo_energia.md")
OWNER_MIGRATION = os.path.join(
    ROOT, "supabase", "migrations", "20260910000100_sprint11_opportunity_owner.sql"
)

# Download dos CSVs: 09/09/2026 21:50 BRT. O Jestor calcula "Tempo na Fase" no
# momento da exportação; a entrada na etapa é esta âncora menos esse tempo.
EXPORT_ANCHOR = "2026-09-10T00:50:00Z"

# O now() da transação da Sprint 10: todo lead importado ficou com este created_at.
IMPORT_INSTANT = "2026-09-10 02:14:29.728297+00"

# Os dois responsáveis do Jestor que são usuários do app. Os outros (fgmssolar@…,
# estevamdequadros@…) não são — ficam sem owner, com o nome em responsavel_jestor.
OWNERS = {
    "Mateus Sombra": "0cfff9f9-8a3b-47de-981c-8587311e798c",
    "luizhenriqueteixeira@hotmail.com": "c5cc4020-9e7a-44e4-8cdd-6efaa27ccf1c",
}

# O que a Sprint 10 gravou em custom_data → o campo declarado que passa a guardar.
MIGRATION_KEYS = [
    "fonte", "tags", "proximo_contato", "data_reuniao", "data_envio_proposta",
    "link_proposta", "link_contrato", "responsavel_jestor", "touchpoints", "origem_migracao",
]

INTERVAL_TOKEN = re.compile(r"(\d+)\s+(years?|months?|days?|hours?|minutes?|seconds?)")
UNICODE_ESCAPE = re.compile(r"\\u([0-9a-fA-F]{4})")


def decode_escapes(name: str) -> str | None:
    r"""O export do Jestor trouxe alguns nomes com o escape cru (`Érica`).

    Emoji vêm como par UTF-16 (`😀`): cada metade decodificada sozinha
    é um surrogate inválido. Recombina os pares; se sobrar metade sem par, devolve
    None e o nome fica como está.
    """
    raw = UNICODE_ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), name)
    try:
        return raw.encode("utf-16", "surrogatepass").decode("utf-16")
    except UnicodeDecodeError:
        return None


def to_interval(raw: str | None) -> str | None:
    """'1 year 2 months 10 days 3 hours 45 minutes 12 seconds' → o mesmo texto,
    validado. O Postgres lê esse formato direto como interval; aqui só se garante
    que não entra nada além de pares número+unidade."""
    v = clean(raw)
    if not v:
        return None
    tokens = INTERVAL_TOKEN.findall(v)
    rebuilt = " ".join(f"{n} {u}" for n, u in tokens)
    return rebuilt if tokens and re.sub(r"\s+", " ", v).strip() == rebuilt else None


def brt_noon(iso: str | None) -> str | None:
    """Data sem hora → meio-dia em Brasília. `new Date('2025-10-14')` no navegador
    é meia-noite UTC, que no Brasil é o dia anterior."""
    return f"{iso[:10]}T12:00:00-03:00" if iso else None


def brt(iso: str | None) -> str | None:
    """Data com hora do Jestor (horário local) → com fuso explícito."""
    return f"{iso[:19]}-03:00" if iso else None


# ── 1. refaz a Sprint 10, na mesma ordem, sem gerar ids ─────────────────────

def rebuild() -> tuple[list[dict], list[dict]]:
    contacts = load(CONTACTS_CSV)
    opps = load(OPPS_CSV)

    groups, _ambiguous = dedup(contacts)
    merged = [merge(g) for g in groups]
    for i, m in enumerate(merged):
        m["_ix"] = i

    by_name: dict[str, dict] = {}
    for m in merged:
        key = " ".join(fold(m.get("Nome", "")))
        if key and key not in by_name:
            by_name[key] = m

    phone_owners: dict[str, set[int]] = collections.defaultdict(set)
    for m in merged:
        p = norm_phone(m.get("Telefone"))
        if p:
            phone_owners[p].add(m["_ix"])
    by_phone: dict[str, dict] = {}
    for m in merged:
        p = norm_phone(m.get("Telefone"))
        if p and len(phone_owners[p]) == 1 and p not in by_phone:
            by_phone[p] = m
    ambiguous_phones = {p for p, owners in phone_owners.items() if len(owners) > 1}

    created: list[dict] = []
    rows_opp: list[dict] = []
    for o in opps:
        lead_name = clean(o.get("Lead"))
        phone = norm_phone(o.get("Telefone"))
        target = None
        if lead_name:
            target = by_name.get(" ".join(fold(lead_name)))
        if target is None and phone:
            target = by_phone.get(phone)
        if target is None:
            nome = clean(o.get("Oportunidade")) or (phone or "Contato sem nome")
            target = {
                "_ix": len(merged) + len(created), "Nome": nome, "Email": "",
                "Telefone": o.get("Telefone", ""), "Canal de captação": clean(o.get("Fonte")),
                "Observações": "", "Data": "",
            }
            created.append(target)
            if phone and phone not in ambiguous_phones:
                by_phone[phone] = target
            k = " ".join(fold(nome))
            if k:
                by_name.setdefault(k, target)

        estagio = clean(o.get("Estágio"))
        if estagio in STAGE_MAP:
            stage_name, status = STAGE_MAP[estagio]
        elif not estagio:
            stage_name, status = DEFAULT_STAGE
        else:
            continue  # a Sprint 10 também pulava (zero casos no export)

        rows_opp.append({
            "lead_ix": target["_ix"],
            "stage": stage_name,
            "status": status,
            "tempo": to_interval(o.get("Tempo na Fase")),
            "tempo_raw": clean(o.get("Tempo na Fase")),
            "closed": parse_dt(o.get("Data de Fechamento")) if status in ("won", "lost") else None,
            "responsavel": clean(o.get("Responsável")),
        })

    all_leads = merged + created
    return all_leads, rows_opp


# ── 2. lê os ids que a Sprint 10 gravou ─────────────────────────────────────

def read_sprint10_ids() -> tuple[list[tuple[str, str]], list[tuple[str, str, str]]]:
    sql = io.open(SPRINT10_SQL, encoding="utf-8").read()
    leads_block = sql.split("insert into public.leads", 1)[1].split("insert into public.opportunities", 1)[0]
    opps_block = sql.split("insert into public.opportunities", 1)[1]
    lead_re = re.compile(
        rf"^  \('([0-9a-f-]{{36}})', '{EQUIPE_ID}', '((?:[^']|'')*)', ", re.M
    )
    opp_re = re.compile(
        rf"^  \('([0-9a-f-]{{36}})', '{EQUIPE_ID}', '([0-9a-f-]{{36}})', '{PIPELINE_ID}', "
        rf"\(select id from public\.pipeline_stages_v2 where pipeline_id = '{PIPELINE_ID}' and "
        rf"name = '((?:[^']|'')*)' and deleted_at is null limit 1\), '(open|won|lost)', ",
        re.M,
    )
    # O q() da Sprint 10 dobrava a barra invertida; com standard_conforming_strings
    # ligado, o banco guardou as duas. Para comparar com o CSV, desfaz aqui.
    leads = [(i, n.replace("''", "'").replace("\\\\", "\\")) for i, n in lead_re.findall(leads_block)]
    opps = [(i, lid, s) for i, lid, _stage, s in opp_re.findall(opps_block)]
    return leads, opps


def pair() -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    all_leads, rows_opp = rebuild()
    sql_leads, sql_opps = read_sprint10_ids()

    if len(sql_leads) != len(all_leads):
        raise SystemExit(f"ABORT: {len(sql_leads)} leads no SQL da Sprint 10, {len(all_leads)} refeitos")
    if len(sql_opps) != len(rows_opp):
        raise SystemExit(f"ABORT: {len(sql_opps)} oportunidades no SQL, {len(rows_opp)} refeitas")

    for j, (m, (lead_id, sql_name)) in enumerate(zip(all_leads, sql_leads)):
        expected = clean(m.get("Nome")) or norm_phone(m.get("Telefone")) or "Contato sem nome"
        if expected != sql_name:
            raise SystemExit(f"ABORT: lead {j} não bate com o SQL da Sprint 10")
        m["_id"] = lead_id

    for i, (r, (opp_id, sql_lead_id, sql_status)) in enumerate(zip(rows_opp, sql_opps)):
        if all_leads[r["lead_ix"]]["_id"] != sql_lead_id or r["status"] != sql_status:
            raise SystemExit(f"ABORT: oportunidade {i} não bate com o SQL da Sprint 10")
        r["_id"] = opp_id

    return all_leads, rows_opp, sql_leads, sql_opps


# ── 3. o SQL do reparo ──────────────────────────────────────────────────────

def field(key: str, label: str, ftype: str, position: int, options: list[str] | None = None,
          description: str | None = None) -> dict:
    return {
        "field_id": str(uuid.uuid4()),
        "key": key,
        "label": label,
        "type": ftype,
        "required": False,
        "options": options,
        "position": position,
        "description": description,
        "is_deleted": False,
    }


def build_sql(all_leads: list[dict], rows_opp: list[dict]) -> tuple[str, dict]:
    fonte_opts = sorted({r_fonte for r_fonte in (json_fontes(rows_opp)) if r_fonte})
    produto_opts = PRODUCT_OPTIONS
    base = 100  # posições depois dos campos que já existem (0..7); a UI reordena
    fields = {
        "fonte": field("fonte_negocio", "Fonte do negócio", "select", base + 0, fonte_opts,
                       "De onde veio ESTE negócio (pode diferir da origem do contato)."),
        "tags": field("produto_interesse", "Produto de interesse", "multi_select", base + 1, produto_opts,
                      "Linha de produto que o cliente procura. No Jestor eram as Tags."),
        "proximo_contato": field("proximo_contato", "Próximo contato", "date", base + 2),
        "data_reuniao": field("data_reuniao", "Data da reunião", "date", base + 3),
        "data_envio_proposta": field("data_envio_proposta", "Envio da proposta", "date", base + 4),
        "link_proposta": field("link_proposta", "Link da proposta", "url", base + 5),
        "link_contrato": field("link_contrato", "Link do contrato", "url", base + 6),
        "responsavel_jestor": field("responsavel_jestor", "Responsável no Jestor", "text", base + 7,
                                    description="Nome original do Jestor. O responsável de verdade é o dono do negócio."),
        "touchpoints": field("touchpoints_jestor", "Touchpoints no Jestor", "number", base + 8),
    }
    fid = {k: f["field_id"] for k, f in fields.items()}

    lead_dates = [(m["_id"], brt(m.get("Data"))) for m in all_leads if parse_dt(m.get("Data"))]

    # Nomes com escape cru do Jestor. No banco estão com a barra DOBRADA (o q() da
    # Sprint 10); o update só troca se o nome ainda for exatamente esse — se
    # alguém já corrigiu à mão desde ontem, fica como está.
    name_fixes = []
    for m in all_leads:
        nome = clean(m.get("Nome"))
        if nome and UNICODE_ESCAPE.search(nome):
            fixed = decode_escapes(nome)
            if fixed and fixed != nome:
                name_fixes.append((m["_id"], nome.replace("\\", "\\\\"), fixed))
    opp_facts = [(r["_id"], r["tempo"], brt_noon(r["closed"])) for r in rows_opp]
    owner_counts = collections.Counter(OWNERS[r["responsavel"]] for r in rows_opp if r["responsavel"] in OWNERS)

    def values(rows, cols):
        return ",\n".join("  (" + ", ".join(f"{q(v)}{cast}" if v is not None else f"null{cast}" for v, cast in zip(row, cols)) + ")" for row in rows)

    s = io.StringIO()
    w = s.write
    w("-- GERADO por scripts/repair_solo_energia_sprint11.py — não editar à mão.\n")
    w("-- Sprint 11 · T9 — reparo dos dados da Solo Energia importados na Sprint 10.\n\n")
    w("begin;\n\n")

    w("-- 0. Uma vez só: se os campos já foram declarados, o reparo já rodou.\n")
    w("do $$ begin\n")
    w(f"  if exists (select 1 from public.pipelines p, jsonb_array_elements(p.custom_fields_schema) f\n")
    w(f"             where p.id = {q(PIPELINE_ID)} and f->>'key' = 'fonte_negocio') then\n")
    w("    raise exception 'ABORT: reparo da Sprint 11 ja aplicado';\n")
    w("  end if;\nend $$;\n\n")

    w("-- 1. Backup antes de qualquer update (RLS ligado: backup em public nasce fechado).\n")
    for name, src, cond in [
        ("leads_backup_sprint11", "public.leads", f"equipe_id = {q(EQUIPE_ID)}"),
        ("opportunities_backup_sprint11", "public.opportunities", f"pipeline_id = {q(PIPELINE_ID)}"),
        ("funnel_events_backup_sprint11", "public.funnel_events", f"equipe_id = {q(EQUIPE_ID)}"),
        ("pipelines_backup_sprint11", "public.pipelines", f"id = {q(PIPELINE_ID)}"),
    ]:
        w(f"create table public.{name} as select * from {src} where {cond};\n")
        w(f"alter table public.{name} enable row level security;\n")
        w(f"revoke all on table public.{name} from anon, authenticated;\n")
    w("\n")

    w("-- 2. Os fatos pareados com o CSV.\n")
    w("create temp table s11_lead_dates (lead_id uuid primary key, created_at timestamptz not null) on commit drop;\n")
    w("insert into s11_lead_dates values\n")
    w(values(lead_dates, ["::uuid", "::timestamptz"]) + ";\n\n")
    w("create temp table s11_opp_facts (opp_id uuid primary key, tempo interval, closed_at timestamptz) on commit drop;\n")
    w("insert into s11_opp_facts values\n")
    w(values(opp_facts, ["::uuid", "::interval", "::timestamptz"]) + ";\n\n")

    if name_fixes:
        w("-- 2b. Nomes que o export do Jestor trouxe com escape cru (\\u00c9rica).\n")
        w("update public.leads l set name = v.fixed\n")
        w("  from (values\n")
        # Aqui NÃO se usa q(): ele dobraria a barra de novo. Só aspas simples são
        # escapadas; o banco tem standard_conforming_strings ligado.
        w(",\n".join(
            "    ('{}'::uuid, '{}', '{}')".format(i, old.replace("'", "''"), new.replace("'", "''"))
            for i, old, new in name_fixes
        ))
        w("\n  ) as v(id, old_name, fixed)\n")
        w(" where l.id = v.id and l.name = v.old_name;\n\n")

    w("-- 3. Declara os nove campos no pipeline.\n")
    w("update public.pipelines\n")
    w(f"   set custom_fields_schema = coalesce(custom_fields_schema, '[]'::jsonb) || {q(json.dumps(list(fields.values()), ensure_ascii=False))}::jsonb\n")
    w(f" where id = {q(PIPELINE_ID)};\n\n")

    w("-- 4. Regrava custom_data sob os field_ids. Datas com fuso explícito; o resto\n")
    w("--    que não é da migração fica intocado (pode ter sido editado desde ontem).\n")
    w("update public.opportunities o\n")
    w(f"   set custom_data = (o.custom_data - array{MIGRATION_KEYS!r}::text[])\n")
    w("     || jsonb_strip_nulls(jsonb_build_object(\n")
    w(f"          {q(fid['fonte'])}, o.custom_data->'fonte',\n")
    w(f"          {q(fid['tags'])}, o.custom_data->'tags',\n")
    w(f"          {q(fid['proximo_contato'])}, case when o.custom_data ? 'proximo_contato' then to_jsonb(left(o.custom_data->>'proximo_contato', 10) || 'T12:00:00-03:00') end,\n")
    w(f"          {q(fid['data_reuniao'])}, case when o.custom_data ? 'data_reuniao' then to_jsonb(left(o.custom_data->>'data_reuniao', 19) || '-03:00') end,\n")
    w(f"          {q(fid['data_envio_proposta'])}, case when o.custom_data ? 'data_envio_proposta' then to_jsonb(left(o.custom_data->>'data_envio_proposta', 10) || 'T12:00:00-03:00') end,\n")
    w(f"          {q(fid['link_proposta'])}, o.custom_data->'link_proposta',\n")
    w(f"          {q(fid['link_contrato'])}, o.custom_data->'link_contrato',\n")
    w(f"          {q(fid['responsavel_jestor'])}, o.custom_data->'responsavel_jestor',\n")
    w(f"          {q(fid['touchpoints'])}, case when (o.custom_data->>'touchpoints') ~ '^[0-9]+$' then to_jsonb((o.custom_data->>'touchpoints')::int) else o.custom_data->'touchpoints' end\n")
    w("        ))\n")
    w(f" where o.pipeline_id = {q(PIPELINE_ID)}\n")
    w(f"   and o.custom_data ?| array{MIGRATION_KEYS!r}::text[];\n\n")

    w("-- 5. Datas. Entrada na etapa = exportação − Tempo na Fase. Ganho/perdido sem\n")
    w("--    data de fechamento fecharam quando entraram na etapa em que estão.\n")
    w("update public.opportunities o\n")
    w(f"   set stage_entered_at = timestamptz {q(EXPORT_ANCHOR)} - f.tempo,\n")
    w("       closed_at = case when o.status in ('won', 'lost')\n")
    w(f"                        then coalesce(f.closed_at, timestamptz {q(EXPORT_ANCHOR)} - f.tempo)\n")
    w("                        else o.closed_at end\n")
    w("  from s11_opp_facts f\n")
    w(" where f.opp_id = o.id and f.tempo is not null;\n\n")
    w("update public.opportunities o\n")
    w("   set closed_at = f.closed_at\n")
    w("  from s11_opp_facts f\n")
    w(" where f.opp_id = o.id and f.tempo is null and f.closed_at is not null and o.status in ('won', 'lost');\n\n")
    w("update public.leads l set created_at = d.created_at from s11_lead_dates d where d.lead_id = l.id;\n\n")
    w("-- Negócio nasce quando o contato chegou (ou antes, se o Jestor diz que já\n")
    w("-- estava na etapa antes disso).\n")
    w("update public.opportunities o\n")
    w("   set created_at = least(l.created_at, o.stage_entered_at, coalesce(o.closed_at, o.stage_entered_at))\n")
    w("  from public.leads l, s11_opp_facts f\n")
    w(" where l.id = o.lead_id and f.opp_id = o.id;\n\n")
    w("-- Contato criado a partir de negócio órfão (sem Data no Jestor): nasce com o\n")
    w("-- primeiro negócio dele.\n")
    w("update public.leads l\n")
    w("   set created_at = x.first\n")
    w("  from (select o.lead_id, min(o.created_at) as first\n")
    w("          from public.opportunities o join s11_opp_facts f on f.opp_id = o.id\n")
    w("         group by o.lead_id) x\n")
    w(" where l.id = x.lead_id\n")
    w("   and not exists (select 1 from s11_lead_dates d where d.lead_id = l.id)\n")
    w("   and x.first < l.created_at;\n\n")

    w("-- 6. Responsável: o negócio primeiro; o contato herda do negócio mais recente.\n")
    w("update public.opportunities o\n")
    w(f"   set owner_id = case o.custom_data->>{q(fid['responsavel_jestor'])}\n")
    for name, owner in OWNERS.items():
        w(f"                    when {q(name)} then {q(owner)}::uuid\n")
    w("                  end\n")
    w(f" where o.pipeline_id = {q(PIPELINE_ID)} and o.owner_id is null\n")
    w(f"   and o.custom_data->>{q(fid['responsavel_jestor'])} in ({', '.join(q(n) for n in OWNERS)});\n\n")
    w("update public.leads l\n")
    w("   set responsible_id = x.owner_id\n")
    w("  from (select distinct on (o.lead_id) o.lead_id, o.owner_id\n")
    w("          from public.opportunities o\n")
    w(f"         where o.pipeline_id = {q(PIPELINE_ID)} and o.deleted_at is null and o.owner_id is not null\n")
    w("         order by o.lead_id, o.stage_entered_at desc) x\n")
    w(" where l.id = x.lead_id and l.responsible_id is null;\n\n")

    w("-- 7. Próximo contato no card: só negócio aberto fora do Reciclo, e sem\n")
    w("--    passar por cima de data que o time já marcou.\n")
    w("update public.leads l\n")
    w(f"   set next_contact = left(o.custom_data->>{q(fid['proximo_contato'])}, 10)::date\n")
    w("  from public.opportunities o\n")
    w("  join public.pipeline_stages_v2 s on s.id = o.stage_id\n")
    w(" where o.lead_id = l.id\n")
    w(f"   and o.pipeline_id = {q(PIPELINE_ID)} and o.deleted_at is null\n")
    w("   and o.status = 'open' and s.name <> 'Reciclo'\n")
    w("   and l.next_contact is null\n")
    w(f"   and o.custom_data ? {q(fid['proximo_contato'])};\n\n")

    w("-- 8. Eventos de funil de ganho/perda: na data em que fecharam.\n")
    w("update public.funnel_events fe\n")
    w("   set occurred_at = o.closed_at\n")
    w("  from public.opportunities o\n")
    w(" where fe.opportunity_id = o.id\n")
    w(f"   and o.pipeline_id = {q(PIPELINE_ID)}\n")
    w("   and fe.event in ('won', 'lost')\n")
    w("   and fe.source = 'opportunity_created'\n")
    w("   and o.closed_at is not null;\n\n")

    w("-- 9. Conferência: falha em vez de deixar meia base.\n")
    w("do $$\ndeclare v int;\nbegin\n")
    w("  select count(*) into v from public.opportunities o\n")
    w(f"   where o.pipeline_id = {q(PIPELINE_ID)} and o.custom_data ?| array{MIGRATION_KEYS!r}::text[];\n")
    w("  assert v = 0, format('%s negocios ainda com chave nao declarada', v);\n\n")
    for owner, n in owner_counts.items():
        w(f"  select count(*) into v from public.opportunities where pipeline_id = {q(PIPELINE_ID)} and owner_id = {q(owner)};\n")
        w(f"  assert v between {n} - 5 and {n}, format('owner {owner[:8]}: esperado ~{n}, veio %s', v);\n")
    # O instante exato do now() da importação (os 1.251 têm este valor). Não o dia
    # inteiro: um contato do Jestor tem Data = 10/09 00:00, legitimamente.
    w(f"  select count(*) into v from public.leads\n")
    w(f"   where equipe_id = {q(EQUIPE_ID)} and creation_source = 'import' and deleted_at is null\n")
    w(f"     and created_at = timestamptz {q(IMPORT_INSTANT)};\n")
    w("  assert v = 0, format('%s leads importados ainda com a data da importacao', v);\n\n")
    w("  select count(*) into v from public.opportunities o join s11_opp_facts f on f.opp_id = o.id\n")
    w("   where o.created_at > o.stage_entered_at or o.stage_entered_at > now();\n")
    w("  assert v = 0, format('%s negocios com datas fora de ordem', v);\n\n")
    w("  select count(distinct date_trunc('month', fe.occurred_at)) into v from public.funnel_events fe\n")
    w(f"   where fe.equipe_id = {q(EQUIPE_ID)} and fe.event in ('won', 'lost');\n")
    w("  assert v >= 6, format('eventos de ganho/perda em so %s meses', v);\n\n")
    w("  select count(*) into v from public.pipelines p, jsonb_array_elements(p.custom_fields_schema) f\n")
    w(f"   where p.id = {q(PIPELINE_ID)} and f->>'key' in ('fonte_negocio', 'produto_interesse', 'proximo_contato',\n")
    w("         'data_reuniao', 'data_envio_proposta', 'link_proposta', 'link_contrato', 'responsavel_jestor', 'touchpoints_jestor');\n")
    w("  assert v = 9, format('%s campos declarados, esperado 9', v);\n")
    w("  raise notice 'Sprint 11: reparo da Solo Energia aplicado e conferido';\n")
    w("end $$;\n\ncommit;\n")

    stats = {
        "leads_pareados": len(all_leads),
        "leads_com_data": len(lead_dates),
        "oportunidades_pareadas": len(rows_opp),
        "com_tempo_na_fase": sum(1 for r in rows_opp if r["tempo"]),
        "tempo_invalido": sum(1 for r in rows_opp if r["tempo_raw"] and not r["tempo"]),
        "fechadas_com_data_do_jestor": sum(1 for r in rows_opp if r["closed"]),
        "ganho_perdido_sem_data": sum(1 for r in rows_opp if r["status"] in ("won", "lost") and not r["closed"]),
        "owners": {k[:8]: v for k, v in owner_counts.items()},
        "nomes_com_escape_corrigidos": len(name_fixes),
        "fontes": len(fonte_opts),
    }
    return s.getvalue(), stats


def json_fontes(rows_opp: list[dict]) -> list[str]:
    # A fonte do negócio vem do CSV de oportunidades; relê só a coluna.
    return [clean(o.get("Fonte")) for o in load(OPPS_CSV)]


# As "Tags" do Jestor, que são linhas de produto (contadas no banco em 10/09).
PRODUCT_OPTIONS = [
    "Microgeração < 1.000kWh",
    "Microgeração > 1.000 kWh",
    "Energia por Assinatura",
    "O&M",
    "Usina de Investimento",
    "Terreno",
    "Equipamento",
    "Carregamento Veicular",
    "Projeto",
    "Outras oportunidades",
]


def main() -> int:
    all_leads, rows_opp, _sl, _so = pair()
    sql, stats = build_sql(all_leads, rows_opp)

    io.open(OUT_SQL, "w", encoding="utf-8").write(sql)

    # O ensaio roda antes do deploy: a coluna owner_id (T2) ainda não existe na
    # produção. O DDL da migration vai na frente, dentro da mesma transação.
    owner_ddl = io.open(OWNER_MIGRATION, encoding="utf-8").read()
    rehearsal = sql.replace("begin;\n\n", "begin;\n\n-- [ensaio] migration T2 embutida\n" + owner_ddl + "\n\n", 1)
    io.open(OUT_REHEARSAL, "w", encoding="utf-8").write(rehearsal)

    r = io.StringIO()
    r.write("# Reparo da Solo Energia — Sprint 11 · T9\n\n")
    r.write("Gerado por `scripts/repair_solo_energia_sprint11.py`. Fora do git.\n\n")
    r.write("| | |\n| :--- | ---: |\n")
    for k, v in stats.items():
        r.write(f"| {k} | {v} |\n")
    io.open(OUT_REPORT, "w", encoding="utf-8").write(r.getvalue())

    for k, v in stats.items():
        print(f"{k:32} {v}")
    print(f"\nSQL      -> {OUT_SQL}\nEnsaio   -> {OUT_REHEARSAL}\nRelatorio-> {OUT_REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
