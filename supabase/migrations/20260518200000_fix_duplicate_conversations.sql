-- ============================================================================
-- Sprint 5.5 EPIC 1b — Fix duplicate conversations per lead
--
-- Bug: normalizeChannel() in gpt-maker-webhook deep-scanned the entire JSON
-- payload, causing false-positive channel detection. Combined with the
-- conversation upsert only matching (lead_id, channel), this created
-- multiple conversations per lead when the channel was misdetected.
--
-- This migration:
--   1. Merges duplicate conversations per lead: keeps the one with the most
--      recent last_message_at, moves all messages to it, soft-deletes the rest.
--   2. Does NOT destroy data — duplicate conversations are set to 'deleted'.
-- ============================================================================

-- Step 1: Reassign messages from duplicate conversations to the "winner"
-- (the most-recently-active conversation for each lead).
WITH ranked AS (
  SELECT
    id,
    lead_id,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM public.conversations
  WHERE status != 'deleted'
),
winner AS (
  SELECT lead_id, id AS winner_id
  FROM ranked
  WHERE rn = 1
),
loser AS (
  SELECT r.id AS loser_id, w.winner_id
  FROM ranked r
  JOIN winner w ON w.lead_id = r.lead_id
  WHERE r.rn > 1
)
UPDATE public.messages m
SET conversation_id = l.winner_id
FROM loser l
WHERE m.conversation_id = l.loser_id;

-- Step 2: Aggregate unread counts into the winner
WITH ranked AS (
  SELECT
    id,
    lead_id,
    unread_count,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM public.conversations
  WHERE status != 'deleted'
),
totals AS (
  SELECT lead_id, SUM(unread_count) AS total_unread
  FROM ranked
  GROUP BY lead_id
  HAVING COUNT(*) > 1
)
UPDATE public.conversations c
SET unread_count = t.total_unread
FROM totals t
JOIN ranked r ON r.lead_id = t.lead_id AND r.rn = 1
WHERE c.id = r.id;

-- Step 3: Soft-delete the duplicate (loser) conversations
WITH ranked AS (
  SELECT
    id,
    lead_id,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM public.conversations
  WHERE status != 'deleted'
)
UPDATE public.conversations
SET status = 'deleted',
    deleted_at = now()
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);
