# 🧭 ROADMAP v1 — Visão do Product Manager

> **Documento vivo.** Esta é a visão consolidada de produto/projeto para o ship da v1.
> As visões anteriores (founder + engenheiros) estão preservadas no **Apêndice A** ao final.

---

## 1. TL;DR — A decisão estratégica central

**O plano anterior coloca "1 cliente pagante em produção" como critério de saída da Fase 5. Isso está invertido. Cliente real em produção é o meio do plano, não o fim.**

Ship da v1 não é "todas as features completas". Ship da v1 é: **3 clientes pagando, usando o produto sem suporte manual diário, e renovando no mês seguinte.** Tudo no roadmap deve ser julgado por uma pergunta: *isso aproxima ou atrasa o primeiro cliente pagante?*

A consequência prática: cortamos ~40% do escopo proposto para pós-v1, invertemos Billing ⇄ AI Studio na ordem, e inserimos um marco explícito de "Primeiro Cliente" no meio da sequência — porque as decisões das fases finais (dashboard, notificações, automação) devem ser guiadas por uso real, não por especulação nossa.

---

## 2. A tese do produto (o que o cliente está comprando)

O cliente **não** compra um CRM. CRM é commodity — Pipedrive, RD, HubSpot fazem isso melhor e mais barato do que nós conseguiremos na v1.

O cliente compra: **"um agente de IA que atende e vende no meu WhatsApp, com um cockpit que me mostra o que está acontecendo no meu funil."**

Isso define a hierarquia de valor:

| Camada | O que é | Status hoje | Papel na venda |
|---|---|---|---|
| **1. O agente** (AI Studio + canal WPP) | A promessa central. É o que justifica o ticket | 🔴 Embrionário / inputs quebrados | **É o produto** |
| **2. O cockpit** (Pipeline, Chat, Copilot, Agenda) | Onde o cliente vê o agente trabalhando | 🟢 Sólido (10+ sprints) | Prova de valor / retenção |
| **3. A operação** (Billing, Admin, Onboarding) | O que nos permite cobrar e operar | 🟡 Parcial + bug crítico | Habilitador |
| **4. O ecossistema** (Toolkit, Clube Solo, Automações) | Crescimento sobre base sólida | ⚪ Não existe | **Pós-v1** |

**Insight de priorização:** a camada 2 está pronta e a camada 1 está quebrada. Ou seja: temos o "espelho" mas não temos o "motor". Todo sprint gasto polindo a camada 2 antes de completar a camada 1 é sprint gasto no lugar errado. **AI Studio vem primeiro, não Billing.**

---

## 3. Onde discordo do plano anterior (e por quê)

### 3.1 Billing completo antes do AI Studio — invertido
O argumento "sem billing não há negócio" é verdadeiro no limite, mas superdimensionado para os primeiros clientes. Para cobrar 1–5 clientes design-partner não precisamos de UI de planos, histórico de faturas, tiers e feature gating — precisamos de **um link de pagamento Asaas e o webhook de confirmação**. O que é bloqueador de verdade no billing é pequeno e cirúrgico (ver Sprint 7.0). Billing *completo* (self-service, planos, gating) só paga dividendo quando houver volume — e volume não é o gargalo da v1.

### 3.2 "Fase completa antes de avançar" — substituir por "fatia mínima que destrava o cliente"
Completude é o princípio certo para *features* (nada de 10 coisas meio-prontas), mas errado para *fases*. Se esperarmos AI Studio 100% (incluindo Whatsmeow + Salvy) antes de qualquer cliente, empurramos a primeira receita e o primeiro aprendizado real por meses. A fatia mínima do AI Studio que destrava venda é: **agente configurável + treinamento funcionando + canal WPP via GPT Maker**. Whatsmeow e Salvy não estão nessa fatia.

### 3.3 Whatsmeow (WPP próprio) — fora da v1
Razões, em ordem de peso:
1. **Risco de plataforma:** API não oficial = risco de ban dos números dos clientes. Um cliente que perde o número no primeiro mês é churn + dano de reputação irreversível para um produto novo.
2. **Custo de infraestrutura:** exige um microserviço Go novo (broker), Docker, ciclo de vida de instâncias, monitoramento — uma superfície operacional inteira nova, para um time que precisa focar em completar o que existe.
3. **Redundância na v1:** o GPT Maker já entrega canal WhatsApp. Whatsmeow é uma otimização de margem/controle, não um desbloqueio de valor.

**Decisão:** pós-v1. Mesma lógica para **Salvy** (compra de números): é conveniência, não desbloqueio. Quando entrar, entra como *facilitação* (cliente compra, nós orquestramos), nunca revenda na v1 — revenda traz implicação fiscal e de suporte que não queremos carregar agora.

### 3.4 Toolkit Shop e Clube Solo — são v2, sem ambiguidade
Marketplace e programa de afiliados só funcionam sobre uma base de clientes que ama o produto. Com 0 clientes, são features de crescimento sem nada para crescer. Manter na visão, tirar do roadmap de execução.

### 3.5 O que o plano anterior acerta (e mantemos)
- O diagnóstico do **webhook Asaas** (assinatura ativa antes do pagamento) é o achado técnico mais importante do documento — vira item da primeira sprint.
- O pipeline de pré-processamento de treinamento (site/vídeo/PDF → TEXT) é a solução correta para os inputs quebrados.
- A convenção de nomeação de blocos (`# [Título: ...]`) é pragmática e mantém sync bidirecional.
- Rotação de chaves como transversal urgente.
- Fila de webhooks com retry via database triggers — arquitetura certa, timing Fase de escala.

---

## 4. O caminho crítico — 4 marcos, não 5 fases

```
Marco 0 ── CONFIÁVEL ──── "Não temos vergonha nem risco"     (~1 sprint)
Marco 1 ── VENDÁVEL ───── "O agente funciona de ponta a ponta" (~2-3 sprints)
Marco 2 ── COBRÁVEL ───── "Cliente real pagando e onboardado"  (~1-2 sprints)
Marco 3 ── RETÍVEL ────── "Cliente vê valor e renova"          (~2 sprints, guiado por feedback)
─────────────────────────────────────────────────────────────
           = v1 SHIPPED. Depois: ESCALÁVEL (automação/suporte) já com receita.
```

### Marco 0 — CONFIÁVEL (Sprint 7.0, "Trust & Close-out")
Curto e não-negociável. Limpa risco e fecha pontas soltas antes de abrir frente nova.

- **Rotação de todas as chaves expostas** (commit `15a4f80` + chats). Isso é bloqueador de produção, não "tech debt". Dias, não semanas.
- **Webhook Asaas (`asaas-webhook`):** `PAYMENT_RECEIVED` → ativa assinatura + credita pacote; `PAYMENT_OVERDUE`/`SUBSCRIPTION_DELETED` → `PAST_DUE`/soft block. Mapear `externalReference` para créditos avulsos. Validação por token de header. *(É pequeno e corrige um bug de integridade de receita — não espera a "fase de billing".)*
- **Fast-follows pendentes do 6.10:** E2E live da relation column, minors do Review-1, flag do vitest.
- **Saída:** chaves rotacionadas; pagamento confirmado é o que ativa assinatura; backlog do 6.x zerado ou explicitamente movido.

### Marco 1 — VENDÁVEL (Sprints 7.1–7.3, "AI Studio Core")
A promessa central funcionando de ponta a ponta, com **GPT Maker como provider único da v1** (decisão fechada — multi-provider é abstração prematura; o custo de trocar depois é real mas menor que o custo de atrasar agora).

- **7.1 — Sync + Knowledge Base:** estudo sério da API do GPT Maker (uma vez, documentado); sync bidirecional das configurações do agente; blocos de treinamento nomeados (convenção de título no texto); pipeline de pré-processamento site/vídeo/arquivo → TEXT.
- **7.2 — Skills & Channels:** registro/edição de intenções sincronizado; pull das capacidades do provider; workflow completo de configuração de canal dentro da seção.
- **7.3 — Hardening do fluxo completo:** um usuário não-técnico configura agente (knowledge + skills + canal WPP) sozinho, sem ticket. Estados de erro, feedback de sync, edge cases.
- **Saída (teste real):** *nós mesmos* criamos um tenant limpo e montamos um agente vendedor completo usando só a UI, em menos de 1 hora. Se não conseguimos, não está vendável.

### Marco 2 — COBRÁVEL (Sprint 8, "First Customer")
O objetivo do sprint não é código — é **cliente**. O código é o mínimo que o cliente exige.

- **Billing mínimo viável:** página com plano atual + histórico de cobranças + status; compra de créditos avulsos fechando o loop com o webhook do 7.0. **Plano único com créditos** na v1 (decisão fechada — tiers são otimização para um funil que ainda não existe; instância/número extra entram como line-items quando existirem).
- **Onboarding mínimo:** fluxo guiado de 4 passos (Nicho → WhatsApp → Time → Pipeline) com opção de pular. Sem tour elaborado — checklist funcional.
- **Admin mínimo para operar:** ver tenants, status de assinatura, alterar plano/créditos sem abrir o banco. (Admin 360 com dashboards de MRR/churn fica para quando houver M de MRR.)
- **Meta de negócio do marco:** **1–3 clientes design-partner pagando** (preço de early adopter, contato direto conosco, feedback semanal). Vendidos manualmente — self-service completo não é pré-requisito para os primeiros 10 clientes.

### Marco 3 — RETÍVEL (Sprints 9–10, "Prove Value")
Só agora, com uso real, investimos em percepção de valor — porque agora sabemos *o que* os clientes olham.

- **Dashboard de vendas v1:** página dedicada (não widgets), 5–7 KPIs top-down: conversão por estágio, velocity, atividade por canal/responsável. Escopo final definido pelo que os design-partners pedirem.
- **Notificações v1:** in-app primeiro; WhatsApp/e-mail só para eventos de billing (fatura, vencimento). Workflow completo de notificações é pós-v1.
- **Copilot — latência real:** profiling do python-agent, caching, escolha de modelo (o item wall-clock deferido do 6.10).
- **Passe de UI/UX guiado por sessão com clientes**, não por auditoria interna: loading/empty/error states nas páginas que os clientes de fato usam.
- **Saída = definição de v1 shipped:** 3+ clientes pagando, ativos ≥4 semanas, ≥1 renovação de ciclo, zero intervenção manual de banco para operar o dia a dia.

### Pós-ship — ESCALÁVEL (a partir do Sprint 11, já com receita informando prioridade)
Ordem provável, a validar com dor real de suporte: webhooks completos (fila + retry + logs UI) → suporte com AI (FAQ + tickets → WPP do admin) → regras de automação (**3–5 templates prontos** tipo "lead parado >5 dias → notificar"; visual builder no-code é v2) → PWA/mobile → Whatsmeow → Salvy → Toolkit → Clube Solo.

---

## 5. Decisões estratégicas — fechadas agora (mudar depois custa caro)

| # | Decisão | Escolha v1 | Racional |
|---|---|---|---|
| 1 | Provider de IA | **GPT Maker único** | Multi-provider é abstração prematura sem clientes |
| 2 | Precificação | **Plano único + créditos** (avulsos p/ excedente) | Tiers otimizam um funil que não existe; simplifica billing, gating e mensagem de venda |
| 3 | Ciclo | **Mensal apenas**; sem trial self-service — pilotos negociados manualmente | Anual/trial são otimizações de conversão para depois do product-market fit |
| 4 | Inadimplência | **Soft block** (dados legíveis, agentes desligados) + carência 7 dias | Hard block queima relação cedo demais; agente desligado já dói o suficiente |
| 5 | WPP próprio (Whatsmeow) | **Pós-v1** | Risco de ban + microserviço Go novo + redundante com GPT Maker |
| 6 | Salvy | **Pós-v1; facilitação, nunca revenda** | Conveniência, não desbloqueio; revenda = passivo fiscal |
| 7 | AI Studio no plano | **Incluso** | É o produto. Vender o produto como add-on do próprio produto não faz sentido |
| 8 | Dashboard | **Página dedicada** | Widgets configuráveis são v2 |
| 9 | Notificações | **In-app + billing por WPP/email** | Workflow completo multi-canal é pós-v1 |
| 10 | Automação | **Templates prontos, sem visual builder** | Builder no-code é o item mais caro da lista para o menor N de clientes |
| 11 | Suporte AI | **Pós-ship**, reusando estrutura do AI Studio | Com <10 clientes, suporte manual é feature (aprendizado), não bug |

---

## 6. Princípios de execução

1. **Cliente real é o marco central, não o critério final.** Tudo antes do Marco 2 existe para viabilizá-lo; tudo depois existe para retê-lo.
2. **Fatia mínima que destrava, completude dentro da fatia.** Nada meio-pronto — mas a fatia é definida pelo que o cliente precisa, não pelo escopo total da área.
3. **Manual antes de automático.** Venda manual, onboarding acompanhado, suporte no WhatsApp pessoal. Automatizar atrito que ainda não sentimos é desperdício.
4. **Feedback de design-partner > opinião interna.** Do Marco 3 em diante, o backlog é ordenado pelo que os 3 primeiros clientes pedem.
5. **~15% de cada sprint para dívida/bugs** (mantido do plano anterior — está certo).
6. **Toda decisão da Seção 5 é final até o ship.** Reabrir decisão fechada exige evidência de cliente, não preferência nossa.

---

## 7. Riscos principais e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| API do GPT Maker mais limitada que o esperado (sync, tipos de treino) | Alto — mina o Marco 1 | Spike de 2–3 dias no início do 7.1 mapeando a API real antes de comprometer escopo; o pipeline "tudo vira TEXT" já contorna a limitação conhecida |
| Lock-in GPT Maker (decisão #1) | Médio, prazo longo | Manter camada fina `manage-agent-*` como fronteira única com o provider (já é o padrão das edge functions) |
| Chaves expostas exploradas antes da rotação | Crítico | Marco 0, primeira ação, esta semana |
| Não encontrarmos 3 design-partners | Alto — invalida cadência | Começar a prospectar **durante o Marco 1** (rede do founder), não depois dele |
| Perfeccionismo no Marco 3 adiando o ship | Médio | Definição de shipped é numérica (3 clientes, 4 semanas, 1 renovação) — não estética |

---

---

# 📎 Apêndice A — Conteúdo anterior deste documento

> **[APPENDIX — versão anterior do roadmap, preservada na íntegra para referência.]**
> Visão original do founder (ver também `Planning/todo.md`) + roadmap estratégico dos engenheiros + recomendações técnicas (AGY). A visão do PM acima **substitui** este conteúdo como plano de execução; as recomendações técnicas do AGY continuam válidas e foram absorvidas nos marcos.

# 🚀 Roadmap Estratégico: Solo Sales Engine v1

> **Visão:** Sales OS — um Sistema Operacional de Vendas, não um CRM tradicional.
> Ambiente de trabalho ativo que organiza a operação de vendas de alta performance no Brasil.

---

## 📍 Onde Estamos Hoje

| Marco | Status |
|---|---|
| 10+ sprints entregues (Nov 2025–Jul 2026) | ✅ |
| CRM v1 (Pipeline, Kanban, Base de Contatos, Custom Tables) | ✅ |
| Solo Copilot v1 (Análise de mensagens, Telemetria, Scoreboard) | ✅ |
| Chat V1 (Integração WhatsApp, Histórico, Sincronia) | ✅ |
| Agenda (Dia/Semana/Mês) | ✅ |
| Autenticação, RBAC, Multitenant | ✅ |
| AI Studio (Estrutura inicial: páginas Channels/Knowledge/Skills/Settings) | 🟡 Embrionário |
| Billing (Integração Asaas inicial) | 🟡 Parcial |
| Admin Panel | 🟡 Básico |
| Webhooks | 🟡 Parcial |

**Tipo de mudança:** Saímos de "construir fundação" para "shipar produto real". O foco muda de *features* para *completude*.

---

## 🗺️ Mapa Estratégico — 5 Fases para o Ship v1

Cada fase representa um tema estratégico. As sprints são o tático dentro de cada fase.

```
Fase 1 ─── Fundação Comercial ─── "Pode cobrar"
Fase 2 ─── AI Studio ──────────── "Pode vender"
Fase 3 ─── Experiência ───────── "Pode reter"
Fase 4 ─── Automação ─────────── "Pode escalar"
Fase 5 ─── Ecossistema ───────── "Pode crescer"
```

---

### 🏗️ Fase 1: Fundação Comercial
**Missão:** Transformar o projeto em um negócio real — cobrar, gerenciar clientes, e operar sem abrir o banco.

**Por que primeiro:** Nada disso é glamouroso, mas sem billing funcional e admin panel você não consegue operar o negócio. É a fundação que viabiliza tudo o resto.

#### Entregáveis Estratégicos

| Área | Descrição | Complexidade |
|---|---|---|
| **Billing Completo** | Histórico de faturas, integração Asaas completa (assinaturas + créditos), precificação por agente/número/instância, notificações de vencimento/pagamento, UI de planos | Alta |
| **Admin Panel 360** | Visão completa do sistema: usuários, tenants, configurações, permissões sem DB, dashboards operacionais | Alta |
| **Segurança** | Rotação das chaves expostas no git history (Supabase, OpenAI, Anthropic, etc.) | Média |
| **Fast-follows pendentes** | E2E relation column, wall-clock agent latency, per-owner predictability depth, minors do Review-1 | Baixa |

#### Decisões Estratégicas a Resolver

1. **Modelo de precificação v1:** plano único (tudo incluso) vs. tiers (Basic/Pro/Enterprise)? Por agente? Por número WPP? AI Studio incluso ou add-on?
2. **Ciclo de faturamento:** mensal apenas ou anual com desconto? Trial grátis?
3. **Asaas integration scope:** usar Asaas como subadquirente (cartão + boleto) apenas, ou também para split de pagamento e notas fiscais?
4. **Inadimplência:** soft block (algumas features desligadas) vs. hard block (tudo suspenso)? Período de carência?

#### Critério de Saída

- Um cliente real consegue se cadastrar, escolher um plano, pagar (cartão/boleto), e usar o produto sem intervenção manual
- Admin consegue ver quem pagou, quem não pagou, e alterar plano de qualquer tenant sem abrir o banco
- Nota fiscal emitida automaticamente ou sob demanda
- Chaves expostas no git history estão todas rotacionadas
- Métricas de negócio visíveis no Admin Panel (MRR, churn, clientes ativos)

#### Dependências

- ⬅️ **Desbloqueia** Fase 2 (AI Studio): feature gating por plano precisa existir
- ⬅️ **Desbloqueia** Fase 4 (Automação): rate limiting de webhooks por plano
- ➡️ **Depende de:** nada — esta fase é a primeira por design. O billing do Asaas já tem integração inicial, mas precisa ser completada.

---

### 🤖 Fase 2: AI Studio
**Missão:** Completar a promessa central do produto — o cliente configura seu próprio agente de IA sem precisar de suporte técnico.

**Por que agora:** AI Studio é o principal diferencial competitivo vs. CRM tradicional. É o que justifica o ticket. O esqueleto já existe (páginas, permissões), precisa ser preenchido.

#### Entregáveis Estratégicos

| Área | Descrição | Complexidade |
|---|---|---|
| **GPT Maker Sync Bidirecional** | Toda alteração no AI Studio reflete em tempo real no GPT Maker. Fim do "configura aqui e depois lá" | Alta |
| **Knowledge Base Completa** | Blocos de treinamento nomeados, fix dos inputs (site/video/file), acoplamento real com a API do GPT Maker | Alta |
| **Skills & Intenções** | UI de registro/edição de intenções, triggers, e actions. Sincronizado com o provider | Média |
| **Channels Management** | Pull automático das possibilidades do provider, workflow completo de configuração na seção | Média |
| **WPP Próprio (Solo Ventures)** | Conexão via Whatsmeow (QR code), gestão de instâncias, billing por instância | Alta |
| **Números via Salvy** | Compra/facilitação de números diretamente pela plataforma, monthly billing agregado | Média |

#### Decisões Estratégicas a Resolver

1. **GPT Maker como provider único na v1?** Ou já arquitetar multi-provider desde o início? Trade-off: tempo de implementação vs. lock-in.
2. **WPP próprio (Whatsmeow):** substituto do canal GPT Maker WPP ou complementar? Se substituto, qual o plano de migração para clientes existentes?
3. **Salvy:** marketplace (facilitamos a compra, cliente compra direto) vs. revenda (compramos no atacado, revendemos com margem)? Implicações fiscais diferentes.
4. **AI Studio no plano ou add-on?** Se incluso, o preço do plano sobe. Se add-on, complexidade de billing aumenta.

#### Critério de Saída

- Cliente configura um agente de IA completo (knowledge base + skills + canal) sem abrir ticket de suporte
- Sincronia bidirecional com GPT Maker operacional: criar/editar/deletar no AI Studio reflete no provider em <30s
- Knowledge base com blocos nomeados, treinamento por site/vídeo/arquivo funcional sem erros
- Canal WPP próprio (Whatsmeow) funcional: QR code, conexão, gestão de instâncias
- Compra de número via Salvy operacional (marketplace ou revenda)
- Billing por instância WPP + número funcionando e atrelado ao plano

#### Dependências

- ➡️ **Depende de** Fase 1: feature gating + billing por instância/número
- ⬅️ **Desbloqueia** Fase 3: Copilot e Dashboard usam dados do AI Studio
- ⬅️ **Desbloqueia** Fase 4: Suporte com AI depende do AI Studio configurado

---

### 🎯 Fase 3: Experiência & Inteligência
**Missão:** Elevar a qualidade percebida — o app precisa ser rápido, bonito, e inteligente.

**Por que agora:** Com o core funcional (Fase 2), o foco vira retenção. Dashboard e Copilot refinado são o que fazem o cliente ficar.

#### Entregáveis Estratégicos

| Área | Descrição | Complexidade |
|---|---|---|
| **Dashboard de Vendas** | Visão completa do processo: por pipeline, agente, canal, tempo, responsável. KPIs top-down com granularidade | Alta |
| **Solo Copilot Evoluído** | Latência real (wall-clock), features mais úteis, resposta em cache, per-owner predictability avançado | Média |
| **UI/UX General Review** | Consistência visual, micro-interações, estados vazios, loading states, feedback de erro | Média |
| **Notificações Workflow** | Notificações in-app + push para eventos: lead novo, stage change, fatura vencendo, ticket aberto | Alta |
| **Refinamento Mobile/PWA** | Responsivo para uso mobile, PWA funcional para consulta rápida | Média |

#### Decisões Estratégicas a Resolver

1. **Dashboard é uma página dedicada ou widgets integráveis?** Página dedicada é mais simples; widgets permitem montar visões diferentes por perfil.
2. **Copilot predictions:** usar o python-agent próprio ou API externa de classificação? O python-agent já existe mas tem latência alta.
3. **Notificações:** in-app apenas ou também WhatsApp/email? Se WhatsApp, usar o mesmo canal do chat ou um separado? Implicações de custo e arquitetura.
4. **Mobile-first vs. PWA-first:** o app atual é web. Um PWA bem feito cobre 80% dos casos de uso mobile sem precisar de React Native.

#### Critério de Saída

- Dashboard funcional com KPIs top-down: MRR, pipeline velocity, conversão por estágio, atividade por agente
- Copilot com latência real <2s (não apenas perceived latency)
- Consistência visual verificada em todas as páginas (loading → dados → empty → error)
- Notificações push + in-app operacionais para eventos críticos de vendas e billing
- App funcional e utilizável em mobile para consulta rápida (PWA ou responsivo)

#### Dependências

- ➡️ **Depende de** Fase 1: notificações de billing (fatura vencendo, pagamento confirmado)
- ➡️ **Depende de** Fase 2: Copilot predictions usam dados do AI Studio; dashboard consome dados do CRM + AI Studio
- ⬅️ **Desbloqueia** Fase 4: notificações são pré-requisito para suporte com AI notificar admin

---

### 🔄 Fase 4: Automação & Escala
**Missão:** Reduzir atrito operacional e suporte manual — o sistema se sustenta.

**Por que agora:** Para escalar sem aumentar o time de suporte proporcionalmente. Clientes pequenos e médios esperam self-service.

#### Entregáveis Estratégicos

| Área | Descrição | Complexidade |
|---|---|---|
| **Webhooks Poderosos** | Sistema de webhooks completo: eventos configuráveis, retry, logs, debugging UI | Média |
| **Suporte com AI** | FAQ inteligente, tickets diretamente da plataforma (notificar admin via WPP + painel) | Média |
| **Tutorial & Onboarding** | Tour guiado de 4 passos (Nicho → WhatsApp → Time → Campanha), docs integrados, tooltips | Média |
| **Regras de Automação** | Trigger → Condition → Action visual builder (ex: "se lead parou > 5 dias → notificar"). Já existe rascunho no `rule-engine.ts` | Alta |

#### Decisões Estratégicas a Resolver

1. **Regras de automação:** visual builder (no-code arrasta-solta) vs. config JSON/YAML avançado? O visual builder é mais caro de construir, mas é o que clientes não-técnicos compram.
2. **Suporte com AI:** usar o mesmo Copilot do cliente (reusa o agent configurado) ou um agente de suporte separado (mais controle, mais custo)?
3. **Webhooks:** eventos pré-definidos ou permite expressões customizadas (JSON path) para o cliente escolher o payload? Eventos pré-definidos são mais seguros.
4. **Onboarding:** tour guiado na primeira vez vs. dashboard vazia com CTAs progressivas? O tour guiado funciona para conversão, mas quebra se o cliente sai do fluxo.

#### Critério de Saída

- Webhooks configuráveis por evento, com retry automático, log de entregas, e UI de debugging
- Suporte com AI responde FAQs automaticamente e abre ticket humano quando não sabe
- Ticket notifica admin via WPP + painel admin em <30s
- Onboarding funcional: novo cliente passa pelos 4 passos e chega ao dashboard com dados reais
- Regras de automação operacionais: trigger (evento/tempo) → condition (filtro) → action (notificar/mover/atualizar)
- Engine de regras testada com ao menos 3 regras em produção de cliente real

#### Dependências

- ➡️ **Depende de** Fase 1: rate limiting de webhooks por plano (billing)
- ➡️ **Depende de** Fase 2: suporte com AI reusa a estrutura do AI Studio
- ➡️ **Depende de** Fase 3: notificações são pré-requisito para suporte notificar admin
- ⬅️ **Desbloqueia** Fase 5: automação robusta permite self-service que escala sem time grande

---

### 🚀 Fase 5: Growth & Ecossistema
**Missão:** Criar canais de crescimento orgânico e receita recorrente além da assinatura base.

**Por que depois:** Essas features geram crescimento, mas só funcionam se o produto base estiver sólido. Toolkit vende para quem já é cliente; Clube Solo atrai novos.

#### Entregáveis Estratégicos

| Área | Descrição | Complexidade |
|---|---|---|
| **Toolkit Shop** | Loja de skills, plugins, automações workflows, projetos personalizados e serviços | Alta |
| **Clube Solo** | Programa de indicação/afiliados, blog de negócios/growth/vendas, comunidade (WPP group) | Média |
| **Onboarding Experience** | Experiência refinada de primeiro uso — não apenas tutorial, mas sensação de "setup completo em minutos" | Média |

#### Decisões Estratégicas a Resolver

1. **Toolkit Shop:** marketplace interno (só nossos itens, curadoria manual) vs. aberto (terceiros publicam, revenue share)? Aberto escala mais, mas requer moderação e suporte.
2. **Clube Solo — recompensa:** créditos na plataforma (reinveste) vs. descontos na assinatura (menos MRR) vs. dinheiro (complexidade fiscal)? Créditos é o mais simples.
3. **Comunidade:** grupo WPP orgânico (baixo esforço, difícil moderar) vs. plataforma tipo Circle/Discourse (mais controle, mais custo)?
4. **Precificação do Toolkit:** itens avulsos (cada skill se paga) vs. assinatura "Toolkit Pass" (receita previsível)? Ambos?

#### Critério de Saída

- Toolkit Shop funcional com ao menos 5 skills/plugins disponíveis para compra/instalação
- Clube Solo operacional: link de indicação único por usuário, tracking de conversões, recompensa automática em créditos
- Blog integrado ao app com conteúdo de vendas/growth publicado semanalmente
- Onboarding refinado: novo usuário configura pipeline + equipe + WhatsApp em <5 minutos
- Ao menos 1 cliente pagante em produção validando as decisões de produto (idealmente 3+)
- MRR crescendo via indicações (não apenas aquisição paga)

#### Dependências

- ➡️ **Depende de** Fase 1: billing para recompensas do Clube Solo
- ➡️ **Depende de** Fase 2: Toolkit Shop vende skills construídas no AI Studio
- ➡️ **Depende de** Fase 4: onboarding refinado constrói sobre o tutorial da Fase 4; comunidade usa suporte com AI como triagem inicial

---

## 📐 Princípios para a Priorização

1. **Monetização primeiro** → Nada de features gratuitas antes de poder cobrar. Billing na Fase 1.
2. **Completeza sobre quantidade** → Cada fase deve ser "shipada" completamente antes de avançar. Nada de 10 features meio-prontas.
3. **Dependências técnicas guiam** → Notificações (Fase 3) são pré-requisito para Suporte (Fase 4). Webhooks (Fase 4) dependem de Billing (Fase 1) para rate limiting.
4. **Validação com clientes reais** → Antes da Fase 5, devemos ter ao menos 1 cliente pagante em produção para validar as decisões de produto.
5. **YAGNI** → Se uma feature não é essencial para o ship da v1, vai para "pós-v1". O roadmap já é ambicioso.

---

## 🔮 Pós-v1 (Visão)

- Multi-BSP (não só GPT Maker)
- Mobile apps nativos (React Native)
- Marketplace público de skills (terceiros)
- API pública para integrações terceiras
- Analytics preditivo (previsão de receita, churn scoring)
- AI interno de suporte evolui para CSM autônomo

---

## ⚡ Como Usar Este Roadmap

1. **Cada fase vira 1-N sprints.** O número de sprints por fase depende da complexidade e do ritmo.
2. **O roadmap é vivo.** Revise a cada 2 sprints para ajustar prioridades com base no feedback real.
3. **Fases podem sobrepor.** Se uma equipe trabalha em Billing e outra em AI Studio, as fases 1 e 2 podem correr em paralelo.
4. **Dívida técnica emerge.** Cada sprint deve ter ~15% de capacidade para manutenção e bugs.
5. **Decisões Estratégicas** devem ser resolvidas **antes** da primeira sprint de cada fase — documente a decisão e siga. Se mudar depois, o custo é alto.

---

## 🤖 Recomendações Técnicas e Arquiteturais (AGY)

Após uma análise detalhada do codebase (incluindo o motor de regras, fluxos de billing do Asaas, páginas do AI Studio, logs e o histórico de sprints), consolidados as seguintes recomendações para garantir a completude técnica da **v1.0**:

### 1. Billing & Gestão de Acesso (Fase 1)
*   **Implementação de Webhook do Asaas (Urgente):** A função `asaas-subscribe` ativa imediatamente a assinatura no banco de dados antes da confirmação do pagamento. É crítico criar uma Edge Function (`asaas-webhook`) para ouvir os eventos do gateway:
    *   `PAYMENT_RECEIVED`: Ativa a assinatura do tenant (`equipes.subscription_status = 'ACTIVE'`) e credita o pacote mensal de créditos do plano.
    *   `PAYMENT_OVERDUE` / `SUBSCRIPTION_DELETED`: Atualiza o status para `PAST_DUE` ou `SUSPENDED`, aplicando um bloqueio suave (soft block: dados legíveis, agentes desativados) ou severo (hard block).
    *   **Segurança:** Validar os IPs de origem do Asaas ou injetar um header token (`x-webhook-token`) na configuração da conta do Asaas e validá-lo no Deno.
*   **Recargas de Créditos Avulsos:** A função `asaas-buy-credits` apenas cria a cobrança no Asaas. O webhook acima deve mapear a `externalReference` (ex: `credits_equipeId_timestamp`) e adicionar os créditos avulsos correspondentes em `equipes.creditos_avulsos` no momento do pagamento recebido.

### 2. AI Studio: Treinamento & Metadados (Fase 2)
*   **Compatibilidade de API do GPT Maker:** O endpoint `POST /v2/agent/{id}/trainings` do GPT Maker aceita apenas `"type": "TEXT"`. Enviar `"WEBSITE"`, `"VIDEO"` ou `"DOCUMENT"` diretamente causa falha técnica. Recomenda-se criar um *Pipeline de Pré-processamento* na Edge Function `manage-agent-training`:
    *   **Websites:** Fazer o fetch do HTML no servidor, extrair o texto limpo (ex: usando `deno-dom` ou um parser simples) e enviar como `TEXT`.
    *   **Documentos (PDFs):** Converter arquivos de mídia do Supabase bucket em texto limpo usando bibliotecas utilitárias de leitura de PDF e subir como `TEXT`.
    *   **Vídeos:** Obter a transcrição de áudio/legendas do link do YouTube e enviar como `TEXT`.
*   **Identificação de Blocos (Nomeação):** Como o GPT Maker não armazena títulos/nomes para blocos de texto estruturado, podemos usar uma convenção de marcação nos blocos salvos (ex: prependando `# [Título: Minha Regra de Reembolso]\n` no início do texto). A Edge Function e o frontend podem fazer o parse desse cabeçalho para exibir títulos amigáveis no `TrainingBlockEditor.tsx` sem perder a sincronia bidirecional.

### 3. Integração Salvy & Conexão Direta WPP (Fase 2)
*   **Whatsmeow Broker Service:** Para oferecer a conexão via Whatsmeow (Whatsmeow é escrito em Go), deve-se criar um microserviço Go leve rodando em Docker (ex: no Dokploy/VPS). Esse serviço gerencia o ciclo de vida dos clientes Whatsmeow, gera o QR code em Base64 para exibição na página `/ai-studio/channels`, e envia as mensagens e eventos recebidos de volta para o Supabase (`sync-chat-history` ou `crm-webhook`).
*   **Compra de Número (Salvy):** Criar uma Edge Function `salvy-integration` para consultar DDDs disponíveis e provisionar DIDs (números de telefone). Atrelar o ID do número comprado na Salvy ao plano de faturamento da equipe no Supabase, adicionando a taxa fixa mensal ao Asaas.

### 4. Engine de Webhooks de Saída (Fase 4)
*   **Desacoplamento por Fila de Eventos (Database Triggers):** Atualmente, os webhooks de saída são disparados diretamente na Edge Function `crm-webhook` apenas na criação do lead. Para abranger qualquer alteração no pipeline (ex: mudança de estágio no Kanban ou tag adicionada), configure triggers de banco de dados (`AFTER INSERT OR UPDATE ON opportunities / leads`) que inserem tarefas em uma tabela `webhook_queue`.
*   **Processamento Assíncrono:** Uma Edge Function executará em background consumindo esta fila, realizando disparos com retry exponencial e logando as tentativas na tabela `webhook_logs`. Isso garante resiliência e visibilidade sem travar o client do usuário.

### 5. Segurança & Handoff (Transversal)
*   **Rotação de Chaves Seguras:** Execute um script para rotacionar as chaves expostas no commit `15a4f80` (Supabase Service-Role, OpenAI, Anthropic, JWT Secret) e remova-as dos arquivos rastreados pelo Git, utilizando estritamente variáveis de ambiente do Dokploy e Supabase Edge Secrets.
