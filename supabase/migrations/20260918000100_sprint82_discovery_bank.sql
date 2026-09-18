-- Sprint 8.2 · discovery_q&a · T70 — o banco de perguntas do discovery.
--
-- Mora no banco, e não em TypeScript, porque o formulário é Vite e a validação
-- é Deno: em código, o banco de perguntas teria duas cópias, e duas cópias
-- significam o formulário perguntar uma coisa enquanto a validação cobra outra.
-- Aqui é uma cópia só — e o texto de uma pergunta pode ser afinado sem deploy,
-- como já acontece com os templates de notificação.
--
-- `maps_to` é o que transforma resposta em configuração depois (T79): diz se a
-- pergunta sustenta o agente, o CRM, os canais ou o time.
-- `niche_id` nulo = pergunta de todo mundo; preenchido = só daquele segmento.

create table if not exists public.discovery_questions (
  code          text primary key,
  block         text not null,
  block_label   text not null,
  sort_order    int  not null,
  label         text not null,
  help          text,
  type          text not null check (type in ('text','textarea','select','select_other','multi')),
  -- [{ "value": "padrao", "label": "Novo lead -> Em contato -> ..." }]
  options       jsonb not null default '[]'::jsonb,
  default_value jsonb,
  required      boolean not null default false,
  maps_to       text not null check (maps_to in ('agent','crm','channels','team')),
  niche_id      text references public.niches(id) on delete cascade,
  max_select    int,
  active        boolean not null default true
);

create index if not exists idx_discovery_questions_order
  on public.discovery_questions (sort_order) where active;

alter table public.discovery_questions enable row level security;

-- O painel admin lê o banco de perguntas para mostrar as respostas com o texto
-- da pergunta. O público NÃO lê daqui: passa pela edge function.
drop policy if exists discovery_questions_read on public.discovery_questions;
create policy discovery_questions_read on public.discovery_questions
  for select to authenticated using (active);
-- Sem política de escrita: só o service_role semeia e edita.

insert into public.discovery_questions
  (code, block, block_label, sort_order, label, help, type, options, default_value, required, maps_to, max_select)
values
-- ── 1 · A empresa e a oferta ────────────────────────────────────────────────
('empresa.o_que_vende','empresa','A empresa e a oferta',10,
 'Em uma frase: o que a sua empresa vende, e para quem?',
 'É a primeira coisa que o agente vai saber sobre vocês.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('oferta.itens','empresa','A empresa e a oferta',20,
 'Liste seus produtos ou serviços, com preço ou faixa de preço.',
 'Um por linha. Se o preço varia, escreva a faixa — o agente só pode falar o que você escrever aqui.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('oferta.diferencial','empresa','A empresa e a oferta',30,
 'Por que o cliente escolhe vocês, e não o concorrente?',
 null,'textarea','[]'::jsonb,null,true,'agent',null),
('oferta.materiais','empresa','A empresa e a oferta',40,
 'Links de site, catálogo, apresentação ou FAQ.',
 'Opcional. Tudo que você colar aqui vira material de treino do agente.',
 'textarea','[]'::jsonb,null,false,'agent',null),

-- ── 2 · Quem é cliente (e quem não é) ───────────────────────────────────────
('cliente.ideal','cliente','Quem é cliente (e quem não é)',50,
 'Descreva o seu cliente ideal.',
 'Perfil, região, momento e a dor que ele tem quando procura vocês.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('cliente.nao_e','cliente','Quem é cliente (e quem não é)',60,
 'Quem vocês NÃO atendem? Que pedidos estão fora do escopo?',
 'Isso evita que o agente prometa o que vocês não entregam.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('cliente.qualificacao','cliente','Quem é cliente (e quem não é)',70,
 'O que você precisa saber de um lead antes de passar para um vendedor?',
 'As perguntas que o seu melhor vendedor faz antes de investir tempo.',
 'textarea','[]'::jsonb,null,true,'agent',null),

-- ── 3 · Como vende hoje ─────────────────────────────────────────────────────
('funil.etapas','funil','Como vende hoje',80,
 'Qual desses funis mais parece com o seu?',
 'Escolha o mais próximo — a gente ajusta na reunião.',
 'select_other',
 '[{"value":"padrao","label":"Novo lead → Em contato → Qualificado → Proposta enviada → Ganho / Perdido"},
   {"value":"com_reuniao","label":"Novo lead → Em contato → Reunião/Visita → Proposta → Negociação → Ganho / Perdido"},
   {"value":"curto","label":"Novo lead → Qualificado → Ganho / Perdido"}]'::jsonb,
 '"padrao"'::jsonb,true,'crm',null),
('funil.motivos_perda','funil','Como vende hoje',90,
 'Quando vocês perdem uma venda, costuma ser por quê?',
 'Já marcamos os motivos mais comuns. Desmarque o que não se aplica.',
 'multi',
 '[{"value":"preco","label":"Preço"},{"value":"sem_retorno","label":"Sumiu / não respondeu"},
   {"value":"concorrente","label":"Fechou com concorrente"},{"value":"fora_perfil","label":"Fora do perfil"},
   {"value":"sem_orcamento","label":"Sem orçamento"},{"value":"adiou","label":"Adiou a decisão"}]'::jsonb,
 '["preco","sem_retorno","concorrente","fora_perfil","sem_orcamento","adiou"]'::jsonb,true,'crm',null),
('funil.origens','funil','Como vende hoje',100,
 'De onde chegam seus leads hoje?',
 null,'multi',
 '[{"value":"whatsapp","label":"WhatsApp"},{"value":"instagram","label":"Instagram"},
   {"value":"meta_ads","label":"Anúncios Meta"},{"value":"google","label":"Google"},
   {"value":"indicacao","label":"Indicação"},{"value":"site","label":"Site"},
   {"value":"lista","label":"Lista / prospecção ativa"}]'::jsonb,
 '["whatsapp","instagram","meta_ads","indicacao","site"]'::jsonb,true,'crm',null),
('funil.ticket','funil','Como vende hoje',110,
 'Qual o ticket médio de uma venda?',
 null,'select',
 '[{"value":"ate_1k","label":"Até R$ 1 mil"},{"value":"1_5k","label":"R$ 1 mil a R$ 5 mil"},
   {"value":"5_20k","label":"R$ 5 mil a R$ 20 mil"},{"value":"20_100k","label":"R$ 20 mil a R$ 100 mil"},
   {"value":"acima_100k","label":"Acima de R$ 100 mil"},{"value":"varia","label":"Varia muito"}]'::jsonb,
 null,true,'crm',null),

-- ── 4 · O agente ────────────────────────────────────────────────────────────
('agente.nome','agente','O agente',120,
 'Como o agente vai se chamar?',
 'Um nome de gente funciona melhor que "Atendimento".',
 'text','[]'::jsonb,null,true,'agent',null),
('agente.objetivo','agente','O agente',130,
 'O que o agente precisa conseguir em cada conversa?',
 null,'select',
 '[{"value":"qualificar_agendar","label":"Qualificar e agendar uma reunião"},
   {"value":"qualificar_passar","label":"Qualificar e passar para um vendedor"},
   {"value":"vender_direto","label":"Tirar dúvidas e vender direto"},
   {"value":"suporte","label":"Atender quem já é cliente (suporte)"}]'::jsonb,
 '"qualificar_agendar"'::jsonb,true,'agent',null),
('agente.tom','agente','O agente',140,
 'Como ele deve soar? Escolha até 3.',
 null,'multi',
 '[{"value":"consultivo","label":"Consultivo"},{"value":"direto","label":"Direto"},
   {"value":"cordial","label":"Cordial"},{"value":"informal","label":"Informal"},
   {"value":"tecnico","label":"Técnico"},{"value":"entusiasmado","label":"Entusiasmado"},
   {"value":"formal","label":"Formal"}]'::jsonb,
 '["consultivo","direto","cordial"]'::jsonb,true,'agent',3),
('agente.objecoes','agente','O agente',150,
 'As 3 objeções que vocês mais ouvem — e como o seu melhor vendedor responde a cada uma.',
 'Esta é a resposta que mais muda a qualidade do agente. Vale o tempo.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('agente.nunca','agente','O agente',160,
 'O que o agente NUNCA pode dizer, prometer ou perguntar?',
 'Desconto que não existe, prazo que não se cumpre, assunto que não se toca.',
 'textarea','[]'::jsonb,null,true,'agent',null),
('agente.transfere','agente','O agente',170,
 'Quando ele deve passar a conversa para uma pessoa?',
 null,'multi',
 '[{"value":"pede_humano","label":"Quando o lead pede para falar com alguém"},
   {"value":"ja_e_cliente","label":"Quando já é cliente"},
   {"value":"reclamacao","label":"Reclamação ou problema"},
   {"value":"pede_desconto","label":"Quando pede desconto"},
   {"value":"qualificou","label":"Assim que o lead qualifica"}]'::jsonb,
 '["pede_humano","ja_e_cliente","reclamacao"]'::jsonb,true,'agent',null),

-- ── 5 · Canais e acessos ────────────────────────────────────────────────────
('canais.ativos','canais','Canais e acessos',180,
 'Em quais canais o agente vai atender?',
 null,'multi',
 '[{"value":"whatsapp","label":"WhatsApp"},{"value":"instagram","label":"Instagram"},
   {"value":"webchat","label":"Site (chat)"}]'::jsonb,
 '["whatsapp"]'::jsonb,true,'channels',null),
('canais.numero','canais','Canais e acessos',190,
 'Qual a situação do número de WhatsApp que o agente vai usar?',
 'Não coloque senha nem código aqui — só a situação.',
 'select',
 '[{"value":"novo_pronto","label":"Tenho um número novo, sem WhatsApp ativo nele"},
   {"value":"em_uso","label":"Vou usar o número que já uso hoje no WhatsApp"},
   {"value":"comprar","label":"Preciso comprar um número"},
   {"value":"confirmar","label":"A confirmar"}]'::jsonb,
 null,true,'channels',null),
('canais.agenda','canais','Canais e acessos',200,
 'Onde o agente marca as reuniões?',
 null,'select',
 '[{"value":"google","label":"Google Calendar"},{"value":"outra","label":"Outra agenda"},
   {"value":"nenhuma","label":"Não vamos agendar por enquanto"}]'::jsonb,
 '"google"'::jsonb,true,'channels',null),

-- ── 6 · Time e alertas ──────────────────────────────────────────────────────
('time.usuarios','time','Time e alertas',210,
 'Quem vai usar o sistema? Nome, e-mail e o que a pessoa faz.',
 'Inclua quem recebe os leads qualificados — é para essa pessoa que o agente transfere.',
 'textarea','[]'::jsonb,null,true,'team',null),
('time.horario','time','Time e alertas',220,
 'Qual o horário de atendimento humano?',
 null,'select_other',
 '[{"value":"seg_sex_8_18","label":"Segunda a sexta, 8h às 18h"},
   {"value":"seg_sex_9_19","label":"Segunda a sexta, 9h às 19h"},
   {"value":"seg_sab_8_18","label":"Segunda a sábado, 8h às 18h"},
   {"value":"sempre","label":"24 horas, todos os dias"}]'::jsonb,
 '"seg_sex_8_18"'::jsonb,true,'team',null),
('time.avisos','time','Time e alertas',230,
 'O que deve gerar um aviso para o seu time?',
 null,'multi',
 '[{"value":"lead_qualificado","label":"Lead qualificado"},{"value":"reuniao_marcada","label":"Reunião marcada"},
   {"value":"lead_sem_resposta","label":"Lead sem resposta há 24h"},{"value":"lead_perdido","label":"Lead perdido"},
   {"value":"toda_conversa","label":"Toda nova conversa"}]'::jsonb,
 '["lead_qualificado","reuniao_marcada","lead_sem_resposta"]'::jsonb,true,'team',null)
on conflict (code) do update set
  block = excluded.block, block_label = excluded.block_label, sort_order = excluded.sort_order,
  label = excluded.label, help = excluded.help, type = excluded.type, options = excluded.options,
  default_value = excluded.default_value, required = excluded.required, maps_to = excluded.maps_to,
  max_select = excluded.max_select, active = true;

-- Perguntas de segmento. Só aparecem para quem é daquele nicho — é o que torna
-- o formulário "já moldado" em vez de genérico.
insert into public.discovery_questions
  (code, block, block_label, sort_order, label, help, type, options, default_value, required, maps_to, niche_id)
select v.code, v.block, v.block_label, v.sort_order, v.label, v.help, v.type,
       v.options, v.default_value, v.required, v.maps_to, v.niche_id
  from (values
  ('funil.consumo_medio','funil','Como vende hoje',112,
   'Qual o consumo médio (kWh) de um cliente típico de vocês?',
   'Vira campo do CRM e pergunta de qualificação do agente.',
   'text','[]'::jsonb,null::jsonb,false,'crm','solon'),
  ('funil.tipo_imovel','funil','Como vende hoje',112,
   'Quais tipos de imóvel vocês trabalham?',
   'Vira campo do CRM e pergunta de qualificação do agente.',
   'text','[]'::jsonb,null::jsonb,false,'crm','imob')
) as v(code,block,block_label,sort_order,label,help,type,options,default_value,required,maps_to,niche_id)
 where exists (select 1 from public.niches n where n.id = v.niche_id)
on conflict (code) do nothing;

comment on table public.discovery_questions is
  'Sprint 8.2 discovery_q&a — o banco de perguntas do discovery. Editável sem deploy.';
