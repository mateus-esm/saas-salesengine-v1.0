-- SE-DOCPIPE-001 — as colunas que faltam nos Contratos da Solo Energia.
--
-- Ensaio: supabase/tests/sedocpipe001_document_pipeline.test.sql (rollback).
-- Aplicar só com aprovação do dono, depois da migration 20260926100000.
--
-- Os quatro dados que o dono pediu no registro NÃO viram colunas fixas em
-- `opportunities`: moram no artefato preso ao negócio (decisão em
-- docs/dev/projects/saas-salesengine-v1.0/SE-DOCPIPE-001/claude/implementacao.md):
--
--   proposal_pdf_url      → Propostas Comerciais · `pdf` (arquivo, já existe)
--                           + `link_pdf` (url, já existe) se quiser o link do APITemplate
--   contract_pdf_url      → Contratos · `contrato_pdf` (arquivo, NOVO — o PDF mesclado
--                           que foi para assinatura) e `contrato_assinado` (arquivo, já existe)
--   clicksign_document_id → Contratos · `clicksign_document_id` (texto, NOVO)
--   signature_status      → status do artefato (`artifact_status`: draft/sent/signed/
--                           rejected), coluna de verdade que já move o negócio pelo marco
--
-- Idempotente: coluna com a mesma key (não apagada) fica como está. O field_id
-- nasce aqui (o gatilho da T39 também daria um, mas assim o ensaio o enxerga).

do $$
declare
  v_equipe constant uuid := '939d7dd8-592c-4fda-946e-3568f2909904';  -- Solo Energia
  v_t      public.custom_tables;
  v_add    jsonb := '[]'::jsonb;
  col      jsonb;
begin
  select * into v_t from public.custom_tables
   where equipe_id = v_equipe and slug = 'contratos' and deleted_at is null;
  if not found then
    raise exception 'sedocpipe001: tabela Contratos da Solo Energia não encontrada (rode antes a semente da T46)';
  end if;

  for col in select x.value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('key', 'clicksign_document_id', 'label', 'ID do documento no Clicksign', 'type', 'text'),
      jsonb_build_object('key', 'contrato_pdf',          'label', 'Contrato (PDF enviado)',       'type', 'file')
    )) x loop
    if not exists (select 1 from jsonb_array_elements(v_t.table_schema) c
                    where c->>'key' = col->>'key' and not coalesce((c->>'is_deleted')::boolean, false)) then
      v_add := v_add || jsonb_build_array(col || jsonb_build_object('field_id', gen_random_uuid()::text));
    end if;
  end loop;

  if jsonb_array_length(v_add) > 0 then
    update public.custom_tables set table_schema = table_schema || v_add where id = v_t.id;
  end if;
end $$;
