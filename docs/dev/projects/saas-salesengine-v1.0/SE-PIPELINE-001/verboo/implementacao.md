# SE-PIPELINE-001 — implementação (verboo)

Topbar do pipeline: no celular ela **rola para o lado** em vez de espremer/cortar os controles.

É um fix de layout de **um arquivo e um bloco de JSX**. Nada de lógica de Kanban/Leads/Copilot,
nada de schema, nada de componente novo.

## 1. Leitura do repo — o que exatamente quebrava

| # | Peça | Arquivo | Papel |
|---|---|---|---|
| 1 | Topbar (o bug) | `src/components/crm/PipelineWorkspace.tsx:80` | `flex flex-wrap items-center justify-between` |
| 2 | Grupo esquerdo | `src/components/crm/PipelineWorkspace.tsx:81` | `flex items-center gap-2 sm:gap-3 flex-wrap min-w-0` |
| 3 | Seletor de pipeline | `src/components/crm/PipelineSelector.tsx:24` | `flex items-center gap-2 flex-wrap` + `SelectTrigger` com `min-w-[220px]` + botão "Configurar" |
| 4 | Abas Kanban/Leads/Copilot | `src/components/crm/PipelineWorkspace.tsx:84-98` | labels com `hidden sm:inline` (ícone-only no phone) |
| 5 | Sincronizar Pipeline | `src/components/crm/copilot/SyncButton.tsx` (`variant="header"`) | último filho, só na view `kanban` |
| 6 | Abas (scroller) | `src/components/ui/tabs.tsx:38` | `TabsList` já é um scroller horizontal (`max-w-full overflow-x-auto …`) |

A causa é a combinação em **#1/#2**: `flex-wrap` manda o conteúdo que não cabe para uma **segunda
linha**, e `min-w-0` (#2) permite que o grupo encolha abaixo do próprio conteúdo. O resultado em tela
estreita é o que a task descreve: controles quebrados em duas linhas, apertados e cortados — e como
o shell da página é `overflow-hidden` (`src/components/AuthenticatedLayout.tsx:21`,
`src/pages/CRM.tsx:161`), o que sobra não tem para onde ir: fica inalcançável.

Precedente na casa para exatamente este problema: `src/components/ui/tabs.tsx` (a barra de abas do
Admin, com comentário em português explicando a mesma decisão) e
`src/components/crm/mobile/StagePicker.tsx:21` (flex + `overflow-x-auto`, filhos `shrink-0`).
A correção segue o padrão que já existe, não inventa um novo.

## 2. O que foi mudado

`src/components/crm/PipelineWorkspace.tsx` — só a topbar:

```diff
-<div className="border-b border-border bg-card px-2 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
-  <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
+<div className="border-b border-border bg-card px-2 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-3 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
+  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
     <PipelineSelector />
     <Tabs value={view} onValueChange={setView}> … </Tabs>
   </div>
   {view === "kanban" && (
-    <SyncButton mode="sweep" variant="header" pipelineId={pipelineId} />
+    <div className="shrink-0">
+      <SyncButton mode="sweep" variant="header" pipelineId={pipelineId} />
+    </div>
   )}
 </div>
```

Três mudanças, cada uma com um motivo:

1. **`flex-wrap` → fora; `overflow-x-auto` entra** (na própria barra, não num wrapper). É a classe que
   faz a rolagem lateral: a barra continua com a largura da tela, mas seu **conteúdo** pode ser mais
   largo que ela e é isso que o navegador deixa rolar. Colocada na barra (e não num `<div>` interno)
   para o `border-b`/`bg-card` ficarem parados enquanto o conteúdo desliza por baixo.
2. **`shrink-0` no grupo esquerdo e no bloco do `SyncButton`** (com `min-w-0` saindo do grupo). Sem
   isto o `overflow-x-auto` não faria nada: itens flex encolhem por padrão (`flex-shrink: 1`) e o
   navegador preferiria **espremer** os controles até o `min-content` em vez de deixá-los transbordar.
   `shrink-0` mantém cada grupo no seu **tamanho natural** (max-content) — é o que transforma
   "espremido" em "mais largo que a tela", que é a condição para haver rolagem. É o mesmo par
   `overflow-x-auto` + `shrink-0` do `StagePicker.tsx:21`.
   O wrapper novo em volta do `SyncButton` existe porque o `className` do `SyncButton` vai para o
   `<Button>` interno, não para o `<div>` que é o item flex — e não quis mexer num componente
   compartilhado por 3 superfícies (card / chat / header) só para isto.
3. **`overscroll-x-contain`** — corta o *scroll chaining*: ao chegar na ponta da barra, o gesto não
   "vaza" para a página. É a garantia de que a rolagem lateral fica **contida na topbar**.
   `[-webkit-overflow-scrolling:touch]` e `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` vêm
   junto por consistência com `tabs.tsx`/`StagePicker` (momento no iOS e barra de rolagem escondida —
   num toque ela é ruído, o gesto continua lá).

### Por que a rolagem é lateral e não uma segunda linha

`overflow-x-auto` num flex container **com `flex-wrap: nowrap`** (o default, agora que o
`flex-wrap` saiu) dá ao conteúdo um eixo único. Os filhos `shrink-0` conservam o tamanho natural, a
soma ultrapassa a largura da barra, e o excedente passa a ser `scrollWidth` — rolável. Se algum
filho ainda pudesse encolher, não haveria excedente e nada rolaria; por isso o `shrink-0` é parte da
correção, não um detalhe.

## 3. Por que o desktop não é afetado

Quatro razões, todas verificáveis no CSS:

1. **Não há excesso para rolar.** Em ≥ 1024px (`lg`) o `PipelineSelector` + as 3 abas rotuladas + o
   `Sincronizar Pipeline` cabem na linha. `overflow-x: auto` só desenha/permite rolagem **quando há
   overflow** — sem excesso, o comportamento é idêntico ao de `visible`.
   **Ressalva medida (não é "nada mudou" em toda a faixa):** com os labels ligados (`sm:` = 640px) a
   linha pede ≈ 840–900px (seletor ≈ 378px com o `min-w-[220px]` + "Configurar", abas rotuladas
   ≈ 311px, `Sincronizar Pipeline` ≈ 169px, gaps e padding). Logo, **entre 640px e ~900px (tablet) a
   barra passa a rolar** em vez de quebrar em duas linhas. É exatamente a troca que a task pede — o
   `flex-wrap` é o que ela manda tirar — e a rolagem continua contida na barra, mas é uma mudança de
   comportamento nessa faixa. Ver §7, pendência 1.
2. **O `justify-between` continua fazendo o mesmo trabalho.** Ele ficou onde estava, no container.
   Com folga disponível (desktop) ele empurra o último filho — o bloco do `SyncButton` — para a
   direita, exatamente como antes.
3. **Nada foi acrescentado entre a barra e os controles.** O grupo esquerdo e o `SyncButton`
   continuam sendo os mesmos dois filhos diretos; o `shrink-0` não muda tamanho quando não há
   pressão de encolhimento, e o `gap-2 sm:gap-3` e o `px-2 sm:px-4 py-2` seguem intactos.
4. **A barra de rolagem não aparece** nem no caso extremo: `[scrollbar-width:none]` e
   `[&::-webkit-scrollbar]:hidden` a escondem — que é o padrão da casa para este tipo de scroller
   (`tabs.tsx:38`).

No desktop propriamente dito (≥ 1024px) não há excesso e nada rola. Fora dele, a barra rola em dois
casos, os dois desejados: **tablet** (640–900px, onde os labels já aparecem mas a linha não cabe —
ver §7 pendência 1) e **nome de pipeline longo** o bastante para estourar a largura, onde rolar é
melhor que cortar (ver §7 pendência 2).

## 4. Por que a página inteira não rola de lado

A rolagem é criada **dentro** da topbar e não vaza para fora dela:

- A topbar é um item flex de uma coluna (`<div className="flex flex-col h-full">`,
  `PipelineWorkspace.tsx:71`) e, no eixo transversal, é esticada à largura do pai — ela **não cresce**
  por causa do conteúdo; o conteúdo é que transborda, e o transbordo é capturado pelo próprio
  `overflow-x-auto`.
- Acima dela, `src/pages/CRM.tsx:161` (`flex-1 overflow-hidden`) e
  `src/components/AuthenticatedLayout.tsx:21` (`main` com `overflow-hidden`) já recortam qualquer
  transbordo horizontal. Ou seja: mesmo que algo escapasse, o `body` não teria como rolar.
- `overscroll-x-contain` fecha a última porta (o gesto de swipe não encadeia para o ancestral).

## 5. O que **não** foi tocado

- `PipelineSelector.tsx` — intacto. O `flex-wrap` interno dele **não** dispara mais, porque o grupo
  agora é `shrink-0` e portanto é dimensionado pelo max-content (o `flex-wrap` só quebra quando há
  restrição de largura). Mexer ali seria refatorar componente sem necessidade, e o `right` slot
  segue disponível para quem quiser usar.
- `SyncButton.tsx` — intacto (nenhum `shrink-0` no componente compartilhado; o wrapper fica no
  consumidor).
- Abas: `hidden sm:inline` preservado nos 3 labels (ícone-only no phone), e `aria-label`
  (`Kanban`/`Leads`/`Copilot`) segue no `TabsTrigger`, então o modo ícone continua acessível.
- `{view === "kanban" && …}` preservado — "Sincronizar Pipeline" continua aparecendo **só** no Kanban.
- Nenhuma mudança em `useCopilotRealtime`, `OpportunityKanban`, `OpportunityTable`,
  `PipelineAgentView`, `CopilotApprovalsPanel` ou qualquer hook. Nenhuma migration.

## 6. Validações

⚠️ **Não executadas.** Neste sandbox `npm` retorna *"This command requires approval"* (testado
agora: `npm --version`, `npm ci`, `npm run typecheck` — todos negados) e **não existe `node_modules`
no worktree** (`ls node_modules` → erro). `git add`/`commit`/`push` também são negados. É o mesmo
bloqueio já registrado em `SE-COPILOT-001`/`SE-COPILOT-002`/`SE-LEAD-001`. Nada foi mascarado nem
presumido:

| Comando | Resultado |
|---|---|
| `NODE_ENV=development npm ci --include=dev` | ❌ não executado — bloqueado |
| `npm run typecheck` | ❌ não executado — bloqueado |
| `npm run lint` | ❌ não executado — bloqueado |
| `npm test` | ❌ não executado — bloqueado |
| `npm run build` | ❌ não executado — bloqueado |

**Baseline conhecido** (medido em `SE-COPILOT-001`, mesmo worktree/toolchain, **não** remedido
aqui): `npm test` → 13 arquivos falhos, 33 testes falhos, 326 passaram; causas principais
`jsxDEV is not a function` nos testes React, env Supabase ausente e testes `node:fs`/`node:path` em
ambiente browser. `typecheck`, `lint` (85 warnings) e `build` passavam. **Este fix não adiciona nem
altera teste algum**, então o baseline de `npm test` deve permanecer idêntico — se a contagem mudar,
não é por causa desta task.

O que foi feito no lugar da execução:

- **Diff completo revisado** (`git diff`) — 1 arquivo, 1 bloco, nenhum símbolo novo, nenhum import
  novo, nenhuma prop nova. O arquivo continua TypeScript válido por inspeção: só strings de
  `className` e um `<div>` mudaram.
- **Cadeia de ancestrais conferida** para o requisito "o body não pode rolar de lado"
  (`AuthenticatedLayout.tsx:21`, `CRM.tsx:161`, `PipelineWorkspace.tsx:71`).
- **Consumidores conferidos por grep**: `PipelineSelector` só é usado aqui (nenhum outro arquivo o
  referencia); `PipelineWorkspace` só em `CRM.tsx:198`; `SyncButton` tem 3 superfícies e nenhuma
  depende do formato da topbar. Nenhum teste do repo toca `PipelineWorkspace` (o único arquivo de
  teste relacionado é `SyncButton.test.tsx`, que monta o botão isolado, sem a topbar).
- **Nenhum teste existente depende das classes removidas** (`flex-wrap`/`min-w-0`): grep por
  `className|classList|toHaveClass` nos `*.test.tsx` do repo não retorna nada — a suíte não faz
  asserção de classe.
- **Verificação independente por agente adversarial** — ver §8.

## 7. Pendências

1. **Tablet (640–900px) agora rola em vez de quebrar em duas linhas.** É consequência direta de
   manter `hidden sm:inline` (exigido pela task): a partir de `sm` os labels voltam e a linha passa a
   pedir ≈ 840–900px. No desktop (≥1024px) nada mudou. Se incomodar, o corte natural é encurtar o
   `min-w-[220px]` do `SelectTrigger` (`PipelineSelector.tsx:34`) ou segurar os labels até `md:` —
   ambos **fora do escopo** (o segundo contraria o requisito 4 explicitamente).
2. **Nome de pipeline muito longo** faz a barra rolar também no desktop (em vez de cortar). É
   coerente com "nada cortado", mas vale um `max-w-` + `truncate` no `SelectTrigger` — fora do escopo.
3. **O `SelectTrigger` herda `w-full`** (`src/components/ui/select.tsx:20`) e o `PipelineSelector`
   mantém `flex-wrap` interno (`PipelineSelector.tsx:24`). Em teoria, se o navegador resolvesse esse
   `100%` contra o grupo agora `shrink-0`, o seletor poderia quebrar internamente. Não há como
   confirmar sem renderizar (não há browser no sandbox); a análise de dimensionamento diz que **não**
   — o grupo é dimensionado por max-content, logo há zero espaço livre e o `flex-wrap` interno não
   tem o que quebrar. É **pré-existente** (o grupo já era max-content no desktop) e não afeta a
   capacidade de a barra rolar.
4. **Rodar as validações reais** (`npm ci`, `typecheck`, `lint`, `test`, `build`) num ambiente com
   `node_modules` — este sandbox não permite.
5. **Não há teste automatizado deste comportamento.** jsdom não faz layout, então um teste aqui só
   conseguiria afirmar strings de `className` (baixo sinal, e um padrão que a suíte não usa hoje).
   A verificação real é manual: ver §"Como validar na mão" no `README.md`.
6. **`jsxDEV is not a function`** continua derrubando todo teste React do repo (herdado, não desta
   task) — vale uma task de infra no Vitest.
7. **Topbar do CRM (abas de topo, `CRM.tsx:115`) tem o mesmo `flex-wrap`** e pode sofrer do mesmo
   problema em telas estreitas. Não foi tocada porque está fora do escopo ("a topbar do pipeline"),
   mas é a mesma correção de uma linha — candidata a task própria.

## 8. Verificação independente

Veredito: **PARTIAL** — todos os checks estáticos passaram; o que não pôde ser verificado é a
**renderização real** (não há browser no sandbox) e os comandos de validação (bloqueados). Os dois
achados foram incorporados: a faixa de tablet em §3/§7-1 e o `w-full` do `SelectTrigger` em §7-3.
Evidências completas em `README.md` §"Verificação independente".
