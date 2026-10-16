begin;
-- @include supabase/migrations/20261016095058_sesup1_entitlements_tenant_scope.sql
insert into public.equipes(id,nome,crm_link,suporte_link) values
('5efa0000-0000-0000-0000-000000000001','Entitlement A','x','y'),
('5efa0000-0000-0000-0000-000000000002','Entitlement B','x','y');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values('5efb0000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','entitlement@sesup1.test','x',now(),now());
insert into public.profiles(id,user_id,email,equipe_id,nome_completo,role)
values('5efb0000-0000-0000-0000-000000000001','5efb0000-0000-0000-0000-000000000001','entitlement@sesup1.test','5efa0000-0000-0000-0000-000000000001','Entitlement','user')
on conflict(id) do update set equipe_id=excluded.equipe_id;
create temp table expected_entitlements as select * from public.v_tenant_entitlements;
grant select on expected_entitlements to authenticated,service_role;
set local request.jwt.claims='{"sub":"5efb0000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.v_tenant_entitlements)=1, 'só a própria equipe';
  assert (select to_jsonb(v) from public.v_tenant_entitlements v)=
         (select to_jsonb(v) from expected_entitlements v where equipe_id='5efa0000-0000-0000-0000-000000000001'), 'valores próprios preservados';
end $$;
reset role;
set local role service_role;
do $$ begin
  assert (select count(*) from public.v_tenant_entitlements)=(select count(*) from expected_entitlements), 'acesso de servidor preservado';
end $$;
reset role;
rollback;
select 'PASS' as result;
