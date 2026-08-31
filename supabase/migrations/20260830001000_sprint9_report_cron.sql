-- 20260830001000_sprint9_report_cron.sql
-- Sprint 9 · T13 — the report's delivery path and its (inert) cron.
--
-- Three things:
--   1. notification types for the report, with editable templates
--   2. notify_report() — enqueue one report to one phone
--   3. the pg_cron job definition, documented and NOT registered
--
-- On (3): this migration is intentionally inert, matching
-- 20260819000500_sprint8_billing_cron.sql and 20260705000001. It creates no
-- extension and registers no job, because doing so would require the cron
-- secret to be committed to git. The operator runs the script in the header
-- after the deploy is healthy.

begin;

-- ============================================================================
-- 1. THE TYPES
--
-- purpose = 'operacao': a report is the product working, not a sale and not a
-- bill. It leaves from the operations line, which is also the one whose cost
-- the platform absorbs — the founder's decision D3: a scheduled report does not
-- spend the client's WhatsApp credits.
--
-- Templates are editable so the wording can change without a deploy. They are
-- deliberately minimal here: the BODY of a report is assembled in TypeScript
-- (report-render.ts) because it is a variable-length document, not a sentence
-- with three holes in it. What the template controls is the title and the
-- framing.
-- ============================================================================

insert into public.notification_types (type, audience, default_channels, default_severity, description, purpose, template_title, template_body, variables)
values
  ('report.daily',   'tenant', array['whatsapp'], 'info',
   'Relatório comercial diário.',   'operacao',
   'Relatório diário', '{{texto}}', array['texto','link','equipe','periodo']),
  ('report.weekly',  'tenant', array['whatsapp'], 'info',
   'Relatório comercial semanal.',  'operacao',
   'Relatório semanal', '{{texto}}', array['texto','link','equipe','periodo']),
  ('report.monthly', 'tenant', array['whatsapp'], 'info',
   'Relatório comercial mensal.',   'operacao',
   'Relatório mensal', '{{texto}}', array['texto','link','equipe','periodo'])
on conflict (type) do update
  set purpose          = excluded.purpose,
      default_channels = excluded.default_channels,
      description      = excluded.description,
      variables        = excluded.variables;

-- ============================================================================
-- 2. ENQUEUE ONE REPORT TO ONE PHONE
--
-- Modelled on notify_prospect (Sprint 8.4/8.5): write the notification with an
-- explicit recipient_phone, then one delivery row per channel, and let the
-- existing dispatcher do the sending.
--
-- equipe_id IS set here (unlike notify_prospect, where the recipient is not a
-- tenant yet) so the message is attributable to the client it describes and
-- shows up in their notification history.
--
-- No dedup_key: the run's unique (schedule_id, period_start) already guarantees
-- a period is built once, and a dedup key here would additionally block a
-- deliberate re-send after a delivery failure — which is the one case where
-- sending the same text twice is correct.
-- ============================================================================

create or replace function public.notify_report(
  p_run_id uuid,
  p_phone  text,
  p_text   text,
  p_link   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_run   public.report_runs%rowtype;
  v_sched public.report_schedules%rowtype;
  v_type  text;
  v_row   public.notification_types%rowtype;
  v_id    uuid;
  v_ch    text;
  v_data  jsonb;
begin
  select * into v_run from public.report_runs where id = p_run_id;
  if not found then
    raise exception 'report_run_not_found' using errcode = 'P0002';
  end if;

  select * into v_sched from public.report_schedules where id = v_run.schedule_id;
  if not found then
    raise exception 'report_schedule_not_found' using errcode = 'P0002';
  end if;

  v_type := 'report.' || v_sched.frequency;
  select * into v_row from public.notification_types where type = v_type;
  if not found then
    raise exception 'unknown_notification_type: %', v_type using errcode = 'P0001';
  end if;

  if coalesce(trim(p_phone), '') = '' then
    raise exception 'phone_required' using errcode = '22023';
  end if;

  v_data := jsonb_build_object(
    'texto',   p_text,
    'link',    coalesce(p_link, ''),
    'equipe',  coalesce(v_run.snapshot->>'equipe_name', ''),
    'periodo', to_char(v_run.period_start, 'DD/MM/YYYY')
  );

  insert into public.notifications (
    equipe_id, user_id, type, severity, title, body, action_url, data, recipient_phone
  )
  values (
    v_run.equipe_id, null, v_type, v_row.default_severity,
    coalesce(nullif(public.render_template(v_row.template_title, v_data), ''), v_sched.name),
    -- The body IS the rendered text. render_template lets an operator wrap it,
    -- but {{texto}} on its own is the sane default.
    coalesce(nullif(public.render_template(v_row.template_body, v_data), ''), p_text),
    p_link, v_data, p_phone
  )
  returning id into v_id;

  foreach v_ch in array v_row.default_channels loop
    -- No in-app copy: this is a push to a phone, and the report already lives
    -- in the product at its own URL.
    if v_ch = 'in_app' then continue; end if;
    insert into public.notification_deliveries (notification_id, channel)
    values (v_id, v_ch)
    on conflict (notification_id, channel) do nothing;
  end loop;

  return v_id;
end;
$fn$;

comment on function public.notify_report(uuid, text, text, text) is
  'Sprint 9: enqueue one report to one phone. Writes the notification + delivery rows; the Sprint 8.4 dispatcher does the actual sending via sendViaSolo.';

revoke all on function public.notify_report(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_report(uuid, text, text, text) to service_role;

-- ============================================================================
-- 3. READING A REPORT BY ITS TOKEN
--
-- For the public page. SECURITY DEFINER and service_role-only: the edge
-- function reads it with the service key, exactly like public-proposal does.
-- report_runs is never exposed to `anon` — that would publish every client's
-- revenue to anyone who could guess a uuid.
--
-- Returns NULL for an expired link rather than the data, so a forwarded message
-- from six months ago stops working.
-- ============================================================================

create or replace function public.get_report_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_run   public.report_runs%rowtype;
  v_sched public.report_schedules%rowtype;
begin
  select * into v_run from public.report_runs where public_token = p_token;
  if not found then
    return null;
  end if;

  if v_run.expires_at < now() then
    return jsonb_build_object('expired', true);
  end if;

  select * into v_sched from public.report_schedules where id = v_run.schedule_id;

  return jsonb_build_object(
    'expired',      false,
    'name',         coalesce(v_sched.name, 'Relatório comercial'),
    'frequency',    v_sched.frequency,
    'timezone',     coalesce(v_sched.timezone, 'America/Sao_Paulo'),
    'period_start', v_run.period_start,
    'period_end',   v_run.period_end,
    'created_at',   v_run.created_at,
    'snapshot',     v_run.snapshot
  );
end;
$$;

revoke all on function public.get_report_by_token(text) from public, anon, authenticated;
grant execute on function public.get_report_by_token(text) to service_role;

-- Supports the token lookup and the expiry sweep.
create index if not exists idx_report_runs_expires
  on public.report_runs (expires_at);

commit;

-- ============================================================================
-- OPERATOR SCRIPT — run in the SQL editor AFTER the deploy is healthy.
--
-- Nothing above registers a job. This migration is inert by the same convention
-- as 20260819000500_sprint8_billing_cron.sql: a cron definition needs the cron
-- secret, and a secret does not belong in git.
--
-- PREREQUISITES
--   1. pg_cron and pg_net enabled (Dashboard > Database > Extensions).
--   2. Edge secret BILLING_CRON_SECRET set (the reports tick reuses it —
--      one operational secret, not four).
--   3. No extra secret for the link: the report URL is resolved PER TENANT from
--      equipes.niche -> niches.domain by tenant_public_origin() (added in
--      20260830001100). Each client gets a link on their own white-label domain.
--   4. Function deployed:
--        supabase functions deploy reports-cron --project-ref egxzsivzqlqadoqpgfby
--
-- REGISTER (hourly, on the hour)
--
--   Hourly rather than every minute because send_hour has hour granularity:
--   a schedule can only ever be due on the hour, so 59 of every 60 ticks would
--   find nothing.
--
--     CREATE EXTENSION IF NOT EXISTS pg_cron;
--     CREATE EXTENSION IF NOT EXISTS pg_net;
--
--     SELECT cron.unschedule('sprint9_reports_tick')
--     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sprint9_reports_tick');
--
--     SELECT cron.schedule(
--       'sprint9_reports_tick',
--       '0 * * * *',
--       $$
--         SELECT net.http_post(
--           url     := 'https://<project>.supabase.co/functions/v1/reports-cron',
--           headers := jsonb_build_object(
--                        'Content-Type',  'application/json',
--                        'x-cron-secret', '<BILLING_CRON_SECRET>'
--                      ),
--           body    := '{}'::jsonb
--         );
--       $$
--     );
--
-- VERIFY
--     SELECT * FROM cron.job WHERE jobname = 'sprint9_reports_tick';
--     SELECT * FROM cron.job_run_details
--      WHERE jobname = 'sprint9_reports_tick' ORDER BY start_time DESC LIMIT 5;
--
--     -- what actually went out
--     SELECT r.created_at, r.status, r.recipients_n, r.error, s.name
--       FROM report_runs r JOIN report_schedules s ON s.id = r.schedule_id
--      ORDER BY r.created_at DESC LIMIT 10;
--
-- MANUAL RUN (safe — the unique constraint prevents a double send)
--     curl -X POST https://<project>.supabase.co/functions/v1/reports-cron \
--          -H 'x-cron-secret: <BILLING_CRON_SECRET>'
--
-- DISABLE
--     SELECT cron.unschedule('sprint9_reports_tick');
-- ============================================================================
