# SE-PIPELINE-001 — Topbar do pipeline rola para o lado no mobile

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-PIPELINE-001 |
| Branch | `task/SE-PIPELINE-001-mobile-topbar-scroll` |
| Agente | verboo (implementação) |
| Status | ✅ Implementado · ⚠️ Validações **não executadas** (npm/git bloqueados no sandbox) — ver §Validações |
| Artefatos | `verboo/implementacao.md` · este README · `result.md` (cópia) |
| Migration | **nenhuma** |

## O problema

Em telas estreitas, a topbar do workspace do pipeline (`PipelineWorkspace`) **quebrava em duas
linhas** em vez de rolar: `flex flex-wrap` + `justify-between` na barra e `flex-wrap` + `min-w-0` no
grupo da esquerda. Os controles ficavam espremidos e o que não cabia simplesmente desaparecia —
o shell da página é `overflow-hidden` (`AuthenticatedLayout.tsx:21`, `CRM.tsx:161`), então não havia
para onde ir. O "Sincronizar Pipeline" e o seletor de pipeline ficavam cortados/inalcançáveis.

## O que mudou

Um arquivo, um bloco de JSX: **`src/components/crm/PipelineWorkspace.tsx`** (a topbar, linhas 70-110).

| Antes | Depois |
|---|---|
| barra: `flex flex-wrap items-center justify-between gap-2 sm:gap-3` | barra: `flex items-center justify-between gap-2 sm:gap-3 **overflow-x-auto** overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden` |
| grupo esquerdo: `flex items-center gap-2 sm:gap-3 flex-wrap min-w-0` | grupo esquerdo: `flex items-center gap-2 sm:gap-3 **shrink-0**` |
| `{view === "kanban" && <SyncButton … />}` | `{view === "kanban" && <div className="**shrink-0**"><SyncButton … /></div>}` |

- **`overflow-x-auto`** na própria barra é a classe que **cria a rolagem lateral**: a barra continua
  do tamanho da tela e o conteúdo mais largo que ela passa a ser rolável.
- **`shrink-0`** nos dois grupos é o que **faz a rolagem existir**: sem ele os itens flex encolhem
  (default `flex-shrink: 1`) e o navegador espreme em vez de transbordar. Mantendo o tamanho natural,
  a linha fica mais larga que a tela — condição para haver `scrollWidth`.
- **`overscroll-x-contain`** contém o gesto: ao chegar na ponta, o swipe **não** encadeia para a
  página (requisito "o body não pode rolar de lado").
- `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` e `[-webkit-overflow-scrolling:touch]`
  seguem o padrão da casa para scrollers horizontais (`src/components/ui/tabs.tsx:38`,
  `src/components/crm/mobile/StagePicker.tsx:21`).

### Por que o desktop não muda

Não há **excesso** para rolar: em ≥ 1024px os controles cabem na linha, e `overflow-x: auto` só rola
quando há overflow. O `justify-between` ficou onde estava, então com folga disponível ele continua
empurrando o "Sincronizar Pipeline" para a direita, exatamente como antes. Nenhum espaçamento
(`gap-2 sm:gap-3`, `px-2 sm:px-4 py-2`) mudou. Detalhamento em `verboo/implementacao.md` §3.

**Ressalva honesta:** a faixa de **tablet (640–900px)** muda de comportamento. Como os labels das
abas voltam em `sm:` (640px, exigido pela task) e a linha passa a pedir ≈ 840–900px, nessa faixa a
barra **rola** em vez de quebrar em duas linhas — que é a troca pedida (`flex-wrap` é justamente o
que a task manda tirar), com a rolagem contida na barra. Em ≥ 1024px nada rola.

## Requisitos × implementação

| # | Requisito | Onde |
|---|---|---|
| 1 | Mobile: topbar rola horizontalmente, tudo alcançável e nada cortado | `PipelineWorkspace.tsx:80` (`overflow-x-auto` + `overscroll-x-contain`) e `:81`/`:106` (`shrink-0`) |
| 2 | Desktop: layout atual preservado, sem scroll desnecessário | nenhum excesso em ≥1024px; `justify-between` intacto (`:80`) — `verboo/implementacao.md` §3. Tablet 640–900px passa a rolar (ressalva documentada) |
| 3 | Sem scroll horizontal na página inteira | rolagem contida na barra + `overscroll-x-contain`; ancestrais já são `overflow-hidden` (`CRM.tsx:161`, `AuthenticatedLayout.tsx:21`) — §4 |
| 4 | Ícone-only no phone, label no desktop | preservado: `<span className="hidden sm:inline">` nos 3 `TabsTrigger` (`:88`, `:92`, `:96`), com `aria-label` mantido |
| 5 | "Sincronizar Pipeline" só na view kanban | preservado: `{view === "kanban" && …}` (`:105`) |

**Não tocado:** `PipelineSelector.tsx`, `SyncButton.tsx`, abas, hooks, Kanban/Leads/Copilot,
schema/migrations, `main`.

## Validações

⚠️ **Não executadas.** `npm` retorna *"This command requires approval"* neste sandbox (testado
agora: `npm --version`, `npm ci`, `npm run typecheck`) e **não há `node_modules`** no worktree.
`git add`/`commit`/`push`/`gh pr create` também são negados. Mesmo bloqueio de
`SE-COPILOT-001`/`SE-COPILOT-002`/`SE-LEAD-001`.

| Comando | Resultado |
|---|---|
| `NODE_ENV=development npm ci --include=dev` | ❌ não executado — bloqueado |
| `npm run typecheck` | ❌ não executado — bloqueado |
| `npm run lint` | ❌ não executado — bloqueado |
| `npm test` | ❌ não executado — bloqueado |
| `npm run build` | ❌ não executado — bloqueado |

**Baseline conhecido** (medido em `SE-COPILOT-001`, **não** remedido aqui): `npm test` → 13 arquivos
falhos, 33 testes falhos, 326 passaram (`jsxDEV is not a function` nos testes React, env Supabase
ausente, testes `node:fs`/`node:path` em ambiente browser). `typecheck`, `lint` (85 warnings) e
`build` passavam. **Esta task não cria nem altera teste**, então o baseline de `npm test` deve
permanecer idêntico.

No lugar: revisão do diff, conferência da cadeia de ancestrais, grep de consumidores
(`PipelineSelector` só é usado nesta topbar; `PipelineWorkspace` só em `CRM.tsx:198`) e verificação
de que nenhum teste do repo depende das classes removidas (a suíte não faz asserção de `className`).

### Verificação independente (agente adversarial)

**Veredito: PARTIAL** — todos os checks estáticos passaram; o que **não** pôde ser verificado é a
renderização real (não há browser no sandbox) e os comandos de validação (bloqueados). Os dois
achados foram corrigidos/acrescentados a estes docs.

| Check | Como | Resultado |
|---|---|---|
| Escopo: só um arquivo de código mudou | `git status --short --untracked-files=all` + `git diff --stat` | **PASS** — `M src/components/crm/PipelineWorkspace.tsx` (16+/4−); os demais são docs não rastreados. *(spot-check do orquestrador: saída idêntica)* |
| JSX final bate com o descrito e preserva os requisitos 4 e 5 | leitura do arquivo | **PASS** — `:80` barra com `overflow-x-auto`/`overscroll-x-contain`; `:81` grupo `shrink-0`; `:106` wrapper `shrink-0`; `:88`/`:92`/`:96` `hidden sm:inline`; `:105` `view === "kanban"`; `flex-wrap`/`min-w-0` sumiram |
| Nenhum consumidor depende das classes removidas / do formato do DOM | grep de `PipelineWorkspace`, `PipelineSelector`, `SyncButton`, e de `toHaveClass\|classList\|className` em `src/**/*.{test,spec}.{ts,tsx}` | **PASS** — `PipelineSelector` só em `PipelineWorkspace.tsx:82`; `PipelineWorkspace` só em `CRM.tsx:198`; **zero** asserção de classe nos testes; o wrapper não reestiliza o botão (as classes vêm do `Button` interno, `SyncButton.tsx:84-99`) nem afeta o tooltip (Radix porta para o `body`) |
| As utilitárias adicionadas existem neste Tailwind | `tailwind.config.ts` (3.4.17, só `tailwindcssAnimate`), `src/index.css` | **PASS** — o conjunto exato já é usado em `tabs.tsx:38` e `StagePicker.tsx:21`; nada de typo/no-op. (`scrollbar-hide` do `InboxSidebar.tsx:255` é classe morta — pré-existente, não é deste diff) |
| Ancestrais não propagam scroll para o `body` (req. 3) | leitura de `AuthenticatedLayout.tsx:21`, `CRM.tsx:161`, `PipelineWorkspace.tsx:71` | **PASS** |
| `justify-between` com espaço livre negativo não empurra o controle esquerdo para fora da tela | consulta à regra do Flexbox | **PASS** — com free space negativo é idêntico a `flex-start`; a origem do scroll fica em main-start |
| O fix realmente cria excesso (senão não rolaria) | estimativa estática de largura | **PASS** — conteúdo ≈ 670px no mobile (grupo ≈ 494px + `SyncButton` ≈ 164px) contra viewport de 360–390px |

**Não verificado (e por quê):**

- `npm ci` / `typecheck` / `lint` / `test` / `build` — negados pelo sandbox; `node_modules` ausente.
  Nenhum baseline foi remedido nem inventado.
- **Renderização real** — não há browser instalado no sandbox. Logo, o swipe no celular, o layout de
  uma linha no desktop e a dúvida do `PipelineSelector` (abaixo) são **analisados, não observados**.

**Achados incorporados a estes docs:**

1. **Faixa de tablet.** O texto original dizia "em ≥ 640px os controles cabem". Errado: com os labels
   ligados em `sm:`, a linha pede ≈ 840–900px. Corrigido em §"Por que o desktop não muda" e
   registrado como pendência 1 do `implementacao.md` — entre 640px e ~900px a barra rola em vez de
   quebrar em duas linhas (que é a troca pedida pela task, mas é mudança de comportamento).
2. **`SelectTrigger` herda `w-full`** (`src/components/ui/select.tsx:20`) e o `PipelineSelector`
   mantém `flex-wrap` interno. Em teoria o seletor poderia quebrar internamente; na análise de
   dimensionamento **não** (o grupo é max-content → zero espaço livre → o `flex-wrap` não tem o que
   quebrar). É pré-existente e não afeta a rolagem da barra. Registrado como pendência 3 do
   `implementacao.md`.

## Como validar na mão (o que a suíte não cobre)

jsdom não faz layout — nenhum teste automatizado prova este comportamento. Verificação manual:

1. `npm run dev` e abrir `/crm` no viewport de um celular (ex.: 360×640 no DevTools).
2. Esperado: a topbar é **uma linha só**; dá para **arrastar para o lado** e alcançar o
   **Sincronizar Pipeline** inteiro. Nada quebra para a segunda linha, nada fica cortado.
3. A **página** não deve rolar de lado (arrastar fora da topbar não move nada).
4. Alargar para desktop (≥ 1024px): a topbar volta ao layout de sempre, com "Sincronizar Pipeline"
   na direita e **sem** barra de rolagem.
5. Trocar para as abas **Leads** e **Copilot**: o "Sincronizar Pipeline" desaparece (só existe no
   Kanban).

## Onde está o código

| Arquivo | Papel |
|---|---|
| `src/components/crm/PipelineWorkspace.tsx` | **única mudança** — topbar: `overflow-x-auto` + `overscroll-x-contain`, `flex-wrap`/`min-w-0` fora, `shrink-0` nos dois grupos |
| `src/components/crm/PipelineSelector.tsx` | intacto (o `flex-wrap` interno não dispara mais com o grupo `shrink-0`) |
| `src/components/crm/copilot/SyncButton.tsx` | intacto (o wrapper `shrink-0` fica no consumidor, não no componente compartilhado) |
| `src/components/ui/tabs.tsx` | referência do padrão de scroller horizontal da casa (não alterado) |
| `src/components/crm/mobile/StagePicker.tsx` | referência do par `overflow-x-auto` + `shrink-0` (não alterado) |
