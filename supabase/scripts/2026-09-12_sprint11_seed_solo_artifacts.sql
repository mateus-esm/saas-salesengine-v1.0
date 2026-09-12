-- Sprint 11 · Onda 4 · T46 — as tabelas de artefato da Solo Energia.
--
-- Ensaio: supabase/tests/sprint11_w4_seed_solo.test.sql (rollback, sobre a produção).
-- Aplicar só com aprovação do founder (T47), depois das migrations 20260912100100…0600.
--
-- "Propostas Comerciais": os campos da tabela do Jestor (achado 9 do plano — 213
-- propostas lá), em field_id, com consultas ao contato, ao valor e aos itens do
-- negócio. O status (Rascunho/Enviada/Aceita/Recusada) é o do artefato, não uma
-- coluna; "Link Formulário" do Jestor vira o formulário público do T45.
--
-- "Contratos": os Dados para Contrato, preenchidos pelo cliente no formulário
-- público (/f/:token), mais o contrato assinado (arquivo) e o link da assinatura.
--
-- Nomes: `proposals` e `contracts` no banco são as tabelas de COBRANÇA da Solo
-- Ventures; estas são tabelas personalizadas (slugs propostas_comerciais e
-- contratos). Idempotente: tabela que já existe (mesmo slug, não apagada) fica
-- como está. Os botões de automação (URLs do n8n) o founder configura na tela.

do $$
declare
  v_equipe constant uuid := '939d7dd8-592c-4fda-946e-3568f2909904';  -- Solo Energia
  c        jsonb;
begin
  if not exists (select 1 from public.equipes where id = v_equipe) then
    raise exception 'seed_solo: equipe Solo Energia não encontrada';
  end if;

  -- ------------------------------------------------------ Propostas Comerciais --
  if not exists (select 1 from public.custom_tables
                  where equipe_id = v_equipe and slug = 'propostas_comerciais' and deleted_at is null) then
    select jsonb_agg(col || jsonb_build_object('field_id', gen_random_uuid()::text) order by ord) into c
      from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('key', 'cliente',              'label', 'Cliente',                     'type', 'lookup', 'lookupConfig', jsonb_build_object('source', 'contact.name')),
        jsonb_build_object('key', 'telefone',             'label', 'Telefone',                    'type', 'lookup', 'lookupConfig', jsonb_build_object('source', 'contact.phone')),
        jsonb_build_object('key', 'email',                'label', 'E-mail',                      'type', 'lookup', 'lookupConfig', jsonb_build_object('source', 'contact.email')),
        jsonb_build_object('key', 'responsavel',          'label', 'Responsável',                 'type', 'lookup', 'lookupConfig', jsonb_build_object('source', 'deal.owner')),
        jsonb_build_object('key', 'itens',                'label', 'Itens do negócio',            'type', 'lookup', 'lookupConfig', jsonb_build_object('source', 'deal.items')),
        jsonb_build_object('key', 'valor_negocio',        'label', 'Valor do negócio',            'type', 'lookup', 'lookupConfig', jsonb_build_object('source', 'deal.value')),
        jsonb_build_object('key', 'fabricante',           'label', 'Fabricante',                  'type', 'text'),
        jsonb_build_object('key', 'modulo',               'label', 'Módulo',                      'type', 'text'),
        jsonb_build_object('key', 'numero_modulos',       'label', 'Nº de módulos',               'type', 'number'),
        jsonb_build_object('key', 'potencia_kwp',         'label', 'Potência (kWp)',              'type', 'number'),
        jsonb_build_object('key', 'inversor',             'label', 'Inversor',                    'type', 'text'),
        jsonb_build_object('key', 'potencia_inversor_kw', 'label', 'Potência do inversor (kW)',   'type', 'number'),
        jsonb_build_object('key', 'qtde_inversores',      'label', 'Qtde de inversores',          'type', 'number'),
        jsonb_build_object('key', 'tipo_estrutura',       'label', 'Tipo de estrutura',           'type', 'text'),
        jsonb_build_object('key', 'monitoramento',        'label', 'Monitoramento',               'type', 'text'),
        jsonb_build_object('key', 'consumo_medio_kwh',    'label', 'Consumo médio mensal (kWh)',  'type', 'number'),
        jsonb_build_object('key', 'sistema_valor',        'label', 'Sistema (R$)',                'type', 'currency'),
        jsonb_build_object('key', 'preco_total',          'label', 'Preço total',                 'type', 'currency'),
        jsonb_build_object('key', 'condicoes_pagamento',  'label', 'Condições de pagamento',      'type', 'text'),
        jsonb_build_object('key', 'equipamentos_extras',  'label', 'Equipamentos extras',         'type', 'text'),
        jsonb_build_object('key', 'adicionais',           'label', 'Adicionais',                  'type', 'text'),
        jsonb_build_object('key', 'exclusoes',            'label', 'Exclusões',                   'type', 'text'),
        jsonb_build_object('key', 'link_pdf',             'label', 'Link do PDF',                 'type', 'url'),
        jsonb_build_object('key', 'pdf',                  'label', 'PDF da proposta',             'type', 'file')
      )) with ordinality x(col, ord);

    insert into public.custom_tables (equipe_id, name, slug, description, artifact_kind, table_schema)
    values (v_equipe, 'Propostas Comerciais', 'propostas_comerciais',
            'Propostas de usina solar, presas ao negócio.', 'proposal', c);
  end if;

  -- ------------------------------------------------------------------ Contratos --
  if not exists (select 1 from public.custom_tables
                  where equipe_id = v_equipe and slug = 'contratos' and deleted_at is null) then
    select jsonb_agg(col || jsonb_build_object('field_id', gen_random_uuid()::text) order by ord) into c
      from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('key', 'cliente',             'label', 'Cliente',                            'type', 'lookup', 'lookupConfig', jsonb_build_object('source', 'contact.name')),
        jsonb_build_object('key', 'valor_negocio',       'label', 'Valor do negócio',                   'type', 'lookup', 'lookupConfig', jsonb_build_object('source', 'deal.value')),
        jsonb_build_object('key', 'itens',               'label', 'Itens do negócio',                   'type', 'lookup', 'lookupConfig', jsonb_build_object('source', 'deal.items')),
        jsonb_build_object('key', 'nome_completo',       'label', 'Nome completo / Razão social',       'type', 'text'),
        jsonb_build_object('key', 'cpf_cnpj',            'label', 'CPF/CNPJ',                           'type', 'text'),
        jsonb_build_object('key', 'rg_ie',               'label', 'RG / Inscrição estadual',            'type', 'text'),
        jsonb_build_object('key', 'nacionalidade',       'label', 'Nacionalidade',                      'type', 'text'),
        jsonb_build_object('key', 'estado_civil',        'label', 'Estado civil',                       'type', 'select',
                           'options', jsonb_build_array('Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)')),
        jsonb_build_object('key', 'profissao',           'label', 'Profissão',                          'type', 'text'),
        jsonb_build_object('key', 'data_nascimento',     'label', 'Data de nascimento',                 'type', 'date'),
        jsonb_build_object('key', 'email_contrato',      'label', 'E-mail para o contrato',             'type', 'text'),
        jsonb_build_object('key', 'telefone_contrato',   'label', 'Telefone para o contrato',           'type', 'phone'),
        jsonb_build_object('key', 'endereco',            'label', 'Endereço (rua, número, complemento)', 'type', 'text'),
        jsonb_build_object('key', 'bairro',              'label', 'Bairro',                             'type', 'text'),
        jsonb_build_object('key', 'cidade',              'label', 'Cidade',                             'type', 'text'),
        jsonb_build_object('key', 'uf',                  'label', 'UF',                                 'type', 'text'),
        jsonb_build_object('key', 'cep',                 'label', 'CEP',                                'type', 'text'),
        jsonb_build_object('key', 'endereco_instalacao', 'label', 'Endereço da instalação (se outro)',  'type', 'text'),
        jsonb_build_object('key', 'concessionaria',      'label', 'Concessionária',                     'type', 'text'),
        jsonb_build_object('key', 'unidade_consumidora', 'label', 'Nº da unidade consumidora (UC)',     'type', 'text'),
        jsonb_build_object('key', 'forma_pagamento',     'label', 'Forma de pagamento',                 'type', 'text'),
        jsonb_build_object('key', 'link_assinatura',     'label', 'Link da assinatura',                 'type', 'url'),
        jsonb_build_object('key', 'contrato_assinado',   'label', 'Contrato assinado',                  'type', 'file')
      )) with ordinality x(col, ord);

    insert into public.custom_tables (equipe_id, name, slug, description, artifact_kind, table_schema, form_config)
    values (v_equipe, 'Contratos', 'contratos', 'Contratos de usina solar, presos ao negócio.', 'contract', c,
            jsonb_build_object(
              'enabled', true,
              'title', 'Dados para Contrato',
              'intro', 'Preencha seus dados para prepararmos o contrato da sua usina solar. Leva uns 3 minutos.',
              'fields', (select jsonb_agg(jsonb_build_object('field_id', e.value->>'field_id',
                                                             'required', (e.value->>'key') = any (array[
                                                               'nome_completo', 'cpf_cnpj', 'email_contrato', 'telefone_contrato',
                                                               'endereco', 'cidade', 'uf', 'cep']))
                                          order by e.ordinality)
                           from jsonb_array_elements(c) with ordinality e(value, ordinality)
                          where e.value->>'key' in ('nome_completo', 'cpf_cnpj', 'rg_ie', 'nacionalidade', 'estado_civil',
                                                    'profissao', 'data_nascimento', 'email_contrato', 'telefone_contrato',
                                                    'endereco', 'bairro', 'cidade', 'uf', 'cep', 'endereco_instalacao',
                                                    'concessionaria', 'unidade_consumidora'))));
  end if;
end $$;
