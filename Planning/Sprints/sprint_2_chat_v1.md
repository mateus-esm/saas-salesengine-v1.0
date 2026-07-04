🚀 SPRINT 2 PLANNING: OMNICHANNEL INBOX & PRECISION OS UI Target Product: Chat
v1 (Omnichannel CRM Module) Execution Agent: Antigravity (Software Engineer
role)

🧠 1. Product Vision & Context We are elevating the Chat module from a basic
flat messaging screen into an Enterprise-grade Omnichannel Inbox. This system
will serve as the central command hub for sales and support teams. It must
manage multiple concurrent sessions for a single lead across different channels
(WhatsApp, Instagram, Web), clearly delineate AI vs. Human responsibilities, and
retain user focus through a "Precision OS Dark" design aesthetic—elegant,
low-saturation, and high-contrast, similar to elite tools like Linear or
Superhuman.

⚠️ 2. User Pain Points (The Problems We Are Solving) Before writing any code,
understand the current friction points:

Architectural Bottleneck: Currently, messages are tied directly to a Lead. This
flat structure prevents us from having separate "Conversations" (e.g., a support
ticket vs. a new sales inquiry) with the same lead. It also makes it impossible
to archive or delete a specific chat session without deleting the entire lead.

Broken Brand Immersion: The system uses hardcoded, generic labels like
"Assistente AI" or "Bot". This breaks the premium, white-label experience we
want to provide. The client should feel they are talking to a specialized agent.

Operational Risk (The 24h Rule): Sales reps have no clear visibility into Meta's
24-hour customer service window. They risk attempting to send free-form messages
to clients whose windows have closed, resulting in silent failures.

Visual Friction: The current UI relies on heavily saturated colors (like
standard WhatsApp green) and flat backgrounds. It lacks the sophisticated,
high-ticket visual hierarchy required for our brand identity.

🎯 3. Sprint Epics & Execution Phases Agent Instructions: Execute the following
epics sequentially. Focus on achieving the described product behavior and user
experience. You have the autonomy to decide the best technical implementation
(Supabase schemas, React hooks, component refactoring) to fulfill these
requirements.

EPIC 1: Relational Inbox Architecture (Conversations vs. Leads) The Goal:
Decouple leads from their messages by introducing a middle layer:
"Conversations" (or "Sessions").

Expected Behavior: * A single Lead can have multiple distinct Conversations.

The UI must support a dedicated "Conversations" tab/list.

Users must be able to change the status of a Conversation (e.g., Active,
Archived, Deleted) to keep their inbox clean, without losing the underlying Lead
data in the CRM.

Implement advanced filtering in the sidebar: Filter by "Channel" (WhatsApp, IG,
Web) and "Responsible" (My Chats, All Chats, AI Managed).

EPIC 2: Dynamic AI Branding & White-Labeling The Goal: Humanize the AI and
enforce brand consistency across the platform.

Expected Behavior:

Completely eradicate hardcoded labels like "Assistente AI" or "Bot" from the
frontend.

Whenever a message is sent by the AI (role === 'assistant'), the UI must
dynamically display the actual agentName configured in the AI Studio or payload.

Implement a sleek fallback name (e.g., "Solo Brain" or "System") only if the
dynamic name is entirely missing.

EPIC 3: The 24-Hour SLA Indicator (WhatsApp Rule) The Goal: Provide real-time,
visual confirmation of the active messaging window to protect sales reps from
failed sends.

Expected Behavior:

Calculate the time elapsed since the last message sent by the customer.

If the elapsed time is <= 24 hours: Display a dynamic "Online" badge in the top
right corner of the chat header (e.g., a subtle emerald green dot, perhaps with
a soft ping animation).

If the elapsed time is > 24 hours (or no customer message exists): Display an
"Offline" or "Window Closed" badge (e.g., a sober slate/gray color, no
animation).

EPIC 4: "Precision OS" Aesthetic Overhaul The Goal: Redesign the chat interface
to feel like a luxury workspace. High tactile contrast, low color saturation.

Expected Behavior:

Backgrounds: Move away from generic dark grays. Use a deep, true black or
ultra-dark zinc (bg-black or bg-zinc-950) for the main app background to
simulate dark glass. The actual chat message area should have a very subtle
contrast (e.g., bg-zinc-900/50) to separate it from the sidebars.

Message Bubbles: Remove vibrant, saturated colors. Outbound messages (Agent/AI)
should use elegant, desaturated tones (e.g., a deep slate blue or low-opacity
brand color) with crisp text-slate-100 typography.

Tactile Borders: Apply extremely thin, barely-there borders (border
border-white/5) to message bubbles and panels to create a sharp, angular, and
highly precise technological feel. Reduce border radii (use rounded-md instead
of full pills) for a sharper look.

# 🚀 SPRINT 2 — CHAT V1: EPIC 1 - RELATIONAL INBOX

## Visão Arquitetural (MANDATÓRIO LER ANTES DE CODAR)

Este sprint introduz a **camada intermediária "Conversations"** (a.k.a.
Sessions) entre `leads` e `messages`. O objetivo: um mesmo `lead` pode ter
múltiplas conversas distintas, com ciclo de vida próprio (Active / Archived /
Deleted), sem nunca perder os dados do CRM.

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
- Each chat row shows the **channel name** and the **responsible name** inline
  (in addition to the existing channel icon badge on the avatar).

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
- [x] **1.6** `InboxSidebar` — Status segmented + Channel dropdown + Responsible
      dropdown (with team members)
- [x] **1.7** Row kebab menu: Archive / Reopen / Delete
- [x] **1.8** `ConversationHeader` status actions
- [x] **1.9** `Chat.tsx` keyed by `conversationId`
- [x] **1.10** Edge Functions: `conversation_id` + auto-reopen on inbound
      (`gpt-maker-webhook`, `send-chat-message`, `sync-chat-history`)
- [x] **1.11** Smoke test — `npm run build` ✅ / `tsc --noEmit` clean for Epic 1
      files (pre-existing unrelated errors in IntentionWizard, TenantContext,
      Admin remain untouched). Browser smoke test pending DB migration apply
      (`supabase db push`) + types regen.

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
- Removing legacy `leads.channel` / `leads.gpt_maker_chat_id` columns (kept for
  dual-read during transition)

### Risks & Rollback

- Large `messages` backfill → staged in a single SQL `UPDATE`; can be batched if
  table size warrants.
- Realtime subscription reshaped around `messages.conversation_id` — must not
  regress Sprint 1 anti-dup invariant.
- Rollback: migration is additive —
  `DROP TABLE conversations;
  ALTER TABLE messages DROP COLUMN conversation_id;`
  restores prior state.

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
  - `conversations` table (id, lead_id, equipe_id, channel, status,
    responsible_id, atendido_por_agente, agent_name, gpt_maker_chat_id,
    last_message_at, unread_count, archived_at, deleted_at, timestamps)
  - `messages.conversation_id` FK (additive — legacy `lead_id` preserved)
  - Indexes on `lead_id`, `(equipe_id, status, last_message_at)`, `channel`,
    `responsible_id`, `gpt_maker_chat_id`, `messages.conversation_id`
  - Backfill: 1 conversation per existing lead; `messages.conversation_id`
    filled via `lead_id` join
  - RLS aligned with `equipe_id` scoping (mirrors `leads` pattern)
  - `increment_conversation_unread_count(uuid)` RPC
  - Added to `supabase_realtime` publication

**Hooks**

- `src/hooks/useConversations.ts` (new) — TanStack Query + realtime subscription
  on conversations + messages + leads; mutations: `updateStatus`,
  `assignResponsible`, `toggleHandoff`. Query joins lead slice for sidebar
  display.
- `src/hooks/useMessages.ts` — keyed by `conversationId`; marks conversation
  read (`unread_count = 0`); calls `sync-chat-history` with
  `{ conversation_id, chat_id }`.
- `src/hooks/useChatSessions.ts` deleted (was dormant; zero call sites).

**UI**

- `InboxSidebar` — three filter rows: search + unread toggle, Status segmented
  (Ativas/Arquivadas), Channel + Responsible dropdowns. Responsible dropdown
  includes All / My Chats / AI Managed / Unassigned + every team member by name.
  Hidden-by-default filter excludes `deleted`.
- `ChatListItem` — channel name + responsible name inline chip under customer
  name; kebab menu with Archive / Reopen / Delete based on current status;
  Archived badge in status row.
- `ConversationHeader` — matching status dropdown next to Handoff toggle.
- `Chat.tsx` — rebuilt around `selectedConversationId`; adapter maps
  `Conversation[]` → `ExtendedChatSession[]`; handlers route to the conversation
  row (not the lead).

**Edge Functions**

- `gpt-maker-webhook` — on inbound: resolves or creates conversation;
  auto-reopens archived (approved product rule); dual-writes
  `increment_conversation_unread_count` + legacy `increment_unread_count`.
- `send-chat-message` — accepts `conversation_id`; resolves lead ↔ conversation
  ↔ chat_id; inserts messages with `conversation_id`; bumps
  `conversations.last_message_at`.
- `sync-chat-history` — accepts `conversation_id`; upserts messages with
  `conversation_id`; enriches both `leads` (legacy) and `conversations` rows
  with `channel` / `agent_name` from GPT Maker metadata.

**Verification**

- `npm run build` → ✅ passes (19.59s, 3505 modules transformed).
- `npx tsc --noEmit -p tsconfig.app.json` → ✅ clean on all Epic 1 files. The 3
  remaining errors (IntentionWizard `Loader2`, TenantContext `.finally`, Admin
  `Niche` cast) are pre-existing and out of scope.
- `git status` → only pre-existing regeneration artifacts
  (`src/integrations/supabase/types.ts`,
  `supabase/migrations/20260318072102_remote_schema.sql`) left unstaged; these
  predated Epic 1.

### 💡 Insights

1. **Dual-read is load-bearing.** Keeping the legacy `leads.channel`,
   `leads.gpt_maker_chat_id`, `leads.responsible_id` etc. means _zero_ flip-day
   risk: the old webhook / sync / chat code keeps working during rollout, and we
   can regenerate types without a scramble.
2. **Conversations should own the unread counter, not leads.** Once archived
   conversations are excluded from the active list, per-lead unread stops making
   sense — a lead with one active + one archived conv needs separate counts.
   Dual-write during transition, single-write after.
3. **Auto-reopen on inbound is the only sane default.** Any other rule (manual
   reopen, spawn-new-conv-per-archive) fractures history and forces the agent to
   click before reading the customer's reply. Chose this before writing the
   webhook, confirmed correct in design review.
4. **`selectedConversationId` replaces `selectedLeadId` at the top of
   `Chat.tsx`, not alongside it.** A second selection dimension would have
   exploded the state machine; we resolve `lead` from the conversation instead.
5. **The "dormant `useChatSessions`" discovery was a gift.** Grep turned up zero
   call sites — deleting it rather than diverging meant no backwards-compat shim
   and no dead code to maintain.
6. **Sidebar filtering as sentinel strings (`__all__`, `__mine__`, `__ai__`,
   `__unassigned__`) beats null/undefined.** Radix Select can't model null
   cleanly; sentinels make the filter logic a flat switch instead of nested
   ternaries.

### ⚖️ Tradeoffs

| Decision         | Picked                                                   | Alternative                              | Why                                                                                                                                                |
| ---------------- | -------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI shape         | Keep Precision OS sidebar; no new `/conversations` route | Dedicated Conversations tab              | User scope call. "v2 = overengineering now." Filters + row metadata deliver the value inside the existing layout.                                  |
| Migration shape  | Additive (keep legacy columns)                           | Hard cutover (drop `leads.channel` etc.) | Rollback is one SQL statement. Edge functions can ship incrementally. Cost: short-term schema duplication.                                         |
| Types drift      | Localized `const sb = supabase as any;` in 3 files       | Hand-edit auto-gen `types.ts`            | `types.ts` is UTF-16 auto-generated — any manual edit is overwritten on the next `supabase gen types`. Casts are greppable and disappear on regen. |
| Realtime scope   | Subscribe to conversations + messages + leads            | Only conversations                       | Sidebar needs to react to both new inbound (messages) and CRM edits (leads). Three channels, one invalidation.                                     |
| Unread count     | Dual-write (conversation + lead) during transition       | Single-write to conversation             | Old inbox components still read `leads.unread_count`; removing that dual-write is Epic 2.                                                          |
| Delete semantics | Soft-delete (`status='deleted'`, hide by default)        | Hard delete                              | Lead + messages survive for the CRM — matches user's explicit requirement. Admin toggle to surface deleted is a later epic.                        |
| Filter sentinels | String sentinels                                         | Nullable value with discriminator        | Radix `<Select>` can't hold null; sentinels keep the component simple.                                                                             |

### ⚠️ Pending — Orchestrator / Operator Actions Before Merge

1. **Apply the migration to the remote DB:** `supabase db push` Creates the
   `conversations` table, backfills one conversation per lead, and adds
   `conversations` to the realtime publication. Additive — safe to run, rollback
   is a one-liner.
2. **Regenerate Supabase types:**
   `supabase gen types typescript --linked > src/integrations/supabase/types.ts`
   Once done, the three `const sb = supabase as any;` casts can be removed
   (`src/hooks/useConversations.ts`, `src/hooks/useMessages.ts`,
   `src/pages/Chat.tsx`).
3. **Browser smoke test matrix:**
   - Existing lead shows a conversation in the sidebar with channel +
     responsible name inline.
   - Archive a conversation → moves to "Arquivadas"; inbound message from GPT
     Maker auto-reopens it.
   - Delete a conversation → disappears from default list; the Lead still
     appears in the CRM with history intact.
   - Channel filter narrows; Responsible filter (All / My / AI / Unassigned /
     named member) narrows.
   - Send message from chat → `conversations.last_message_at` bumps, optimistic
     UI works, no duplicate on realtime echo.
   - Handoff toggle flips `conversations.atendido_por_agente` and calls GPT
     Maker start/stop-human.
4. **Merge `feat/claude-epic1-conversations` → `main`** and signal agents to
   `git pull`.

### ❌ Explicitly Out of Scope (Next Epics)

- Dedicated `/conversations` route / page
- Media upload UI / voice-note recording UI
- Quick Actions header
- Removing legacy `leads.channel` / `leads.gpt_maker_chat_id` /
  `leads.unread_count` columns
- Admin toggle to surface deleted conversations
- Per-conversation pipeline stage (currently CRM fields hang off the Lead)

---

## 📦 HANDOFF — Epic 3 COMPLETE

- **Agent:** Antigravity 
- **Branch:** `feat/antigravity-epic3-sla`
- **Date:** 2026-04-18
- **Status:** ✅ Ready for Orchestrator to merge into `main`

### ✅ Results (what landed)

**UI/Logic**
- `Chat.tsx`: Updated `isOnline` logic in `selectedSession` to calculate the 24h SLA based strictly on the timestamp of the last message with `sender_type === 'customer'`.
- `ConversationHeader.tsx`: 
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
- Removing legacy `leads.channel` / `leads.gpt_maker_chat_id` columns (kept for
  dual-read during transition)

### Risks & Rollback

- Large `messages` backfill → staged in a single SQL `UPDATE`; can be batched if
  table size warrants.
- Realtime subscription reshaped around `messages.conversation_id` — must not
  regress Sprint 1 anti-dup invariant.
- Rollback: migration is additive —
  `DROP TABLE conversations;
  ALTER TABLE messages DROP COLUMN conversation_id;`
  restores prior state.

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
  - `conversations` table (id, lead_id, equipe_id, channel, status,
    responsible_id, atendido_por_agente, agent_name, gpt_maker_chat_id,
    last_message_at, unread_count, archived_at, deleted_at, timestamps)
  - `messages.conversation_id` FK (additive — legacy `lead_id` preserved)
  - Indexes on `lead_id`, `(equipe_id, status, last_message_at)`, `channel`,
    `responsible_id`, `gpt_maker_chat_id`, `messages.conversation_id`
  - Backfill: 1 conversation per existing lead; `messages.conversation_id`
    filled via `lead_id` join
  - RLS aligned with `equipe_id` scoping (mirrors `leads` pattern)
  - `increment_conversation_unread_count(uuid)` RPC
  - Added to `supabase_realtime` publication

**Hooks**

- `src/hooks/useConversations.ts` (new) — TanStack Query + realtime subscription
  on conversations + messages + leads; mutations: `updateStatus`,
  `assignResponsible`, `toggleHandoff`. Query joins lead slice for sidebar
  display.
- `src/hooks/useMessages.ts` — keyed by `conversationId`; marks conversation
  read (`unread_count = 0`); calls `sync-chat-history` with
  `{ conversation_id, chat_id }`.
- `src/hooks/useChatSessions.ts` deleted (was dormant; zero call sites).

**UI**

- `InboxSidebar` — three filter rows: search + unread toggle, Status segmented
  (Ativas/Arquivadas), Channel + Responsible dropdowns. Responsible dropdown
  includes All / My Chats / AI Managed / Unassigned + every team member by name.
  Hidden-by-default filter excludes `deleted`.
- `ChatListItem` — channel name + responsible name inline chip under customer
  name; kebab menu with Archive / Reopen / Delete based on current status;
  Archived badge in status row.
- `ConversationHeader` — matching status dropdown next to Handoff toggle.
- `Chat.tsx` — rebuilt around `selectedConversationId`; adapter maps
  `Conversation[]` → `ExtendedChatSession[]`; handlers route to the conversation
  row (not the lead).

**Edge Functions**

- `gpt-maker-webhook` — on inbound: resolves or creates conversation;
  auto-reopens archived (approved product rule); dual-writes
  `increment_conversation_unread_count` + legacy `increment_unread_count`.
- `send-chat-message` — accepts `conversation_id`; resolves lead ↔ conversation
  ↔ chat_id; inserts messages with `conversation_id`; bumps
  `conversations.last_message_at`.
- `sync-chat-history` — accepts `conversation_id`; upserts messages with
  `conversation_id`; enriches both `leads` (legacy) and `conversations` rows
  with `channel` / `agent_name` from GPT Maker metadata.

**Verification**

- `npm run build` → ✅ passes (19.59s, 3505 modules transformed).
- `npx tsc --noEmit -p tsconfig.app.json` → ✅ clean on all Epic 1 files. The 3
  remaining errors (IntentionWizard `Loader2`, TenantContext `.finally`, Admin
  `Niche` cast) are pre-existing and out of scope.
- `git status` → only pre-existing regeneration artifacts
  (`src/integrations/supabase/types.ts`,
  `supabase/migrations/20260318072102_remote_schema.sql`) left unstaged; these
  predated Epic 1.

### 💡 Insights

1. **Dual-read is load-bearing.** Keeping the legacy `leads.channel`,
   `leads.gpt_maker_chat_id`, `leads.responsible_id` etc. means _zero_ flip-day
   risk: the old webhook / sync / chat code keeps working during rollout, and we
   can regenerate types without a scramble.
2. **Conversations should own the unread counter, not leads.** Once archived
   conversations are excluded from the active list, per-lead unread stops making
   sense — a lead with one active + one archived conv needs separate counts.
   Dual-write during transition, single-write after.
3. **Auto-reopen on inbound is the only sane default.** Any other rule (manual
   reopen, spawn-new-conv-per-archive) fractures history and forces the agent to
   click before reading the customer's reply. Chose this before writing the
   webhook, confirmed correct in design review.
4. **`selectedConversationId` replaces `selectedLeadId` at the top of
   `Chat.tsx`, not alongside it.** A second selection dimension would have
   exploded the state machine; we resolve `lead` from the conversation instead.
5. **The "dormant `useChatSessions`" discovery was a gift.** Grep turned up zero
   call sites — deleting it rather than diverging meant no backwards-compat shim
   and no dead code to maintain.
6. **Sidebar filtering as sentinel strings (`__all__`, `__mine__`, `__ai__`,
   `__unassigned__`) beats null/undefined.** Radix Select can't model null
   cleanly; sentinels make the filter logic a flat switch instead of nested
   ternaries.

### ⚖️ Tradeoffs

| Decision         | Picked                                                   | Alternative                              | Why                                                                                                                                                |
| ---------------- | -------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI shape         | Keep Precision OS sidebar; no new `/conversations` route | Dedicated Conversations tab              | User scope call. "v2 = overengineering now." Filters + row metadata deliver the value inside the existing layout.                                  |
| Migration shape  | Additive (keep legacy columns)                           | Hard cutover (drop `leads.channel` etc.) | Rollback is one SQL statement. Edge functions can ship incrementally. Cost: short-term schema duplication.                                         |
| Types drift      | Localized `const sb = supabase as any;` in 3 files       | Hand-edit auto-gen `types.ts`            | `types.ts` is UTF-16 auto-generated — any manual edit is overwritten on the next `supabase gen types`. Casts are greppable and disappear on regen. |
| Realtime scope   | Subscribe to conversations + messages + leads            | Only conversations                       | Sidebar needs to react to both new inbound (messages) and CRM edits (leads). Three channels, one invalidation.                                     |
| Unread count     | Dual-write (conversation + lead) during transition       | Single-write to conversation             | Old inbox components still read `leads.unread_count`; removing that dual-write is Epic 2.                                                          |
| Delete semantics | Soft-delete (`status='deleted'`, hide by default)        | Hard delete                              | Lead + messages survive for the CRM — matches user's explicit requirement. Admin toggle to surface deleted is a later epic.                        |
| Filter sentinels | String sentinels                                         | Nullable value with discriminator        | Radix `<Select>` can't hold null; sentinels keep the component simple.                                                                             |

### ⚠️ Pending — Orchestrator / Operator Actions Before Merge

1. **Apply the migration to the remote DB:** `supabase db push` Creates the
   `conversations` table, backfills one conversation per lead, and adds
   `conversations` to the realtime publication. Additive — safe to run, rollback
   is a one-liner.
2. **Regenerate Supabase types:**
   `supabase gen types typescript --linked > src/integrations/supabase/types.ts`
   Once done, the three `const sb = supabase as any;` casts can be removed
   (`src/hooks/useConversations.ts`, `src/hooks/useMessages.ts`,
   `src/pages/Chat.tsx`).
3. **Browser smoke test matrix:**
   - Existing lead shows a conversation in the sidebar with channel +
     responsible name inline.
   - Archive a conversation → moves to "Arquivadas"; inbound message from GPT
     Maker auto-reopens it.
   - Delete a conversation → disappears from default list; the Lead still
     appears in the CRM with history intact.
   - Channel filter narrows; Responsible filter (All / My / AI / Unassigned /
     named member) narrows.
   - Send message from chat → `conversations.last_message_at` bumps, optimistic
     UI works, no duplicate on realtime echo.
   - Handoff toggle flips `conversations.atendido_por_agente` and calls GPT
     Maker start/stop-human.
4. **Merge `feat/claude-epic1-conversations` → `main`** and signal agents to
   `git pull`.

### ❌ Explicitly Out of Scope (Next Epics)

- Dedicated `/conversations` route / page
- Media upload UI / voice-note recording UI
- Quick Actions header
- Removing legacy `leads.channel` / `leads.gpt_maker_chat_id` /
  `leads.unread_count` columns
- Admin toggle to surface deleted conversations
- Per-conversation pipeline stage (currently CRM fields hang off the Lead)

---

## 📦 HANDOFF — Epic 3 COMPLETE

- **Agent:** Antigravity 
- **Branch:** `feat/antigravity-epic3-sla`
- **Date:** 2026-04-18
- **Status:** ✅ Ready for Orchestrator to merge into `main`

### ✅ Results (what landed)

**UI/Logic**
- `Chat.tsx`: Updated `isOnline` logic in `selectedSession` to calculate the 24h SLA based strictly on the timestamp of the last message with `sender_type === 'customer'`.
- `ConversationHeader.tsx`: 
  - Implemented the active "Online (24h)" state with a subtle emerald dot pulsing animation (`animate-ping`).
  - Implemented a sober, desaturated "Janela Fechada" state for when the window is closed (>24h or no customer message). 

### ⚠️ Pending — Orchestrator Actions Before Merge

1. Review changes locally in the browser to confirm the aesthetic precision and SLA logic.
2. **Merge `feat/antigravity-epic3-sla` → `main`** and signal agents to `git pull`.

---

## 📦 HANDOFF — Epic 2 COMPLETE

- **Agent:** Antigravity 
- **Branch:** `feat/antigravity-epic3-sla`
- **Date:** 2026-04-18
- **Status:** ✅ Ready for Orchestrator to merge into `main`

### ✅ Results (what landed)

**UI/Logic**
- `Chat.tsx`: 
  - Updated `toast.success` handoff string to `"Devolvido ao Solo AI"` (removed word "bot").
  - Fixed `senderName` logic to correctly map AI messages to `agent_name || 'Solo AI'`, and map human agent messages to `'Agente'`, instead of overriding the human agent's alias with the AI's alias.
- `MessageBubble.tsx`: 
  - Replaced hardcoded fallback `'Assistente IA'` with `'Solo AI'` for AI messages.

### ⚠️ Pending — Orchestrator Actions Before Merge

1. Review changes locally in the browser to confirm the aesthetic precision and brand compliance.
2. **Merge branch → `main`** and signal agents to `git pull`.

---

## 📦 HANDOFF — Epic 4 COMPLETE

- **Agent:** Claude (Opus 4.7)
- **Branch:** `feat/claude-epic4-precision-os`
- **Date:** 2026-04-18
- **Status:** ✅ Ready for Orchestrator to merge into `main`

### ✅ Results (what landed)

**UI — Precision OS aesthetic pass (dark-first; light mode preserved)**

- `Chat.tsx` — root `bg-background dark:bg-zinc-950` (dark glass); message area `bg-muted/30 dark:bg-zinc-900/50` for subtle surface contrast.
- `InboxSidebar.tsx` — sidebar `dark:bg-zinc-950`, hairline borders `dark:border-white/5`, segmented tabs active state `dark:bg-white/[0.06] dark:ring-1 dark:ring-white/10`, search/unread controls desaturated to `zinc-900/60` + `white/5`.
- `ConversationHeader.tsx` — `dark:bg-zinc-950`, `dark:border-white/5`; avatar fallback picks up a subtle `ring-orange-500/20` (IDV nod); online-dot ring rebased to `dark:ring-zinc-950`; Responsible avatar desaturated from `bg-primary` to neutral slate + `ring-white/10`. **Emerald SLA ping (Epic 3) left untouched.**
- `ChatInput.tsx` — composer `dark:bg-zinc-900/60 dark:border-white/5 rounded-md` (was `rounded-xl`); preview chip and file thumb rebased to zinc/white-5. Record UI keeps red (destructive semantics).
- `ChatListItem.tsx` — selected row `dark:bg-white/[0.04] dark:ring-1 dark:ring-inset dark:ring-white/10`; hover `dark:hover:bg-white/[0.02]`; IA/Humano status pills rebased to `*-500/10 + ring-*/20` desaturated tints; **unread pill is the brand beacon: `bg-gradient-to-br from-solo-orange to-solo-yellow`** (the one load-bearing IDV hit in the sidebar).
- `MessageBubble.tsx` — full rebuild:
  - Customer bubble: `dark:bg-zinc-900/60 dark:border-white/5 rounded-md`
  - AI bubble: `dark:bg-zinc-900/40 dark:border-white/5 rounded-md`
  - **Agent bubble: removed `bg-primary` entirely** → `dark:bg-slate-800/80 dark:border-white/10 rounded-md` (sober slate, no neon)
  - Read receipts simplified: read → `text-sky-400`, unread → slate
  - Agent/customer avatars: subtle rings (`ring-white/5`, `ring-white/10`)
  - AI avatar ring + bot icon get a low-opacity brand accent (`ring-orange-500/30`, `text-orange-400/90`) — the second IDV hit, reserved for AI identity only

### 💡 Insights

1. **Saturation is earned, not default.** Stripping `bg-primary` from agent bubbles and the `bg-orange-100/700` from the Humano pill turned the surface sober; the orange only re-appears where it carries meaning (unread count, AI identity). The IDV is louder by being rarer.
2. **`white/5` > slate border tokens in dark mode.** `border-slate-700/60` reads as a soft line at low contrast; `border-white/5` reads as a hairline at high contrast — exactly the "tactile" feel the brief asked for.
3. **`rounded-md` instead of `rounded-lg/xl` changes the personality more than the color swap.** Sharper corners signal "tool," not "toy."
4. **Dark-first was the right call.** Adding `dark:` variants instead of replacing the classes preserved light-mode parity with zero regression risk — admin screens and any light-mode users are untouched.
5. **Emerald SLA stays.** Epic 3 picked emerald because it's the opposite of brand-warm — do not unify. The Online dot should fight the UI for attention.

### ⚖️ Tradeoffs

| Decision | Picked | Alternative | Why |
|---|---|---|---|
| Dark-mode scoping | Add `dark:` variants only | Rewrite light mode too | Sprint defines Precision OS as dark-first. Light mode is still usable; no regression risk. |
| Agent bubble color | Neutral slate | Low-opacity Solo orange/brand bubble | Brand on every outbound message = the exact saturation the brief forbids. Saved brand for AI avatar + unread pill. |
| Unread pill | Solo gradient | Neutral slate | Needed **one** high-energy beacon in the sidebar; unread count is the right place. |
| Border token | `white/5` utility | Add CSS var `--border-hairline` | Zero token surface change = zero cross-module ripple. Task said "work in utility classes." |
| Emoji picker theme | Untouched | Force dark theme | Picker is a popover; keeping its own theme prop avoids touching ChatInput logic. |

### ⚠️ Pending — Orchestrator Actions Before Merge

1. Browser smoke test — dark mode:
   - Inbox list: selected row pops without looking painted; unread pill orange-yellow is visible but not shouting.
   - Open conversation: header `bg-zinc-950`, emerald Online dot still pulses (Epic 3 regression check).
   - Agent message: bubble is slate, **not orange/brand**; read receipt is subtle sky, unread receipt is slate.
   - AI message: bubble is low-contrast zinc; avatar has faint orange ring.
   - Composer: `rounded-md`, hairline border, no chunky slate fill.
2. Light mode spot-check: sidebar + bubbles still readable; no broken contrast.
3. **Merge `feat/claude-epic4-precision-os` → `main`** and signal agents to `git pull`.

### ❌ Out of Scope

- CRM panel deep restyle (only picks up root `dark:bg-zinc-950` via parent)
- Light-mode Precision OS parity
- Token refactor in `index.css` / `tailwind.config.ts`
- Animation/typography rework
