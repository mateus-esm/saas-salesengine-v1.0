# SE-FIX-001 — Lag por caractere ao digitar o nome da etapa (Pipelines → Config)

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-FIX-001 |
| Origem | Relato do usuário: na página **Pipelines → Config**, seção **Etapas**, digitar e apagar texto no nome da etapa é muito lento (lag por caractere) |
| Agentes | verboo (diagnóstico + fix, branch `fix/pipelines-config-typing-lag`) |
| Status | ✅ Fix implementado e documentos entregues · 🔎 revisão adversarial independente em 3 rodadas: **PARTIAL** (correto estaticamente; 9 apontamentos, 8 corrigidos e 1 registrado como limitação) · ⚠️ validação (`typecheck`/`lint`/`test`) **não executada** neste sandbox (sem `node_modules` e com `npm` bloqueado) |
| Artefatos | `contexto/spec.md` (contrato) · `verboo/diagnostico.md` · `verboo/fix.md` · este README |
| Pendências | Validação no ambiente com dependências (Pendência 1) · numéricos com commit por tecla fora do escopo (Pendência 2) · `settings.local.json` pré-modificado (Pendência 4) |

## O que foi encontrado

O `<Input>` do nome da etapa era **controlado pelo valor do servidor** (`value={stage.name}`) e o
`onChange` de cada tecla subia direto para `updateStage.mutate({ id: s.id, ...patch })`. Cada
mutation fazia um `UPDATE` em `pipeline_stages_v2` e um `invalidateQueries` da lista inteira de
etapas, sem nenhum update otimista — então **cada caractere custava uma escrita + uma releitura da
lista**, e a letra só aparecia na tela depois do round-trip. Encadeamento com `arquivo:linha` em
`verboo/diagnostico.md`.

Mesmo defeito existia em outros dois campos de texto da mesma linha: descrição e webhook do ciclo.

## O que foi corrigido

O texto digitado passou a viver em **estado local** do campo; a rede só é chamada **ao sair do
campo** (blur) e apenas se o texto mudou.

| Arquivo | Antes | Depois |
|---|---|---|
| `src/components/crm/pipeline-settings/DraftField.tsx` (**novo**) | — | Campo de texto com rascunho local: `setDraft` na digitação; no blur, só grava se o usuário **digitou** (refs `dirty`/`server`) e adota o valor novo do servidor se não digitou; ressincroniza fora de edição; `Enter` (uma linha) cai no mesmo commit |
| `.../pipeline-settings/StagesEditor.tsx:402-407` | `<Input value={stage.name} onChange={(e) => onChange({ name: e.target.value })} />` → 1 mutation por tecla | `DraftField` com `onCommit={(name) => onChange({ name })}` → 1 mutation ao sair do campo |
| `.../pipeline-settings/StagesEditor.tsx:594-602` | `<Textarea>` da descrição com commit por tecla | `DraftField multiline`, patch `description \|\| undefined` preservado |
| `.../pipeline-settings/StagesEditor.tsx:662-671` | `<Input>` do webhook do ciclo com commit por tecla | `DraftField`, patch `cycle_webhook_url \|\| null` preservado |
| `.../pipeline-settings/__tests__/DraftField.test.tsx` (**novo**) | — | 8 casos (digitar não chama `onCommit` e o blur chama uma vez com o texto final; blur sem mudança não chama; valor novo do servidor aparece fora de edição; refetch durante a digitação não apaga o rascunho; sair sem digitar não grava por cima de valor novo do servidor; digitar e voltar ao valor original não gera `UPDATE`; `Enter` sai do campo e o blur persiste; multiline persiste no blur) |

Intocados: `updateStage.mutate` no pai, drag-and-drop/reorder, criação/exclusão de etapa, selects
(`stage_type`, `funnel_event`, `cadence_unit`) e todos os campos numéricos. Detalhes, riscos e
rollback em `verboo/fix.md`.

## O que a revisão adversarial mudou

Um agente `verification` independente revisou o fix (leitura de código + o que o sandbox permitiu)
em **duas rodadas**. As duas terminaram em **PARTIAL** por um motivo que não é do código —
`tsc -b`, `eslint src`, `vitest run` e `vite build` não rodam neste sandbox.

**Rodada 1** — comportamento considerado correto estaticamente; três apontamentos, **todos
corrigidos**:

1. **Teste 4 era vazio** — o `rerender` passava o **mesmo** `value`, então o `useEffect` nem
   re-executava e o caso passava sem exercitar a guarda de edição. Corrigido (agora manda um valor
   diferente) e um caso novo foi acrescentado.
2. **Janela de *lost update*** — com o campo focado e um valor novo chegando do servidor (outra
   aba/usuário), um blur **sem digitação** gravava o texto velho por cima do novo. Corrigido com os
   refs `dirty`/`server`: só grava o que o usuário realmente digitou; se não digitou, adota o valor
   do servidor.
3. **Dúvida de tipo** em `React.HTMLInputTypeAttribute` (o gate de tipos do CI é `npx tsc -b`, e o
   verificador não pôde confirmar o alias sem `node_modules`). Trocado por
   `React.ComponentProps<"input">["type"]`, o mesmo alias que `src/components/ui/input.tsx:5` já usa.

**Rodada 2** — confirmou as três correções por leitura, não achou regressão estática nem caminho de
digitação que alcance a rede, e apontou três itens — **dois corrigidos e um registrado como
limitação**:

1. **`fireEvent.blur`/`focus` podem não chegar ao React** — o React 16 delegava `onFocus`/`onBlur`
   por `focus`/`blur` e o React 17+ passou a delegar por `focusin`/`focusout`; nenhuma suíte do repo
   usa esses eventos, então não havia precedente. Os helpers `focusField`/`blurField` agora
   constroem os eventos explicitamente e disparam os **dois** nomes de cada vez (em navegador real
   os dois saem no mesmo gesto, então o React registra o handler para só um deles — sem dupla
   chamada), cobrindo as duas estratégias de delegação.
2. **O teste do `DraftField` isolado não protege o *call site*** — se `StagesEditor.tsx` voltasse ao
   `<Input onChange={...}/>` mantendo o `DraftField`, os testes continuariam verdes. **Não
   corrigido**: exigiria um teste de `StagesEditor` com hooks mockados, grande e não executável
   aqui. Registrado como limitação e pendência 6.
3. **Ramo do `Enter` sem teste** — acrescentado o caso 7 (espiona `blur()` no elemento e confirma
   que o commit só acontece no blur).

**Rodada 3** — focada no arquivo de teste reescrito. Confirmou por análise estrutural que a tese
dos "dois nomes de evento" é sólida e **não depende** de qual nome o React 18 mapeia: evento
não-borbulhante (`bubbles: false`) só chega a listener de captura, e o componente só registra
`onFocus`/`onBlur` (sem as variantes `Capture`) — logo zero chamadas; `focusin`/`focusout` com
`bubbles: true` chegam ao listener de bolha e produzem **exatamente uma**. Confirmou ainda que
`vi.spyOn(el, "blur")` é interceptado e que os 8 casos exercitam ramos distintos e não-tautológicos.
Veredito **PARTIAL** pelos mesmos motivos ambientais, mais 3 defeitos de redação na documentação
(frases "todos tratados" e a contagem de casos) — **todos corrigidos**. Ressalvas registradas e não
alteradas: os casos 2 e 3 são asserções fracas isoladamente (não tautológicas, ganham valor em
conjunto com 1/4/6/7/8), e um *flicker* visual quando se re-foca e sai antes do refetch (auto-curável,
sem `UPDATE` extra nem perda de dado).

O verificador também confirmou, por leitura, que não há regressão em drag-and-drop, create/delete,
selects ou numéricos, e apontou dois detalhes que ficaram documentados como risco em
`verboo/fix.md`: abrir um Select/Popover vizinho não tira o foco do input (Radix faz
`preventDefault` no `pointerdown`), e re-focar/sair antes do refetch causa um *flicker* visual (o
rascunho volta ao valor antigo até o refetch chegar — auto-curável, sem `UPDATE` extra nem perda
de dado).

## Pendências

1. **Rodar a validação antes do merge** — `npm run typecheck` (`tsc -b`), `npm run lint`
   (`eslint src`) e `npm test` (`vitest run`) **não foram executados** neste sandbox: o worktree não
   tem `node_modules` (`ls node_modules` → `No such file or directory`) e as chamadas de `npm`
   foram bloqueadas por permissão do harness (o verificador confirmou que existe runtime `node`,
   mas `npm`/`node <script>`/`node -e` não rodam). Não há baseline de falhas porque não houve
   execução — nada aqui deve ser lido como "os testes passam". O teste novo
   (`DraftField.test.tsx`) também **não foi executado**. Note que o CI
   (`.github/workflows/ci.yml`) roda `npx tsc -b` e **não** roda o vitest.
2. **Campos numéricos continuam com commit por tecla** — `max_idle_hours`
   (`StagesEditor.tsx:487-499`), `max_interactions` (`:511-523`), `cadence_value` (`:536-548`) e
   `cycle_days` (`:615-627`) têm o mesmo problema de fundo, mas o parsing
   (`parsePositiveIntOrNull`) roda a cada tecla; aplicar rascunho local ali exige decidir o que
   fazer com texto inválido no blur. Fora do escopo deste fix (o relato é sobre o nome da etapa).
3. **Sem rollback visual em erro de save** — se o `UPDATE` falhar, o toast de erro continua
   aparecendo, mas o texto digitado permanece na tela até o próximo refetch/troca de pipeline (antes
   o campo voltava sozinho). E se o usuário sair da página com o campo ainda focado, o texto não é
   salvo (antes, cada tecla já estava salva). Ambos registrados em `verboo/fix.md` §Riscos.
4. **Arquivo fora do escopo já modificado no worktree** — `.claude/settings.local.json` estava
   alterado antes desta task (não é do fix e não foi tocado).
5. **Sem medição** — não houve reprodução no navegador nem profiler; a causa raiz é evidência
   estática de código (`arquivo:linha`), como descrito em `verboo/diagnostico.md`.
6. **A suíte nova não cobre o *call site*** — o `DraftField` é testado isolado (decisão consciente),
   então ela não falharia se o `StagesEditor` voltasse a gravar por tecla mantendo o `DraftField` no
   arquivo. Hoje quem cobre isso é a checagem estática do diff (o único `updateStage.mutate` do
   `StagesEditor` é o de `:191`, alcançado por blur/selects/numéricos). Um teste de `StagesEditor`
   com os hooks mockados fecharia a lacuna — ficou de fora por ser grande e não executável aqui.
7. **Ajuste possível no primeiro `npm test`** — os helpers de foco/blur foram escritos para
   funcionar com as duas estratégias de delegação do React (ver acima), mas isso **não pôde ser
   executado**. Se ainda assim a suíte ficar vermelha nos casos de blur, a causa provável é a
   delegação do evento, não a lógica do `DraftField`.

## Fora de escopo / regras respeitadas

Sem commit, sem push, sem PR. Nenhuma migration (nem leitura destrutiva), nenhuma alteração em
`supabase/functions/**`, nada tocado em `main`. Nenhuma credencial real citada (apenas
"env vars"/"secrets").
