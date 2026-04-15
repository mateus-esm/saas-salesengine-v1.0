🧠 1. Compreensão da Intenção e Estratégia Agnóstica A tua intenção é clara:
Criar um "Omnichannel Inbox" viciante, de alto desempenho, focado em equipas de
vendas, que no futuro será alimentado pela tua própria infraestrutura
(Whatsmeow).

A Regra de Ouro Agnóstica para esta Sprint: O teu frontend React NÃO DEVE fazer
chamadas diretas à API do GPT Maker para ler mensagens ou perfis. Tudo deve
passar pelas tuas Edge Functions e ser guardado no Supabase. O frontend ouve
apenas o Supabase via Realtime.

Porquê? Porque na V2, o teu n8n/Whatsmeow vai apenas injetar dados nas mesmas
tabelas do Supabase, e o UI vai funcionar perfeitamente sem reescrever código.

🎯 2. Priorização de Tarefas (A Matriz de Impacto) Organizei os teus 9 pontos em
3 Fases de Sprint. O objetivo é consertar o que está quebrado primeiro,
enriquecer os dados depois, e finalizar com o "Design Premium".

Fase 1: Estabilidade Core (Fricção Zero)

[x] Real-time sem refresh (Ponto 8)

[x] Anti-duplicação de mensagens (Ponto 1)

[x] Scroll automático para o fundo (Ponto 3)

[x] Correção de Links que aparecem como strings estranhas (Ponto 6)

Fase 2: Motor Omnichannel & Enriquecimento (O Valor do SaaS)

Lógica de Atribuição (Responsible User) e Segmentação de Canal (Ponto 4)

Nome do Agente Correto em vez de "bot" (Ponto 2)

Sincronização de Foto de Perfil, Nome e Metadados do GPT Maker para o Supabase
(Ponto 5 & 6)

Fase 3: UX/UI Supremacy (A Retenção estilo "Casino")

[x] Design minimalista, linhas finas, elegante (Ponto 9)

[x] Indicadores de Presença/Leitura (Ponto 5)

[x] Ações avançadas de canal (Delete/Edit) (Ponto 8b)

🚀 3. O Arquivo de Memória (PRD) para o Antigravity / Claude Copia o bloco
abaixo e guarda-o como um ficheiro chamado CHAT_V1_SPRINT.md na raiz do teu
projeto. Este ficheiro será o "Cérebro" para as tuas IAs executarem as tarefas
sem se perderem.

# 🚀 CHAT V1 SPRINT: OMNICHANNEL SUPREMACY

## Visão Arquitetural (MANDATÓRIO LER ANTES DE CODAR)

Estamos a construir uma interface de Chat Agnóstica. O Frontend (React) DEVE
comunicar exclusivamente com o Supabase. O provedor atual (GPT Maker) é apenas
um motor de sincronização de retaguarda. Todo o estado, realtime e metadados
devem fluir através do `useMessages` e `useChatSessions` consumindo do Supabase.

## FASE 1: O Motor Perfeito (Zero Bugs)

### 1.1. Anti-Duplicação e Real-time Fluido

- **Ficheiro:** `src/hooks/useMessages.ts`
- **Ação:** Refatorar a subscrição do Supabase Realtime.
  - Garantir `supabase.removeChannel()` no cleanup do useEffect ao trocar de
    lead.
  - **Lógica Otimista:** Ao receber um evento `INSERT` via webhook, verificar se
    a mensagem já existe no estado local (comparando `id` ou `temp_id` criado no
    momento do envio). Se existir, atualizar status para `delivered`. Se não,
    dar append.
- **Ação:** Remover qualquer necessidade de "Refresh" (F5) na página para ver
  novas mensagens.

### 1.2. Scroll to Bottom (Ancoragem)

- **Ficheiro:** `src/components/inbox/MessageList.tsx` ou componente onde as
  mensagens são mapeadas.
- **Ação:** Implementar um `useRef` no final da lista. Usar um `useEffect`
  dependente do array `messages` que invoque
  `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })` sempre que
  uma mensagem nova entrar ou o chat abrir.

### 1.3. Parser de Links Limpo

- **Ficheiro:** `src/components/inbox/MessageBubble.tsx`
- **Ação:** Implementar ou melhorar o utilitário de formatação de texto para
  identificar URLs na string e transformá-las em tags `<a>` clicáveis, aplicando
  propriedades `target="_blank" rel="noopener noreferrer"`, evitando que strings
  sujas de JSON apareçam no texto.

## FASE 2: Team Inbox & Enriquecimento de Dados

### 2.1. Omnichannel & Atribuição de Equipa

- **Banco de Dados (Supabase):** Garantir que a tabela `leads` ou
  `chat_sessions` tenha as colunas: `assigned_to` (UUID do vendedor) e `channel`
  (string: whatsapp, instagram, web).
- **UI (`InboxSidebar.tsx`):**
  - Adicionar um badge discreto com o logo/ícone do Canal na foto do lead.
  - Mostrar a foto/iniciais do utilizador responsável ao lado da data/hora do
    chat.
- **Permissões (Filtro Local):** Se o utilizador logado for Admin/Manager,
  mostrar todos os chats. Se for Vendedor comum, filtrar os chats onde
  `assigned_to === currentUser.id`.

### 2.2. Nomenclatura e Avatares Reais

- **Ficheiro:** `MessageBubble.tsx` e `ConversationHeader.tsx`
- **Ação:** Quando `role === 'assistant'` (IA), exibir o `agentName` real
  recuperado do Supabase, e não labels genéricas como "Bot".
- **Ação:** Consumir a propriedade `picture` (URL da foto de perfil) do lead,
  que a nossa Edge Function do webhook deve agora extrair do payload do GPT
  Maker e atualizar no Supabase.

## FASE 3: Design "Casino Retention" (Sober & Elegant)

O design atual deve evoluir para uma estética de alto nível, retentiva e super
limpa (Precision OS Light Mode).

### 3.1. Refatoração Visual (Tailwind)

- **Paleta:** Fundos off-white (ex: `bg-slate-50`), bolhas de mensagem brancas
  puras (`bg-white`) com bordas extremamente finas
  (`border border-slate-200/50`) e sombras super sutis (`shadow-sm`).
- **Tipografia:** Textos em cinza escuro sóbrio (`text-slate-800`), e metadados
  (horas, status) em fontes monoespaçadas super pequenas e claras
  (`text-[10px] text-slate-400 font-mono`).
- **Bordas:** Angularidade elegante. Em vez de bolhas super redondas, usar
  `rounded-md` ou `rounded-lg` com a ponta de fala sutil.

### 3.2. Metadados de Presença

- **Ação:** Na bolha da mensagem, adicionar o clássico duplo-check do WhatsApp.
  Se o payload do banco (vindo do webhook do GPT maker list-chats) indicar
  `read: true`, pintar os checks de azul pastel (`text-blue-500`).

### 3.3. Funções Avançadas (Preparação Z-API)

- **Ação:** Nos "três pontinhos" do MessageBubble das mensagens enviadas pelo
  vendedor, adicionar as opções inativas de "Apagar Mensagem" e "Editar
  Mensagem". O UI deve estar pronto para quando os endpoints da API forem
  integrados na V2.
