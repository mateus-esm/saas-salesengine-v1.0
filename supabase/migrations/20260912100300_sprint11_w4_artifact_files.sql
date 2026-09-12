-- Sprint 11 · Onda 4 · T42 — o arquivo do artefato, num bucket privado (decisão 24).
--
-- Proposta e contrato carregam CPF, endereço e valores. Os dois buckets que
-- existem são públicos (achado 29: quem tem a URL lê), então o arquivo do
-- artefato vai para um bucket PRIVADO: `artifacts`, caminho
-- `{equipe}/{tabela}/{registro}/{arquivo}`; a política do Storage olha a pasta
-- da equipe (a primeira do caminho); ver é por URL assinada de curta duração.
--
-- O valor do campo (em data[field_id]) é a lista dos arquivos: caminho, nome,
-- tamanho, tipo e quando entrou. Excluir o registro (soft delete) não apaga os
-- arquivos.

insert into storage.buckets (id, name, public, file_size_limit)
values ('artifacts', 'artifacts', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists artifacts_team_read on storage.objects;
create policy artifacts_team_read on storage.objects
  for select to authenticated using (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] in (select p.equipe_id::text from public.profiles p where p.id = auth.uid())
  );

drop policy if exists artifacts_team_write on storage.objects;
create policy artifacts_team_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] in (select p.equipe_id::text from public.profiles p where p.id = auth.uid())
  );

drop policy if exists artifacts_team_update on storage.objects;
create policy artifacts_team_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] in (select p.equipe_id::text from public.profiles p where p.id = auth.uid())
  )
  with check (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] in (select p.equipe_id::text from public.profiles p where p.id = auth.uid())
  );

drop policy if exists artifacts_team_delete on storage.objects;
create policy artifacts_team_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'artifacts'
    and (storage.foldername(name))[1] in (select p.equipe_id::text from public.profiles p where p.id = auth.uid())
  );
