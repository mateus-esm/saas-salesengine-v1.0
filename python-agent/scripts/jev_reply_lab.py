"""Laboratório: Jev (System 1) + Agno + modelo OSS respondendo o cliente — contra a resposta real.

Para cada conversa real que deu resultado (negócio ganho ou avançado, e o cliente respondeu de novo):
  1. Jev escolhe os blocos de treinamento que servem para a mensagem do cliente (1 noul por bloco);
  2. Agno + modelo OSS (Verboo) escreve a resposta  A) só com os blocos escolhidos  B) com todos;
  3. Jev avalia as 3 respostas (real, A, B) em 5 critérios e escolhe a que mais avança a venda.

Nada é gravado. Chaves só por env. Rodar da raiz do repo:

  JEV_API_KEY=... VERBOO_API_KEY=... VERBOO_MODEL=deepseek-v4.1-flash \\
    python-agent/.venv/Scripts/python python-agent/scripts/jev_reply_lab.py [--equipe <uuid>] [--cases 3]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
from pathlib import Path
from time import perf_counter

import psycopg

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python-agent"))

from agno.agent import Agent  # noqa: E402
from agno.models.openai import OpenAIChat  # noqa: E402

from app.cognition.system_one import SystemOne, choice, noul  # noqa: E402

CASA_FLOW = "aa33b576-3959-4a81-8e73-4027039ea2ce"
JEV_USD_PER_TOKEN = 0.042 / 1e6

SQL = """
with good as (
  select distinct o.lead_id, (s.stage_type = 'won') won, s.name stage
    from opportunities o join pipeline_stages_v2 s on s.id = o.stage_id
   where o.equipe_id = %(team)s and o.deleted_at is null and (s.stage_type = 'won' or s.position >= 2)
),
pairs as (
  select c.lead_id, g.won, g.stage, c.body q, c.created_at qa, r.body reply,
         (select n.body from messages n where n.lead_id = c.lead_id and n.sender_type = 'customer'
            and n.created_at > r.created_at order by n.created_at limit 1) next_customer
    from messages c join good g on g.lead_id = c.lead_id
    cross join lateral (select a.body, a.created_at from messages a where a.lead_id = c.lead_id
                          and a.sender_type = 'agent' and a.created_at > c.created_at order by a.created_at limit 1) r
   where c.sender_type = 'customer' and length(c.body) between 30 and 600 and length(r.body) > 60
),
pick as (select distinct on (lead_id) * from pairs where next_customer is not null order by lead_id, won desc, qa desc)
select json_build_object(
  'blocks', (select json_agg(json_build_object('type', type, 'content', content) order by created_at)
               from agent_trainings where equipe_id = %(team)s and coalesce(content, '') <> ''),
  'cases', (select json_agg(x) from (select json_build_object(
      'won', p.won, 'stage', p.stage, 'cliente', p.q, 'resposta_real', p.reply, 'proxima_msg_cliente', p.next_customer,
      'historico', (select json_agg(json_build_object('de', h.sender_type, 'texto', left(h.body, 500)) order by h.created_at)
                      from (select * from messages h where h.lead_id = p.lead_id and h.created_at < p.qa
                             order by h.created_at desc limit 6) h)) x
      from pick p order by p.won desc, p.qa desc limit %(n)s) t))
"""


def conninfo() -> str:
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = dict(l.split("=", 1) for l in (ROOT / ".env").read_text(encoding="utf-8").splitlines() if "=" in l and not l.startswith("#"))
    url = (ROOT / "supabase/.temp/pooler-url").read_text().strip()
    os.environ["PGPASSWORD"] = env["SUPABASE_DB_PASSWORD"].strip().strip("'\"")
    return url


def model() -> OpenAIChat:
    return OpenAIChat(
        id=os.getenv("VERBOO_MODEL", "deepseek-v4.1-flash"),
        base_url=os.getenv("VERBOO_BASE_URL", "https://code.verboo.ai/router/v1"),
        api_key=os.environ["VERBOO_API_KEY"],
        role_map={"system": "system", "user": "user", "assistant": "assistant", "tool": "tool", "model": "assistant"},
    )


SYSTEM = """Você é o atendente da empresa no WhatsApp. Responda a ÚLTIMA mensagem do cliente.
- Use só as informações da BASE abaixo e do histórico. Se a base não cobre, diga que vai verificar — nunca invente preço, prazo ou condição.
- Estilo WhatsApp: curto (até 4 frases), natural, em português do Brasil, e termine conduzindo ao próximo passo.
- Responda só com o texto da mensagem.

BASE:
"""


async def generate(case: dict, blocks: list[dict]) -> tuple[str, int]:
    base = "\n\n".join(f"[{b['type']}] {b['content']}" for b in blocks) or "(nenhuma informação disponível)"
    hist = "\n".join(f"{h['de']}: {h['texto']}" for h in case.get("historico") or [])
    agent = Agent(model=model(), system_message=SYSTEM + base, telemetry=False)
    t = perf_counter()
    out = await agent.arun(f"HISTÓRICO:\n{hist}\n\nÚLTIMA MENSAGEM DO CLIENTE:\n{case['cliente']}")
    return str(out.content or "").strip(), int((perf_counter() - t) * 1000)


def state(case: dict) -> dict:
    return {"historico": case.get("historico") or [], "mensagem_cliente": case["cliente"]}


async def select_blocks(jev: SystemOne, case: dict, blocks: list[dict]) -> tuple[list[tuple[float, dict]], int, int]:
    qs = {
        f"b{i}": noul(
            {"bloco": b["content"][:2500], "pergunta": "Este `bloco` traz informação necessária para responder bem a `mensagem_cliente`?"},
            true="Sim: sem este bloco a resposta ficaria incompleta ou errada.",
            false="Não: o bloco é de outro assunto ou não ajuda nesta mensagem.",
        )
        for i, b in enumerate(blocks)
    }
    j = await jev.judge(state(case), qs)
    scored = sorted(((j.noul(f"b{i}") or 0.0, b) for i, b in enumerate(blocks)), key=lambda x: -x[0])
    return scored, j.ms, j.input_tokens


CRITERIA = {
    "responde": noul("A `resposta` responde de fato o que o cliente perguntou ou pediu na `mensagem_cliente`?"),
    "fundamentada": noul("Tudo o que a `resposta` afirma (preço, prazo, produto, condição) está na `base` ou no `historico`?"),
    "inventa": noul("A `resposta` inventa ou promete algo que não está na `base` nem no `historico`?"),
    "tom": noul("A `resposta` soa como uma pessoa atenciosa no WhatsApp: curta, natural, sem parecer robô?"),
    "avanca": noul("A `resposta` conduz o cliente a um próximo passo concreto da compra (visita, orçamento, pagamento, agendamento)?"),
}


async def evaluate(jev: SystemOne, case: dict, blocks: list[dict], reply: str) -> tuple[dict, int]:
    base = [{"tipo": b["type"], "conteudo": b["content"][:1500]} for b in blocks]
    j = await jev.judge({**state(case), "base": base, "resposta": reply}, CRITERIA)
    return {k: j.noul(k) for k in CRITERIA}, j.input_tokens


async def best(jev: SystemOne, case: dict, replies: dict[str, str]) -> tuple[dict[str, float], int]:
    labels = list(replies)
    random.shuffle(labels)  # position never tells which one is real
    keys = {f"r{i + 1}": name for i, name in enumerate(labels)}
    j = await jev.judge(
        {**state(case), "respostas": {k: replies[n] for k, n in keys.items()}},
        {"best": choice("Qual das `respostas` tem mais chance de manter o cliente engajado e fazer a venda avançar?",
                        {k: f"A resposta {k}" for k in keys})},
    )
    return {keys[k]: round(p, 2) for k, p in j.probabilities("best").items()}, j.input_tokens


def cut(text: str, n: int = 420) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[:n] + "…"


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--equipe", default=CASA_FLOW)
    ap.add_argument("--cases", type=int, default=3)
    ap.add_argument("--select-at", type=float, default=0.5)
    args = ap.parse_args()

    with psycopg.connect(conninfo()) as conn:
        data = conn.execute(SQL, {"team": args.equipe, "n": args.cases}).fetchone()[0]
    blocks, cases = data["blocks"] or [], data["cases"] or []
    print(f"{len(blocks)} blocos de treinamento · {len(cases)} conversas com resultado\n")

    jev = SystemOne(os.environ["JEV_API_KEY"], timeout=20.0)
    totals = {"real": [], "A_jev": [], "B_todos": []}
    jev_tokens = 0
    for n, case in enumerate(cases, 1):
        print("=" * 100)
        print(f"CASO {n} · {'GANHO' if case['won'] else 'avançou'} (etapa {case['stage']})")
        print(f"CLIENTE: {cut(case['cliente'])}")

        scored, sel_ms, tok = await select_blocks(jev, case, blocks)
        jev_tokens += tok
        chosen = [b for p, b in scored if p >= args.select_at][:5]
        print(f"\nJEV escolheu {len(chosen)}/{len(blocks)} blocos em {sel_ms} ms:")
        for p, b in scored[:6]:
            print(f"  {p:.2f} {'✔' if p >= args.select_at else ' '} [{b['type']}] {cut(b['content'], 90)}")

        (a, a_ms), (b_, b_ms) = await asyncio.gather(generate(case, chosen), generate(case, blocks))
        chars_a, chars_b = sum(len(x["content"]) for x in chosen), sum(len(x["content"]) for x in blocks)
        replies = {"real": case["resposta_real"], "A_jev": a, "B_todos": b_}
        print(f"\nREAL      : {cut(case['resposta_real'])}")
        print(f"A (Jev)   : {cut(a)}   [{a_ms} ms, base {chars_a} chars]")
        print(f"B (todos) : {cut(b_)}   [{b_ms} ms, base {chars_b} chars]")
        print(f"O QUE ACONTECEU: o cliente respondeu → {cut(case['proxima_msg_cliente'], 200)}")

        print(f"\n  {'critério':<13}{'real':>8}{'A_jev':>8}{'B_todos':>9}")
        scores = {}
        for name, reply in replies.items():
            scores[name], tok = await evaluate(jev, case, blocks, reply)
            jev_tokens += tok
            totals[name].append(scores[name])
        for crit in CRITERIA:
            print(f"  {crit:<13}" + "".join(f"{(scores[r][crit] or 0):>8.2f}" + (" " if r == "B_todos" else "") for r in replies))
        pref, tok = await best(jev, case, replies)
        jev_tokens += tok
        print(f"  {'mais avança':<13}{pref.get('real', 0):>8.2f}{pref.get('A_jev', 0):>8.2f}{pref.get('B_todos', 0):>9.2f}")

    print("=" * 100)
    print("MÉDIA DOS CASOS (inventa: menor é melhor)")
    for crit in CRITERIA:
        row = [sum((s[crit] or 0) for s in totals[r]) / max(len(totals[r]), 1) for r in totals]
        print(f"  {crit:<13}" + "".join(f"{v:>8.2f}" for v in row))
    print(f"\nJev: {jev_tokens} tokens ≈ US$ {jev_tokens * JEV_USD_PER_TOKEN:.5f} no total")
    await jev.aclose()


if __name__ == "__main__":
    asyncio.run(main())
