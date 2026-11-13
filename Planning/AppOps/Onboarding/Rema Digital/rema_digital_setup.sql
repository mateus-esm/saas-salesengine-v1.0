-- Onboarding Rema Digital — setup do CRM + Copilot a partir do discovery (23/09).
-- Mesmas linhas que a tela "Nova pipeline" grava (src/hooks/usePipelines.ts).
-- Idempotente: se a pipeline nova já existe, não faz nada.
begin;
do $$
declare
  eq  uuid := '33b33ec5-2325-4e34-aa2d-2070e964f4de';
  old uuid;
  p   uuid;
  s_novo uuid; s_tent uuid; s_dec uuid; s_mql uuid; s_ag uuid; s_reu uuid;
  pname text := 'Rema | Performance E-commerce Moda';
begin
  if (select nome from equipes where id = eq) <> 'Rema Digital' then
    raise exception 'equipe errada';
  end if;
  if exists (select 1 from pipelines where equipe_id = eq and name = pname and deleted_at is null) then
    raise notice 'já aplicado'; return;
  end if;

  select id into old from pipelines
   where equipe_id = eq and name = 'Rema Digital | B2B - Ecommerce Moda' and deleted_at is null;

  insert into pipelines (equipe_id, name, description, custom_fields_schema, card_field_ids, loss_reasons, natures)
  values (eq, pname,
    'Marcas próprias de moda com e-commerce estagnado. Rafael qualifica e agenda reunião com o especialista (Renan).',
    jsonb_build_array(
      -- mesmo field_id da pipeline antiga: os negócios movidos mantêm o valor
      jsonb_build_object('field_id','304d68e4-8712-4c9b-8d3a-db8770503593','key','faturamento_do_e_commerce','label','Faturamento do E-Commerce','type','currency','position',0,'required',false,
        'description','Faturamento MENSAL só do site. Qualifica a partir de R$ 10 mil/mês.'),
      jsonb_build_object('field_id',gen_random_uuid(),'key','faturamento_total','label','Faturamento total da empresa','type','currency','position',1,'required',false,
        'description','Faturamento mensal somando todos os canais (loja física, atacado, site). ICP: R$ 70 mil a R$ 400 mil.'),
      jsonb_build_object('field_id',gen_random_uuid(),'key','segmento','label','Segmento','type','select','position',2,'required',false,
        'options',jsonb_build_array('Moda feminina','Moda masculina','Moda infantil','Moda praia/fitness','Calçados','Acessórios','Outro'),
        'description','Nicho da marca. Fora de moda/acessórios = fora do perfil.'),
      jsonb_build_object('field_id',gen_random_uuid(),'key','marca_propria','label','Marca própria','type','select','position',3,'required',false,
        'options',jsonb_build_array('Sim','Não - revende marcas','Réplica/Dropshipping'),
        'description','Revenda de grandes marcas, réplicas e dropshipping são fora do perfil (salvo exceção).'),
      jsonb_build_object('field_id',gen_random_uuid(),'key','plataforma','label','Plataforma do e-commerce','type','select','position',4,'required',false,
        'options',jsonb_build_array('Shopify','Nuvemshop','VTEX','Tray','Loja Integrada','WooCommerce','Outra','Não tem e-commerce'),
        'description','Onde a loja online roda. "Não tem e-commerce" = fora do perfil.'),
      jsonb_build_object('field_id',gen_random_uuid(),'key','canais_venda','label','Canais de venda','type','select','position',5,'required',false,
        'options',jsonb_build_array('Só e-commerce','Varejo físico + e-commerce','Atacado + e-commerce','Varejo + atacado + e-commerce'),
        'description','Como a marca vende hoje.'),
      jsonb_build_object('field_id',gen_random_uuid(),'key','vende_brasil','label','Vende para todo o Brasil','type','select','position',6,'required',false,
        'options',jsonb_build_array('Sim','Não'),'description','Se não entrega no Brasil inteiro, analisar caso a caso.'),
      jsonb_build_object('field_id',gen_random_uuid(),'key','decisor','label','Fala com o decisor','type','select','position',7,'required',false,
        'options',jsonb_build_array('Sim - fundador/sócio','Não - funcionário'),'description','Quem está conversando é dono/fundador da marca?'),
      jsonb_build_object('field_id',gen_random_uuid(),'key','agencia_atual','label','Agência atual','type','select','position',8,'required',false,
        'options',jsonb_build_array('Não tem','Tem agência','Tem freelancer','Negociando com outra agência'),'description','Situação atual de quem cuida do digital.'),
      jsonb_build_object('field_id',gen_random_uuid(),'key','principal_dor','label','Principal dor','type','text','position',9,'required',false,
        'description','Resumo em uma frase do que trava o e-commerce, nas palavras do lead.')
    ),
    '["native:value","native:time_in_phase","native:touchpoints","native:next_contact","native:whatsapp"]'::jsonb,
    '[{"label":"Preço","color":"#ef4444"},{"label":"Fora do perfil","color":"#0ea5e9"},{"label":"Adiou a decisão","color":"#eab308"},{"label":"Sem orçamento","color":"#f97316"},{"label":"Fechou com concorrente","color":"#a855f7"},{"label":"Sumiu / não respondeu","color":"#64748b"}]'::jsonb,
    '{"duration":{"mode":"continuous"},"offer":{"mode":"free","catalog_item_ids":[]},"process":{"mode":"milestones","milestones":["qualified","meeting_scheduled","meeting_done","proposal_sent","contract_sent","contract_signed"]}}'::jsonb)
  returning id into p;

  insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
   (eq,p,'Novo lead','#64748b',1,'open',null,24,'Lead acabou de chegar (anúncio Meta / WhatsApp) e ainda não houve troca de mensagens.')
  returning id into s_novo;
  insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
   (eq,p,'Tentativa de Contato','#94a3b8',2,'open',null,24,'Rafael já mandou mensagem e o lead ainda não respondeu.')
  returning id into s_tent;
  insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
   (eq,p,'Conexão Decisor','#3b82f6',3,'open',null,48,'O lead respondeu e é o dono/fundador da marca. Rafael está coletando os dados de qualificação.')
  returning id into s_dec;
  insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
   (eq,p,'Qualificado (MQL)','#8b5cf6',4,'open','qualified',2,'Marca própria de moda/acessórios, já tem e-commerce, site fatura R$ 10 mil+/mês, vende no Brasil e fala com o decisor. Handoff imediato ao especialista.')
  returning id into s_mql;
  insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
   (eq,p,'Em agendamento','#f59e0b',5,'open',null,24,'Lead qualificado aceitou conversar; combinando dia e horário.')
  returning id into s_ag;
  insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
   (eq,p,'Reunião agendada','#10b981',6,'open','meeting_scheduled',null,'Data e hora da reunião com o especialista confirmadas.')
  returning id into s_reu;
  insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
   (eq,p,'Reunião realizada','#14b8a6',7,'open','meeting_done',null,'A reunião com o especialista aconteceu.'),
   (eq,p,'Ganho','#22c55e',8,'won',null,null,'Contrato fechado.'),
   (eq,p,'Perdido','#ef4444',9,'lost',null,null,'Perdido ou fora do perfil — registrar o motivo.');

  -- Copilot: treino (dicas da linha + descrições acima) e automações
  insert into pipeline_agent_rules (equipe_id,pipeline_id,auto_create_opportunity,auto_advance_stages,auto_extract_custom_fields,
    cooldown_minutes,tools_enabled,reasoning_enabled,confidence_threshold,daily_run_cap,extraction_hints,triggers)
  values (eq,p,true,true,true,5,true,false,0.75,200,
$h$Playbook Rema (qualificação -> reunião com especialista)
- Lead mandou a 1ª resposta e é dono/fundador: mover para "Conexão Decisor". Se não é o decisor, registre em nota e mantenha.
- Preencha os campos sempre que a conversa trouxer a informação (faturamento do site, faturamento total, segmento, plataforma, canais, marca própria, decisor, agência, dor).
- Qualificado = marca própria de moda/acessórios + tem e-commerce + site >= R$ 10 mil/mês + vende no Brasil + decisor. Mover para "Qualificado (MQL)".
- Lead não informa faturamento: não desqualificar; anotar e seguir.
- Aceitou conversar com o especialista mas sem horário: "Em agendamento". Horário confirmado: "Reunião agendada".
- Fora do perfil (sem e-commerce, fora de moda, réplica, time de futebol, grife/grandes marcas, ótica, comida, sem capital, urgência extrema): mover para "Perdido" com motivo "Fora do perfil".
- Nunca registrar preço prometido nem garantia de resultado.$h$,
    jsonb_build_array(
      jsonb_build_object('id',gen_random_uuid(),'name','Sem resposta há 24h','active',true,
        'when',jsonb_build_object('type','idle_in_stage','stage_id',s_tent,'hours',24),
        'do',jsonb_build_array(jsonb_build_object('action','add_tag','tag','sem-resposta-24h'),
                               jsonb_build_object('action','create_task','title_template','Lead sem resposta há 24h — retomar contato','due_in_hours',2))),
      jsonb_build_object('id',gen_random_uuid(),'name','Lead qualificado → especialista','active',true,
        'when',jsonb_build_object('type','stage_entered','stage_id',s_mql),
        'do',jsonb_build_array(jsonb_build_object('action','add_tag','tag','mql'),
                               jsonb_build_object('action','create_task','title_template','Lead qualificado — Renan assumir a conversa','due_in_hours',1))),
      jsonb_build_object('id',gen_random_uuid(),'name','Reunião marcada','active',true,
        'when',jsonb_build_object('type','stage_entered','stage_id',s_reu),
        'do',jsonb_build_array(jsonb_build_object('action','create_task','title_template','Preparar reunião (revisar site e campos do lead)','due_in_hours',12)))
    ));

  insert into copilot_agents (equipe_id, scope, pipeline_id, name, autonomy_mode)
  values (eq, 'pipeline', p, pname, 'suggest');

  insert into origin_taxonomy (equipe_id, kind, label)
  select eq, k, l from (values ('canal','Meta Ads'),('origem','WhatsApp (anúncio Meta)')) v(k,l)
  where not exists (select 1 from origin_taxonomy o where o.equipe_id = eq and o.label = v.l and o.deleted_at is null);

  -- pipeline antiga: move os negócios abertos e arquiva
  if old is not null then
    update opportunities o set pipeline_id = p,
      stage_id = case s.name when 'Entrada' then s_novo when 'Tentativa de Contato' then s_tent
                             when 'Conexão Decisor' then s_dec when 'Conexão E-commerce' then s_dec
                             when 'Agendamento' then s_ag when 'Reunião Agendada' then s_reu else s_novo end
      from pipeline_stages_v2 s
     where s.id = o.stage_id and o.pipeline_id = old and o.status = 'open' and o.deleted_at is null;
    update pipelines set is_archived = true where id = old;
  end if;
  raise notice 'Rema aplicado: pipeline %', p;
end $$;
commit;
