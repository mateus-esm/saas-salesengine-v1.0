# SE-CRM-001 — implementação (verboo)

> Barra do **topo do CRM** rola para o lado no mobile. Branch
> `task/SE-CRM-001-crm-topbar-mobile-scroll`. Dois arquivos de código.

---

## 1. Recon do repo (o que foi lido antes de editar)

| Arquivo | O que confirmou |
|---|---|
| `src/pages/CRM.tsx:115-158` | a barra do topo: `flex flex-wrap items-center justify-between gap-3` com `<Tabs>` (9 `TabsTrigger`), `<FeatureActivationGrid />` e `<AIAgentToggle />` |
| `src/pages/CRM.tsx:102` | `<Breadcrumb className="mb-2 hidden sm:block">` — já oculta no mobile, **não mexida** |
| `src/pages/CRM.tsx:161` (agora `:170`) | `<div className="flex-1 overflow-hidden">` com as views — o shell clippa, não rola |
| `src/components/crm/PipelineWorkspace.tsx:70-110` | o padrão **já validado** na SE-PIPELINE-001 (`git show 3d23be7`): barra `overflow-x-auto` + `shrink-0` nos grupos. **Não** tocado aqui |
| `src/components/ui/tabs.tsx:17-50` | o `TabsList` já tem um wrapper `max-w-full overflow-x-auto …`; o comentário de `:33-35` explica que num flex ele encolhe para o tamanho das abas |
| `src/components/ui/popover.tsx` | `PopoverContent` já porta para o `body`, com `w-72`, `z-50`, borda, sombra e animações |
| `src/components/AIAgentToggle.tsx` | `div.flex.items-center.gap-3.bg-card.border…`; tooltip é Radix (porta); retorna `null` se `!equipe` |
| `src/components/crm/customtables/FeatureActivationGrid.tsx` | botão "Ativar tabelas" + painel `absolute right-0 top-full` — **dropdown inline** |
| `src/components/AuthenticatedLayout.tsx:21` | `<main className="flex-1 flex flex-col overflow-hidden">` — o body não rola de lado |
| `src/components/crm/mobile/StagePicker.tsx:21` | par `overflow-x-auto` + `shrink-0` (idioma da casa) |
| `src/components/crm/filters/FilterSheet.tsx:25` | variante arbitrária `[&>*]:` já usada no repo |
| `package.json` | Tailwind 3.4.17, `@radix-ui/react-popover` presente, scripts `typecheck`/`lint`/`test`/`build` |

Greps de segurança antes de editar:

- `FeatureActivationGrid` → só `CRM.tsx` (import + uso) e ele mesmo. Sem outro consumidor.
- `AIAgentToggle` → só `CRM.tsx`.
- Nenhum arquivo `*.{test,spec}.{ts,tsx}` importa `pages/CRM`, `FeatureActivationGrid` ou `AIAgentToggle`.
- Nenhum teste usa `toHaveClass`/`classList`/`className` → a suíte não depende das classes removidas.

---

## 2. A mudança 1 — `src/pages/CRM.tsx`

```diff
-        <div className="flex flex-wrap items-center justify-between gap-3">
+        {/* Sprint 12 · SE-CRM-001 — no celular a barra rola para o lado. … */}
+        <div className="flex items-center justify-between gap-3 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
           <Tabs value={tab} onValueChange={setTab}>
```

Uma `className`. Nada mais na barra mudou: as 9 abas, o `Tabs`, o `FeatureActivationGrid`, o
`AIAgentToggle`, o `justify-between` e a `Breadcrumb` seguem idênticos.

### 2.1 Qual classe faz a rolagem

`overflow-x-auto` na própria barra é **a** classe que cria a rolagem: a barra fica do tamanho da tela
e o conteúdo mais largo que ela vira rolável.

As outras classes só tornam a rolagem correta:

| Classe | Papel |
|---|---|
| `overflow-x-auto` | **cria** o scroll container |
| `[&>*]:shrink-0` | **faz a rolagem existir**: sem ele os filhos diretos encolhem (`flex-shrink: 1`) e o navegador espreme em vez de transbordar |
| `overscroll-x-contain` | contém o gesto na barra; o swipe não encadeia para a página |
| `[-webkit-overflow-scrolling:touch]` | momentum scroll no iOS (idioma da casa) |
| `[scrollbar-width:none]` + `[&::-webkit-scrollbar]:hidden` | esconde a barra de rolagem nos dois motores |

### 2.2 Por que `[&>*]:shrink-0` e não três `<div className="shrink-0">`

O `shrink-0` precisa chegar a **cada grupo** (o `Tabs`, o `FeatureActivationGrid` e o
`AIAgentToggle`), senão o grupo sem ele encolhe e a barra não transborda. Duas formas:

- **(a)** embrulhar cada um num `<div className="shrink-0">` — foi o que a SE-PIPELINE-001 fez;
- **(b)** `[&>*]:shrink-0` na barra — aplica a todos os filhos diretos.

Escolhi **(b)**:

1. **Não muda o DOM.** `Tabs`, `FeatureActivationGrid` e `AIAgentToggle` continuam os três filhos
   diretos, com a mesma largura e o mesmo `gap-3` — o desktop fica idêntico por construção.
2. **Não cria `gap` fantasma.** `AIAgentToggle` retorna `null` quando `!equipe`
   (`AIAgentToggle.tsx:60`). Com um wrapper `<div className="shrink-0">` sobraria um item flex vazio
   de largura 0 que **mesmo assim** conta para o `gap-3` e para a distribuição do `justify-between`,
   deslocando o `FeatureActivationGrid`. Sem wrapper, o caso `null` se comporta como antes.
3. **É idioma do repo.** `[&>*]:w-full` já é usado em `src/components/crm/filters/FilterSheet.tsx:25`
   e `[&_svg]:…` em `src/components/ui/button.tsx:8`.

### 2.3 Por que o desktop não é afetado

Dois fatos independentes:

1. **`overflow-x: auto` só rola quando há overflow.** Não há: o conteúdo da barra mede ≈ 1280px
   (estimativa em §3.1) e em viewport ≥ ~1300px ele cabe. Sem overflow, `scrollWidth === clientWidth`
   e não existe rolagem.
2. **`flex-shrink: 0` só age com espaço livre negativo.** Com folga, é inerte — e o
   `justify-between`, que ficou no lugar, volta a distribuir os três grupos como sempre:
   abas à esquerda, "Ativar tabelas" logo depois, Copilot na ponta direita.

Nenhum espaçamento mudou (`gap-3`, `px-2 sm:px-4 py-2`, `mb-2` da `Breadcrumb`). No mobile o espaço
livre é **negativo**, e aí `justify-between` se comporta como `flex-start` — o scroll começa na
main-start, ou seja, o primeiro item visível é o `Tabs`. É o que se quer.

---

## 3. A mudança 2 — `src/components/crm/customtables/FeatureActivationGrid.tsx`

### 3.1 O problema que ela evita (e por que é necessária)

`FeatureActivationGrid` desenhava o painel "Tabelas Personalizadas" assim:

```jsx
<div className="relative">
  <button onClick={…}>…</button>
  {open && (
    <div className="absolute right-0 top-full mt-1 w-72 rounded-md border bg-popover p-3 shadow-md z-50">
```

Com a barra virando `overflow-x: auto`, esse painel passaria a ser **recortado**:

> CSS Overflow Module Level 3, §3.1: se um eixo é `scroll`/`auto` e o outro é `visible`, o `visible`
> **computa para `auto`**. Logo `overflow-x: auto` na barra também clipa no eixo **vertical**.

O painel abre **abaixo** do gatilho (`top-full mt-1`), ou seja, fora da caixa da barra (que tem só a
altura de `py-2` + conteúdo ≈ 56px). Resultado: o botão continuaria lá, mas clicar nele não mostraria
nada — o requisito "`FeatureActivationGrid` continua **funcional**" quebraria em silêncio.

Por que a SE-PIPELINE-001 não tropeçou nisso: os controles daquela barra que abrem painel usam
**Radix**, que porta para o `body` — `SyncButton` usa `Tooltip` (`SyncButton.tsx:105`),
`PipelineSelector` usa `Select` (`PipelineSelector.tsx:29-43`). O `AIAgentToggle` também usa
`Tooltip`. O `FeatureActivationGrid` era o **único dropdown `absolute` inline** dentro da barra.

### 3.2 A correção

Trocar o par `relative` + `absolute` por `Popover` / `PopoverTrigger` / `PopoverContent`:

```jsx
<Popover onOpenChange={handleOpenChange}>
  <PopoverTrigger asChild>
    <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <Settings2 className="h-4 w-4" />
      Ativar tabelas
    </button>
  </PopoverTrigger>
  <PopoverContent align="end" className="w-72 p-3">
    …mesmo conteúdo…
  </PopoverContent>
</Popover>
```

`PopoverContent` já renderiza dentro de `<PopoverPrimitive.Portal>` (`ui/popover.tsx:14`), então o
painel vai para o `body` e **escapa** do recorte do scroll container — de quebra ganha posicionamento
com detecção de colisão (não sai da tela na borda).

Equivalências com o original:

| Original | Novo |
|---|---|
| `right-0` (alinhado à direita do gatilho) | `align="end"` |
| `mt-1` (4px) | `sideOffset` default `4` |
| `w-72` | `w-72` (já é o default do `PopoverContent`) |
| `p-3` | `className="p-3"` (sobrepõe o `p-4` default) |
| `rounded-md border bg-popover shadow-md z-50` | já no default do `PopoverContent` (que ainda adiciona `outline-none` e as animações) |
| `{open && …}` | o Radix controla a montagem; conteúdo desmontado quando fechado |

Mudanças de estado: o `useState` de `open` **saiu** (o Radix é não-controlado) e o carregamento do
`sessionStorage`, que estava no `onClick` do botão, foi para o `onOpenChange` — **mesmo momento**
(abrir o painel). `toggle()` e o auto-save em `sessionStorage` ficaram **byte a byte** iguais.

O `<div className="relative">` externo saiu: sem o `absolute` ele não tinha mais função, e o Radix
Root não renderiza elemento — então o `FeatureActivationGrid` continua sendo **um** filho direto da
barra (agora o `<button>`), preservando a contagem e a largura dos itens flex.

---

## 4. Requisitos × implementação

| # | Requisito | Como | Onde |
|---|---|---|---|
| 1 | Mobile: barra rola na horizontal, 9 abas alcançáveis, nada cortado | `overflow-x-auto` + `[&>*]:shrink-0` + `overscroll-x-contain` | `CRM.tsx:124` |
| 2 | Desktop preservado, sem scroll desnecessário, `justify-between` mantido | `justify-between` intacto; sem overflow em ≥ ~1300px | `CRM.tsx:124` |
| 3 | Sem scroll horizontal na página | rolagem contida na barra + `overscroll-x-contain`; ancestrais `overflow-hidden` | `AuthenticatedLayout.tsx:21`, `CRM.tsx:170` |
| 4 | `FeatureActivationGrid` e `AIAgentToggle` visíveis e funcionais | filhos diretos da barra; painel portado para o `body` | `CRM.tsx:165-166`, `FeatureActivationGrid.tsx:44` |
| 5 | Trocar de aba continua funcionando | `value`/`onValueChange` e toda a lógica de `setTab`/URL intocados | `CRM.tsx:125` |

---

## 5. Dimensionamento (por que o mobile realmente rola)

Larguras estimadas a 14px (`text-sm`), `px-3` = 12px por lado, ícone 16px, `gap-2` = 8px:

| Grupo | Itens | ≈ largura |
|---|---|---|
| `TabsList` | 9 abas + `p-1` | 970px |
| "Ativar tabelas" | ícone + label | 120px |
| Toggle do Copilot | `px-3` + ícone + "Copilot" + `Info` + `Switch` | 160px |
| `gap-3` × 2 | | 24px |
| **Total** | | **≈ 1274px** |

- **Mobile 360–390px** (menos `px-2`): conteúdo ≈ 1274px contra ≈ 344–374px → excesso de ~900px,
  folgado para haver `scrollWidth > clientWidth`. A rolagem existe de fato.
- **Desktop ≥ ~1300px**: conteúdo cabe → nada rola.
- **Faixa ~1024–1300px**: rola (antes quebrava em duas linhas). Ressalva em §6.

---

## 6. Pendências e ressalvas honestas

1. **Faixa ~1024–1300px muda de comportamento.** Antes a barra quebrava em duas linhas (o defeito);
   agora rola. É a troca pedida pela task, mas é mudança visível em notebooks 1280px e tablets
   paisagem. A alternativa (manter `flex-wrap`) é exatamente o que a task manda remover.
2. **Rótulos das 9 abas continuam sempre visíveis** (sem `hidden sm:inline`), conforme a task. É o
   que faz a barra medir ~970px. Se um dia quiser reduzir a faixa de rolagem, o caminho é
   ícone-only no phone — **fora do escopo** desta task.
3. **Nada foi validado por execução.** `npm`/`git` estão bloqueados no sandbox e não há
   `node_modules` (§7). O comportamento de layout **não** foi observado — só analisado. jsdom não faz
   layout, então nenhum teste do repo cobriria isso de qualquer forma.
4. **`FeatureActivationGrid` mudou de forma** (de `absolute` inline para `Popover` portado). É a
   única alteração fora da barra e é justificada em §3.1; se o revisor preferir escopo estritamente
   de uma linha, a alternativa seria **não** pôr `overflow` na barra (e aí não haveria rolagem).

---

## 7. Validações

⚠️ **Não executadas.** `npm --version` → *"This command requires approval"*. Não há `node_modules`
no worktree e nenhum binário global (`tsc`, `eslint`, `vitest`, `npx`, `bun`, `deno` → `which` sem
resultado). `git add`/`commit`/`push`/`gh pr create` também são negados.

| Comando | Resultado |
|---|---|
| `NODE_ENV=development npm ci --include=dev` | ❌ não executado — bloqueado pelo sandbox |
| `npm run typecheck` | ❌ não executado — bloqueado pelo sandbox |
| `npm run lint` | ❌ não executado — bloqueado pelo sandbox |
| `npm test` | ❌ não executado — bloqueado pelo sandbox |
| `npm run build` | ❌ não executado — bloqueado pelo sandbox |

**Baseline: NÃO remedido.** O baseline conhecido do repo (medido em `SE-COPILOT-001`, outro dia,
outro worktree) é `npm test` → 13 arquivos falhos / 33 testes falhos / 326 passaram, por
`jsxDEV is not a function` (testes React), env Supabase ausente e testes `node:fs`/`node:path` em
ambiente browser. **Não** afirmo que continua idêntico — não medi. Esta task não cria, altera nem
remove teste, então não deveria mexer nesse número.

Validação **estática** feita no lugar:

- `git diff --stat` → exatamente 2 arquivos de código (`CRM.tsx` 11+/1−, `FeatureActivationGrid.tsx`).
- Leitura integral dos dois arquivos após a edição.
- Cadeia de ancestrais do novo scroll container: `CRM.tsx:101` (sem overflow) → `CRM.tsx:100`
  (`flex flex-col h-full`) → `AuthenticatedLayout.tsx:21` (`overflow-hidden`). O body não rola.
- Grep de consumidores e de asserções de classe (§1) — nada depende do que saiu.

---

## 8. Verificação independente (agente adversarial)

**Veredito: ✅ PASS** — agente `verification` em contexto limpo, com o diff e as instruções da task,
sem acesso à justificativa do implementador (a não ser o que está no diff).

Checks confirmados com evidência (`file:line` / comando + saída):

| Check | Resultado |
|---|---|
| Escopo: só 2 arquivos de código; `PipelineWorkspace.tsx` intacto | ✅ `git status --porcelain` + `git diff --stat` contra o topo real |
| Barra sem `flex-wrap`, com `justify-between` | ✅ `src/pages/CRM.tsx:124` |
| 9 abas com label sempre visível, `Tabs value/onValueChange` intacto | ✅ `src/pages/CRM.tsx:125-164` |
| `[&>*]:shrink-0` é sintaxe válida de Tailwind 3.4 e já usada no repo | ✅ `src/components/crm/filters/FilterSheet.tsx:25` |
| Desktop preservado (`overflow-x: auto` inerte sem excesso; `shrink-0` inerte com folga) | ✅ |
| Estimativa de largura ≈ 1280px (rola abaixo de ~1300px) | ✅ defensável |

**Não verificável neste ambiente** (limitação do sandbox, **não** do diff): `npm ci`, `npm run
typecheck`, `npm run lint`, `npm test`, `npm run build` e a renderização real. Sem `node_modules`,
sem binários globais, sem browser. O verificador marcou esses itens como NÃO VERIFICÁVEL — o que é
consistente com §7 e não é um PASS sobre eles.

### Nota sobre a base do diff

O ref **local** `main` deste worktree está **defasado** em `d148b4f` (merge do PR #9), então
`git diff main` acusa ~410 arquivos de sprints antigas — falso positivo. O topo real é
`origin/main` = `5233d03` = HEAD. A comparação correta:

```
$ git diff --stat origin/main
 .../crm/customtables/FeatureActivationGrid.tsx     | 88 ++++++++++++----------
 src/pages/CRM.tsx                                  | 11 ++-
 2 files changed, 57 insertions(+), 42 deletions(-)
```

Um verificador anterior (dois, na verdade) morreu com erro de infraestrutura da API antes de emitir
veredito; o terceiro completou.
