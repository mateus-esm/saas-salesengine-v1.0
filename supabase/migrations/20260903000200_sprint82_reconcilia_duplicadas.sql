-- 20260903000200_sprint82_reconcilia_duplicadas.sql
-- Sprint 8.2 · devolve cada login à equipe que tem os dados dele.
--
-- O QUE ACONTECEU (antes desta sprint, no provisionamento antigo):
--
-- `provision_tenant_from_proposal()` fazia `insert into equipes` sempre, sem
-- caminho para "esse cliente já está no software". Em 02/09, ao provisionar as
-- propostas aceitas, ele criou equipes NOVAS e vazias para clientes que já
-- operavam aqui — e o `ensureInvite` moveu o perfil de cada um para a equipe
-- nova, porque o e-mail já existia.
--
-- Do lado de quem usa, isso parece perda total de dados:
--
--   Solo Energia · o login mateus@soloenergia.com.br foi para a equipe de 02/09,
--   que tem 0 chats, 0 pipelines e 0 leads. Os 470 chats, as 3 pipelines, as 17
--   etapas e os 456 leads continuam na equipe de 26/12/2025, intactos, mas
--   invisíveis para ele.
--
-- ESTA MIGRATION NÃO APAGA NADA. Ela só move as referências de volta para a
-- equipe que tem a operação. As equipes duplicadas continuam existindo, vazias
-- e inofensivas; apagá-las é o script de limpeza, que é uma decisão à parte.
--
-- A REGRA, e por que ela não cita uuid: entre duas equipes de mesmo nome, a que
-- vale é a que tem mais conversas. Dado de atendimento não se recria — é o que
-- distingue um ambiente vivo de uma casca criada por engano.

do $$
declare
  v_keep uuid;
  v_drop uuid;
  v_nome text;
  v_movidos integer := 0;
begin
  for v_nome in
    select nome from public.equipes group by nome having count(*) > 1
  loop
    -- a que fica: mais conversas; empate desfeito pela mais antiga
    select id into v_keep from public.equipes
     where nome = v_nome
     order by (select count(*) from public.conversations c where c.equipe_id = equipes.id) desc,
              created_at asc
     limit 1;

    for v_drop in
      select id from public.equipes where nome = v_nome and id <> v_keep
    loop
      -- Só reconcilia quando a candidata a sair é mesmo uma casca. Se as duas
      -- tiverem conversas, isto não é uma duplicata de provisionamento e
      -- ninguém deve mexer automaticamente.
      if (select count(*) from public.conversations c where c.equipe_id = v_drop) > 0 then
        raise notice 'pulando % : as duas equipes têm conversas', v_nome;
        continue;
      end if;

      -- 1. O LOGIN. É isto que faz o cliente ver os próprios dados de novo.
      update public.profiles set equipe_id = v_keep where equipe_id = v_drop;

      -- 2. O contrato, para o faturamento seguir a operação. A equipe que fica
      --    não pode ter um contrato vivo — se tiver, a fusão não é automática.
      if not exists (
        select 1 from public.contracts
         where equipe_id = v_keep
           and status in ('onboarding','trialing','active','past_due','suspended')
      ) then
        update public.contracts set equipe_id = v_keep where equipe_id = v_drop;
        update public.invoices  set equipe_id = v_keep where equipe_id = v_drop;
      end if;

      -- 3. A conta de cobrança: a que fica prevalece e só recebe o que lhe
      --    falta. A antiga da Solo Energia tem CPF e asaas_customer_id reais; a
      --    duplicata não tem nada, e sobrescrever perderia o cliente já criado
      --    no gateway.
      update public.billing_accounts k set
        doc_type          = coalesce(k.doc_type,          d.doc_type),
        doc_number        = coalesce(k.doc_number,        d.doc_number),
        legal_name        = coalesce(k.legal_name,        d.legal_name),
        billing_email     = coalesce(k.billing_email,     d.billing_email),
        phone             = coalesce(k.phone,             d.phone),
        asaas_customer_id = coalesce(k.asaas_customer_id, d.asaas_customer_id)
      from public.billing_accounts d
      where k.equipe_id = v_keep and d.equipe_id = v_drop;

      update public.billing_accounts set equipe_id = v_keep
       where equipe_id = v_drop
         and not exists (select 1 from public.billing_accounts x where x.equipe_id = v_keep);

      -- 4. A proposta e o card apontam para a equipe viva.
      update public.proposals set equipe_id = v_keep where equipe_id = v_drop;
      update public.proposals set target_equipe_id = v_keep where target_equipe_id = v_drop;

      if exists (select 1 from public.onboardings where equipe_id = v_keep) then
        update public.onboardings set equipe_id = null
         where equipe_id = v_drop and proposal_id is not null;
        delete from public.onboardings where equipe_id = v_drop;
      else
        update public.onboardings set equipe_id = v_keep where equipe_id = v_drop;
      end if;

      update public.wpp_instances set equipe_id = v_keep where equipe_id = v_drop;

      v_movidos := v_movidos + 1;
    end loop;
  end loop;

  raise notice 'Sprint 8.2 · % equipe(s) duplicada(s) reconciliada(s)', v_movidos;
end $$;

-- Um card por cliente: a duplicata sem dados não precisa aparecer no quadro.
delete from public.onboardings o
 where o.equipe_id is null
   and o.proposal_id is not null
   and exists (
     select 1 from public.onboardings x
      where x.equipe_id is not null
        and x.cliente_nome = o.cliente_nome
   );

-- ============================================================================
-- ASSERÇÕES
-- ============================================================================

do $$
declare
  v_cnt integer;
  v_eq  uuid;
begin
  -- (a) NENHUM login ficou preso numa equipe vazia enquanto existe uma equipe
  --     de mesmo nome com conversas. É a verificação que traduz o sintoma
  --     relatado ("perdi todos os chats") em algo que o banco sabe responder.
  select count(*) into v_cnt
    from public.profiles p
    join public.equipes e on e.id = p.equipe_id
   where (select count(*) from public.conversations c where c.equipe_id = e.id) = 0
     and exists (
       select 1 from public.equipes o
        where o.nome = e.nome and o.id <> e.id
          and (select count(*) from public.conversations c2 where c2.equipe_id = o.id) > 0
     );
  assert v_cnt = 0,
    format('ASSERT FAILED: %s login(s) ainda apontam para a equipe vazia', v_cnt);

  -- (b) o caso concreto: a Solo Energia do fundador tem os dados dela
  select p.equipe_id into v_eq from public.profiles p
   where p.email = 'mateus@soloenergia.com.br';
  select count(*) into v_cnt from public.conversations where equipe_id = v_eq;
  assert v_cnt > 400,
    format('ASSERT FAILED: a Solo Energia do login tem %s conversas, esperava mais de 400', v_cnt);
  select count(*) into v_cnt from public.pipelines where equipe_id = v_eq;
  assert v_cnt = 3, format('ASSERT FAILED: %s pipelines na Solo Energia, esperava 3', v_cnt);

  -- (c) o contrato acompanhou a operação
  assert exists (
    select 1 from public.contracts where equipe_id = v_eq
      and status in ('onboarding','trialing','active','past_due')
  ), 'ASSERT FAILED: a Solo Energia ficou sem contrato na equipe que opera';

  -- (d) nada foi apagado: as 12 equipes e as 7 propostas continuam lá
  select count(*) into v_cnt from public.equipes;
  assert v_cnt = 12, format('ASSERT FAILED: %s equipes, esperava 12 — nada deveria ter sido apagado', v_cnt);
  select count(*) into v_cnt from public.proposals;
  assert v_cnt = 7, format('ASSERT FAILED: %s propostas, esperava 7', v_cnt);

  -- (e) um cliente, um card
  select count(*) into v_cnt from (
    select cliente_nome from public.onboardings group by cliente_nome having count(*) > 1
  ) d;
  assert v_cnt = 0, format('ASSERT FAILED: %s cliente(s) com card duplicado no quadro', v_cnt);

  raise notice 'Sprint 8.2 · reconciliação: asserções passaram';
end $$;
