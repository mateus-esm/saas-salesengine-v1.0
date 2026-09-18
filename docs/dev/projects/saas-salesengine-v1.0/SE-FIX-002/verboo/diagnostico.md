# SE-FIX-002 — Diagnóstico: a seção **Metas** como ela funciona hoje

Projeto: `saas-salesengine-v1.0` · Tarefa: `SE-FIX-002` · Agente: `verboo`
Branch: `fix/metas-section-conversion` · Data: 2026-09-18
Método: leitura de código e migrations no worktree. Nenhuma migration foi executada.
Nenhum comando de banco foi rodado — todas as afirmações sobre o banco vêm de leitura de DDL e
de `src/integrations/supabase/types.ts` (o types gerado), não de consulta ao ambiente.

Todas as referências `arquivo:linha` apontam para o estado **anterior** ao fix, exceto quando o
texto diz "depois do fix".

---

## 1. Onde a seção vive

| Peça | Caminho |
|---|---|
| Componente da seção | `src/components/crm/revenue/RevenueGoalsForm.tsx` (398 linhas) |
| Página que a hospeda | `src/pages/PipelineSettings.tsx` — import em `:65`, render dentro do `PipelineEditor` |
| Persistência | coluna JSON `pipelines.revenue_config` (lida em `RevenueGoalsForm.tsx:54-66`, escrita em `:142-145`) |
| Tipo da config | `src/types/pipelines.ts:10-17` (`RevenueConfig`) |
| RPC que a seção consome | `fn_stage_conversion_rates(uuid)` — `supabase/migrations/20260621002000_sprint67_stage_conversion.sql:2-42` |
| Outro consumidor do mesmo RPC **e do mesmo `conversion_overrides`** | `src/hooks/useForecast.ts:110`, `:114`, `:122-128` (forecast/placar do Kanban) |

O `revenue_config` guarda cinco chaves (`RevenueConfig` em `src/types/pipelines.ts:10-17`):
`goal_deals`, `goal_revenue`, `period`, `owner_goals`, `conversion_overrides`, além de
`hidden_scoreboard_metrics`. Não há tabela de metas: é um JSON numa linha de `pipelines`.

---

## 2. O que a tela faz hoje, bloco a bloco

### 2.1 Estado e ciclo de vida do rascunho

- `RevenueGoalsForm.tsx:27-33` — o rascunho do formulário: `{ goalDeals, goalRevenue, period, ownerGoals, overrides }`.
- `RevenueGoalsForm.tsx:48-49` — `useDraftAutosave("revenue_goals_" + pipelineId, EMPTY_DRAFT)`.
  O hook (`src/hooks/useDraftAutosave.ts:46-93`) grava em `localStorage` com o prefixo `draft_`
  (`:3`) e, no mount, **prefere o rascunho ao banco** (`:47-49`, `:58`).
- `RevenueGoalsForm.tsx:70-86` — o seed a partir do banco só acontece `if (config && !hasDraft ...)`.
  Ou seja: existindo rascunho, o valor salvo no banco não é lido para a tela. Comportamento
  intencional do hook, mas é o que permite um rascunho antigo "ganhar" do dado real.
- `RevenueGoalsForm.tsx:72-77` — `overrides[k] = String(v)` copia o valor do banco **cru**, sem
  conversão. Como o banco guarda a taxa em 0–1, o rascunho passa a carregar `"0.62"`.

### 2.2 Meta Principal (`RevenueGoalsForm.tsx:160-217`)

Três campos com rótulo, texto de apoio e placeholder: "Faturamento alvo (R$)" (`:169-178`),
"Negócios alvo" (`:183-193`), "Período" (`:198-214`). **Esta parte não tem o problema de
legenda** — os rótulos usam `<label>` puro (`:169`, `:184`, `:199`), não o `<Label>` do design
system, mas existem.

### 2.3 Divisão por Vendedor — o problema relatado (`RevenueGoalsForm.tsx:219-312`)

- Lista `profiles` da equipe via RPC `crm_team_members` (`:94-106`) — comentário em `:91-93`
  explica que `profiles` não tem coluna `name` e a RLS só mostra a própria linha, por isso o RPC.
- Cada linha (`:237-295`) tem: um `Select` de vendedor com placeholder
  `"Selecione o vendedor"` (`:248`), um `Input` numérico com placeholder `"Deals"` (`:272`) e
  outro com placeholder `"R$"` (`:283`). **Nenhum dos dois inputs tem rótulo, legenda, `id`,
  `aria-label` ou cabeçalho de coluna.** O placeholder é a única pista do que o campo significa —
  e ele desaparece assim que o usuário digita.
- Não existe linha de cabeçalho de tabela em lugar nenhum do bloco (`:236-296`).
- Duas validações de coerência já existem: `:226-235` avisam quando a soma por vendedor não bate
  com a meta principal.
- `:305-310` mostra o total distribuído.

**Diagnóstico do item 1 do relato: confirmado, e a causa é exatamente ausência de rótulo.**

### 2.4 Taxas de conversão e o preview (`RevenueGoalsForm.tsx:314-390`)

Card "Taxas de Conversão (opcional)" (`:314-362`):

- Lê o histórico por RPC (`:109-117`): `fn_stage_conversion_rates` → `{stage_id, stage_name, conversion_rate}`.
- `:328-332` mistura duas coisas: o valor efetivo (`overrideVal` quando existe, senão
  `conversion_rate` do banco) e o mostra em % ao lado do nome da etapa.
- `:341-352` — o input edita um número **em 0–1**, `min={0} max={1} step={0.01}`, com placeholder
  `"Taxa (0–1)"`. O usuário vê "62%" na linha e precisa digitar `0.62` na mesma linha. Sem
  rótulo (só placeholder), sem sufixo `%`, sem indicar se o valor é a taxa observada ou a meta.
- `:322-326` — o texto de ajuda enquadra o campo como **substituição opcional do histórico**
  ("Substitua a taxa histórica por um valor manual"). Esse é o modelo antigo.

Card "Projeção" (`:364-390`):

- `:373-376` promete: "Com sua taxa atual de conversão, atingir N negócios fechados exige aproximadamente:".
- `:381` — a conta é `Math.round(goalDealsNum / rates[rates.length - 1].conversion_rate)`.

**Este é o defeito de fundo do item 2 do relato.** Três problemas somados, e um quarto que
degenera em `Infinity`:

1. **Usa só a ÚLTIMA etapa, não o produto das taxas.** Um funil de 4 etapas a 50% tem conversão
   de 6,25%; a conta antiga dividiria por 50% e mostraria 20 leads em vez de 160 — subestimando a
   necessidade de topo em 8×.
2. **A "última etapa" é uma etapa terminal.** `fn_stage_conversion_rates` seleciona de
   `pipeline_stages_v2` **sem filtrar `stage_type`** (`20260621002000_sprint67_stage_conversion.sql:28`),
   devolvendo também Ganho/Perdido. As etapas terminais ocupam as **últimas posições**: o
   `crm_add_milestone_stages` insere os marcos "antes do ganho/perda"
   (`20260912000800_sprint11_w3_natures.sql:16-17`) e as fixtures dos testes do próprio repo põem
   'Ganho'/'Perdido' nas posições mais altas (ex.: `supabase/tests/sprint11_w2_owner_events.test.sql:62-63`,
   `supabase/tests/sprint9_w1_funnel_events.test.sql:32-33`). Logo, `rates[rates.length-1]` era,
   na prática, a taxa de **Perdido** — um número que não tem relação com a conversão do funil.
   *(A ordem exata posição-a-posição é dado de cada tenant; o que a evidência sustenta é que a
   última posição é ocupada por etapa terminal no desenho e nas fixtures do repo.)*
3. **A conversão do funil inteiro não aparece em lugar nenhum**, e as etapas terminais aparecem
   na lista de taxas como se fossem etapas de passagem — o usuário via "Perdido 0%" na lista sem
   nada explicando que aquilo não é uma etapa de passagem.
4. **Divisão por zero.** A taxa de Perdido é `advanced/entered` (`20260621002000:24-27`):
   `entered` conta negócios que **entraram** em Perdido (não é zero em nenhum tenant que já perdeu
   um negócio) e `advanced` conta os que **saíram** de Perdido. Negócio perdido não costuma sair
   de Perdido, então `advanced = 0` e a taxa fica `0.0000`. Com isso,
   `Math.round(goalDealsNum / 0)` → `Infinity`, e `:381` renderiza literalmente **"Infinity leads
   no topo do funil"**. A condição é "existir ao menos um negócio que já entrou em Perdido e
   nenhum que tenha saído dele" — situação normal, não caso extremo. *(Inferência a partir do DDL,
   não medida no ambiente: não pude rodar a query. Ver §6.)*

Também em `:385` há um rótulo errado: o valor `goalRevenueNum / goalDealsNum` é o **ticket médio**,
mas o texto diz "Meta mensal: R$ X por negócio".

Observação sobre o card de taxas: `:330-332` já mostrava o valor em % ao lado do nome da etapa
(`displayVal`), mas o `Input` logo abaixo (`:341-352`) pedia o número **em 0–1**. A incoerência é
literal: "62%" na linha, `0.62` no campo.

### 2.5 O que a tela NÃO mostra hoje

- Não há meta de passagem por etapa: `conversion_overrides` é um desvio sobre o histórico, não uma
  meta declarada.
- Não há entradas de leads derivadas de forma correta no topo (só a conta quebrada de `:381`).
- Não há reuniões e não há fechamentos realizados no período.
- Não há SLA por etapa, nem declarado nem observado.
- O lead time de vendas não é mencionado.

---

## 3. O modelo de dados que já existe (o que dá para usar sem inventar)

### 3.1 `fn_stage_conversion_rates(uuid)` — o RPC atual

`supabase/migrations/20260621002000_sprint67_stage_conversion.sql:2-42`.
Retorna `(stage_id, stage_name, stage_position, conversion_rate)`; taxa = `advanced/entered`,
`1.0` quando não há histórico (`:24-27`); `entered` conta `opportunity_stage_history` por
`to_stage_id` (`:29-33`) e `advanced` por `from_stage_id` (`:34-38`).

Três limitações relevantes:

1. **Sem `stage_type`.** O `SELECT` (`:20-40`) não devolve o tipo da etapa, então o front não
   consegue separar passagem de terminal. É a raiz do defeito de `:381`.
2. **Sem `funnel_event`.** Não dá para saber qual etapa é "reunião feita".
3. **Escopo de equipe resolvido e não aplicado (código morto).** `v_equipe_id` é selecionado em
   `:11-13` e **nunca usado** — as duas `LATERAL` (`:29-38`) contam sem filtro de equipe.

   **Correção de uma afirmação minha, importante para não superdimensionar:** eu escrevi na
   primeira versão deste documento que isso era um "vazamento cross-tenant". A verificação
   adversarial apontou, e eu confirmei no código, que **não é**. Dois motivos:
   - a junção `osh.to_stage_id = s.id` / `osh.from_stage_id = s.id` já amarra a contagem a **uma**
     etapa, e etapa pertence a uma única equipe — na prática o resultado já era o da equipe da
     linha;
   - `opportunity_stage_history` tem **RLS habilitada** com policy de `SELECT` por equipe
     (`supabase/migrations/20260419110000_epic2_pipelines.sql:225`, `:264-267`), que recorta o
     caminho autenticado.

   O que resta é **código morto e recorte implícito** — uma armadilha para quem chamar com
   `service_role` (que ignora RLS) ou para quem mexer na query depois, não um vazamento
   demonstrado. O fix torna o recorte explícito (ver `fix.md` §2.2); é endurecimento, não
   correção de privacidade.

### 3.2 `pipeline_stages_v2` — o que a etapa já sabe

Colunas confirmadas em `src/integrations/supabase/types.ts:4050-4071`: `id`, `pipeline_id`,
`equipe_id`, `name`, `position`, `stage_type`, `funnel_event`, `max_idle_hours`,
`max_interactions`, `cadence_value`, `cadence_unit`, `cycle_days`, `color`, `description`,
`deleted_at`.

- `stage_type` ∈ `open | won | lost | ciclo` — `src/components/crm/pipeline-settings/StagesEditor.tsx:68-73`.
- `funnel_event` ∈ `qualified, proposal_sent, meeting_scheduled, meeting_done, no_show,
  contract_sent, contract_signed` — `supabase/migrations/20260912000800_sprint11_w3_natures.sql:26-30`.
  `won`/`lost` são **proibidos** nesta coluna de propósito, porque o `stage_type` já cobre os
  terminais — `supabase/migrations/20260830000300_sprint9_funnel_events.sql:46-52`.
- `max_idle_hours` é o **SLA declarado** da etapa, em horas, `NULL` = sem limite —
  `supabase/migrations/20260525000000_sprint5_1_stage_sla.sql:5-10`.

Ou seja: **SLA por etapa já tem casa no banco.** O que faltava era ler.

### 3.3 `funnel_events` + `get_funnel_overview` — o tracking que já existe

`funnel_events` é a base de eventos do Sprint 9 (`supabase/migrations/20260830000300_sprint9_funnel_events.sql:180-222`):
`event` ∈ `qualified, proposal_sent, meeting_scheduled, meeting_done, no_show, won, lost`
(`:189-192`), com `occurred_at`, `pipeline_id`, `opportunity_id`, `lead_id`, `stage_id`, `source`
(`:183-197`). É escrita por três triggers — mudança de etapa (`:291-331`), criação do negócio
(`:342-375`), mudança de status para won/lost (`:381-418`) — e por RPC manual
`record_funnel_event` (`:435-484`). Tem RLS de leitura por equipe (`:263-268`) e índices por
`(equipe_id, pipeline_id, event, occurred_at desc)` (`:237-250`).

O RPC de leitura `get_funnel_overview(p_from, p_to, p_pipeline_ids, p_responsible_ids, p_channels)`
devolve, entre outros: `new_leads`, `meetings_scheduled`, `meetings_done`, `no_shows`,
`deals_won`, `deals_lost`, `show_rate`, `no_show_rate`, `win_rate`, `lead_to_won_rate`,
`avg_cycle_days` — definido em
`supabase/migrations/20260912000600_sprint11_w3_revenue_metrics.sql:114-159`; o tipo do front é
`FunnelOverview` em `src/types/dashboard.ts:11-34`; e já é consumido pelo dashboard em
`src/hooks/useDashboardV2.ts:68`.

**Conclusão do item 4 do relato: o dado de reuniões realizadas e negócios fechados JÁ EXISTE.**
Não é preciso tabela nova. O que é preciso é: (a) a etapa estar mapeada como `meeting_done`, senão
o evento não nasce; (b) a tela ler o RPC. Nada de `create table`.

### 3.4 `leads.meeting_*` — fonte legada, não usada

`leads` tem `meeting_date`, `meeting_done`, `meeting_notes`, `meeting_scheduled`, `no_show` —
`src/integrations/supabase/types.ts:2387-2393`. É a fonte do modelo antigo (pré-Sprint 4), e o
Sprint 4 marcou esse caminho como substituído por `opportunities`
(`supabase/migrations/20260421000000_sprint4_epic0_cutover.sql:75-76` marca
`leads.stage_entered_at` como `DEPRECATED Sprint 4. Use opportunities.stage_entered_at`).
**Não usada no fix**, e citada aqui só para registrar que existe e foi descartada por decisão —
não por desconhecimento.

### 3.5 `agenda_events` — agenda, não realização

`supabase/migrations/20260621004000_sprint67_agenda_events.sql:2-14`: `id`, `equipe_id`, `title`,
`type` (`meeting|compromisso|block`), `starts_at`, `ends_at`, `task_id`, `lead_id`, `notes`,
`created_at`, `deleted_at`. **Não existe coluna de desfecho** (nem `status`, nem `realizada`, nem
`no_show`) e não há `pipeline_id` nem `opportunity_id`.

Portanto `agenda_events` registra **agendamento**, não realização. Não serve como fonte de
"reuniões realizadas".

### 3.6 `opportunity_stage_history` — tempo por etapa é derivável

Colunas: `id`, `equipe_id`, `opportunity_id`, `from_stage_id`, `to_stage_id`, `changed_at`,
`changed_by`, `changed_by_type`, `actor` (`src/integrations/supabase/types.ts:3678-3689`).

O tempo de permanência numa etapa é a diferença entre `changed_at` de duas linhas consecutivas do
mesmo `opportunity_id`. As matérias-primas existem; **nenhum RPC do repo calculava isso** (busca
por `time_in_stage`/`avg_days_in_stage`/`velocity_days` em `supabase/migrations/` encontra apenas
`avg_velocity_days` em `20260911000300_sprint11_w2_owner_events.sql:898` e
`20260912000600_sprint11_w3_revenue_metrics.sql`, que é o **ciclo do ganho** — `closed_at` menos
`created_at` — e não o tempo por etapa).

O SLA declarado (`max_idle_hours`) já existe, mas **não havia nenhuma leitura agregada de tempo
real por etapa** para comparar com ele. Daí o RPC novo (ver `fix.md` §2).

---

## 4. O que falta — lista fechada

| # | Falta | Evidência | Gravidade |
|---|---|---|---|
| 1 | Rótulo/legenda nos dois inputs da divisão por vendedor | `RevenueGoalsForm.tsx:272`, `:283` | Alta — é o item 1 do relato |
| 2 | Rótulo na taxa de conversão, e unidade em % em vez de 0–1 | `RevenueGoalsForm.tsx:341-352` | Alta |
| 3 | Cálculo do topo do funil usa 1 etapa em vez do produto; e usa etapa terminal | `RevenueGoalsForm.tsx:381` + `20260621002000:28` | Alta — número errado |
| 4 | Modelo de meta de passagem por etapa (o histórico é sugestão, não lei) | `RevenueGoalsForm.tsx:322-326` | Alta — é o item 2 do relato |
| 5 | Exibir a cadeia entradas → taxa → reuniões → fechamentos | ausente | Alta — é o item 3 do relato |
| 6 | SLA por etapa (declarado e observado) | `max_idle_hours` existe, nada lê | Média |
| 7 | Lead time de vendas (alvo e observado) | ausente | Média |
| 8 | Realizado do período: reuniões e fechamentos | `get_funnel_overview` existe, a tela não chama | Média |
| 9 | `fn_stage_conversion_rates` com escopo de equipe resolvido e não aplicado (código morto; **não** é vazamento — ver §3.1) | `20260621002000:11-13`, `:29-38` | Baixa |
| 10 | Rótulo errado: chama ticket médio de "meta mensal por negócio" | `RevenueGoalsForm.tsx:385` | Baixa |
| 11 | Rótulos da Meta Principal usam `<label>` cru, não `<Label>` | `RevenueGoalsForm.tsx:169`, `:184`, `:199` | Baixa |
| 12 | Sem `stage_type`/`funnel_event`/SLA no RPC de taxa | `20260621002000:2-3` | Alta (bloqueia 3, 5, 6) |
| 13 | **Fora do escopo, achado no caminho:** o forecast do Kanban tem o mesmo defeito de `:381` — multiplica a taxa das etapas **terminais** | `src/hooks/useForecast.ts:144-147` (produto de todas as taxas, inclusive Ganho/Perdido) | Alta → **PEND-004** |
| 14 | **Fora do escopo, achado no caminho:** `proposals_needed`/`meetings_needed`/`touchpoints_needed` são derivados por **índice fixo** (etapa 1, 2, 3), presumindo um funil de 4 etapas | `src/hooks/useForecast.ts:157-173` | Média → **PEND-004** |
| 15 | Metas usa `Math.ceil` (não dá para ter meio lead) e o forecast usa `Math.round` — os dois números podem divergir em 1 | `src/lib/revenuePlan.ts` vs `src/hooks/useForecast.ts:147` | Baixa → **PEND-005** |

---

## 5. Evidência negativa — o que NÃO existe (para não ser "inventado" depois)

| Procurado | Resultado | Onde procurei |
|---|---|---|
| Tabela/RPC de SLA médio por etapa | **Não existe** | busca por `time_in_stage`, `avg_days_in_stage`, `velocity_days`, `sla` em `supabase/migrations/*.sql` |
| Coluna de desfecho em `agenda_events` | **Não existe** | `20260621004000_sprint67_agenda_events.sql:2-14` (leitura integral) |
| Teste automatizado da seção Metas | **Não existe** | `src/**/*.{test,spec}.{ts,tsx}` — nenhum cobre `RevenueGoalsForm` |
| Tabela própria de metas | **Não existe** — é o JSON `pipelines.revenue_config` | `src/integrations/supabase/types.ts:4187` (coluna `revenue_config: Json`) |

**Correção de uma suposição minha, registrada para não virar erro depois:** eu esperava que
`conversion_overrides` tivesse um único consumidor. **Tem dois.** `src/hooks/useForecast.ts:110`
lê o mesmo `config.conversion_overrides` e aplica a mesma regra em `:122-128` ("se o `stage_id`
está em `overrides`, usa o valor digitado e marca `source: "manual"`; senão usa
`r.conversion_rate` e marca `"history"`").

Isso **não é um conflito** — é o contrário: o backend já tratava `conversion_overrides` como
"meta declarada que vence o histórico". O modelo que o usuário pediu já existia no cálculo; o que
não existia era a tela que o expressasse. Ver `fix.md` §3.1.

Dois consumidores do mesmo JSON fora da seção Metas: `useForecast.ts:93-111` e
`src/components/crm/revenue/PipelineScoreboard.tsx:23-24`, `:66`, `:81` (este lê só
`hidden_scoreboard_metrics`, não `conversion_overrides`).

Ressalvas de honestidade:

- A varredura de `supabase/migrations/` foi por **grep dirigido** a termos concretos, não por
  leitura das 170 migrations. Um RPC com nome criativo pode ter escapado. O que sustenta a
  conclusão é que os nomes convencionais do domínio foram procurados e o `types.ts` gerado tem as
  entradas `fn_stage_conversion_rates` (`:6118`), `get_funnel_breakdown`, `get_funnel_map_status`,
  `get_funnel_overview`, `get_funnel_series`, `get_loss_reasons`, `get_top_opportunities`
  (`:6148-6198`) — e nenhuma de SLA por etapa. *(O `types.ts` é gerado e atrasa em relação ao
  banco: `crm_placar`, usado em `useForecast.ts:134`, por exemplo, não aparece nele. Por isso a
  ausência no `types.ts` é indício, e a evidência forte é o grep nas migrations.)*
- **Hipótese não verificada:** não consegui executar nada contra o banco para confirmar o formato
  dos dados reais (o sandbox nega `npm`/`deno`/`node` e não tem `node_modules`). Tudo aqui é
  leitura de DDL. Ver §6.

---

## 6. Baseline de validação

Comandos executados neste worktree, com o resultado exato:

```
$ ls -d node_modules
(NO_NODE_MODULES)            # não existe node_modules

$ which node npm npx bun deno tsc eslint
(exit 1, sem saída)          # nenhum runner de JS está no PATH

$ npm run typecheck
(bloqueado: "This command requires approval")
```

**Typecheck: NÃO EXECUTADO. Lint: NÃO EXECUTADO. Testes (vitest): NÃO EXECUTADO.**

Motivo: sem `node_modules` e sem runner de JS no PATH — as dependências não estão instaladas
neste worktree, e os comandos de `npm` são negados pelo sandbox. Isto **não** é uma declaração de
que o código compila ou que os testes passam: é a ausência de medição. Não há baseline numérico
para comparar. Ver a seção de validação em `fix.md` §5 para o que foi feito no lugar (revisão
manual dirigida + testes unitários escritos mas não executados) e para a pendência nomeada.
