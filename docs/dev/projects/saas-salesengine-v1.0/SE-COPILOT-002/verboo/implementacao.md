# SE-COPILOT-002 — implementação (verboo)

Visualização das ações do Copilot no pipeline + aprovar/recusar **em massa** no painel do pipeline.

Esta é a **segunda onda** de `SE-COPILOT-001`, que fechou a fila da casa do Copilot
(`CopilotApprovals.tsx`, superfície A) e deixou explicitamente de fora, em §7 do
`SE-COPILOT-001/verboo/implementacao.md`:

> 1. `CopilotApprovalsPanel` (superfície B) segue sem em massa. […]
> 3. `CopilotApprovalsPanel` ainda retorna `null` no loading/vazio […]; se ele ganhar em massa,
>    vale revisitar os estados junto.

Os dois itens são exatamente o escopo desta task.

## 1. Leitura do repo — as duas filas

| # | Superfície | Componente | Fonte de dados | Forma da linha | Resolver |
|---|---|---|---|---|---|
| A | Casa do Copilot → sheet *Atividade* → "Para aprovar" | `CopilotApprovals.tsx` | RPC `crm_copilot_feed` → `pending[]` | `FeedItem` | RPC `crm_copilot_resolve` |
| B | Pipeline (banner / accordion do agente / sheet de config) | `CopilotApprovalsPanel.tsx` | `ai_decisions` via `useCopilotApprovals` | `AiDecision` | HTTP `POST /api/v1/approvals/{id}/resolve` |

As duas filas são o **mesmo problema de produto** com **formas de linha diferentes**. A `FeedItem`
já é exatamente o que a fila A sabe desenhar e o que `copilotFeed.ts` (`groupByWhy`, `whyCounts`,
`whyLabel`, `statusLabel`, `dealHref`, `bulkResolveText`) entende — e o `crm_copilot_feed` monta
essa forma a partir das **mesmas colunas** de `ai_decisions`:

```sql
-- supabase/migrations/20260914000500_sprint11_w6_copilot_read.sql (pending)
select d.id, d.status, d.created_at as at, d.output_action->>'label' as label,
       d.output_action->>'why' as why, d.input_summary as reason, d.confidence_score as confidence,
       d.opportunity_id, o.pipeline_id, l.name as contact
```

Ou seja: dá para o painel B alimentar a fila A **sem duplicar UI e sem tocar na RPC da Onda 1**.

## 2. Decisão de arquitetura: uma fila, dois alimentadores

Optei por **reusar `CopilotApprovals`** (a fila da Onda 1) como a UI do painel B, em vez de
reescrever seleção/filtro/barra de massa dentro de `CopilotApprovalsPanel`:

- **Sem duplicação.** Seleção com indeterminado, "selecionar todas as visíveis", chips de filtro
  com contador, agrupamento por motivo, barra de massa e estados são ~200 linhas de JSX e estado
  que já existem, testadas, em `CopilotApprovals.tsx`. Copiar isso para o painel criaria duas
  filas que divergem no primeiro ajuste.
- **Consistência.** O usuário vê a mesma fila, com as mesmas palavras, na casa do Copilot e no
  pipeline — que é o requisito 1 da spec ("legível sem abrir nada").
- **A fronteira certa.** `CopilotApprovals` é *props-driven*: não sabe de onde as linhas vieram.
  O painel B ganhou uma **única camada de tradução** `AiDecision → FeedItem`
  (`src/lib/copilotApprovals.ts`), que espelha coluna a coluna o `select` do `crm_copilot_feed`
  acima. Os helpers de `copilotFeed.ts` (que a spec pediu para reusar) vêm de graça.

O que **não** mudou: o resolver do painel B continua sendo `resolveApproval`
(`/api/v1/approvals/{id}/resolve`, python-agent). **Não** troquei pelo `crm_copilot_resolve` da
Onda 1 — são caminhos distintos (`ai_decisions` pendentes do pipeline vs. feed do time) e a spec
pediu explicitamente para não mexer nisso sem justificar. Não há justificativa: o em massa aqui é
N chamadas paralelas do **mesmo** endpoint que o card individual já usava.

## 3. O que foi implementado

### 3.1 `src/lib/copilotApprovals.ts` (novo — helpers puros, testáveis)

- `actionableDecisions(decisions)` — tira da fila as linhas *intent-only* do Intent Omission Guard
  (`intent_detected: true` sem `verb`/`action`): aprovar aquilo não aplicaria nada. Era um filtro
  inline no painel; agora é testável. O badge de intenção do `OpportunityCard` (T8) continua lendo
  essas linhas pela mesma query.
- `decisionToQueueItem(decision)` — a tradução. `label` = `formatCopilotActivity(output_action).title`
  (que agora prefere a frase gravada, ver §3.3), `why` = `output_action.why`,
  `reason` = `input_summary`, `contact` = `formatDisplayName(lead.name, lead.phone)`,
  `confidence`/`status`/`at` direto da linha. Sem `lead`, o contato fica `null` e a fila mostra
  "Negócio".
- `summarizeResolveOutcomes(outcomes)` — dobra `PromiseSettledResult[]` no `BulkResolveSummary` que
  o `bulkResolveText` (Onda 1) já sabe transformar em frase e tom. Reusa `summarizeBulk`? **Não**:
  aquele helper lê `{ok, reason}` de uma RPC; o `resolveApproval` **rejeita a promise** em não-2xx.
  Um `rejected` = um erro, e nunca derruba o resto do lote (`Promise.allSettled`). `stale` e
  `notPending` ficam zerados porque esse endpoint não tem esse vocabulário — está documentado no
  código para não parecer esquecimento.

### 3.2 `src/components/crm/copilot/CopilotApprovalsPanel.tsx`

- **Estados visíveis** (fim do `null` silencioso):
  - *loading* — linha com spinner + `aria-busy="true"` + `Skeleton`;
  - *erro* — texto em `text-destructive` + botão **Tentar de novo** (`refetch`);
  - *vazio* — "Nada esperando por você." numa faixa fina e neutra (`bg-muted/20`).
  A faixa âmbar fica reservada para quando **há** algo esperando — um banner de alerta permanente
  acima do Kanban seria ruído. Nos estados sem pendência a faixa é cinza e baixa.
- **Massa** — `handleResolveMany(ids, approve)` dispara `resolveApproval` **uma vez por id** com
  `Promise.allSettled`, agrega com `summarizeResolveOutcomes` e mostra **um** toast com o tom certo
  (`success`/`warning`/`error`), seguido do mesmo `refresh()` do individual.
- **Individual preservado** — `handleResolve(id, approve)` é literalmente o fluxo do card antigo:
  `setBusyId`, `resolveApproval`, invalidar `["copilot","approvals",pipelineId]` +
  `["opportunities", equipeId]`, `toast.success`/`toast.error`, `finally` limpa o busy. Nada de
  semântica nova.
- **`variant`** — `"banner"` (default; `PipelineWorkspace`, faixa full-width com `border-b`,
  `max-w-5xl`) e `"inline"` (accordion `PipelineAgentView` e `CopilotSettingsSheet`, onde o
  container já desenha o card). Sem o prop, os 3 pontos de montagem ficavam com a moldura errada.
- **Densidade/agrupamento/filtro** — vêm da fila A: chips por motivo com contador, grupos
  ordenados risco-primeiro com contador, `max-h-[420px]` com rolagem.

### 3.3 `src/lib/copilotActivity.ts`

`formatCopilotActivity` só entendia o payload *flat* do worker Python (`verb` + `args`). O que a
Onda 6 grava (`crm_copilot_apply`) é **aninhado**:

```json
{ "run_id": "…", "index": 0, "action": { "type": "move_stage", "stage_id": "…" },
  "label": "Ganho", "expected": { "stage_id": "…" }, "why": "risky", "model": "…" }
```

Sem tratamento, `verb` caía em `"manual"` e o `switch` no `default` — no `ControlRoom` (histórico do
Copilot) essas linhas apareciam como `manual | - | -`. Agora, quando `action` é um objeto com
`type`, a função devolve `verb = action.type`, `field` do mapa `NESTED_FIELD`
(`move_stage → "Etapa"`, `set_value → "Valor"`, …) e **usa o `label` do banco como `title`** — a
frase que o SQL já escreveu para uma pessoa ("Moveu para Ganho") é melhor do que qualquer coisa
derivada do verbo. Payloads legados não têm `label` nem `action` objeto: caem no caminho de sempre,
sem regressão.

### 3.4 `src/hooks/useCopilotApprovals.ts`

`select("*")` → `select("*, lead:leads(id, name, phone)")`, usando a FK
`ai_decisions.lead_id → leads.id` que já existe (mesmo formato de `useCopilotCredits`). É o que dá
o "em qual negócio" do requisito 1. `input_summary` e `lead` entraram no tipo `AiDecision`. O
`OpportunityCard`, que também consome o hook, não é afetado (só ganhou campos).

Também **saiu** do tipo o campo `reason: string | null`: ele nunca correspondeu a uma coluna de
`ai_decisions` (não há `ADD COLUMN reason` em nenhuma migration) e o único leitor era o "Motivo" do
card removido — que por isso nunca renderizava. O motivo real é o `input_summary`.

### 3.5 `CopilotApprovalCard.tsx` — **removido** (205 linhas)

O card era usado **exclusivamente** pelo painel (confirmado por grep: `CopilotApprovalCard` só
aparecia nele mesmo e no painel). Com o painel passando a renderizar a fila compartilhada, o card
viraria código morto — e pior: uma segunda implementação do mesmo "Aprovar/Recusar" que divergiria
da fila no primeiro ajuste.

O que ele mostrava e onde está agora:

| Card antigo | Onde está |
|---|---|
| Título "Mover este lead para X?" | `label` da linha da fila |
| Badge de confiança % | badge de confiança da fila |
| Badge "Aguardando aprovação" | `statusLabel` da fila (`aguardando`) |
| Campo / Resultado | `formatCopilotActivity` (agora correto para a Onda 6 — §3.3) |
| Agente (`agent_role`) | **não** exibido na fila (ver §7, pendência 3) |
| Motivo (`decision.reason`) | **coluna não existe** em `ai_decisions` — era sempre vazio; o motivo real é o `input_summary`, que a fila mostra |
| Detalhes técnicos (payload cru) | **não** exibido (ver §7, pendência 3) |

Divergências cosméticas conscientes (herdadas da fila da Onda 1, não introduzidas aqui): o spinner
do botão **Aprovar** acende também quando o clique foi em **Recusar** (o card antigo mostrava
"Rejeitando…" no botão certo) e, no `variant="inline"`, a fila traz seu próprio
`rounded-xl border bg-card` dentro do item de accordion que já é um card — card em card. Ambas
valem um ajuste futuro na fila compartilhada, que beneficiaria casa e pipeline de uma vez.

O **fluxo individual** que a spec pediu para preservar continua idêntico — mesmos botões por item,
mesmo `resolveApproval`, mesmo `busyId`, mesmo toast — só que agora na linha da fila.

## 4. Schema/migration

**Nenhuma migration.** Justificativa mínima: o único dado novo que o painel precisava (o nome do
negócio) já existe em `leads` e já é acessível pela FK `ai_decisions.lead_id`; o PostgREST resolve
com `lead:leads(...)`, que é o padrão já usado em `useCopilotCredits` e no próprio
`crm_copilot_feed`. O em massa reusa `resolveApproval`, que revalida cada decisão no servidor. Uma
RPC de lote só se o volume justificar (mesma pendência 2 da Onda 1).

## 5. Validações

⚠️ **Não executadas.** O sandbox desta task bloqueia `npm` (`This command requires approval`) e não
tem `node_modules`. Nada foi mascarado:

| Comando | Resultado |
|---|---|
| `NODE_ENV=development npm ci --include=dev` | ❌ não executado — bloqueado |
| `npm run typecheck` | ❌ não executado — bloqueado |
| `npm run lint` | ❌ não executado — bloqueado |
| `npm test` | ❌ não executado — bloqueado |
| `npm run build` | ❌ não executado — bloqueado |

**Baseline (medido no `SE-COPILOT-001`, mesmo worktree):** `npm test` → 13 arquivos falhos, 33
testes falhos, 326 passaram (`jsxDEV is not a function` nos testes React, env Supabase ausente,
testes `node:fs`/`node:path` no browser). `typecheck`, `lint` (85 warnings) e `build` passavam.
Os 3 arquivos de teste novos **não foram rodados** — o `CopilotApprovalsPanel.test.tsx` (React)
provavelmente herda o `jsxDEV`; os dois de `src/lib` são puros e devem passar.

No lugar da execução, fiz verificação estática: releitura do diff linha a linha; conferência das
assinaturas consumidas (`CopilotApprovalsProps`, `BulkResolveSummary`, `bulkResolveText`,
`resolveApproval`, `formatDisplayName`, `FeedItem`); e conferência das asserções de teste contra o
markup real (as asserções de texto são ancoradas no `textContent` da linha `<li>`, não em
`getByText` solto, porque rótulos como "pede aprovação" aparecem também no chip de filtro).

Uma verificação independente (agente `verification`, adversarial) revisou o diff inteiro —
inclusive recuperando o card removido com `git show HEAD:` para comparar o fluxo individual — e
devolveu **PARTIAL**, com a única lacuna sendo a impossibilidade ambiental de rodar os comandos:
"Everything I could verify statically checks out […] I found **no functional defect**". Ela
confirmou: os 5 requisitos implementados, o endpoint preservado, os toasts/chaves de cache do fluxo
individual idênticos ao card antigo, nenhuma referência pendente ao card removido, nenhuma
regressão nos dois outros consumidores (`OpportunityCard`, `ControlRoom`), o mapeamento fiel ao
`select` do `crm_copilot_feed`, e **todas as asserções dos 3 testes novos consistentes com o markup
e as funções reais**. As observações não bloqueantes que ela levantou foram incorporadas em §7.

## 6. Commit / PR

Ver `result.md` (cópia em `docs/dev/projects/saas-salesengine-v1.0/SE-COPILOT-002/result.md`).

## 7. Pendências

1. **Rodar as validações reais** (`npm ci`, `typecheck`, `lint`, `test`, `build`) num ambiente com
   `node_modules` — este sandbox não permite. Em especial os 3 testes novos.
2. **`jsxDEV is not a function`** continua derrubando todo teste React do repo; enquanto isso, os
   testes de componente (os novos e os da Onda 1) não provam nada em CI. Vale atacar a config do
   Vitest (`react/jsx-dev-runtime` não resolvido) numa task de infra.
3. **Detalhe técnico por item.** O card removido tinha um `Collapsible` com o payload cru e o
   `agent_role`. A fila não tem esse detalhe — se ele fizer falta para depurar uma sugestão
   estranha, o lugar natural é um `Collapsible` na própria linha da fila (beneficia A e B).
4. **RPC de lote** (`crm_copilot_resolve_many` ou equivalente no python-agent) se o volume de
   pendências fizer os N round-trips pesarem — herdada da Onda 1.
5. **O `WHERE` do painel diverge do `crm_copilot_feed`** (achado da verificação independente):
   a RPC filtra `agent_role = 'copilot'` e `status in ('pending_approval','proposed')`, enquanto
   `useCopilotApprovals` filtra só `status = 'pending_approval'` (e sem `agent_role`). Consequência:
   o painel pode mostrar pendências de outros papéis de agente e **nunca** mostra `proposed`.
   É **pré-existente** (o painel antigo usava o mesmo hook) e fora do escopo desta task, mas é uma
   divergência real de produto entre as duas filas — candidata a task própria.
6. **Spinner no botão errado / card-em-card no `variant="inline"`** — cosméticos, na fila
   compartilhada (ver §3.5).
