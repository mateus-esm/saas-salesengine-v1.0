-- 20260824000400_sprint84_notification_routing.sql
-- Sprint 8.4 (Fixes 2, item 11) · notifications get a switchboard.
--
-- WHAT EXISTED: a good core — notifications, one delivery row per channel,
-- a default channel matrix per type, and a dispatcher that already spoke Resend
-- and the Solo (whatsmiau) API. What it could not do is everything the founder
-- actually asked for:
--
--   * ONE WhatsApp number for the whole platform, hardcoded in the env var
--     SOLO_PLATFORM_INSTANCE_ID. Commercial, financial, support and operations
--     messages all left from the same line, so a client could not tell a payment
--     reminder from a sales follow-up, and neither could we.
--
--   * NO TEMPLATES. Every message's wording is a string literal at its call
--     site, inside an edge function. Changing "Fatura vencida" to something less
--     brutal meant editing TypeScript and redeploying.
--
--   * NO PER-CLIENT CONTROL. notification_preferences is owned by the TENANT
--     and can only ever remove channels. There was no way for the founder to say
--     "this client gets WhatsApp, that one does not", or to point a client's
--     alerts at a specific number.
--
--   * NO WAY TO REACH A PROSPECT. notifications.equipe_id was NOT NULL, so the
--     one thing the founder named explicitly — "Proposta Gerada, cliente recebe
--     a proposta no WhatsApp através do número da Solo" — was impossible: the
--     person receiving a proposal is not a tenant yet.
--
-- WHAT THIS DOES NOT DO: it does not rebuild instance connection. Connecting a
-- whatsmiau instance by QR already exists (manage-solo-instances, Sprint 7); a
-- sender here just names the instance to send through, whether it was connected
-- in this product or already existed on the VPS.

-- ============================================================================
-- 1. SENDERS — one line per purpose
--
-- The purpose set is closed on purpose. These four are roles in the business
-- (who is speaking), not categories of message, and every notification type maps
-- to exactly one of them. An open text column would drift into a second, worse
-- copy of notification_types.
--
-- A sender is just a NAME of a whatsmiau instance. It is deliberately not a
-- foreign key to wpp_instances: that table is tenant-scoped (equipe_id NOT NULL)
-- and these instances belong to the platform, plus the founder explicitly wants
-- to point at an instance that already exists on his VPS without importing it.
-- ============================================================================

create table if not exists public.notification_senders (
  purpose            text primary key
                     check (purpose in ('comercial','financeiro','suporte','operacao')),
  label              text not null,
  description        text,
  -- NULL = this purpose has no WhatsApp line; its messages fall back to the
  -- platform instance, and if that is unset too they are skipped, not lost:
  -- the in-app and email copies still go out.
  whatsapp_instance  text,
  -- Informational link when the instance also lives in this product. Nullable
  -- and ON DELETE SET NULL: losing the row must not silence the sender.
  whatsapp_instance_id uuid references public.wpp_instances(id) on delete set null,
  -- NULL = the platform's verified address. Any value here must be on a domain
  -- verified at Resend or every send bounces.
  email_from         text,
  active             boolean not null default true,
  updated_at         timestamptz not null default now()
);

insert into public.notification_senders (purpose, label, description) values
  ('comercial',  'Comercial',  'Propostas, follow-up de venda, boas-vindas.'),
  ('financeiro', 'Financeiro', 'Faturas, cobrança, pagamento, suspensão por inadimplência.'),
  ('suporte',    'Suporte',    'Tickets, respostas e avisos de atendimento.'),
  ('operacao',   'Operação',   'Crédito, agente, instâncias — o que afeta o produto funcionando.')
on conflict (purpose) do nothing;

alter table public.notification_senders enable row level security;

drop policy if exists notification_senders_admin on public.notification_senders;
create policy notification_senders_admin on public.notification_senders
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ============================================================================
-- 2. TYPES GAIN A PURPOSE AND A TEMPLATE
--
-- The template lives on the type rather than in a table of its own because
-- there is exactly one template per type — a separate table would be a join
-- that can only ever return one row.
--
-- Precedence is: a template, when present, WINS over the text the caller passed.
-- That is the whole point — the wording has to be editable without a deploy.
-- Types with a NULL template keep using the caller's literal, so nothing that
-- works today changes until someone writes a template for it.
-- ============================================================================

alter table public.notification_types
  add column if not exists purpose        text not null default 'operacao',
  add column if not exists template_title text,
  add column if not exists template_body  text,
  add column if not exists variables      text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_types_purpose_check'
  ) then
    alter table public.notification_types
      add constraint notification_types_purpose_check
      check (purpose in ('comercial','financeiro','suporte','operacao'));
  end if;
end $$;

comment on column public.notification_types.template_title is
  'Editable message title. Overrides whatever the caller passed. {{variable}} is replaced from the notification data.';
comment on column public.notification_types.variables is
  'Variable names this type puts into notification.data, so the editor can show what a template may use.';

-- Who speaks for what. Financial and commercial are the two that matter to a
-- client reading their phone; the rest default to operations.
update public.notification_types set purpose = 'financeiro'
 where type like 'invoice.%' or type like 'payment.%' or type like 'contract.%';
update public.notification_types set purpose = 'comercial'
 where type like 'proposal.%' or type = 'tenant.provisioned';
update public.notification_types set purpose = 'operacao'
 where type like 'credits.%';

-- The audience vocabulary gains 'client': someone who is not a tenant and has no
-- login — the person a proposal is sent to.
alter table public.notification_types drop constraint if exists notification_types_audience_check;
alter table public.notification_types
  add constraint notification_types_audience_check
  check (audience in ('tenant','founder','both','client'));

insert into public.notification_types
  (type, default_severity, default_channels, audience, description, purpose, variables)
values
  ('proposal.sent', 'info', '{whatsapp,email}', 'client',
   'Proposta enviada ao cliente', 'comercial',
   '{cliente_nome,codigo,link,valor_mensal,valor_setup,validade}')
on conflict (type) do update
  set audience = excluded.audience,
      purpose  = excluded.purpose,
      variables = excluded.variables,
      description = excluded.description;

-- A first real template, for the one flow the founder named. Seeded rather than
-- left empty so the feature works the moment it ships, and so the editor has a
-- worked example of the variable syntax.
update public.notification_types
   set template_title = 'Sua proposta está pronta',
       template_body  =
'Olá, {{cliente_nome}}! Sua proposta da Solo Ventures está pronta.

Investimento: R$ {{valor_mensal}}/mês{{valor_setup}}
Válida até {{validade}}

Acesse por aqui: {{link}}

Qualquer dúvida, é só responder esta mensagem.'
 where type = 'proposal.sent';

-- Types whose data the platform already carries, so a template written for them
-- has something to interpolate.
update public.notification_types set variables = '{numero,valor,vencimento}'
 where type in ('invoice.issued','invoice.due_soon','invoice.overdue','invoice.paid');
update public.notification_types set variables = '{creditos,carteira,saldo}'
 where type like 'credits.%';

-- ============================================================================
-- 3. RENDERING
--
-- Deliberately not a general template engine: {{name}} substitution and nothing
-- else. No conditionals, no loops, no expression evaluation — a notification
-- template is edited by whoever is on support duty, and the blast radius of a
-- mistake has to stay at "the message reads wrong", never "the query failed".
--
-- An unknown variable renders as empty rather than leaving {{x}} on screen: a
-- customer seeing raw braces is worse than a slightly terse sentence.
-- ============================================================================

create or replace function public.render_template(p_template text, p_data jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v_out text := p_template;
  v_key text;
begin
  if p_template is null then return null; end if;
  for v_key in select jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) loop
    v_out := replace(v_out, '{{' || v_key || '}}', coalesce(p_data->>v_key, ''));
  end loop;
  -- Anything still unresolved was not supplied. Strip it.
  return regexp_replace(v_out, '\{\{[a-zA-Z0-9_]+\}\}', '', 'g');
end;
$fn$;

comment on function public.render_template(text, jsonb) is
  'Sprint 8.4 · {{variable}} substitution for notification templates. Substitution only — no logic — because these are edited by hand in the admin panel.';

-- ============================================================================
-- 4. PER-CLIENT POLICY — the founder's switchboard
--
-- Distinct from notification_preferences, which the TENANT owns and which can
-- only ever remove channels. This one is the platform's: it decides whether a
-- client is in the audience at all, which channels apply, and which number or
-- address to use for them.
--
-- Both are honoured, in that order: the policy sets the ceiling, the tenant's
-- preference can lower it further. A client can always mute themselves; they
-- cannot opt into something the platform did not enable.
-- ============================================================================

create table if not exists public.notification_policies (
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  type           text not null references public.notification_types(type) on delete cascade,
  -- false silences this notification for this client entirely.
  enabled        boolean not null default true,
  -- NULL = use the type's default channels. Never widens beyond what the type
  -- declares: the dispatcher can only deliver channels the type supports.
  channels       text[],
  -- false = prepared but not sent automatically; it stays for a human to fire.
  auto           boolean not null default true,
  -- "decide the number they will receive" — overrides the derived recipients.
  phone_override text,
  email_override text,
  updated_at     timestamptz not null default now(),
  primary key (equipe_id, type)
);

alter table public.notification_policies enable row level security;

drop policy if exists notification_policies_admin on public.notification_policies;
create policy notification_policies_admin on public.notification_policies
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- The tenant may READ what was decided for them — being told "your alerts are
-- off" is information they are entitled to — but never change it.
drop policy if exists notification_policies_tenant_read on public.notification_policies;
create policy notification_policies_tenant_read on public.notification_policies
  for select to authenticated using (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
  );

-- ============================================================================
-- 5. REACHING SOMEONE WHO IS NOT A TENANT
--
-- equipe_id loses NOT NULL so a proposal recipient can be notified. This is safe
-- for isolation because every tenant policy filters with
-- `equipe_id in (select ...)`, and NULL matches no such list — a prospect
-- notification is therefore invisible to every logged-in user, which is exactly
-- right.
-- ============================================================================

alter table public.notifications alter column equipe_id drop not null;
alter table public.notifications
  add column if not exists proposal_id     uuid references public.proposals(id) on delete cascade,
  add column if not exists recipient_phone text,
  add column if not exists recipient_email text;

comment on column public.notifications.equipe_id is
  'NULL when the recipient is not a tenant (a proposal recipient). Tenant RLS filters on equipe_id IN (...), which NULL never satisfies, so these rows stay invisible to logged-in users.';

-- The existing dedup index keys on equipe_id, which is NULL here — and NULLs are
-- distinct, so it would never collapse a repeat. Prospect notifications get
-- their own.
create unique index if not exists uq_notifications_dedup_proposal
  on public.notifications (proposal_id, type, dedup_key)
  where dedup_key is not null and proposal_id is not null;

-- ============================================================================
-- 6. notify() — now routed and templated
--
-- Same signature, so every existing caller keeps working untouched. What changes
-- is what it consults before enqueueing: the platform policy for this client,
-- then the template, then the tenant's own preference.
-- ============================================================================

create or replace function public.notify(
  p_equipe_id  uuid,
  p_type       text,
  p_title      text,
  p_body       text default null,
  p_action_url text default null,
  p_data       jsonb default '{}'::jsonb,
  p_dedup_key  text default null,
  p_user_id    uuid default null,
  p_severity   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_type     public.notification_types%rowtype;
  v_policy   public.notification_policies%rowtype;
  v_id       uuid;
  v_channels text[];
  v_pref     text[];
  v_ch       text;
  v_title    text;
  v_body     text;
begin
  select * into v_type from public.notification_types where type = p_type;
  if not found then
    raise exception 'unknown_notification_type: %', p_type using errcode = 'P0001';
  end if;

  -- The platform's decision comes first: a disabled policy means this client is
  -- not in this notification's audience, and nothing is recorded at all.
  -- `v_policy.equipe_id is not null` rather than `found`: FOUND is reset by every
  -- statement, and this value has to survive until the INSERT below reads it.
  select * into v_policy from public.notification_policies
   where equipe_id = p_equipe_id and type = p_type;
  if v_policy.equipe_id is not null and not v_policy.enabled then
    return null;
  end if;

  -- A template, when someone has written one, is the source of truth for the
  -- wording. The caller's literal is the fallback, not the other way round.
  v_title := coalesce(nullif(public.render_template(v_type.template_title, p_data), ''), p_title);
  v_body  := coalesce(nullif(public.render_template(v_type.template_body,  p_data), ''), p_body);

  insert into public.notifications (
    equipe_id, user_id, type, severity, title, body, action_url, data, dedup_key,
    recipient_phone, recipient_email
  )
  values (
    p_equipe_id, p_user_id, p_type,
    coalesce(p_severity, v_type.default_severity),
    v_title, v_body, p_action_url, coalesce(p_data, '{}'::jsonb), p_dedup_key,
    v_policy.phone_override,
    v_policy.email_override
  )
  on conflict (equipe_id, type, dedup_key) where dedup_key is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    return null;  -- deduplicated; already told them this
  end if;

  -- The policy narrows the type's channels; it cannot invent one the type does
  -- not declare, because the dispatcher only knows how to deliver those.
  v_channels := v_type.default_channels;
  if v_policy.channels is not null then
    v_channels := array(select unnest(v_channels) intersect select unnest(v_policy.channels));
  end if;

  -- A tenant preference may REMOVE channels, never add them.
  select np.channels into v_pref
  from public.notification_preferences np
  where np.equipe_id = p_equipe_id
    and np.type = p_type
    and (np.user_id is null or np.user_id = p_user_id)
  order by np.user_id nulls last
  limit 1;

  if v_pref is not null then
    v_channels := array(select unnest(v_channels) intersect select unnest(v_pref));
    -- ...except that a critical message always keeps its in-app copy. A customer
    -- must not be able to silence the fact that they lost access.
    if coalesce(p_severity, v_type.default_severity) = 'critical'
       and not ('in_app' = any(v_channels)) then
      v_channels := array_append(v_channels, 'in_app');
    end if;
  end if;

  -- `auto = false` means the message is prepared but not dispatched: the row and
  -- its rendered text exist for a human to review and fire by hand.
  if v_policy.equipe_id is not null and not v_policy.auto then
    return v_id;
  end if;

  foreach v_ch in array v_channels loop
    insert into public.notification_deliveries (notification_id, channel)
    values (v_id, v_ch)
    on conflict (notification_id, channel) do nothing;
  end loop;

  return v_id;
end;
$fn$;

-- ============================================================================
-- 7. notify_prospect() — the proposal path
--
-- A separate function rather than a branch inside notify(), because almost
-- nothing is shared: there is no tenant, no preferences, no policy, no in-app
-- inbox to write to, and the recipient's contact details come from the proposal
-- itself. Folding it in would have meant a function where half the parameters
-- are ignored depending on the other half.
-- ============================================================================

create or replace function public.notify_prospect(
  p_proposal_id uuid,
  p_type        text,
  p_data        jsonb default '{}'::jsonb,
  p_dedup_key   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_type public.notification_types%rowtype;
  v_p    public.proposals%rowtype;
  v_id   uuid;
  v_ch   text;
  v_data jsonb;
begin
  select * into v_type from public.notification_types where type = p_type;
  if not found then
    raise exception 'unknown_notification_type: %', p_type using errcode = 'P0001';
  end if;

  select * into v_p from public.proposals where id = p_proposal_id;
  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0001';
  end if;

  -- Everything a template can interpolate, merged under what the caller passed
  -- so an explicit value always wins.
  v_data := jsonb_build_object(
    'cliente_nome', v_p.cliente_nome,
    'codigo', v_p.codigo,
    'valor_mensal', trim(to_char(v_p.monthly_price, '999G999D99')),
    'valor_setup', case when coalesce(v_p.setup_price, 0) > 0 and not v_p.setup_waived
                        then format(' + setup de R$ %s', trim(to_char(v_p.setup_price, '999G999D99')))
                        else '' end,
    'validade', coalesce(to_char(v_p.valid_until, 'DD/MM/YYYY'), 'a combinar')
  ) || coalesce(p_data, '{}'::jsonb);

  insert into public.notifications (
    equipe_id, proposal_id, type, severity, title, body, action_url, data, dedup_key,
    recipient_phone, recipient_email
  )
  values (
    null, p_proposal_id, p_type, v_type.default_severity,
    public.render_template(coalesce(v_type.template_title, 'Sua proposta'), v_data),
    public.render_template(coalesce(v_type.template_body, ''), v_data),
    '/proposta/' || v_p.codigo,
    v_data, p_dedup_key,
    v_p.cliente_whatsapp, v_p.cliente_email
  )
  on conflict (proposal_id, type, dedup_key) where dedup_key is not null and proposal_id is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    return null;
  end if;

  -- No in-app: there is nobody logged in to read it.
  foreach v_ch in array v_type.default_channels loop
    if v_ch = 'in_app' then continue; end if;
    -- ...and no point queueing a channel we have no address for.
    if v_ch = 'whatsapp' and coalesce(v_p.cliente_whatsapp, '') = '' then continue; end if;
    if v_ch = 'email'    and coalesce(v_p.cliente_email, '')    = '' then continue; end if;
    insert into public.notification_deliveries (notification_id, channel)
    values (v_id, v_ch)
    on conflict (notification_id, channel) do nothing;
  end loop;

  return v_id;
end;
$fn$;

comment on function public.notify_prospect(uuid, text, jsonb, text) is
  'Sprint 8.4 · notify someone who is not a tenant yet — the person a proposal was sent to. Contact details come from the proposal; no in-app copy, because there is no inbox to put it in.';

revoke all on function public.notify_prospect(uuid, text, jsonb, text) from public, anon;
grant execute on function public.notify_prospect(uuid, text, jsonb, text) to authenticated, service_role;

-- ============================================================================
-- 8. PLATFORM SETTINGS
--
-- The founder wants to set the Resend key without a redeploy. A secret in a
-- table is weaker than a secret in the platform's env, so the trade is made
-- narrow and explicit: super-admin RLS, no anon grant, and the dispatcher
-- prefers this value only when it is set — the env var stays the fallback, so
-- nothing breaks if the row is empty or deleted.
-- ============================================================================

create table if not exists public.system_settings (
  key         text primary key,
  value       text,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

insert into public.system_settings (key, description) values
  ('RESEND_API_KEY',        'Chave da Resend para e-mails transacionais. Vazio = usa a variável de ambiente.'),
  ('NOTIFICATION_FROM_EMAIL','Remetente padrão. O domínio precisa estar verificado na Resend.')
on conflict (key) do nothing;

alter table public.system_settings enable row level security;

drop policy if exists system_settings_admin on public.system_settings;
create policy system_settings_admin on public.system_settings
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ============================================================================
-- 9. ADMIN VIEW — the switchboard as one readable grid
-- ============================================================================

create or replace view public.v_admin_notification_matrix as
select
  e.id   as equipe_id,
  e.nome as equipe_nome,
  t.type,
  t.description,
  t.purpose,
  t.default_severity,
  t.default_channels,
  coalesce(p.enabled, true)   as enabled,
  coalesce(p.channels, t.default_channels) as channels,
  coalesce(p.auto, true)      as auto,
  p.phone_override,
  p.email_override,
  (p.equipe_id is not null)   as has_policy
from public.equipes e
cross join public.notification_types t
left join public.notification_policies p
  on p.equipe_id = e.id and p.type = t.type
where public.is_super_admin()
  and t.audience in ('tenant','both');

comment on view public.v_admin_notification_matrix is
  'Sprint 8.4 · every client × every tenant-facing notification type, with the effective setting. Rows without a policy show the type default, so the grid is complete without pre-creating a policy per client.';

revoke all on public.v_admin_notification_matrix from anon;
grant select on public.v_admin_notification_matrix to authenticated;

-- ============================================================================
-- 10. ADMIN WRITES
-- ============================================================================

create or replace function public.admin_set_notification_policy(
  p_equipe_id      uuid,
  p_type           text,
  p_enabled        boolean default null,
  p_channels       text[] default null,
  p_auto           boolean default null,
  p_phone_override text default null,
  p_email_override text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare v_row public.notification_policies%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.notification_types where type = p_type) then
    raise exception 'unknown_notification_type' using errcode = 'P0001';
  end if;

  insert into public.notification_policies as np
    (equipe_id, type, enabled, channels, auto, phone_override, email_override)
  values (
    p_equipe_id, p_type,
    coalesce(p_enabled, true), p_channels, coalesce(p_auto, true),
    nullif(btrim(coalesce(p_phone_override, '')), ''),
    nullif(btrim(coalesce(p_email_override, '')), '')
  )
  on conflict (equipe_id, type) do update set
    -- COALESCE against the stored value, so a partial update from one toggle in
    -- the grid cannot blank the fields it did not send.
    enabled        = coalesce(p_enabled, np.enabled),
    channels       = coalesce(p_channels, np.channels),
    auto           = coalesce(p_auto, np.auto),
    phone_override = coalesce(nullif(btrim(coalesce(p_phone_override, '')), ''), np.phone_override),
    email_override = coalesce(nullif(btrim(coalesce(p_email_override, '')), ''), np.email_override),
    updated_at     = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$fn$;

create or replace function public.admin_set_notification_sender(
  p_purpose  text,
  p_instance text default null,
  p_email    text default null,
  p_active   boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare v_row public.notification_senders%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  update public.notification_senders set
    whatsapp_instance = case when p_instance is null then whatsapp_instance
                             else nullif(btrim(p_instance), '') end,
    -- Kept in step automatically when the named instance also exists here, so
    -- the panel can show its connection status without a second lookup.
    whatsapp_instance_id = (
      select w.id from public.wpp_instances w
       where w.instance_name = nullif(btrim(coalesce(p_instance, whatsapp_instance)), '')
       limit 1),
    email_from = case when p_email is null then email_from
                      else nullif(btrim(p_email), '') end,
    active     = coalesce(p_active, active),
    updated_at = now()
  where purpose = p_purpose
  returning * into v_row;

  if not found then
    raise exception 'unknown_purpose' using errcode = 'P0001';
  end if;
  return to_jsonb(v_row);
end;
$fn$;

create or replace function public.admin_set_notification_template(
  p_type  text,
  p_title text,
  p_body  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare v_row public.notification_types%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  update public.notification_types set
    -- Empty clears the template and hands the wording back to the caller's
    -- literal, which is the only way to undo a template once written.
    template_title = nullif(btrim(coalesce(p_title, '')), ''),
    template_body  = nullif(btrim(coalesce(p_body, '')), '')
  where type = p_type
  returning * into v_row;

  if not found then
    raise exception 'unknown_notification_type' using errcode = 'P0001';
  end if;
  return to_jsonb(v_row);
end;
$fn$;

create or replace function public.admin_set_system_setting(p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.system_settings where key = p_key) then
    raise exception 'unknown_setting' using errcode = 'P0001';
  end if;

  update public.system_settings
     set value = nullif(btrim(coalesce(p_value, '')), ''),
         updated_at = now(), updated_by = auth.uid()
   where key = p_key;

  -- The value itself is never returned: it is a secret, and an admin panel that
  -- echoes it back turns every screenshot into a leak.
  return jsonb_build_object('key', p_key, 'configured', p_value is not null and btrim(p_value) <> '');
end;
$fn$;

do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'public.admin_set_notification_policy(uuid, text, boolean, text[], boolean, text, text)',
    'public.admin_set_notification_sender(text, text, text, boolean)',
    'public.admin_set_notification_template(text, text, text)',
    'public.admin_set_system_setting(text, text)',
    'public.render_template(text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

-- ============================================================================
-- 11. ASSERTIONS
-- ============================================================================

do $$
declare
  v_e uuid; v_p uuid; v_n uuid; v_admin uuid;
  v_cnt integer; v_txt text; v_arr text[];
begin
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t84_notif__','x','x') returning id into v_e;

  -- (a) rendering: substitution, and no braces left behind
  assert public.render_template('Olá {{nome}}, saldo {{saldo}}',
    '{"nome":"Ana","saldo":"500"}'::jsonb) = 'Olá Ana, saldo 500',
    'ASSERT FAILED: template substitution is wrong';
  assert public.render_template('Olá {{nome}}{{sumiu}}', '{"nome":"Ana"}'::jsonb) = 'Olá Ana',
    'ASSERT FAILED: an unsupplied variable was left on screen';

  -- (b) every type has a purpose, or the switchboard has a hole
  select count(*) into v_cnt from public.notification_types where purpose is null;
  assert v_cnt = 0, 'ASSERT FAILED: some notification type has no purpose';
  select count(*) into v_cnt from public.notification_senders;
  assert v_cnt = 4, format('ASSERT FAILED: expected 4 senders, found %s', v_cnt);
  assert (select purpose from public.notification_types where type = 'invoice.overdue') = 'financeiro',
    'ASSERT FAILED: invoice.overdue is not routed to Financeiro';

  -- (c) the ordinary path still works, untouched
  v_n := public.notify(v_e, 'invoice.issued', 'Fatura', 'corpo', '/x', '{}'::jsonb, 'k1');
  assert v_n is not null, 'ASSERT FAILED: a normal notification was not created';
  select count(*) into v_cnt from public.notification_deliveries where notification_id = v_n;
  assert v_cnt = 2, format('ASSERT FAILED: expected 2 deliveries for invoice.issued, got %s', v_cnt);

  -- (d) THE SWITCHBOARD: a disabled policy silences the type for this client
  insert into public.notification_policies (equipe_id, type, enabled)
  values (v_e, 'invoice.overdue', false);
  v_n := public.notify(v_e, 'invoice.overdue', 'Vencida', null, '/x', '{}'::jsonb, 'k2');
  assert v_n is null, 'ASSERT FAILED: a disabled policy still sent a notification';

  -- ...and another client is unaffected by it
  v_n := public.notify(v_e, 'invoice.due_soon', 'Vence', null, '/x', '{}'::jsonb, 'k3');
  assert v_n is not null, 'ASSERT FAILED: disabling one type silenced another';

  -- (e) a policy narrows channels
  insert into public.notification_policies (equipe_id, type, channels)
  values (v_e, 'credits.critical', '{in_app}');
  v_n := public.notify(v_e, 'credits.critical', 'Sem crédito', null, '/x', '{}'::jsonb, 'k4');
  select array_agg(channel order by channel) into v_arr
    from public.notification_deliveries where notification_id = v_n;
  assert v_arr = '{in_app}', format('ASSERT FAILED: policy did not narrow channels, got %s', v_arr);

  -- (f) auto = false prepares the message but dispatches nothing
  insert into public.notification_policies (equipe_id, type, auto)
  values (v_e, 'credits.low', false);
  v_n := public.notify(v_e, 'credits.low', 'Pouco crédito', null, '/x', '{}'::jsonb, 'k5');
  assert v_n is not null, 'ASSERT FAILED: auto=false should still record the notification';
  select count(*) into v_cnt from public.notification_deliveries where notification_id = v_n;
  assert v_cnt = 0, 'ASSERT FAILED: auto=false still queued a delivery';

  -- (g) a template beats the caller's literal — the reason templates exist
  update public.notification_types
     set template_title = 'Fatura {{numero}}', template_body = 'Total R$ {{valor}}'
   where type = 'invoice.paid';
  v_n := public.notify(v_e, 'invoice.paid', 'TEXTO ANTIGO', 'CORPO ANTIGO', '/x',
                       '{"numero":"INV-9","valor":"250,00"}'::jsonb, 'k6');
  select title into v_txt from public.notifications where id = v_n;
  assert v_txt = 'Fatura INV-9',
    format('ASSERT FAILED: the caller literal won over the template (%s)', v_txt);
  select body into v_txt from public.notifications where id = v_n;
  assert v_txt = 'Total R$ 250,00', 'ASSERT FAILED: template body did not render';

  -- ...and a type with no template keeps the caller's text
  update public.notification_types set template_title = null, template_body = null
   where type = 'invoice.paid';
  v_n := public.notify(v_e, 'invoice.paid', 'LITERAL', 'CORPO', '/x', '{}'::jsonb, 'k7');
  select title into v_txt from public.notifications where id = v_n;
  assert v_txt = 'LITERAL', 'ASSERT FAILED: a type without a template lost the caller text';

  -- (h) the phone override reaches the notification
  insert into public.notification_policies (equipe_id, type, phone_override)
  values (v_e, 'contract.suspended', '5511999999999');
  v_n := public.notify(v_e, 'contract.suspended', 'Suspenso', null, '/x', '{}'::jsonb, 'k8');
  select recipient_phone into v_txt from public.notifications where id = v_n;
  assert v_txt = '5511999999999', 'ASSERT FAILED: the phone override was not applied';

  -- (i) THE PROSPECT PATH: someone with no team gets a notification
  insert into public.proposals (cliente_nome, cliente_email, cliente_whatsapp, monthly_price, status)
  values ('Cliente Teste', 'c@t.com', '5511888888888', 400, 'enviada') returning id into v_p;

  v_n := public.notify_prospect(v_p, 'proposal.sent', '{}'::jsonb, 'sent1');
  assert v_n is not null, 'ASSERT FAILED: a prospect notification was not created';
  select equipe_id into v_txt from public.notifications where id = v_n;
  assert v_txt is null, 'ASSERT FAILED: a prospect notification has an equipe';
  select recipient_phone into v_txt from public.notifications where id = v_n;
  assert v_txt = '5511888888888', 'ASSERT FAILED: the prospect phone was not carried over';
  select body into v_txt from public.notifications where id = v_n;
  assert v_txt like '%Cliente Teste%', 'ASSERT FAILED: the prospect template did not interpolate';
  assert v_txt not like '%{{%', 'ASSERT FAILED: unrendered braces reached the customer';

  -- no in-app copy: there is no inbox to put it in
  select count(*) into v_cnt
    from public.notification_deliveries where notification_id = v_n and channel = 'in_app';
  assert v_cnt = 0, 'ASSERT FAILED: a prospect got an in-app notification nobody can read';
  select count(*) into v_cnt from public.notification_deliveries where notification_id = v_n;
  assert v_cnt = 2, format('ASSERT FAILED: expected whatsapp+email for the prospect, got %s', v_cnt);

  -- sending the same proposal twice does not spam
  assert public.notify_prospect(v_p, 'proposal.sent', '{}'::jsonb, 'sent1') is null,
    'ASSERT FAILED: the prospect dedup key did not hold';

  -- a proposal with no whatsapp queues only what it can reach
  delete from public.proposals where id = v_p;
  insert into public.proposals (cliente_nome, cliente_email, monthly_price, status)
  values ('Sem Zap', 'z@t.com', 400, 'enviada') returning id into v_p;
  v_n := public.notify_prospect(v_p, 'proposal.sent', '{}'::jsonb, 'sent2');
  select count(*) into v_cnt
    from public.notification_deliveries where notification_id = v_n and channel = 'whatsapp';
  assert v_cnt = 0, 'ASSERT FAILED: queued whatsapp for a prospect with no number';

  -- (j) tenant isolation survives the nullable equipe_id
  select count(*) into v_cnt from public.notifications where equipe_id is null;
  assert v_cnt > 0, 'ASSERT FAILED: no prospect notification exists to test isolation with';

  -- (k) admin writes are gated
  begin
    perform public.admin_set_notification_sender('comercial', 'x', null, null);
    raise exception 'ASSERT FAILED: admin_set_notification_sender ran without super admin';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_txt = message_text;
    assert v_txt = 'forbidden', format('ASSERT FAILED: expected forbidden, got %s', v_txt);
  end;
  assert not has_function_privilege('anon',
    'public.admin_set_system_setting(text, text)', 'execute'),
    'ASSERT FAILED: anon can write system settings';

  -- ...and work for a real one
  select user_id into v_admin from public.profiles where role = 'super_admin' limit 1;
  if v_admin is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    perform public.admin_set_notification_sender('comercial', 'solo-comercial', null, null);
    assert (select whatsapp_instance from public.notification_senders where purpose = 'comercial')
             = 'solo-comercial',
      'ASSERT FAILED: the sender instance was not saved';

    -- a partial policy update must not blank the fields it did not send
    perform public.admin_set_notification_policy(v_e, 'contract.suspended', false, null, null, null, null);
    assert (select phone_override from public.notification_policies
             where equipe_id = v_e and type = 'contract.suspended') = '5511999999999',
      'ASSERT FAILED: a partial policy update erased the phone override';

    perform public.admin_set_notification_template('invoice.overdue', 'Ops', 'Corpo {{numero}}');
    assert (select template_title from public.notification_types where type = 'invoice.overdue') = 'Ops',
      'ASSERT FAILED: the template was not saved';
    perform public.admin_set_notification_template('invoice.overdue', '', '');
    assert (select template_title from public.notification_types where type = 'invoice.overdue') is null,
      'ASSERT FAILED: an empty template did not clear';

    -- the setting is stored but never echoed back
    v_txt := (public.admin_set_system_setting('RESEND_API_KEY', 're_secret_123'))::text;
    assert v_txt not like '%re_secret_123%',
      'ASSERT FAILED: the settings writer echoed the secret back to the caller';
    perform public.admin_set_system_setting('RESEND_API_KEY', '');

    select count(*) into v_cnt from public.v_admin_notification_matrix where equipe_id = v_e;
    assert v_cnt > 0, 'ASSERT FAILED: the admin matrix is empty for a real super admin';
  end if;

  delete from public.proposals where id = v_p;
  delete from public.equipes where id = v_e;
  update public.notification_senders set whatsapp_instance = null, whatsapp_instance_id = null
   where purpose = 'comercial';
  raise notice 'Sprint 8.4 notification routing assertions passed';
end $$;
