-- Sprint 15 · T1 — o status "Gerado" (generated).
--
-- Proposta gerada não é proposta enviada. A automação "Gerar" devolvia `sent`
-- porque não havia outro status, e o negócio ganhava o marco `proposal_sent`
-- sem a proposta ter saído. `generated` fica logo depois de `draft`, vale para
-- os três tipos e NUNCA marca marco: `_crm_artifact_milestone` não muda (só
-- `sent`/`signed` provam marco).
--
-- Além da lista por tipo, o CHECK de `custom_table_records.artifact_status`
-- (T40) precisa aceitar o novo valor, senão o verbo falha ao gravar.

alter table public.custom_table_records drop constraint if exists custom_table_records_artifact_status_check;
alter table public.custom_table_records add constraint custom_table_records_artifact_status_check
  check (artifact_status is null or artifact_status in ('draft', 'generated', 'sent', 'accepted', 'signed', 'rejected'));

create or replace function public._crm_artifact_statuses(p_kind text)
returns text[]
language sql
immutable
as $$
  select case p_kind
    when 'proposal' then array['draft', 'generated', 'sent', 'accepted', 'rejected']
    when 'contract' then array['draft', 'generated', 'sent', 'signed', 'rejected']
    when 'document' then array['draft', 'generated', 'sent', 'accepted', 'signed', 'rejected']
  end;
$$;
