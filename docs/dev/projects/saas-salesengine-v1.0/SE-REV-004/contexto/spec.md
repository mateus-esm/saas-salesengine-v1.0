# SE-REV-004 — Task Contract

Project: saas-salesengine-v1.0
Agent: claude
Branch: task/SE-REV-004-fix-event-save-and-send
Risk: medium
Origin: Discord #solo-dev 2026-09-26 (reporte do dono, 2 bugs)
Supersedes/continues: SE-REV-001 (PR #44), SE-REV-002 (PR #45), SE-REV-003 (PR #46)

## Outcome

Consertar, de ponta a ponta, os dois defeitos que o dono reportou na entrega do Outreach, e revisar
a entrega da SE-REV-001/002 para melhorar o que for possível.

## Bug 1 — "O evento não está sendo salvo: clico, ele diz que salvou, mas não salva"

Reporte literal: "O evento não esta sendo salvo eu clico ele diz wue salva mas não salva".

## Bug 2 — mensagem manual no chat não envia

Reporte literal: "Eu adicionei um contato manualmente e abri uma conversa no chat e enviei mensagem
mas não enviou e não chegou."

## Evidencia JA COLETADA pelo orquestrador (use, confirme, nao repita do zero)

**Bug 2 — causa raiz PROVADA** em `public.conversation_open_events` (gravado pela propria funcao):

```
error_code: channel_type_unsupported
message:    "O canal 3F32F1093C8681A460108E59734FC41E e do tipo Z_API.
             O provider so abre conversa em canal de WhatsApp nao oficial (WHATSAPP)."
ocorrencias: 4  (23:13, 23:14, 23:20, 23:31 UTC de 2026-09-25)
```

- O canal real da Casa Flow e `Casa Flow - WPP (API)`, tipo `Z_API`, `connected: true`.
- `supabase/functions/_shared/outreach/gptmaker.ts` tem
  `export const START_CONVERSATION_CHANNEL_TYPES = ["WHATSAPP"] as const;` e
  `supportsStartConversation()` so aceita esse tipo.
- MAS o proprio repo classifica `Z_API` como "WhatsApp (Z-API)" em
  `src/lib/channel-capabilities.ts` — e o WhatsApp NAO OFICIAL que o endpoint
  `POST /v2/channel/{id}/start-conversation` atende. A checagem esta estreita demais.
- Testes existentes afirmam o contrario e vao precisar mudar:
  `start-conversation.test.ts:59 assertEquals(supportsStartConversation("Z_API"), false)`.
- Cuidado: `channel-config.ts` registra que o `type` do provider NAO e confiavel como
  discriminador (`/workspace/{id}/channels` reporta WHATSAPP onde `/agent/{id}/search`
  reporta CLOUD_API). Trate CLOUD_API como NAO suportado e justifique.

**Bug 1 — ainda sem causa raiz.** Dados observados:
- `cadence_sequences` tem 2 linhas, e nas duas `updated_at == created_at` (nunca editadas).
- Ambas apontam `trigger_entry_ids = ['7e6576a0-...']` (porta "Manual"), embora uma se chame
  "Novo Lead - Meta ADS (Cadastro)" — ou seja, o que foi salvo nao casa com o nome escolhido.
- O front (`src/pages/OutreachSettings.tsx`) mostra toast `"Sequencia salva."` em `onSuccess`.
- `upsert-sequence` exige `caller.profileId` (JWT de usuario); com `x-webhook-secret` responde
  `"So usuario autenticado altera sequencias"` (testado pelo orquestrador).
- Suspeitas a testar (NAO assumir): (a) o draft perde o `id` e cada save INSERE de novo;
  (b) o Select da porta grava o id errado; (c) `steps` nao persiste; (d) o toast dispara sem
  persistir de fato. Pode ser outro caminho — investigue.

## Mandatory: verification by real rendering / real call

Nao basta `typecheck`/`lint`/`build` nem "a string esta no bundle". Para cada bug, produza prova
observavel:

1. **Bug 1:** reproduza o fluxo de salvar com o app real (Playwright + build de verdade, ou a edge
   function chamada como o front chama) e mostre o ESTADO NO BANCO antes/depois. Se o bug for de
   UI, capture o antes/depois da tela. Prove que o que a tela diz "salvo" esta no banco.
2. **Bug 2:** chame o caminho real de abertura de conversa e mostre `conversation_open_events`
   passando de `failed` para `opened` (ou o erro real restante). Nao basta o codigo mudar.
3. Salve as evidencias em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-004/claude/evidencias/`.

Se um cenario nao puder ser provado no sandbox, diga explicitamente qual e por que.

## Escopo

- Consertar os dois bugs com a menor mudanca coerente.
- Revisar a entrega SE-REV-001/002 e melhorar o que for possivel dentro deste escopo
  (ex.: a atomicidade do `upsert-sequence` apontada na revisao adversarial da SE-REV-002,
  o `sent` que nao comprova entrega). Registre o que NAO couber aqui.
- Sem mudar comportamento de outros tenants.

## Acceptance

- [ ] Causa raiz do bug 1 identificada com evidencia (nao por leitura de codigo).
- [ ] Causa raiz do bug 2 corrigida; `supportsStartConversation` aceita o canal real do tenant
      (Z_API) e continua recusando o que nao tem o endpoint (ex.: CLOUD_API), com justificativa.
- [ ] Testes de `supportsStartConversation` atualizados para a nova regra (e passando).
- [ ] Prova de que salvar persiste (estado no banco antes/depois).
- [ ] Prova de que a abertura de conversa deixa de falhar por `channel_type_unsupported`.
- [ ] `deno check`/`deno test` nas funcoes tocadas; `typecheck`/`lint`/`build` no front.
- [ ] Baseline de testes registrado sem mascarar.
- [ ] Artefatos em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-004/claude/`.
- [ ] Commit, push e PR.

## Do not touch

- Production secrets
- Main branch directly
- O workflow n8n do dono (e contexto, nao alvo) — nao editar
- Destructive infrastructure
- Schema/migrations sem justificativa minima

## Notas de ambiente (verificadas)

- Projeto Supabase: `egxzsivzqlqadoqpgfby`. Edge functions ja deployadas:
  `start-conversation`, `outreach`, `outreach-worker`, `send-chat-message`, `crm-webhook`.
- `deno` esta instalado (`/usr/local/bin/deno`); `deno check <file>` funciona.
- `NODE_ENV=production` no host faz `npm ci` omitir devDependencies: use
  `NODE_ENV=development npm ci --include=dev` e invoque
  `./node_modules/.bin/tsc -b` / `./node_modules/.bin/vitest run` (nao use `npx`).
- Suites `.tsx` precisam de `NODE_ENV=test` no comando, senao falham com `jsxDEV is not a function`.
