# SE-COPILOT-001 — Aprovar/recusar recomendações do Copilot em massa

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-COPILOT-001 |
| Branch | `task/SE-COPILOT-001-bulk-copilot-recommendations` |
| Agente | verboo (implementação) |
| Status | ✅ Implementado · ✅ `typecheck`/`lint`/`build` executados · ⚠️ `npm test` falha em baseline do Vitest — ver `verboo/implementacao.md` §5 |
| Artefatos | `verboo/implementacao.md` · este README · cópia do `result.md` |

## O que mudou

A fila **"Para aprovar"** da casa do Copilot (a linha de atividade no topo de `/home`, dentro
do sheet *Atividade do Copilot*) deixou de ser uma lista de um-por-vez:

- **Seleção múltipla** — checkbox por sugestão, "Selecionar" no cabeçalho (pega tudo o que
  está visível, respeitando o filtro ativo), com estado indeterminado.
- **Ação em massa** — *Aprovar selecionadas* e *Recusar selecionadas* numa barra que só
  aparece quando há seleção, com resumo único do que foi aplicado e do que escapou
  (`3 aplicadas; 1 desatualizada, 1 com erro.`).
- **Visualização** — cada sugestão mostra agora **estado** (`aguardando`), **contexto/motivo**
  (badge com o `why`: *pede aprovação*, *confiança baixa*, *campos pedem aprovação*…),
  **confiança** (%), **descrição** (`reason`) e o **negócio** com link direto.
- **Filtros e agrupamento** — chips de filtro por motivo com contador, e a lista agrupada por
  motivo, risco primeiro.
- **Estados** — skeleton de carregamento, erro com *Tentar de novo* e vazio ("Nada esperando
  por você."). O filtro ativo é derivado em render, então a fila nunca pisca vazia por um frame
  quando a última sugestão de um motivo é respondida.
- **Responsivo** — cabeçalho, chips e barra de ações com `flex-wrap`; sem card dentro de card
  (a lista usa divisórias, não cartões aninhados).

Os fluxos **individuais** de aprovar/recusar (na fila, no painel do negócio e na aprovação
ponta-a-ponta) continuam exatamente como estavam, com o mesmo `busyId` e o mesmo spinner.

## Validações

- `NODE_ENV=development npm ci --include=dev`: passou; `npm audit` reportou 24 vulnerabilidades baseline (1 baixa, 6 moderadas, 17 altas).
- `npm run typecheck`: passou.
- `npm run lint`: passou com 85 warnings baseline.
- Testes focados (`CopilotApprovals`, `copilotHome`, `CopilotHome`): falharam por `jsxDEV is not a function` nos testes React; helpers puros passaram.
- `npm test`: falhou em baseline do app: 13 arquivos falhos, 33 testes falhos, 326 passaram. Causas principais: `jsxDEV is not a function`, env Supabase ausente e testes `node:fs`/`node:path` em ambiente browser.
- `npm run build`: passou; warning de chunk >500 kB.

## Sem migration

Nenhuma alteração de schema. O em massa reusa `crm_copilot_resolve`, que já revalida cada
sugestão contra o negócio de agora e mexe só na própria linha; o cliente dispara uma chamada
por id e agrega as respostas numa frase só. Justificativa completa em `verboo/implementacao.md` §4.

## Onde está o código

| Arquivo | Papel |
|---|---|
| `src/components/crm/copilot/CopilotApprovals.tsx` | fila com seleção, filtros, agrupamento, barra de massa e estados |
| `src/hooks/useCopilotFeed.ts` | `resolveMany` (aprovar/recusar N) + `isLoading`/`isError`/`refetch` do feed |
| `src/lib/copilotFeed.ts` | `groupByWhy`, `whyCounts`, `bulkResolveText`, `statusLabel` para `pending_approval` |
| `src/components/crm/copilot/CopilotActivitySheet.tsx` | repassa as novas props |
| `src/components/crm/copilot/CopilotHome.tsx` | liga o `resolveMany` do feed à fila |
| `src/components/crm/copilot/__tests__/CopilotApprovals.test.tsx` | testes da fila (seleção, massa, filtro, estados) |
| `src/lib/__tests__/copilotHome.test.ts` | testes de `groupByWhy`/`whyCounts`/`bulkResolveText` |
| `src/components/crm/copilot/__tests__/CopilotHome.test.tsx` | mock do feed atualizado |
