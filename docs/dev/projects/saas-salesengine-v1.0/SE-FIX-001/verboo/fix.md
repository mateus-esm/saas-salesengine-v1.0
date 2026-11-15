# SE-FIX-001 — Fix: digitação responsiva no nome da etapa

Projeto: saas-salesengine-v1.0 · Tarefa: SE-FIX-001 · Agente: verboo
Branch: `fix/pipelines-config-typing-lag` · Data: 2026-09-18
Diagnóstico: [`diagnostico.md`](./diagnostico.md)

## O que mudou

O texto digitado passou a morar em **estado local** do campo; a rede só é chamada **ao sair do
campo** (blur), e apenas se o texto tiver mudado.

### 1. Novo: `src/components/crm/pipeline-settings/DraftField.tsx`

Componente de campo de texto com rascunho local. Regras:

- `useState(value)` (L48) guarda o texto exibido — digitar não chama nada de fora
  (`handleChange`, L67-70, só marca `dirty` e faz `setDraft`).
- `handleBlur` (L77-86) marca o fim da edição e decide:
  - **o usuário digitou** (`dirty.current`): chama `onCommit(draft)` **uma vez**, e só se
    `draft !== server.current` (evita write inútil de quem digitou e voltou ao mesmo texto);
  - **não digitou**: nenhum commit; se o valor do servidor mudou por baixo enquanto o campo
    estava focado, o rascunho é atualizado para o valor novo (`setDraft(server.current)`).
- `useEffect([value])` (L62-65) guarda o valor mais recente do servidor em `server.current` **e**
  ressincroniza o rascunho quando chega **valor novo do servidor** (refetch, invalidação de outra
  mutation, troca de pipeline) — mas **não** enquanto o campo está em edição, para não apagar o
  que o usuário está digitando.
- Os refs `dirty` (L55) e `server` (L58) existem por causa de uma janela que a revisão adversarial
  apontou: com o campo focado, se outra aba/usuário renomeasse a etapa, o `draft` antigo continuava
  na tela e um blur **sem digitação** gravaria o texto velho por cima do novo. Agora só grava o que
  o usuário realmente digitou.
- Em campo de uma linha, `Enter` (L88-95) apenas tira o foco (`currentTarget.blur()`), caindo no
  mesmo caminho de commit; em `multiline` o `Enter` continua sendo quebra de linha.
- Renderiza `<Input>` ou `<Textarea>` (shadcn) conforme `multiline`; aceita `className`,
  `placeholder`, `aria-label`, `type` e `rows`, para os chamadores não perderem nada do markup
  anterior. O tipo da prop `type` é `React.ComponentProps<"input">["type"]` — o mesmo que
  `ui/input.tsx` já usa e que comprovadamente existe no `@types/react` do repo (a revisão
  levantou a dúvida sobre `React.HTMLInputTypeAttribute`, que não foi possível checar sem
  `node_modules`; usar o alias derivado do componente elimina o risco).

O padrão é o mesmo que o repositório já usa na edição de células do grid
(`src/components/crm/grid/InlineCell.tsx:229-262`, `TextEditor`: estado local + commit no blur).

### 2. `src/components/crm/pipeline-settings/StagesEditor.tsx`

- Nome da etapa (L402-407): era
  `<Input value={stage.name} onChange={(e) => onChange({ name: e.target.value })} />`, virou
  `<DraftField value={stage.name} onCommit={(name) => onChange({ name })} … />`.
- Descrição (L594-602): mesmo defeito no `<Textarea>` (commit por tecla) → agora `DraftField`
  `multiline` com `onCommit={(description) => onChange({ description: description || undefined })}`
  (semântica do patch preservada).
- Webhook do ciclo (L662-671): `<Input>` com commit por tecla → `DraftField` com
  `onCommit={(cycle_webhook_url) => onChange({ cycle_webhook_url: cycle_webhook_url || null })}`.
- Removido o import de `Textarea` (a última utilização era a descrição); adicionado o import de
  `DraftField`.

Os três eram o **mesmo defeito** (input controlado pelo servidor + mutation por tecla). Os
numéricos foram deixados como estavam — ver "Fora de escopo".

### 3. Novo: `src/components/crm/pipeline-settings/__tests__/DraftField.test.tsx`

8 casos, espelhando as convenções de `src/components/crm/grid/__tests__/InlineCell.test.tsx`
(vitest + `@testing-library/react` + `fireEvent`, sem jest-dom):

1. digitar duas vezes **não** chama `onCommit`; o blur chama **uma** vez com o texto final;
2. sair do campo sem mudar nada não chama `onCommit`;
3. valor novo do servidor aparece quando o campo não está em edição;
4. refetch no meio da digitação não apaga o rascunho (e o blur persiste o texto digitado);
5. sair sem digitar não grava por cima de um valor novo do servidor (a janela de *lost update*
   apontada na revisão);
6. digitar e voltar ao valor do servidor não gera `UPDATE` inútil;
7. `Enter` sai do campo e quem persiste é o blur (o `blur()` do elemento é espiado, e o commit só
   acontece depois do blur);
8. `multiline` (Textarea) também persiste no blur.

O componente é renderizado sozinho justamente para o teste não precisar mockar Supabase, React
Query, dnd-kit nem Popover/Select.

Correções vindas da revisão adversarial (rodada 1): o caso 4 original fazia `rerender` com o
**mesmo** `value` que o render inicial, então o `useEffect([value])` nem re-executava e o teste
passava sem exercitar a guarda de edição — agora manda um valor **diferente** (`"Etapa antiga"`).

Correção vinda da revisão adversarial (rodada 2): o foco/blur era disparado com
`fireEvent.focus`/`fireEvent.blur`. Como o React 16 delegava `onFocus`/`onBlur` por `focus`/`blur`
(captura no document) e o React 17+ passou a delegar por `focusin`/`focusout`, existe a
possibilidade de esses eventos não chegarem ao handler do React — e nenhuma suíte do repo usa
`fireEvent.blur`/`focus` (as outras usam `click`/`change`/`keyDown`), então não havia precedente
para confirmar. Agora os helpers `focusField`/`blurField` constroem os eventos explicitamente
(`new FocusEvent("focus"|"focusin"|"blur"|"focusout")`) e disparam os **dois** nomes de cada vez:
em navegador real os dois eventos saem no mesmo gesto, então o React registra `onFocus`/`onBlur`
para apenas um deles e não há dupla chamada — a suíte passa a funcionar com qualquer uma das duas
estratégias de delegação. O caso 7 (Enter) não depende disso: ele espiona `blur()` no elemento.

## Por quê

Cada tecla do nome da etapa disparava `updateStage.mutate` (`StagesEditor.tsx:191`), que faz
`UPDATE` em `pipeline_stages_v2` (`usePipelineStagesV2.ts:120`) e invalida o cache da lista inteira
(`usePipelineStagesV2.ts:124`) — sem nenhum update otimista. Como o `<Input>` era controlado por
`stage.name` (dado do cache), a letra só aparecia depois do round-trip completo. Mantendo o texto em
estado local, a digitação deixa de depender da rede; o valor do servidor continua sendo a fonte da
verdade fora da edição.

## O que NÃO mudou (checado para não quebrar)

- O `onChange` do pai continua sendo `updateStage.mutate({ id: s.id, ...patch })`
  (`StagesEditor.tsx:191`): o patch agora sai no blur, com o mesmo formato de antes
  (`name`, `description`/`undefined`, `cycle_webhook_url`/`null`).
- Drag-and-drop: só o handle tem os `listeners` do dnd-kit (`StagesEditor.tsx:384-391`); o input
  nunca participou do arrasto. `handleDragEnd`/`reorderStages` intocados.
- Criação e exclusão de etapa: `createStage.mutate` / `deleteStage.mutate` intocados; o campo
  "Nova etapa…" (L201-206) já era estado local.
- Selects (`stage_type` L414-417, `funnel_event`, `cadence_unit` L549-554) intocados.
- Campos numéricos (`max_idle_hours`, `max_interactions`, `cadence_value`, `cycle_days`) intocados.

## Fora de escopo (registrado, não corrigido)

- **Numéricos** com commit por tecla: `max_idle_hours` (L487-499), `max_interactions` (L511-523),
  `cadence_value` (L536-548), `cycle_days` (L615-627). Têm o mesmo problema de fundo, mas o parsing
  (`parsePositiveIntOrNull`) roda a cada tecla; aplicar rascunho local ali é uma decisão à parte
  (o que fazer com texto inválido no blur?) e não foi pedido.
- **Sem rollback otimista**: nenhuma alteração no comportamento de erro das mutations.

## Validação

### Executado

- Leitura integral dos arquivos alterados e do encadeamento `input → onChange → mutate` (ver
  `diagnostico.md`). Sem reprodução no navegador e sem medição de tempo.
- `git diff` dos arquivos alterados para conferir que só os três campos de texto e os imports
  mudaram.
- **Revisão adversarial por agente `verification` independente** (leitura de código + os comandos
  que o sandbox permitiu), em duas rodadas. Ambas terminaram em **PARTIAL**, por um motivo que não
  é do código: `tsc -b`, `eslint src`, `vitest run` e `vite build` não rodam neste sandbox.

  **Rodada 1** — o fix foi considerado correto estaticamente (nenhuma requisição por tecla, commit
  único no blur com o texto mais recente, ressincronização do servidor fora de edição, sem
  regressão em drag-and-drop, create/delete, selects ou numéricos), com três apontamentos,
  **todos corrigidos**:
  1. o caso 4 do teste era vazio (mesmo `value` no `rerender`) — corrigido, e o caso 5 foi
     adicionado para cobrir a janela de *lost update*;
  2. janela de *lost update* (campo focado + valor novo do servidor + blur sem digitação gravava o
     texto velho) — corrigido com os refs `dirty`/`server`;
  3. dúvida sobre `React.HTMLInputTypeAttribute` (o gate de tipos do CI é `npx tsc -b`) —
     trocado por `React.ComponentProps<"input">["type"]`, alias já usado em `ui/input.tsx`.

  **Rodada 2** — confirmou as três correções por leitura ("as 3 correções da rodada 1 estão de fato
  implementadas e corretas"), não achou regressão estática nem caminho de digitação que alcance a
  rede, e apontou três itens — **dois corrigidos e um registrado como limitação**:
  1. risco alto de `fireEvent.blur`/`focus` não chegarem ao handler do React (delegação por
     `focusin`/`focusout` no React 17+) — resolvido com os helpers que disparam os dois nomes de
     evento (ver §3);
  2. o teste do `DraftField` isolado não protege o *call site*: se `StagesEditor.tsx` voltasse ao
     `<Input onChange={...}/>` mantendo o `DraftField`, os testes continuariam verdes — **não
     corrigido**, registrado como limitação abaixo;
  3. o ramo do `Enter` não tinha teste — resolvido com o caso 7.

  **Rodada 3** — focada no arquivo de teste reescrito. Confirmou por análise estrutural que a tese
  dos "dois nomes de evento" é sólida e **não depende** de qual nome o React 18 mapeia: um evento
  não-borbulhante (`focus`/`blur`, `bubbles: false`) só pode ser visto por listener de **captura**,
  e o componente só registra `onFocus`/`onBlur` (sem `onFocusCapture`/`onBlurCapture`) — logo zero
  chamadas; já `focusin`/`focusout` com `bubbles: true` chegam ao listener de bolha do container
  raiz e produzem **exatamente uma** chamada. Confirmou também que `vi.spyOn(el, "blur")` é
  interceptado (o `currentTarget` do React é o mesmo nó do DOM devolvido por `screen.getByRole`) e
  que os 8 casos exercitam ramos distintos e não-tautológicos. Veredito: **PARTIAL**, pelos mesmos
  motivos ambientais, mais 3 defeitos de redação na documentação (frases "todos tratados" e a
  contagem de casos), **todos corrigidos** nesta versão.

  Ressalvas de baixa severidade registradas pelo verificador e **não** alteradas: `dirty` só é
  resetado no `focus` (blur exige foco antes, então é inalcançável); e um *flicker* visual quando um
  commit é seguido de edição antes do refetch (o rascunho volta ao valor antigo até o refetch
  chegar — auto-curável). Os casos 2 e 3 do teste são asserções fracas isoladamente (passariam em
  outras implementações), mas não são tautológicos: ganham valor em conjunto com os casos 1, 4, 6, 7
  e 8, que guardam a regressão nos dois sentidos (commit por tecla e commit no blur).

### NÃO EXECUTADO (runner indisponível neste sandbox)

`npm run typecheck`, `npm run lint` e `npm test` **não foram executados** — nem por mim, nem pelo
verificador. O worktree não tem `node_modules` (`ls node_modules` → `No such file or directory`) e
as chamadas de `npm` foram bloqueadas por permissão do harness (o verificador confirmou que existe
runtime `node` no sandbox, mas `npm`/`node <script>`/`node -e` não rodam). Portanto **não há
baseline de falhas nem resultado de suíte para reportar** — nada aqui deve ser lido como "os testes
passam". O CI do repo (`.github/workflows/ci.yml`) roda `npx tsc -b` como gate de tipos e **não**
roda o vitest, então o teste novo só será exercitado se alguém rodar `npm test` localmente.

O que precisa ser rodado antes de considerar o fix aceito (na máquina com dependências instaladas):

```bash
npm install         # ou bun install (o repo tem bun.lock)
npm run typecheck   # tsc -b
npm run lint        # eslint src
npm test            # vitest run
```

Checagens estáticas feitas no lugar do typecheck (revisão manual, `tsconfig.app.json` com
`strict:false`/`noUnusedLocals:false`, `jsx: react-jsx`, `moduleResolution: bundler`):

- `DraftField.tsx` usa `import * as React` e referencia `React.ChangeEvent`, `React.KeyboardEvent`,
  `React.ComponentProps` e `React.useState/useRef/useEffect` — sem depender do namespace global.
- Handlers tipados com o union `HTMLInputElement | HTMLTextAreaElement` e repassados tanto ao
  `<Input>` quanto ao `<Textarea>`. O verificador apontou precedente no próprio repo
  (`ProposalDialog.tsx:161` cria um handler com esse union e o passa a um `onChange` tipado como
  `HTMLInputElement`); as propriedades usadas (`target`, `currentTarget`) são covariantes em `T`.
- O tipo da prop `type` é derivado de `React.ComponentProps<"input">["type"]`, o alias que
  `src/components/ui/input.tsx:5` já usa — em vez do `React.HTMLInputTypeAttribute`, que o
  verificador não conseguiu confirmar no `@types/react` sem `node_modules`.
- A prop `"aria-label"` é desestruturada como `"aria-label": ariaLabel` e repassada como
  `aria-label` (mesmo padrão dos `<Input>`/`<Label>` existentes no arquivo).
- O import removido de `Textarea` no `StagesEditor.tsx` era o último uso do arquivo (nenhuma outra
  referência restou).

### Limitações conhecidas da validação

- **A suíte nova não protege o *call site*.** `DraftField.test.tsx` renderiza o componente isolado
  (decisão consciente: evita mockar Supabase, React Query, dnd-kit e Popover/Select). Consequência
  apontada na rodada 2: se `StagesEditor.tsx` voltasse a ligar o nome da etapa num `<Input>` com
  `onChange` direto, mantendo o `DraftField` no arquivo, os 8 casos continuariam verdes e o bug
  voltaria sem nenhum teste vermelho. O que cobre isso hoje é a checagem estática do diff
  (`StagesEditor.tsx:404` usa `onCommit`; o único `updateStage.mutate` do arquivo é o de L191,
  alcançado por blur/selects/numéricos). Um teste de `StagesEditor` com os hooks mockados fecharia
  a lacuna, mas seria um teste grande e não executável neste sandbox — ficou de fora de propósito,
  registrado como pendência.
- **Sem verificação dinâmica.** Nenhum probe de concorrência, limite de valor ou comportamento de
  teclado real foi possível; a lógica `dirty`/`server` foi conferida por traço manual dos caminhos
  (a-g na rodada 2), não por execução.

### Acceptance (do contrato)

- [x] Digitar no nome da etapa não dispara requisição por tecla — o `onChange` do campo só marca
      `dirty` e faz `setDraft`; a rede é chamada no blur (`DraftField.tsx:67-86`).
- [x] Valor continua sendo persistido ao sair do campo e recarregado do servidor
      (`DraftField.tsx:62-65`, `77-86`). **Não verificado em execução.**
- [ ] Typecheck + lint + testes — **NÃO EXECUTADO** neste sandbox (acima).

## Riscos e rollback

- **Edição não commitada se o campo nunca perder o foco.** Se o usuário digitar e sair da
  página/fechar a aba com o campo ainda focado, o texto não é salvo (antes, cada tecla já estava
  salva). O caminho normal de uso — clicar em outro campo, arrastar a etapa, trocar de pipeline,
  clicar no cabeçalho do Collapsible "Etapas" — passa por blur e persiste. Mudança de comportamento
  consciente, aceita pelo contrato ("persistindo em blur ou após debounce").
- **Abrir um Select/Popover ao lado não tira o foco do input.** Os triggers Radix fazem
  `preventDefault` no `pointerdown`, então clicar numa Select vizinha pode não disparar o blur do
  campo de nome (apontado pelo verificador). O rascunho continua guardado e é salvo no primeiro
  blur real; o efeito prático é o save chegar um pouco depois, não de ser perdido.
- **Sem rollback visual em erro de save.** Se o `UPDATE` falhar, o toast de erro continua
  aparecendo (`usePipelineStagesV2.ts:126`), mas o texto digitado permanece na tela até o próximo
  refetch/troca de pipeline; antes o campo voltava sozinho para o valor do servidor. Preferível a
  apagar o que o usuário escreveu, mas é uma diferença observável.
- **Enter agora tira o foco** do campo de uma linha (antes não fazia nada). Em `multiline` nada
  muda.
- **Re-focar e sair antes do refetch causa um *flicker* visual** (sintoma corrigido na descrição
  pela rodada 3): depois de commitar, o `server.current` só é atualizado quando o refetch traz o
  valor novo. Se o usuário re-focar e sair nesse intervalo, o ramo `!dirty` (`DraftField.tsx:79-84`)
  compara o rascunho com o `server.current` ainda antigo e **devolve o texto anterior à tela** — que
  se corrige sozinho quando o refetch chega. Não gera `UPDATE` a mais nem perde dado; é só um
  piscar. Não foi tratado porque exige estado extra para um caso de janela estreita.
- **Escala**: menos requisições por digitação (antes, ~1 escrita + ~1 recarga da lista por tecla).

Corrigido nesta versão (era risco e deixou de ser): *lost update* de campo focado (blur sem
digitação gravando texto velho por cima de valor novo do servidor) — ver a rodada 1, item 2, em
"Executado".

**Rollback**: reverter os três arquivos (`DraftField.tsx`, `DraftField.test.tsx` e
`StagesEditor.tsx`) para o commit base — não há migração, mudança de schema, env var nem edge
function envolvida.
