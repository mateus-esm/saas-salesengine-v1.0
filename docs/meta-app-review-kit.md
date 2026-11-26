# Kit da App Review do Meta — Rev (Sprint 17)

App: **Rev** (tipo Business), portfólio **Solo Ventures**. Produto: CRM de vendas SaaS
multi-tenant. Cada cliente conecta o próprio portfólio pelo **Facebook Login for
Business** (configuração *System-user access token*) e escolhe páginas, contas de
anúncio e pixel. O Rev é **Tech Provider**: serve empresas que não são dele, então
precisa de **Advanced Access** (App Review) e de **Verificação do Negócio**.

## URLs para o painel do app

| Campo no painel | Valor |
|---|---|
| Valid OAuth Redirect URI | `<APP_URL>/integracoes/meta/callback` |
| Webhook (Page › leadgen) — callback | `https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/meta-webhook` — no painel: Webhooks › objeto **Page** › assinar o campo **leadgen** |
| Webhook — verify token | valor de `META_WEBHOOK_VERIFY_TOKEN` (gerado pelo Rev) |
| Data Deletion Request URL | `https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/meta-data-deletion` |
| Deauthorize Callback URL | o mesmo da exclusão |
| Privacy Policy URL | `<APP_URL>/privacidade` (texto do Mateus) |
| Terms of Service URL | `<APP_URL>/termos` (texto do Mateus) |
| App Domains | domínio do `<APP_URL>` |

## Permissões (o que pedir e por quê)

Texto para colar em "How will your app use this permission?" (em inglês, como o Meta pede):

- **leads_retrieval** — Rev is a sales CRM. When a client connects their Page, Rev receives each
  new Instant Form lead via the leadgen webhook and reads it (`GET /{leadgen-id}`) to create the
  contact and the deal in the client's own pipeline, so their sales team can follow up within
  minutes. We also offer a one-time import of the last 90 days of a form's leads.
- **pages_manage_metadata** — Required to subscribe the client's selected Page to our app's
  `leadgen` webhook (`POST /{page-id}/subscribed_apps`) and to remove that subscription when the
  client disconnects.
- **pages_show_list** — Lists the Pages the client shared during Facebook Login for Business so the
  admin can choose which Pages send leads to Rev.
- **pages_read_engagement** — Required by the Lead Ads API together with leads_retrieval to read lead
  data and the form's name on the selected Page.
- **pages_manage_ads** — Required by the Lead Ads retrieval guide to access all lead and ad-level
  data on the Page (lead forms linked to ads).
- **ads_read** — Reads the ad, ad set and campaign names and IDs of each lead, so the client's CRM
  shows which ad and campaign produced the lead and computes cost per lead / per sale. Also lists the
  client's pixels/datasets for the Conversions API setup.
- **ads_management** — *Pedir só se o diagnóstico da Fase 1 mostrar que `ads_read` não basta para
  os campos de anúncio do lead.* Rev never creates or edits ads.
- **business_management** — Reads the client's business portfolio id/name (`/me?fields=client_business_id`)
  and the Pages/pixels the client assigned to our app's system user.

Conversions API: com o pixel atribuído ao system user no diálogo, a doc diz que não precisa de
permissão extra para `POST /{pixel-id}/events`.

## Roteiro do vídeo (screencast, ~3 min, em inglês ou com legenda)

1. Login no Rev como admin de uma equipe de teste → **Integrações** → card **Meta · Lead Ads**.
2. **Conectar com Meta** → diálogo do Facebook Login for Business → escolher o portfólio, a Página,
   a conta de anúncio e o pixel → confirmar. Mostrar as permissões pedidas.
3. De volta no Rev: Página, conta e pixel listados → ligar **receber leads** na Página (o Rev faz
   `POST /{page-id}/subscribed_apps` e lista os formulários da Página).
4. Abrir a **Lead Ads Testing Tool** (developers.facebook.com/tools/lead-ads-testing) → criar um lead
   de teste na Página.
5. No Rev, o lead aparece no CRM com o nome do formulário, anúncio e campanha (mostra o uso de
   leads_retrieval, pages_read_engagement e ads_read). Mostrar também **Importar leads recentes**
   no formulário (o import de 90 dias citado em leads_retrieval).
6. Integrações › Meta › API de Conversões → escolher o pixel → **Enviar evento de teste** → mostrar o
   evento no Gerenciador de Eventos › Testar eventos.
7. **Desconectar** → mostrar que a Página deixa de estar inscrita.

## Checklist antes de enviar

- [ ] Verificação do Negócio da Solo Ventures concluída.
- [ ] Política de privacidade e termos publicados (cobrir: dados de leads tratados em nome do cliente,
      tokens guardados criptografados, exclusão pelo callback, contato do DPO).
- [ ] Usuário de teste para o revisor (login no Rev + Página de teste com formulário).
- [ ] Ícone do app 1024×1024, categoria "Business and pages".
- [ ] Vídeo do roteiro acima, um por permissão se o Meta pedir.
