# Sprint 13 — Copilot System 1 (Jev) + System 2 (Agno) · v1

> **Para agentes:** plano executado inline (superpowers:executing-plans), tarefa a tarefa, TDD.
> Checkboxes `- [x]` marcam o progresso.

**Goal:** o keeper do Copilot passa a pensar em dois sistemas — o **Jev** (System 1, TypeSafe)
decide rápido e calibrado *se* e *o quanto* confiar; o **LLM via Agno** (System 2) só escreve quando
há algo a escrever.

**Architecture:** o código continua dono do fluxo (`keeper.run_job`). Em volta da única chamada ao
LLM entram duas chamadas ao Jev, cada uma com várias perguntas em paralelo (*speculative fan-out*):
**triagem** antes (há sinal? que etapa? fechou?) e **verificação** depois (a conversa sustenta cada
ação proposta?). A probabilidade calibrada do Jev substitui a confiança auto-declarada do LLM no
portão do `crm_copilot_apply`. Tudo entra primeiro em **modo sombra** (mede, não muda nada), e só
vira **on** por uma regra de decisão escrita antes de ver os dados.

**Tech Stack:** FastAPI + Agno 2.6 (`OpenAIChat` → Verboo `deepseek-v4-flash-0731`) · Jev
`jev-1.13.0` via `POST https://api.typesafe.ai/v1/systemone` (httpx) · Postgres/Supabase (fila
`copilot_jobs`, `crm_copilot_apply`, telemetria em `copilot_run_events`) · pytest/respx.

**Spec:** este arquivo (pedido original do founder abaixo) + docs TypeSafe
(<https://docs.typesafe.ai/llms.txt>) + Agno (<https://docs.agno.com/>).

---

## 0. Pedido original (founder, 27/09)

> Integrar o modelo System 1 **Jev** (TypeSafe AI) para melhorar velocidade e decisões do Copilot,
> numa estratégia combinada **Agno + Jev**, servida pelo microserviço `agent.soloventures.com.br`.
> Revisar as interações e decisões do agente hoje no Supabase para entender o que funciona e o que
> não. O Jev precisa decidir se a decisão precisa ir a um LLM, decidir etapa, decidir o tipo de
> ação e mais — aplicado com ciência e precisão, porque depois vou estudar a implementação para
> replicar em outros sistemas agênticos.

`JEV_API_KEY` já está no Dokploy. **A chave não vive neste arquivo** (estava em texto puro; foi
removida antes do commit — o lugar dela é só o env do serviço).

---

## 1. Diagnóstico — o que os dados dizem (13/09 → 27/09)

Fonte: `copilot_run_events` (kind `keeper_*`) e `ai_decisions` (`agent_role='copilot'`).

| Medida | Valor | Leitura |
|---|---|---|
| Passadas | 753 done · 350 failed · 246 skipped | 1 em 4 falha |
| Tempo do modelo | **p50 15,6 s · p90 520 s** | a cauda prende 1 dos 4 slots da fila por minutos |
| Contexto / apply (SQL) | p50 362 ms / 423 ms | o banco não é o gargalo |
| Passadas *done* sem nenhuma ação | **180 de 753 (24 %)** | LLM pago para concluir "nada" |
| Falhas por credencial do Verboo | 318 (23–25/09) | operação, não código |
| Falhas por resposta com cerca ```` ```json ```` | 4 | **bug**: JSON válido lido como "erro de provedor" |
| Decisões `auto_applied` | 573 | |
| Decisões `pending_approval` | **~700 · 0 aprovadas por humano** | a fila de aprovação é um cemitério |
| Motivo da espera | `low_confidence` ≈ 45 % · `no_credits` ≈ 37 % · `risky` ≈ 13 % | |
| Confiança do LLM | se amontoa em **0,60–0,65** e **0,80–0,89** | não é calibrada: é um estilo de escrita |

**Conclusão.** O portão `confidence ≥ 0,75` decide o destino de quase metade das ações, mas o número
que ele lê é a confiança **auto-declarada** do LLM — que não mede nada (dois montes, sem relação
com acerto). Como ninguém aprova, "abaixo do limiar" hoje significa "perdido". Ao mesmo tempo, 1/4
das chamadas ao LLM (15 s cada) termina sem ação. As duas alavancas são exatamente o que um System 1
calibrado faz: **decidir se vale chamar o LLM** e **dar um número de confiança que significa algo**.

**Prova de conceito (27/09, conversa sintética em português):**

| Caso | `sinal` | etapa | latência | tokens |
|---|---|---|---|---|
| Proposta aceita + visita marcada + e-mail | 0,97 | "Visita agendada" (conf 0,85) | 0,34–0,63 s | 745 |
| "bom dia / ok obrigado" | **0,05** | fica na atual (conf 0,74) | 0,52 s | 699 |

Custo do Jev: US$ 0,042 por **milhão** de tokens de entrada (saída grátis) → ~US$ 0,00003 por
passada. 32k tokens de `state`, 1.200 req/min. Português funciona, mas o inglês é a língua principal
do treino — **por isso o modo sombra vem antes de qualquer decisão automática.**

---

## 2. Arquitetura — System 1 em volta do System 2

```
fila (copilot_jobs) ──tick──► run_job
                                │
                     crm_copilot_context (1 SQL)
                                │
            ┌───────── Jev · TRIAGEM (1 chamada, 7 perguntas em paralelo) ─────────┐
            │  sinal(noul) · etapa(choice) · desfecho(choice) · próximo_passo(noul) │
            │  valor(noul) · contato(noul) · campo(noul)                            │
            └───────────────────────────────┬───────────────────────────────────────┘
                 modo on + tudo abaixo de 0,2 │ senão
                 ┌───────────────────────────┴────────────┐
                 ▼                                        ▼
       QUIETO: avança o cursor               Agno · LLM (System 2) escreve
       (apply [], sem LLM, ~0,5 s)           resumo + ações  (timeout 60 s)
                                                          │
                                  Jev · VERIFICAÇÃO (1 chamada, 1 noul por ação)
                                                          │
                                 modo on: confidence := P(conversa sustenta a ação)
                                                          │
                                         crm_copilot_apply (portão por pipeline)
```

Princípios (TypeSafe *"code owns the workflow"* + Kahneman):

1. **Julgamento ≠ geração.** Jev só responde perguntas tipadas (noul/choice); o LLM só escreve
   texto (resumo, nota, título de tarefa, valores livres). Nenhum dos dois executa: o banco valida e
   aplica (`_copilot_check` continua sendo a lei).
2. **Perguntas independentes juntas.** Triagem inteira numa chamada; verificação de N ações numa
   chamada. Latência ≈ a de uma pergunta.
3. **Falha aberta.** Jev fora do ar/lento (timeout 5 s) → o keeper faz exatamente o que faz hoje e
   registra `s1.error`. O System 1 nunca pode derrubar o System 2.
4. **Sombra antes de ligar.** `JEV_MODE=shadow` roda tudo e grava tudo, sem mudar rota nem
   confiança. Em sombra a verificação roda **em paralelo** com o apply: custo de latência zero.
5. **Versão fixa.** `JEV_MODEL=jev-1.13.0` (não o alias `jev-latest`): limiares valem para um
   modelo; trocar de versão é decisão explícita.
6. **Onde mora cada coisa:** `app/cognition/system_one.py` é o cliente genérico (reusável por
   qualquer agente — chat, doormen, outros produtos); `app/copilot/judgments.py` são as perguntas e a
   política *deste* keeper. Replicar em outro sistema = escrever um novo `judgments.py`.

### Por que não o SDK `typesafe-sdk` nem um Agno Workflow?

- **HTTP direto (httpx, ~100 linhas)**: o contrato é um POST; sem dependência nova no lock/Docker,
  e o código fica legível de ponta a ponta para estudo. Retry: 1 nova tentativa em 429/5xx/timeout.
- **Agno fica onde agrega**: agente LLM com provider trocável por env (`app/llm.py`). Encaixar o
  keeper num `agno.workflow` (Router/Condition) trocaria 40 linhas de `if` claras por um framework
  para exatamente o mesmo grafo. Quando o grafo crescer (ver §6), aí sim.

---

## 3. Hipóteses e regra de decisão (escritas antes dos dados)

| # | Hipótese | Métrica (relatório `supabase/scripts/2026-09-27_copilot_jev_shadow_report.sql`) | Liga `on` se |
|---|---|---|---|
| H1 | Jev reconhece passadas sem sinal | **falso-quieto** = passadas que Jev mandaria para "quieto" mas cujo LLM gerou ação que ficou aplicada (não desfeita) ÷ passadas quietas | ≤ 3 % |
| H2 | Isso economiza de verdade | **cobertura** = passadas quietas ÷ passadas com mensagem | ≥ 15 % |
| H3 | A verificação separa ação boa de ruim melhor que o LLM | ações desfeitas/recusadas têm P(Jev) média menor que as mantidas, e a separação do Jev > a do `llm_confidence` | Jev separa melhor |
| H4 | O System 1 é confiável | `s1.error` ÷ passadas | < 1 % |
| H5 | Etapa do Jev concorda com o LLM | concordância `triage.stage` × `move_stage` do LLM | só observação (base para o caminho rápido §6) |

Amostra mínima: **300 passadas em sombra** (~2 dias no volume atual). Se H1 falhar, sobe o limiar
de quieto (0,2 → 0,1) e mede de novo — não se liga "no olho".

---

## 4. Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `python-agent/app/cognition/system_one.py` (novo) | cliente Jev: `SystemOne.judge(state, questions) -> Judgments`, construtores `noul()`/`choice()`, `SystemOneError` |
| `python-agent/app/copilot/judgments.py` (novo) | perguntas do keeper (`triage_questions`, `verify_questions`, `action_claim`), leitura (`Triage`), política (`System1` com `mode`, `quiet_below`) |
| `python-agent/app/copilot/keeper.py` | `run_job` ganha `s1` e `model_timeout_s`; rota quieta; verificação; telemetria `s1` |
| `python-agent/app/routers/jobs.py` | monta `System1` pelas settings (seam `get_system1`) |
| `python-agent/app/config.py` | `jev_api_key`, `jev_model`, `jev_mode`, `jev_quiet_below`, `jev_timeout_s`, `keeper_model_timeout_s` |
| `python-agent/app/llm.py` | `parse_model_output` aceita JSON dentro de cerca markdown |
| `python-agent/.env.example` | bloco JEV_* |
| `python-agent/tests/test_system_one.py`, `tests/test_judgments.py` (novos), `tests/test_keeper.py`, `tests/test_llm.py`, `tests/test_jobs_router.py` | unit (sem rede) |
| `python-agent/evals/test_eval_system_one.py` (novo) | eval ao vivo do Jev nos casos do keeper (pula sem `JEV_API_KEY`) |
| `supabase/scripts/2026-09-27_copilot_jev_shadow_report.sql` (novo) | o relatório das hipóteses H1–H5 |

Sem migration: a telemetria vai no `payload` jsonb que já existe; a confiança calibrada entra pelo
mesmo campo `confidence` da ação que o `crm_copilot_apply` já lê.

## Global Constraints

- Python 3.12, sem dependência nova (httpx já vem com `openai`).
- Default `JEV_MODE=shadow`; sem `JEV_API_KEY` o System 1 fica desligado e o keeper é o de hoje.
- Nenhum teste de `tests/` toca a rede. Evals ao vivo só em `evals/`.
- Strings para usuário/modelo em português com acento.
- A chave nunca em código, log ou payload.

## Review Focus

1. Jev lento/fora → a passada segue igual a hoje (falha aberta) — teste em `test_keeper.py`.
2. Modo quieto **tem de avançar o cursor** (senão a mesma conversa volta toda vez) — teste.
3. Índice da verificação alinhado com o `index` 1-based do `crm_copilot_apply` (o relatório junta por ele) — teste.
4. Conversa enorme → `state` cortado nas mensagens mais recentes (limite de 32k tokens) — teste.
5. Pipeline com etapas de nome repetido/sem descrição → chaves `e1..eN` mapeiam de volta ao id certo — teste.

---

## 5. Tarefas

### Task 1 — Parser aceita JSON em cerca markdown
**Files:** `app/llm.py`, `tests/test_llm.py`
- [x] Teste: `parse_model_output('```json\n{"summary":"x"}\n```', KeeperOutput)` valida; texto com JSON cercado por prosa também; texto sem JSON continua `ModelProviderError`.
- [x] Implementar `_strip_fences` (cerca ``` com ou sem `json`) antes do `json.loads`.
- [x] `pytest tests/test_llm.py`

### Task 2 — Cliente System One
**Files:** `app/cognition/system_one.py`, `tests/test_system_one.py`
**Produces:**
```python
def noul(instructions, *, true=None, false=None) -> dict
def choice(instructions, criteria: dict[str, Any]) -> dict
class SystemOneError(RuntimeError)
@dataclass(frozen=True) class Judgments:
    model: str; answers: dict[str, dict]; input_tokens: int; ms: int
    def noul(self, key) -> float | None
    def choice(self, key) -> tuple[str | None, float | None]      # (opção, confidence)
    def probabilities(self, key) -> dict[str, float]
class SystemOne:
    def __init__(self, api_key: str, *, model="jev-1.13.0", url=JEV_URL, timeout=5.0, transport=None)
    async def judge(self, state: Any, questions: dict[str, dict]) -> Judgments
```
- [x] Testes (respx): corpo enviado (`model`, `state`, `questions`, Bearer); leitura de noul/choice/probabilities; 1 retry em 503 e sucesso; 401 → `SystemOneError` sem retry; timeout → `SystemOneError`; resposta sem `answers` → `SystemOneError`.
- [x] Implementar.

### Task 3 — Perguntas e política do keeper
**Files:** `app/copilot/judgments.py`, `tests/test_judgments.py`
**Consumes:** Task 2. **Produces:**
```python
def jev_state(ctx) -> dict                         # etapa atual, etapas, campos, resumo, conversa nova (cortada)
def triage_questions(ctx) -> tuple[dict, dict[str, str]]   # (questions, {"e1": stage_id,...})
@dataclass class Triage: signal; intents: dict[str, float]; stage_id; stage_confidence; outcome; outcome_confidence
    def quiet(self, below: float) -> bool
    def as_log(self) -> dict
def read_triage(j: Judgments, stage_keys, ctx) -> Triage   # ctx diz qual é a etapa atual
def action_claim(action, ctx) -> str               # a ação em uma frase, com nomes (não ids)
def verify_questions(ctx, actions) -> dict          # "a1".."aN" (1-based, = index do apply)
@dataclass class System1: client; mode: "shadow"|"on"; quiet_below=0.2
    async def triage(ctx) -> tuple[Triage | None, dict]      # nunca levanta; dict = log (ms, tokens, model, error)
    async def verify(ctx, actions) -> tuple[list[float] | None, dict]
def calibrate(actions, probs) -> list[dict]        # confidence := p; guarda llm_confidence
```
- [x] Testes: chaves `e1..eN` ↔ ids (inclusive nomes repetidos); conversa longa cortada (mantém as últimas); `quiet` só quando sinal **e** todas as intenções < limiar; claims para os 8 tipos de ação, com nome da etapa/rótulo do campo; `verify_questions` 1-based; `calibrate` não muta a entrada; `System1.triage` devolve `(None, {"error":…})` quando o cliente falha.
- [x] Implementar.

### Task 4 — Keeper com System 1
**Files:** `app/copilot/keeper.py`, `tests/test_keeper.py`
**Consumes:** Task 3. `run_job(job, *, repo, think, model_id, s1: System1 | None = None, model_timeout_s: float | None = None)`
- [x] Testes: (a) `s1=None` → comportamento idêntico (testes antigos passam); (b) modo on + triagem quieta → **sem** LLM, `apply(actions=[], cursor=last_message_at, summary=None)`, job `skipped` com `route: "quiet"`; (c) modo on + sinal → LLM, verificação, ações chegam ao apply com `confidence` do Jev e `llm_confidence`; (d) sombra + triagem quieta → LLM roda igual, ações com a confiança do LLM, payload `s1.would_quiet=true` e `s1.verify` gravados; (e) Jev falha → passada igual a hoje, `s1.error` gravado; (f) LLM passa do timeout → `failed` com "tempo esgotado".
- [x] Implementar.

### Task 5 — Wiring: settings, router, env
**Files:** `app/config.py`, `app/routers/jobs.py`, `.env.example`, `tests/test_jobs_router.py`
- [x] Teste: com `JEV_API_KEY` + `JEV_MODE=shadow` o tick passa `s1` ao `process`; sem chave ou `off` passa `None`.
- [x] Implementar (`get_system1(settings)` com cliente reaproveitado entre ticks — keep-alive TLS).

### Task 6 — Eval ao vivo + relatório das hipóteses
**Files:** `evals/test_eval_system_one.py`, `supabase/scripts/2026-09-27_copilot_jev_shadow_report.sql`
- [x] Eval: nos `KEEPER_CASES`, triagem com sinal > 0,5 onde há ação esperada e < 0,5 no caso vazio; verificação P > 0,5 nas ações esperadas e < 0,5 em ações inventadas (ganho sem fechamento, etapa errada). Pula sem `JEV_API_KEY`.
- [x] SQL: H1–H5 a partir de `payload->'s1'` + `ai_decisions` (join por `run_id` + `index`).
- [x] Rodar a eval ao vivo e registrar o resultado em §7.

### Task 7 — Gate final
- [x] `python -m pytest tests -q` verde; eval ao vivo registrada.
- [x] Revisão do diff; commit em branch `task/SE-JEV-001-copilot-system-one`; PR.

---

## 6. Depois da sombra (próximas ondas — não nesta)

1. **Ligar `JEV_MODE=on`** quando H1–H4 passarem (§3). Só env no Dokploy.
2. **Caminho rápido sem LLM**: quando a triagem só tiver etapa/desfecho com confiança alta (H5
   mostrando concordância), gerar `move_stage`/`set_outcome` no código — passada de 15 s para <1 s.
3. **Selecionar em vez de gerar** para campos `select`/`multi_select`: um `choice` por campo com
   as opções + "não mencionado" (cookbook *pre-parsed value extraction*).
4. **Chat**: `choice` do Jev escolhe a consulta (as 3 tools) antes do planner LLM; cumprimento
   responde sem LLM.
5. **Fila de aprovação viva**: com confiança calibrada, as faixas viram política —
   `≥ limiar` aplica, faixa média pede aprovação **com prazo**, baixa descarta (hoje tudo empilha).
6. **Ops** (fora do código): `no_credits` segura 37 % das pendências — carteira Copiloto; o token do
   Verboo expirou 23–25/09 (318 falhas) — alerta de credencial.

---

## 7. Resultado (27/09)

**Entregue** na branch `task/SE-JEV-001-copilot-system-one` — sem migration, sem dependência nova.

| Arquivo | Linhas | O quê |
|---|---|---|
| `app/cognition/system_one.py` | novo | cliente Jev genérico (noul/choice, retry 1× em 429/5xx/timeout, falha = `SystemOneError`) |
| `app/copilot/judgments.py` | novo | estado por nomes, 7 perguntas de triagem, verificação por ação, política `System1` |
| `app/copilot/keeper.py` | `run_job` | triagem → [LLM com timeout] → verificação → apply; telemetria `s1` |
| `app/routers/jobs.py`, `app/config.py`, `.env.example` | wiring | `JEV_*`, `KEEPER_MODEL_TIMEOUT_S`; cliente reaproveitado entre ticks |
| `app/llm.py` | fix | JSON em cerca markdown deixa de derrubar a passada |
| `evals/test_eval_system_one.py` | novo | eval ao vivo |
| `supabase/scripts/2026-09-27_copilot_jev_shadow_report.sql` | novo | H1–H5 (roda limpo na produção; vazio até o deploy) |

**Testes:** `pytest tests` → **403 passed**, 21 skipped (baseline 373 + 30 novos).

**Eval ao vivo do Jev (`jev-1.13.0`, 27/09) — 4/4:**

| Medida | Resultado |
|---|---|
| Falso-quieto (5 conversas com fato novo) | **0/5** — `signal` 0,94–0,98 |
| Quieto verdadeiro (4 conversas vazias: "ok obrigado", cumprimento, 👍, resposta automática) | **4/4** — `signal` 0,07–0,10 |
| Etapa "Qualificado" / desfecho ganho / perdido | certo · conf 0,94 / 0,99 / 0,99 |
| Verificação: 6 ações sustentadas × 7 inventadas (valor errado, e-mail errado, ganho sem fechamento, etapa pulada) | média **0,87 × 0,03**, **0 erros** no corte 0,5 |
| Latência por chamada (7 perguntas) | 290–530 ms · ~700 tokens ≈ US$ 0,00003 |

**Iteração de pergunta registrada (o tipo de coisa que se estuda):** a v1 de `next_step`
perguntava por passo "combinado **ou necessário**" e disparou 0,67 numa resposta automática
("retorno em breve") — todo negócio aberto "precisa" de um próximo passo, então a pergunta media o
negócio, não a conversa. A v2 pergunta por pedido/combinado concreto e dá critérios de sim/não:
0,05–0,07 nas conversas vazias, sem perder as cheias. Lição: pergunta estreita + critério explícito
das duas respostas.

**Para colocar no ar (founder, Dokploy — deploy é manual):**
1. Merge do PR → redeploy do `python-agent`. `JEV_API_KEY` já está lá; `JEV_MODE` fica `shadow`
   por padrão — **nada muda para o cliente**, só a telemetria `s1` começa.
2. Depois de ~300 passadas (~2 dias): rodar o relatório; se H1–H4 passarem, `JEV_MODE=on`.
3. O `KEEPER_MODEL_TIMEOUT_S=60` passa a valer já no deploy (corta a cauda de 520 s).

**Não feito nesta sprint (de propósito):** as ondas de §6 dependem do que a sombra medir.

---

## 8. Guia de estudo — como isso funciona (para replicar)

**System 1 × System 2.** Um LLM (System 2) gera texto token a token: caro, lento, e a "confiança"
que ele escreve é só mais texto. Um System 1 (Jev) lê o estado uma vez e devolve, para cada pergunta,
uma **distribuição de probabilidade** treinada para ser calibrada (entre as vezes que ele diz 0,8, ~80 %
estão certas). Por isso ele serve de **portão** e de **medidor**, e o LLM serve de **autor**.

**Os três primitivos.** `noul` = P(sim) de uma condição · `choice` = uma opção de um conjunto, com
a distribuição e a `confidence` (concentração da distribuição) · `score` = posição numa escala
ordenada. Receita: pergunta estreita, estado com o necessário, critérios que descrevem cada resposta,
e sempre uma saída "nenhuma das anteriores".

**Os três lugares onde um System 1 entra num agente.**
1. *Antes* (triagem/roteamento): precisa de System 2? qual ferramenta? qual ramo?
2. *No lugar* (seleção): quando a resposta é escolher entre candidatos conhecidos (etapa, opção de
   campo, tool), o System 1 escolhe e o código copia — sem geração, sem alucinação.
3. *Depois* (verificação): cada afirmação/ação do System 2 vira uma pergunta "a evidência sustenta
   isto?" → número calibrado → política (aplica / pede humano / descarta).

**Método.** (1) medir o sistema atual; (2) escrever hipóteses e a regra de decisão **antes**; (3)
rodar em sombra, gravando o julgamento ao lado do que aconteceu; (4) decidir pela regra; (5) fixar a
versão do modelo junto com os limiares. Replicar em outro agente = trocar só o arquivo de perguntas
(`judgments.py`); o cliente (`system_one.py`) e o método são os mesmos.
