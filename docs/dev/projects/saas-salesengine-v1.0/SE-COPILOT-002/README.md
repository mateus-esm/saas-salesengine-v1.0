# SE-COPILOT-002 — Visualização das ações do Copilot no pipeline + aprovação em massa

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-COPILOT-002 |
| Branch | `task/SE-COPILOT-002-pipeline-copilot-visualization` |
| Agente | verboo (implementação) |
| Status | ✅ Implementado · ⚠️ Validações **não executadas** (npm bloqueado no sandbox) — ver §Validações |
| Artefatos | `verboo/implementacao.md` · este README · `result.md` (cópia) |

## O que mudou

O painel de aprovações do pipeline (`CopilotApprovalsPanel`, montado em 3 lugares) deixou de ser
uma grade de cartões que **desaparecia em silêncio** (`return null` em loading e em lista vazia) e
passou a ser a **mesma fila da casa do Copilot** — a que a Onda 1 (`SE-COPILOT-001`) construiu em
`CopilotApprovals.tsx`:

- **Visualização** — cada sugestão mostra, sem abrir nada: **o que** o Copilot quer fazer
  (`output_action.label`, a frase que o banco já escreveu para uma pessoa), **em qual negócio**
  (nome do contato vindo de `leads`, com link), **confiança** (%), **por que espera** (badge com o
  `why`), **motivo** (`input_summary`, a razão do modelo) e **estado** (`aguardando`, com data).
- **Seleção múltipla + massa** — checkbox por sugestão, "Selecionar" no cabeçalho, barra
  *Aprovar selecionadas* / *Recusar selecionadas*: **N chamadas paralelas** de `resolveApproval` e
  **um único resumo** (`2 aplicadas.`, `1 recusada; 1 com erro.`) — nunca um toast por item.
- **Estados visíveis** — carregando (skeleton + `aria-busy`), erro com *Tentar de novo*, e vazio
  ("Nada esperando por você.") em vez do `null` mudo.
- **Densidade / agrupamento / filtro** — chips de filtro por motivo com contador, lista agrupada
  por motivo (risco primeiro) com contador por grupo, `max-h` com rolagem.
- **Os 3 pontos de montagem** — `variant="banner"` (faixa full-width acima das abas do workspace)
  e `variant="inline"` (accordion "Aprovações" do agente e sheet de configuração, onde o container
  já desenha o card).

O **fluxo individual** de aprovar/recusar continua exatamente o mesmo: um `resolveApproval` por
decisão, um toast, cache invalidado. **Não** foi trocado pelo RPC `crm_copilot_resolve` da Onda 1.

Bônus fora do painel: `formatCopilotActivity` passou a entender o payload aninhado que a Onda 6
(`crm_copilot_apply`) grava (`action.type` + `label`), então essas linhas deixaram de aparecer como
"manual | - | -" no histórico do `ControlRoom`.

## Validações

⚠️ **Não executadas.** Neste sandbox `npm` (e portanto `ci`, `typecheck`, `lint`, `test`, `build`)
retorna *"This command requires approval"* e `node_modules` não existe no worktree — mesmo bloqueio
já registrado em `SE-COPILOT-001`/`SE-LEAD-001`. Nada foi mascarado nem presumido:

| Comando | Resultado |
|---|---|
| `NODE_ENV=development npm ci --include=dev` | não executado (bloqueado) |
| `npm run typecheck` | não executado (bloqueado) |
| `npm run lint` | não executado (bloqueado) |
| `npm test` | não executado (bloqueado) |
| `npm run build` | não executado (bloqueado) |

**Baseline conhecido** (medido em `SE-COPILOT-001`, mesmo worktree/toolchain): `npm test` → 13
arquivos falhos, 33 testes falhos, 326 passaram; causas principais `jsxDEV is not a function` nos
testes React, env Supabase ausente e testes `node:fs`/`node:path` em ambiente browser. `typecheck`,
`lint` (85 warnings) e `build` passavam. Os testes novos desta task **não foram rodados** e podem
herdar o mesmo `jsxDEV`.

Verificação estática feita no lugar: revisão linha a linha do diff, checagem dos tipos/props
consumidos (`CopilotApprovals`, `bulkResolveText`, `summarizeResolveOutcomes`) e das asserções dos
testes contra o markup real dos componentes.

**Verificação independente (agente adversarial): PARTIAL** — a única lacuna é ambiental (nenhum
comando executável). O relatório conclui *"Everything I could verify statically checks out […] I
found no functional defect"*, tendo recuperado o card removido via `git show HEAD:` para comparar o
fluxo individual (endpoint, strings de toast e chaves de cache **idênticos**) e auditado as
asserções dos 3 testes novos contra o markup real. Observações não bloqueantes: divergência de
`WHERE` entre o painel e o `crm_copilot_feed` (`agent_role` / `proposed` — pré-existente), spinner
no botão Aprovar ao recusar e card-em-card no `variant="inline"` — todas em `verboo/implementacao.md` §7.

## Sem migration

Nenhuma alteração de schema. O embed `lead:leads(id, name, phone)` usa a FK
`ai_decisions.lead_id → leads.id` que já existe, no mesmo formato que `useCopilotCredits` e
`crm_copilot_feed` já usam. O em massa reusa `resolveApproval` (`/api/v1/approvals/{id}/resolve`),
que já revalida cada decisão no servidor.

## Onde está o código

| Arquivo | Papel |
|---|---|
| `src/components/crm/copilot/CopilotApprovalsPanel.tsx` | painel: estados visíveis, mapeamento, massa em paralelo, resumo único |
| `src/lib/copilotApprovals.ts` | `actionableDecisions`, `decisionToQueueItem`, `summarizeResolveOutcomes` |
| `src/hooks/useCopilotApprovals.ts` | `select("*, lead:leads(id, name, phone)")`; `input_summary` entra e o campo fantasma `reason` sai do tipo |
| `src/lib/copilotActivity.ts` | payload aninhado da Onda 6 lido como frase (`label`) |
| `src/components/crm/copilot/CopilotApprovals.tsx` | fila compartilhada (reuso puro, só comentário alterado) |
| `src/components/crm/PipelineWorkspace.tsx` | banner (default) |
| `src/components/crm/copilot/PipelineAgentView.tsx` | accordion → `variant="inline"` |
| `src/components/crm/copilot/CopilotSettingsSheet.tsx` | sheet → `variant="inline"` |
| `src/components/crm/copilot/CopilotApprovalCard.tsx` | **removido** — a fila o substitui (justificativa em `verboo/implementacao.md` §3) |
| `src/lib/__tests__/copilotApprovals.test.ts` | testes do mapeamento e do resumo de massa |
| `src/lib/__tests__/copilotActivity.test.ts` | testes do payload da Onda 6 |
| `src/components/crm/copilot/__tests__/CopilotApprovalsPanel.test.tsx` | testes do painel (estados, massa, individual) |
