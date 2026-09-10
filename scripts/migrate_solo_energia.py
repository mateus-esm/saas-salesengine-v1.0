#!/usr/bin/env python3
"""Sprint 10 · T2 — Jestor -> SaaS Sales Engine, migração da Solo Energia.

Lê os dois CSVs exportados do Jestor, normaliza, deduplica os contatos e emite
UM arquivo .sql para ser revisado e aplicado. Não toca no banco: gerar SQL
revisável é deliberado — é uma operação destrutiva em produção, e um diff é
mais barato que um rollback.

Uso:
    python scripts/migrate_solo_energia.py            # gera .sql + relatório
"""
from __future__ import annotations

import collections
import csv
import io
import os
import re
import unicodedata
import uuid
from datetime import datetime

EQUIPE_ID = "939d7dd8-592c-4fda-946e-3568f2909904"          # Solo Energia
PIPELINE_ID = "fd7b9821-c639-427d-8682-de3e158c18cb"        # Usinas - Micro Geração

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "Planning", "Assets")
CONTACTS_CSV = os.path.join(ASSETS, "contatos_migração_solo_energia_jestor.csv")
OPPS_CSV = os.path.join(ASSETS, "oportunidades_migração_solo_energia_jestor.csv")
OUT_SQL = os.path.join(ASSETS, "migration_solo_energia.sql")
OUT_REPORT = os.path.join(ASSETS, "migration_report_solo_energia.md")

# Jestor "Estágio" -> nome da etapa no app (+ status da oportunidade).
# Os 10 valores do export caem todos no pipeline que já existe: cobertura 100%.
STAGE_MAP = {
    "Nova Oportunidade":      ("Contato Inicial",         "open"),
    "Qualificação inicial":   ("Qualificação",            "open"),
    "Agendamento de reunião": ("Agendamento de Reunião",  "open"),
    "Reunião de apresentação":("Reunião de Apresentação", "open"),
    "Envio de proposta":      ("Envio de Proposta",       "open"),
    "Negociação de proposta": ("Negociação de Proposta",  "open"),
    "Ganho":                  ("Ganho",                   "won"),
    "Perdido":                ("Perdido",                 "lost"),
    "Desqualificado":         ("Desqualificado",          "lost"),
    "Reciclo":                ("Reciclo",                 "open"),
}

# Para a linha sem estágio nenhum: triagem, não lixeira.
DEFAULT_STAGE = ("Contato Inicial", "open")

# `leads.origin_category` e taxonomia FECHADA (CHECK no banco). O rotulo cru do
# Jestor nao cabe nela, entao vai inteiro para `origin_detail` -- a categoria
# classifica, o detalhe preserva. Jogar o rotulo cru na categoria quebra o
# insert; jogar fora o rotulo perde o canal que o cliente de fato usa.
ORIGIN_CATEGORY = {
    "Tráfego Pago":                    "paid_social",
    "Google ADS":                      "paid_search",
    "Mensagem Whatsapp":               "outbound_message",
    "Base Ativa":                      "outbound_message",
    "Prospecção Ativa":                "outbound_phone",
    "Indicação":                       "referral",
    "Lead Magnet - Billing (Partner)": "partner_channel",
    "Lead Magnet - Billing":           "direct_brand",
    "Landing Page - LL":               "direct_brand",
    "Site":                            "direct_brand",
    "Database":                        "api_import",
    "Solo App":                        "api_import",
}



# ── normalização ────────────────────────────────────────────────────────────

def clean(v: str | None) -> str:
    """Tira o apóstrofo de guarda do Excel e o marcador nulo do Jestor."""
    v = (v or "").strip()
    if v.startswith("'"):
        v = v[1:].strip()
    return "" if v in ("-", "", "unsupported") else v


def norm_phone(v: str | None) -> str:
    """Porta EXATA de `public.normalize_phone_br` (ver pg_proc).

    Tem de ser exata, não "equivalente". O trigger `trg_leads_sync_phone_normalized`
    roda BEFORE INSERT e recalcula `phone_normalized` a partir de `phone`, e
    existe um UNIQUE parcial em (equipe_id, phone_normalized). Se o script
    normalizar por uma regra e o banco por outra, dois telefones que o script
    julga distintos colidem no INSERT — foi exatamente assim que a primeira
    tentativa estourou, duas vezes, em números diferentes.

    A regra do banco NÃO é "sempre prefixa 55": números de 8 ou 9 dígitos voltam
    sem DDI, e os de 10 ganham o 9 do celular antes do DDI.

    Não é cosmético: o runbook registra que envio de WhatsApp sem o 55 é ACEITO
    pela API e a mensagem some. Divergir daqui é o agente falando com ninguém.
    """
    raw = clean(v)
    if not raw:
        return ""
    d = re.sub(r"\D", "", raw)
    if not d:
        return ""
    d = re.sub(r"^0+", "", d)
    if len(d) < 8:
        return ""
    if len(d) >= 12 and d[:2] == "55":
        d = d[2:]
    if len(d) == 10:                      # DDD + 8 → insere o 9 do celular
        d = d[:2] + "9" + d[2:]
    if len(d) == 11:                      # DDD + 9 → ganha o DDI
        return "55" + d
    return d


def fold(s: str) -> list[str]:
    """Tokens do nome, sem acento e sem caixa."""
    s = unicodedata.normalize("NFKD", clean(s).lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.findall(r"[a-z]+", s)


def parse_dt(v: str | None) -> str | None:
    """Aceita os TRÊS formatos que o export mistura.

    `Data de Envio da Proposta` vem DD/MM/YYYY enquanto `Data de Fechamento` vem
    YYYY/MM/DD. Ler os dois com o mesmo parser trocaria dia por mês em silêncio
    em todo dia <= 12.
    """
    v = clean(v)
    if not v:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(v, fmt).isoformat()
        except ValueError:
            continue
    return None


def num(v: str | None) -> str | None:
    v = clean(v).replace(" ", "")
    if not v:
        return None
    v = re.sub(r"[R$\s]", "", v)
    if "," in v and "." in v:          # 1.234,56
        v = v.replace(".", "").replace(",", ".")
    elif "," in v:
        v = v.replace(",", ".")
    try:
        return str(float(v))
    except ValueError:
        return None


def q(v) -> str:
    """Literal SQL."""
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("\\", "\\\\").replace("'", "''") + "'"


def load(path: str) -> list[dict]:
    with io.open(path, encoding="utf-8-sig", newline="") as f:
        r = csv.reader(f)
        header = next(r)
        # O export tem cabeçalhos repetidos (Touchpoint, Proposta, Gerar
        # Proposta...). dict() ficaria com o último; para os campos que usamos
        # isso não muda nada, e nenhum deles é duplicado.
        return [dict(zip(header, row)) for row in r]


# ── dedup ───────────────────────────────────────────────────────────────────

def same_person(a: str, b: str) -> bool:
    """Duas grafias são a mesma pessoa?

    Regra: mesmo PRIMEIRO nome, ou um nome contido no outro.

    Compartilhar um token qualquer não serve — sobrenome comum junta gente
    diferente. No dado real, 'Abinoan Pereira' e 'Gesaias Pereira Azevedo'
    dividem telefone E o token 'pereira', e são duas pessoas. Já 'Fernando César
    Andrade Lopes' / 'Fernando Lopes' compartilham o primeiro nome e são a mesma.
    """
    ta, tb = fold(a), fold(b)
    if not ta or not tb:
        return False
    if ta[0] == tb[0]:
        return True
    return set(ta) <= set(tb) or set(tb) <= set(ta)


def dedup(contacts: list[dict]) -> tuple[list[list[dict]], list[list[dict]]]:
    """Agrupa contatos. Devolve (grupos, grupos_ambiguos_para_revisao)."""
    by_phone: dict[str, list[dict]] = collections.defaultdict(list)
    no_phone: list[dict] = []
    for c in contacts:
        p = norm_phone(c.get("Telefone"))
        (by_phone[p] if p else no_phone).append(c)

    groups: list[list[dict]] = []
    ambiguous: list[list[dict]] = []

    for _phone, rows in by_phone.items():
        if len(rows) == 1:
            groups.append(rows)
            continue
        # clusteriza por "mesma pessoa" dentro do telefone
        clusters: list[list[dict]] = []
        for r in rows:
            for cl in clusters:
                if any(same_person(r.get("Nome", ""), x.get("Nome", "")) for x in cl):
                    cl.append(r)
                    break
            else:
                clusters.append([r])
        groups.extend(clusters)
        if len(clusters) > 1:
            ambiguous.append(rows)   # mesmo telefone, pessoas diferentes

    # Sem telefone: cada um por si (nome+email não é chave confiável aqui).
    groups.extend([[c] for c in no_phone])
    return groups, ambiguous


def merge(group: list[dict]) -> dict:
    """Funde um grupo, preferindo a linha mais completa e o registro mais antigo."""
    best = max(group, key=lambda r: sum(1 for v in r.values() if clean(v)))
    out = dict(best)
    for field in ("Email", "Telefone", "Observações", "Canal de captação"):
        if not clean(out.get(field)):
            for r in group:
                if clean(r.get(field)):
                    out[field] = r[field]
                    break
    datas = [parse_dt(r.get("Data")) for r in group]
    datas = [d for d in datas if d]
    if datas:
        out["Data"] = min(datas)
    # Observações de todas as grafias, sem perder nada
    obs = [clean(r.get("Observações")) for r in group]
    obs = [o for o in obs if o]
    if len(obs) > 1:
        out["Observações"] = "\n---\n".join(dict.fromkeys(obs))
    return out


# ── main ────────────────────────────────────────────────────────────────────

def main() -> int:
    contacts = load(CONTACTS_CSV)
    opps = load(OPPS_CSV)

    groups, ambiguous = dedup(contacts)
    merged = [merge(g) for g in groups]

    # id por contato + índices de busca
    for m in merged:
        m["_id"] = str(uuid.uuid4())
    by_name: dict[str, dict] = {}
    for m in merged:
        key = " ".join(fold(m.get("Nome", "")))
        if key and key not in by_name:
            by_name[key] = m

    # O telefone só serve de chave quando pertence a UMA pessoa.
    #
    # Vários números do export são placeholder, não telefone: 5511911112222
    # carrega Igor, Hilda, Guilherme, Fabiane e Carlos; 5585999138804 carrega 18
    # nomes distintos. Casar oportunidade por esses números grudaria o negócio em
    # quem calhasse de vir primeiro — atribuição errada e silenciosa, pior que
    # não casar. Quando o número é ambíguo, a oportunidade cria o próprio contato.
    phone_owners: dict[str, set[str]] = collections.defaultdict(set)
    for m in merged:
        p = norm_phone(m.get("Telefone"))
        if p:
            phone_owners[p].add(m["_id"])
    by_phone: dict[str, dict] = {}
    for m in merged:
        p = norm_phone(m.get("Telefone"))
        if p and len(phone_owners[p]) == 1 and p not in by_phone:
            by_phone[p] = m
    ambiguous_phones = {p for p, owners in phone_owners.items() if len(owners) > 1}

    # ── roteia oportunidades ────────────────────────────────────────────────
    created: list[dict] = []
    rows_opp: list[tuple] = []
    unmapped_stage: list[str] = []
    defaulted: list[str] = []
    matched_name = matched_phone = created_new = 0

    for o in opps:
        lead_name = clean(o.get("Lead"))
        phone = norm_phone(o.get("Telefone"))
        target = None

        if lead_name:
            target = by_name.get(" ".join(fold(lead_name)))
            if target:
                matched_name += 1
        if target is None and phone:
            target = by_phone.get(phone)
            if target:
                matched_phone += 1
        if target is None:
            # órfã: cria contato a partir da própria oportunidade
            nome = clean(o.get("Oportunidade")) or (phone or "Contato sem nome")
            target = {
                "_id": str(uuid.uuid4()), "Nome": nome, "Email": "",
                "Telefone": o.get("Telefone", ""), "Canal de captação": clean(o.get("Fonte")),
                "Observações": "", "Data": "",
            }
            created.append(target)
            if phone and phone not in ambiguous_phones:
                by_phone[phone] = target
            k = " ".join(fold(nome))
            if k:
                by_name.setdefault(k, target)
            created_new += 1

        estagio = clean(o.get("Estágio"))
        if estagio in STAGE_MAP:
            stage_name, status = STAGE_MAP[estagio]
        elif not estagio:
            # Uma linha do export ('Leandro Lisboa') veio sem estágio. Descartar
            # perderia um lead real com telefone e observação; jogá-lo na
            # primeira etapa o coloca exatamente onde se faz triagem.
            stage_name, status = DEFAULT_STAGE
            defaulted.append(clean(o.get("Oportunidade")) or "(sem nome)")
        else:
            unmapped_stage.append(estagio)
            continue

        custom = {
            "fonte": clean(o.get("Fonte")),
            "tags": [t.strip() for t in clean(o.get("Tags")).split(";") if t.strip()],
            "proximo_contato": parse_dt(o.get("Próximo Contato")),
            "data_reuniao": parse_dt(o.get("Data da Reunião")),
            "data_envio_proposta": parse_dt(o.get("Data de Envio da Proposta")),
            "link_proposta": clean(o.get("Link da Proposta")),
            "link_contrato": clean(o.get("Link do Contrato")),
            "responsavel_jestor": clean(o.get("Responsável")),
            "touchpoints": clean(o.get("Touchpoints Realizados")),
            "origem_migracao": "jestor_sprint10",
        }
        custom = {k: v for k, v in custom.items() if v not in (None, "", [])}
        import json
        rows_opp.append((
            str(uuid.uuid4()), target["_id"], stage_name, status,
            num(o.get("Valor da Oportunidade")),
            parse_dt(o.get("Data de Fechamento")) if status in ("won", "lost") else None,
            json.dumps(custom, ensure_ascii=False),
            clean(o.get("Observações")),
        ))

    all_leads = merged + created
    leads_with_opp = {r[1] for r in rows_opp}

    # ── SQL ─────────────────────────────────────────────────────────────────
    out = io.StringIO()
    w = out.write
    w("-- GERADO por scripts/migrate_solo_energia.py — não editar à mão.\n")
    w(f"-- Sprint 10 · migração Solo Energia (Jestor).\n")
    w(f"-- {len(all_leads)} contatos · {len(rows_opp)} oportunidades\n\n")
    w("begin;\n\n")
    w("-- Recusa rodar se a base não foi zerada: importar por cima duplica tudo.\n")
    w("do $$ begin\n")
    w(f"  if (select count(*) from public.leads where equipe_id = '{EQUIPE_ID}') > 0 then\n")
    w("    raise exception 'ABORT: base da Solo Energia nao esta vazia — rode a migration de purge antes';\n")
    w("  end if;\n end $$;\n\n")

    w("insert into public.leads\n")
    w("  (id, equipe_id, name, email, phone, phone_normalized, source, origem,\n")
    w("   origin_category, origin_detail, observations, contact_type, creation_source, created_at)\nvalues\n")
    vals = []
    # `idx_leads_equipe_phone_normalized_unique` e UNIQUE PARCIAL em
    # (equipe_id, phone_normalized) WHERE phone_normalized is not null.
    #
    # O banco esta dizendo uma verdade do dominio: um numero so pode rotear para
    # UM lead -- mensagem que chega de um numero compartilhado nao tem como ser
    # desambiguada. Entao, nos 16 grupos onde pessoas diferentes dividem o
    # telefone, o primeiro fica com `phone_normalized` e os demais continuam
    # existindo como contatos separados, com o telefone cru preservado em
    # `phone` e `phone_normalized` nulo. Ninguem e fundido e nada e perdido.
    seen_phone: set[str] = set()
    demoted: list[tuple[str, str]] = []
    for m in all_leads:
        nome = clean(m.get("Nome")) or norm_phone(m.get("Telefone")) or "Contato sem nome"
        phone_raw = clean(m.get("Telefone"))
        phone_n = norm_phone(m.get("Telefone"))
        obs = clean(m.get("Observações"))

        if phone_n and phone_n in seen_phone:
            # `trg_leads_sync_phone_normalized` roda BEFORE INSERT e RECALCULA
            # phone_normalized a partir de `phone` -- zerar so a coluna
            # normalizada nao adianta, o trigger a reescreve e o UNIQUE estoura.
            # Entao o numero cru sai da coluna e vai para observacoes + custom
            # fields: o contato continua existindo, separado, com o telefone
            # visivel e recuperavel; so nao e ele quem "possui" o numero.
            demoted.append((nome, phone_n))
            nota = f"[migracao] Telefone compartilhado com outro contato: {phone_raw}"
            obs = (obs + "\n" + nota) if obs else nota
            phone_raw, phone_n = "", ""
        elif phone_n:
            seen_phone.add(phone_n)

        canal = clean(m.get("Canal de captação"))
        ctype = "opportunity" if m["_id"] in leads_with_opp else "lead"
        created_at = parse_dt(m.get("Data")) or "now()"
        vals.append(
            f"  ({q(m['_id'])}, {q(EQUIPE_ID)}, {q(nome)}, {q(clean(m.get('Email')).lower() or None)}, "
            f"{q(phone_raw or None)}, {q(phone_n or None)}, "
            f"{q(canal or 'Jestor')}, {q(canal or 'Jestor')}, "
            f"{q(ORIGIN_CATEGORY.get(canal, 'api_import'))}, {q(canal or None)}, "
            f"{q(obs or None)}, {q(ctype)}, 'import', "
            f"{'now()' if created_at == 'now()' else q(created_at)}::timestamptz)"
        )
    w(",\n".join(vals))
    w(";\n\n")

    w("insert into public.opportunities\n")
    w("  (id, equipe_id, lead_id, pipeline_id, stage_id, status, value, currency,\n")
    w("   closed_at, custom_data, stage_entered_at)\nvalues\n")
    vals = []
    for oid, lead_id, stage_name, status, value, closed, custom, _obs in rows_opp:
        stage_sql = (
            "(select id from public.pipeline_stages_v2 where pipeline_id = "
            f"{q(PIPELINE_ID)} and name = {q(stage_name)} and deleted_at is null limit 1)"
        )
        vals.append(
            f"  ({q(oid)}, {q(EQUIPE_ID)}, {q(lead_id)}, {q(PIPELINE_ID)}, {stage_sql}, "
            f"{q(status)}, {value or 'null'}, 'BRL', "
            f"{(q(closed) + '::timestamptz') if closed else 'null'}, {q(custom)}::jsonb, now())"
        )
    w(",\n".join(vals))
    w(";\n\n")

    w("-- Asserções: a migração falha em vez de deixar meia base no ar.\n")
    w("do $$ declare v integer; begin\n")
    w(f"  select count(*) into v from public.leads where equipe_id = {q(EQUIPE_ID)};\n")
    w(f"  assert v = {len(all_leads)}, format('leads: esperado {len(all_leads)}, veio %s', v);\n")
    w(f"  select count(*) into v from public.opportunities where equipe_id = {q(EQUIPE_ID)};\n")
    w(f"  assert v = {len(rows_opp)}, format('opps: esperado {len(rows_opp)}, veio %s', v);\n")
    w(f"  select count(*) into v from public.opportunities where equipe_id = {q(EQUIPE_ID)} and stage_id is null;\n")
    w("  assert v = 0, format('%s oportunidade(s) sem etapa — mapa de estagio furado', v);\n")
    w("  raise notice 'Sprint 10: migracao aplicada e conferida';\n")
    w("end $$;\n\ncommit;\n")

    with io.open(OUT_SQL, "w", encoding="utf-8") as f:
        f.write(out.getvalue())

    # ── relatório ───────────────────────────────────────────────────────────
    r = io.StringIO()
    r.write("# Relatório de migração — Solo Energia (Jestor)\n\n")
    r.write(f"Gerado por `scripts/migrate_solo_energia.py`.\n\n")
    r.write("## Números\n\n")
    r.write(f"| | |\n| :--- | ---: |\n")
    r.write(f"| Contatos no CSV | {len(contacts)} |\n")
    r.write(f"| Contatos após dedup | {len(merged)} |\n")
    r.write(f"| Contatos criados a partir de oportunidade órfã | {len(created)} |\n")
    r.write(f"| **Total de leads importados** | **{len(all_leads)}** |\n")
    r.write(f"| Oportunidades no CSV | {len(opps)} |\n")
    r.write(f"| **Oportunidades importadas** | **{len(rows_opp)}** |\n")
    r.write(f"| — casadas por nome | {matched_name} |\n")
    r.write(f"| — casadas por telefone | {matched_phone} |\n")
    r.write(f"| — contato criado na hora | {created_new} |\n")
    r.write(f"| Estágios não mapeados | {len(unmapped_stage)} |\n\n")

    dist = collections.Counter(x[2] for x in rows_opp)
    r.write("## Distribuição por etapa\n\n| Etapa | Oportunidades |\n| :--- | ---: |\n")
    for k, v in dist.most_common():
        r.write(f"| {k} | {v} |\n")

    r.write("\n## ⚠️ Revisar à mão — mesmo telefone, pessoas diferentes\n\n")
    r.write("Preservadas como contatos separados de propósito. Se alguma for a mesma\n")
    r.write("pessoa, funda no app — fundir depois é um clique, separar depois não é.\n\n")
    for grp in ambiguous:
        phone = norm_phone(grp[0].get("Telefone"))
        names = [clean(g.get("Nome")) for g in grp]
        r.write(f"- `{phone}` → {names}\n")

    if demoted:
        r.write("\n## Contatos com `phone_normalized` nulo\n\n")
        r.write(
            "Dividem o numero com outro contato. O UNIQUE (equipe_id, phone_normalized)\n"
            "so admite um dono por numero -- e o banco esta certo: mensagem que chega\n"
            "desse numero nao tem como ser desambiguada. O contato continua existindo e o\n"
            "telefone cru segue visivel no card; so nao e a chave de roteamento.\n\n"
        )
        for nome, ph in demoted:
            r.write(f"- {nome} -- `{ph}`\n")

    if unmapped_stage:
        r.write("\n## ❌ Estágios sem mapa\n\n")
        for k, v in collections.Counter(unmapped_stage).most_common():
            r.write(f"- `{k}` × {v}\n")

    with io.open(OUT_REPORT, "w", encoding="utf-8") as f:
        f.write(r.getvalue())

    print(f"contatos CSV      {len(contacts)}")
    print(f"apos dedup        {len(merged)}")
    print(f"criados (orfaos)  {len(created)}")
    print(f"leads total       {len(all_leads)}")
    print(f"oportunidades     {len(rows_opp)} de {len(opps)}")
    print(f"  por nome        {matched_name}")
    print(f"  por telefone    {matched_phone}")
    print(f"  contato novo    {created_new}")
    print(f"sem estagio->default {len(defaulted)}")
    print(f"estagios sem mapa {len(unmapped_stage)}")
    print(f"tel ambiguos      {len(ambiguous_phones)}")
    print(f"grupos ambiguos   {len(ambiguous)}")
    print(f"phone_norm nulo   {len(demoted)}")
    print(f"\nSQL      -> {OUT_SQL}")
    print(f"Relatorio-> {OUT_REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
