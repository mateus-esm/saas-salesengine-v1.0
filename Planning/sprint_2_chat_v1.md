# 🚀 SPRINT 2 — CHAT V2: RELATIONAL INBOX

## Visão Arquitetural (MANDATÓRIO LER ANTES DE CODAR)

Este sprint introduz a **camada intermediária "Conversations"** (a.k.a. Sessions)
entre `leads` e `messages`. O objetivo: um mesmo `lead` pode ter múltiplas
conversas distintas, com ciclo de vida próprio (Active / Archived / Deleted),
sem nunca perder os dados do CRM.

O Frontend continua agnóstico: fala exclusivamente com Supabase. O provedor
atual (GPT Maker) apenas injeta mensagens nas novas conversas via webhook.

---

## EPIC 1 — Relational Inbox Architecture (Conversations vs. Leads)

### Goal
Decouple leads from their messages by introducing a middle layer:
**"Conversations"** (or "Sessions").

### Expected Behavior
- A single **Lead** can have multiple distinct **Conversations**.
- The UI lists conversations in the Inbox sidebar (**semantic shift** — not a
  new route/tab; the existing Precision OS layout stays).
- Users can change a conversation's status to **Active / Archived / Deleted**
  without losing the underlying Lead data in the CRM.
- Advanced filtering in the sidebar:
  - **Channel** (WhatsApp, Instagram, Telegram, Web, Messenger)
  - **Responsible** (All Chats, My Chats, AI Managed, Unassigned, or a specific
    team member name)
- Each chat row shows the **channel name** and the **responsible name**
  inline (in addition to the existing channel icon badge on the avatar).

### Product Decisions (approved)
1. **Auto-reopen** on inbound: when an archived conversation receives a new
   inbound message, it is automatically reopened (`status='active'`).
2. **Deleted hidden by default**: "deleted" conversations are hidden from the
   default list (admin toggle later).

### Branch
`feat/claude-epic1-conversations`

### Sub-tasks
- [x] **1.1** Write Epic 1 scope into sprint doc (this file)
- [x] **1.2** Migration: `conversations` table + `messages.conversation_id` +
      RLS + backfill
- [x] **1.3** `useConversations` hook (retire dormant `useChatSessions`)
- [x] **1.4** `useMessages` accepts `conversationId`
- [x] **1.5** `ChatListItem` — channel name + responsible name chips
- [x] **1.6** `InboxSidebar` — Status segmented + Channel dropdown +
      Responsible dropdown (with team members)
- [x] **1.7** Row kebab menu: Archive / Reopen / Delete
- [x] **1.8** `ConversationHeader` status actions
- [x] **1.9** `Chat.tsx` keyed by `conversationId`
- [x] **1.10** Edge Functions: `conversation_id` + auto-reopen on inbound
      (`gpt-maker-webhook`, `send-chat-message`, `sync-chat-history`)
- [x] **1.11** Smoke test — `npm run build` ✅ / `tsc --noEmit` clean for Epic 1
      files (pre-existing unrelated errors in IntentionWizard, TenantContext,
      Admin remain untouched). Browser smoke test pending DB migration
      apply (`supabase db push`) + types regen.

### Files Touched
**DB**
- `supabase/migrations/20260417000000_epic1_conversations.sql` (new)

**Frontend — Hooks & Types**
- `src/types/chat.ts`
- `src/hooks/useConversations.ts` (replaces dormant `useChatSessions.ts`)
- `src/hooks/useMessages.ts`

**Frontend — UI**
- `src/components/inbox/InboxSidebar.tsx`
- `src/components/inbox/ChatListItem.tsx`
- `src/components/inbox/ConversationHeader.tsx`
- `src/pages/Chat.tsx`

**Edge Functions**
- `supabase/functions/gpt-maker-webhook/index.ts`
- `supabase/functions/send-chat-message/index.ts`
- `supabase/functions/sync-chat-history/index.ts`

### Out of Scope (pushed to later epics)
- Dedicated `/conversations` route
- Media upload UI / voice recording UI
- Quick Actions header
- Removing legacy `leads.channel` / `leads.gpt_maker_chat_id` columns
  (kept for dual-read during transition)

### Risks & Rollback
- Large `messages` backfill → staged in a single SQL `UPDATE`; can be batched
  if table size warrants.
- Realtime subscription reshaped around `messages.conversation_id` — must not
  regress Sprint 1 anti-dup invariant.
- Rollback: migration is additive — `DROP TABLE conversations;
  ALTER TABLE messages DROP COLUMN conversation_id;` restores prior state.

---

## 📦 HANDOFF — Epic 1 COMPLETE

- **Agent:** Claude (Opus 4.7)
- **Branch:** `feat/claude-epic1-conversations`
- **Last commit:** `9c259fa feat(chat): Epic 1 — Relational Inbox Architecture`
- **Files changed:** 13 (+1196 / −457)
- **Date:** 2026-04-17
- **Status:** ✅ Ready for Orchestrator to merge into `main`

### ✅ Results (what landed)

**DB layer**
- New migration `supabase/migrations/20260417000000_epic1_conversations.sql`:
  - `conversations` table (id, lead_id, equipe_id, channel, status, responsible_id, atendido_por_agente, agent_name, gpt_maker_chat_id, last_message_at, unread_count, archived_at, deleted_at, timestamps)
  - `messages.conversation_id` FK (additive — legacy `lead_id` preserved)
  - Indexes on `lead_id`, `(equipe_id, status, last_message_at)`, `channel`, `responsible_id`, `gpt_maker_chat_id`, `messages.conversation_id`
  - Backfill: 1 conversation per existing lead; `messages.conversation_id` filled via `lead_id` join
  - RLS aligned with `equipe_id` scoping (mirrors `leads` pattern)
  - `increment_conversation_unread_count(uuid)` RPC
  - Added to `supabase_realtime` publication

**Hooks**
- `src/hooks/useConversations.ts` (new) — TanStack Query + realtime subscription on conversations + messages + leads; mutations: `updateStatus`, `assignResponsible`, `toggleHandoff`. Query joins lead slice for sidebar display.
- `src/hooks/useMessages.ts` — keyed by `conversationId`; marks conversation read (`unread_count = 0`); calls `sync-chat-history` with `{ conversation_id, chat_id }`.
- `src/hooks/useChatSessions.ts` deleted (was dormant; zero call sites).

**UI**
- `InboxSidebar` — three filter rows: search + unread toggle, Status segmented (Ativas/Arquivadas), Channel + Responsible dropdowns. Responsible dropdown includes All / My Chats / AI Managed / Unassigned + every team member by name. Hidden-by-default filter excludes `deleted`.
- `ChatListItem` — channel name + responsible name inline chip under customer name; kebab menu with Archive / Reopen / Delete based on current status; Archived badge in status row.
- `ConversationHeader` — matching status dropdown next to Handoff toggle.
- `Chat.tsx` — rebuilt around `selectedConversationId`; adapter maps `Conversation[]` → `ExtendedChatSession[]`; handlers route to the conversation row (not the lead).

**Edge Functions**
- `gpt-maker-webhook` — on inbound: resolves or creates conversation; auto-reopens archived (approved product rule); dual-writes `increment_conversation_unread_count` + legacy `increment_unread_count`.
- `send-chat-message` — accepts `conversation_id`; resolves lead ↔ conversation ↔ chat_id; inserts messages with `conversation_id`; bumps `conversations.last_message_at`.
- `sync-chat-history` — accepts `conversation_id`; upserts messages with `conversation_id`; enriches both `leads` (legacy) and `conversations` rows with `channel` / `agent_name` from GPT Maker metadata.

**Verification**
- `npm run build` → ✅ passes (19.59s, 3505 modules transformed).
- `npx tsc --noEmit -p tsconfig.app.json` → ✅ clean on all Epic 1 files. The 3 remaining errors (IntentionWizard `Loader2`, TenantContext `.finally`, Admin `Niche` cast) are pre-existing and out of scope.
- `git status` → only pre-existing regeneration artifacts (`src/integrations/supabase/types.ts`, `supabase/migrations/20260318072102_remote_schema.sql`) left unstaged; these predated Epic 1.

### 💡 Insights

1. **Dual-read is load-bearing.** Keeping the legacy `leads.channel`, `leads.gpt_maker_chat_id`, `leads.responsible_id` etc. means *zero* flip-day risk: the old webhook / sync / chat code keeps working during rollout, and we can regenerate types without a scramble.
2. **Conversations should own the unread counter, not leads.** Once archived conversations are excluded from the active list, per-lead unread stops making sense — a lead with one active + one archived conv needs separate counts. Dual-write during transition, single-write after.
3. **Auto-reopen on inbound is the only sane default.** Any other rule (manual reopen, spawn-new-conv-per-archive) fractures history and forces the agent to click before reading the customer's reply. Chose this before writing the webhook, confirmed correct in design review.
4. **`selectedConversationId` replaces `selectedLeadId` at the top of `Chat.tsx`, not alongside it.** A second selection dimension would have exploded the state machine; we resolve `lead` from the conversation instead.
5. **The "dormant `useChatSessions`" discovery was a gift.** Grep turned up zero call sites — deleting it rather than diverging meant no backwards-compat shim and no dead code to maintain.
6. **Sidebar filtering as sentinel strings (`__all__`, `__mine__`, `__ai__`, `__unassigned__`) beats null/undefined.** Radix Select can't model null cleanly; sentinels make the filter logic a flat switch instead of nested ternaries.

### ⚖️ Tradeoffs

| Decision | Picked | Alternative | Why |
|---|---|---|---|
| UI shape | Keep Precision OS sidebar; no new `/conversations` route | Dedicated Conversations tab | User scope call. "v2 = overengineering now." Filters + row metadata deliver the value inside the existing layout. |
| Migration shape | Additive (keep legacy columns) | Hard cutover (drop `leads.channel` etc.) | Rollback is one SQL statement. Edge functions can ship incrementally. Cost: short-term schema duplication. |
| Types drift | Localized `const sb = supabase as any;` in 3 files | Hand-edit auto-gen `types.ts` | `types.ts` is UTF-16 auto-generated — any manual edit is overwritten on the next `supabase gen types`. Casts are greppable and disappear on regen. |
| Realtime scope | Subscribe to conversations + messages + leads | Only conversations | Sidebar needs to react to both new inbound (messages) and CRM edits (leads). Three channels, one invalidation. |
| Unread count | Dual-write (conversation + lead) during transition | Single-write to conversation | Old inbox components still read `leads.unread_count`; removing that dual-write is Epic 2. |
| Delete semantics | Soft-delete (`status='deleted'`, hide by default) | Hard delete | Lead + messages survive for the CRM — matches user's explicit requirement. Admin toggle to surface deleted is a later epic. |
| Filter sentinels | String sentinels | Nullable value with discriminator | Radix `<Select>` can't hold null; sentinels keep the component simple. |

### ⚠️ Pending — Orchestrator / Operator Actions Before Merge

1. **Apply the migration to the remote DB:** `supabase db push`
   Creates the `conversations` table, backfills one conversation per lead, and adds `conversations` to the realtime publication. Additive — safe to run, rollback is a one-liner.
2. **Regenerate Supabase types:** `supabase gen types typescript --linked > src/integrations/supabase/types.ts`
   Once done, the three `const sb = supabase as any;` casts can be removed (`src/hooks/useConversations.ts`, `src/hooks/useMessages.ts`, `src/pages/Chat.tsx`).
3. **Browser smoke test matrix:**
   - Existing lead shows a conversation in the sidebar with channel + responsible name inline.
   - Archive a conversation → moves to "Arquivadas"; inbound message from GPT Maker auto-reopens it.
   - Delete a conversation → disappears from default list; the Lead still appears in the CRM with history intact.
   - Channel filter narrows; Responsible filter (All / My / AI / Unassigned / named member) narrows.
   - Send message from chat → `conversations.last_message_at` bumps, optimistic UI works, no duplicate on realtime echo.
   - Handoff toggle flips `conversations.atendido_por_agente` and calls GPT Maker start/stop-human.
4. **Merge `feat/claude-epic1-conversations` → `main`** and signal agents to `git pull`.

### ❌ Explicitly Out of Scope (Next Epics)

- Dedicated `/conversations` route / page
- Media upload UI / voice-note recording UI
- Quick Actions header
- Removing legacy `leads.channel` / `leads.gpt_maker_chat_id` / `leads.unread_count` columns
- Admin toggle to surface deleted conversations
- Per-conversation pipeline stage (currently CRM fields hang off the Lead)

---
