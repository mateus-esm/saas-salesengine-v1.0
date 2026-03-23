

# Plano MVP Final para Produção — Análise Completa

## Estado Atual do Projeto

O SaaS já possui uma base sólida com autenticação, multi-tenancy, CRM com Kanban/Database, Chat com WhatsApp via GPT Maker, Dashboard com KPIs reais, e Billing com Asaas. O design "Precision OS" foi aplicado com TopNavbar + App Hub.

---

## Problemas Críticos (Bloqueiam Produção)

### 1. Build Error: `analyze-message` Edge Function
**Problema:** Linha 252 — `lead.pipeline_stages?.name` falha porque a query retorna um array, não um objeto.
**Fix:** Mudar a query do lead para usar `.select('*, pipeline_stages!inner(name)')` com `.maybeSingle()`, ou acessar como `lead.pipeline_stages?.[0]?.name`.

### 2. Agente de Treinamento usa dados MOCK
**Problema:** `AgentTraining.tsx` usa `initialTrainings` hardcoded no estado local. `AgentUsage.tsx` usa `mockUsageData` hardcoded. Nenhum dado real é carregado do GPT Maker.
**Fix:** Conectar à API do GPT Maker via Edge Functions para buscar blocos de treinamento reais e dados de consumo reais.

### 3. Referências a "AdvAI" espalhadas pelo código
**Problema:** Billing, Tutorial e Suporte ainda referenciam "AdvAI" em vez do nome dinâmico da equipe/tenant.
**Fix:** Substituir todas as referências hardcoded por `tenant.name` ou `equipe.nome`.

---

## Módulo por Módulo — O que Falta

### A. Chat (80% pronto)
| Item | Status | Ação |
|------|--------|------|
| Envio de texto | OK | - |
| Recebimento via webhook | OK | - |
| Envio de imagens/docs | OK (upload funciona) | - |
| Recebimento de mídia do webhook | OK (mediaUrl/mediaType mapeados) | - |
| Áudio (gravação) | OK (useAudioRecorder) | - |
| Recebimento de áudio do cliente | Parcial | O webhook salva `media_url`/`media_type`, mas o `MessageBubble` já renderiza audio/video/image/document |
| Handoff IA/Humano | OK | - |
| Sync histórico GPT Maker | OK | - |

**Pendências Chat:**
1. Testar envio de áudio end-to-end (gravar → upload → GPT Maker → cliente recebe)
2. Verificar se mídia recebida do cliente via webhook renderiza corretamente no chat

### B. CRM (85% pronto)
| Item | Status | Ação |
|------|--------|------|
| Kanban drag-and-drop | OK | - |
| Database View editável | OK (TanStack Table com inline edit) | - |
| Trigger `handle_lead_lifecycle` | OK (lead→pipeline, contact→sai) | - |
| Campos `creation_source` | OK (trigger + AddLeadModal) | - |
| LeadDetailsModal | Existe | Verificar se todos os campos do banco estão acessíveis |
| Filtros no Database | OK (stage, responsible, type) | - |
| Import/Export CSV | Componentes existem | Verificar funcionalidade |

**Pendências CRM:**
1. Verificar se `AddLeadModal` envia `creation_source: 'manual'` e `lead_type: 'lead'`
2. Garantir que `company` e `position` estejam no LeadDetailsModal (campos existem no DB mas podem não estar no modal)

### C. Dashboard (90% pronto)
| Item | Status | Ação |
|------|--------|------|
| KPIs (8 cards) | OK | - |
| KPIs avançados (4 cards) | OK | - |
| Gráficos (pipeline, timeline, pie) | OK | - |
| Filtro por período | OK | - |
| Export CSV | OK | - |
| Fonte mono nos números | Pendente | Aplicar `font-mono` nos valores de KPI |

**Pendências Dashboard:**
1. Aplicar `font-mono` nos valores numéricos dos KPI cards

### D. Agente IA (40% pronto — CRÍTICO)
| Item | Status | Ação |
|------|--------|------|
| Tab Usage | MOCK | Conectar à edge function `fetch-gpt-credits` (já existe!) |
| Tab Training | MOCK | Criar edge function para buscar/criar/deletar blocos via API GPT Maker |
| Botão Atualizar | Não funciona | Conectar ao refetch |

**Pendências Agente (PRIORIDADE ALTA):**
1. `AgentUsage.tsx` — Substituir mock por chamada real à `fetch-gpt-credits` (a edge function já existe e retorna dados reais)
2. `AgentTraining.tsx` — Criar edge function `manage-agent-training` que faz CRUD na API do GPT Maker (`/v2/training-blocks`)
3. Conectar botão "Atualizar" ao refetch

### E. Billing (75% pronto)
| Item | Status | Ação |
|------|--------|------|
| Créditos (saldo/consumo) | OK (via fetch-gpt-credits) | - |
| Compra de créditos (Asaas) | OK | - |
| Planos (Solo Starter/Scale/Pro) | UI OK | - |
| PIX QR Code dialog | OK | - |
| Referências "AdvAI" | Bug | Substituir por nome dinâmico |

**Pendências Billing:**
1. Substituir "AdvAI" por `tenant.name` em todos os textos
2. Verificar se os planos hardcoded correspondem aos da tabela `planos`

### F. Suporte (95% pronto)
| Item | Status | Ação |
|------|--------|------|
| WhatsApp link | OK | - |
| Email link | OK | - |
| Info da equipe | OK | - |

**Pendência:** Nenhuma crítica. Apenas branding (já usa `tenant.name`).

### G. Tutorial (70% pronto)
| Item | Status | Ação |
|------|--------|------|
| Cards de overview | OK | - |
| FAQ Accordion | OK | - |
| Primeiros Passos | OK | - |
| Referências "AdvAI" | Bug | Substituir por nome dinâmico |
| Conteúdo genérico | Parcial | Atualizar textos para refletir funcionalidades reais |

**Pendências Tutorial:**
1. Substituir "AdvAI Portal" por nome dinâmico
2. Atualizar conteúdo do FAQ para refletir as funcionalidades atuais (não mais "jurídico")

---

## Plano de Implementação (Priorizado)

### Fase 1: Fixes Críticos (Desbloqueiam produção)
1. **Fix build error** em `analyze-message/index.ts` (linha 252)
2. **Conectar AgentUsage** ao `fetch-gpt-credits` real (remover mock)
3. **Conectar AgentTraining** — criar edge function `manage-agent-training` para CRUD via API GPT Maker

### Fase 2: Branding & Consistência
4. **Substituir "AdvAI"** por `tenant.name` em Billing, Tutorial e textos hardcoded
5. **Aplicar `font-mono`** nos KPIs do Dashboard e dados numéricos

### Fase 3: Robustez
6. **Verificar AddLeadModal** — garantir `creation_source: 'manual'`
7. **Testar fluxo de mídia end-to-end** — envio e recebimento de áudio/imagem/documento
8. **Deploy das edge functions** — garantir que `send-chat-message`, `analyze-message`, e `manage-agent-training` estejam no workflow de deploy

### Fase 4: Polish Final
9. **Atualizar conteúdo do Tutorial** para ser genérico (não "jurídico")
10. **Verificar responsividade** da TopNavbar e App Hub em mobile (viewport atual: 411px)

---

## Estimativa de Esforço

| Fase | Itens | Complexidade |
|------|-------|-------------|
| Fase 1 | 3 itens | Alta (edge functions + API integration) |
| Fase 2 | 2 itens | Baixa (find & replace textos) |
| Fase 3 | 3 itens | Média (testes + verificações) |
| Fase 4 | 2 itens | Baixa (conteúdo + CSS) |

**Recomendação:** Começar pela Fase 1 (desbloqueio) + Fase 2 (branding) na mesma iteração, pois são independentes e podem ser feitas em paralelo.

