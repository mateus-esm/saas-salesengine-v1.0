# SE-PIPELINE-001 — result

> Cópia fiel do `result.md` canônico. O caminho `/srv/solo-dev/tasks/running/SE-PIPELINE-001/`
> está **fora do escopo de leitura/escrita** deste sandbox (mesma restrição de
> `SE-COPILOT-001`/`SE-COPILOT-002`/`SE-LEAD-001`), então o conteúdo vive aqui e o orquestrador deve
> copiá-lo para o caminho canônico.

## Status

**Implementado no worktree** `/srv/solo-dev/worktrees/saas-salesengine-v1.0/SE-PIPELINE-001`,
branch `task/SE-PIPELINE-001-mobile-topbar-scroll`.

- Commit: ⏳ **não executado** — `git add`/`git commit`/`git push`/`gh pr create` bloqueados pelo
  sandbox ("This command requires approval"). Os arquivos estão no worktree; os comandos exatos
  estão em §"Comandos para o humano".
- PR: ⏳ não aberto (mesmo motivo).

## Entregáveis

| # | Pedido | Onde |
|---|---|---|
| 1 | Mobile: topbar rola horizontalmente, todos os controles alcançáveis, nada cortado | `src/components/crm/PipelineWorkspace.tsx:80` (`overflow-x-auto` + `overscroll-x-contain`) e `:81` / `:106` (`shrink-0`) |
| 2 | Desktop: layout atual preservado, sem scroll lateral desnecessário | sem excesso em ≥1024px → `overflow-x: auto` não rola; `justify-between` intacto no mesmo container (`:80`). ⚠️ Faixa de **tablet 640–900px passa a rolar** em vez de quebrar em duas linhas (labels voltam em `sm:` e a linha pede ≈840–900px) — troca pedida pela task, mas registrada como mudança de comportamento |
| 3 | Sem scroll horizontal na página inteira | rolagem contida na barra + `overscroll-x-contain`; ancestrais já são `overflow-hidden` (`src/pages/CRM.tsx:161`, `src/components/AuthenticatedLayout.tsx:21`) |
| 4 | Ícone-only no phone / label no desktop | preservado — `<span className="hidden sm:inline">` nos 3 `TabsTrigger` (`:88`, `:92`, `:96`), `aria-label` mantido |
| 5 | "Sincronizar Pipeline" só na view kanban | preservado — `{view === "kanban" && …}` (`:105`) |

Arquivos tocados:

- `src/components/crm/PipelineWorkspace.tsx` — **única mudança de código** (topbar: `flex-wrap` e
  `min-w-0` fora; `overflow-x-auto` + `overscroll-x-contain` + `[-webkit-overflow-scrolling:touch]` +
  `[scrollbar-width:none]` + `[&::-webkit-scrollbar]:hidden` na barra; `shrink-0` no grupo esquerdo e
  num wrapper em volta do `SyncButton`).
- `docs/dev/projects/saas-salesengine-v1.0/SE-PIPELINE-001/` — README, `verboo/implementacao.md`,
  `result.md`.

**Não tocado:** `PipelineSelector.tsx`, `SyncButton.tsx`, abas, hooks, lógica de
Kanban/Leads/Copilot, `main`, secrets, schema/migrations.

### A classe que faz a rolagem (e por que o desktop não é afetado)

- **`overflow-x-auto` na própria topbar** cria a rolagem: a barra continua do tamanho da tela, mas o
  conteúdo mais largo que ela vira `scrollWidth` rolável.
- **`shrink-0`** nos dois grupos é o que faz a rolagem *existir*: sem ele os itens flex encolhem por
  padrão (`flex-shrink: 1`) e o navegador espreme em vez de transbordar. Com o tamanho natural
  preservado, a linha fica mais larga que a tela.
- **`overscroll-x-contain`** impede o *scroll chaining* — o gesto não vaza para a página.
- **Desktop:** em ≥1024px não há excesso, e `overflow-x: auto` só rola **quando há** overflow. O
  `justify-between` permaneceu no mesmo elemento, então com folga ele segue empurrando o
  "Sincronizar Pipeline" para a direita. Nenhum `gap`/`padding` mudou.
- **Ressalva (tablet 640–900px):** como os labels das abas voltam em `sm:` (exigido) e a linha passa
  a pedir ≈840–900px, nessa faixa a barra **rola** em vez de quebrar em duas linhas. É a troca que a
  task pede, com a rolagem contida na barra — mas é mudança de comportamento, não "nada mudou".
- **`justify-between` é seguro no overflow:** com espaço livre negativo ele é idêntico a
  `flex-start` (CSS Flexbox §8.2), ou seja o controle mais à esquerda **não** é empurrado para fora
  da tela — diferente do clássico bug de `justify-content: center` com overflow.

Detalhamento completo em `verboo/implementacao.md` (§2 e §3).

## Migrations

**Nenhuma.** É um fix de layout, um bloco de JSX.

## Validações

⚠️ **Não executadas.** `npm` (e portanto `ci`, `typecheck`, `lint`, `test`, `build`) retorna
"This command requires approval" neste sandbox — testado agora (`npm --version`, `npm ci`,
`npm run typecheck`) — e não há `node_modules` no worktree (`ls node_modules` → erro).
`git add`/`commit`/`push` também são negados.

| Comando | Resultado |
|---|---|
| `NODE_ENV=development npm ci --include=dev` | ❌ não executado — bloqueado |
| `npm run typecheck` | ❌ não executado — bloqueado |
| `npm run lint` | ❌ não executado — bloqueado |
| `npm test` | ❌ não executado — bloqueado |
| `npm run build` | ❌ não executado — bloqueado |

**Baseline conhecido** (medido em `SE-COPILOT-001`, mesmo worktree/toolchain, **não** remedido aqui):
`npm test` → 13 arquivos falhos, 33 testes falhos, 326 passaram; causas `jsxDEV is not a function`
(testes React), env Supabase ausente e testes `node:fs`/`node:path` em ambiente browser.
`typecheck`, `lint` (85 warnings) e `build` passavam. **Esta task não cria nem altera nenhum teste**,
então o baseline de `npm test` deve permanecer idêntico.

No lugar da execução:

- Diff completo revisado (`git diff`): 1 arquivo, 1 bloco, nenhum import/prop/símbolo novo — só
  strings de `className` e um `<div>`.
- Cadeia de ancestrais conferida para o requisito "o body não pode rolar de lado"
  (`AuthenticatedLayout.tsx:21`, `CRM.tsx:161`, `PipelineWorkspace.tsx:71`).
- Consumidores conferidos por grep: `PipelineSelector` só é renderizado em
  `PipelineWorkspace.tsx:82`; `PipelineWorkspace` só em `CRM.tsx:198`; `SyncButton` tem 3 superfícies
  e nenhuma depende do formato da topbar.
- Nenhum teste do repo depende das classes removidas: grep por `className|classList|toHaveClass` nos
  `*.test.tsx`/`*.test.ts` retorna zero — a suíte não faz asserção de classe. Não existe teste de
  `PipelineWorkspace`.
- Verificação independente por agente adversarial — ver abaixo.

### Verificação independente

**Veredito: PARTIAL** — todos os checks estáticos passaram (escopo de 1 arquivo, JSX final,
consumidores, utilitárias do Tailwind, cadeia de ancestrais, `justify-between` com espaço negativo,
existência de excesso para rolar). **Não verificado:** renderização real (não há browser no sandbox)
e os comandos de validação (bloqueados). Nenhum baseline remedido ou inventado.

Dois achados, ambos incorporados aos docs:

1. **Faixa de tablet.** O texto inicial dizia "em ≥640px os controles cabem" — errado: com os labels
   ligados em `sm:`, a linha pede ≈840–900px. Corrigido; entre 640px e ~900px a barra rola em vez de
   quebrar em duas linhas.
2. **`SelectTrigger` herda `w-full`** (`select.tsx:20`) e o `PipelineSelector` mantém `flex-wrap`
   interno. Na análise de dimensionamento não quebra (grupo max-content → zero espaço livre); é
   pré-existente e não afeta a rolagem da barra. Registrado como pendência.

Evidências detalhadas em `README.md` §"Verificação independente".

## Pendências

1. **Tablet (640–900px) agora rola** em vez de quebrar em duas linhas — consequência de manter
   `hidden sm:inline` (exigido). Se incomodar: encurtar o `min-w-[220px]` do `SelectTrigger`
   (`PipelineSelector.tsx:34`) ou segurar os labels até `md:` (este contraria o requisito 4).
   Fora do escopo.
2. **Rodar as validações reais** num ambiente com `node_modules` (`npm ci`, `typecheck`, `lint`,
   `test`, `build`).
3. **Commit / push / PR** — bloqueados neste sandbox; comandos prontos em §"Comandos para o humano".
4. **Renderização real não observada** — não há browser no sandbox; o comportamento é analisado
   estaticamente. O roteiro manual no `README.md` cobre os 5 cenários.
5. **`SelectTrigger` herda `w-full`** (`select.tsx:20`) + `flex-wrap` interno no `PipelineSelector`:
   analisado como inofensivo (grupo max-content → zero espaço livre), pré-existente, não confirmável
   sem render.
6. **Sem teste automatizado deste comportamento.** jsdom não faz layout; qualquer teste aqui só
   afirmaria strings de `className` (baixo sinal, padrão que a suíte não usa). Verificação é manual —
   roteiro no `README.md`.
7. **`jsxDEV is not a function`** continua derrubando todo teste React do repo (herdado, não desta
   task) — candidato a task de infra no Vitest.
8. **Nome de pipeline muito longo** faz a barra rolar no desktop também (em vez de cortar). Coerente
   com "nada cortado", mas um `max-w-` + `truncate` no `SelectTrigger`
   (`PipelineSelector.tsx:34`) resolveria — fora do escopo.
9. **A topbar do CRM (`src/pages/CRM.tsx:115`, abas de topo) tem o mesmo `flex-wrap`** e tende a
   sofrer do mesmo problema em telas estreitas. Não foi tocada (escopo = topbar do pipeline), mas é a
   mesma correção de uma linha — candidata a task própria.

## Comandos para o humano

```bash
cd /srv/solo-dev/worktrees/saas-salesengine-v1.0/SE-PIPELINE-001
NODE_ENV=development npm ci --include=dev
npm run typecheck && npm run lint && npm test && npm run build

git add src/components/crm/PipelineWorkspace.tsx \
        docs/dev/projects/saas-salesengine-v1.0/SE-PIPELINE-001

git commit -m "fix(pipeline): topbar rola para o lado no mobile em vez de espremer"
git push -u origin task/SE-PIPELINE-001-mobile-topbar-scroll
gh pr create --title "SE-PIPELINE-001 — topbar do pipeline rola para o lado no mobile" \
  --body-file docs/dev/projects/saas-salesengine-v1.0/SE-PIPELINE-001/README.md
```
