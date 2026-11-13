# 🧭 ROADMAP v2 — Rev como máquina de receita

> **Reescrito em 12/11/2026.** Substitui o roadmap de 04/07/2026 (escrito na Sprint 7.0; a versão
> anterior está no histórico do git deste arquivo).
> **Base:** código em `main` @ `54b1087`, `Sprints_PM_Handoff.md`, `todo.md`, sprints 7 → 13 e
> Suporte 1, `Architecture/motores_revops.md`, benchmarks Attio e Jestor, os 17 tickets da Solo Energia.
> **Como ler:** §1–3 dizem onde estamos e para onde vamos; §4 é o diagnóstico; §5–6 são as sprints;
> §7 são as decisões que só o founder toma.

---

## 1. Resumo em uma página

1. **O roadmap antigo foi cumprido em escopo e não em resultado.** Tudo o que ele planejou está no
   ar, mais o que ele tinha empurrado para depois da v1 (Solo API, automações, formulários, roleta,
   suporte, central de ajuda). A linha de chegada dele — 3 clientes pagando e renovando sem suporte
   diário — continua aberta: hoje **só a Solo Energia paga**, a Casa Flow usou e parou, a WI
   Advogados vai começar.
2. **O produto ficou largo antes de ficar fundo.** Em quatro meses foram ~200 migrations e ~47 edge
   functions. Quase toda área existe; poucas estão fechadas a ponto de um cliente operar sozinho.
   A próxima fase não é de áreas novas: é de **fechar ciclos**.
3. **A tese muda de "agente + cockpit" para "máquina de receita agêntica, nativa de WhatsApp".**
   O Attio vende exatamente isso para empresas de e-mail e calendário. O Rev tem uma vantagem que o
   Attio não tem: a conversa de venda **acontece dentro do produto**, e o agente que responde é
   nosso. O que falta é o que o Attio já tem: contexto único, agentes que agem e são medidos,
   automação numa tela só, e o sistema se montando sozinho.
4. **Oito sprints, nesta ordem:** UI do CRM (em curso, a pedido do founder em 12/11) → chão firme → Copilot que decide → automações numa tela só →
   captação e reativação → modelo relacional → Builder (o sistema se monta) → cérebro próprio do
   atendimento. A fundação de design (tokens, casca com barra lateral, grade única) entrou na Sprint 15; a trilha continua a partir da Sprint 17.
5. **Regra de pronto, para toda sprint:** só conta o que foi visto funcionando no app, por uma
   pessoa, num tenant real (Solo Energia primeiro, WI Advogados como segundo).

---

## 2. Onde estamos (12/11/2026)

### 2.1 O que existe, por motor

Os oito motores de `motores_revops.md` continuam sendo o mapa. Estado de cada um:

| Motor | No ar | Nível |
| :-- | :-- | :-- |
| 1 Modelo | registro de 15 tipos de campo, `field_id` em pipeline e tabelas, relação N:1 e lookup, tabelas personalizadas ligadas ao negócio | 🟡 falta rollup, N:M, fórmula; campos de contato ainda por `key` |
| 2 Processo | etapas com tipo e marco, naturezas (Duração, Entradas, Oferta, Processo), modelos, Track Shaper, motor único de mover etapa com motivo de perda, roleta | 🟢 |
| 3 Eventos | `funnel_events` com dono do momento, histórico de etapa e de dono, toques, livro de receita | 🟡 seis tabelas separadas; não há linha do tempo única por registro |
| 4 Automação | regras do Agente de CRM, `crm_automations` (evento → ação), sequências de outreach, agendador (reciclo/recorrência), webhooks de etapa, botões de artefato | 🔴 cinco mecanismos, cada um com sua tela e seu log |
| 5 Receita | catálogo, itens, livro-razão, recorrência, ROI por campanha | 🟢 falta previsão ponderada e comissão |
| 6 Artefatos | propostas e contratos presos ao negócio, arquivo privado, ciclo de vida → marco, formulário público, esteira Jestor → Rev | 🟢 |
| 7 Entradas/Saídas | toques com UTM e click id, entradas com carimbo e rodízio, formulários de ingestão, webhooks com log e reenvio | 🟡 nenhuma integração nativa (Meta, Google), sem API pública, sem MCP |
| 8 Consulta/Métricas | filtro único compilado no servidor, tabelas paginadas, placar, dashboard em 5 páginas, relatório por pipeline | 🟡 sem visões salvas, sem agrupar, sem "todos os filtrados" |

Portas e operação:

| Área | No ar | Nível |
| :-- | :-- | :-- |
| Atendimento (Studio AI) | paridade com o provedor: configurações, canais, treinamento, regras de transferência, ações de inatividade, catálogo de modelos | 🟡 depende de um provedor sem API para horário, moderação, agenda e lista de modelos |
| Canais | Solo API (WhatsApp por QR), 7 tipos de canal do provedor, janela de 24h tratada | 🟡 E2E com aparelho real nunca fechado |
| Chat | responsável × atendente, ingestão sem conversa fatiada, deep link | 🟢 25 grupos de conversa duplicada no histórico |
| Copilot | fila com espera, verbos com desfazer, chat sobre os dados, Jev (System 1) em modo sombra | 🔴 ver §4.2 |
| Outreach | motor de sequências CRM → WhatsApp, idempotente e cancelável | 🟡 motor sólido, tela mínima, sem medição de resultado |
| Cobrança | Asaas, duas carteiras (Atendimento/Copiloto), faturas, go-live, cartão salvo | 🟢 quase sem uso real |
| Onboarding | proposta → aceite → provisionar → go-live, discovery por link | 🟡 a montagem do ambiente é SQL à mão por cliente |
| Admin, Equipe, Notificações, Suporte, Docs | painel do dono, políticas de notificação, tickets, central de ajuda v1 | 🟢 docs de admin e de dev não existem |
| Toolkit, Clube Solo | só a rota | ⚪ |

### 2.2 O que o uso real disse

A Solo Energia abriu 17 tickets entre 27/09 e 13/10. Nenhum pedia área nova. Pediam que o que
existe se ligasse: responsável do chat com o do CRM, motivo de perda na hora de perder, webhook que
aparece na tela de webhooks, relatório que chega igual todo dia, celular que funciona. É o retrato
do produto: **as peças existem e as emendas falham**.

---

## 3. A tese: o que o Rev precisa ser

**O Rev é a máquina de receita de uma empresa brasileira que vende por conversa.** Ela capta,
responde, qualifica, move, cobra o próximo passo e traz de volta quem esfriou — com agentes fazendo
o trabalho e o dono aprovando o que importa.

### 3.1 O que o Attio ensina, e onde estamos em cada ponto

O Attio se reposicionou como "CRM para receita agêntica". A página dele organiza o produto em
cinco movimentos e três fundações. Traduzido para o nosso cliente:

| Movimento do Attio | O que é lá | O equivalente no Rev | Hoje |
| :-- | :-- | :-- | :-- |
| Build pipeline | agente pesquisa contas e escreve o primeiro e-mail | captar por anúncio e formulário; **reativar a base morta** por WhatsApp (a Solo tem 916 negócios em Reciclo/Desqualificado) | 🟡 motor de sequências existe; sem segmento, sem resultado |
| Convert leads | lead novo é enriquecido, pontuado, roteado e inscrito numa sequência antes de esfriar | o agente responde no WhatsApp em segundos, qualifica, pontua, a roleta entrega ao vendedor certo | 🟡 atendimento e roleta existem; o score não tem critério |
| Run sales motions | pipeline do jeito do cliente; agente prepara a reunião e acusa negócio parado | Kanban + Copilot que lê a conversa, preenche, move e cobra o próximo passo | 🔴 o Copilot falha 1 em 4 e ninguém aprova o que ele sugere |
| Forecast revenue | pergunta em linguagem natural vira consulta | chat "Entenda sua máquina de receita" + placar + relatório diário no WhatsApp | 🟡 existe; lento, sem previsão ponderada |
| Retain and expand | sinais de conta esfriando; a jogada vem pronta para aprovar | recorrência abre o negócio de retorno; pós-venda | 🟡 recorrência existe; ninguém usa |

| Fundação do Attio | O que é lá | No Rev | Hoje |
| :-- | :-- | :-- | :-- |
| Universal Context | e-mail, ligação e agenda se registram sozinhos | **a conversa de WhatsApp já mora aqui** — é a nossa vantagem | 🟡 áudio vira "[áudio]"; sem agenda Google; eventos espalhados |
| Workflows + agentes | um construtor: gatilho → agente → condição → ação, com histórico de cada execução | Motor 4 | 🔴 cinco mecanismos separados |
| Self-building | conecta a caixa de entrada e o CRM se monta | Track Shaper + Modo Builder | 🔴 onboarding é SQL à mão |
| SDK · API · MCP | tudo que a tela faz, a API faz | os verbos de negócio já são RPCs | ⚪ nenhuma porta pública |

### 3.2 Onde ganhamos e onde não competimos

- **Ganhamos:** WhatsApp como canal nativo (com número próprio pela Solo API), agente que atende de
  verdade, português e realidade do Brasil (CPF/CNPJ, Asaas, PIX), montagem feita por nós (Builder
  a R$300/h já é produto), preço de PME.
- **Não competimos agora:** enriquecimento de contas B2B, sincronização de e-mail, marketplace de
  apps. O nosso "sinal" é a conversa, não a notícia de rodada de investimento.

### 3.3 A medida de sucesso

Uma máquina de receita se mede pelo que produz, por tenant e por semana:

| Medida | Por que essa | Meta para o primeiro tenant de fora |
| :-- | :-- | :-- |
| Tempo até a primeira resposta ao lead | é o que o cliente sente primeiro | mediana < 1 min |
| % de negócios abertos com próximo passo datado | diz se a linha está sendo trabalhada | ≥ 80% |
| % das sugestões do Copilot resolvidas em 24h (aceitas, recusadas ou aplicadas sozinhas) | diz se o Copilot é usado ou ignorado | ≥ 70% |
| Receita ganha que passou por uma ação de agente ou automação | é a máquina, em dinheiro | crescer mês a mês |
| Dias de uso por vendedor na semana | retenção antes da renovação | ≥ 4 de 5 |

E a do negócio continua a do roadmap antigo, porque nunca foi atingida: **3 tenants de fora pagando
e renovando, sem intervenção no banco.**

---

## 4. Diagnóstico — o que está mal construído

Em ordem de quanto custa deixar como está.

### 4.1 Verdades duplicadas
Cada uma já produziu um defeito silencioso em produção:

- **Quem é admin:** `is_super_admin()` lê `profiles.role`, a tela lê `user_roles`. Um cliente já leu
  a proposta de todos os outros por isso.
- **Saldo de crédito:** `agent_credits_balance` (Sprint 6.1) ainda alimenta o selo do Copiloto, em
  paralelo ao `credit_ledger`. `equipes.creditos_avulsos` tem seis leitores vivos.
- **Etapa do lead:** `leads.stage_id` é legado e ainda existe; o Kanban lê `opportunities`.
- **Copilot:** o caminho antigo (Torre/Chão, `/api/v1/sync`, painel de aprovações antigo) convive
  com o novo. O erro 422 "invalid or expired token" ao sincronizar e ao criar pipeline vem dessa
  convivência.
- **Cadência:** `cadence-check` (sem autenticação) ainda está publicado ao lado do motor de outreach.

### 4.2 O Copilot ainda não se paga
Dados de 13/09 a 27/09 (`sprint_13_copilot_jev_v1.md`):

- 1 em cada 4 passadas falha; tempo do modelo p50 15,6 s e **p90 520 s**.
- 24% das passadas bem-sucedidas terminam sem nenhuma ação.
- ~700 decisões esperando aprovação e **nenhuma aprovada por uma pessoa**. A fila de aprovação é
  um cemitério: abaixo do limiar de confiança, hoje, significa perdido.
- A confiança que decide isso é a que o próprio modelo declara, e ela não mede nada.
- O Jev foi integrado em modo sombra para resolver exatamente isso; o relatório H1–H4 que decide
  se ele liga ainda não foi lido.
- O Copilot não ouve áudio. Em venda por WhatsApp no Brasil, isso é não ouvir metade da conversa.

### 4.3 Automação em cinco lugares
Regras do Agente de CRM, `crm_automations`, sequências de outreach, agendador de reciclo e
recorrência, webhooks de etapa, botões de artefato — mais as ações de inatividade que moram no
provedor. Cada um tem tela, log e vocabulário próprios. O cliente pediu isso em dois tickets (#3 e
#5). O `motores_revops.md` já previa "uma tela Automações" na v1.2.

### 4.4 A promessa central depende de um provedor que não controlamos
O atendimento roda no GPT Maker. Ele não tem API para horário de atendimento, moderação, agenda
nem lista de modelos; o webhook de entrada dele é público e sem assinatura; em 30/09 devolveu erro
interno em todos os testes da Casa Flow; e alguém alterou o treinamento da Casa Flow sem deixar
rastro. Dois estudos sobre cérebro próprio (Agno) estão abertos em PR desde setembro.

### 4.5 Nada é verificado por uma pessoa
Quase todo handoff termina com "verificação no navegador pendente". Há testes de banco em rollback
contra a produção (bons), mas nenhum teste que abra o app, não há ambiente de ensaio, o deploy é
manual e as migrations entram à mão. Em 05/10 a produção ficou lenta por falta de CPU e só se
descobriu olhando os relatórios do Supabase.

### 4.6 Segurança com itens abertos há meses
- Chaves expostas no git (`15a4f80`) e em conversas — a rotação está na lista desde junho; a chave
  de produção do Asaas e o `AGENT_INTERNAL_TOKEN` passaram por chat.
- `chat-attachments` é público e qualquer usuário logado apaga anexo de qualquer equipe.
- `agent-training-docs` é de leitura pública; `agent-assets` não separa por equipe.
- `gpt-maker-webhook` aceita evento sem segredo.
- Proteção contra senha vazada desligada; três views administrativas `SECURITY DEFINER`.

### 4.7 O sistema não se monta sozinho
Cada cliente novo é um SQL escrito à mão mais o agent-creator (Rema e WI em 28/09). É o que impede
de ter dez clientes sem dez vezes o tempo do founder.

### 4.8 Sem sistema de design
A interface foi construída onda a onda, por agentes diferentes, cada um resolvendo a sua tela. O
celular foi remendado três vezes. O pacote principal tem 2,66 MB.

---

## 5. As próximas sprints

Cada sprint diz o motor que avança, o que entrega e como se sabe que acabou. A ordem é a
recomendada; §7 lista o que pode mudá-la.

### Sprint 15 — UI do CRM (em curso desde 12/11)
**Por quê agora:** decisão do founder em 12/11 — o CRM precisa ser agradável e confiável de usar antes
de fechar o chão firme. Plano: `Planning/Sprints/sprint_15_crm_ui_plan.md`.

- Status **Gerado** nas propostas: gerar não marca mais "Proposta enviada"; só Enviar marca.
- Modo claro e escuro com contraste AA verificado por teste; texto sobre a cor do tenant sempre legível.
- Casca com barra lateral por grupos (as seções do CRM e as tabelas personalizadas viram itens) e
  altura limitada, o que destrava cabeçalho, primeira coluna e rodapé presos nas tabelas.
- Card do negócio com hierarquia; uma grade só para Contatos, Negócios, Empresas, Imóveis e tabelas
  personalizadas; 10 defeitos das tabelas corrigidos, 9 listados em aberto.
- Desenho das primitivas de automação (`Planning/Architecture/automacao_primitivas_v1.md`), base da
  Sprint 18.

**Acabou quando:** o fluxo da proposta (gerar → Gerado, enviar → Enviado) e as telas acima foram vistos
funcionando na Solo Energia, em 1440 e 390, claro e escuro.

### Sprint 16 — Chão firme
**Por quê primeiro:** tudo o que vem depois multiplica o que estiver errado aqui. É a única sprint
sem nada novo na tela.

- **Uma verdade só:** `is_super_admin()` passa a ler `user_roles` (com trava contra super admin em
  equipe de cliente); selo do Copiloto lê o ledger e `agent_credits_balance` sai; os seis leitores
  de `creditos_avulsos` saem e as colunas caem; leitores de `leads.stage_id` saem.
- **Copilot:** remover Torre/Chão/`/api/v1/sync`/painel antigo; corrigir o 422 de token.
- **Cadência:** aposentar `cadence-check`.
- **Segurança:** rotação de todas as chaves da lista do `todo.md`; fechar `chat-attachments`;
  separar `agent-assets` por equipe; segredo no `gpt-maker-webhook`; proteção de senha vazada;
  crons antigos lendo segredo do Vault.
- **Verificação:** um projeto de ensaio no Supabase; dez fluxos de ouro testados no navegador a
  cada PR (login, criar negócio, mover com motivo de perda, responder no chat, formulário público,
  proposta, automação, relatório, cobrança, equipe); página de saúde com filas, crons e erros.
- **Pendências de dados da Suporte 1:** responder os 17 tickets; decidir o preenchimento dos 528
  motivos de perda; unir os 25 grupos de conversa duplicada; persistência do motivo de perda na
  configuração do pipeline.

**Acabou quando:** nenhuma tabela ou função da lista de §4.1 tem dois donos; a lista de chaves do
`todo.md` está riscada; um PR que quebra um fluxo de ouro não entra.

### Sprint 17 — Copilot que decide (+ fundação de design)
**Motores:** 4 Automação, 8 Consulta. **Porta:** Copilot.

- **Ler o relatório do Jev** e aplicar a regra escrita antes dos dados: liga ou ajusta o limiar.
- **Confiabilidade:** falhas < 5%, p90 < 60 s; resposta com cerca ` ```json ` deixa de contar
  como erro; alarme quando a credencial do modelo cai.
- **Fim do cemitério de aprovações:** sugestão vence em 48h; o que o Jev sustenta com folga aplica
  sozinho (com desfazer); o resto chega **no WhatsApp do vendedor**, resumido, com aprovar/recusar
  num toque.
- **Áudio:** transcrever o áudio do lead antes de o Copilot ler. É o primeiro pedaço de contexto
  único.
- **Score com critério:** o tenant declara o perfil ideal (campos e pesos, proposto pelo Copilot a
  partir dos ganhos); o score sai disso e do comportamento na conversa, e mostra o porquê.
- **Negócio parado e em risco:** sem próximo passo, sem resposta há N dias, data de fechamento
  vencida — vira lista e vira gatilho de automação (Sprint 18).
- **Preço do chat do Copilot**, com os tempos já gravados.
- **Fundação de design (trilha, ver §6):** tokens, casca do app e a Home redesenhada como a casa
  do Copilot — "o que fazer agora".

**Acabou quando:** as metas de §3.3 para o Copilot são medidas num relatório semanal e batem na
Solo Energia por duas semanas seguidas.

### Sprint 18 — Automações numa tela só
**Motor:** 4 Automação (v1.2 do `motores_revops.md`). **Referência:** os workflows do Attio.

- **Um modelo:** gatilho (evento · tempo · webhook · botão · sinal do Copilot) → condição (a
  linguagem de filtro que já existe) → **várias ações em sequência**, com espera entre elas.
- **Ações = verbos de negócio que já existem**, mais: enviar mensagem no WhatsApp, inscrever em
  sequência, criar tarefa, notificar, chamar IA (resumir, classificar, redigir), chamar webhook.
- **Uma tela "Automações"** que lista também o que hoje mora fora: regras do agente, reciclo,
  recorrência, webhooks de etapa, botões de artefato. Sequência de outreach passa a ser um tipo de
  automação.
- **Histórico de execução** por automação e por negócio, com entrada, saída e erro — o que o Attio
  lançou em setembro e o que os tickets #3 e #5 pedem.
- **Biblioteca de modelos prontos:** resposta em 1 minuto e rodízio · recuperar no-show · seguir
  proposta sem resposta · lead parado 5 dias · lembrete de reunião · boas-vindas ao ganho.

**Acabou quando:** não existe automação que só apareça fora dessa tela, e a Solo Energia roda pelo
menos três modelos sem ajuda.

### Sprint 19 — Captação e reativação
**Motor:** 7 Entradas/Saídas. **Movimento:** build pipeline.

- **Fundação de integrações:** credenciais no Vault por tenant, catálogo de conectores, fila de
  saída com nova tentativa (a que já entrega webhooks).
- **Meta:** Lead Ads e clique-para-WhatsApp entrando com campanha e anúncio; investimento puxado
  sozinho; Conversions API devolvendo ganho. Fecha o ROI que hoje depende de lançamento manual.
- **Públicos:** um filtro salvo vira público de uma sequência.
- **Reativação da base:** sequência sobre Reciclo e Perdido, com mensagem redigida por IA a partir
  do histórico do negócio, freio por instância para não queimar o número, opt-out respeitado.
- **Resultado por sequência:** enviados → respostas → negócios reabertos → receita.
- **Google Agenda** (ticket #4), agora por integração própria e não pelo provedor.

**Acabou quando:** uma campanha de reativação na base da Solo Energia mostra quantos negócios
reabriu e quanto de receita trouxe, e um lead de anúncio da Meta entra com campanha sem n8n.

### Sprint 20 — Modelo relacional e visões
**Motores:** 1 Modelo, 3 Eventos, 8 Consulta (v1.2).

- **Um contrato de campo em todo lugar:** campos de contato passam para `field_id`; filtro por
  campo de contato.
- **Relações completas:** rollup (somar, contar, último), N:M, fórmula, CPF/CNPJ e percentual.
- **Visões salvas**, agrupar, "selecionar todos os filtrados", ação em lote sobre a visão.
- **Linha do tempo única por registro:** mensagem, etapa, tarefa, artefato, receita, ação de
  automação e de agente num lugar só, lendo das seis tabelas de evento.
- **Varredura de bugs das tabelas** (pedido do founder em 13/09).
- **Importador de planilha com mapeamento de colunas**, usando `migrate_solo_energia.py` como lista
  de requisitos.

**Acabou quando:** dá para reproduzir no Rev, sem código, as tabelas que a Solo Energia mantinha no
Jestor, com totais por negócio e por cliente.

### Sprint 21 — Builder: o sistema se monta
**Motor:** todos, por changesets (`future_sprint__mcp_v1.md`). **Movimento:** self-building.

- **Changesets:** descrever · planejar · aplicar · desfazer, para pipeline, etapas, campos, metas,
  taxonomia, webhooks, tabelas, automações e blocos do Studio AI. Com diff na tela.
- **MCP interno** usado por nós no onboarding: o discovery do cliente vira um changeset revisado,
  não um SQL.
- **Copilot em Modo Builder** dentro do app, cobrando da carteira do Copiloto.
- **Portal do onboarding:** o cliente vê em que etapa está e o que falta dele; checklist por etapa
  bloqueia o go-live.
- **Docs de admin e de dev** (resto da Sprint 12), gerados em boa parte dos próprios contratos.

**Acabou quando:** um tenant novo sai do discovery ao go-live sem SQL escrito à mão, em menos de
um dia de trabalho nosso.

### Sprint 22 — Cérebro próprio do atendimento
**Porta:** WhatsApp/Studio AI. Depende da decisão D1 (§7).

- Agente próprio (Agno, no `python-agent`) atendendo pelos canais da Solo API, com os mesmos
  verbos e o mesmo contexto do Copilot: treinamento com nome de bloco, horário de atendimento,
  transferência, agendamento na nossa Agenda, tudo o que o provedor não expõe.
- Piloto na Solo Energia, lado a lado com o provedor atual, comparando resposta, qualificação e
  custo por conversa.
- O provedor continua nos canais oficiais da Meta enquanto a comparação não decide.

**Acabou quando:** há um número — conversão e custo por conversa, cérebro próprio contra provedor —
e uma decisão escrita sobre migrar ou não.

### Depois (direção, não compromisso)
API pública v1 com chaves e MCP externo · previsão ponderada, comissão e meta por produto ·
pós-venda como linha aberta no ganho · canal de e-mail · PWA · assinatura nativa de contrato ·
Toolkit (modelos de linha e de automação como produto) · Clube Solo · i18n.

---

## 6. Trilha de design (fundação na Sprint 15, contínua a partir da Sprint 17)

Não é uma sprint de polimento no fim. É uma regra de entrada para cada tela nova.

1. **Sprint 15 — fundação (entregue):** tokens claro/escuro com contraste AA testado, casca com barra
   lateral por grupos, card do negócio e uma grade só para todas as tabelas. **Sprint 17 — o resto:**
   12 componentes de base auditados, busca global e a Home.
2. **Sprints 18–20 — cada superfície nova nasce no sistema:** Automações, Sequências, Visões e a
   linha do tempo. Antes do código, um protótipo navegável aprovado pelo founder.
3. **Toda tela entregue tem os quatro estados** (carregando, vazio, erro, dado) e funciona em
   390×844.
4. **Navegação por trabalho, não por módulo:** Hoje (Copilot) · Conversas · Negócios · Captação ·
   Automações · Resultados · Configurar. Hoje são 14 entradas de menu.
5. **Desempenho como parte do design:** dividir o pacote de 2,66 MB por rota; primeira tela útil
   em menos de 2 s no celular.

---

## 7. Decisões do founder

| # | Decisão | Recomendação | Trava |
| :-- | :-- | :-- | :-- |
| D1 | Cérebro do atendimento: seguir só com o provedor ou construir o próprio | Pilotar o próprio nos canais da Solo API (Sprint 22); manter o provedor nos canais oficiais | Sprint 22 |
| D2 | Quem pode alterar configuração pelo Builder (do estudo do MCP) | admin e gestor | Sprint 21 |
| D4 | Cobrança do Builder na hora de aplicar (do estudo do MCP) | crédito do Copiloto por changeset aplicado | Sprint 21 |
| D6 | Ambiente de ensaio pago no Supabase | sim — custa menos que um incidente | Sprint 16 |
| D7 | Preencher os 528 motivos de perda históricos | só Solo Energia, revisado pelo gestor | Sprint 16 |
| D8 | Zerar o estado de cobrança dos tenants parados (níveis 1 e 2 do "Full Reset") | nível 1 agora; nível 2 antes da WI entrar em cobrança | Sprint 16 |
| D9 | Em qual nicho o segundo e o terceiro cliente de fora entram | onde a conversa por WhatsApp é a venda inteira; entender primeiro por que a Casa Flow parou | Sprints 19 e 21 |

---

## 8. Princípios de execução

1. **Fechar antes de abrir.** Uma área nova só entra quando a anterior passou no "acabou quando".
2. **Um motor, um contrato.** Toda tarefa diz qual motor avança e responde as seis perguntas de
   `motores_revops.md` §6. Se a resposta é "a tela resolve sozinha", o desenho está errado.
3. **Agente age por verbo, com desfazer e com medida.** Nenhum agente escreve em tabela; toda ação
   automática tem registro, dono e um jeito de voltar.
4. **Pronto é visto no app.** Verificação no navegador, num tenant real, é parte da tarefa, não
   pendência do handoff.
5. **Apagar é entrega.** Caminho antigo removido conta tanto quanto caminho novo criado.
6. **Uso real ordena o backlog.** Ticket de cliente passa na frente de ideia nossa; a WI Advogados
   é o teste de tudo o que dissermos que está pronto para um segundo tenant.

---

## 9. Riscos

| Risco | Efeito | Resposta |
| :-- | :-- | :-- |
| Continuar abrindo área nova antes de fechar | mais largura, mesma profundidade, mesmo um cliente | regra 1 de §8; Sprint 16 sem tela nova |
| Copilot seguir ignorado pela equipe | a peça que mais nos diferencia vira custo | medir resolução em 24h (§3.3); levar a aprovação ao WhatsApp |
| Número de WhatsApp banido em campanha de reativação | cliente perde o canal | freio por instância, opt-out, aquecimento; começar pela base da Solo |
| Provedor do atendimento cair ou mudar | a promessa central para | segredo e monitor no webhook (Sprint 16); cérebro próprio em piloto (Sprint 22) |
| Founder como único verificador e único operador | cada sprint espera por uma pessoa | fluxos de ouro automáticos (Sprint 16); Builder (Sprint 21) |
| Incidente de segurança antes da rotação | dado de cliente e cobrança expostos | primeira semana da Sprint 16 |
