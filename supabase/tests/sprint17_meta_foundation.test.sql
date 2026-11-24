-- Sprint 17 · Fase 1 — conta Meta, ativos, state do OAuth, exclusão de dados.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint17_meta_foundation.test.sql

begin;

-- @include supabase/migrations/20261124000100_sprint17_meta_foundation.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('51710000-0000-0000-0000-000000000001', 'S17 A', 'x', 'y'),
  ('51710000-0000-0000-0000-000000000002', 'S17 B', 'x', 'y');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare
  ia uuid; ib uuid; pa uuid; pb uuid; r jsonb;
  u1 uuid := '51710000-0000-0000-0000-0000000000a1';
  u2 uuid := '51710000-0000-0000-0000-0000000000a2';
  ea uuid := '51710000-0000-0000-0000-000000000001';
  eb uuid := '51710000-0000-0000-0000-000000000002';
  failed boolean;
begin
  -- ── state do OAuth: uso único, amarrado a usuário + equipe, expira ──
  perform public._crm_oauth_create('meta', ea, u1, 'h1');
  assert not public._crm_oauth_consume('meta', 'h1', ea, u2), 'outro usuário não consome';
  assert not public._crm_oauth_consume('meta', 'h1', eb, u1), 'outra equipe não consome';
  assert public._crm_oauth_consume('meta', 'h1', ea, u1), 'dono consome';
  assert not public._crm_oauth_consume('meta', 'h1', ea, u1), 'segunda vez não';
  perform public._crm_oauth_create('meta', ea, u1, 'h2');
  update public.crm_oauth_states set expires_at = now() - interval '1 second' where nonce_hash = 'h2';
  assert not public._crm_oauth_consume('meta', 'h2', ea, u1), 'expirado não';
  assert not public._crm_oauth_consume('meta', 'nunca', ea, u1), 'inexistente não';

  -- ── conta Meta por equipe (provider novo) ──
  ia := public._crm_integration_store_key(ea, 'meta', 'TOKEN-A-xxxxxxxx', '[]'::jsonb,
          jsonb_build_object('fb_user_id', 'FBU1', 'business_id', 'BIZ1'), u1);
  ib := public._crm_integration_store_key(eb, 'meta', 'TOKEN-B-xxxxxxxx', '[]'::jsonb,
          jsonb_build_object('fb_user_id', 'FBU2'), u2);

  -- ── ativos: sync cria disponíveis ──
  perform public._crm_meta_assets_sync(ia, '[{"asset_type":"page","external_id":"P1","name":"Página 1"},
                                             {"asset_type":"page","external_id":"P2","name":"Página 2"},
                                             {"asset_type":"dataset","external_id":"D1","name":"Pixel"}]'::jsonb);
  perform public._crm_meta_assets_sync(ib, '[{"asset_type":"page","external_id":"P1","name":"Página 1"}]'::jsonb);
  assert (select count(*) from public.crm_integration_assets where integration_id = ia and status = 'available') = 3, '3 disponíveis em A';

  select id into pa from public.crm_integration_assets where integration_id = ia and external_id = 'P1';
  select id into pb from public.crm_integration_assets where integration_id = ib and external_id = 'P1';

  -- ── uma página ativa em uma equipe só ──
  perform public._crm_asset_set_status(pa, 'active');
  failed := false;
  begin
    perform public._crm_asset_set_status(pb, 'active');
  exception when others then
    failed := sqlerrm like '%asset_active_elsewhere%';
  end;
  assert failed, 'mesma página não fica ativa em duas equipes';

  -- ── sync de novo não rebaixa a ativa; o que sumiu vira disconnected ──
  perform public._crm_meta_assets_sync(ia, '[{"asset_type":"page","external_id":"P1","name":"Página 1 (novo nome)"}]'::jsonb);
  assert (select status from public.crm_integration_assets where id = pa) = 'active', 'ativa continua ativa';
  assert (select name from public.crm_integration_assets where id = pa) = 'Página 1 (novo nome)', 'nome atualizado';
  assert (select status from public.crm_integration_assets where integration_id = ia and external_id = 'P2') = 'disconnected', 'P2 sumiu';

  -- ── segredo por ativo no Vault ──
  perform public._crm_asset_store_secret(pa, 'PAGE-TOKEN-1');
  assert public._crm_asset_secret(pa) = 'PAGE-TOKEN-1', 'lê o token da página';
  perform public._crm_asset_store_secret(pa, 'PAGE-TOKEN-2');
  assert public._crm_asset_secret(pa) = 'PAGE-TOKEN-2', 'troca o token';
  assert (select count(*) from vault.secrets where name = 'meta_asset:' || pa::text) = 1, 'um segredo só';

  -- ── exclusão de dados: só a integração daquele usuário do Facebook ──
  r := public._crm_meta_deletion('FBU1');
  assert (r->>'affected')::int = 1, 'afeta 1: ' || r::text;
  assert length(r->>'confirmation_code') >= 16, 'código de confirmação';
  assert (select status from public.crm_integrations where id = ia) = 'disconnected', 'A desconectada';
  assert (select status from public.crm_integrations where id = ib) = 'connected', 'B intacta';
  assert (select secret_id from public.crm_integrations where id = ia) is null, 'token da conta apagado';
  assert (select count(*) from vault.secrets where name = 'meta_asset:' || pa::text) = 0, 'token da página apagado';
  assert (select status from public.crm_integration_assets where id = pa) = 'disconnected', 'página desconectada';
  assert (public.crm_data_deletion_status(r->>'confirmation_code'))->>'status' = 'completed', 'status público';
  assert public.crm_data_deletion_status('nao-existe') is null, 'código inválido → null';

  -- B agora pode ativar P1 (A largou)
  perform public._crm_asset_set_status(pb, 'active');
  assert (select status from public.crm_integration_assets where id = pb) = 'active', 'B ativa P1';
end $$;

-- ── leitura pela equipe, sem secret_id (crm_integration_assets_list = isto com _crm_my_team()) ──
do $$
declare r jsonb;
begin
  r := public._crm_integration_assets_for('51710000-0000-0000-0000-000000000002');
  assert jsonb_array_length(r) = 1, 'B vê 1 ativo: ' || r::text;
  assert not (r->0 ? 'secret_id'), 'sem secret_id';
  assert r->0->>'external_id' = 'P1', 'é a P1';
end $$;

rollback;
select 'PASS' as result;
