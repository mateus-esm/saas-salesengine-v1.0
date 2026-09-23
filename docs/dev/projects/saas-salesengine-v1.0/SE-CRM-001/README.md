# SE-CRM-001 — Barra do TOPO do CRM rola para o lado no mobile

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-CRM-001 |
| Branch | `task/SE-CRM-001-crm-topbar-mobile-scroll` |
| Agente | verboo (implementação) |
| Status | ✅ Implementado · ⚠️ Validações **não executadas** (npm/git bloqueados no sandbox) — ver §Validações |
| Artefatos | `verboo/implementacao.md` · este README · `result.md` (cópia) |
| Migration | **nenhuma** |
| Arquivos de código tocados | **2** — `src/pages/CRM.tsx`, `src/components/crm/customtables/FeatureActivationGrid.tsx` |

## O problema

A barra do **topo do CRM** (`src/pages/CRM.tsx`, a que tem as nove abas Pipeline / Base de Contatos /
Empresas / Imóveis / Catálogo / Campanhas / Tarefas / Tabelas / Agenda, mais "Ativar tabelas" e o
toggle do Copilot) usava `flex flex-wrap items-center justify-between gap-3`.

Com `flex-wrap`, em tela estreita o navegador **quebra a linha em vez de transbordar**: as nove abas
caem numa linha, "Ativar tabelas" + Copilot na seguinte, e no caminho os itens **encolhem**
(`flex-shrink: 1` é o default) em vez de manter o tamanho natural. O shell da página é
`overflow-hidden` (`AuthenticatedLayout.tsx:21`, `CRM.tsx:170`), então não há para onde o excesso ir —
o que não cabe fica cortado.

> **Não confundir com a SE-PIPELINE-001.** Aquela task (merge `d56c724`) corrigiu a barra **de
> dentro** do pipeline (`PipelineWorkspace.tsx`). Esta é a barra **do topo do CRM**, outro
> componente. O `PipelineWorkspace.tsx` **não** foi tocado aqui.

## O que mudou

### 1. `src/pages/CRM.tsx` — a barra (linha 124)

| Antes | Depois |
|---|---|
| `flex **flex-wrap** items-center justify-between gap-3` | `flex items-center justify-between gap-3 **overflow-x-auto** overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden **[&>*]:shrink-0**` |

Só a `className` da barra mudou. As nove `TabsTrigger`, o `Tabs`, o `FeatureActivationGrid`, o
`AIAgentToggle`, o `justify-between`, os `gap-3` e a `Breadcrumb` acima (`hidden sm:block`) ficaram
**exatamente** onde estavam.

### 2. `src/components/crm/customtables/FeatureActivationGrid.tsx` — o painel virou `Popover`

Mudança **necessária** para não introduzir regressão com o item 1 (detalhe em §"A regressão
evitada"). O `<div className="absolute right-0 top-full …">` virou `<PopoverContent align="end">`,
que o Radix **porta para o `body`**. O conteúdo (heading, estados de loading/vazio, a lista de
tabelas com os `Switch`) é o mesmo; o carregamento do `sessionStorage` saiu do `onClick` do botão e
foi para o `onOpenChange` do Popover — mesmo momento (abrir o painel).

## Qual classe faz a rolagem lateral — e por que o desktop não é afetado

### A rolagem: `overflow-x-auto` na própria barra

`overflow-x: auto` transforma **a barra** em um *scroll container*: a barra continua do tamanho da
tela e o conteúdo mais largo que ela passa a ser rolável. É a única classe que cria a rolagem; as
outras só a tornam utilizável:

- **`[&>*]:shrink-0`** — é o que **faz a rolagem existir**. Sem ele os filhos diretos da barra
  encolhem (`flex-shrink: 1`) e o navegador espreme em vez de transbordar; com o tamanho natural
  preservado, a linha fica mais larga que a tela — condição para haver `scrollWidth`.
  A variante arbitrária `[&>*]:` (mesmo idioma já usado em `src/components/crm/filters/FilterSheet.tsx:25`)
  aplica o `shrink-0` a **cada grupo** sem precisar embrulhar cada um num `<div>` novo: o
  `Tabs`, o `FeatureActivationGrid` e o `AIAgentToggle` são os três filhos diretos da barra.
  Sem wrapper extra o DOM não muda e o `AIAgentToggle` continua podendo sumir sozinho quando
  `!equipe` (ele retorna `null`) sem deixar um `<div>` vazio ocupando `gap`.
- **`overscroll-x-contain`** — contém o gesto: ao chegar na ponta, o swipe **não** encadeia para a
  página (requisito "o body não pode rolar de lado").
- `[-webkit-overflow-scrolling:touch]`, `[scrollbar-width:none]` e `[&::-webkit-scrollbar]:hidden`
  seguem o padrão da casa para scrollers horizontais (`src/components/ui/tabs.tsx:38`,
  `src/components/crm/mobile/StagePicker.tsx:21`).

A barra é o **único** scroll container novo. Os ancestrais (`AuthenticatedLayout.tsx:21`,
`CRM.tsx:170`) já eram `overflow-hidden`, então a rolagem fica contida na barra e o `body` não anda.

### Por que o desktop não muda

`overflow-x: auto` **só rola quando há overflow**. As nove abas têm label sempre visível (sem
`hidden sm:inline`, conforme a task), então o conteúdo da barra mede ≈ 1280px:

| Grupo | Largura estimada |
|---|---|
| `TabsList` com as 9 abas (ícone + label, `px-3`, `gap-2`, `text-sm`) | ≈ 970px |
| "Ativar tabelas" (`Settings2` + label) | ≈ 120px |
| Toggle do Copilot (`Bot` + label + `Info` + `Switch`, `px-3`) | ≈ 160px |
| 2 × `gap-3` | 24px |

Em viewport **≥ ~1300px** isso cabe com folga: `flex-shrink` só age com espaço livre **negativo**,
então o `shrink-0` é inerte, e o `justify-between` (intacto) segue distribuindo os três grupos
exatamente como antes — abas à esquerda, "Ativar tabelas" logo depois, Copilot na ponta direita,
sem barra de rolagem. Nenhum espaçamento (`gap-3`, `px-2 sm:px-4 py-2`) mudou.

**Ressalva honesta:** a faixa de **~1024px a ~1300px** muda de comportamento. Antes a barra
**quebrava em duas linhas** (o que já era o defeito); agora ela **rola** na horizontal. É a troca
pedida pela task (`flex-wrap` é justamente o que sai), com a rolagem contida na barra — mas é
mudança de comportamento nessa faixa, e está registrada como pendência do `implementacao.md`.
Em ≥ ~1300px nada rola.

## A regressão evitada (por que o `FeatureActivationGrid` foi tocado)

`FeatureActivationGrid` desenhava o painel "Tabelas Personalizadas" com `position: absolute`
(`right-0 top-full mt-1`) dentro de um `<div className="relative">`. Com a barra virando
`overflow-x: auto`, esse painel passaria a ser **recortado**:

> Pela CSS Overflow Module Level 3, se um eixo é `auto`/`scroll` e o outro é `visible`, o `visible`
> **computa para `auto`**. Ou seja, `overflow-x-auto` na barra também clipa no eixo vertical — e o
> painel, que abre **abaixo** do botão (`top-full`), fica fora da caixa da barra e some.

Ou seja: o requisito "`FeatureActivationGrid` continua **funcional**" quebraria silenciosamente. O
`SyncButton` da SE-PIPELINE-001 não sofreu disso porque seus tooltips são Radix (portados para o
`body`); o painel deste componente era `absolute` inline, e é o **único** dropdown inline dentro da
barra (o `AIAgentToggle` usa Radix `Tooltip`, que porta; o `PipelineSelector` usa Radix `Select`, que
porta).

Trocar por `Popover` resolve na raiz: o conteúdo vai para um portal no `body`, escapa do recorte do
scroll container e ainda ganha posicionamento com detecção de colisão. `align="end"` reproduz o
antigo `right-0`; `w-72 p-3` reproduzem a caixa original (`w-72` já é o default do `PopoverContent`,
que também traz `z-50`, borda, sombra e animações).

## Requisitos × implementação

| # | Requisito | Onde |
|---|---|---|
| 1 | Mobile: barra rola horizontalmente, as 9 abas alcançáveis e nada cortado | `CRM.tsx:124` — `overflow-x-auto` + `[&>*]:shrink-0` + `overscroll-x-contain` |
| 2 | Desktop: layout atual preservado, sem scroll desnecessário, `justify-between` mantido | `justify-between` intacto (`CRM.tsx:124`); nenhum excesso em ≥ ~1300px — §"Por que o desktop não muda". Faixa 1024–1300px passa a rolar (ressalva documentada) |
| 3 | Sem scroll horizontal na página inteira | rolagem contida na barra + `overscroll-x-contain`; ancestrais já `overflow-hidden` (`AuthenticatedLayout.tsx:21`, `CRM.tsx:170`) |
| 4 | `FeatureActivationGrid` e `AIAgentToggle` visíveis e funcionais | ambos seguem filhos diretos da barra (`CRM.tsx:165-166`); painel do grid portado para o `body` (`FeatureActivationGrid.tsx:44`) |
| 5 | Trocar de aba continua funcionando | `Tabs value={tab} onValueChange={setTab}` intocado (`CRM.tsx:125`); nenhum handler, rota ou parâmetro de URL mudou |

**Não tocado:** `PipelineWorkspace.tsx`, `AIAgentToggle.tsx`, `ui/tabs.tsx`, `ui/popover.tsx`,
`ui/select.tsx`, a lógica das abas/views (`setTab`, `FILTER_PARAM_KEYS`, deep-links), schema,
migrations, `main`.

## Validações

⚠️ **Não executadas.** `npm` retorna *"This command requires approval"* neste sandbox (testado agora:
`npm --version`) e **não há `node_modules`** no worktree. `git add`/`commit`/`push`/`gh pr create`
também são negados. Mesmo bloqueio de `SE-PIPELINE-001`/`SE-COPILOT-001`/`SE-LEAD-001`.

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
permanecer idêntico — mas o baseline **não** foi remedido, e por isso não é afirmado aqui.

No lugar do runner: revisão do diff, conferência da cadeia de ancestrais, grep de consumidores
(`FeatureActivationGrid` só é usado em `CRM.tsx:165`; nenhum teste do repo importa `pages/CRM`,
`FeatureActivationGrid` ou `AIAgentToggle`) e verificação de que nenhum teste faz asserção de
`className` (`toHaveClass`/`classList`).

### Verificação independente (agente adversarial)

**Veredito: ✅ PASS** (agente `verification`, contexto limpo, sem acesso à minha justificativa além
do diff). Checks confirmados com evidência: escopo (exatamente 2 arquivos de código, `PipelineWorkspace.tsx`
intacto), a barra sem `flex-wrap` com `justify-between` preservado, as 9 abas com label sempre visível,
`Tabs value/onValueChange` intacto, `[&>*]:shrink-0` como sintaxe válida e já usada no repo
(`FilterSheet.tsx:25`), e a preservação do desktop.

**Não verificável neste ambiente** (limitação do sandbox, não do diff): `npm ci`, `typecheck`,
`lint`, `test`, `build` e a renderização real (sem `node_modules`, sem browser). jsdom não faz
layout, então nenhum teste do repo cobriria o comportamento de qualquer forma.

> ⚠️ **Atenção ao diff**: o ref **local** `main` deste worktree está defasado (`d148b4f`, merge do
> PR #9), então `git diff main` mostra ~410 arquivos de trabalho de sprints antigas. O diff **real**
> é contra `origin/main` (= `5233d03` = HEAD): **2 arquivos**. Use
> `git diff --stat origin/main`.

## Como validar na mão (o que a suíte não cobre)

jsdom não faz layout — nenhum teste automatizado prova este comportamento. Verificação manual:

1. `npm run dev` e abrir `/crm` no viewport de um celular (ex.: 360×640 no DevTools).
2. Esperado: a barra é **uma linha só**; dá para **arrastar para o lado** e alcançar as nove abas
   (inclusive **Agenda**) e o toggle do Copilot. Nada quebra para a segunda linha, nada fica cortado.
3. A **página** não deve rolar de lado (arrastar fora da barra não move nada).
4. Tocar em **"Ativar tabelas"**: o painel abre **inteiro, por baixo do botão** (não recortado),
   alinhado à direita, e os `Switch` respondem.
5. Trocar entre as abas (ex.: **Tarefas** → **Agenda**) e conferir que a view muda e a URL
   (`?tab=…`) acompanha.
6. Alargar para desktop (≥ ~1300px): a barra volta ao layout de sempre, com o Copilot na direita e
   **sem** barra de rolagem.

## Onde está o código

| Arquivo | Papel |
|---|---|
| `src/pages/CRM.tsx` | **mudança 1** — barra do topo: `flex-wrap` sai, entram `overflow-x-auto` + `overscroll-x-contain` + `[&>*]:shrink-0` |
| `src/components/crm/customtables/FeatureActivationGrid.tsx` | **mudança 2** — painel `absolute` → `PopoverContent` portado (evita o recorte do novo scroll container) |
| `src/components/crm/PipelineWorkspace.tsx` | **intacto** — é a barra de dentro do pipeline (SE-PIPELINE-001), não esta |
| `src/components/ui/tabs.tsx` | intacto — referência do scroller horizontal da casa |
| `src/components/ui/popover.tsx` | intacto — usado pelo `FeatureActivationGrid` |
| `src/components/crm/mobile/StagePicker.tsx` | intacto — referência do par `overflow-x-auto` + `shrink-0` |
| `src/components/AIAgentToggle.tsx` | intacto (usa Radix `Tooltip`, que porta para o `body`) |
