-- Sprint 16 · ajuste 3 — leads sem campanha agrupados pela origem antiga; ligar o grupo.
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint16_unlinked_sources.test.sql
begin;

-- @include supabase/migrations/20261123000400_sprint16_unlinked_sources.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values ('51620000-0000-0000-0000-000000000001', 'S16 Sources', 'x', 'y');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5162b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@s16-sources.test', 'x', now(), now());
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5162b000-0000-0000-0000-00000000000a', '5162b000-0000-0000-0000-00000000000a', 'a@s16-sources.test', '51620000-0000-0000-0000-000000000001', 'A', 'admin')
on conflict (id) do update set equipe_id = excluded.equipe_id;
insert into public.crm_campaigns (id, equipe_id, name, origin_category) values
  ('5162c000-0000-0000-0000-000000000001', '51620000-0000-0000-0000-000000000001', 'Meta histórico', 'paid_social');
insert into public.leads (equipe_id, name, origin_category, origin_detail, source) values
  ('51620000-0000-0000-0000-000000000001', 'a', 'paid_social', 'Tráfego Pago', 'Tráfego Pago'),
  ('51620000-0000-0000-0000-000000000001', 'b', 'paid_social', 'Tráfego Pago', 'Tráfego Pago'),
  ('51620000-0000-0000-0000-000000000001', 'c', 'paid_social', null, 'Tráfego Pago'),
  ('51620000-0000-0000-0000-000000000001', 'd', 'referral', 'Indicação', 'Indicação');

set local role authenticated;
set local request.jwt.claims = '{"sub":"5162b000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare g jsonb; n int;
begin
  g := public.crm_unlinked_sources(50);
  assert jsonb_array_length(g) = 2, 'dois grupos: ' || g::text;
  assert (g->0->>'label') = 'Tráfego Pago' and (g->0->>'leads')::int = 3, 'detalhe ou source antigo';
  n := public.crm_link_source('5162c000-0000-0000-0000-000000000001', 'paid_social', 'Tráfego Pago');
  assert n = 3, 'três ligados';
  assert jsonb_array_length(public.crm_unlinked_sources(50)) = 1, 'sobra a indicação';
  assert (select count(*) from public.leads where equipe_id = '51620000-0000-0000-0000-000000000001' and origin_category = 'referral' and campaign_id is null) = 1,
    'outra categoria não é tocada';
end $$;

rollback;
select 'PASS' as result;
