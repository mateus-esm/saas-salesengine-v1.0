-- A revisão encontrou a proteção da Sprint 8.2 ausente na view viva.
-- Restabelece RLS das tabelas-base sem mudar colunas nem cálculo de contrato,
-- créditos ou assentos. Chamadas de servidor continuam com as mesmas permissões.
alter view public.v_tenant_entitlements set (security_invoker = on);
