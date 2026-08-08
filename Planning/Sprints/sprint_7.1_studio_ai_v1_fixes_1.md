# Sprint 7.1 — Studio AI v1: Fixes & Close-out

> **Atualizado 2026-08-07 (Claude/PM).** Duas partes: (A) o que falta para
> **fechar a Sprint 7**, com o estado real verificado em produção hoje; e (B) o
> backlog cru de feedback do Product Owner, preservado na íntegra, ainda a
> triar.

---

# Parte A — Fechamento da Sprint 7

## A.0 O que foi corrigido hoje (2026-08-07)

O sintoma reportado — *"conectei o QR code, mandei mensagem pela API e não
aparece no chat"* — tinha **duas causas independentes**, ambas corrigidas.
Branch: `fix/solo-webhook-token-delivery` (pushed, **PR ainda não aberto**).

### Bug 1 — Token do webhook nunca chegava (401 em 100% dos eventos)

O `manage-solo-instances` configurava a instância no whatsmiau com
`webhook.headers: { x-webhook-token }`. O whatsmiau **armazena** esses headers,
mas o dispatcher dele (`lib/whatsmiau/event_emitter.go`, função `doEmit`) só
envia `Content-Type` no POST — os headers configurados **nunca são enviados**.
Resultado: todo evento chegava no `solo-wpp-webhook` sem token e levava 401.

Confirmado nos logs de produção: dezenas de
`[solo-wpp] Token invalido ou ausente (401)` entre 17:46 e 19:05 UTC — exatamente
a janela em que o founder testava.

**Correção:** o token viaja na URL (`?token=…`). O `solo-wpp-webhook` aceita
header **ou** query param (header mantido para o dia em que o upstream
corrigir). O `solo-health-check` ganhou um reconciliador que compara
`webhook/find` com a URL esperada e re-aplica via `webhook/set` a cada tick —
instâncias antigas se auto-corrigem sem intervenção.

### Bug 2 — CHECK constraint barrava a criação do lead (23514)

Descoberto por E2E sintético **depois** de corrigir o 401 (o 401 mascarava
este erro). O `solo-wpp-webhook` insere leads com `creation_source: 'solo_api'`,
conforme a spec da T2 (`sprint_7_studio_ai_v1.md` linha 162), mas nenhuma
migration estendeu `leads_creation_source_check`, que aceita apenas
`manual | ai_agent | webhook | import`. **Toda** mensagem de um número novo
abortava com 23514.

**Correção:** migration `20260807020000_leads_creation_source_solo_api.sql`
adiciona `'solo_api'` ao CHECK. Como salvaguarda, o webhook faz fallback para
`creation_source='webhook'` se receber 23514 — a mensagem nunca é perdida
mesmo com a migration pendente (a proveniência real já vive em
`conversations.solo_instance_id` e `messages.provider='solo'`).

### Verificação em produção

E2E sintético com payload `messages.upsert` realista → `{"success":true}`.
Criou lead + conversation (`solo_instance_id` preenchido) + message
(`provider='solo'`, `provider_message_id`), com `unread_count` incrementado nos
dois níveis. **Linhas de teste removidas em seguida** (verificado: 0 resíduos).
A query da lista de conversas (`useConversations.ts`) filtra só por `equipe_id`,
sem restrição de canal — ou seja, conversa solo aparece no chat normalmente.

### Também corrigido: pg_cron health tick estava morto

O job `sprint7_health_tick` existia e rodava a cada 5 min, mas com uma
**service-role JWT embutida no `cron.job`** que ficou inválida após rotação de
chaves — resultado: 401 a cada tick desde sempre. Reescrito para autenticar com
`x-cron-secret` + novo edge secret `SOLO_HEALTH_CRON_SECRET` (criado hoje).
Verificado: `{"checked":2,"changed":[]}`.

---

## A.1 Ações do founder (bloqueiam o fechamento)

| # | Ação | Por quê | Como |
|---|---|---|---|
| 1 | ~~**Aplicar a migration `20260807020000`**~~ ✅ **FEITO** | O CHECK em prod já aceita `'solo_api'` (verificado 2026-08-08). Leads solo voltam a ser rastreáveis; o fallback para `'webhook'` não dispara mais | Aplicado manualmente pelo founder. ⚠️ **Não ficou registrado em `supabase_migrations.schema_migrations`** — o próximo `supabase db push` vai re-aplicar o arquivo. É seguro (`DROP ... IF EXISTS` + `ADD`) e re-sincroniza o ledger. Não editar nem apagar a migration |
| 2 | **Criar o edge secret `ASAAS_API_KEY`** | `sync-instance-billing` morre com `ASAAS_API_KEY not configured` → a cobrança de R$100/mês por instância conectada **nunca é lançada**. Provavelmente `asaas-subscribe` e `asaas-buy-credits` também estão inertes — vale checar o billing inteiro | Supabase Dashboard → Edge Functions → Secrets |
| 3 | **Mergear o PR** [#4](https://github.com/mateus-esm/saas-salesengine-v1.0/pull/4) `fix/solo-webhook-token-delivery` | As funções já estão deployadas em prod, mas o código só existe no branch | `gh pr merge` |

### Decisão: deploy de edge functions é manual (2026-08-07)

O workflow `.github/workflows/deploy.yml` foi **removido**. Ele falhava com
`unexpected list functions status 401` desde sempre (repo secret
`SUPABASE_ACCESS_TOKEN` inválido) e nunca chegou a deployar nada — na prática
todo deploy do projeto sempre foi manual via CLI local. Em vez de renovar o
secret, o founder decidiu assumir o modelo manual e eliminar o ruído de check
vermelho em cada push.

**Como deployar a partir de agora:**

```bash
supabase functions deploy <nome-da-funcao> [--no-verify-jwt] --project-ref egxzsivzqlqadoqpgfby
```

`--no-verify-jwt` para as funções públicas/webhook (ver `supabase/config.toml`,
que continua sendo a fonte de verdade de quais funções dispensam JWT).

O workflow `ci.yml` (testes: `backend-unit`, `frontend-build`, `backend-evals`)
**continua ativo** — só o deploy saiu.

---

## A.2 E2E live — o que ainda precisa de teste humano

O pipeline está provado com payload sintético. Falta o teste com aparelho real:

- [ ] **Re-escanear o QR e mandar uma mensagem de verdade.** Este é o teste que
      falhou hoje; com os dois bugs corrigidos deve funcionar. Confirmar que a
      conversa aparece no chat e o `unread` incrementa.
- [ ] **Capturar a sequência real de `connection.update`** (`qr-code` →
      `connecting`? → `open`) e um `messages.upsert` verbatim — para fechar o
      `sprint_7_api_reference.md`.
- [ ] **`sendText` real** → confirmar que `key.id` volta no response (é o
      `provider_message_id` do dedup).
- [ ] **Eco de coexistence:** mandar por um número que também está no GPT Maker
      e verificar que o dedup (AC4) não duplica.
- [ ] **GPT Maker — erro de janela fechada:** capturar status + body exatos para
      refinar o match da T5 (hoje o fallback dispara em qualquer non-2xx, o que
      é conservador demais).
- [ ] **Validar o valor no Asaas** depois da ação 2 (line-item de R$100).

**Gap menor observado:** `wpp_instances.phone` está `null` nas duas instâncias.
O `connectionState` não devolve `ownerJid`/`wuid`, só o evento
`connection.update` devolve — então o telefone deve preencher sozinho no
próximo pareamento. Se não preencher, o `solo-health-check` pode fazer backfill
via `fetchInstances` (que expõe `ownerJid`). Não bloqueia nada hoje.

---

## A.3 Dívida conhecida (não bloqueia o fechamento)

- **CI evals vermelho:** `python-agent/evals/test_eval_reliability.py::test_charge_idempotency_key_is_tenant_run_scoped`.
  Falha pré-existente, sem relação com a Sprint 7. Precisa de decisão: consertar
  ou marcar `xfail` com issue.
- **Instância órfã:** `se-a43f3b4a-teste` (equipe *Jornada do R1*) está
  `disconnected` e nunca conectou. Deletar se for lixo de teste — enquanto
  existir, entra na conta do reconciliador e do billing.

---

## A.4 Estado das instâncias em produção (2026-08-07 19:10 UTC)

| Instância | Equipe | Status | Telefone | Webhook |
|---|---|---|---|---|
| `se-939d7dd8-solo-teste` | Solo Energia | `connected` | — | ✅ reconciliado c/ token |
| `se-a43f3b4a-teste` | Jornada do R1 | `disconnected` | — | ✅ reconciliado c/ token |

> As duas instâncias **de produção do founder** (`solobusiness`,
> `soloventures-salesengine-admin`) continuam intocadas, como combinado.

---

# Parte B — Backlog do Product Owner (cru, a triar)

> Feedback original do founder, preservado na íntegra. Ainda **não** virou plano
> de sprint. Nota: o item **10 era, na prática, os dois bugs da Parte A.0** —
> reconfirmar com ele se sobrou alguma outra quebra nos canais depois do teste
> live.

View of Product Owner:

1. Studio AI -> Uso & Dados not sync with agent_provider;
2. Some sessions in en another in pt-br, we need to have the option to the
   system language;
3. Ex: Context of the enterprise use an Solo Energia example of writing, for all
   tenants we need to have an example more generic or fit with the niche,this
   for all types of examples in the system;
4. Treinamento personalizado -> Blocos i want that we can personalize the name
   of the block like: BL09 - Personalized (Apresnetação Coemrcial) for example;
5. Videos/Docs in sync with gpt maker and the possibiltie on to up the file in
   docs like is in the gpt maker;
6. Skills and intenções in an more logic, clear and intuitive way;
7. Crie um canal em Novo canal ou conecte uma instancia Solo API abaixo.

Conexão Direta (Solo API) +R$ 100/mês por instância conectada

I want this information in an better way an so an way to update when i want.

8. About the billing has differente things: Subscribe, Agent_provider credits
   that is the credits consuption in gpt maker, copilot credits that is the
   credits consuption of our crm internal agent and another services lime the
   wpp instances i want that the client can see and manage it like buy,canccel
   each one in the billing directly.

9. the config -> studio_ai dont make sense we need to be fit and sync with the
   agent_provider == gpt_maker so study the configs availble in the api of the
   agent_provider and make it fit and sync with the studio_ai;

10. studio_ai -> canais is not sync and not working in the real production

11. in chat changed the way of looking to the filter of channels i dont like
    this side roll bar i want like the another filters the simple list selection
    with the available channels.

---

## B.1 Triagem sugerida (PM)

Ordenado por *destrava cliente pagante* (critério do ROADMAP §6).

| Prioridade | Itens | Racional |
|---|---|---|
| **P0 — fecha Sprint 7** | 10 (feito, revalidar), Parte A.1 | Sem canal funcionando não há produto |
| **P1 — Marco 2 (COBRÁVEL)** | 8, 7 | Billing por serviço + clareza de preço são pré-requisito de cobrar |
| **P2 — Marco 1 restante** | 9, 1, 5, 4 | Sync config/treino com o GPT Maker é o núcleo do "AI Studio Core"; 4 e 5 são a sprint de Knowledge Base já prevista |
| **P3 — polimento** | 6, 11, 3, 2 | UX real, mas não bloqueia venda; o 2 (i18n) é o mais caro do grupo e o menos urgente com clientes só no Brasil |
