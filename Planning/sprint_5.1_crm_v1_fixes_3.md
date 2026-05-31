🏎️ SPRINT 5.1: THE CALIBRATION LAP (CRM Experience & Flow) Produto: SV01 · Sales
Engine CRM

Alvo: Chat e CRM V1 (Refinamento de Chassi e Ergonomia)

Objetivo: Purificar o cockpit. Separar definitivamente Identidade de Processo,
eliminar travas de navegação, trazer métricas comerciais vivas para a superfície
e preparar o terreno visual para receber o motor de IA em Agno.

🎛️ EPIC 1: THE SOVEREIGN GENERAL LEDGER (Base de Contatos) O Objetivo:
Transformar a tabela mestra de contatos em um livro de registros contínuo e
soberano que representa estritamente IDENTIDADE, expondo os dados cruciais na
superfície.

📋 1.1 Purificação Estrita de Colunas (Separar Identidade de Processo) O
Problema: A tabela principal de contatos exibe colunas mutáveis e temporárias
como etapas do funil (Stages), status de negócio e valores financeiros. Como um
contato pode ter múltiplos negócios abertos ao longo do tempo (ex: possuir 5
apartamentos diferentes ou comprar novas usinas), essas colunas quebram
visualmente ou exibem dados obsoletos.

A Visão: O asfalto limpo. Remover completamente campos de funis ou valores
comerciais da visualização da Base Geral de Contatos. Ela deve exibir
exclusivamente parâmetros estáveis de perfil.

Os Campos da Seção: Caixa de Seleção em Massa, Nome do Contato,
WhatsApp/Telefone, E-mail, Empresa Associada (Link Relacional), Inventário
Conectado (Contador de Propriedades/Apartamentos), Canal, Origem (Taxonomia),
Resumo do Enriquecimento de IA e Data de Cadastro.

🔄 1.2 O Fluxo Contínuo de Dados (Fim das Páginas 1, 2, 3) O Problema: A tabela
utiliza paginação tradicional, forçando o operador a clicar em botões de
"Próximo" para saltar entre blocos de dados. Isso interrompe o estado de foco e
desacelera a velocidade de análise.

A Visão: Rolagem infinita contínua. Substituir o sistema de páginas por um
carregamento fluido sob demanda. Conforme o gestor desliza a tela para baixo, os
contatos entram no viewport de forma invisível e instantânea, sem travas.

📊 1.3 Telemetria na Superfície (Espelhamento de Cards na Tabela) O Problema:
Dados valiosos como Canal (WhatsApp, Instagram), Origem (Tráfego Pago, Raspagem
de Imóveis) e Enriquecimento de IA existem no banco, mas exigem que o usuário
clique para abrir o card individual para checá-los.

A Visão: Se o dado existe dentro do card, ele precisa estar visível na linha da
tabela. Expor essas variáveis diretamente em colunas explícitas e ordenáveis na
tela principal, permitindo bater o olho e entender instantaneamente a
distribuição da base.

🆔 Máscara de Identificadores Técnicos (@lid) O Problema: Quando um lead entra
via webhook direto da API da Meta/WhatsApp sem um nome preenchido no perfil, o
sistema exibe identificadores como 264162450083898@lid na tabela, gerando
poluição visual.

A Visão: Mascaramento inteligente. Sempre que o sistema encontrar um
identificador técnico bruto no campo de nome, o painel deve exibir uma tag
padrão limpa como [Novo Contato - WhatsApp] até que o vendedor ou a IA registre
o nome humano.

🚦 EPIC 2: PURGING THE COCKPIT CONTROLS (Ergonomia de Entrada) O Objetivo:
Garantir que toda nova ingestão aconteça na camada de Identidade primeiro,
oferecendo um roteamento sem cliques repetitivos para os funis de venda.

🗃️ 2.1 Formulários Higienizados (Add & Edit Contact) O Problema: Os drawers de
criação e edição manual de contatos misturam perguntas sobre o perfil da pessoa
com dados de funis e valores de vendas.

A Visão: Isolar a engrenagem. Remover qualquer campo de estágio de funil ou
valor financeiro do cadastro base do contato.

🔀 2.2 O Roteador Unificado de Identidade O Problema: Atualmente, se o vendedor
cria um contato na base, ele precisa salvar, ir até a pipeline, criar uma
oportunidade e linkar as duas coisas. Um processo manual burocrático.

A Visão: No rodapé do formulário de criação do contato, existirá um botão
interruptor (Switch Toggle) minimalista escrito: "Encaminhar para um Funil de
Vendas".

O Fluxo: Ao ativar o interruptor, uma animação suave expande um painel interno
onde o operador escolhe a Pipeline e a Etapa desejada. Ao clicar em "Salvar", o
sistema processa uma transação atômica em segundo plano: cria o Contato
permanente e injeta instantaneamente o card de Oportunidade no funil correto.

🌋 EPIC 3: THE PIPELINE WAR ROOM (Dentro dos Funis de Venda) O Objetivo: Dotar
os funis de vendas (Kanban e Lista de Oportunidades) de telemetria comercial
avançada para leitura de velocidade de fechamento e controle absoluto do gestor.

⏱️ 3.1 Os Quatro Pilares de Telemetria Comercial Tanto na visualização em lista
da pipeline quanto na capa do card do Kanban, quatro indicadores críticos de
poder devem ser expostos em tempo real:

Tempo na Fase (Time in Phase): Exibir há quantos dias/horas aquele negócio está
parado na mesma coluna. Se ultrapassar o tempo limite estabelecido pelo gestor
para aquela fase, o contador deve acender em Precision Red pulsante.

Contador de Interações (Touchpoints): Exibir de forma numérica e direta a
quantidade total de pontos de contato feitos (mensagens trocadas, áudios
analisados).

Data de Próximo Contato: Exibir uma janela cronológica clara (Hoje 14:00,
Amanhã, Atrasado).

Dados Espelhados do Contato: Exibir no topo do card os dados vitais da
Identidade conectada (Nome, Link direto com atalho para o WhatsApp) sem exigir
que o usuário mude de tela.

🩻 3.2 Matriz de Raio-X de Oportunidades (OpportunityTable) A Visão: Alinhamento
absoluto. Na visualização em formato de tabela de uma pipeline específica, todos
os campos personalizados extraídos pelo cérebro da IA (dados do objeto
custom_data JSONB como kWp requisitado ou Status de Mobília) devem estar
expostos como colunas explícitas na tabela, combinando perfeitamente com os
dados visíveis no modal.

🧹 3.3 Expulsão em Massa de Negócios (Mass Deletion) A Visão: Comando tático.
Habilitar caixas de seleção em massa na tabela da pipeline. Se um canal de
tráfego injetar leads frios ou errados, o gestor pode selecionar 50 cards de uma
vez, clicar no botão de comando superior e eliminá-los do funil de forma
concorrente em um único clique.

🎚️ EPIC 4: THE PERFORMANCE TUNER (Dashboard Card Customization) O Objetivo:
Entregar ao administrador do sistema autoridade estética total sobre o cluster
de informações exibido nas capas do Kanban.

🎛️ 4.1 O Painel Configurador de Capas (CardFieldsPicker) A Visão: O usuário não
adapta seu cérebro ao software; o software se molda à visão do usuário. Dentro
das configurações de cada pipeline, existirá uma matriz elegante de checkboxes
representando todos os campos nativos do sistema + os campos customizados JSONB
daquele nicho.

A Mecânica de Fluxo: O administrador marca e desmarca o que deseja exibir na
face externa do card do Kanban. Se ele marcar apenas "Nome" e "Próximo Contato",
a capa do card assume uma estética ultra-minimalista e limpa. Se ele marcar
"Potência kWp" e "Tempo na Fase", o card reorganiza seu espaçamento interno
instantaneamente para exibir essas métricas na superfície do quadro, sem quebrar
o layout.

🔲 EPIC 5: THE EXPANDED COCKPIT (A Nova Experiência do Card) O Objetivo:
Redesenhar o Modal de detalhe da oportunidade para criar um ambiente de trabalho
indutor do Flow State para o vendedor.

🚪 5.1 O Painel Bi-Partilhado Estabilizado Ao expandir um card de oportunidade,
o layout abandona pop-ups genéricos e assume uma interface dividida em duas
zonas verticais com rolagens de tela independentes:

Lado Esquerdo (60% - A Linha do Tempo Viva): Exibe a conversa real do WhatsApp,
o histórico de notas e auditorias de forma cronológica. O vendedor pode rolar de
cima a baixo com extrema fluidez para absorver o contexto em segundos.

Lado Direito (40% - O Bloco de Engenharia de Dados): Painel fixo dividido
visualmente entre os dados permanentes da Identidade Conectada no topo e, logo
abaixo, as métricas e campos personalizados da Oportunidade (Valores, Próximas
Datas, Campos customizados). Tudo espaçado, com tipografia nítida e visual de
alta costura.

🔀 5.2 Troca de Marchas Lateral (Navegação por Setas / Paddle Shifters) O
Problema Clássico: Para analisar os leads do dia, o vendedor precisa abrir um
card, ler, fechar o card, voltar para o quadro, achar o próximo lead da coluna e
clicar para abrir. 20 leads geram 40 cliques de abertura e fechamento
desnecessários, destruindo a velocidade.

A Visão: Navegação por Paddle Shifters. No cabeçalho do card aberto, existirá um
par de setas discretas de navegação lateral (< e >).

O Fluxo de Alta Performance: Ao clicar na seta para a direita, o card atual
desliza suavemente para fora e o próximo lead daquela mesma coluna do Kanban
carrega instantaneamente dentro do mesmo modal, sem fechar a janela. O vendedor
passa por toda a sua fila de leads do dia aplicando ações, trocando de marchas
com velocidade máxima e cliques mínimos.

✅ CRITÉRIOS DE ACEITAÇÃO (DEFINITION OF DONE) [ ] A Base de Contatos global não
exibe nenhuma coluna de estágio ou valor financeiro.

[ ] A Base de Contatos roda com paginação contínua (Infinite Scroll) sem quebra
de estado visual.

[ ] O nome técnico @lid é automaticamente substituído por um marcador humanizado
na interface.

[ ] O drawer de novo contato possui o switch toggle que cria contato +
oportunidade em uma única operação.

[ ] A tabela de pipeline exibe todas as colunas do payload customizado JSONB de
forma explícita.

[ ] O configurador de campos altera dinamicamente as informações exibidas na
capa dos cards do Kanban.

[ ] O modal de card aberto adota o layout bi-partilhado e as setas de navegação
direta entre oportunidades da mesma fila.

Nota para Antigravity: O foco desta sprint é refinamento de chassi, ergonomia de
telas, consistência de dados e eliminação de fricção de cliques. O sistema deve
estar visualmente impecável sob o tema Precision OS Dark, com as tabelas e grids
perfeitamente limpos para que as ferramentas do servidor Agno possam ler e
escrever dados nas colunas certas no próximo ciclo.

---
---

# 🛠️ IMPLEMENTATION PLAN (preenchido pelo PM)

> Fluxo e regras: ver `Planning/agent_workflow.md`. O PM quebra a Visão acima em
> tarefas, define tier (S/M/L/XL), dono (agente/modelo), arquivos (file ownership)
> e o mapa de ondas. Engenheiros podem questionar/pedir correção do plano **antes**
> de codar. Branch: `<agent>/sprint5.1/<epic>/<task-desc>`.

## 📋 Task Table

| ID | EPIC / §  | Tarefa (o que fazer)        | Tier | Dono (agente/modelo) | Arquivos (ownership)        | Branch                              | Status |
| :- | :-------- | :-------------------------- | :--- | :------------------- | :-------------------------- | :---------------------------------- | :----- |
| T1 | 1.1       | _ex: purga de colunas_      | S    | _Gemini_             | `src/components/crm/...tsx` | `gemini/sprint5.1/epic1/column-purge` | [ ]    |
| T2 |           |                             |      |                      |                             |                                     | [ ]    |
| T3 |           |                             |      |                      |                             |                                     | [ ]    |
| …  |           |                             |      |                      |                             |                                     | [ ]    |

*Tiers: **S** mecânico · **M** um hook/componente · **L** hook + integração multi-arquivo · **XL** cross-cutting/arquitetura. Nunca rode S/M em modelo premium.*

## 🌊 Wave Map (paralelização — sem arquivos compartilhados)

```
Wave 1 (paralelo — sem arquivos compartilhados)
 ├─ T?  <agente> · <tarefa>
 └─ T?  <agente> · <tarefa>

Wave 2 (depende de T?)
 └─ T?  <agente> · <tarefa>
```

*Regra: toda tarefa na mesma onda toca arquivos diferentes. Dependências com `→`.*

## 🧐 Notas / Questões dos Engenheiros (antes de codar)

- _Engenheiro registra aqui dúvidas ou pedidos de correção do plano; PM responde antes de liberar a onda._

## 💰 Billing (espelho de `Planning/billing.md`)

| Data | Tarefa | Agente/Modelo | Tier | R$ |
| :--- | :----- | :------------ | :--- | :- |
|      |        |               |      |    |

*Cada engenheiro adiciona a linha ao concluir; PM confere no merge. Tiers: S=R$5 · M=R$12 · L=R$20 · XL=R$28.*

## 🔍 PM Double-Check (no merge de cada tarefa)

- [ ] **Task** — build limpo, só arquivos do escopo, bate com o plano.
- [ ] **Billing** — linha presente com o tier certo.
- [ ] **Acceptance** — satisfaz o(s) item(ns) da Definition of Done acima.
