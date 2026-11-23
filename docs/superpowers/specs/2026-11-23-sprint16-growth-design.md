# Sprint 16 — Growth (campanhas → growth, Ads, Windsor)

Origem: `Planning/Sprints/sprint_16_track_marketing.md` + conversa de 23/11/2026.

## Por quê
Saber **qual criativo e qual iniciativa vende**, não só quantos leads traz — e
tratar Ads como um canal entre vários (indicação, eventos, parcerias…) que o time
planeja e testa como experimentos.

## Escopo (esta sprint)
1. **Growth** substitui a aba Campanhas do CRM (mesmo `?tab=campanhas`, novo rótulo).
   Seções: Experimentos · Canais & campanhas · Ads · Resultados · Entradas.
2. **Experimentos**: planilha editável na própria tela (ICE, hipótese, canal,
   campanha, criativo, métrica, linha de base, meta, datas, status, resultado,
   decisão, aprendizado, responsável). Números ao vivo da campanha/criativo
   ligados, na janela do experimento.
3. **Ads**: criativos (código `P000-V0`) e anúncios (IDs da plataforma, campanha,
   criativo, destino, formulário, mensagem padrão do WhatsApp, verba, datas).
   As duas formas de entrar: o **Windsor descobre** (anúncio novo nasce "a
   completar", código lido do nome) e o **formulário** cadastra à mão (quando o
   Windsor não tem acesso).
4. **Ligação do toque**: ID do anúncio → mensagem padrão do WhatsApp → nome do
   anúncio → código `P000-V0` no `utm_content`/nome do anúncio → regras antigas
   (ID da campanha, utm_campaign, nome). Anúncio casado ⇒ plataforma e categoria
   paga do anúncio (conserta o formulário do Meta que caía em "Importação / API").
5. **Desempenho por criativo/anúncio**: métricas do gerenciador (gasto, CPM,
   frequência, gancho, retenção, CTR, leads/conversas da plataforma) lado a lado
   com o Rev (leads, negócios, ganhos, receita, custo por ganho, ROAS).
6. **Integrações** (`/integracoes`): cada equipe conecta **a própria API key do
   Windsor.ai**. Chave no Supabase Vault, nunca volta para o navegador (só os 4
   últimos). Sincronização diária (pg_cron → edge) + "Sincronizar agora".
   Gasto por anúncio/dia alimenta `crm_campaign_spend` (origem `meta_api`/`google_api`).

## Fora (sprints seguintes)
Webhook de Lead Ads do Meta; devolução de MQL/SQL/venda (CAPI / conversões
offline do Google); definição de MQL/SQL.

## Abordagens consideradas
- **Windsor descobre + formulário completa** — escolhida (com o formulário também
  cadastrando do zero, pedido do Mateus: "as duas").
- Só formulário — descartada sozinha: anúncio esquecido = gasto em lugar nenhum.
- Planilha no Google Sheets — descartada: duas fontes de verdade, sem ligação a leads.

## Decisões de construção (do Claude)
- Tabelas: `crm_creatives`, `crm_ads`, `crm_ad_metrics` (anúncio × dia),
  `crm_experiments`, `crm_integrations`; `lead_touches` ganha `crm_ad_id` e `creative_id`.
- Escrita só por verbos `security definer` (padrão da base); leitura RLS por equipe.
- Escolher a campanha de um anúncio põe o ID da campanha da plataforma nas
  `match_keys` da campanha — os próximos anúncios dela e os toques com
  `utm_campaign={{campaign.id}}` caem sozinhos.
- Windsor: uma chamada por conector (`facebook`, `google_ads`); os campos pedidos
  são a interseção com `/{connector}/fields` (a doc não confirma todos os nomes).
  Conector não conectado = pulado, não erro.
- Mensagem padrão: a edge manda `_first_text` (300 caracteres) só para casar; o
  banco não guarda (sai do `raw`).
- Experimentos: ICE (1–10 cada) como prioridade; sem fórmula estatística.
