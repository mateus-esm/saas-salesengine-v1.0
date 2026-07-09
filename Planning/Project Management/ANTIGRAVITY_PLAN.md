# 📄 PRD: Solo Sales Engine (Visão Antigravity)

## 1. Visão Global do Produto: Sales OS

O **Solo Sales Engine** não é um CRM tradicional — é um **Sales OS (Sistema
Operacional de Vendas)**. Assim como o iOS/macOS organiza a operação de um
computador, o Solo organiza a operação de vendas de alta performance no Brasil.

### Sales OS vs CRM Tradicional

| CRM Tradicional               | Sales OS (Solo)                   |
| :---------------------------- | :-------------------------------- |
| Banco de dados passivo        | Ambiente de trabalho ativo        |
| Registro de atividades        | Execução de vendas "no fluxo"     |
| Relatórios estáticos          | Inteligência ativa nos bastidores |
| Ferramenta isolada            | Hub integrado                     |
| Vendedor se adapta ao sistema | Sistema se adapta ao negócio      |

**Design Philosophy:** "Precision OS" (Estética Apple Industrial - Vidro, Aço e
Minimalismo).

---

## 2. Pilares Estratégicos & Execução

### 💎 Pilar 1: A Experiência de Venda (Chat & Contexto)

**Filosofia:** "O vendedor nunca sai do chat para fechar negócio".

#### 1.1. Paridade com WhatsApp

O chat deve ter os mesmos superpoderes do WhatsApp, eliminando a fricção de uso.

- **Capabilities:**
  - ✅ Texto & Emoji
  - ⬜ **Áudio (UI Pendente)**
  - ⬜ **Imagem/Arquivo (UI Pendente)**
  - 🔮 Vídeo, Localização, Contato (Futuro)

_Proposta de UI (Redesenhada):_ Input com botões rápidos de mídia e preview
visual de anexos antes do envio.

#### 1.2. Contexto Imediato (CRM no Chat)

Resolver o problema de "perda de foco" ao navegar. O painel lateral e o header
devem ser "Centrais de Comando".

- **Quick Actions (Header):**
  - Dropdown de Status (Mudar etapa c/ 1 clique)
  - Edição de Valor (R$)
  - Toggle Agente IA/Humano
  - Agendar Follow-up

### 🧩 Pilar 2: Soberania do Cliente (Personalização No-Code)

**Filosofia:** "O software se molda ao negócio".

#### 2.1. Editor Visual de Pipeline

Interface Drag-and-Drop para que o gestor desenhe seu funil.

- Editar nome, cor e SLA de cada etapa.
- Definir automações de entrada (ex: Enviar msg ao cair em "Qualificação").

#### 2.2. Campos Personalizados Dinâmicos

Permitir que nichos (Solar, Imob) tenham seus campos de dados nativos na
interface.

- Configuração de tipos: Texto, Número, Select, Data, Moeda.
- Exibição condicional no Kanban e Chat.

### 🧠 Pilar 3: Inteligência Híbrida (AI Studio)

**Filosofia:** "IA é ferramenta configurável, não mágica".

#### 3.1. Dual Core Agents

Clarificar a separação para o usuário:

1. **Agente de Atendimento (GPT Maker):** Fala com o cliente.
2. **Agente de Operações (Analyze Message):** Ouve, extrai dados e organiza o
   CRM.

#### 3.2. Configuração Visual

Painel "AI Studio" onde o cliente define regras:

- _Trigger:_ Quando mensagem recebida...
- _Condition:_ Se intenção for "Comprou"...
- _Action:_ Mover para "Fechado" e avisar Slack.

### 🚀 Pilar 4: Growth & Gestão

**Filosofia:** Onboarding Self-Service.

- Configuração em 4 passos: Nicho -> WhatsApp -> Time -> Campanha.
- Dashboard Builder para métricas personalizadas.

---

## 3. Plano de Execução (Sprints)

### Sprint 1: Estabilização (Esta Semana) 👍

Foco em corrigir o que quebra a confiança e impede o uso básico.

- [x] **Corrigir Duplicação de Mensagens** (Webhook + Realtime)
- [x] **Otimizar `analyze-message`** (Redução de Tokens + Level 5 Extraction)
- [ ] **Corrigir Reset de Abas (CRMContextPanel)** (Bug Crítico de UX)
- [ ] **Corrigir Navegação Header Chat** (Mobile/Lista vs Detalhe)
- [ ] **Gerar Types Supabase Atualizados** (Manutenção)

### Sprint 2: Chat Power Features (Próxima Semana) ⚡

Transformar o chat em uma ferramenta completa.

- [ ] UI de Gravação de Áudio
- [ ] UI de Upload de Imagem/Arquivo
- [ ] Visualização de Mídia (Imagens/Áudio) no Chat
- [ ] Quick Actions no Header

### Sprint 3: Personalização 🎨

- [ ] Editor Visual de Pipeline
- [ ] Campos Customizados Dinâmicos (UI de Configuração)
- [ ] SLA por Etapa

### Sprint 4: AI Studio 🤖

- [ ] UI de Configuração do Agente CRM
- [ ] Regras Visuais de Automação
