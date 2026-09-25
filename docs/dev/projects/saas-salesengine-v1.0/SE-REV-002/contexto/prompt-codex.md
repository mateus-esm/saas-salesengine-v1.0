Você é o harness de EXECUÇÃO da task SE-REV-002 no repo `saas-salesengine-v1.0` (Rev / AI Studio do Sales Engine). Você está assumindo a task de outro harness que parou no meio. **Continue de onde parou — não recomece.**

---

## Leia primeiro, nesta ordem (obrigatório)

1. `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/contexto/decisions.md` — **7 decisões do dono do produto**. Elas restringem o que você pode fazer. Leia antes de qualquer coisa.
2. `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/claude/plano.md` — o plano (974 linhas). A **seção 6 é a sua ordem de execução**; a **seção 0 (Veredito)** explica as decisões.
3. `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/contexto/spec.md` — o contrato.
4. `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/contexto/prompt-execucao-cont.md` — o prompt de retomada que o harness anterior recebeu, **com dois adendos** (tela mínima e envio sem conversa ativa).

## Estado atual do worktree (confira você mesmo antes de agir)

Rode `git log --oneline b8f16bb..HEAD` e `git status`. O esperado:

**Já commitado (Fase 0 — passos 1 e 2 do plano):**
- `bad1824` fix(rev): tratar 200 {success:false} do provider como recusa
- `7b7e492` fix(rev): abertura automática filtra pela porta de entrada e pelo source do evento

**Escrito, NÃO commitado:**
- `supabase/migrations/20260926000100_serev002_outreach.sql` (~966 linhas: 5 tabelas, ~18 funções, 9 gatilhos) — passo 3
- `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/claude/pg-local/` (stubs + runner do Postgres local)
- `plano.md` e `contexto/`

**Primeira tarefa:** validar a migration do motor contra o plano (§3), rodar o teste SQL dela em Postgres 15 local, e commitá-la como passo 3. Depois siga os passos 4–12 + os passos 2b e 8b dos adendos.

## Fatos de produção já confirmados (NÃO precisa repetir)

- **Casa Flow** = `equipe_id aa33b576-3959-4a81-8e73-4027039ea2ce`, com `workspace_id` **e** `gpt_maker_agent_id` → **tenant GPT Maker**.
- **Porta do n8n**: `webhook_configs.id ca544dfe-b643-4df0-addb-345992a2abdc` ("Meta ADS - Cadastro") → `crm_entries.id 5a0349b1-efd4-4d17-b9ab-4f8502ff8574`, `kind='webhook'`.
- **`leads.source` da Casa Flow (30 dias)**: `webhook_inbound` 42 · `IA` 146 · `Manual` 1. A string `"Meta Ads - Cadastro (Social Pago)"` **não existe** como `source` — o gatilho é **pela porta**. Confirma a Correção 3 do plano.
- **Casa Flow tem 0 instâncias Solo** (`wpp_instances`). Hoje é 100% GPT Maker.
- `conversations.gpt_maker_chat_id` é populado **pelo webhook**, não pelo start-conversation.
- Esses ids são **contexto de leitura**. **Não entram no código.**
- **Pendência (não bloqueia escrever código):** o *tipo* do canal da Casa Flow (não oficial vs Cloud API) vive na API do provider. Decide se a Fase 0 resolve a Casa Flow ou se ela precisa de linha Solo.

## Sua tarefa — três partes

### Parte 1 — Terminar a implementação

Execute os passos **2b, 3 a 12 e 8b** (na ordem da seção 6 do plano, com os adendos), um commit por passo, mensagem `feat(rev): …` / `fix(rev): …`.

- **Passo 2b** — envio manual para lead **sem conversa ativa** (decisão D7). Detalhe completo no `prompt-execucao-cont.md`, ADENDO 2. Resumo: `send-chat-message` só envia pelo GPT Maker quando já existe `gpt_maker_chat_id`; sem ele, cai em `no_route | no_delivery_route`. A correção é usar `start-conversation` (`{phone, message}`) quando não há chat. **Aditivo**: quem já tem `chat_id` continua idêntico.
- **Passos 3–12** — o motor (migration, adaptadores GPT Maker/Solo, worker, API, freios, cancelamentos, documentação).
- **Passo 8b** — tela mínima de configuração (decisão D6): ligar/desligar sequência, escolher porta, canal/provider, editar mensagens. Consome só a API `outreach` do passo 8. Sem lógica de disparo na tela.

### Parte 2 — Review adversarial da abordagem

Antes de fechar, faça um **review adversarial honesto** da abordagem que está sendo implementada. Não é para concordar — é para tentar derrubá-la:

- A arquitetura do plano (fila no Postgres + gatilhos SQL + adaptadores de provider + motor de cadência) é de fato a **melhor** abordagem para o que o dono quer? Ou existe um caminho mais simples/robusto que ele não considerou?
- Onde o plano **superdimensionou** (complexidade sem retorno) e onde **subdimensionou** (risco não tratado)?
- Quais decisões do plano você **refutaria** com argumento técnico? Aponte-as explicitamente, com evidência do código.
- As 7 decisões do dono (`decisions.md`) estão **todas** refletidas no que foi implementado? Alguma foi contrariada?
- Riscos de produção que ninguém mencionou: banimento de número, duplicação de mensagem, opt-out, ordem de deploy, rollback.

Escreva o resultado em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/codex/revisao-adversarial.md`, terminando em **APPROVED** ou **CHANGES_REQUESTED**, com a lista do que você mudaria. Se você encontrar algo que **contradiz** o plano e for grave, **pare e reporte** em vez de improvisar.

### Parte 3 — Deixar pronto para deploy

O dono autorizou ir **até o deploy**. Prepare, mas **não execute** o deploy:

- Descreva em `implementacao.md` o **plano de deploy completo**: ordem dos merges (a SE-REV-002 está **empilhada** na SE-REV-001 / PR #44, que precisa mergear antes), quais edge functions precisam de `supabase functions deploy`, qual migration aplicar, e o **smoke test** de verificação em produção.
- Liste **tudo** que bloqueia o deploy e o que só pode ser confirmado em produção (ex.: o tipo do canal da Casa Flow).
- Deixe os comandos exatos prontos para execução, **sem valores de segredo**.

## Regras que não se negociam

- **NÃO altere nenhum workflow do n8n.** Nem em produção, nem em arquivo. O n8n é contexto: o dono o construiu como produto que vende, e ele **permanece** como caminho padronizado de envio/recebimento por enquanto (D1, D2). Se o `integracao-n8n.md` citar a recomendação de mexer no Schedule Trigger, marque como **"não aplicar nesta entrega"**.
- **Não faça push, não faça deploy, não aplique migration em produção, não rode `scripts/sqltest.sh`** (aponta para produção). A entrega é código + commits locais + o plano de deploy. **O orquestrador faz push/PR/deploy.**
- **Não quebre** `crm-webhook`, `gpt-maker-webhook`, `send-chat-message`, `cadence-check`, `solo-wpp-webhook`. O `cadence-check` **não é tocado nem usado**.
- **Multi-tenant**: nada hardcoded de Casa Flow.
- **Sem segredos no código.**
- **Idempotência no banco**, não em TypeScript (§3.5 do plano).
- **Os 25 testes da SE-REV-001 continuam passando sem edição.**
- **Validação honesta**: resultado real. Runner que não rodar → `NÃO EXECUTADO`. Nunca invente. Baseline pré-existente: `cadence-check/index.ts` TS2352, `useOnboarding.ts:192`, `Chat.tsx:378` (não toque nesses).

## Idioma

TUDO em português do Brasil. Nunca espanhol.

## Entrega

- Passos commitados localmente, um commit por passo.
- `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/claude/implementacao.md` — o que foi feito, decisões, validações com resultado real, baseline não mascarado, `NÃO EXECUTADO` explícito, **plano de deploy**.
- `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/claude/integracao-n8n.md` — contrato do `outreach`, exemplo de sequência da Casa Flow (como configuração, **sem dados dela no código**), plano de deploy e smoke.
- `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/codex/revisao-adversarial.md` — a Parte 2.
- Não commite `.claude/settings.local.json` nem `*.tsbuildinfo`.

Ao final, resuma: o que ficou pronto, o que ficou pendente, o veredito do review adversarial, e os bloqueios de deploy.
