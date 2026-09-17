# SE-LID-001 — Task Contract

Projeto | Tarefa | Agent
saas-salesengine-v1.0 | SE-LID-001 | verboo

Project: saas-salesengine-v1.0
Agent: verboo
Branch: fix/casaflow-lid-leads
Risk: bug fix em webhook + notificacao (sem migração destrutiva)

## Outcome

Investigar e corrigir por que leads da equipe Casa Flow no salesengine estão sendo salvos/enviados como IDs técnicos `@lid` (ex.: Nome: `Lead 186432031355045@lid`, Telefone: `186432031355045@lid`) na notificação automática "Solo Ventures | Casa Flow — Você tem um novo lead no CRM!".

Entregáveis:
1. Diagnóstico com evidência (arquivo + trecho): onde o `@lid` entra (qual webhook/payload), onde é persistido (leads.name/phone/phone_normalized), e onde vaza para a notificação.
2. Fix implementado no repo (código + testes onde aplicável): normalizar/resolver `@lid` para telefone real ou mascarar com `formatDisplayName`, sem criar duplicados.
3. Validação: lint/typecheck/test/build conforme o repo + evidência de que a notificação passa a exibir nome/telefone correto ou fallback `[WhatsApp - Lead Anônimo]`/telefone formatado.

## Contexto (evidência real levantada 2026-09-17)

Notificação recebida 17/09/2026 09:53:
- Nome: `Lead 186432031355045@lid`, Telefone: `186432031355045@lid`, Observações vazia, link CRM com pipeline `004130b6-7b6a-4676-8b44-8a9543fe0078` (Casa Flow).

Código relevante (somente leitura inicial, confirmar no worktree):
- `src/lib/displayName.ts`: `isTechnicalId()` detecta `@lid/@s.whatsapp.net/@c.us/@g.us/@broadcast` + numéricos 8+ dígitos; `formatDisplayName(name, phone)` prefere nome real, senão telefone formatado, senão `[WhatsApp - Lead Anônimo]`.
- `supabase/functions/gpt-maker-webhook/index.ts` (681 linhas): importa `normalizePhone` de `_shared/phone.ts`; linhas ~34-56 descartam `contactName` técnico `@lid` como "no name" mas o lead pode ser criado com `phone: senderPhone` cru; lookup por `phone_normalized`, insert com `phone_normalized: phoneNorm`, dedup via UNIQUE (equipe_id, phone_normalized) + fallback 23505.
- `supabase/functions/_shared/phone.ts`: `normalizePhone()` Brazil-centric (strip non-digits, 55, mobile-9). NÃO trata `@lid` — `186432031355045@lid` vira dígitos `186432031355045` (15 dígitos) e retorna como está, sem virar telefone válido.
- `supabase/functions/solo-wpp-webhook/index.ts` (757 linhas): `extractPhoneFromJid` + `normalizePhone`; cria lead como `Lead ${phone}` ou `Novo Visitante`.
- `supabase/functions/crm-webhook/index.ts`: dedup por `phone` cru (linha ~400-410), sem `phone_normalized`.
- Template da notificação "novo lead no CRM" NÃO localizado em `admin-notifications` nem `notification-dispatcher` (grep não achou) — descobrir quem monta e envia (pode ser outro edge function, cron, ou serviço externo). Verificar `reports-cron`, triggers, ou backend Casa Flow.

## Perguntas a responder (com evidência)
1. Qual webhook recebe o lead Casa Flow (gpt-maker-webhook? solo-wpp? crm-webhook? outro)? Qual campo do payload traz o `@lid` (contactPhone/phone/from? contactName/pushName?)?
2. O que é persistido em `leads` (name, phone, phone_normalized, gpt_maker_chat_id) quando entra `@lid`? O `phone_normalized` fica com dígitos inválidos?
3. Quem monta a notificação "Solo Ventures | Casa Flow" e de quais colunas lê Nome/Telefone? Por que não usa `formatDisplayName`?
4. Fix proposto: onde normalizar (extrair telefone real do JID/LID via lookup ou API? descartar e pedir nome? mascarar na leitura e na escrita?), sem quebrar dedup UNIQUE nem criar duplicados.
5. Como validar sem produção: testes unitários de `normalizePhone`/`isTechnicalId`/`formatDisplayName` + teste do webhook com payload `@lid` + evidência de notificação correta.

## Constraints
- NÃO citar credenciais reais — referir como "env vars"/"secrets".
- NÃO rodar migração destrutiva, NÃO escrever em banco de produção, NÃO tocar em `main` direto.
- NÃO inventar payload, preço, nem arquitetura fora do código. Marcar hipótese quando sem evidência.
- PT-BR obrigatório nos artefatos (nunca espanhol). Verificar: `grep -lE 'Archivo|Fuente|decisión|teléfono|Migración' <artefatos>` deve voltar vazio.
- Escrever artefatos em `docs/dev/projects/saas-salesengine-v1.0/SE-LID-001/verboo/` + `README.md`. Código do fix nos paths corretos do repo + testes.
- Não fazer commit/push/PR — isso é do orquestrador.

## Acceptance
- [ ] Diagnóstico com arquivo+trecho para cada ponto do fluxo (entrada → persistência → notificação).
- [ ] Fix implementado + testes passam (ou baseline de falhas registrado sem mascarar).
- [ ] `git status` mostra apenas arquivos do fix + docs da task.
- [ ] README.md com header Projeto | Tarefa | Agentes | Status | Artefatos | Pendências.
- [ ] Idioma PT-BR confirmado; zero credenciais reais citadas.

## Do not touch
- Secrets, `main`/`master` direto, migrations destrutivas, assets compartilhados, pastas de clientes.
