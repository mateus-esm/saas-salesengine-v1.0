# SE-COPILOT-002 — result

> Cópia fiel do `result.md` canônico. O caminho `/srv/solo-dev/tasks/running/SE-COPILOT-002/`
> está **fora do escopo de leitura/escrita** deste sandbox (mesma restrição de
> `SE-COPILOT-001`/`SE-LEAD-001`), então o conteúdo vive aqui e o orquestrador deve copiá-lo
> para o caminho canônico.

## Status

**Implementado no worktree** `/srv/solo-dev/worktrees/saas-salesengine-v1.0/SE-COPILOT-002`,
branch `task/SE-COPILOT-002-pipeline-copilot-visualization`.

- Commit: ⏳ **não executado** — `git add`/`git commit`/`git push`/`gh pr create` bloqueados
  pelo sandbox ("This command requires approval"). Os arquivos estão no worktree; os comandos
  exatos estão em §"Comandos para o humano" abaixo.
- PR: ⏳ não aberto (mesmo motivo).

## Entregáveis

| # | Pedido | Onde |
|---|---|---|
| 1 | Visualização: o que o Copilot quer fazer, em qual negócio, confiança, motivo e estado, legível sem abrir nada | `src/lib/copilotApprovals.ts` (`decisionToQueueItem`) + `src/components/crm/copilot/CopilotApprovals.tsx` (linha da fila) |
| 2 | Seleção múltipla + aprovar/recusar selecionadas com N chamadas paralelas e resumo único | `src/components/crm/copilot/CopilotApprovalsPanel.tsx` (`handleResolveMany` + `Promise.allSettled`) + `summarizeResolveOutcomes` |
| 3 | Estados visíveis: loading, erro com retry, vazio (fim do `null` silencioso) | `CopilotApprovalsPanel.tsx` (3 ramos de estado) |
| 4 | Densidade/agrupamento/filtro por motivo + contadores + badges | herdado da fila da Onda 1 (`groupByWhy`/`whyCounts`/`whyLabel`/`statusLabel`), agora alimentada pelo painel |
| 5 | Funcionar nos 3 pontos de montagem | prop `variant` (`"banner"` default; `"inline"` no `PipelineAgentView` e no `CopilotSettingsSheet`) |

Arquivos tocados:

- `src/components/crm/copilot/CopilotApprovalsPanel.tsx` (reescrito)
- `src/lib/copilotApprovals.ts` (novo)
- `src/hooks/useCopilotApprovals.ts` (`lead:leads(id, name, phone)` + `input_summary`)
- `src/lib/copilotActivity.ts` (payload aninhado da Onda 6)
- `src/components/crm/copilot/CopilotApprovals.tsx` (só comentário — fila compartilhada)
- `src/components/crm/PipelineWorkspace.tsx`, `PipelineAgentView.tsx`, `CopilotSettingsSheet.tsx` (montagem)
- `src/components/crm/copilot/CopilotApprovalCard.tsx` (**removido** — a fila o substitui)
- `src/lib/__tests__/copilotApprovals.test.ts`, `src/lib/__tests__/copilotActivity.test.ts`,
  `src/components/crm/copilot/__tests__/CopilotApprovalsPanel.test.tsx` (novos)

Fluxo **individual** de aprovar/recusar: **preservado** (um `resolveApproval` por decisão, mesmo
`busyId`, mesmo toast, mesmo `refresh`). Endpoint **não** trocado pelo `crm_copilot_resolve`.

## Migrations

**Nenhuma.** O nome do negócio vem do embed `lead:leads(...)` pela FK já existente
(`ai_decisions.lead_id → leads.id`), no mesmo formato de `useCopilotCredits`. Justificativa em
`verboo/implementacao.md` §4.

## Validações

⚠️ **Não executadas.** `npm` (e portanto `ci`, `typecheck`, `lint`, `test`, `build`) retorna
"This command requires approval" neste sandbox, e não há `node_modules` no worktree.

| Comando | Resultado |
|---|---|
| `NODE_ENV=development npm ci --include=dev` | ❌ não executado — bloqueado |
| `npm run typecheck` | ❌ não executado — bloqueado |
| `npm run lint` | ❌ não executado — bloqueado |
| `npm test` | ❌ não executado — bloqueado |
| `npm run build` | ❌ não executado — bloqueado |

**Baseline conhecido** (medido em `SE-COPILOT-001`, mesmo worktree/toolchain): `npm test` → 13
arquivos falhos, 33 testes falhos, 326 passaram; causas `jsxDEV is not a function` (testes React),
env Supabase ausente e testes `node:fs`/`node:path` no browser. `typecheck`, `lint` (85 warnings) e
`build` passavam. Os 3 arquivos de teste novos não foram rodados.

No lugar: verificação estática (releitura do diff, conferência de assinaturas consumidas e das
asserções contra o markup real) + **verificação independente por agente adversarial**, que
devolveu **PARTIAL** com a única lacuna sendo a impossibilidade ambiental de executar os comandos:
*"Everything I could verify statically checks out […] I found no functional defect"*. Ela recuperou
o card removido (`git show HEAD:`) e confirmou endpoint, strings de toast e chaves de cache do fluxo
individual **idênticos**; confirmou os 5 requisitos, o mapeamento fiel ao `crm_copilot_feed`, zero
referências pendentes ao card e zero regressão em `OpportunityCard`/`ControlRoom`; e auditou as
asserções dos 3 testes novos contra o markup e as funções reais, sem achar nenhuma impossível.
Detalhes em `verboo/implementacao.md` §5.

## Pendências

1. Rodar as validações reais num ambiente com `node_modules` (os 3 testes novos, em especial o de
   componente, provavelmente herdam o `jsxDEV`).
2. `jsxDEV is not a function` derruba todo teste React do repo — task de infra no Vitest.
3. O card removido tinha `Collapsible` com payload cru e `agent_role`; a fila não tem esse detalhe
   (candidato a `Collapsible` na linha, beneficia casa + pipeline).
4. RPC de lote só se o volume de pendências justificar (herdada da Onda 1).
5. O `WHERE` do painel diverge do `crm_copilot_feed` (sem `agent_role = 'copilot'`, sem `proposed`)
   — pré-existente, fora do escopo, mas é divergência real de produto entre as duas filas.
6. Cosméticos na fila compartilhada: spinner no botão Aprovar ao recusar; card-em-card no
   `variant="inline"`.

## Comandos para o humano

```bash
cd /srv/solo-dev/worktrees/saas-salesengine-v1.0/SE-COPILOT-002
NODE_ENV=development npm ci --include=dev
npm run typecheck && npm run lint && npm test && npm run build

git add src/lib/copilotApprovals.ts \
        src/lib/copilotActivity.ts \
        src/lib/__tests__/copilotApprovals.test.ts \
        src/lib/__tests__/copilotActivity.test.ts \
        src/hooks/useCopilotApprovals.ts \
        src/components/crm/copilot/CopilotApprovalsPanel.tsx \
        src/components/crm/copilot/CopilotApprovals.tsx \
        src/components/crm/copilot/__tests__/CopilotApprovalsPanel.test.tsx \
        src/components/crm/copilot/CopilotApprovalCard.tsx \
        src/components/crm/PipelineWorkspace.tsx \
        src/components/crm/copilot/PipelineAgentView.tsx \
        src/components/crm/copilot/CopilotSettingsSheet.tsx \
        docs/dev/projects/saas-salesengine-v1.0/SE-COPILOT-002

git commit -m "feat(copilot): aprovar e recusar em massa no painel do pipeline"
git push -u origin task/SE-COPILOT-002-pipeline-copilot-visualization
gh pr create --title "SE-COPILOT-002 — visualização e aprovação em massa no painel do pipeline" --body-file docs/dev/projects/saas-salesengine-v1.0/SE-COPILOT-002/README.md
```
