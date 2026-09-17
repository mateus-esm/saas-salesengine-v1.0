# SE-LID-001 — Leads da Casa Flow salvos como ID técnico `@lid`

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-LID-001 |
| Origem | Notificação "Solo Ventures \| Casa Flow — Você tem um novo lead no CRM!" recebida em 2026-09-17 09:53, com Nome e Telefone = `186432031355045@lid` |
| Agentes | verboo (diagnóstico + fix, branch `fix/casaflow-lid-leads`) |
| Status | ✅ Fix implementado e documentos de diagnóstico/fix entregues · ⚠️ validação (`lint`/`typecheck`/`test`/`build`) **não executada** neste sandbox (permissão bloqueada) |
| Artefatos | `contexto/spec.md` (contrato) · `verboo/diagnostico.md` · `verboo/fix.md` · este README |

## O que foi encontrado

O `@lid` entrou pelo `supabase/functions/gpt-maker-webhook` (campo `contactPhone`), foi gravado cru
em `leads.phone` e o trigger `trg_leads_sync_phone_normalized` derivou `phone_normalized` do mesmo
valor — o id técnico virou **identidade e rótulo** da linha. A notificação não é montada por este
repo: ela é o consumidor externo do webhook de saída (`contact_created` / `lead_created`), cujo
`payload_template` padrão renderiza `{{lead.name}}` e `{{lead.phone}}` direto da coluna. Detalhes e
trechos em `verboo/diagnostico.md`.

## O que foi corrigido

O payload do incidente chegou com o **LID nos dois campos** (nome e telefone) — ver a dedução em
`verboo/diagnostico.md` §1.

| Situação (`contactName` / `contactPhone`) | Antes | Depois |
|---|---|---|
| LID / LID — **o incidente** | `name = "Lead 186432031355045@lid"`, `phone = "186432031355045@lid"` | `name = "[WhatsApp - Lead Anônimo]"`, `phone = NULL` |
| vazio / LID | `name = "Desconhecido"`, `phone = LID` | `name = "[WhatsApp - Lead Anônimo]"`, `phone = NULL` (**única mudança de rótulo além do incidente**) |
| nome real / LID | `phone = LID` | `name` preservado, `phone = NULL` |
| qualquer / `"5511987654321@s.whatsapp.net"` | `phone` cru com envelope JID | `phone = "5511987654321"` (número extraído) |
| nome técnico / telefone real | `Lead 5585996487923` | **inalterado** |
| nome técnico / telefone vazio | `Novo Visitante` | **inalterado** |
| vazio / telefone real (ex.: `5585996487923`) | `Desconhecido` | **inalterado** |
| vazio / vazio | `Desconhecido` | **inalterado** |
| Linha antiga com `@lid` | achada pelo `phone_normalized` legado e reusada | **inalterado** (sem duplicata; ver Pendência 3 para a limpeza) |
| Coluna `phone` na tela (linha com LID) | `+186432031355045` | vazio (`src/lib/fields/registry.ts:265-266`) |

Código: `_shared/lead-identity.ts` (novo), `_shared/displayName.ts` (novo), `_shared/phone.ts`,
`gpt-maker-webhook/index.ts`, `solo-wpp-webhook/index.ts`, `src/lib/displayName.ts`,
`src/lib/fields/registry.ts`.
Testes: `_shared/lead-identity.test.ts` (novo, 13), `_shared/phone.test.ts` (+6),
`src/lib/__tests__/displayName.test.ts` (novo, 11). Detalhes em `verboo/fix.md`.

## Pendências

1. **Rodar a validação antes do merge** — `npm ci`, `npm run lint`, `npm run typecheck`,
   `npm run test`, `npm run build` e
   `deno test supabase/functions/_shared/phone.test.ts supabase/functions/_shared/lead-identity.test.ts`
   foram bloqueados por permissão neste sandbox; não há baseline de falhas porque não houve
   execução (ver `verboo/fix.md`, seção 3.4). O handler do `gpt-maker-webhook` (lookups + insert +
   passo 9.1) não tem teste automatizado — não há harness de Supabase mockado no repo; por isso a
   decisão de identidade foi isolada em `_shared/lead-identity.ts`, que é testado.
2. **Migration de endurecimento (não criada)** — a dedup do lead de LID volta a usar
   `phone_normalized` (chave reatada após o insert), mas o `UNIQUE` não protege o INSERT em si: duas
   **primeiras** mensagens simultâneas da mesma conversa podem duplicar. Índice único parcial em
   `(equipe_id, gpt_maker_chat_id) WHERE gpt_maker_chat_id IS NOT NULL AND deleted_at IS NULL`
   fecha a janela. Exige migration e aprovação.
3. **Remediação dos leads históricos** — o fix vale para leads novos; as linhas já criadas com LID
   continuam com o id técnico no banco. SQL de dry-run (reconhecer, limpar e reatar a chave)
   proposto em `verboo/fix.md`, seção 4.3 — não executado, exige aprovação.
4. **Caminhos não alterados** — `crm-webhook` (dedup por telefone; sem evidência de LID) e os pontos
   de UI que geram **link** do telefone:
   `src/components/crm/OpportunityDetailModal.tsx:597`,
   `src/components/crm/OpportunityCard.tsx:303` (link `wa.me` aponta para número inexistente) e
   `:307` (tooltip), `src/components/crm/DatabaseView.tsx:205`. A coluna `phone` do motor de campos
   (`src/lib/fields/registry.ts`) foi corrigida nesta task.
5. **`solo-wpp` mantém o LID como chave de dedup** em `leads.phone` (zerá-lo criaria um lead por
   mensagem, pois não há `chatId` de fallback). Se aquele caminho passar a alimentar notificação,
   reavaliar junto com a Pendência 2.
6. **`phone_normalized` de leads de LID contém o id técnico** (deliberado, para não perder dedup).
   Efeito colateral: a busca por dígitos (`20260911000100_sprint11_w2_filters.sql:260`) pode casar
   esses leads — comportamento que as linhas legadas já tinham.
7. **Arquivo fora do escopo já modificado no worktree** — `.claude/settings.local.json` estava
   alterado antes desta task (adiciona `Bash(*)`, sem newline final). Não é do fix e não foi
   tocado; vale revisar esse grant antes do merge.

## Fora de escopo / regras respeitadas

Sem commit, sem push, sem PR. Nenhuma migration executada, nenhuma escrita em banco de produção,
nenhuma credencial real citada (apenas "env vars"/"secrets").
