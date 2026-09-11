# Motores RevOps — a arquitetura do Sales Engine

> **Status:** aprovado pelo founder em 2026-09-11 (conversa de planejamento da Sprint 11 · Onda 2).
> **Vale para:** toda sprint a partir da 11. Toda tarefa diz qual motor ela avança.
> **Relacionados:** `Planning/Sprints/sprint_11_crm_v1.1.md` (onde a Sprint 11 constrói cada motor),
> `Planning/Sprints/future_sprint__mcp_v1.md` (changesets e portas — o mesmo princípio visto de fora),
> `Planning/Benchmark/Jestor/Jestor.md` (a referência de granularidade).

---

## 1. Por que motores

Até a Sprint 10, cada feature inventou o próprio caminho até o dado. O resultado aparece
na produção, sem erro nenhum na tela:

- **Campos personalizados:** cada escritor escolheu onde gravar o valor. 98% dos valores
  (6.242 de 6.368) estavam em chaves que nenhum pipeline declara — invisíveis em card,
  tabela e dashboard (Sprint 11 · T8).
- **WhatsApp e webhook:** `_shared/opportunities.ts` procurava uma etapa `'aberto'` depois
  que o tipo de etapa voltou para inglês. De 23/06 a 10/09 nenhum lead de WhatsApp virou
  negócio (297 leads fora de qualquer Kanban).
- **Ciclo:** a etapa `ciclo` tem configuração (WI Advogados 30 dias, Casa Flow 15 dias) e
  um endpoint no `python-agent`, mas nenhum cron chama o endpoint. Os negócios nunca voltam.
- **Ciclo de vida do contato:** `leads.lifecycle_stage` existe com trigger, e os 2.215
  contatos estão em `raw`. Ninguém nunca virou "cliente".
- **Tabelas:** cada tela trata os tipos de campo do seu jeito — na Tabela de Leads, campo
  Seleção abre um dropdown vazio e multi-seleção editada vira texto.

Motor é a resposta: **uma peça com um contrato**, usada por todas as telas e todas as
portas. Uma feature nova não cria caminho — ela usa um motor, ou estende um motor.

---

## 2. A regra de baixo de tudo

**Toda porta usa as mesmas operações.** A tela, o WhatsApp e o agente do Studio AI, os
webhooks, o Copilot e, depois, a API e o MCP mudam dado pelas mesmas funções do banco
(RPCs) e pelos mesmos tipos. Nenhuma porta tem atalho privado.

Consequências práticas:

1. **Regra de negócio mora no banco** (RPC `security invoker` + RLS; `security definer` só
   quando a regra exige ver além da RLS, com o tenant tirado do token). O frontend
   monta pedidos e desenha respostas.
2. **Um contrato por conceito, com gêmeo em TS e em SQL** quando os dois lados precisam
   dele (ex.: `CrmFilters` em `src/types/crmFilters.ts` ↔ `crm_opp_matches` no banco).
3. **Declarar antes de gravar.** Valor de campo só entra se o campo está declarado; o
   endereço é o `field_id`; a `key` é o nome público, imutável, usado só nas bordas.
4. **Nenhuma porta decide sozinha o que é "ganho", "responsável" ou "origem".** Esses
   significados vivem nos motores de Processo, Eventos e Entradas.

---

## 3. A lente: objetos, eventos, artefatos

A receita é uma **linha de produção**. A lente não copia Salesforce, HubSpot nem Jestor —
serve para decidir onde cada coisa mora.

| Na fábrica | No RevOps | No sistema |
| :-- | :-- | :-- |
| Matéria-prima | a demanda: uma pessoa que chega | **Contato** + de onde veio |
| Ordem de produção | uma tentativa de vender uma oferta a essa pessoa | **Negócio** |
| Linha de produção | o processo comercial | **Pipeline** (linha) |
| Estações | os passos | **Etapas** |
| Operadores | quem trabalha a ordem | **Responsável** + automações + IA |
| Trabalho na estação | mensagem, ligação, reunião, tarefa | **Atividades** |
| Peças produzidas | proposta, contrato, pedido | **Artefatos** |
| Controle de qualidade | qualificado, reunião feita, proposta enviada | **Marcos** |
| Produto acabado | ganho → dinheiro → cliente | **Ganho → Receita** |
| Refugo e retrabalho | perdido, com motivo → tentar de novo depois | **Perdido → Reciclo** |
| Reposição | o serviço vence de novo | **Recorrência → nova ordem** |
| Especificação | o que a linha vende, a que preço | **Catálogo** |

### 3.1 Objetos — têm identidade e um estado atual que muda

- **Contato é a pessoa.** Existe uma vez por tenant, atravessa todos os pipelines e **não
  tem processo nem responsável próprios**. A situação dele (sem negócio / negociando /
  cliente / perdido) é **derivada dos negócios e da receita**, nunca digitada.
  *(Reafirma a Sprint 4: "Contacts stay identity-pure".)*
- **Negócio é uma unidade de trabalho:** uma tentativa de vender uma oferta definida a um
  contato, numa linha. Tem responsável, etapa, itens, valor e campos da linha. Termina
  ganho ou perdido e **não reabre**; nova tentativa ou novo ciclo é **novo negócio**.
  Um contato pode ter vários negócios, na mesma linha ou em outras (79 contatos já têm).
- Também são objetos: Empresa, Imóvel (ativo), Pipeline e suas Etapas, Produto/Serviço,
  Usuário e, depois, Campanha.
- Reunião e tarefa são objetos pequenos: têm estado (agendada → feita / no-show). Cada
  mudança de estado **emite um evento**.

### 3.2 Eventos — o que aconteceu; com hora, autor e sem edição

- Catálogo: contato entrou (com origem), negócio aberto, mudou de etapa, marcos
  (qualificado, reunião agendada/feita, no-show, proposta enviada, contrato
  enviado/assinado), **ganho**, perdido (com motivo), receita lançada, ciclo venceu,
  responsável trocado, touchpoint.
- **Ganho é um evento.** `status = won` é só o estado que ele deixa. O evento carrega a
  data, quem fechou, o valor e **o responsável daquele momento**, e dispara as
  consequências: lançar a receita, o contato vira cliente, agendar o próximo ciclo,
  webhooks.
- Evento é a **única fonte de métrica**. Contar o estado atual responde a pergunta errada
  (lição da Sprint 9: um negócio que avançou apaga o próprio histórico).
- `actor` (quem clicou) ≠ responsável (dono do negócio). Os dois ficam no evento.

### 3.3 Artefatos — o que o trabalho produz

- Documentos presos a um negócio, com ciclo de vida curto (rascunho → enviado →
  aceito/assinado/recusado) e, quase sempre, um arquivo: proposta e PDF, contrato
  assinado, pedido, recibo.
- **Artefato prova marco:** "proposta enviada" = um artefato Proposta chegou em *enviada*.
- A tabela "Propostas Comerciais" da Solo no Jestor é uma tabela de artefato. As tabelas
  personalizadas são a camada granular para artefatos — sempre presas a um objeto.

---

## 4. Os oito motores

```
DEFINIÇÃO   1 Modelo            objetos · campos tipados · relações
            2 Processo          linhas · etapas com significado · marcos · timers · naturezas
OPERAÇÃO    3 Eventos           o que aconteceu, append-only, com quem e quando
            4 Automação         gatilho (evento | tempo) → condição → ação (verbos de negócio)
VALOR       5 Receita           catálogo · itens · ganho → receita · recorrência
            6 Artefatos         proposta · contrato · arquivo · ida e volta
BORDAS      7 Entradas/Saídas   captação → identidade → atribuição → roteamento · webhooks/API/MCP
            8 Consulta/Métricas linguagem de filtro · páginas · visões · placar · dashboard
PORTAS      Tela · WhatsApp/Studio AI · Copilot · Webhooks · API · MCP  → sempre pelos contratos
```

### 4.1 Modelo — objetos, campos, relações

- **É:** a definição do que existe. Objetos nativos (Contato, Empresa, Imóvel, Negócio;
  depois Produto e Artefato) e objetos do tenant (tabelas personalizadas). Campos tipados.
  Relações (N:1, lookup; depois rollup e N:M).
- **Contrato:** o **registro de tipos de campo** — para cada tipo, um módulo diz como
  mostrar, editar, interpretar a entrada, filtrar (operadores), ordenar e validar; com
  gêmeos em SQL (conversão segura, leitura do valor). O endereço do valor é o `field_id`.
- **Hoje:** três esquemas de campo (`pipelines.custom_fields_schema` por `field_id`;
  `equipes.contact_fields_schema` e `custom_tables.table_schema` por `key`) e cada tela
  trata tipos do seu jeito.
- **Regras:** um tipo novo entra pelo registro, nunca por um `switch` numa tela; campo
  apagado é arquivado (dado preservado); `key` é imutável depois de criada.

### 4.2 Processo — a linha

- **É:** linhas sobre um objeto (hoje só Negócio): etapas com tipo (aberta, ganho,
  perdido, reciclo) e marco canônico (`funnel_event`), responsável como operador, timers
  (SLA, cadência, reciclo, recorrência), portões de etapa, naturezas e modelos.
- **Naturezas do pipeline** (configuradas na tela do pipeline; todas opcionais, com padrão):
  1. **Duração** — contínuo ou campanha (início e fim; ao terminar para de receber e o
     placar vira o relatório da campanha).
  2. **Entradas** — que fontes alimentam a linha (canal de WhatsApp, formulário, landing
     page, webhook, importação, manual); cada entrada carimba a origem e pode definir o
     responsável (fixo ou rodízio).
  3. **Oferta** — o que a linha vende: valor livre (padrão, o comportamento de hoje) ou
     catálogo (preço fixo ou negociável; valor do negócio = soma dos itens); recorrência
     opcional por item (a cada N dias/meses, abrir o retorno X dias antes, em qual
     linha/etapa).
  4. **Processo** — como a linha vende: quais marcos ela tem (qualificação, reunião,
     proposta, contrato, pagamento) ou **compra direta** (entrou → comprou). A escolha
     gera etapas que já declaram o marco, decide que artefatos a linha espera e que
     métricas fazem sentido (comparecimento só se há reunião).
- **Modelos** combinam naturezas: venda consultiva (solar), clínica com retorno (dentista),
  lançamento (cinema), serviço jurídico. O Track Shaper do Copilot preenche as naturezas
  a partir da descrição do negócio.
- **Reciclo ≠ recorrência.** Reciclo traz de volta um negócio que não fechou (o mesmo
  negócio). Recorrência abre um negócio novo para um serviço que venceu.

### 4.3 Eventos — o que aconteceu

- **É:** o catálogo canônico e o registro append-only. Um emissor por fato; todo
  consumidor (métricas, linha do tempo, automações, webhooks de saída, contexto do
  Copilot, auditoria) lê daqui.
- **Hoje:** `opportunity_stage_history`, `funnel_events` (7 eventos), `lead_activities`,
  `touchpoints`, `messages`, `ai_decisions` — separados; webhooks de saída para 2 eventos.
- **Regras:** evento não é editado; replay reconstrói a partir do fato de origem; todo
  evento de negócio carrega o responsável do momento.

### 4.4 Automação — gatilho → condição → ação

- **É:** um executor. Gatilho = evento ou tempo. Condição = a linguagem de filtro do
  motor de Consulta. Ação = um **verbo de negócio** (atribuir responsável, mover etapa,
  definir campo, criar negócio, criar artefato, notificar, chamar webhook, chamar IA).
- **Verbos de negócio** são RPCs: a tela usa agora; automação, Copilot e MCP usam os
  mesmos depois. Crédito de IA sempre por `charge_credits`.
- **Hoje:** regras do Agente CRM, webhooks de etapa, cadência, verbos do Copilot e o
  `cycle_pass` sem agendador — cada um separado.

### 4.5 Receita — oferta → dinheiro

- **É:** catálogo (produto/serviço, preço, recorrência), itens do negócio, **lançamento de
  receita** no evento de ganho (um por item; um pelo valor quando não há itens),
  recorrência (novo negócio por ciclo), LTV e receita por produto, responsável e origem.
- **Hoje:** só `opportunities.value`. (As tabelas `billing_products`, `proposal_items`,
  `contract_items` são da cobrança do próprio SaaS — nomes do CRM precisam ser outros.)
- **Regras:** negócio fechado não reabre; reabrir por engano estorna a receita.

### 4.6 Artefatos — o que o trabalho produz

- **É:** tipos de artefato presos ao negócio (sobre o motor de Modelo), ciclo de vida,
  arquivo (Storage isolado por tenant), geração e assinatura com ida e volta (botão →
  webhook com token de retorno → o n8n devolve campos e arquivo).
- **Hoje:** tabelas personalizadas sem arquivo e sem vínculo com negócio.

### 4.7 Entradas e Saídas — as bordas

- **É:** entradas (WhatsApp, formulário, landing page, webhook, importação, API) →
  identidade (telefone normalizado, e-mail, deduplicar e unir) → atribuição (plataforma,
  campanha, anúncio, UTM, click ids, formulário, landing page, payload bruto) →
  roteamento (linha + responsável). Saídas: webhooks por evento, API, MCP, integrações.
- **Hoje:** `crm-webhook` (dois caminhos), webhooks de WhatsApp, importação,
  `normalize_phone_br`/`crm_find_lead_by_phone`; 2 eventos de saída sem retry.
- **Regra:** toda saída de telefone por `_shared/phone.ts`; toda entrada traduz
  `key ↔ field_id`.

### 4.8 Consulta e Métricas — ler

- **É:** uma linguagem de filtro para qualquer objeto (busca, campos por tipo, relações),
  ordenação, páginas no servidor, contagens, visões; métricas sobre eventos e receita,
  com escopo (vendedor vê o que é dele).
- **Hoje:** `CrmFilters` no Kanban (Sprint 11 · Onda 1) e as RPCs de métricas da Sprint 9.
- **Regras:** o filtro tem uma implementação só no banco; contador e lista usam a mesma
  função, então nunca discordam; nenhuma lista carrega "tudo" no navegador.

---

## 5. Evolução por versão

v1.1 é a Sprint 11. A coluna v3+ é direção, não compromisso.

| Motor | v1.1 (Sprint 11) | v1.2 | v2 | v3+ |
| :-- | :-- | :-- | :-- | :-- |
| 1 Modelo | registro de tipos + campo Usuário · tabela ligada ao negócio + lookup | campos de contato e tabelas em `field_id` · CPF/CNPJ, %, fórmula | rollup, N:M, permissão por campo · mudança por changeset | modelo proposto por IA |
| 2 Processo | responsável no negócio · naturezas Oferta e Processo · modelos · agendador | portões de etapa · linha de campanha | processo em qualquer objeto · pós-venda aberto no ganho | linha que aponta os próprios gargalos |
| 3 Eventos | responsável do momento · eventos de receita e de ciclo | linha do tempo por registro · webhook para qualquer evento | barramento de automação · replay | — |
| 4 Automação | verbos de negócio · reciclo e recorrência no agendador · botão do artefato · roteamento | uma tela "Automações" | construtor sem código · aprovações | agentes que operam a linha |
| 5 Receita | catálogo · itens · ganho → receita · recorrência | desconto, condições, meta por produto, previsão ponderada | assinatura, comissão, cobrança | — |
| 6 Artefatos | proposta e contrato ligados · arquivo · ida e volta | modelo de documento nativo · formulário público | assinatura nativa · versões | proposta rascunhada por IA |
| 7 Entradas/Saídas | entradas por linha · carimbo de origem · campanha · rodízio | chaves de API + REST v1 · webhooks com retry | MCP · integrações (Meta, Google, ClickSign) | mídia otimizada pela receita |
| 8 Consulta/Métricas | filtros v2 · tabelas no servidor · placar · dashboard por responsável · receita · ROI | visões salvas · agrupar · "todos os filtrados" | a mesma linguagem em automações, segmentos, Copilot/MCP | perguntas em linguagem natural |

### Onde a Sprint 11 constrói cada motor

| Onda | Motores |
| :-- | :-- |
| 1 · Confiança (feita) | Consulta v0 (quadro no servidor) · Modelo (endereço `field_id`) · Entradas (deduplicar por telefone) |
| 2 · Kanban e tabelas claros | Modelo v1 (registro de tipos, Usuário) · Consulta v1 (filtros v2, tabelas no servidor) · Automação (verbos de negócio) · Eventos (responsável do momento) · Métricas (dashboard por responsável, placar) |
| 3 · Receita e linha configurada | Receita v1 · Processo (naturezas Oferta/Processo, modelos, agendador) · Eventos (receita, ciclo) |
| 4 · Artefatos | Artefatos v1 · Modelo (N:1 com negócio, lookup, arquivo) · Automação (botão → webhook → retorno) |
| 5 · Entradas e atribuição | Entradas v1 (naturezas Duração/Entradas, carimbo, campanha, rodízio) · Métricas (ROI sobre a receita) |

---

## 6. Como uma feature nova passa por aqui

Antes de planejar, responda:

1. **Que objeto** ela lê ou muda? Se é um objeto novo: nativo (a espinha precisa entender)
   ou tabela do tenant (granular)?
2. **Que eventos** ela emite ou consome? Algum evento novo entra no catálogo?
3. **Produz artefato?** Com que ciclo de vida?
4. **Que verbos** ela chama? O verbo já existe como RPC? Se não, crie o verbo, não o atalho.
5. **Como se filtra e se mede?** Usa a linguagem de filtro e as métricas existentes?
6. **Qual porta** a usa hoje, e qual vai usar amanhã (Copilot, MCP)? O contrato serve às duas?

Se a resposta de qualquer item for "a tela resolve sozinha", o desenho está errado.

---

## 7. Glossário

| Termo | Significado |
| :-- | :-- |
| Contato | A pessoa. Identidade só. Sem responsável. Situação derivada dos negócios. |
| Negócio | Uma tentativa de vender uma oferta a um contato, numa linha. Tem responsável. Não reabre. |
| Linha (pipeline) | Um processo comercial configurado pelas naturezas. |
| Etapa | Uma estação da linha. Tem tipo (aberta, ganho, perdido, reciclo) e, opcionalmente, um marco. |
| Marco | O significado canônico de chegar a uma etapa (qualificado, proposta enviada…). |
| Evento | Um fato com hora, autor e responsável do momento. Nunca editado. |
| Artefato | Documento produzido para um negócio, com ciclo de vida e arquivo. |
| Verbo de negócio | Uma operação (RPC) que toda porta usa para mudar dado. |
| Natureza | Uma dimensão da configuração da linha: Duração, Entradas, Oferta, Processo. |
| Reciclo | O mesmo negócio volta para a linha depois de N dias. |
| Recorrência | Um negócio novo nasce porque um item vendido venceu. |
| Porta | Por onde algo muda dado: tela, WhatsApp, webhook, Copilot, API, MCP. |
