# SE-COPILOT-001 — implementação (verboo)

Aprovar/recusar recomendações do Copilot **em massa** e melhorar a visualização delas.

## 1. Leitura do repo — onde vivem as "recomendações do Copilot"

Antes de editar, mapeei as três superfícies que mostram sugestões pendentes do Copilot:

| # | Superfície | Componente | Fonte de dados | Resolver |
|---|---|---|---|---|
| A | Casa do Copilot — linha de atividade no topo de `/home` → sheet *Atividade do Copilot* → **"Para aprovar"** | `CopilotApprovals.tsx` | `crm_copilot_feed` → `pending[]` (`FeedItem`) | RPC `crm_copilot_resolve` |
| B | Pipeline → banner **"ações aguardando aprovação"**; também no sheet de configurações (aba *Aprovações*) e em `PipelineAgentView` | `CopilotApprovalsPanel.tsx` + `CopilotApprovalCard.tsx` | `ai_decisions` via `useCopilotApprovals` | HTTP `POST /api/v1/approvals/:id/resolve` (python-agent) |
| C | Modal do negócio → painel do Copilot → "Esperando você" | `DealCopilotPanel.tsx` | `useCopilotDeal` | `crm_copilot_resolve` (via `useCopilotDecisionActions`) |

## 2. Escolha de escopo

Implementei o em massa em **A** (a fila "Para aprovar" da casa do Copilot), porque:

- é a **porta de entrada do app** (T68: a home do Copilot abre o `/home`) e a fila canônica do
  que espera uma pessoa — o mesmo dado que o painel do negócio (C) consome;
- é **autocontida** num sheet: filtros, contadores, agrupamento e estados vazios cabem ali sem
  mexer no Kanban (o requisito explícito é "escopo enxuto");
- usa a RPC `crm_copilot_resolve`, que **já existe** e já revalida cada decisão contra o negócio
  de agora — logo **sem migration** (ver §4);
- B ficou **intocada** de propósito: ela é montada dentro de três layouts diferentes (Kanban,
  accordion de configurações, accordion do agente), e o resolver dela é um backend HTTP externo
  (FastAPI). Uma barra de seleção ali mudaria a UX do workspace e um "N em massa" viraria N
  chamadas a um serviço que este sandbox não consegue exercitar. Fica registrado como pendência
  consciente (§7).

Os **fluxos individuais** existentes foram preservados em todas as superfícies — em A, o botão
por item continua com o mesmo `busyId` e o mesmo spinner; só ganhou checkbox ao lado.

## 3. O que foi implementado

### 3.1 `src/lib/copilotFeed.ts` (helpers puros, testáveis)

- `groupByWhy(items)` — agrupa as pendências pelo **motivo** de esperarem (`why`), com ordem
  estável *risco primeiro* (`risky` → `low_confidence` → `fields_need_approval` →
  `stages_need_approval` → `suggest_mode` → `observe` → `no_credits`) e motivos desconhecidos
  no fim. Item sem motivo cai no grupo "outras" em vez de sumir.
- `whyCounts(items)` — o que cada chip de filtro mostra.
- `summarizeBulk(answers)` — dobra as respostas de uma rodada de lote num
  `BulkResolveSummary`, contando `ok` / `stale` / `not_pending` / erro. Um `null` (a RPC
  levantou exceção porque a decisão ou o negócio sumiu) conta como erro e **não derruba o resto
  do lote** — é a lógica que o `Promise.allSettled` do hook alimenta.
- `bulkResolveText(approve, summary)` — transforma o resultado agregado numa frase e num tom
  (`success` / `warning` / `error`): `3 aplicadas.` · `2 aplicadas; 1 desatualizada, 1 com erro.`
  · `Nenhuma: 1 desatualizada.`
- `statusLabel` ganhou `pending_approval: "aguardando"` e `proposed: "proposta"` (o `STATUS` só
  cobria os estados de "o que fiz"; sem isso a fila mostraria o enum cru).
- `interface BulkResolveSummary { total, ok, stale, notPending, failed }`.

### 3.2 `src/hooks/useCopilotFeed.ts`

- Novo `resolveMany` em `useCopilotDecisionActions`: dispara `crm_copilot_resolve` **uma vez por
  id** com `Promise.allSettled` e entrega as respostas ao `summarizeBulk` (helper puro, testado).
  Um toast só, com o tom certo, e o mesmo `refresh()` (invalida feed, deal, approvals,
  opportunities, board) que o individual já usava.
- `useCopilotFeed` passou a devolver também `isLoading`, `isError` e `refetch`, para a fila poder
  mostrar skeleton, erro com retry e vazio de verdade.

Por que `allSettled` e não um `Promise.all`: uma sugestão que ficou *stale* (alguém mexeu no
negócio nesse meio-tempo) **não pode** derrubar as outras do lote. O `allSettled` deixa cada
uma responder por si e o resumo conta o que passou e o que não passou.

### 3.3 `src/components/crm/copilot/CopilotApprovals.tsx`

Reescrita da fila:

- **Seleção**: `Set<string>` de ids; checkbox por sugestão; "Selecionar"/"Limpar" no cabeçalho
  com estado **indeterminado** (Radix `checked="indeterminate"`); a seleção é podada quando os
  itens saem da lista (depois de resolver) — nada de contador fantasma. O "Selecionar" do
  cabeçalho é um `<label htmlFor>` apontando para o checkbox, não um `<label>` que envolve um
  `<button>` (isso dispararia o toggle duas vezes).
- **Massa**: barra inferior que só aparece com seleção, mostrando
  `N selecionada(s)` + *Aprovar selecionadas* + *Recusar selecionadas* + *Limpar*. A seleção é
  limpa no clique (otimista) e o `refresh()` do hook reconstrói a lista.
- **Filtros/contadores**: chips "Todas (n)" + um por motivo com contagem; o "Selecionar" do
  cabeçalho opera sobre o que está **visível** (respeita o filtro). O filtro ativo é **derivado
  em render** (`filter` só vale se o motivo ainda existir na lista), não resetado por `useEffect`
  — assim a fila nunca pisca vazia por um frame quando a última sugestão daquele motivo é
  respondida, e não sobra um estado vazio inalcançável. Efeito colateral **intencional**: a
  escolha do usuário é preservada, então se uma sugestão com aquele mesmo motivo chegar depois
  (refetch de 30s), o filtro volta a valer — o chip aparece ativo, com a contagem, então não é
  uma surpresa invisível.
- **Agrupamento**: seções por motivo, com header sticky e contagem.
- **Visualização por item**: ação (`label`), badges de confiança (%) e motivo (`whyLabel`),
  negócio com link (`dealHref`), **estado** (`statusLabel`), data curta e a **descrição**
  (`reason`) em itálico.
- **Estados**: skeleton (`aria-busy`) no carregamento; erro com *Tentar de novo*; "Nada esperando
  por você." na fila vazia.
- **Responsivo / sem card-em-card**: `flex-wrap` no cabeçalho, chips e barra; a lista usa
  `divide-y` dentro do `section` — nada de `<Card>` aninhado.

### 3.4 Fiação

- `CopilotActivitySheet.tsx`: novas props `onResolveMany`, `isResolvingMany`, `isLoading`,
  `isError`, `onRetry`.
- `CopilotHome.tsx`: puxa `resolveMany`, `isLoading`, `isError`, `refetch` do `useCopilotFeed` e
  passa adiante (`isResolvingMany={resolveMany.isPending}`).

### 3.5 Testes

- `src/components/crm/copilot/__tests__/CopilotApprovals.test.tsx` (novo): aprovar 2 em massa,
  recusar 1 sem tocar na outra, selecionar todas, chip filtrando, botão individual intacto,
  vazio, carregando, erro+retry.
- `src/lib/__tests__/copilotHome.test.ts`: `groupByWhy` (ordem e grupo "outras"), `whyCounts`,
  `summarizeBulk` (incluindo uma chamada que levantou exceção no meio do lote), `bulkResolveText`
  (limpo / misto / nada), `statusLabel("pending_approval")`.
- `src/components/crm/copilot/__tests__/CopilotHome.test.tsx`: mock do `useCopilotFeed` atualizado
  com `resolveMany`, `isLoading`, `isError`, `refetch`.

## 4. Schema/migration

**Nenhuma migration.** Justificativa: `crm_copilot_resolve(p_decision_id uuid, p_approve boolean)`
já é atômica por decisão — ela faz `select … for update` na decisão, revalida o negócio de agora,
aplica e marca `resolved_by`/`resolved_at`. Uma função `crm_copilot_resolve_many(uuid[], boolean)`
economizaria round-trips, mas não muda a semântica nem a correção, e criar função nova é migration
nova (revisão, ledger, risco de numeração — o histórico do repo já teve colisão de número de
migration, ver `SE-FIX-002`). O ganho não paga o custo; ficou de fora de propósito. Se o volume de
pendências crescer a ponto de o N round-trips pesar, aí sim vale uma RPC de lote — anotado em §7.

## 5. Validações — executadas pelo orquestrador OpenClaw

O Verboo não conseguiu validar dentro do sandbox dele, mas o orquestrador executou as validações reais
no mesmo worktree:

| Comando | Resultado |
|---|---|
| `NODE_ENV=development npm ci --include=dev` | ✅ passou; `npm audit` reportou 24 vulnerabilidades baseline (1 baixa, 6 moderadas, 17 altas) |
| `npm run typecheck` | ✅ passou |
| `npm run lint` | ✅ passou com 85 warnings baseline (unused eslint-disable, exhaustive-deps, react-refresh) |
| Testes focados (`CopilotApprovals`, `copilotHome`, `CopilotHome`) | ⚠️ falharam por `jsxDEV is not a function` nos testes React; helpers puros passaram |
| `npm test` | ⚠️ baseline quebrado: 13 arquivos falhos, 33 testes falhos, 326 passaram. Causas principais: `jsxDEV is not a function`, env Supabase ausente e testes `node:fs`/`node:path` no ambiente browser |
| `npm run build` | ✅ passou; warning de chunk >500 kB |

## 6. Commit / PR

Executado pelo orquestrador OpenClaw após validação. Ver `result.md` para commit final e PR.

## 7. Pendências

1. **`CopilotApprovalsPanel` (superfície B) segue sem em massa.** É a candidata natural para uma
   segunda onda: seleção + barra de lote ali também, mas o resolver é HTTP no python-agent e o
   painel vive em três layouts — merece decisão de produto sobre onde a barra entra.
2. **RPC de lote** (`crm_copilot_resolve_many`) só se o volume justificar — hoje o em massa é N
   chamadas paralelas agregadas no cliente.
3. **`CopilotApprovalsPanel` ainda retorna `null` no loading/vazio** por decisão antiga de não
   perturbar o Kanban; se ele ganhar em massa, vale revisitar os estados junto.
