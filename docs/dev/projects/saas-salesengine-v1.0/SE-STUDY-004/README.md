# SE-STUDY-004 — TypeSafe Jev na camada de decisão do Copilot

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-STUDY-004 — viabilidade de trocar/complementar as decisões do Copilot (LLM + Pydantic) por TypeSafe Jev (SystemOne, `jev-latest`, Noul/Choice/Score), mantendo o Agno como orquestrador |
| Origem | `contexto/spec.md` (11 perguntas + acceptance), base `origin/main` = `3737d59` (Merge PR #25) |
| Agentes | Verboo (estudo completo, read-only) |
| Status | ✅ Estudo concluído — veredito **PARCIAL** (ver resumo executivo) |
| Branch | `study/typesafe-jev-copilot` (zero mudança de código) |

## Artefatos

- `verboo/estudo-completo.md` — responde às 11 perguntas com evidência `arquivo:linha`:
  inventário dos schemas e nº de chamadas LLM por caminho, mapeamento campo-a-campo para
  Noul/Choice/Score, o que o Jev não faz, viabilidade com Agno, arquitetura atual vs
  proposta, latência, custo, mapa de gaps, prós/contras, riscos e plano de fases.
- `verboo/resumo-executivo.md` — 1 página: veredito, prós/contras, decisões do founder e
  próximos passos.
- `contexto/spec.md` — contrato da tarefa (entrada, não alterado).

## Veredito em três linhas

1. Manter o Agno como orquestrador é **livre** — a orquestração já é Python puro + fila no
   Postgres; o `agno_workflow.py` não importa nada de `agno`.
2. O Jev encaixa na **cascata legada** (Torre `RouteDecision` + Chão `IntentDecision`):
   2 chamadas generativas sequenciais → 1 chamada com N questions.
3. O Jev **não** encaixa no caminho ativo (Onda 6): o `keeper` já é 1 chamada por negócio
   e é ~80% extração/geração — o Jev adicionaria uma ida, não removeria.

## Pendências

- **Fase 0 (bloqueante):** instrumentar `usage`/tokens, `provider` e `latência` por
  decisão em `copilot_run_events` e no ledger de crédito. Hoje **não há medição de tokens**
  no `python-agent` — sem isso, a comparação de custo fica em hipótese.
- **Bloqueante de negócio:** modelo de cobrança e preço do SystemOne (por token? por
  chamada? por question?). A referência disponível não publica preço.
- **Bloqueante de decisão:** autorizar um 2º provedor externo no hot path, com timeout
  explícito (inexistente hoje) e fallback obrigatório para o LLM.
- **LGPD:** avaliar o Jev como subprocessador (destinatário novo da conversa do cliente)
  e definir opt-out por tenant.
- **Confirmar alvo do piloto:** a cascata legada ainda é alvo válido? O `sweep` a usa
  direto (`routers/sweep.py:58,133`), mas o Sync do botão já não passa por ela.
- Fora do escopo deste estudo: preços, latências e acurácia do Jev (sem medição e sem
  acesso à documentação pública no ambiente do estudo — tudo marcado como hipótese).
