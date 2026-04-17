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
