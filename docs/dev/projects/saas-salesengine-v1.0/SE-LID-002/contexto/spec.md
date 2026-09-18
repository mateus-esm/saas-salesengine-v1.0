# SE-LID-002 — Task Contract

Projeto | Tarefa | Agent
saas-salesengine-v1.0 | SE-LID-002 | verboo

Project: saas-salesengine-v1.0
Agent: verboo
Branch: fix/desconhecido-outbound-leads
Risk: bug fix em webhook (sem migração destrutiva)

## Outcome

Corrigir o bug em que **mensagens iniciadas pelo próprio usuário** (agente equipe Casa Flow) geram leads com nome **"Desconhecido"** no salesengine.

Relato do usuário (2026-09-18): "continua o mesmo erro de desconhecido lead na equipe do Casa Flow. O que eu analisei: são mensagens que foram iniciadas pelo próprio usuário, e essas mensagens ficam como desconhecido."

Ou seja: o bug anterior (SE-LID-001, PR #29) tratou o `@lid` técnico; **este é outro caso** — a mensagem é OUTBOUND (iniciada pela equipe/agente) e ainda assim cria/atualiza um lead "Desconhecido".

## Hipótese de causa raiz (a confirmar e provar com evidência)

Em `supabase/functions/gpt-maker-webhook/index.ts`:
- L54: `const senderName = isTechnicalSenderId ? '' : (rawSenderName || 'Desconhecido')`
- L124-126: `senderType = 'agent'` quando `role === 'assistant' || fromMe === true`
- **L9 (criação de lead) NÃO é bloqueada por `senderType === 'agent'`** — só a criação de Opportunity (L410) exige `senderType === 'customer'`.
- Logo: uma mensagem outbound (agente/equipe iniciando a conversa) **cria o lead** com `finalName = senderName || ...` onde `senderName` caiu para `'Desconhecido'` (vazio/ausente), porque o caminho de agente não tem pushName.

Em `supabase/functions/solo-wpp-webhook/index.ts`:
- L365: `senderType = key.fromMe ? 'agent' : 'customer'`
- A criação de lead (L399+) **também não é condicionada** a `senderType === 'customer'`.

Pergunta central: a mensagem outbound deve CRIAR lead? Se a equipe inicia a conversa, o contato ainda é um lead legítimo (a pessoa existe), mas o nome não pode ser "Desconhecido" — precisa de fallback coerente (telefone formatado) ou de resolução do nome real.

## Entregáveis
1. `docs/dev/projects/saas-salesengine-v1.0/SE-LID-002/verboo/diagnostico.md` — causa raiz com `arquivo:linha`, distinguindo deste bug e do SE-LID-001.
2. `docs/dev/projects/saas-salesengine-v1.0/SE-LID-002/verboo/fix.md` — fix, por quê, validação, riscos/rollback.
3. `docs/dev/projects/saas-salesengine-v1.0/SE-LID-002/README.md` — header Projeto | Tarefa | Origem | Agentes | Status | Artefatos | Pendências.

## Perguntas a responder
1. Qual webhook cria o lead quando a mensagem é outbound (Casa Flow)? Provar com `arquivo:linha`.
2. Por que o nome resolve para "Desconhecido" nesse caminho? O `senderName` vazio cai em `'Desconhecido'` em vez do fallback por telefone (`Lead <phone>`) ou de `formatDisplayName`.
3. O SE-LID-001 (máscara de `@lid` + `resolveLeadIdentity`) cobriu esse caminho? Se não, por quê (o gate `senderType === 'customer'` não existe na criação de lead)?
4. Qual o comportamento correto: (a) não criar lead a partir de mensagem outbound quando não há contato identificado; (b) criar, mas com nome derivado do telefone; (c) criar e resolver o nome real depois? Justificar com o domínio (a equipe iniciando a conversa com um número novo é caso legítimo?).
5. O mesmo defeito existe no `solo-wpp-webhook`? Provar.
6. Fix proposto + testes. Validar sem produção.

## Contexto (evidência levantada 2026-09-18)
- Bug anterior: SE-LID-001 (PR #29, merge f2bd042) tratou `@lid` técnico como nome/telefone. Este relato é o MESMO sintoma ("Desconhecido"/técnico) mas outra causa.
- `displayName.ts` (novo no SE-LID-001) tem `formatDisplayName(name, phone, fallback='[WhatsApp - Lead Anônimo]')` — verificar se o caminho do agente o usa.
- `lead-identity.ts` (novo no SE-LID-001) tem `resolveLeadIdentity()` — verificar se o caminho outbound o usa.

## Constraints
- NÃO citar credenciais reais — referir como "env vars"/"secrets".
- NÃO rodar migração destrutiva, NÃO escrever em produção, NÃO tocar em `main` direto.
- NÃO inventar payload nem arquitetura fora do código. Marcar hipótese quando sem evidência.
- PT-BR obrigatório. Verificar: `grep -lE 'Archivo|Fuente|decisión|teléfono|Migración'` deve voltar vazio.
- Escrever docs APENAS em `docs/dev/projects/saas-salesengine-v1.0/SE-LID-002/verboo/` + `README.md`.
- Não fazer commit/push/PR — isso é do orquestrador.

## Acceptance
- [ ] Causa raiz provada com `arquivo:linha`, explicitando a diferença vs SE-LID-001.
- [ ] Fix implementado + testes (registrar baseline sem mascarar).
- [ ] Comportamento para mensagem outbound definido e justificado.
- [ ] `git status` mostra apenas arquivos do fix + docs da task.
- [ ] README.md com header completo.
- [ ] PT-BR confirmado; zero credenciais reais.

## Do not touch
- Secrets, `main`/`master` direto, migrations destrutivas, assets compartilhados, pastas de clientes.
