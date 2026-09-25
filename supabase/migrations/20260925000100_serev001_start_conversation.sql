-- ============================================================================
-- SE-REV-001 — Abrir conversa de WhatsApp com um lead novo (start-conversation)
--
-- O que este arquivo adiciona:
--
--   1. public.conversation_opener_settings — a configuração POR TENANT de qual
--      canal do provider abre a conversa, se o disparo automático está ligado,
--      quais `source` de lead disparam e qual é a primeira mensagem.
--      Nada de tenant/canal/número fixo em código: quem decide é esta tabela.
--
--   2. public.conversation_open_events — o rastro persistido de cada tentativa
--      de abertura, com o identificador devolvido pelo provider. É também o
--      mecanismo de IDEMPOTÊNCIA: UNIQUE (equipe_id, event_key). Reenviar o
--      mesmo evento colide no índice e a segunda chamada devolve o registro que
--      já existe, em vez de abrir uma segunda conversa.
--
--   3. Três colunas em public.conversations, para que cadências e follow-ups
--      futuros saibam que AQUELA conversa foi aberta por nós, quando, e por
--      qual canal do provider.
--
-- Aditivo: nenhuma coluna existente muda de tipo, nome ou default, e nenhum
-- fluxo atual (gpt-maker-webhook, send-chat-message, canais conectados) lê
-- qualquer coisa que este arquivo altere.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Configuração por tenant
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_opener_settings (
  id             uuid primary key default gen_random_uuid(),
  equipe_id      uuid not null unique references public.equipes(id) on delete cascade,

  -- Disparo automático a partir da entrada de lead. Nasce DESLIGADO: ligar
  -- significa mandar mensagem para quem acabou de se cadastrar, e essa decisão
  -- é do tenant, não um default nosso.
  enabled        boolean not null default false,

  -- Canal do provider que abre a conversa (o `channelId` de
  -- POST /v2/channel/{channelId}/start-conversation). Nulo = descobrir sozinho,
  -- e só quando o tenant tiver exatamente UM canal WhatsApp conectado; com dois
  -- números, a escolha tem de ser explícita (ver `channel_ambiguous` na função).
  channel_id     text,

  -- Tipo do canal na última verificação, para diagnóstico. Não é fonte de
  -- verdade: o tipo é relido no provider a cada abertura.
  channel_type   text,

  -- `source` de lead que disparam o automático. Vazio = qualquer source.
  -- Ex.: '{"Meta Ads - Cadastro (Social Pago)"}'. Comparação case-insensitive
  -- com trim, feita na edge function.
  trigger_sources text[] not null default '{}',

  -- Primeira mensagem. Placeholders {{lead.name}}, {{lead.first_name}},
  -- {{lead.source}}, {{tenant.name}} são resolvidos no envio.
  first_message  text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.conversation_opener_settings is
  'SE-REV-001: por tenant, qual canal abre conversa com lead novo e com qual mensagem.';

drop trigger if exists update_conversation_opener_settings_updated_at
  on public.conversation_opener_settings;
create trigger update_conversation_opener_settings_updated_at
  before update on public.conversation_opener_settings
  for each row execute function public.update_updated_at_column();

alter table public.conversation_opener_settings enable row level security;

-- Leitura para o time dono da configuração. Escrita só pelo service_role
-- (a edge function valida o autor antes de gravar) — mesmo padrão das tabelas
-- de configuração do Sprint 8.2.
drop policy if exists conversation_opener_settings_read
  on public.conversation_opener_settings;
create policy conversation_opener_settings_read
  on public.conversation_opener_settings
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Rastro + idempotência
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_open_events (
  id               uuid primary key default gen_random_uuid(),
  equipe_id        uuid not null references public.equipes(id) on delete cascade,
  lead_id          uuid references public.leads(id) on delete cascade,
  conversation_id  uuid references public.conversations(id) on delete set null,

  -- A chave da idempotência. Default gerado pela função: 'lead:<lead_id>' —
  -- uma abertura por lead. Quem chama pode mandar a sua própria (o id do
  -- registro na planilha, o execution id do n8n) e aí o reenvio daquele evento
  -- específico é que fica bloqueado.
  event_key        text not null,

  -- Como a abertura foi pedida: 'lead_intake' (gatilho interno de entrada de
  -- lead), 'http' (n8n / integração externa), 'manual' (usuário autenticado).
  trigger_source   text not null default 'http',

  channel_id       text,
  channel_type     text,
  phone            text,
  message          text,

  status           text not null default 'pending'
                   check (status in ('pending', 'opened', 'failed', 'skipped')),

  -- O identificador devolvido pelo provider. É sobre este dado que cadências e
  -- follow-ups futuros são construídos (ele é o mesmo id usado por
  -- send-chat-message em /v2/chat/{id}/send-message).
  provider_chat_id text,
  -- A resposta crua. A documentação do provider não fixa o shape do retorno, e
  -- guardar o corpo inteiro é o que permite descobrir depois de onde tirar o id
  -- sem precisar reproduzir o caso.
  provider_response jsonb,
  provider_status  integer,

  error_code       text,
  error_message    text,
  attempts         integer not null default 1,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  opened_at        timestamptz
);

comment on table public.conversation_open_events is
  'SE-REV-001: uma linha por evento de abertura de conversa. UNIQUE (equipe_id, event_key) é a idempotência.';

create unique index if not exists uq_conversation_open_events_key
  on public.conversation_open_events (equipe_id, event_key);

create index if not exists idx_conversation_open_events_lead
  on public.conversation_open_events (lead_id, created_at desc);

create index if not exists idx_conversation_open_events_equipe_status
  on public.conversation_open_events (equipe_id, status, created_at desc);

drop trigger if exists update_conversation_open_events_updated_at
  on public.conversation_open_events;
create trigger update_conversation_open_events_updated_at
  before update on public.conversation_open_events
  for each row execute function public.update_updated_at_column();

alter table public.conversation_open_events enable row level security;

drop policy if exists conversation_open_events_read on public.conversation_open_events;
create policy conversation_open_events_read
  on public.conversation_open_events
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. A conversa sabe que foi aberta por nós
-- ---------------------------------------------------------------------------
-- `opened_at` / `opened_via` são o gancho que o motor de cadências vai ler:
-- "conversa aberta por start-conversation às 14h02 e o lead não respondeu" é
-- uma pergunta que só dá para fazer com estas colunas.
alter table public.conversations
  add column if not exists opened_at timestamptz,
  add column if not exists opened_via text,
  add column if not exists provider_channel_id text;

comment on column public.conversations.opened_via is
  'SE-REV-001: como a conversa nasceu. null = inbound (o lead falou primeiro); start_conversation = nós abrimos.';

create index if not exists idx_conversations_opened_via
  on public.conversations (equipe_id, opened_via, opened_at desc)
  where opened_via is not null;
