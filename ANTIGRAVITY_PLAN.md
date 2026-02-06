# 📄 PRD: Solo Sales Engine (Visão Antigravity)

## 1. Visão Global do Produto

O **Solo Sales Engine** não é apenas um CRM, é um **Sistema Operacional de
Vendas (Sales OS)** desenhado para operações de alta performance no Brasil. Ele
une a **fluidez de comunicação** do WhatsApp com a **precisão de dados** da
engenharia e a **automação** da Inteligência Artificial.

- **Design Philosophy:** "Precision OS" (Estética Apple Industrial - Vidro, Aço
  e Minimalismo).
- **Core Promise:** O vendedor vende mais rápido, o gestor tem controle total, e
  a IA trabalha nos bastidores.

---

## 2. Pilares Estratégicos (Por Ordem de Prioridade)

### 💎 Pilar 1: A Experiência de Venda (Chat & Contexto)

_Visão:_ O vendedor nunca deve precisar sair da tela de chat para fechar um
negócio. O chat deve ser tão poderoso quanto o WhatsApp nativo, mas
"anabolizado" com dados.

- **Objetivos de Produto:**

1. **Paridade com WhatsApp:** Eliminar a fricção. Se o vendedor pode mandar
   áudio e foto no Zap, ele _tem_ que poder fazer isso aqui. (Resultado: Adoção
   do time de vendas).
2. **Contexto Imediato:** Ao falar com o cliente, o vendedor deve ter o poder de
   editar o negócio (valor, status, dados) com um clique, sem navegar por menus.
3. **Confiabilidade:** A ferramenta deve ser sólida. Mensagens duplicadas ou
   bugs de interface (como abas resetando) destroem a confiança.

### 🧩 Pilar 2: Soberania do Cliente (Personalização No-Code)

_Visão:_ O software deve se moldar ao negócio do cliente, e não o contrário. O
cliente sente que o sistema foi "feito para ele".

- **Objetivos de Produto:**

1. **Flexibilidade de Dados:** Permitir que nichos específicos (Solar, Imob)
   criem seus próprios campos de dados essenciais sem intervenção de suporte.
2. **Fluxo de Trabalho Único:** Permitir que cada equipe desenhe seu próprio
   funil de vendas (Kanban) visualmente.

### 🧠 Pilar 3: Inteligência Híbrida (AI Studio)

_Visão:_ IA não é "mágica", é uma ferramenta configurável. O cliente é o
"treinador" do seu próprio agente.

- **Objetivos de Produto:**

1. **Dual Core:** Clarificar para o usuário a diferença entre o "Agente de
   Atendimento" (que fala com o lead via GPT Maker) e o "Agente de Operações"
   (que organiza o CRM).
2. **Autonomia:** Entregar uma interface visual onde o cliente conecta sua IA e
   define as regras, aproveitando a infraestrutura de backend que já
   construímos.

### 🚀 Pilar 4: Growth & Gestão (Onboarding e Dados)

_Visão:_ A entrada no software deve ser "Self-Service" e a gestão deve ser
visual.

- **Objetivos de Produto:**

1. **Entrada sem Fricção:** Um fluxo de "Boas-vindas" que configura o ambiente
   (Nicho -> WhatsApp -> Time) em minutos.
2. **Visibilidade:** Dashboards que o gestor pode montar para ver exatamente as
   métricas que importam para a meta dele.
3. **Conectividade:** Webhooks visuais para conectar o Sales Engine ao mundo
   (Meta Ads, Google Forms) facilmente.

---

## 3. Status Atual (Baseado na análise do Claude)

- **Backend:** Pronto para Mídia, Webhooks e IA.
- **Frontend:** Faltam componentes de UI para Áudio/Mídia, Configuração de
  Agente e Editor de Pipeline.
- **Bugs Críticos:** Reset de abas no CRM Panel e Duplicação de Mensagens.

## 4. Plano de Execução (Checklist)

### Fase 1: Correção de Bugs Críticos (Imediato)

- [ ] Corrigir Reset de Abas no CRMContextPanel (Perda de contexto ao navegar)
- [ ] Corrigir Navegação do Header do Chat (UX quebrada)
- [ ] Corrigir Duplicação de Mensagens (Confiabilidade)

### Fase 2: Chat Power Features (Experiência de Venda)

- [ ] UI de Upload de Mídia e Áudio (Paridade WhatsApp)
- [ ] Visualização de Mídia no Chat
- [ ] Ações Rápidas no Chat (Editar Lead, Status)

### Fase 3: Personalização (Soberania do Cliente)

- [ ] Editor Visual de Pipeline (Kanban)
- [ ] Campos Personalizados por Nicho

### Fase 4: Inteligência e Growth

- [ ] Interface de Configuração do Agente (AI Studio)
- [ ] Dashboards Flexíveis
