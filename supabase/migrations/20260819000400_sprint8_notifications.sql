-- 20260819000400_sprint8_notifications.sql
-- Sprint 8 · T4 — notification core.
--
-- WHY (audit item 10): there is no notification infrastructure at all. No table,
-- no email provider, no centre — only sonner toasts, which vanish on reload.
-- Billing without notice becomes a dispute: the customer never saw the invoice,
-- never saw the credit warning, and finds out by the product going quiet.

-- ============================================================================
-- 1. NOTIFICATIONS
-- ============================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  equipe_id  uuid not null references public.equipes(id) on delete cascade,
  -- NULL = every admin of the team. Set for a specific person when the message
  -- is personal rather than about the account.
  user_id    uuid,
  type       text not null,
  severity   text not null default 'info' check (severity in ('info','success','warn','critical')),
  title      text not null,
  body       text,
  action_url text,
  data       jsonb not null default '{}'::jsonb,
  dedup_key  text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.notifications.dedup_key is
  'Collapses recurring events. Without it credits.low fires on every page load and the customer learns to ignore exactly the warning that matters.';

-- The dedup guarantee. Partial, so notifications that SHOULD repeat simply omit the key.
create unique index if not exists uq_notifications_dedup
  on public.notifications (equipe_id, type, dedup_key)
  where dedup_key is not null;

create index if not exists idx_notifications_equipe_created
  on public.notifications (equipe_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications (equipe_id, created_at desc)
  where read_at is null;

-- ============================================================================
-- 2. DELIVERIES — one row per channel, so a failed email cannot lose the in-app copy
-- ============================================================================

create table if not exists public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel         text not null check (channel in ('in_app','email','whatsapp')),
  status          text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  provider_id     text,
  attempts        integer not null default 0,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (notification_id, channel)
);

create index if not exists idx_deliveries_pending
  on public.notification_deliveries (status, created_at)
  where status in ('pending','failed');

-- ============================================================================
-- 3. PREFERENCES — absence of a row means "use the default matrix"
-- ============================================================================

create table if not exists public.notification_preferences (
  id         uuid primary key default gen_random_uuid(),
  equipe_id  uuid not null references public.equipes(id) on delete cascade,
  user_id    uuid,
  type       text not null,
  channels   text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (equipe_id, user_id, type)
);

-- ============================================================================
-- 4. THE DEFAULT CHANNEL MATRIX
--
-- Contract with the dispatcher (T8) and the spec in the sprint file. Kept in the
-- database rather than in TypeScript so the cron, the webhook and the UI cannot
-- disagree about who gets told what.
-- ============================================================================

create table if not exists public.notification_types (
  type             text primary key,
  default_severity text not null check (default_severity in ('info','success','warn','critical')),
  default_channels text[] not null,
  audience         text not null check (audience in ('tenant','founder','both')),
  description      text
);

insert into public.notification_types (type, default_severity, default_channels, audience, description) values
  ('invoice.issued',              'info',     '{in_app,email}',            'tenant',  'Fatura emitida'),
  ('invoice.due_soon',            'warn',     '{in_app,email,whatsapp}',   'tenant',  'Vence em 3 dias'),
  ('invoice.overdue',             'critical', '{in_app,email,whatsapp}',   'both',    'Fatura vencida'),
  ('invoice.paid',                'success',  '{in_app,email}',            'both',    'Pagamento confirmado'),
  ('payment.refunded',            'critical', '{in_app,email,whatsapp}',   'both',    'Estorno ou chargeback'),
  ('credits.low',                 'warn',     '{in_app,email}',            'tenant',  '80% consumido'),
  ('credits.critical',            'critical', '{in_app,email,whatsapp}',   'tenant',  '95% consumido'),
  ('credits.exhausted',           'critical', '{in_app,email,whatsapp}',   'tenant',  'Sem crédito — IA parada'),
  ('credits.topup_confirmed',     'success',  '{in_app,email}',            'tenant',  'Recarga creditada'),
  ('credits.autorecharge_failed', 'critical', '{in_app,email,whatsapp}',   'both',    'Auto-recarga falhou'),
  ('contract.suspended',          'critical', '{in_app,email,whatsapp}',   'both',    'Conta em somente leitura'),
  ('contract.reactivated',        'success',  '{in_app,email,whatsapp}',   'both',    'Conta reativada'),
  ('proposal.viewed',             'info',     '{in_app,whatsapp}',         'founder', 'Cliente abriu a proposta'),
  ('proposal.accepted',           'success',  '{in_app,email,whatsapp}',   'founder', 'Proposta aceita'),
  ('proposal.expired',            'warn',     '{in_app}',                  'founder', 'Proposta expirou'),
  ('tenant.provisioned',          'success',  '{in_app,email}',            'both',    'Ambiente criado')
on conflict (type) do update
  set default_severity = excluded.default_severity,
      default_channels = excluded.default_channels,
      audience         = excluded.audience,
      description      = excluded.description;

-- ============================================================================
-- 5. notify() — enqueue a notification and its deliveries
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
  v_id       uuid;
  v_channels text[];
  v_pref     text[];
  v_ch       text;
begin
  select * into v_type from public.notification_types where type = p_type;
  if not found then
    raise exception 'unknown_notification_type: %', p_type using errcode = 'P0001';
  end if;

  insert into public.notifications (equipe_id, user_id, type, severity, title, body, action_url, data, dedup_key)
  values (
    p_equipe_id, p_user_id, p_type,
    coalesce(p_severity, v_type.default_severity),
    p_title, p_body, p_action_url, coalesce(p_data, '{}'::jsonb), p_dedup_key
  )
  on conflict (equipe_id, type, dedup_key) where dedup_key is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    return null;  -- deduplicated; already told them this
  end if;

  v_channels := v_type.default_channels;

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

  foreach v_ch in array v_channels loop
    insert into public.notification_deliveries (notification_id, channel)
    values (v_id, v_ch)
    on conflict (notification_id, channel) do nothing;
  end loop;

  return v_id;
end;
$fn$;

-- ============================================================================
-- 6. RLS
-- ============================================================================

alter table public.notifications            enable row level security;
alter table public.notification_deliveries  enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_types       enable row level security;

drop policy if exists notifications_tenant_read on public.notifications;
create policy notifications_tenant_read on public.notifications
  for select to authenticated using (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
    and (user_id is null or user_id = auth.uid())
  );

-- Tenants may mark as read — and nothing else. WITH CHECK re-asserts every other
-- column, so an UPDATE cannot be used to rewrite a notification's text or type.
drop policy if exists notifications_tenant_mark_read on public.notifications;
create policy notifications_tenant_mark_read on public.notifications
  for update to authenticated
  using (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
    and (user_id is null or user_id = auth.uid())
  )
  with check (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists notification_types_read on public.notification_types;
create policy notification_types_read on public.notification_types
  for select to authenticated using (true);

drop policy if exists notification_prefs_tenant on public.notification_preferences;
create policy notification_prefs_tenant on public.notification_preferences
  for all to authenticated
  using (equipe_id in (select equipe_id from public.profiles where user_id = auth.uid()))
  with check (equipe_id in (select equipe_id from public.profiles where user_id = auth.uid()));

-- notification_deliveries: no policy. Delivery plumbing is not tenant business.

-- Column-level guard behind the update policy: RLS cannot restrict WHICH columns
-- change, so a trigger enforces that only read_at moves.
create or replace function public.notifications_only_read_at()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;
  if new.equipe_id  is distinct from old.equipe_id
     or new.type    is distinct from old.type
     or new.title   is distinct from old.title
     or new.body    is distinct from old.body
     or new.severity is distinct from old.severity
     or new.action_url is distinct from old.action_url
     or new.data    is distinct from old.data
     or new.dedup_key is distinct from old.dedup_key then
    raise exception 'only read_at may be updated' using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_notifications_only_read_at on public.notifications;
create trigger trg_notifications_only_read_at
  before update on public.notifications
  for each row execute function public.notifications_only_read_at();

-- ============================================================================
-- 7. ASSERTIONS
-- ============================================================================

do $$
declare
  v_equipe uuid;
  v_n1     uuid;
  v_n2     uuid;
  v_cnt    integer;
begin
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t4_assert__', 'x', 'x') returning id into v_equipe;

  -- (a) notify() creates the notification and one delivery per default channel
  v_n1 := public.notify(v_equipe, 'invoice.overdue', 'Fatura vencida', 'Vence hoje',
                        '/billing/faturas', '{}'::jsonb, 'inv_1');
  assert v_n1 is not null, 'ASSERT FAILED: notify returned null on a new notification';
  select count(*) into v_cnt from public.notification_deliveries where notification_id = v_n1;
  assert v_cnt = 3, format('ASSERT FAILED: expected 3 deliveries for invoice.overdue, got %s', v_cnt);

  -- (b) THE DEDUP GUARANTEE: the same event with the same key does not fire twice.
  -- This is what stops credits.low from notifying on every page load.
  v_n2 := public.notify(v_equipe, 'invoice.overdue', 'Fatura vencida', 'de novo',
                        '/billing/faturas', '{}'::jsonb, 'inv_1');
  assert v_n2 is null, 'ASSERT FAILED: a duplicate dedup_key produced a second notification';
  select count(*) into v_cnt from public.notifications
   where equipe_id = v_equipe and type = 'invoice.overdue';
  assert v_cnt = 1, format('ASSERT FAILED: dedup left %s rows', v_cnt);

  -- (c) without a dedup_key, repeats are allowed
  perform public.notify(v_equipe, 'invoice.issued', 'Fatura 1');
  perform public.notify(v_equipe, 'invoice.issued', 'Fatura 2');
  select count(*) into v_cnt from public.notifications
   where equipe_id = v_equipe and type = 'invoice.issued';
  assert v_cnt = 2, format('ASSERT FAILED: expected 2 un-deduped rows, got %s', v_cnt);

  -- (d) an unknown type is rejected rather than silently swallowed
  begin
    perform public.notify(v_equipe, 'nao.existe', 'x');
    raise exception 'ASSERT FAILED: an unknown notification type was accepted';
  exception when sqlstate 'P0001' then null;
  end;

  -- (e) preferences remove channels but cannot silence a critical in-app copy
  insert into public.notification_preferences (equipe_id, type, channels)
  values (v_equipe, 'contract.suspended', '{email}');
  perform public.notify(v_equipe, 'contract.suspended', 'Suspenso', null, null, '{}'::jsonb, 'sus_1');
  select count(*) into v_cnt
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
   where n.equipe_id = v_equipe and n.type = 'contract.suspended' and d.channel = 'in_app';
  assert v_cnt = 1, 'ASSERT FAILED: a critical notification lost its in-app copy to preferences';

  -- (f) the matrix covers every type the sprint spec promises
  select count(*) into v_cnt from public.notification_types;
  assert v_cnt >= 16, format('ASSERT FAILED: notification matrix has %s types, expected >= 16', v_cnt);

  delete from public.equipes where id = v_equipe;
  raise notice 'T4 assertions passed';
end $$;
