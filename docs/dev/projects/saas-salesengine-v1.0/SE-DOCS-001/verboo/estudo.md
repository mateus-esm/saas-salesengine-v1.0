# SE-DOCS-001 — Estudo da Documentação do Software (Rev)

> Fonte de verdade derivada do código em `src/` (lido em 2026-09-26). Nada aqui foi inventado: cada afirmação remete a um arquivo real.

## 1. Inventário dos módulos reais do menu

Derivado de `src/components/AppSidebar.tsx` (L28-42) + `src/App.tsx` (rotas). Ordem do menu:

| # | Título no menu | Rota | Arquivo(s) | O que faz (derivado do código) |
|---|---|---|---|---|
| 1 | Início | `/home` | `src/pages/Home.tsx` (+ `CopilotHome`) | Hub de entrada. Se a equipe tem `is_crm_agent_enabled`, renderiza o Copiloto; senão, grade de cartões (`AppHubCard`) para os módulos. |
| 2 | Dashboard | `/dashboard/*` | `src/pages/dashboard/` (Layout + 5 páginas) | Inteligência comercial. 5 abas: Visão geral (KPIs + painéis personalizáveis via "Personalizar"), Funil (consolidado do período + por pipeline + receita por produto), Time (receita ganha e carga aberta por responsável), Canais (aquisição × atendimento, retorno por campanha), Relatórios (agendamento de relatório no WhatsApp, só admin). Filtro de período/pipeline vive no layout e é compartilhado entre abas (exceto Relatórios). |
| 3 | Chat | `/chat` | `src/pages/Chat.tsx` | Inbox multicanal (WhatsApp, Instagram, Telegram, Web, Messenger). 3 colunas: lista de conversas (`InboxSidebar`, abas Ativas/Arquivadas, busca, filtros por canal/responsável/funil, botões Sincronizar/Atribuir/Arquivar), thread com envio (Enter/Send marca "atendido por agente"), botões Assumir / Devolver Controle ao Agente, e painel CRM (Notas, Tarefas, Histórico). Badge "Janela Fechada" bloqueia envio fora da janela de 24h (CLOUD_API). |
| 4 | CRM | `/crm?tab=` | `src/pages/CRM.tsx` | Hub do CRM com 9 abas: Pipeline (Kanban `PipelineWorkspace` com sub-abas Kanban/Leads/Copilot; `EmptyPipelinesState` + "Criar Pipeline" → `/pipeline` quando vazio), Base de Contatos, Empresas, Imóveis, Catálogo, Campanhas, Tarefas, Tabelas, Agenda. Trocar de aba limpa filtros/deep-links. `?tab=copilot` redireciona para `/home`. |
| 5 | Copiloto | `/copiloto` → `/home` | `src/App.tsx` L119 (`<Navigate>`) | Não é tela própria: redireciona para `/home`, onde o `CopilotHome` é renderizado quando a flag da equipe está ativa. |
| 6 | AI Studio | `/ai-studio/*` (admin + `ai_studio`) | `src/pages/ai-studio/` (Layout + 5 páginas) | Configuração do cérebro do agente. 5 abas: Uso & Dados (consumo por modelo + `ModelSelector` do modelo ativo), Knowledge Base (pastas Perfil — wizard ou texto livre do comportamento; Empresa; Treinamento — blocos, website, vídeo, docs), Skills (gatilhos na conversa → webhooks/ações/respostas fixas), Canais (WhatsApp, Instagram, Cloud API, Telegram, Widget Web, Messenger, Mercado Livre; conectar via QR, ver status, excluir), Configurações (Conversa, Ações de inatividade, Webhooks, Regras de transferência). |
| 7 | Webhooks | `/webhooks` (admin + `webhooks`) | `src/pages/Webhooks.tsx` | Integrações inbound/outbound. 3 abas: Entrada (copiar URL do webhook do CRM / endpoint do provedor / inbound com mapeamento de campos), Saída ("Novo Webhook": evento gatilho + URL, switch ativa/desativa), Logs (execuções, badge Erro / HTTP não-2xx). URLs derivam de `VITE_SUPABASE_URL`. |
| 8 | Outreach | `/outreach` (admin + `webhooks`) | `src/pages/OutreachSettings.tsx` | Cadências de mensagens automáticas. 3 blocos: Canal e freios (provedor, linha, janela de envio, fuso, máximo/hora), Mensagem de abertura (texto + portas que disparam), Sequências (nome, 1 porta de entrada, passos com offset em minutos). Regras: sequência ativa na mesma porta suplanta a abertura; portas ocultas ficam indisponíveis. |
| 9 | Billing | `/billing/*` (admin + `billing`) | `src/pages/billing/` (Layout + 5 páginas) | Faturamento. 5 abas: Visão geral (plano atual + próxima cobrança, 2 pools de crédito WhatsApp/Copilot, fatura em aberto, últimas faturas), Faturas (histórico + botão Pagar), Créditos (saldo + recarga), Plano (tiers e adicionais), Dados de cobrança (CPF/CNPJ e endereço). `ContractStatusBanner` em todas as telas avisa proximidade de inadimplência. |
| 10 | Toolkit | `/toolkit` (badge "Em Breve") | `src/pages/ComingSoon.tsx` (`ToolkitPage`) | Placeholder: templates/scripts de automação futuros. Botão "Voltar". |
| 11 | Clube Solo | `/clube` (badge "Em Breve") | `src/pages/ComingSoon.tsx` (`ClubePage`) | Placeholder: indicações, networking, benefícios futuros. Botão "Voltar". |
| 12 | Suporte | `/suporte` (admin + `suporte`) | `src/pages/Suporte.tsx` | Contato humano: botão WhatsApp (`wa.me` com nome do tenant) + e-mail, e card com dados da equipe (nome, nicho, créditos). |
| 13 | Tutorial | `/tutorial` (todos) | `src/pages/Tutorial.tsx` | Página estática atual: 3 cards (Chat, Dashboard, Créditos), FAQ em acordeão (7 itens), Primeiros Passos (3 etapas), Melhores Práticas. Conteúdo hardcoded. |

Rotas autenticadas fora do menu: `/pipeline` (configuração de pipelines — `PipelineSettings.tsx`), `/notificacoes` (histórico, até 100 itens), `/tasks` (→ `/crm?tab=tasks`), `/admin` (só super_admin).

## 2. Mapeamento contrato × módulos reais

O contrato avisa que **Cockpit, Pipelines, Forms, Tables, Automations NÃO são 1:1 com o menu**. Reconciliação:

| Vocabulário do contrato | Módulo(s) real(is) do Rev | Justificativa |
|---|---|---|
| **Cockpit** | **Início (`/home`) + Dashboard (`/dashboard`)** | "Cockpit" = a cabine de comando. No Rev ela se divide em duas telas: o `/home` (abertura operacional com Copiloto e atalhos) e o `/dashboard` (visão analítica com KPIs). O guia cobre as duas como "sua cabine". |
| **Pipelines** | **CRM aba Pipeline (`/crm`) + `/pipeline` (configuração)** | O funil Kanban vive dentro do CRM; a criação/edição de etapas vive em `/pipeline`. São duas faces do mesmo conceito e o guia as trata juntas. |
| **Forms** | **Link público `/f/:token` ("Dados para Contrato") + Knowledge Base / Treinamento (docs)** | Não há item "Forms" no menu. O conceito se materializa nos formulários públicos de coleta (rota `/f/:token`, citada em `App.tsx` L88-91) e, do lado do operador, na aba Tabelas do CRM. O guia explica os dois lados. |
| **Tables** | **CRM aba Tabelas (`/crm?tab=tabelas`) — `custom_tables`/`custom_table_records`** | Tabelas customizadas (`table_schema jsonb` + `data jsonb`) expostas na aba Tabelas do CRM. Mapeamento direto. |
| **Automations** | **Outreach (`/outreach`) + AI Studio Skills (`/ai-studio/skills`) + Webhooks saída (`/webhooks`)** | "Automations" se distribui em três superfícies: cadências de mensagem (Outreach), gatilhos conversacionais (Skills) e integrações evento→URL (Webhooks de saída). O guia de automações aponta para os três, sem duplicar conteúdo. |

Módulos reais **sem correspondente no vocabulário do contrato** (ganham guia próprio mesmo assim, pois a lista é exaustiva pelo menu): Chat, AI Studio (Uso, Knowledge, Canais, Configurações), Webhooks (entrada/logs), Billing, Suporte, Notificações, Copiloto/Início.

## 3. Decisão de arquitetura: "atualizável sem novo deploy"

### Requisito
O conteúdo dos artigos NÃO pode viver só em código-fonte compilado (o deploy é Netlify no push da `main`: qualquer edição em `.tsx` exige rebuild + redeploy).

### Opções consideradas

| Opção | Como funcionaria | Prós | Contras | Veredito |
|---|---|---|---|---|
| **A. Artigos em tabela Supabase (`help_articles`) com RLS leitura pública autenticada** | Migration aditiva cria `help_articles` (+ `help_article_revisions` para versionamento). Seed inicial via `INSERT`. Front lê via `supabase-js` com React Query; edição via SQL/Studio ou tela admin futura. | Usa o backend que já existe; RLS já é o padrão do repo; versionamento trivial (tabela de revisões); sem nova infra; funciona offline-first com cache. | Exige 1 migration (aditiva, permitida); seed inicial precisa ser revisado. | **ESCOLHIDA** |
| B. Conteúdo remoto (Markdown em storage/CDN) | Arquivos `.md` no Supabase Storage, front faz fetch + render. | Edição = upload de arquivo, sem SQL. | Sem versionamento nativo (precisa convenção de pastas); busca e índice precisam ser reconstruídos no cliente; permissões de storage mais frágeis que RLS de tabela; render Markdown exige lib nova. | Rejeitada |
| C. `custom_tables` existente | Reusar a infra de tabelas customizadas. | Zero migration. | Mistura conteúdo do produto (help center) com dados do tenant; semântica errada; RLS por tenant impediria leitura global simples. | Rejeitada |

### Escolha: opção A
- **Tabelas**: `help_articles` (`slug` único, `module`, `title`, `summary`, `body_md`, `order`, `is_published`, `updated_at`) + `help_article_revisions` (snapshot de cada versão publicada: `article_id`, `version`, `title`, `body_md`, `published_at`, `published_by`).
- **Leitura**: qualquer usuário autenticado (`SELECT` para `authenticated`; conteúdo é global, não por tenant — ajuda é a mesma para todos).
- **Escrita**: só `service_role` (edição via Supabase Studio / SQL pelo time interno; v1 não expõe editor no app — evita superfície de admin e mantém o escopo).
- **Prova sem rebuild**: o front busca os artigos em runtime via Supabase. Um `UPDATE` no banco muda o texto exibido no próximo carregamento (ou imediatamente com invalidação do React Query), sem `npm run build`, sem push, sem Netlify. O `implementacao.md` documenta o comando exato e o efeito.
- **Fallback**: o bundle carrega um `seed` estático (mesmo conteúdo da migration) usado quando o Supabase está inacessível — o help nunca quebra por falha de rede, apenas mostra a versão do build com aviso discreto.
