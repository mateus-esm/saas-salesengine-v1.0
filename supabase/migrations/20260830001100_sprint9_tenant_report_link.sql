-- 20260830001100_sprint9_tenant_report_link.sql
-- Sprint 9 · T13 fix — o link do relatório é POR CLIENTE, não global.
--
-- O QUE ESTAVA ERRADO
--
-- A T13 montava o link a partir de um secret único, PUBLIC_APP_URL. Isso é
-- falso para este produto: cada cliente acessa o app pelo próprio domínio —
-- casaflow.soloventures.com.br, solon.soloventures.com.br, bmg… — resolvido
-- por hostname contra `niches` (ver TenantContext.tsx).
--
-- Com um secret só, o relatório da Casa Flow chegaria com um link do domínio de
-- outro cliente. Funcionaria — é o mesmo app, o token é o mesmo — e seria
-- péssimo mesmo assim: o cliente clica e vê a marca de um concorrente na tela
-- de login. Num produto white-label isso não é um detalhe cosmético, é a
-- promessa central quebrada na única mensagem que ele recebe automaticamente.
--
-- A CORREÇÃO REMOVE UM PASSO DE DEPLOY EM VEZ DE ADICIONAR
--
-- O domínio certo já está no banco: equipes.niche -> niches.domain. Não é
-- preciso secret nenhum. Uma fonte de verdade a menos para desincronizar, e um
-- item a menos no runbook.
--
-- QUANDO NÃO DÁ PARA RESOLVER
--
-- Uma equipe sem niche (a "Solo Teste" está assim hoje) cai no domínio do niche
-- 'default'. Se nem esse existir, a função devolve NULL e o relatório sai com
-- os números e sem a linha do link — a Sprint 8.5 decidiu o contrário para
-- PROPOSTA (lá o envio falha sem link, porque uma proposta sem link é uma
-- mensagem inútil). Um relatório é diferente: os números são o conteúdo, o link
-- é o complemento. Melhor entregar o resumo sem link do que não entregar.

begin;

create or replace function public.tenant_public_origin(p_equipe_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select 'https://' || d
    from (
      select coalesce(
               -- o domínio do próprio cliente
               (select n.domain
                  from public.equipes e
                  join public.niches n on n.id = e.niche
                 where e.id = p_equipe_id
                   and n.active
                 limit 1),
               -- equipe sem niche: cai no domínio institucional
               (select n2.domain from public.niches n2
                 where n2.id = 'default' and n2.active limit 1)
             ) as d
    ) s
   where d is not null and d <> '';
$$;

comment on function public.tenant_public_origin(uuid) is
  'Sprint 9: a origem pública do app PARA ESTA EQUIPE (https://casaflow.soloventures.com.br). O produto é white-label por domínio; um link global mandaria o cliente para a marca de outro. NULL quando não há domínio resolvível — o relatório então sai sem link, não deixa de sair.';

grant execute on function public.tenant_public_origin(uuid) to authenticated, service_role;

commit;
