# SE-CRM-001 — result.md

> **Cópia fiel do `result.md` canônico.** O caminho oficial
> `/srv/solo-dev/tasks/running/SE-CRM-001/result.md` está **fora do escopo do sandbox** desta
> execução (leitura e escrita negadas: *"requested permissions … but you haven't granted it yet"*),
> então o conteúdo foi gravado aqui e o humano deve copiá-lo para o caminho canônico.
> Mesmo workaround documentado em `SE-PIPELINE-001` e `SE-COPILOT-001`.

| Campo | Valor |
|---|---|
| Task | **SE-CRM-001** — Barra do TOPO do CRM rola para o lado no mobile |
| Projeto | saas-salesengine-v1.0 |
| Branch | `task/SE-CRM-001-crm-topbar-mobile-scroll` |
| Base | `main` (remoto) = `5233d03` = HEAD. ⚠️ o ref **local** `main` está defasado em `d148b4f`, então use `git diff --stat origin/main` — `git diff main` acusa ~410 arquivos por engano |
| Status | ✅ **Implementado** · ⚠️ **Validações NÃO executadas** (sandbox bloqueia `npm`/`git`) |
| Migration | **nenhuma** |
| Arquivos de código | **2** |

## Entregáveis

| # | Entregável | Caminho | Estado |
|---|---|---|---|
| 1 | Fix da barra do topo do CRM | `src/pages/CRM.tsx` (linha ~124) | ✅ |
| 2 | Painel do `FeatureActivationGrid` deixa de ser recortado pelo novo scroll container | `src/components/crm/customtables/FeatureActivationGrid.tsx` | ✅ |
| 3 | README do projeto da task | `docs/dev/projects/saas-salesengine-v1.0/SE-CRM-001/README.md` | ✅ |
| 4 | Detalhamento da implementação | `docs/dev/projects/saas-salesengine-v1.0/SE-CRM-001/verboo/implementacao.md` | ✅ |
| 5 | Este `result.md` (cópia do canônico) | `docs/dev/projects/saas-salesengine-v1.0/SE-CRM-001/result.md` | ✅ |

## O que foi feito

**1. `src/pages/CRM.tsx`** — a barra do topo, uma `className`:

| Antes | Depois |
|---|---|
| `flex flex-wrap items-center justify-between gap-3` | `flex items-center justify-between gap-3 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0` |

- **`overflow-x-auto`** na própria barra é a classe que **cria** a rolagem lateral.
- **`[&>*]:shrink-0`** é o que **faz a rolagem existir**: sem ele os filhos diretos encolhem
  (`flex-shrink: 1`) e o navegador espreme em vez de transbordar. A variante arbitrária `[&>*]:`
  (já usada em `src/components/crm/filters/FilterSheet.tsx:25`) atinge os três grupos — `Tabs`,
  `FeatureActivationGrid`, `AIAgentToggle` — **sem wrapper novo**, então o DOM e o `gap-3` do
  desktop não mudam (importa porque o `AIAgentToggle` pode retornar `null`).
- **`overscroll-x-contain`** contém o gesto: o swipe não encadeia para a página (requisito 3).
- Nada mais mudou: 9 abas, `Tabs value/onValueChange`, `justify-between`, `gap-3`, `Breadcrumb`
  (`hidden sm:block`) e a lógica de `setTab`/URL seguem intactos.

**2. `src/components/crm/customtables/FeatureActivationGrid.tsx`** — painel `absolute right-0
top-full` → Radix `PopoverContent align="end" className="w-72 p-3"`. **Necessário** para não
introduzir regressão: pela CSS Overflow Module Level 3 §3.1, `overflow-x: auto` faz `overflow-y`
**computar para `auto`**, e um painel `absolute` que abre **abaixo** do botão ficaria **recortado**
pela barra (o requisito 4 — "funcional" — quebraria em silêncio). `PopoverContent` porta para o
`body` (`ui/popover.tsx:14`) e escapa do recorte. O `SyncButton` da SE-PIPELINE-001 não sofreu disso
porque seus tooltips são Radix; o `FeatureActivationGrid` era o **único dropdown `absolute` inline**
da barra. Conteúdo, `toggle()` e o auto-save em `sessionStorage` são os mesmos.

### Por que não afeta o desktop

`overflow-x: auto` **só rola quando há overflow** e `flex-shrink: 0` **só age com espaço livre
negativo**. Em viewport ≥ ~1300px o conteúdo (≈ 1280px: 9 abas com rótulo sempre visível ≈ 970px +
"Ativar tabelas" ≈ 120px + Copilot ≈ 160px + 2 gaps) cabe, então nada rola e o `justify-between`
intacto distribui os três grupos exatamente como antes. Nenhum espaçamento mudou.

### Ressalva

A faixa **~1024px a ~1300px** muda de comportamento: antes a barra quebrava em duas linhas (o
defeito), agora rola na horizontal. É a troca pedida pela task (`flex-wrap` é o que sai), com a
rolagem contida na barra. Em ≥ ~1300px nada rola.

## Validações

⚠️ **NÃO EXECUTADAS.** Neste sandbox `npm` retorna *"This command requires approval"* (testado:
`npm --version`), **não há `node_modules`** no worktree e não há binário global (`which tsc eslint
vitest npx bun deno` → sem resultado). `git add`/`commit`/`push`/`gh pr create` também são negados.
Mesmo bloqueio de `SE-PIPELINE-001`/`SE-COPILOT-001`/`SE-LEAD-001`.

| Comando | Resultado |
|---|---|
| `NODE_ENV=development npm ci --include=dev` | ❌ **não executado** — bloqueado pelo sandbox |
| `npm run typecheck` | ❌ **não executado** — bloqueado pelo sandbox |
| `npm run lint` | ❌ **não executado** — bloqueado pelo sandbox |
| `npm test` | ❌ **não executado** — bloqueado pelo sandbox |
| `npm run build` | ❌ **não executado** — bloqueado pelo sandbox |

**Baseline: NÃO remedido.** O baseline conhecido do repo (medido em `SE-COPILOT-001`, outro dia,
outro worktree) é `npm test` → 13 arquivos falhos / 33 testes falhos / 326 passaram, por
`jsxDEV is not a function` (testes React), env Supabase ausente e testes `node:fs`/`node:path` em
ambiente browser. **Não** é afirmado aqui que permanece idêntico — não foi remedido. Esta task não
cria, altera nem remove teste, então não deveria mexer nesse número.

**Validação estática feita no lugar:** `git diff --stat` (2 arquivos de código), leitura integral
dos arquivos após a edição, cadeia de ancestrais do scroll container
(`CRM.tsx:101` → `CRM.tsx:100` → `AuthenticatedLayout.tsx:21` `overflow-hidden`), e greps de
consumidores/asserções de classe (nenhum teste importa `pages/CRM`, `FeatureActivationGrid` ou
`AIAgentToggle`; nenhum teste usa `toHaveClass`/`classList`/`className`).

**Verificação independente (agente adversarial):** ver §"Verificação independente" no
`README.md` e `verboo/implementacao.md`. **Veredito: ✅ PASS** — escopo (2 arquivos de código,
`PipelineWorkspace.tsx` intacto), barra sem `flex-wrap` com `justify-between` preservado, 9 abas com
label sempre visível, `Tabs value/onValueChange` intacto, `[&>*]:shrink-0` válido e já usado no repo,
desktop preservado. Spot-check do implementador reconferiu `git status --porcelain`,
`git diff --stat origin/main` (2 arquivos) e o grep de `[&>*]` — bateram com o relatório.
**Não verificável neste ambiente:** `npm ci`/`typecheck`/`lint`/`test`/`build` e a renderização real
(sandbox sem `npm`/`node_modules`/browser) — marcados como NÃO VERIFICÁVEL, não como aprovados.

## Como o humano fecha a entrega

O agente **não** consegue commitar (bloqueio de sandbox). Rodar no worktree:

```bash
cd /srv/solo-dev/worktrees/saas-salesengine-v1.0/SE-CRM-001
NODE_ENV=development npm ci --include=dev
npm run typecheck && npm run lint && npm test && npm run build
git add src/pages/CRM.tsx src/components/crm/customtables/FeatureActivationGrid.tsx \
        docs/dev/projects/saas-salesengine-v1.0/SE-CRM-001
git commit -m "fix(crm): barra do topo rola para o lado no mobile em vez de espremer

A barra do topo do CRM usava flex-wrap: em telas estreitas as nove abas
(Pipeline ... Agenda) e os controles Ativar tabelas / Copilot quebravam
para uma segunda linha e encolhiam. Agora a propria barra rola na
horizontal (overflow-x-auto + overscroll-x-contain), com [&>*]:shrink-0
para cada grupo manter o tamanho natural. No desktop nao ha excesso, entao
nada rola e o justify-between segue distribuindo os grupos como antes.

O painel Ativar tabelas virou Popover (portado para o body) porque
overflow-x-auto faz overflow-y computar para auto, e o painel absolute
inline ficaria recortado pela barra.

SE-CRM-001"
git push -u origin task/SE-CRM-001-crm-topbar-mobile-scroll
gh pr create --base main --title "fix(crm): barra do topo rola para o lado no mobile" --body-file docs/dev/projects/saas-salesengine-v1.0/SE-CRM-001/README.md
```

E copiar este arquivo para `/srv/solo-dev/tasks/running/SE-CRM-001/result.md`.

## Pendências

1. **Validações dinâmicas** — todas bloqueadas pelo sandbox; rodar no host (§acima).
2. **Faixa ~1024–1300px** passa a rolar em vez de quebrar em duas linhas (ressalva documentada).
3. **`result.md` canônico** — `/srv/solo-dev/tasks/running/SE-CRM-001/result.md` inacessível;
   copiar esta versão.
4. **Commit / push / PR** — negados no sandbox; comandos prontos acima.
5. **Verificação em dispositivo real** — nenhum browser no sandbox; o comportamento de layout foi
   analisado, não observado. Roteiro manual no `README.md` §"Como validar na mão".
