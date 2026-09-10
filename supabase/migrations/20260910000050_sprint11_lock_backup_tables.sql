-- 20260910000050_sprint11_lock_backup_tables.sql
-- Sprint 11 — as tabelas de backup estavam abertas para a internet.
--
-- O QUE FOI ACHADO (10/09/2026)
--
-- Tabela criada em `public` recebe, por padrão do Supabase, SELECT para `anon` e
-- `authenticated`. Sem RLS, a API entrega a tabela inteira para quem tiver a
-- chave anon — que vai dentro do bundle do frontend, ou seja, é pública.
--
-- Os backups das Sprints 3, 5.5, 8.2 (03/09) e 10 foram criados assim. Conferido
-- com a chave anon, pedindo só a contagem (HEAD, sem ler linha):
--
--   leads_backup_sprint10            200  468 linhas
--   messages_backup_sprint10         206  9.340 linhas
--   backup_20260903_equipes          200  3 linhas (inclui webhook_secret)
--   backup_20260903_profiles         200  2 linhas
--   backup_20260903_billing_accounts 200  3 linhas
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Liga RLS sem política nenhuma (anon e authenticated passam a ver zero linhas;
-- service_role continua lendo, que é para isso que backup serve) e tira os
-- privilégios de anon/authenticated. Não apaga nada. Aplicado à mão em 10/09
-- assim que foi achado; as duas instruções são idempotentes, então o
-- `supabase db push` pode repetir este arquivo sem erro.
--
-- REGRA DAQUI PARA A FRENTE
--
-- Todo `create table ... as select` de backup em `public` precisa, na mesma
-- transação: `alter table ... enable row level security;`.

do $$
declare
  t text;
  v_tables text[] := array[
    'backup_20260903_billing_accounts',
    'backup_20260903_conversations',
    'backup_20260903_equipes',
    'backup_20260903_leads',
    'backup_20260903_messages',
    'backup_20260903_onboardings',
    'backup_20260903_opportunities',
    'backup_20260903_profiles',
    'backup_20260903_stage_history',
    'backup_20260903b_billing_accounts',
    'backup_20260903b_contracts',
    'backup_20260903b_equipes',
    'backup_20260903b_onboardings',
    'backup_20260903b_profiles',
    'leads_backup_sprint10',
    'leads_backup_sprint3',
    'leads_backup_sprint55_pre_merge',
    'messages_backup_sprint10',
    'opportunities_backup_sprint10',
    -- Log da fusão de leads da Sprint 4 (EPIC 1): telefones normalizados e ids
    -- de lead de todas as equipes. Nenhum código do app lê esta tabela.
    'epic1_merge_log'
  ];
begin
  foreach t in array v_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
