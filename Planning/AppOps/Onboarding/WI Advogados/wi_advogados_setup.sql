-- Onboarding WI Advogados — setup do CRM + Copilot a partir do discovery (18/09).
-- Duas pipelines (Passivo Bancário e Isenção IRPF), mesmas etapas, campos próprios.
-- Idempotente: pipeline que já existe é pulada.
begin;
do $$
declare
  eq uuid := 'e5bda77f-cec0-485e-8d52-404b4fb11ac6';
  cfg record;
  p uuid;
  s_novo uuid; s_qual uuid; s_leit uuid;
begin
  if (select nome from equipes where id = eq) <> 'WI Advogados' then
    raise exception 'equipe errada';
  end if;

  for cfg in
    select * from (values
      ('WI | Passivo Bancário Empresarial',
       'Empresários com dívida bancária relevante. Regina faz a triagem e agenda a leitura do caso com o Dr. Walter.',
       jsonb_build_array(
         jsonb_build_object('field_id',gen_random_uuid(),'key','titular_divida','label','Titular da dívida','type','select','position',0,'required',false,
           'options',jsonb_build_array('Empresa (PJ)','CPF','Empresa e CPF'),'description','A dívida é da empresa, do CPF ou dos dois. Só CPF de consumo = fora do escopo.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','valor_divida','label','Valor aproximado da dívida','type','currency','position',1,'required',false,
           'description','Soma aproximada da dívida bancária.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','qtd_contratos','label','Nº de contratos','type','number','position',2,'required',false,'description','Quantos contratos bancários envolvidos.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','bancos','label','Bancos envolvidos','type','text','position',3,'required',false,'description','Quais instituições e quantas.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','situacao_pagamento','label','Situação de pagamento','type','select','position',4,'required',false,
           'options',jsonb_build_array('Em dia','Em atraso','Parte em atraso'),'description','A dívida está sendo paga ou em atraso.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','tentou_negociar','label','Já tentou negociar','type','select','position',5,'required',false,
           'options',jsonb_build_array('Sim','Não'),'description','Houve tentativa de negociação com o banco.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','cobranca_judicial','label','Cobrança / protesto / processo','type','select','position',6,'required',false,
           'options',jsonb_build_array('Nenhum','Cobrança','Protesto','Restrição de crédito','Processo/Execução'),'description','A situação mais grave já existente.')
       ),
       $h$Playbook WI — Passivo Bancário
- Regina pergunta uma coisa por vez: dívida PJ ou CPF, valor, nº de contratos e bancos, em dia ou atraso, tentativa de negociação, cobrança/protesto/processo. Preencha cada campo assim que a resposta aparecer.
- Lead respondeu e está no tema: "Qualificação".
- Qualificado = dívida bancária de empresa (ou empresa + CPF do sócio) com valor relevante e necessidade de decidir negociar/defender/ajuizar: "Qualificado".
- Fora do escopo (consumo geral, superendividamento PF, dívida não bancária, disputa societária): "Desqualificado", motivo "Fora do perfil".
- Leitura do caso com o Dr. Walter marcada: "Leitura do caso agendada".
- Pedido de desconto/preço, reclamação, já cliente ou pediu humano: criar nota "transferir ao Dr. Walter".
- Nunca registrar promessa de resultado, prazo ou honorários.$h$),
      ('WI | Isenção IRPF por Doença Grave',
       'Aposentados, reformados e pensionistas com doença grave. Regina faz a triagem e agenda a leitura do caso com o Dr. Walter.',
       jsonb_build_array(
         jsonb_build_object('field_id',gen_random_uuid(),'key','tipo_beneficio','label','Tipo de benefício','type','select','position',0,'required',false,
           'options',jsonb_build_array('Aposentadoria','Reforma (militar)','Pensão','Não recebe'),'description','Sem aposentadoria/reforma/pensão = não tem requisito.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','doenca','label','Doença','type','text','position',1,'required',false,'description','Doença informada (não afirmar que dá direito).'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','retencao_ir','label','Há retenção de IR','type','select','position',2,'required',false,
           'options',jsonb_build_array('Sim','Não','Não sabe'),'description','Se não há imposto retido sobre o benefício, não há o que isentar.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','data_diagnostico','label','Data do diagnóstico','type','date','position',3,'required',false,'description','Desde quando existe o diagnóstico (define valores anteriores).'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','fonte_pagadora','label','Fonte pagadora','type','select','position',4,'required',false,
           'options',jsonb_build_array('INSS','Regime próprio (servidor)','Forças Armadas','Previdência privada','Outra'),'description','Quem paga o benefício.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','possui_laudo','label','Possui laudo médico','type','select','position',5,'required',false,
           'options',jsonb_build_array('Sim','Não','Em providência'),'description','Se já tem laudo médico da doença.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','pendencias_fiscais','label','Pendências fiscais','type','select','position',6,'required',false,
           'options',jsonb_build_array('Não','Sim','Não sabe'),'description','Pendências relevantes com a Receita.'),
         jsonb_build_object('field_id',gen_random_uuid(),'key','quem_preenche','label','Quem está em contato','type','select','position',7,'required',false,
           'options',jsonb_build_array('Beneficiário','Familiar','Cuidador','Curador'),'description','Quem conversa com a Regina.')
       ),
       $h$Playbook WI — Isenção IRPF
- Regina pergunta uma coisa por vez: recebe aposentadoria/reforma/pensão, qual doença, se há retenção de IR, desde quando o diagnóstico, fonte pagadora, laudo, pendências fiscais, quem está preenchendo. Preencha cada campo assim que a resposta aparecer.
- Lead respondeu e está no tema: "Qualificação".
- Qualificado = recebe benefício + há retenção de IR + doença informada: "Qualificado". Nunca registrar que "tem direito".
- Não recebe benefício ou não há IR retido: "Desqualificado", motivo "Sem requisitos legais". Em dúvida: nota "análise humana" e manter.
- Leitura do caso com o Dr. Walter marcada: "Leitura do caso agendada".
- Pedido de desconto/preço, reclamação, já cliente ou pediu humano: criar nota "transferir ao Dr. Walter".
- Nunca registrar promessa de resultado, prazo ou honorários.$h$)
    ) v(name, descr, fields, hints)
  loop
    if exists (select 1 from pipelines where equipe_id = eq and name = cfg.name and deleted_at is null) then
      raise notice 'já existe: %', cfg.name; continue;
    end if;

    insert into pipelines (equipe_id, name, description, custom_fields_schema, card_field_ids, loss_reasons, natures)
    values (eq, cfg.name, cfg.descr, cfg.fields,
      '["native:value","native:time_in_phase","native:touchpoints","native:next_contact","native:whatsapp"]'::jsonb,
      '[{"label":"Fora do perfil","color":"#0ea5e9"},{"label":"Sem requisitos legais","color":"#64748b"},{"label":"Sumiu / não respondeu","color":"#94a3b8"},{"label":"Adiou a decisão","color":"#eab308"},{"label":"Honorários","color":"#ef4444"},{"label":"Fechou com outro escritório","color":"#a855f7"}]'::jsonb,
      '{"duration":{"mode":"continuous"},"offer":{"mode":"free","catalog_item_ids":[]},"process":{"mode":"milestones","milestones":["qualified","meeting_scheduled","meeting_done","proposal_sent","contract_signed"]}}'::jsonb)
    returning id into p;

    insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
     (eq,p,'Novo contato','#64748b',1,'open',null,24,'Chegou pelo WhatsApp, Instagram ou indicação; ainda sem triagem.')
    returning id into s_novo;
    insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
     (eq,p,'Qualificação','#3b82f6',2,'open',null,48,'Regina está fazendo as perguntas de triagem, uma por vez.')
    returning id into s_qual;
    insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
     (eq,p,'Qualificado','#8b5cf6',3,'open','qualified',4,'Caso dentro do escopo com as respostas de triagem completas. Passar ao Dr. Walter para agendar a leitura do caso.');
    insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
     (eq,p,'Leitura do caso agendada','#10b981',4,'open','meeting_scheduled',null,'Reunião de leitura do caso com o Dr. Walter marcada.')
    returning id into s_leit;
    insert into pipeline_stages_v2 (equipe_id,pipeline_id,name,color,position,stage_type,funnel_event,max_idle_hours,description) values
     (eq,p,'Leitura realizada','#14b8a6',5,'open','meeting_done',null,'Dr. Walter analisou o caso.'),
     (eq,p,'Proposta enviada','#f59e0b',6,'open','proposal_sent',120,'Proposta de honorários enviada.'),
     (eq,p,'Contratado','#22c55e',7,'won',null,null,'Contrato assinado.'),
     (eq,p,'Perdido','#ef4444',8,'lost',null,null,'Desistiu ou não fechou — registrar motivo.'),
     (eq,p,'Desqualificado','#94a3b8',9,'lost',null,null,'Fora do escopo ou sem requisitos legais.');

    insert into pipeline_agent_rules (equipe_id,pipeline_id,auto_create_opportunity,auto_advance_stages,auto_extract_custom_fields,
      cooldown_minutes,tools_enabled,reasoning_enabled,confidence_threshold,daily_run_cap,extraction_hints,triggers)
    values (eq,p,true,true,true,5,true,false,0.75,200,cfg.hints,
      jsonb_build_array(
        jsonb_build_object('id',gen_random_uuid(),'name','Sem resposta há 24h','active',true,
          'when',jsonb_build_object('type','idle_in_stage','stage_id',s_novo,'hours',24),
          'do',jsonb_build_array(jsonb_build_object('action','create_task','title_template','Lead sem resposta há 24h — retomar contato','due_in_hours',4))),
        jsonb_build_object('id',gen_random_uuid(),'name','Lead qualificado → Dr. Walter','active',true,
          'when',jsonb_build_object('type','stage_entered','stage_id',(select id from pipeline_stages_v2 where pipeline_id=p and name='Qualificado')),
          'do',jsonb_build_array(jsonb_build_object('action','add_tag','tag','qualificado'),
                                 jsonb_build_object('action','create_task','title_template','Lead qualificado — Dr. Walter agendar leitura do caso','due_in_hours',4))),
        jsonb_build_object('id',gen_random_uuid(),'name','Leitura marcada','active',true,
          'when',jsonb_build_object('type','stage_entered','stage_id',s_leit),
          'do',jsonb_build_array(jsonb_build_object('action','create_task','title_template','Preparar leitura do caso (revisar campos e documentos)','due_in_hours',12)))
      ));

    insert into copilot_agents (equipe_id, scope, pipeline_id, name, autonomy_mode)
    values (eq, 'pipeline', p, cfg.name, 'suggest');
    raise notice 'WI aplicado: % (%)', cfg.name, p;
  end loop;

  insert into origin_taxonomy (equipe_id, kind, label)
  select eq, k, l from (values ('origem','Instagram'),('origem','Indicação'),('canal','WhatsApp')) v(k,l)
  where not exists (select 1 from origin_taxonomy o where o.equipe_id = eq and o.label = v.l and o.deleted_at is null);

  -- IPVA-TEA saiu do escopo: arquiva (o único negócio é Ganho e fica como histórico)
  update pipelines set is_archived = true
   where equipe_id = eq and name = 'IPVA - Isenção TEA' and deleted_at is null;

  -- Studio AI: liga a Regina (GPT Maker) à equipe; atendimento continua desligado até o go-live
  update equipes set gpt_maker_agent_id = '3E868D4689FE20A2C48602DCB9711DFE',
                     workspace_id = '3DF0B5185EE8D036297542CEA8D0A899'
   where id = eq and gpt_maker_agent_id is null;
end $$;
commit;
