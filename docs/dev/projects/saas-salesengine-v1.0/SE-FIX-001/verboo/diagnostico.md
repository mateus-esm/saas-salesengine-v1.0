# SE-FIX-001 — Diagnóstico: lag por caractere no nome da etapa

Projeto: saas-salesengine-v1.0 · Tarefa: SE-FIX-001 · Agente: verboo
Branch: `fix/pipelines-config-typing-lag` · Data: 2026-09-18

## Resumo

A suspeita do contrato foi **confirmada por leitura de código**: o campo de nome da etapa não tem
estado próprio. Ele é controlado pelo valor que veio do servidor (`value={stage.name}`) e cada
`onChange` de tecla sobe direto para uma mutation do React Query, que faz `UPDATE` no Supabase e
invalida o cache da lista inteira de etapas. Ou seja: **1 requisição de escrita + 1 recarga da lista
por caractere digitado**, e o caractere só passa a existir na tela quando o refetch volta.

Nada aqui foi medido com profiler (o app não roda neste sandbox) — a causa raiz abaixo é
encadeamento de código, com `arquivo:linha`.

## Encadeamento (input → onChange → mutate → refetch)

### 1. De onde vem o valor exibido

- `src/components/crm/pipeline-settings/StagesEditor.tsx:91-92` — `stages` vem do hook:
  `const { stages, isLoading, createStage, updateStage, deleteStage, reorderStages } = usePipelineStagesV2(pipelineId);`
- `src/hooks/usePipelineStagesV2.ts:72-87` — `useQuery` com
  `queryKey: ["pipeline_stages_v2", equipeId, pipelineId]`, `select("*")` em `pipeline_stages_v2`
  e `return ((data || []) as StageRow[]).map(normalize)` (L84).

O valor do input **é** o dado do cache do React Query. Não existe estado local de digitação.

### 2. Onde o input era ligado na rede (antes do fix)

- `src/components/crm/pipeline-settings/StagesEditor.tsx:399-403` (numeração do commit base; hoje
  o bloco equivalente começa em L402):

  ```tsx
  <Input
    value={stage.name}                                        // <- controlado pelo servidor
    onChange={(e) => onChange({ name: e.target.value })}      // <- 1 tecla = 1 patch
    className="flex-1 h-8 font-medium"
  />
  ```

- `src/components/crm/pipeline-settings/StagesEditor.tsx:191` — o `onChange` que o
  `SortableStageRow` recebe é o `updateStage.mutate`:

  ```tsx
  onChange={(patch) => updateStage.mutate({ id: s.id, ...patch })}
  ```

  (o `map` que cria as linhas está em L186-194, com `key={s.id}`).

### 3. O que cada tecla custa

- `src/hooks/usePipelineStagesV2.ts:118-127` — a mutation:

  ```ts
  const updateStage = useMutation({
    mutationFn: async ({ id, ...patch }: UpdateStageV2Data) => {
      const { error } = await sb.from(TABLE).update(patch).eq("id", id);   // L120: UPDATE no banco
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages_v2", equipeId, pipelineId] }); // L124
    },
    onError: (e: Error) => toast.error("Erro ao atualizar etapa: " + e.message),                // L126
  });
  ```

  Não há `onMutate`, `setQueryData` nem qualquer update otimista. O `invalidateQueries` (L124)
  descarta o cache e força a releitura de **todas** as etapas do pipeline (L72-87), não só do campo
  alterado.

### 4. Por que isso vira "lag por caractere" (e não só lentidão)

Como o input é controlado por `stage.name` e nada guarda o texto digitado:

1. o usuário aperta uma tecla → `onChange` → `mutate` → o React Query não tem valor novo para
   renderizar, então o input continua renderizando o texto **anterior**;
2. o `UPDATE` (L120) vai e volta pela rede;
3. o `invalidateQueries` (L124) refaz o `SELECT` da lista inteira;
4. só quando os dados chegam é que `stage.name` muda e a letra aparece.

Digitando rápido (ou apagando com backspace segurado), as teclas chegam antes do round-trip
anterior terminar: cada tecla é uma escrita em voo, o texto na tela fica "atrás" do teclado e as
recargas competem entre si. É a assinatura do bug relatado.

## Escopo do defeito

Mesmo padrão (valor do servidor como único estado, `onChange` → `mutate`) em outros campos de texto
da mesma linha:

| Campo | Antes do fix | Observação |
| --- | --- | --- |
| Nome da etapa | `StagesEditor.tsx:399-403` | campo relatado pelo usuário |
| Descrição | `StagesEditor.tsx:589-595` (hoje L594) | `<Textarea>` com commit por tecla |
| Webhook do ciclo | `StagesEditor.tsx:~655-664` (hoje L662) | `<Input>` com commit por tecla |

Campos **numéricos** têm a mesma característica, mas ficaram **fora do escopo** deste fix, porque
o parsing (`parsePositiveIntOrNull`) é aplicado a cada tecla e mudar isso alteraria a semântica de
digitação (`"1"` → `1`, campo vazio → `null`):

- `max_idle_hours` — `StagesEditor.tsx:487-499`
- `max_interactions` — `StagesEditor.tsx:511-523`
- `cadence_value` — `StagesEditor.tsx:536-548`
- `cycle_days` — `StagesEditor.tsx:615-627`

Selects (`stage_type`, `funnel_event`, `cadence_unit`) não sofrem do problema: um clique = uma
mudança de valor, sem digitação incremental. O input de nova etapa (`StagesEditor.tsx:201-206`) já
usava estado local (`newName`, L96) e nunca chamou rede por tecla — é o precedente interno do
padrão aplicado no fix.

## Hipóteses descartadas / não confirmadas

- **Rerender da lista inteira por tecla**: acontece (o `invalidateQueries` recria o array), mas é
  consequência do item 3, não uma causa independente. Não foi medido.
- **Custo de `dnd-kit`/`Popover`/`Select` no render**: não há evidência de que sejam o gargalo; a
  requisição por tecla é suficiente para explicar o relato.
- **Realtime no `pipeline_stages_v2`**: não foi verificado se existe subscription para essa tabela.

## Limite da evidência

O app não roda neste sandbox (sem `node_modules` e sem runtime JS disponível — ver
`fix.md`), então não houve medição de tempo, captura de rede nem reprodução no navegador. A
evidência é estática: leitura do encadeamento acima, arquivo:linha.
