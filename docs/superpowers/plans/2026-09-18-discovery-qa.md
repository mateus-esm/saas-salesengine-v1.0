# Discovery Q&A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every onboarding a 23-question discovery form the client fills before the implementation meeting, so the meeting is decision instead of transcription.

**Architecture:** The question bank lives in Postgres (`discovery_questions`), seeded and editable without deploy. Answers live in `onboarding_discovery`, one row per onboarding, reached through a public tokenized link `/discovery/:token`. The edge function `public-discovery` reads and writes with the service role and never lets `anon` touch a table; every validation happens in SQL against the bank. The client can also export the bank as JSON, answer it with their own AI, and paste it back — always as a draft a human confirms.

**Tech Stack:** Postgres/Supabase (migrations + security-definer RPCs), Deno edge functions, React 18 + Vite + TypeScript, TanStack Query, shadcn/ui + Tailwind, Vitest (frontend), `deno test` (edge shared modules).

**Spec:** `Planning/Sprints/sprint_8.2_onboarding.md`, section `# 🏳️ discovery_q&a`

## Running SQL against the linked database

Two tools, and the choice is not cosmetic:

- **Plain queries** → `npx supabase db query --linked "<sql>"`. (The subcommand is `db query`, not `db execute`.)
- **Anything with a `DO $$ … $$` block** → `psql`. The `db query` endpoint appends its own trailing comment to the statement and breaks dollar-quoting, failing with `42601: unterminated dollar-quoted string`. Every exception-handling test in this plan is a DO block, so they all go through `psql`:

```bash
export PGPASSWORD=$(grep '^SUPABASE_DB_PASSWORD=' .env | cut -d= -f2- | tr -d '"'"'"'\r')
psql "$(cat supabase/.temp/pooler-url)" -f <file.sql>
```

Write the DO block to a file in the scratchpad first — passing it inline invites the shell to chew on `$$`.

## Global Constraints

- **Brand:** client-facing text says `BRAND.product` = `"Solo Rev"` (software) and `BRAND.company` = `"Solo Ventures"` (invoicing). Never the old engineering name — `src/__tests__/brand-consistency.test.ts` fails on it, including inside comments.
- **Language:** all code comments, SQL comments, commit messages and client-facing copy in **Portuguese**, matching the repo.
- **Tone rule (from `20260902000300`):** *"Um pedido só por mensagem."* The welcome message asks for the discovery and nothing else.
- **Token format:** 64 lowercase hex chars (32 bytes), stored as **sha256 hash**, plaintext returned exactly once at generation. Same as `custom_record_form_links`.
- **Public endpoint rule:** `verify_jwt = false`, service role reads, `anon` has no grant on any discovery table, all validation in the RPC. The browser is never the defense.
- **Migrations:** filename `supabase/migrations/2026MMDD00NN00_sprint82_<slug>.sql`, idempotent (`if not exists`, `on conflict do update`). Never run `db push --include-all`.
- **Frontend tests:** `npm test` (vitest). **Edge tests:** `deno test --allow-none supabase/functions/_shared/<file>.test.ts`.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260918000100_sprint82_discovery_bank.sql` | `discovery_questions` table + seed of the 23 base questions + 2 niche questions |
| `supabase/migrations/20260918000200_sprint82_discovery_record.sql` | `onboarding_discovery` table, `_discovery_has_answer`, `_discovery_progress` |
| `supabase/migrations/20260918000300_sprint82_discovery_rpcs.sql` | `_discovery_ensure_link`, `_discovery_get`, `_discovery_save`, `_discovery_submit` |
| `supabase/migrations/20260918000400_sprint82_discovery_welcome.sql` | `onboarding.welcome` rewritten to one ask; new `onboarding.discovery_done` |
| `supabase/functions/_shared/public-discovery.ts` | Pure request parsing + DB-error→HTTP mapping (Deno-testable) |
| `supabase/functions/_shared/public-discovery.test.ts` | Deno tests for the above |
| `supabase/functions/public-discovery/index.ts` | The endpoint: service-role client, dispatch to the three RPCs, notify on submit |
| `supabase/functions/admin-discovery-link/index.ts` | Authed (super admin) link generator — the browser cannot reach the service-role RPC |
| `src/lib/discovery/types.ts` | `DiscoveryQuestion`, `DiscoveryAnswers`, `DiscoveryBlock` |
| `src/lib/discovery/evaluate.ts` | `hasAnswer`, `groupIntoBlocks`, `evaluateDiscovery` |
| `src/lib/discovery/jsonRoundTrip.ts` | `buildQuestionExport`, `parseAnswerImport` |
| `src/lib/discovery/briefing.ts` | `buildBriefing` — answers grouped by `maps_to` into agent text + setup checklist |
| `src/lib/discovery/__tests__/*.test.ts` | Vitest for all four pure modules |
| `src/hooks/usePublicDiscovery.ts` | TanStack Query wrapper over the edge function (public page) |
| `src/hooks/useDiscoveryAdmin.ts` | Admin-side read + ensure-link mutation |
| `src/pages/PublicDiscovery.tsx` | The form: 6 blocks, autosave, JSON doors, success screen |
| `src/components/discovery/QuestionField.tsx` | One question → one control, by `type` |
| `src/components/discovery/JsonDoors.tsx` | Copy-questions / paste-answers dialogs |
| `src/components/discovery/__tests__/QuestionField.test.tsx` | Vitest for the field component |
| `src/components/admin/onboarding/DiscoveryPanel.tsx` | The admin sheet's Discovery section |
| `src/App.tsx` | Route `/discovery/:token` outside `ProtectedRoute` |
| `supabase/config.toml` | `[functions.public-discovery] verify_jwt = false` |

---

### Task 1 (T70): The question bank table and its seed

**Files:**
- Create: `supabase/migrations/20260918000100_sprint82_discovery_bank.sql`

**Interfaces:**
- Consumes: `public.niches(id)` (existing registry)
- Produces: table `public.discovery_questions` with columns `code, block, block_label, sort_order, label, help, type, options, default_value, required, maps_to, niche_id, max_select, active`. `type` ∈ `text|textarea|select|select_other|multi`. `maps_to` ∈ `agent|crm|channels|team`.

- [ ] **Step 1: Write the migration**

```sql
-- Sprint 8.2 · discovery_q&a · T70 — o banco de perguntas do discovery.
--
-- Mora no banco, e não em TypeScript, porque o formulário é Vite e a validação
-- é Deno: em código, o banco de perguntas teria duas cópias, e duas cópias
-- significam o formulário perguntar uma coisa enquanto a validação cobra outra.
-- Aqui é uma cópia só — e o texto de uma pergunta pode ser afinado sem deploy,
-- como já acontece com os templates de notificação.
--
-- `maps_to` é o que transforma resposta em configuração depois (T79): diz se a
-- pergunta sustenta o agente, o CRM, os canais ou o time.
-- `niche_id` nulo = pergunta de todo mundo; preenchido = só daquele segmento.

create table if not exists public.discovery_questions (
  code          text primary key,
  block         text not null,
  block_label   text not null,
  sort_order    int  not null,
  label         text not null,
  help          text,
  type          text not null check (type in ('text','textarea','select','select_other','multi')),
  -- [{ "value": "padrao", "label": "Novo lead → Em contato → ..." }]
  options       jsonb not null default '[]'::jsonb,
  default_value jsonb,
  required      boolean not null default false,
  maps_to       text not null check (maps_to in ('agent','crm','channels','team')),
  niche_id      text references public.niches(id) on delete cascade,
  max_select    int,
  active        boolean not null default true
);

create index if not exists idx_discovery_questions_order
  on public.discovery_questions (sort_order) where active;

alter table public.discovery_questions enable row level security;

-- O painel admin lê o banco de perguntas para mostrar as respostas com o texto
-- da pergunta. O público NÃO lê daqui: passa pela edge function.
drop policy if exists discovery_questions_read on public.discovery_questions;
create policy discovery_questions_read on public.discovery_questions
  for select to authenticated using (active);
-- Sem política de escrita: só o service_role semeia e edita.

insert into public.discovery_questions
  (code, block, block_label, sort_order, label, help, type, options, default_value, required, maps_to, max_select)
values
-- ── 1 · A empresa e a oferta ────────────────────────────────────────────────
('empresa.o_que_vende','empresa','A empresa e a oferta',10,
 'Em uma frase: o que a sua empresa vende, e para quem?',
 'É a primeira coisa que o agente vai saber sobre vocês.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('oferta.itens','empresa','A empresa e a oferta',20,
 'Liste seus produtos ou serviços, com preço ou faixa de preço.',
 'Um por linha. Se o preço varia, escreva a faixa — o agente só pode falar o que você escrever aqui.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('oferta.diferencial','empresa','A empresa e a oferta',30,
 'Por que o cliente escolhe vocês, e não o concorrente?',
 null,'textarea','[]'::jsonb,null,true,'agent',null),
('oferta.materiais','empresa','A empresa e a oferta',40,
 'Links de site, catálogo, apresentação ou FAQ.',
 'Opcional. Tudo que você colar aqui vira material de treino do agente.',
 'textarea','[]'::jsonb,null,false,'agent',null),

-- ── 2 · Quem é cliente (e quem não é) ───────────────────────────────────────
('cliente.ideal','cliente','Quem é cliente (e quem não é)',50,
 'Descreva o seu cliente ideal.',
 'Perfil, região, momento e a dor que ele tem quando procura vocês.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('cliente.nao_e','cliente','Quem é cliente (e quem não é)',60,
 'Quem vocês NÃO atendem? Que pedidos estão fora do escopo?',
 'Isso evita que o agente prometa o que vocês não entregam.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('cliente.qualificacao','cliente','Quem é cliente (e quem não é)',70,
 'O que você precisa saber de um lead antes de passar para um vendedor?',
 'As perguntas que o seu melhor vendedor faz antes de investir tempo.',
 'textarea','[]'::jsonb,null,true,'agent',null),

-- ── 3 · Como vende hoje ─────────────────────────────────────────────────────
('funil.etapas','funil','Como vende hoje',80,
 'Qual desses funis mais parece com o seu?',
 'Escolha o mais próximo — a gente ajusta na reunião.',
 'select_other',
 '[{"value":"padrao","label":"Novo lead → Em contato → Qualificado → Proposta enviada → Ganho / Perdido"},
   {"value":"com_reuniao","label":"Novo lead → Em contato → Reunião/Visita → Proposta → Negociação → Ganho / Perdido"},
   {"value":"curto","label":"Novo lead → Qualificado → Ganho / Perdido"}]'::jsonb,
 '"padrao"'::jsonb,true,'crm',null),
('funil.motivos_perda','funil','Como vende hoje',90,
 'Quando vocês perdem uma venda, costuma ser por quê?',
 'Já marcamos os motivos mais comuns. Desmarque o que não se aplica.',
 'multi',
 '[{"value":"preco","label":"Preço"},{"value":"sem_retorno","label":"Sumiu / não respondeu"},
   {"value":"concorrente","label":"Fechou com concorrente"},{"value":"fora_perfil","label":"Fora do perfil"},
   {"value":"sem_orcamento","label":"Sem orçamento"},{"value":"adiou","label":"Adiou a decisão"}]'::jsonb,
 '["preco","sem_retorno","concorrente","fora_perfil","sem_orcamento","adiou"]'::jsonb,true,'crm',null),
('funil.origens','funil','Como vende hoje',100,
 'De onde chegam seus leads hoje?',
 null,'multi',
 '[{"value":"whatsapp","label":"WhatsApp"},{"value":"instagram","label":"Instagram"},
   {"value":"meta_ads","label":"Anúncios Meta"},{"value":"google","label":"Google"},
   {"value":"indicacao","label":"Indicação"},{"value":"site","label":"Site"},
   {"value":"lista","label":"Lista / prospecção ativa"}]'::jsonb,
 '["whatsapp","instagram","meta_ads","indicacao","site"]'::jsonb,true,'crm',null),
('funil.ticket','funil','Como vende hoje',110,
 'Qual o ticket médio de uma venda?',
 null,'select',
 '[{"value":"ate_1k","label":"Até R$ 1 mil"},{"value":"1_5k","label":"R$ 1 mil a R$ 5 mil"},
   {"value":"5_20k","label":"R$ 5 mil a R$ 20 mil"},{"value":"20_100k","label":"R$ 20 mil a R$ 100 mil"},
   {"value":"acima_100k","label":"Acima de R$ 100 mil"},{"value":"varia","label":"Varia muito"}]'::jsonb,
 null,true,'crm',null),

-- ── 4 · O agente ────────────────────────────────────────────────────────────
('agente.nome','agente','O agente',120,
 'Como o agente vai se chamar?',
 'Um nome de gente funciona melhor que "Atendimento".',
 'text','[]'::jsonb,null,true,'agent',null),
('agente.objetivo','agente','O agente',130,
 'O que o agente precisa conseguir em cada conversa?',
 null,'select',
 '[{"value":"qualificar_agendar","label":"Qualificar e agendar uma reunião"},
   {"value":"qualificar_passar","label":"Qualificar e passar para um vendedor"},
   {"value":"vender_direto","label":"Tirar dúvidas e vender direto"},
   {"value":"suporte","label":"Atender quem já é cliente (suporte)"}]'::jsonb,
 '"qualificar_agendar"'::jsonb,true,'agent',null),
('agente.tom','agente','O agente',140,
 'Como ele deve soar? Escolha até 3.',
 null,'multi',
 '[{"value":"consultivo","label":"Consultivo"},{"value":"direto","label":"Direto"},
   {"value":"cordial","label":"Cordial"},{"value":"informal","label":"Informal"},
   {"value":"tecnico","label":"Técnico"},{"value":"entusiasmado","label":"Entusiasmado"},
   {"value":"formal","label":"Formal"}]'::jsonb,
 '["consultivo","direto","cordial"]'::jsonb,true,'agent',3),
('agente.objecoes','agente','O agente',150,
 'As 3 objeções que vocês mais ouvem — e como o seu melhor vendedor responde a cada uma.',
 'Esta é a resposta que mais muda a qualidade do agente. Vale o tempo.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('agente.nunca','agente','O agente',160,
 'O que o agente NUNCA pode dizer, prometer ou perguntar?',
 'Desconto que não existe, prazo que não se cumpre, assunto que não se toca.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('agente.transfere','agente','O agente',170,
 'Quando ele deve passar a conversa para uma pessoa?',
 null,'multi',
 '[{"value":"pede_humano","label":"Quando o lead pede para falar com alguém"},
   {"value":"ja_e_cliente","label":"Quando já é cliente"},
   {"value":"reclamacao","label":"Reclamação ou problema"},
   {"value":"pede_desconto","label":"Quando pede desconto"},
   {"value":"qualificou","label":"Assim que o lead qualifica"}]'::jsonb,
 '["pede_humano","ja_e_cliente","reclamacao"]'::jsonb,true,'agent',null),

-- ── 5 · Canais e acessos ────────────────────────────────────────────────────
('canais.ativos','canais','Canais e acessos',180,
 'Em quais canais o agente vai atender?',
 null,'multi',
 '[{"value":"whatsapp","label":"WhatsApp"},{"value":"instagram","label":"Instagram"},
   {"value":"webchat","label":"Site (chat)"}]'::jsonb,
 '["whatsapp"]'::jsonb,true,'channels',null),
('canais.numero','canais','Canais e acessos',190,
 'Qual a situação do número de WhatsApp que o agente vai usar?',
 'Não coloque senha nem código aqui — só a situação.',
 'select',
 '[{"value":"novo_pronto","label":"Tenho um número novo, sem WhatsApp ativo nele"},
   {"value":"em_uso","label":"Vou usar o número que já uso hoje no WhatsApp"},
   {"value":"comprar","label":"Preciso comprar um número"},
   {"value":"confirmar","label":"A confirmar"}]'::jsonb,
 null,true,'channels',null),
('canais.agenda','canais','Canais e acessos',200,
 'Onde o agente marca as reuniões?',
 null,'select',
 '[{"value":"google","label":"Google Calendar"},{"value":"outra","label":"Outra agenda"},
   {"value":"nenhuma","label":"Não vamos agendar por enquanto"}]'::jsonb,
 '"google"'::jsonb,true,'channels',null),

-- ── 6 · Time e alertas ──────────────────────────────────────────────────────
('time.usuarios','time','Time e alertas',210,
 'Quem vai usar o sistema? Nome, e-mail e o que a pessoa faz.',
 'Inclua quem recebe os leads qualificados — é para essa pessoa que o agente transfere.',
 'textarea','[]'::jsonb,null,true,'team',null),
('time.horario','time','Time e alertas',220,
 'Qual o horário de atendimento humano?',
 null,'select_other',
 '[{"value":"seg_sex_8_18","label":"Segunda a sexta, 8h às 18h"},
   {"value":"seg_sex_9_19","label":"Segunda a sexta, 9h às 19h"},
   {"value":"seg_sab_8_18","label":"Segunda a sábado, 8h às 18h"},
   {"value":"sempre","label":"24 horas, todos os dias"}]'::jsonb,
 '"seg_sex_8_18"'::jsonb,true,'team',null),
('time.avisos','time','Time e alertas',230,
 'O que deve gerar um aviso para o seu time?',
 null,'multi',
 '[{"value":"lead_qualificado","label":"Lead qualificado"},{"value":"reuniao_marcada","label":"Reunião marcada"},
   {"value":"lead_sem_resposta","label":"Lead sem resposta há 24h"},{"value":"lead_perdido","label":"Lead perdido"},
   {"value":"toda_conversa","label":"Toda nova conversa"}]'::jsonb,
 '["lead_qualificado","reuniao_marcada","lead_sem_resposta"]'::jsonb,true,'team',null)
on conflict (code) do update set
  block = excluded.block, block_label = excluded.block_label, sort_order = excluded.sort_order,
  label = excluded.label, help = excluded.help, type = excluded.type, options = excluded.options,
  default_value = excluded.default_value, required = excluded.required, maps_to = excluded.maps_to,
  max_select = excluded.max_select, active = true;

-- Perguntas de segmento. Só aparecem para quem é daquele nicho — é o que torna
-- o formulário "já moldado" em vez de genérico.
insert into public.discovery_questions
  (code, block, block_label, sort_order, label, help, type, options, default_value, required, maps_to, niche_id)
select * from (values
  ('funil.consumo_medio','funil','Como vende hoje',112,
   'Qual o consumo médio (kWh) de um cliente típico de vocês?',
   'Vira campo do CRM e pergunta de qualificação do agente.',
   'text','[]'::jsonb,null,false,'crm','solon'),
  ('funil.tipo_imovel','funil','Como vende hoje',112,
   'Quais tipos de imóvel vocês trabalham?',
   'Vira campo do CRM e pergunta de qualificação do agente.',
   'text','[]'::jsonb,null,false,'crm','imob')
) as v(code,block,block_label,sort_order,label,help,type,options,default_value,required,maps_to,niche_id)
where exists (select 1 from public.niches n where n.id = v.niche_id)
on conflict (code) do nothing;

comment on table public.discovery_questions is
  'Sprint 8.2 discovery_q&a — o banco de perguntas do discovery. Editável sem deploy.';
```

- [ ] **Step 2: Apply and verify the seed**

Run:
```bash
npx supabase db push
npx supabase db query --linked "select block_label, count(*), count(*) filter (where required) as obrig from public.discovery_questions where niche_id is null and active group by 1,2 order by min(sort_order);"
```
Expected: 6 rows totalling 23 questions; `empresa`=4, `cliente`=3, `funil`=4, `agente`=6, `canais`=3, `time`=3.

- [ ] **Step 3: Verify anon cannot read the bank**

Run:
```bash
npx supabase db query --linked "set role anon; select count(*) from public.discovery_questions;"
```
Expected: `permission denied` **or** `0 rows` — never the 23. If it returns 23, the RLS policy is wrong; fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260918000100_sprint82_discovery_bank.sql
git commit -m "feat(discovery): o banco de perguntas do discovery, com as 23 do formulário

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2 (T71): The answer record and its progress function

**Files:**
- Create: `supabase/migrations/20260918000200_sprint82_discovery_record.sql`

**Interfaces:**
- Consumes: `public.onboardings(id)`, `public.discovery_questions`
- Produces: table `public.onboarding_discovery`; `public._discovery_has_answer(p_type text, p_value jsonb) returns boolean`; `public._discovery_progress(p_answers jsonb, p_niche text) returns int`

- [ ] **Step 1: Write the migration**

```sql
-- Sprint 8.2 · discovery_q&a · T71 — onde as respostas moram.
--
-- Uma linha por onboarding. O token é guardado como HASH, como em
-- custom_record_form_links: o link aparece uma vez, na hora de gerar. Gerar
-- outro invalida o anterior — mas NÃO apaga resposta nenhuma, porque as
-- respostas são da linha, não do link. Reenviar o link para quem trocou de
-- e-mail é seguro.

create table if not exists public.onboarding_discovery (
  id            uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null unique references public.onboardings(id) on delete cascade,
  token_hash    text unique,
  expires_at    timestamptz,
  answers       jsonb not null default '{}'::jsonb,
  progress      int not null default 0,
  status        text not null default 'draft'  check (status in ('draft','submitted')),
  source        text not null default 'form'   check (source in ('form','json_import','copilot')),
  submitted_at  timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.onboarding_discovery enable row level security;

-- Só quem enxerga o quadro de onboarding enxerga o discovery: super admin.
drop policy if exists onboarding_discovery_admin_read on public.onboarding_discovery;
create policy onboarding_discovery_admin_read on public.onboarding_discovery
  for select to authenticated using (public.is_super_admin());
-- Sem política de escrita: quem grava são os verbos security definer.

/**
 * Uma resposta "existe"?
 *
 * Multi responde com lista: lista vazia é não respondida. Texto responde com
 * string: espaço em branco é não respondida. Sem isso o progresso contaria
 * um campo limpo pelo cliente como preenchido.
 */
create or replace function public._discovery_has_answer(p_type text, p_value jsonb)
returns boolean language sql immutable as $$
  select case
    when p_value is null or p_value = 'null'::jsonb then false
    when p_type = 'multi' then jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) > 0
    else btrim(coalesce(p_value #>> '{}', '')) <> ''
  end;
$$;

/**
 * O percentual de obrigatórias respondidas, contra o banco de perguntas DO
 * NICHO do cliente — uma pergunta de energia solar não pode contar contra um
 * escritório de advocacia, que nem a vê.
 */
create or replace function public._discovery_progress(p_answers jsonb, p_niche text)
returns int language sql stable as $$
  select coalesce((
    select round(100.0 * count(*) filter (
             where public._discovery_has_answer(q.type, p_answers -> q.code)
           ) / nullif(count(*), 0))::int
      from public.discovery_questions q
     where q.active and q.required
       and (q.niche_id is null or q.niche_id = p_niche)
  ), 0);
$$;

create or replace function public._discovery_touch() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists onboarding_discovery_touch on public.onboarding_discovery;
create trigger onboarding_discovery_touch
  before update on public.onboarding_discovery
  for each row execute function public._discovery_touch();

comment on table public.onboarding_discovery is
  'Sprint 8.2 discovery_q&a — respostas do discovery, uma linha por onboarding.';
```

- [ ] **Step 2: Apply and test the two functions directly**

Run:
```bash
npx supabase db push
npx supabase db query --linked "
  select public._discovery_has_answer('multi','[]'::jsonb)        as vazio_multi_false,
         public._discovery_has_answer('multi','[\"a\"]'::jsonb)   as cheio_multi_true,
         public._discovery_has_answer('textarea','\"  \"'::jsonb) as espaco_false,
         public._discovery_has_answer('textarea','\"oi\"'::jsonb) as texto_true,
         public._discovery_has_answer('multi','\"x\"'::jsonb)     as multi_com_string_false,
         public._discovery_progress('{}'::jsonb, null)            as zero,
         -- Cada tipo com o SEU formato: uma multi respondida é lista, não string.
         -- Preencher tudo com 'x' devolve 73%, não 100 — e isso é a função certa,
         -- recusando 6 multis mal formadas, não um bug.
         public._discovery_progress(
           (select jsonb_object_agg(code,
                     case when type = 'multi' then '[\"a\"]'::jsonb else to_jsonb('x'::text) end)
              from public.discovery_questions where required and niche_id is null), null) as cem;"
```
Expected: `f, t, f, t, f, 0, 100`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260918000200_sprint82_discovery_record.sql
git commit -m "feat(discovery): a linha de respostas do discovery e o cálculo de progresso

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3 (T72): The four verbs

**Files:**
- Create: `supabase/migrations/20260918000300_sprint82_discovery_rpcs.sql`

**Interfaces:**
- Consumes: Task 1 and Task 2 objects
- Produces (all `security definer`, granted to `service_role` only):
  - `public._discovery_ensure_link(p_onboarding_id uuid) returns text` — the plaintext token
  - `public._discovery_get(p_token text) returns jsonb`
  - `public._discovery_save(p_token text, p_answers jsonb) returns jsonb`
  - `public._discovery_submit(p_token text) returns jsonb`
- Raised messages consumed by Task 4: `discovery_not_found`, `discovery_expired`, `discovery_submitted`, `required:<code>`, `invalid_option:<code>`

- [ ] **Step 1: Write the migration**

```sql
-- Sprint 8.2 · discovery_q&a · T72 — os quatro verbos do discovery.
--
-- Toda validação acontece aqui, contra o banco de perguntas: qual pergunta
-- existe, qual opção é válida, qual é obrigatória. O navegador manda o que
-- quiser; quem decide é esta camada. É a mesma escolha de _crm_public_form_submit.

/** O nicho do cliente deste onboarding — molda quais perguntas ele vê. */
create or replace function public._discovery_niche(p_onboarding_id uuid)
returns text language sql stable as $$
  select coalesce(p.niche_id, e.niche)
    from public.onboardings o
    left join public.proposals p on p.id = o.proposal_id
    left join public.equipes   e on e.id = o.equipe_id
   where o.id = p_onboarding_id;
$$;

/**
 * Gera (ou regenera) o link. Devolve o token em claro UMA vez — depois dela só
 * existe o hash. Cria a linha se ainda não existir, preservando respostas.
 */
create or replace function public._discovery_ensure_link(p_onboarding_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.onboarding_discovery (onboarding_id, token_hash, expires_at)
  values (p_onboarding_id, encode(digest(v_token, 'sha256'), 'hex'), now() + interval '30 days')
  on conflict (onboarding_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at;

  return v_token;
end;
$$;

/** A linha viva por trás de um token, com as recusas nomeadas. */
create or replace function public._discovery_row(p_token text)
returns public.onboarding_discovery language plpgsql stable as $$
declare r public.onboarding_discovery;
begin
  select * into r from public.onboarding_discovery
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');

  if r.id is null then raise exception 'discovery_not_found'; end if;
  if r.expires_at is not null and r.expires_at < now() then raise exception 'discovery_expired'; end if;
  return r;
end;
$$;

/** O que a página mostra: perguntas do nicho, respostas de hoje, e o estado. */
create or replace function public._discovery_get(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.onboarding_discovery; v_niche text; v_nome text; v_agenda text;
begin
  r := public._discovery_row(p_token);
  v_niche := public._discovery_niche(r.onboarding_id);

  select o.cliente_nome into v_nome from public.onboardings o where o.id = r.onboarding_id;
  select s.value into v_agenda from public.system_settings s where s.key = 'ONBOARDING_CALENDLY_URL';

  update public.onboarding_discovery set last_seen_at = now() where id = r.id;

  return jsonb_build_object(
    'cliente_nome', coalesce(v_nome, ''),
    'status',       r.status,
    'progress',     r.progress,
    'answers',      r.answers,
    'link_agenda',  coalesce(v_agenda, ''),
    'questions', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.sort_order)
        from public.discovery_questions q
       where q.active and (q.niche_id is null or q.niche_id = v_niche)
    ), '[]'::jsonb)
  );
end;
$$;

/**
 * Autosave parcial: mescla o que chegou sobre o que já havia.
 *
 * Mesclar, e não substituir, é o que permite salvar campo a campo sem que uma
 * resposta em voo apague as outras. Chave que não existe no banco de perguntas
 * é DESCARTADA em silêncio — quem cola JSON de outra versão não corrompe a linha.
 */
create or replace function public._discovery_save(p_token text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.onboarding_discovery; v_niche text; v_clean jsonb := '{}'::jsonb; v_key text; v_q record;
begin
  r := public._discovery_row(p_token);
  if r.status = 'submitted' then raise exception 'discovery_submitted'; end if;
  v_niche := public._discovery_niche(r.onboarding_id);

  for v_key in select jsonb_object_keys(p_answers) loop
    select * into v_q from public.discovery_questions q
     where q.code = v_key and q.active and (q.niche_id is null or q.niche_id = v_niche);
    if v_q.code is null then continue; end if;

    -- Opção inventada não entra. 'select_other' aceita texto livre de propósito:
    -- é o campo onde o cliente descreve o funil que não é nenhum dos nossos.
    if v_q.type in ('select','multi') and jsonb_array_length(v_q.options) > 0 then
      if v_q.type = 'select'
         and public._discovery_has_answer('select', p_answers -> v_key)
         and not exists (select 1 from jsonb_array_elements(v_q.options) o
                          where o ->> 'value' = p_answers ->> v_key) then
        raise exception 'invalid_option:%', v_key;
      end if;
      if v_q.type = 'multi' and jsonb_typeof(p_answers -> v_key) = 'array'
         and exists (select 1 from jsonb_array_elements_text(p_answers -> v_key) sel
                      where not exists (select 1 from jsonb_array_elements(v_q.options) o
                                         where o ->> 'value' = sel)) then
        raise exception 'invalid_option:%', v_key;
      end if;
    end if;

    v_clean := v_clean || jsonb_build_object(v_key, p_answers -> v_key);
  end loop;

  update public.onboarding_discovery
     set answers  = answers || v_clean,
         progress = public._discovery_progress(answers || v_clean, v_niche)
   where id = r.id
   returning jsonb_build_object('progress', progress, 'answers', answers) into v_clean;

  return v_clean;
end;
$$;

/** Enviar: exige as obrigatórias do nicho e carimba a hora. */
create or replace function public._discovery_submit(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.onboarding_discovery; v_niche text; v_missing text; v_agenda text;
begin
  r := public._discovery_row(p_token);
  if r.status = 'submitted' then raise exception 'discovery_submitted'; end if;
  v_niche := public._discovery_niche(r.onboarding_id);

  select q.code into v_missing
    from public.discovery_questions q
   where q.active and q.required and (q.niche_id is null or q.niche_id = v_niche)
     and not public._discovery_has_answer(q.type, r.answers -> q.code)
   order by q.sort_order limit 1;

  if v_missing is not null then raise exception 'required:%', v_missing; end if;

  select s.value into v_agenda from public.system_settings s where s.key = 'ONBOARDING_CALENDLY_URL';

  update public.onboarding_discovery
     set status = 'submitted', submitted_at = now(),
         progress = public._discovery_progress(r.answers, v_niche)
   where id = r.id;

  return jsonb_build_object('status','submitted','link_agenda',coalesce(v_agenda,''),
                            'onboarding_id', r.onboarding_id);
end;
$$;

revoke all on function public._discovery_ensure_link(uuid) from public, anon, authenticated;
revoke all on function public._discovery_get(text)         from public, anon, authenticated;
revoke all on function public._discovery_save(text, jsonb) from public, anon, authenticated;
revoke all on function public._discovery_submit(text)      from public, anon, authenticated;
grant execute on function public._discovery_ensure_link(uuid) to service_role;
grant execute on function public._discovery_get(text)         to service_role;
grant execute on function public._discovery_save(text, jsonb) to service_role;
grant execute on function public._discovery_submit(text)      to service_role;
```

- [ ] **Step 2: Apply and run a full round-trip against a real onboarding**

Run:
```bash
npx supabase db push
npx supabase db query --linked "
do \$\$
declare v_ob uuid; v_tok text; v_res jsonb;
begin
  select id into v_ob from public.onboardings order by created_at limit 1;
  v_tok := public._discovery_ensure_link(v_ob);
  v_res := public._discovery_get(v_tok);
  raise notice 'perguntas=% progresso=%', jsonb_array_length(v_res->'questions'), v_res->'progress';

  v_res := public._discovery_save(v_tok, '{\"agente.nome\":\"Sol\",\"nao.existe\":\"x\"}'::jsonb);
  raise notice 'depois do save: progresso=% tem_lixo=%',
    v_res->'progress', (v_res->'answers') ? 'nao.existe';

  begin
    perform public._discovery_save(v_tok, '{\"funil.ticket\":\"inventado\"}'::jsonb);
    raise exception 'FALHOU: opcao invalida foi aceita';
  exception when others then raise notice 'opcao invalida recusada: %', sqlerrm; end;

  begin
    perform public._discovery_submit(v_tok);
    raise exception 'FALHOU: enviou incompleto';
  exception when others then raise notice 'submit incompleto recusado: %', sqlerrm; end;

  raise exception 'rollback proposital';
end \$\$;"
```
Expected notices: `perguntas=23` (or 24 on a niche tenant), `tem_lixo=f`, `opcao invalida recusada: invalid_option:funil.ticket`, `submit incompleto recusado: required:empresa.o_que_vende`. The final exception rolls everything back.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260918000300_sprint82_discovery_rpcs.sql
git commit -m "feat(discovery): os quatro verbos do discovery, com a validação no banco

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4 (T73): The public endpoint

**Files:**
- Create: `supabase/functions/_shared/public-discovery.ts`
- Create: `supabase/functions/_shared/public-discovery.test.ts`
- Create: `supabase/functions/public-discovery/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: the four RPCs from Task 3
- Produces: `parseDiscoveryRequest(raw): DiscoveryRequest | {error}`, `discoveryError(message): {status, error, field?}`
- Wire format for Task 8: `POST /functions/v1/public-discovery` with `{action:"get"|"save"|"submit", token, answers?}`

- [ ] **Step 1: Write the failing Deno test**

```ts
// supabase/functions/_shared/public-discovery.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { discoveryError, parseDiscoveryRequest } from "./public-discovery.ts";

// Sprint 8.2 · discovery_q&a · T73 — quem abre o discovery só tem o link.

const TOKEN = "a".repeat(64);

Deno.test("parseDiscoveryRequest: ler é o padrão; salvar precisa das respostas", () => {
  assertEquals(parseDiscoveryRequest({ token: TOKEN }), { action: "get", token: TOKEN });
  assertEquals(parseDiscoveryRequest({ action: "save", token: TOKEN, answers: { "agente.nome": "Sol" } }), {
    action: "save", token: TOKEN, answers: { "agente.nome": "Sol" },
  });
  assertEquals(parseDiscoveryRequest({ action: "submit", token: TOKEN }), { action: "submit", token: TOKEN });
});

Deno.test("parseDiscoveryRequest recusa o que não é do discovery", () => {
  assertEquals(parseDiscoveryRequest("x"), { error: "body_must_be_object" });
  assertEquals(parseDiscoveryRequest({ token: "curto" }), { error: "token_required" });
  assertEquals(parseDiscoveryRequest({ action: "save", token: TOKEN }), { error: "answers_required" });
  assertEquals(parseDiscoveryRequest({ action: "apagar", token: TOKEN }), { error: "unknown_action" });
});

Deno.test("discoveryError: campo a corrigir, link que acabou, link que não existe", () => {
  assertEquals(discoveryError('required:empresa.o_que_vende'),
    { status: 422, error: "required", field: "empresa.o_que_vende" });
  assertEquals(discoveryError('invalid_option:funil.ticket'),
    { status: 422, error: "invalid_option", field: "funil.ticket" });
  assertEquals(discoveryError("discovery_expired"), { status: 410, error: "discovery_expired" });
  assertEquals(discoveryError("discovery_submitted"), { status: 410, error: "discovery_submitted" });
  assertEquals(discoveryError("discovery_not_found"), { status: 404, error: "discovery_not_found" });
  assertEquals(discoveryError("boom"), { status: 500, error: "internal_error" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --allow-none supabase/functions/_shared/public-discovery.test.ts`
Expected: FAIL — `Module not found "./public-discovery.ts"`.

- [ ] **Step 3: Write the pure module**

```ts
// supabase/functions/_shared/public-discovery.ts
//
// Sprint 8.2 · discovery_q&a · T73 — as partes puras do discovery público.
//
// Gêmeo de _shared/public-form.ts: ler o pedido com desconfiança, e traduzir o
// erro que o banco levantou numa resposta que a página entende e sabe apontar.

export type DiscoveryRequest =
  | { action: "get"; token: string }
  | { action: "save"; token: string; answers: Record<string, unknown> }
  | { action: "submit"; token: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function parseDiscoveryRequest(raw: unknown): DiscoveryRequest | { error: string } {
  if (!isObject(raw)) return { error: "body_must_be_object" };
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "token_required" };

  const action = raw.action ?? "get";
  if (action === "get") return { action: "get", token };
  if (action === "submit") return { action: "submit", token };
  if (action === "save") {
    if (!isObject(raw.answers)) return { error: "answers_required" };
    return { action: "save", token, answers: raw.answers };
  }
  return { error: "unknown_action" };
}

/**
 * O banco levanta `required:empresa.o_que_vende`, `invalid_option:funil.ticket`,
 * `discovery_expired`… → { status, error, field? }, e a página rola até o campo.
 */
export function discoveryError(message: string): { status: number; error: string; field?: string } {
  const field = /(required|invalid_option):([A-Za-z0-9_.]+)/.exec(message);
  if (field) return { status: 422, error: field[1], field: field[2] };
  for (const gone of ["discovery_submitted", "discovery_expired"]) {
    if (message.includes(gone)) return { status: 410, error: gone };
  }
  if (message.includes("discovery_not_found")) return { status: 404, error: "discovery_not_found" };
  return { status: 500, error: "internal_error" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test --allow-none supabase/functions/_shared/public-discovery.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the endpoint**

```ts
// supabase/functions/public-discovery/index.ts
//
// Sprint 8.2 · discovery_q&a · T73 — o discovery público.
//
// Público (verify_jwt = false), como public-proposal e public-form: a pessoa tem
// só o link. Lê com o service_role e devolve apenas o que o formulário mostra;
// `anon` nunca toca nas tabelas. Toda validação está nas RPCs, não aqui.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { discoveryError, parseDiscoveryRequest } from "../_shared/public-discovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

if (import.meta.main) {
  serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const parsed = parseDiscoveryRequest(await req.json().catch(() => null));
    if ("error" in parsed) return json({ error: parsed.error }, 400);

    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } =
      parsed.action === "get"
        ? await db.rpc("_discovery_get", { p_token: parsed.token })
        : parsed.action === "save"
          ? await db.rpc("_discovery_save", { p_token: parsed.token, p_answers: parsed.answers })
          : await db.rpc("_discovery_submit", { p_token: parsed.token });

    if (error) {
      const answer = discoveryError(error.message);
      if (answer.status === 500) console.error("[public-discovery]", error.message);
      return json(answer, answer.status);
    }

    return json(data);
  });
}
```

- [ ] **Step 6: Register the function as public**

Append to `supabase/config.toml`:
```toml
# Sprint 8.2 discovery_q&a — o cliente tem só o link, sem login.
[functions.public-discovery]
verify_jwt = false
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/public-discovery.ts supabase/functions/_shared/public-discovery.test.ts supabase/functions/public-discovery/index.ts supabase/config.toml
git commit -m "feat(discovery): a porta pública do discovery

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5 (T74a): Types and evaluation

**Files:**
- Create: `src/lib/discovery/types.ts`
- Create: `src/lib/discovery/evaluate.ts`
- Test: `src/lib/discovery/__tests__/evaluate.test.ts`

**Interfaces:**
- Produces:
  - `type QuestionType = "text" | "textarea" | "select" | "select_other" | "multi"`
  - `interface DiscoveryQuestion { code, block, block_label, sort_order, label, help, type, options: {value,label}[], default_value, required, maps_to, niche_id, max_select }`
  - `type DiscoveryAnswers = Record<string, unknown>`
  - `interface DiscoveryBlock { id: string; label: string; questions: DiscoveryQuestion[] }`
  - `hasAnswer(q: DiscoveryQuestion, value: unknown): boolean`
  - `groupIntoBlocks(questions: DiscoveryQuestion[]): DiscoveryBlock[]`
  - `evaluateDiscovery(questions, answers): { total: number; answered: number; percent: number; complete: boolean; missing: { code: string; label: string; block_label: string }[] }`
  - `withDefaults(questions, answers): DiscoveryAnswers`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/discovery/__tests__/evaluate.test.ts
import { describe, expect, it } from "vitest";
import type { DiscoveryQuestion } from "../types";
import { evaluateDiscovery, groupIntoBlocks, hasAnswer, withDefaults } from "../evaluate";

const q = (over: Partial<DiscoveryQuestion>): DiscoveryQuestion => ({
  code: "x", block: "b", block_label: "Bloco", sort_order: 1, label: "Pergunta",
  help: null, type: "text", options: [], default_value: null, required: true,
  maps_to: "agent", niche_id: null, max_select: null, ...over,
});

describe("hasAnswer", () => {
  it("lista vazia não é resposta; lista com item é", () => {
    const m = q({ type: "multi" });
    expect(hasAnswer(m, [])).toBe(false);
    expect(hasAnswer(m, ["a"])).toBe(true);
  });

  it("texto em branco não é resposta", () => {
    const t = q({ type: "textarea" });
    expect(hasAnswer(t, "   ")).toBe(false);
    expect(hasAnswer(t, undefined)).toBe(false);
    expect(hasAnswer(t, "oi")).toBe(true);
  });
});

describe("groupIntoBlocks", () => {
  it("agrupa na ordem de sort_order, sem reordenar os blocos", () => {
    const blocks = groupIntoBlocks([
      q({ code: "b2", block: "dois", block_label: "Dois", sort_order: 20 }),
      q({ code: "a1", block: "um", block_label: "Um", sort_order: 10 }),
      q({ code: "b1", block: "dois", block_label: "Dois", sort_order: 15 }),
    ]);
    expect(blocks.map((b) => b.id)).toEqual(["um", "dois"]);
    expect(blocks[1].questions.map((x) => x.code)).toEqual(["b1", "b2"]);
  });
});

describe("evaluateDiscovery", () => {
  const questions = [
    q({ code: "a", required: true }),
    q({ code: "b", required: true, block_label: "Bloco 2" }),
    q({ code: "c", required: false }),
  ];

  it("conta só as obrigatórias e nomeia o que falta", () => {
    const r = evaluateDiscovery(questions, { a: "resposta" });
    expect(r.total).toBe(2);
    expect(r.answered).toBe(1);
    expect(r.percent).toBe(50);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual([{ code: "b", label: "Pergunta", block_label: "Bloco 2" }]);
  });

  it("opcional respondida não infla o percentual", () => {
    expect(evaluateDiscovery(questions, { a: "x", c: "x" }).percent).toBe(50);
  });

  it("tudo respondido é 100 e completo", () => {
    const r = evaluateDiscovery(questions, { a: "x", b: "y" });
    expect(r.percent).toBe(100);
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("sem obrigatórias, 100 — nunca divide por zero", () => {
    expect(evaluateDiscovery([q({ required: false })], {}).percent).toBe(100);
  });
});

describe("withDefaults", () => {
  it("o padrão preenche o que ninguém tocou, e nunca sobrescreve resposta", () => {
    const questions = [
      q({ code: "tom", type: "multi", default_value: ["consultivo"] }),
      q({ code: "ticket", type: "select", default_value: null }),
      q({ code: "funil", type: "select_other", default_value: "padrao" }),
    ];
    expect(withDefaults(questions, { funil: "meu funil" })).toEqual({
      tom: ["consultivo"],
      funil: "meu funil",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/discovery`
Expected: FAIL — cannot resolve `../types` / `../evaluate`.

- [ ] **Step 3: Write the two modules**

```ts
// src/lib/discovery/types.ts
//
// Sprint 8.2 · discovery_q&a — o formato do banco de perguntas.
//
// Espelha public.discovery_questions coluna a coluna de propósito: o banco de
// perguntas é a fonte, e o front não inventa campo nenhum em cima dele.

export type QuestionType = "text" | "textarea" | "select" | "select_other" | "multi";
export type MapsTo = "agent" | "crm" | "channels" | "team";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface DiscoveryQuestion {
  code: string;
  block: string;
  block_label: string;
  sort_order: number;
  label: string;
  help: string | null;
  type: QuestionType;
  options: QuestionOption[];
  default_value: unknown;
  required: boolean;
  maps_to: MapsTo;
  niche_id: string | null;
  /** Só para `multi`: o teto de escolhas (o tom do agente aceita 3). */
  max_select: number | null;
}

export type DiscoveryAnswers = Record<string, unknown>;

export interface DiscoveryBlock {
  id: string;
  label: string;
  questions: DiscoveryQuestion[];
}

export interface DiscoveryDocument {
  cliente_nome: string;
  status: "draft" | "submitted";
  progress: number;
  answers: DiscoveryAnswers;
  link_agenda: string;
  questions: DiscoveryQuestion[];
}
```

```ts
// src/lib/discovery/evaluate.ts
//
// Sprint 8.2 · discovery_q&a — progresso e lacunas.
//
// Gêmeo de _discovery_has_answer/_discovery_progress no banco. O banco é quem
// decide de verdade (é ele que recusa um envio incompleto); isto existe para a
// barra de progresso responder no mesmo quadro em que a pessoa digita, sem ida
// ao servidor.

import type { DiscoveryAnswers, DiscoveryBlock, DiscoveryQuestion } from "./types";

/** Lista vazia e texto em branco não são resposta — senão limpar um campo contaria como preenchê-lo. */
export function hasAnswer(question: DiscoveryQuestion, value: unknown): boolean {
  if (value == null) return false;
  if (question.type === "multi") return Array.isArray(value) && value.length > 0;
  return String(value).trim().length > 0;
}

/** Agrupa preservando a ordem de `sort_order`; o bloco nasce onde sua primeira pergunta aparece. */
export function groupIntoBlocks(questions: DiscoveryQuestion[]): DiscoveryBlock[] {
  const blocks: DiscoveryBlock[] = [];
  for (const question of [...questions].sort((a, b) => a.sort_order - b.sort_order)) {
    let block = blocks.find((b) => b.id === question.block);
    if (!block) {
      block = { id: question.block, label: question.block_label, questions: [] };
      blocks.push(block);
    }
    block.questions.push(question);
  }
  return blocks;
}

export interface DiscoveryEvaluation {
  total: number;
  answered: number;
  percent: number;
  complete: boolean;
  missing: { code: string; label: string; block_label: string }[];
}

export function evaluateDiscovery(
  questions: DiscoveryQuestion[],
  answers: DiscoveryAnswers,
): DiscoveryEvaluation {
  const required = questions.filter((q) => q.required);
  const missing = required
    .filter((q) => !hasAnswer(q, answers[q.code]))
    .map((q) => ({ code: q.code, label: q.label, block_label: q.block_label }));
  const answered = required.length - missing.length;
  return {
    total: required.length,
    answered,
    // Sem obrigatórias o formulário está completo por definição — nunca 0/0.
    percent: required.length ? Math.round((answered / required.length) * 100) : 100,
    complete: missing.length === 0,
    missing,
  };
}

/**
 * Os padrões entram só onde ninguém respondeu.
 *
 * É esta função que faz o formulário ser correção em vez de redação: o cliente
 * abre com o funil, o tom e os avisos já marcados. Nunca sobrescreve resposta —
 * um autosave que reaplicasse o padrão desfaria o que a pessoa acabou de mudar.
 */
export function withDefaults(
  questions: DiscoveryQuestion[],
  answers: DiscoveryAnswers,
): DiscoveryAnswers {
  const out: DiscoveryAnswers = { ...answers };
  for (const question of questions) {
    if (question.code in out) continue;
    if (question.default_value == null) continue;
    out[question.code] = question.default_value;
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/discovery`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/types.ts src/lib/discovery/evaluate.ts src/lib/discovery/__tests__/evaluate.test.ts
git commit -m "feat(discovery): o formato do banco de perguntas, o progresso e os padrões

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6 (T74b): The JSON round-trip

**Files:**
- Create: `src/lib/discovery/jsonRoundTrip.ts`
- Test: `src/lib/discovery/__tests__/jsonRoundTrip.test.ts`

**Interfaces:**
- Consumes: `DiscoveryQuestion`, `DiscoveryAnswers`, `hasAnswer` from Task 5
- Produces:
  - `buildQuestionExport(questions: DiscoveryQuestion[]): DiscoveryExport`
  - `parseAnswerImport(questions, raw: string): { answers; imported: string[]; ignored: string[] } | { error: ImportError }`
  - `type ImportError = "json_invalido" | "formato_invalido" | "nenhuma_resposta"`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/discovery/__tests__/jsonRoundTrip.test.ts
import { describe, expect, it } from "vitest";
import type { DiscoveryQuestion } from "../types";
import { buildQuestionExport, parseAnswerImport } from "../jsonRoundTrip";

const q = (over: Partial<DiscoveryQuestion>): DiscoveryQuestion => ({
  code: "x", block: "b", block_label: "Bloco", sort_order: 1, label: "Pergunta",
  help: null, type: "text", options: [], default_value: null, required: true,
  maps_to: "agent", niche_id: null, max_select: null, ...over,
});

const questions = [
  q({ code: "empresa.o_que_vende", label: "O que vende?", type: "textarea" }),
  q({ code: "funil.ticket", type: "select", options: [{ value: "1_5k", label: "R$ 1 a 5 mil" }] }),
  q({ code: "agente.tom", type: "multi", max_select: 3,
      options: [{ value: "direto", label: "Direto" }, { value: "cordial", label: "Cordial" }] }),
];

describe("buildQuestionExport", () => {
  it("leva a instrução, o código e as opções — é o que a IA do cliente precisa", () => {
    const out = buildQuestionExport(questions);
    expect(out.versao).toBe(1);
    expect(out.instrucoes).toContain("respostas");
    expect(out.perguntas).toHaveLength(3);
    expect(out.perguntas[1]).toEqual({
      code: "funil.ticket", pergunta: "Pergunta", ajuda: null,
      tipo: "select", obrigatoria: true, opcoes: ["1_5k"], escolha_ate: null,
    });
    expect(out.perguntas[2].escolha_ate).toBe(3);
  });

  it("o formato de resposta esperado vem junto, com os códigos reais", () => {
    expect(buildQuestionExport(questions).formato_esperado).toEqual({
      respostas: { "empresa.o_que_vende": "", "funil.ticket": "", "agente.tom": [] },
    });
  });
});

describe("parseAnswerImport", () => {
  it("aceita o formato completo e o objeto de respostas cru", () => {
    const completo = parseAnswerImport(questions, JSON.stringify({ respostas: { "funil.ticket": "1_5k" } }));
    const cru = parseAnswerImport(questions, JSON.stringify({ "funil.ticket": "1_5k" }));
    expect(completo).toEqual({ answers: { "funil.ticket": "1_5k" }, imported: ["funil.ticket"], ignored: [] });
    expect(cru).toEqual(completo);
  });

  it("descarta código que não existe e opção inventada, e diz o que descartou", () => {
    const r = parseAnswerImport(questions, JSON.stringify({
      "funil.ticket": "inventado", "nao.existe": "x", "empresa.o_que_vende": "energia solar",
    }));
    expect(r).toEqual({
      answers: { "empresa.o_que_vende": "energia solar" },
      imported: ["empresa.o_que_vende"],
      ignored: ["funil.ticket", "nao.existe"],
    });
  });

  it("corta a multi no teto e descarta valor fora da lista", () => {
    const r = parseAnswerImport(questions, JSON.stringify({ "agente.tom": ["direto", "inventado", "cordial"] }));
    expect(r).toEqual({ answers: { "agente.tom": ["direto", "cordial"] }, imported: ["agente.tom"], ignored: [] });
  });

  it("recusa o que não é JSON, o que não é objeto, e o que não trouxe nada", () => {
    expect(parseAnswerImport(questions, "não é json")).toEqual({ error: "json_invalido" });
    expect(parseAnswerImport(questions, "[1,2]")).toEqual({ error: "formato_invalido" });
    expect(parseAnswerImport(questions, "{}")).toEqual({ error: "nenhuma_resposta" });
    expect(parseAnswerImport(questions, JSON.stringify({ "nao.existe": "x" }))).toEqual({ error: "nenhuma_resposta" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/discovery`
Expected: FAIL — cannot resolve `../jsonRoundTrip`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/discovery/jsonRoundTrip.ts
//
// Sprint 8.2 · discovery_q&a — a porta de JSON.
//
// Quem já tem uma IA com o contexto da própria empresa não deveria redigitar o
// que ela já sabe: copia as perguntas, responde lá, cola aqui.
//
// A volta NUNCA envia sozinha. A IA do cliente vai inventar um preço com
// confiança total, e preço inventado vira script do agente que fala com o
// cliente final dele. Por isso aqui só se produz um RASCUNHO: o que foi
// importado fica destacado na tela e alguém confirma. Código que não existe e
// opção que não existe são descartados e RELATADOS — um import silencioso que
// come metade das respostas é pior que um erro.

import type { DiscoveryAnswers, DiscoveryQuestion } from "./types";

export interface ExportedQuestion {
  code: string;
  pergunta: string;
  ajuda: string | null;
  tipo: DiscoveryQuestion["type"];
  obrigatoria: boolean;
  /** Valores aceitos. Vazio = texto livre. */
  opcoes: string[];
  escolha_ate: number | null;
}

export interface DiscoveryExport {
  versao: 1;
  instrucoes: string;
  formato_esperado: { respostas: Record<string, unknown> };
  perguntas: ExportedQuestion[];
}

const INSTRUCOES = [
  "Você vai responder a um questionário sobre a empresa do usuário.",
  "Responda como a empresa dele, com dados reais — não invente preço, prazo nem promessa.",
  "Se algo não estiver definido, responda exatamente: a confirmar.",
  'Devolva SÓ um JSON no formato de "formato_esperado", usando os mesmos "code".',
  'Em perguntas com "opcoes", use exatamente um dos valores listados.',
  'Em perguntas de tipo "multi", devolva uma lista, respeitando "escolha_ate".',
].join(" ");

export function buildQuestionExport(questions: DiscoveryQuestion[]): DiscoveryExport {
  return {
    versao: 1,
    instrucoes: INSTRUCOES,
    formato_esperado: {
      respostas: Object.fromEntries(questions.map((q) => [q.code, q.type === "multi" ? [] : ""])),
    },
    perguntas: questions.map((q) => ({
      code: q.code,
      pergunta: q.label,
      ajuda: q.help,
      tipo: q.type,
      obrigatoria: q.required,
      // 'select_other' aceita texto livre: listar as opções ali faria a IA achar
      // que só elas valem, e é justamente o campo do funil que não é nenhum dos nossos.
      opcoes: q.type === "select" || q.type === "multi" ? q.options.map((o) => o.value) : [],
      escolha_ate: q.max_select,
    })),
  };
}

export type ImportError = "json_invalido" | "formato_invalido" | "nenhuma_resposta";

export interface ImportResult {
  answers: DiscoveryAnswers;
  imported: string[];
  ignored: string[];
}

export function parseAnswerImport(
  questions: DiscoveryQuestion[],
  raw: string,
): ImportResult | { error: ImportError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "json_invalido" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "formato_invalido" };
  }

  // Aceita tanto o envelope que exportamos quanto o objeto de respostas cru:
  // metade das IAs devolve um, metade devolve o outro.
  const envelope = parsed as Record<string, unknown>;
  const source =
    envelope.respostas && typeof envelope.respostas === "object" && !Array.isArray(envelope.respostas)
      ? (envelope.respostas as Record<string, unknown>)
      : envelope;

  const byCode = new Map(questions.map((q) => [q.code, q]));
  const answers: DiscoveryAnswers = {};
  const imported: string[] = [];
  const ignored: string[] = [];

  for (const [code, value] of Object.entries(source)) {
    const question = byCode.get(code);
    if (!question) {
      ignored.push(code);
      continue;
    }

    const allowed = question.options.map((o) => o.value);

    if (question.type === "multi") {
      if (!Array.isArray(value)) {
        ignored.push(code);
        continue;
      }
      let picked = value.map(String).filter((v) => allowed.includes(v));
      if (question.max_select) picked = picked.slice(0, question.max_select);
      if (picked.length === 0) {
        ignored.push(code);
        continue;
      }
      answers[code] = picked;
      imported.push(code);
      continue;
    }

    const text = value == null ? "" : String(value).trim();
    if (!text) {
      ignored.push(code);
      continue;
    }
    // 'select' só aceita a lista; 'select_other' aceita texto livre de propósito.
    if (question.type === "select" && !allowed.includes(text)) {
      ignored.push(code);
      continue;
    }
    answers[code] = text;
    imported.push(code);
  }

  if (imported.length === 0) return { error: "nenhuma_resposta" };
  return { answers, imported, ignored };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/discovery`
Expected: PASS, 15 tests total across both files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/jsonRoundTrip.ts src/lib/discovery/__tests__/jsonRoundTrip.test.ts
git commit -m "feat(discovery): copiar as perguntas e colar as respostas em JSON

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7 (T75a): The question field component

**Files:**
- Create: `src/components/discovery/QuestionField.tsx`
- Test: `src/components/discovery/__tests__/QuestionField.test.tsx`

**Interfaces:**
- Consumes: `DiscoveryQuestion` (Task 5)
- Produces: `<QuestionField question value onChange invalid imported />` where `onChange(value: unknown): void`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/discovery/__tests__/QuestionField.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DiscoveryQuestion } from "@/lib/discovery/types";
import { QuestionField } from "../QuestionField";

const q = (over: Partial<DiscoveryQuestion>): DiscoveryQuestion => ({
  code: "x", block: "b", block_label: "Bloco", sort_order: 1, label: "Pergunta",
  help: null, type: "text", options: [], default_value: null, required: true,
  maps_to: "agent", niche_id: null, max_select: null, ...over,
});

describe("QuestionField", () => {
  it("multi devolve a lista com o item marcado e sem o desmarcado", () => {
    const onChange = vi.fn();
    const question = q({
      type: "multi",
      options: [{ value: "a", label: "Alfa" }, { value: "b", label: "Beta" }],
    });
    const { rerender } = render(
      <QuestionField question={question} value={["a"]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText("Beta"));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);

    rerender(<QuestionField question={question} value={["a", "b"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Alfa"));
    expect(onChange).toHaveBeenLastCalledWith(["b"]);
  });

  it("multi com teto não deixa marcar além do limite", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({ type: "multi", max_select: 1, options: [{ value: "a", label: "Alfa" }, { value: "b", label: "Beta" }] })}
        value={["a"]}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Beta")).toBeDisabled();
  });

  it("select_other revela o campo livre quando o cliente escolhe Outro", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({ type: "select_other", options: [{ value: "padrao", label: "Padrão" }] })}
        value="meu funil escrito à mão"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("meu funil escrito à mão");
  });

  it("marca o campo importado, para o cliente conferir o que a IA respondeu", () => {
    render(<QuestionField question={q({})} value="x" onChange={vi.fn()} imported />);
    expect(screen.getByText(/conferir/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/discovery`
Expected: FAIL — cannot resolve `../QuestionField`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/discovery/QuestionField.tsx
//
// Sprint 8.2 · discovery_q&a — uma pergunta, um controle.
//
// O tipo vem do banco de perguntas, então este componente é a única tradução
// entre "o que a pergunta é" e "o que a pessoa vê". Nenhuma tela conhece uma
// pergunta específica: mudar o texto de uma pergunta é um UPDATE, não um deploy.

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DiscoveryQuestion } from "@/lib/discovery/types";

interface Props {
  question: DiscoveryQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid?: boolean;
  /** Veio de um JSON colado: fica marcado até a pessoa olhar. */
  imported?: boolean;
}

export function QuestionField({ question, value, onChange, invalid, imported }: Props) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const atLimit = !!question.max_select && selected.length >= question.max_select;

  // select_other: é "Outro" quando há valor e ele não está na lista.
  const known = question.options.map((o) => o.value);
  const text = typeof value === "string" ? value : "";
  const [other, setOther] = useState(question.type === "select_other" && !!text && !known.includes(text));

  return (
    <div id={`q-${question.code}`} className="space-y-2 scroll-mt-24">
      <Label className={cn("text-sm font-medium leading-snug", invalid && "text-destructive")}>
        {question.label}
        {question.required && <span className="text-muted-foreground"> *</span>}
      </Label>

      {question.help && <p className="text-xs text-muted-foreground">{question.help}</p>}

      {imported && (
        <p className="text-xs text-primary">Preenchido pelo JSON — vale conferir.</p>
      )}

      {question.type === "text" && (
        <Input value={text} onChange={(e) => onChange(e.target.value)} />
      )}

      {question.type === "textarea" && (
        <Textarea rows={4} value={text} onChange={(e) => onChange(e.target.value)} />
      )}

      {question.type === "select" && (
        <RadioGroup value={text} onValueChange={onChange}>
          {question.options.map((option) => (
            <div key={option.value} className="flex items-start gap-2">
              <RadioGroupItem value={option.value} id={`${question.code}-${option.value}`} className="mt-0.5" />
              <Label htmlFor={`${question.code}-${option.value}`} className="text-sm font-normal leading-snug">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {question.type === "select_other" && (
        <div className="space-y-2">
          <RadioGroup
            value={other ? "__outro__" : text}
            onValueChange={(v) => {
              if (v === "__outro__") { setOther(true); onChange(""); return; }
              setOther(false);
              onChange(v);
            }}
          >
            {question.options.map((option) => (
              <div key={option.value} className="flex items-start gap-2">
                <RadioGroupItem value={option.value} id={`${question.code}-${option.value}`} className="mt-0.5" />
                <Label htmlFor={`${question.code}-${option.value}`} className="text-sm font-normal leading-snug">
                  {option.label}
                </Label>
              </div>
            ))}
            <div className="flex items-start gap-2">
              <RadioGroupItem value="__outro__" id={`${question.code}-outro`} className="mt-0.5" />
              <Label htmlFor={`${question.code}-outro`} className="text-sm font-normal">
                Outro — eu escrevo
              </Label>
            </div>
          </RadioGroup>
          {other && (
            <Textarea rows={3} value={text} onChange={(e) => onChange(e.target.value)} />
          )}
        </div>
      )}

      {question.type === "multi" && (
        <div className="space-y-2">
          {question.options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <div key={option.value} className="flex items-start gap-2">
                <Checkbox
                  id={`${question.code}-${option.value}`}
                  checked={checked}
                  // O teto desabilita o que ainda não foi marcado, em vez de
                  // aceitar o clique e descartá-lo em silêncio.
                  disabled={!checked && atLimit}
                  onCheckedChange={(next) =>
                    onChange(next ? [...selected, option.value] : selected.filter((v) => v !== option.value))
                  }
                  className="mt-0.5"
                />
                <Label htmlFor={`${question.code}-${option.value}`} className="text-sm font-normal leading-snug">
                  {option.label}
                </Label>
              </div>
            );
          })}
          {question.max_select && (
            <p className="text-xs text-muted-foreground">
              Até {question.max_select} — {selected.length} escolhido(s).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/discovery`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/discovery/QuestionField.tsx src/components/discovery/__tests__/QuestionField.test.tsx
git commit -m "feat(discovery): uma pergunta, um controle, sem a tela conhecer pergunta nenhuma

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8 (T75b): The public page and its route

**Files:**
- Create: `src/hooks/usePublicDiscovery.ts`
- Create: `src/components/discovery/JsonDoors.tsx`
- Create: `src/pages/PublicDiscovery.tsx`
- Modify: `src/App.tsx` (route list, next to `/f/:token`)

**Interfaces:**
- Consumes: `DiscoveryDocument` (Task 5), `buildQuestionExport` / `parseAnswerImport` (Task 6), `QuestionField` (Task 7), the endpoint (Task 4)
- Produces: route `/discovery/:token`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/usePublicDiscovery.ts
//
// Sprint 8.2 · discovery_q&a — o discovery do lado de quem só tem o link.
//
// A pessoa não está logada, então nada aqui passa pelo cliente autenticado do
// Supabase: é `fetch` direto na edge function pública, como PublicForm faz.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscoveryAnswers, DiscoveryDocument } from "@/lib/discovery/types";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-discovery`;

export interface DiscoveryApiError {
  error: string;
  field?: string;
  status: number;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw { error: data.error ?? "internal_error", field: data.field, status: response.status } as DiscoveryApiError;
  }
  return data as T;
}

const key = (token: string) => ["public-discovery", token] as const;

export function useDiscoveryDocument(token: string) {
  return useQuery({
    queryKey: key(token),
    queryFn: () => call<DiscoveryDocument>({ action: "get", token }),
    // O link é de uso único na prática; recarregar a cada foco só criaria
    // corrida com o autosave em voo.
    staleTime: Infinity,
    retry: false,
  });
}

export function useSaveDiscovery(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: DiscoveryAnswers) =>
      call<{ progress: number; answers: DiscoveryAnswers }>({ action: "save", token, answers }),
    onSuccess: (data) => {
      qc.setQueryData<DiscoveryDocument>(key(token), (old) =>
        old ? { ...old, progress: data.progress, answers: data.answers } : old,
      );
    },
  });
}

export function useSubmitDiscovery(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call<{ status: "submitted"; link_agenda: string }>({ action: "submit", token }),
    onSuccess: (data) => {
      qc.setQueryData<DiscoveryDocument>(key(token), (old) =>
        old ? { ...old, status: "submitted", link_agenda: data.link_agenda || old.link_agenda } : old,
      );
    },
  });
}
```

- [ ] **Step 2: Write the JSON doors component**

```tsx
// src/components/discovery/JsonDoors.tsx
//
// Sprint 8.2 · discovery_q&a — as duas portas de JSON.
//
// Copiar as perguntas, responder na IA da casa do cliente, colar de volta. A
// volta entra como RASCUNHO destacado: nada é enviado sem alguém confirmar.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { buildQuestionExport, parseAnswerImport } from "@/lib/discovery/jsonRoundTrip";
import type { DiscoveryAnswers, DiscoveryQuestion } from "@/lib/discovery/types";

const MENSAGEM_ERRO: Record<string, string> = {
  json_invalido: "Isso não é um JSON válido. Copie de novo a resposta inteira da sua IA.",
  formato_invalido: "O JSON precisa ser um objeto com as respostas.",
  nenhuma_resposta: "Nenhuma resposta reconhecida. Confira se os códigos das perguntas vieram junto.",
};

interface Props {
  questions: DiscoveryQuestion[];
  onImport: (answers: DiscoveryAnswers, imported: string[]) => void;
}

export function JsonDoors({ questions, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");

  const copiar = async () => {
    await navigator.clipboard.writeText(JSON.stringify(buildQuestionExport(questions), null, 2));
    toast.success("Perguntas copiadas. Cole na sua IA e traga a resposta de volta.");
  };

  const colar = () => {
    const result = parseAnswerImport(questions, raw);
    if ("error" in result) {
      toast.error(MENSAGEM_ERRO[result.error]);
      return;
    }
    onImport(result.answers, result.imported);
    setOpen(false);
    setRaw("");
    toast.success(
      result.ignored.length
        ? `${result.imported.length} respostas preenchidas. ${result.ignored.length} foram ignoradas por não bater com as perguntas.`
        : `${result.imported.length} respostas preenchidas. Confira antes de enviar.`,
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copiar}>
        Copiar perguntas (JSON)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">Colar respostas (JSON)</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Colar respostas</DialogTitle>
            <DialogDescription>
              Cole o JSON que a sua IA devolveu. As respostas entram no formulário destacadas,
              para você conferir — nada é enviado antes de você revisar.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={12} value={raw} onChange={(e) => setRaw(e.target.value)}
                    placeholder='{"respostas": { ... }}' className="font-mono text-xs" />
          <DialogFooter>
            <Button type="button" onClick={colar} disabled={!raw.trim()}>Preencher o formulário</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// src/pages/PublicDiscovery.tsx
//
// Sprint 8.2 · discovery_q&a — o discovery que o cliente preenche antes da reunião.
//
// Um bloco por vez, com o que já sabemos marcado: o cliente CORRIGE em vez de
// redigir. Autosave a cada troca de bloco — quem fecha a aba no meio volta onde
// parou, e um formulário de 15 minutos sem autosave é um formulário abandonado.
//
// O link do Calendly só aparece na tela final. Um pedido por vez: a mensagem de
// boas-vindas pede o discovery, e a reunião é o que vem depois de terminá-lo.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/Logo";
import { BRAND } from "@/config/brand";
import { JsonDoors } from "@/components/discovery/JsonDoors";
import { QuestionField } from "@/components/discovery/QuestionField";
import { evaluateDiscovery, groupIntoBlocks, withDefaults } from "@/lib/discovery/evaluate";
import type { DiscoveryAnswers } from "@/lib/discovery/types";
import {
  useDiscoveryDocument, useSaveDiscovery, useSubmitDiscovery,
} from "@/hooks/usePublicDiscovery";
import { toast } from "sonner";

const RECUSA: Record<string, string> = {
  discovery_not_found: "Esse link não existe. Confira o endereço ou peça um novo.",
  discovery_expired: "Esse link expirou. Peça um novo para a gente.",
  discovery_submitted: "Esse discovery já foi enviado. Obrigado!",
};

export default function PublicDiscovery() {
  const { token = "" } = useParams();
  const { data, isLoading, error } = useDiscoveryDocument(token);
  const save = useSaveDiscovery(token);
  const submit = useSubmitDiscovery(token);

  const [answers, setAnswers] = useState<DiscoveryAnswers>({});
  const [imported, setImported] = useState<string[]>([]);
  const [step, setStep] = useState(0);

  // Os padrões entram uma vez, quando o documento chega.
  useEffect(() => {
    if (data) setAnswers(withDefaults(data.questions, data.answers));
  }, [data]);

  const blocks = useMemo(() => (data ? groupIntoBlocks(data.questions) : []), [data]);
  const evaluation = useMemo(
    () => (data ? evaluateDiscovery(data.questions, answers) : null),
    [data, answers],
  );

  if (isLoading) {
    return <Shell><p className="text-muted-foreground">Carregando…</p></Shell>;
  }

  if (error) {
    const code = (error as { error?: string }).error ?? "";
    return <Shell><p className="text-muted-foreground">{RECUSA[code] ?? "Não conseguimos abrir esse discovery."}</p></Shell>;
  }

  if (!data || !evaluation) return null;

  if (data.status === "submitted") return <Done nome={data.cliente_nome} agenda={data.link_agenda} />;

  const block = blocks[step];
  const last = step === blocks.length - 1;

  const avancar = async () => {
    await save.mutateAsync(answers).catch(() => toast.error("Não conseguimos salvar. Tente de novo."));
    if (!last) { setStep(step + 1); window.scrollTo({ top: 0 }); return; }

    if (!evaluation.complete) {
      const first = evaluation.missing[0];
      toast.error(`Falta responder: ${first.label}`);
      const target = blocks.findIndex((b) => b.questions.some((q) => q.code === first.code));
      setStep(target >= 0 ? target : 0);
      requestAnimationFrame(() => document.getElementById(`q-${first.code}`)?.scrollIntoView({ block: "center" }));
      return;
    }
    await submit.mutateAsync().catch(() => toast.error("Não conseguimos enviar. Tente de novo."));
  };

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {data.cliente_nome} · {BRAND.product}
          </p>
          <h1 className="text-2xl font-semibold">Antes da nossa reunião</h1>
          <p className="text-sm text-muted-foreground">
            São {data.questions.length} perguntas sobre a sua operação — a maioria já vem com uma
            sugestão marcada, é só corrigir o que não bate. Leva de 12 a 15 minutos, e é com isso
            que montamos seu agente e seu CRM antes de a gente se falar. Se algo ainda não estiver
            definido, escreva "a confirmar".
          </p>
        </div>

        <JsonDoors
          questions={data.questions}
          onImport={(incoming, codes) => {
            setAnswers((old) => ({ ...old, ...incoming }));
            setImported(codes);
          }}
        />

        <div className="space-y-2">
          <Progress value={evaluation.percent} />
          <p className="text-xs text-muted-foreground">
            Bloco {step + 1} de {blocks.length} · {block.label} · {evaluation.percent}% respondido
          </p>
        </div>

        <Card>
          <CardContent className="space-y-6 pt-6">
            {block.questions.map((question) => (
              <QuestionField
                key={question.code}
                question={question}
                value={answers[question.code]}
                imported={imported.includes(question.code)}
                onChange={(value) => setAnswers((old) => ({ ...old, [question.code]: value }))}
              />
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Voltar
          </Button>
          <Button onClick={avancar} disabled={save.isPending || submit.isPending}>
            {last ? "Enviar e escolher o horário" : "Salvar e continuar"}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <Logo className="h-7" />
        </div>
      </header>
      {children}
    </div>
  );
}

/** A tela final é onde o agendamento aparece — a reunião é o prêmio por terminar. */
function Done({ nome, agenda }: { nome: string; agenda: string }) {
  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Recebemos, {nome}. Obrigado!</h1>
        <p className="text-muted-foreground">
          Com isso a gente já monta seu agente e seu CRM. Agora escolha o melhor horário para a
          nossa reunião — ela vai ser para decidir, não para preencher formulário.
        </p>
        {agenda && (
          <Button asChild size="lg">
            <a href={agenda} target="_blank" rel="noreferrer">Escolher o horário</a>
          </Button>
        )}
      </div>
    </Shell>
  );
}
```

- [ ] **Step 4: Register the route**

In `src/App.tsx`, immediately after the `/f/:token` route (around line 89), add:

```tsx
                {/* Sprint 8.2 discovery_q&a — público: o cliente preenche antes
                    da reunião de implantação, sem login, com só o link. */}
                <Route path="/discovery/:token" element={<PublicDiscovery />} />
```

and add the import alongside the other page imports:

```tsx
import PublicDiscovery from "@/pages/PublicDiscovery";
```

- [ ] **Step 5: Typecheck, lint and test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePublicDiscovery.ts src/components/discovery/JsonDoors.tsx src/pages/PublicDiscovery.tsx src/App.tsx
git commit -m "feat(discovery): a tela do discovery, com autosave e o agendamento no fim

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9 (T76): The welcome message asks for the discovery, and only that

**Files:**
- Create: `supabase/migrations/20260918000400_sprint82_discovery_welcome.sql`
- Modify: `supabase/functions/_shared/provision-effects.ts` (`sendWelcome`, around lines 133-151)

**Interfaces:**
- Consumes: `_discovery_ensure_link` (Task 3), the `notify` helper already in `provision-effects.ts`
- Produces: `onboarding.welcome` with `{{link_discovery}}`; new type `onboarding.discovery_done`

- [ ] **Step 1: Write the migration**

```sql
-- Sprint 8.2 · discovery_q&a · T76 — as boas-vindas passam a pedir o discovery.
--
-- A regra de tom desta casa (20260902000300) é "um pedido só por mensagem". O
-- texto antigo pedia a reunião; agora pede o discovery, e o agendamento aparece
-- na tela final do formulário. A ordem invertida existe porque a outra falhava
-- na prática: o link da agenda é o mais fácil de clicar, então o cliente marcava
-- primeiro e chegava na reunião com o formulário em branco — exatamente o que o
-- discovery existe para evitar.

update public.notification_types
   set variables = '{cliente_nome,link_discovery,link_app,golive_previsto}',
       description = 'Boas-vindas após o provisionamento, com o link do discovery. O agendamento vem depois, na tela final do formulário.',
       template_title = 'Bem-vindo à Solo Rev, {{cliente_nome}}!',
       template_body =
'Seu ambiente já está criado e o acesso foi enviado para o seu e-mail.

O próximo passo são 15 minutos de perguntas sobre a sua operação. É com elas que montamos seu agente, seu CRM e seus canais ANTES da nossa reunião — assim a reunião vira decisão, e não questionário.

A maioria das perguntas já vem com uma sugestão marcada: você só corrige o que não bate.

{{link_discovery}}

Ao terminar, você escolhe ali mesmo o horário da nossa reunião.

Previsão de conclusão da implantação: {{golive_previsto}}'
 where type = 'onboarding.welcome';

insert into public.notification_types
  (type, default_severity, default_channels, audience, description, purpose, variables)
values
  -- audience='founder': o vocabulário aceito é tenant|founder|both|client
  -- (20260824000400). Este aviso é para quem implanta, não para o cliente —
  -- ele acabou de preencher, não precisa ser avisado de que preencheu.
  ('onboarding.discovery_done', 'success', '{in_app,email}', 'founder',
   'O cliente enviou o discovery: dá para montar o ambiente antes da reunião.',
   -- 'operacao', não 'operacional': o CHECK aceita comercial|financeiro|suporte|operacao.
   'operacao',
   '{cliente_nome,link_onboarding}')
on conflict (type) do update
  set audience = excluded.audience, purpose = excluded.purpose,
      variables = excluded.variables, description = excluded.description,
      default_severity = excluded.default_severity, default_channels = excluded.default_channels;

update public.notification_types
   set template_title = 'Discovery recebido: {{cliente_nome}}',
       template_body =
'{{cliente_nome}} terminou o discovery. As respostas já estão no card do onboarding — dá para montar o agente e o CRM antes da reunião.

{{link_onboarding}}'
 where type = 'onboarding.discovery_done';
```

- [ ] **Step 2: Change `sendWelcome` to build the discovery link**

In `supabase/functions/_shared/provision-effects.ts`, replace the body of `sendWelcome` (currently reading `ONBOARDING_CALENDLY_URL` and passing `link_agenda`) with:

```ts
async function sendWelcome(
  db: SupabaseClient, r: ProvisionResult, clienteNome: string,
  origin: string, linkSenha: string,
) {
  const { data: settings } = await db
    .from("system_settings").select("key, value").in("key", ["APP_BASE_URL"]);

  const get = (k: string) => (settings ?? []).find((s) => s.key === k)?.value ?? "";
  const base = origin || get("APP_BASE_URL") || "";

  // Sprint 8.2 discovery_q&a — o pedido das boas-vindas agora é o discovery, e o
  // agendamento aparece na tela final dele. O token em claro sai daqui uma única
  // vez: depois desta chamada só existe o hash no banco.
  let linkDiscovery = "";
  const { data: onboarding } = await db
    .from("onboardings").select("id").eq("equipe_id", r.equipe_id).maybeSingle();

  if (onboarding?.id) {
    const { data: token, error } = await db.rpc("_discovery_ensure_link", {
      p_onboarding_id: onboarding.id,
    });
    if (error) console.error("[provision-effects] _discovery_ensure_link:", error.message);
    else if (token && base) linkDiscovery = `${base}/discovery/${token}`;
  }

  await notify(db, r.equipe_id, "onboarding.welcome", "Bem-vindo!", "", "/home", {
    cliente_nome: clienteNome,
    link_discovery: linkDiscovery,
    link_app: base,
    link_senha: linkSenha || (base ? `${base}/definir-senha` : ""),
    golive_previsto: formatDateBR(r.golive_previsto),
  }, `welcome_${r.contract_id}`);
}
```

- [ ] **Step 3: Make a finished discovery actually tell the founder**

The type created in Step 1 is useless until something sends it. In `supabase/functions/public-discovery/index.ts`, replace the final `return json(data);` with:

```ts
    // Discovery terminado é o sinal de que dá para montar o ambiente ANTES da
    // reunião — que é o ponto inteiro desta sprint. Se ninguém for avisado, o
    // formulário chega preenchido e fica parado esperando alguém reparar.
    //
    // O aviso não pode derrubar o envio: para o cliente o discovery já acabou, e
    // um 500 aqui o faria reenviar um formulário que já foi gravado.
    if (parsed.action === "submit") {
      const onboardingId = (data as { onboarding_id?: string }).onboarding_id;
      if (onboardingId) {
        const { data: row } = await db
          .from("onboardings").select("equipe_id, cliente_nome").eq("id", onboardingId).maybeSingle();
        if (row?.equipe_id) {
          const { error: notifyError } = await db.rpc("notify", {
            p_equipe_id: row.equipe_id,
            p_type: "onboarding.discovery_done",
            p_title: "Discovery recebido",
            p_body: "",
            p_action_url: "/admin?tab=onboarding",
            p_data: { cliente_nome: row.cliente_nome ?? "", link_onboarding: "/admin?tab=onboarding" },
            p_dedup_key: `discovery_done_${onboardingId}`,
          });
          if (notifyError) console.error("[public-discovery] notify:", notifyError.message);
        }
      }
    }

    return json(data);
```

- [ ] **Step 4: Apply and verify the templates**

Run:
```bash
npx supabase db push
npx supabase db query --linked "select type, variables, left(template_body, 120) from public.notification_types where type in ('onboarding.welcome','onboarding.discovery_done');"
```
Expected: `onboarding.welcome` variables contain `link_discovery` and NOT `link_agenda`; `onboarding.discovery_done` exists.

Also confirm the routing actually reached the founder and not the client:
```bash
npx supabase db query --linked "select type, audience, purpose from public.notification_types where type = 'onboarding.discovery_done';"
```
Expected: `audience = founder`. If the insert raised a CHECK violation, the vocabulary changed again — read `20260824000400_sprint84_notification_routing.sql` for the current allowed set.

- [ ] **Step 5: Deploy the functions and commit**

```bash
npx supabase functions deploy public-discovery
git add supabase/migrations/20260918000400_sprint82_discovery_welcome.sql supabase/functions/_shared/provision-effects.ts supabase/functions/public-discovery/index.ts
git commit -m "feat(discovery): as boas-vindas pedem o discovery, e só isso

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10 (T77 + T78): The board sees the discovery

**Files:**
- Modify: `src/hooks/useOnboarding.ts` (add discovery fields to `OnboardingRow` and its select)
- Create: `src/hooks/useDiscoveryAdmin.ts`
- Create: `src/components/admin/onboarding/DiscoveryPanel.tsx`
- Modify: `src/components/admin/onboarding/OnboardingSheet.tsx`
- Modify: `src/components/admin/onboarding/OnboardingCard.tsx`
- Modify: `src/components/admin/onboarding/OnboardingTab.tsx` (soft warning on drop into `implantacao`)

**Interfaces:**
- Consumes: `onboarding_discovery` (Task 2), `evaluateDiscovery` (Task 5)
- Produces: `OnboardingRow.discovery_progress: number | null`, `OnboardingRow.discovery_status: "draft" | "submitted" | null`

- [ ] **Step 1: Widen the onboarding query**

In `src/hooks/useOnboarding.ts`, add to the `OnboardingRow` interface:

```ts
  /** Sprint 8.2 discovery_q&a — nulo quando o link ainda não foi gerado. */
  discovery_progress: number | null;
  discovery_status: "draft" | "submitted" | null;
```

Add `onboarding_discovery ( progress, status )` to the `.select(...)` string, and in the `.map(...)` return object add:

```ts
          discovery_progress: row.onboarding_discovery?.progress ?? null,
          discovery_status: row.onboarding_discovery?.status ?? null,
```

- [ ] **Step 2: Write the admin hook**

```ts
// src/hooks/useDiscoveryAdmin.ts
//
// Sprint 8.2 · discovery_q&a — o discovery visto do painel.
//
// Gerar o link devolve o token em claro UMA vez (depois só existe o hash), então
// quem chama copia na hora. Gerar de novo invalida o link antigo mas NÃO apaga
// resposta nenhuma: as respostas são da linha, não do link — reenviar para quem
// trocou de e-mail é seguro.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DiscoveryAnswers, DiscoveryQuestion } from "@/lib/discovery/types";

export function useDiscoveryQuestions() {
  return useQuery({
    queryKey: ["discovery-questions"],
    queryFn: async (): Promise<DiscoveryQuestion[]> => {
      const { data, error } = await supabase
        .from("discovery_questions").select("*").eq("active", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as DiscoveryQuestion[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useDiscoveryAnswers(onboardingId: string | null) {
  return useQuery({
    queryKey: ["discovery-answers", onboardingId],
    enabled: !!onboardingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_discovery")
        .select("answers, progress, status, submitted_at, last_seen_at")
        .eq("onboarding_id", onboardingId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        answers: DiscoveryAnswers; progress: number;
        status: "draft" | "submitted"; submitted_at: string | null; last_seen_at: string | null;
      } | null;
    },
  });
}

export function useEnsureDiscoveryLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (onboardingId: string): Promise<string> => {
      const { data, error } = await supabase.functions.invoke("admin-discovery-link", {
        body: { onboarding_id: onboardingId },
      });
      if (error) throw error;
      return (data as { url: string }).url;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboardings"] }),
  });
}
```

- [ ] **Step 2b: Write the authed link generator**

`_discovery_ensure_link` is granted to `service_role` only, so the browser cannot call it. This small authed function is the admin's way in — same shape as `golive-tenant`, including reading the role from `profiles.role` (not `user_roles`; the two disagree in this database and `profiles.role` is what the server trusts).

```ts
// supabase/functions/admin-discovery-link/index.ts
//
// Sprint 8.2 · discovery_q&a · T77 — o fundador gera o link do discovery.
//
// _discovery_ensure_link é do service_role, então o navegador não a alcança —
// é de propósito: quem gera um link de acesso público não pode ser o browser.
// Aqui a pessoa é identificada, conferida como super admin, e só então o token
// é criado. Ele volta em claro UMA vez; depois disso só existe o hash.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "unauthorized" }, 401);

    const { data: me } = await db.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (me?.role !== "super_admin") return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({})) as { onboarding_id?: string };
    if (!body.onboarding_id) return json({ error: "onboarding_id_required" }, 400);

    const { data: onboarding } = await db
      .from("onboardings").select("equipe_id").eq("id", body.onboarding_id).maybeSingle();
    if (!onboarding) return json({ error: "onboarding_not_found" }, 404);

    const { data: token, error } = await db.rpc("_discovery_ensure_link", {
      p_onboarding_id: body.onboarding_id,
    });
    if (error) throw new Error(error.message);

    // O produto é white-label por domínio: o link tem que sair no domínio DESTE
    // cliente, senão a primeira tela que ele abre é a marca de outro.
    const { data: origin } = onboarding.equipe_id
      ? await db.rpc("tenant_public_origin", { p_equipe_id: onboarding.equipe_id })
      : { data: "" };

    const base = (typeof origin === "string" && origin) || "";
    if (!base) return json({ error: "sem_dominio" }, 409);

    return json({ url: `${base}/discovery/${token}` });
  } catch (e) {
    console.error("[admin-discovery-link]", e);
    return json({ error: "internal_error" }, 500);
  }
});
```

- [ ] **Step 3: Write the sheet's Discovery block**

```tsx
// src/components/admin/onboarding/DiscoveryPanel.tsx
//
// Sprint 8.2 · discovery_q&a — o discovery dentro do card.
//
// O que o fundador precisa ver antes de entrar na reunião: quanto já foi
// respondido, o que o cliente escreveu, e um jeito de reenviar o link.

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { groupIntoBlocks, hasAnswer } from "@/lib/discovery/evaluate";
import { useDiscoveryAnswers, useDiscoveryQuestions, useEnsureDiscoveryLink } from "@/hooks/useDiscoveryAdmin";

export function DiscoveryPanel({ onboardingId }: { onboardingId: string }) {
  const { data: questions = [] } = useDiscoveryQuestions();
  const { data: record, isLoading } = useDiscoveryAnswers(onboardingId);
  const ensure = useEnsureDiscoveryLink();

  const blocks = useMemo(() => groupIntoBlocks(questions), [questions]);

  const copiarLink = async () => {
    try {
      const url = await ensure.mutateAsync(onboardingId);
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado. O link anterior deixou de valer; as respostas continuam.");
    } catch {
      toast.error("Não conseguimos gerar o link.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Discovery</h3>
        <Button variant="outline" size="sm" onClick={copiarLink} disabled={ensure.isPending}>
          {record ? "Gerar novo link" : "Gerar link"}
        </Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

      {!isLoading && !record && (
        <p className="text-xs text-muted-foreground">
          Ainda não enviado. Gere o link para mandar ao cliente.
        </p>
      )}

      {record && (
        <>
          <div className="space-y-1">
            <Progress value={record.progress} />
            <p className="text-xs text-muted-foreground">
              {record.progress}% respondido
              {record.status === "submitted" ? " · enviado" : " · em preenchimento"}
            </p>
          </div>

          <div className="space-y-4">
            {blocks.map((block) => {
              const answered = block.questions.filter((q) => hasAnswer(q, record.answers[q.code]));
              if (answered.length === 0) return null;
              return (
                <div key={block.id} className="space-y-2">
                  <Badge variant="secondary" className="text-[10px]">{block.label}</Badge>
                  {answered.map((question) => (
                    <div key={question.code} className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">{question.label}</p>
                      <p className="text-sm whitespace-pre-wrap">
                        {formatAnswer(question.options, record.answers[question.code])}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Mostra o rótulo da opção, não o slug: "Preço" em vez de "preco". */
function formatAnswer(options: { value: string; label: string }[], value: unknown): string {
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join(", ");
  return label(String(value ?? ""));
}
```

- [ ] **Step 4: Mount the block and add the card badge**

In `OnboardingSheet.tsx`, add the import:

```tsx
import { DiscoveryPanel } from "@/components/admin/onboarding/DiscoveryPanel";
```

and render `<DiscoveryPanel onboardingId={card.id} />` after the "Discovery agendado / realizado" date fields (around line 160), separated by the same divider style used between the sheet's existing sections. (Task 11 adds a second prop, `clienteNome`, when the briefing button needs it.)

In `OnboardingCard.tsx`, add `import { Badge } from "@/components/ui/badge";` if it is not already imported, and when `card.discovery_progress !== null`, render a small badge:
```tsx
        {card.discovery_progress !== null && (
          <Badge variant={card.discovery_status === "submitted" ? "default" : "secondary"} className="text-[10px]">
            Discovery {card.discovery_progress}%
          </Badge>
        )}
```

- [ ] **Step 5: Add the soft warning on drop into `implantacao`**

In `OnboardingTab.tsx`, inside the drag-end handler, before calling `moveStage.mutate`, add:

```tsx
      // Sprint 8.2 discovery_q&a — aviso, não trava.
      //
      // O gate é mole de propósito: o fundador fura a própria ordem quando o
      // cliente pede para conversar antes, e um quadro que o impede de
      // registrar o que já aconteceu é um quadro que ele para de usar.
      const destino = stages.find((s) => s.id === stageId);
      if (destino?.code === "implantacao" && (card.discovery_progress ?? 0) < 100) {
        toast.warning(
          card.discovery_progress === null
            ? "Discovery ainda não foi enviado. Seguindo assim mesmo."
            : `Discovery ${card.discovery_progress}% respondido. Seguindo assim mesmo.`,
        );
      }
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useOnboarding.ts src/hooks/useDiscoveryAdmin.ts src/components/admin/onboarding/ supabase/functions/admin-discovery-link/
git commit -m "feat(discovery): o quadro de onboarding enxerga o discovery

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11 (T79): The implementation briefing

**Files:**
- Create: `src/lib/discovery/briefing.ts`
- Test: `src/lib/discovery/__tests__/briefing.test.ts`
- Modify: `src/components/admin/onboarding/DiscoveryPanel.tsx` (a "Copiar briefing" button)

**Interfaces:**
- Consumes: `DiscoveryQuestion`, `DiscoveryAnswers`, `hasAnswer`
- Produces: `buildBriefing(questions, answers, clienteNome): { agentText: string; checklist: { group: MapsTo; label: string; answer: string }[] }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/discovery/__tests__/briefing.test.ts
import { describe, expect, it } from "vitest";
import type { DiscoveryQuestion } from "../types";
import { buildBriefing } from "../briefing";

const q = (over: Partial<DiscoveryQuestion>): DiscoveryQuestion => ({
  code: "x", block: "b", block_label: "Bloco", sort_order: 1, label: "Pergunta",
  help: null, type: "text", options: [], default_value: null, required: true,
  maps_to: "agent", niche_id: null, max_select: null, ...over,
});

const questions = [
  q({ code: "empresa.o_que_vende", label: "O que vende?", maps_to: "agent", sort_order: 10 }),
  q({ code: "funil.ticket", label: "Ticket", maps_to: "crm", sort_order: 20, type: "select",
      options: [{ value: "1_5k", label: "R$ 1 a 5 mil" }] }),
  q({ code: "canais.ativos", label: "Canais", maps_to: "channels", sort_order: 30, type: "multi",
      options: [{ value: "whatsapp", label: "WhatsApp" }] }),
];

describe("buildBriefing", () => {
  const answers = {
    "empresa.o_que_vende": "energia solar",
    "funil.ticket": "1_5k",
    "canais.ativos": ["whatsapp"],
  };

  it("o texto do agente leva só o que é do agente, com o nome do cliente", () => {
    const { agentText } = buildBriefing(questions, answers, "Casa Flow");
    expect(agentText).toContain("Casa Flow");
    expect(agentText).toContain("O que vende?");
    expect(agentText).toContain("energia solar");
    expect(agentText).not.toContain("Ticket");
  });

  it("o checklist traz o resto, com o rótulo da opção e não o slug", () => {
    const { checklist } = buildBriefing(questions, answers, "Casa Flow");
    expect(checklist).toEqual([
      { group: "crm", label: "Ticket", answer: "R$ 1 a 5 mil" },
      { group: "channels", label: "Canais", answer: "WhatsApp" },
    ]);
  });

  it("pergunta sem resposta não entra em lugar nenhum", () => {
    const { agentText, checklist } = buildBriefing(questions, {}, "Casa Flow");
    expect(agentText).not.toContain("O que vende?");
    expect(checklist).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/discovery`
Expected: FAIL — cannot resolve `../briefing`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/discovery/briefing.ts
//
// Sprint 8.2 · discovery_q&a — de respostas para configuração.
//
// É esta função que faz o discovery valer a pena: sem ela o formulário só
// encurtou a reunião, e a implantação continua sendo alguém relendo respostas e
// digitando em outra tela.
//
// `maps_to` separa as duas saídas: o que é do agente vira texto de treino (é
// assim que o agente é alimentado), e o resto vira uma lista de conferência para
// montar CRM, canais e time.

import { hasAnswer } from "./evaluate";
import type { DiscoveryAnswers, DiscoveryQuestion, MapsTo, QuestionOption } from "./types";

export interface BriefingItem {
  group: MapsTo;
  label: string;
  answer: string;
}

export interface Briefing {
  agentText: string;
  checklist: BriefingItem[];
}

/** O rótulo da opção, nunca o slug: quem lê o briefing é gente. */
function formatAnswer(options: QuestionOption[], value: unknown): string {
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join(", ");
  return label(String(value ?? ""));
}

export function buildBriefing(
  questions: DiscoveryQuestion[],
  answers: DiscoveryAnswers,
  clienteNome: string,
): Briefing {
  const answered = [...questions]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((q) => hasAnswer(q, answers[q.code]));

  const agentLines = answered
    .filter((q) => q.maps_to === "agent")
    .map((q) => `${q.label}\n${formatAnswer(q.options, answers[q.code])}`);

  const agentText = agentLines.length
    ? `Contexto do atendimento — ${clienteNome}\n\n${agentLines.join("\n\n")}`
    : "";

  const checklist = answered
    .filter((q) => q.maps_to !== "agent")
    .map((q) => ({
      group: q.maps_to,
      label: q.label,
      answer: formatAnswer(q.options, answers[q.code]),
    }));

  return { agentText, checklist };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/discovery`
Expected: PASS, 18 tests total in `src/lib/discovery`.

- [ ] **Step 5: Add the button to the sheet**

In `DiscoveryPanel.tsx`, next to the link button, add (only when `record` exists):

```tsx
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const { agentText, checklist } = buildBriefing(questions, record.answers, clienteNome);
            const texto = [
              agentText,
              "",
              "Checklist de configuração",
              ...checklist.map((i) => `[${i.group}] ${i.label}: ${i.answer}`),
            ].join("\n");
            await navigator.clipboard.writeText(texto);
            toast.success("Briefing copiado.");
          }}
        >
          Copiar briefing
        </Button>
```

Three wiring changes go with it, in the same file unless noted:

1. Add the import: `import { buildBriefing } from "@/lib/discovery/briefing";`
2. Widen the props from `{ onboardingId: string }` to:

```tsx
interface Props {
  onboardingId: string;
  /** Só o briefing usa: é o cabeçalho do texto de treino do agente. */
  clienteNome: string;
}

export function DiscoveryPanel({ onboardingId, clienteNome }: Props) {
```

3. In `OnboardingSheet.tsx`, pass it: `<DiscoveryPanel onboardingId={card.id} clienteNome={card.cliente_nome} />`

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npm run lint && npm test && deno test --allow-none supabase/functions/_shared/public-discovery.test.ts`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/discovery/briefing.ts src/lib/discovery/__tests__/briefing.test.ts src/components/admin/onboarding/
git commit -m "feat(discovery): o briefing que transforma resposta em configuração

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Retire the Codex draft and update the ledger

**Files:**
- Delete: `.tmp_gptmaker_onboarding/`
- Modify: `Planning/Sprints/sprint_8.2_onboarding.md` (tick the ledger)

- [ ] **Step 1: Confirm nothing in the repo imports the draft**

Run: `grep -rn "tmp_gptmaker_onboarding" --include=*.ts --include=*.tsx --include=*.json --include=*.md . | grep -v "^./Planning"`
Expected: no output. If anything matches, resolve it before deleting.

- [ ] **Step 2: Delete it and tick the ledger**

```bash
rm -rf .tmp_gptmaker_onboarding
```

In `Planning/Sprints/sprint_8.2_onboarding.md`, change every `- [ ] T7x` to `- [x] T7x` under `## 📊 Ledger` in the `discovery_q&a` section.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(discovery): aposenta o rascunho do Codex e fecha o ledger

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Deploy checklist

Deploy is manual in this project — there is no CI.

1. `npx supabase db push` — four migrations, in filename order.
2. `npx supabase functions deploy public-discovery`
3. `npx supabase functions deploy admin-discovery-link`
4. `npx supabase functions deploy provision-tenant public-proposal` — both bundle `_shared/provision-effects.ts`, which changed in Task 9.
5. Confirm `ONBOARDING_CALENDLY_URL` is still set in `system_settings` — the success screen reads it.
6. Smoke test: generate a link from a real onboarding card, open `/discovery/<token>` in a private window, answer one block, reload, confirm the answers came back, then submit and confirm the Calendly link appears.
