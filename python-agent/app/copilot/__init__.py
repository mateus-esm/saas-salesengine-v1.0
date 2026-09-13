"""Sprint 11 · Onda 6 — the Copilot that keeps deals up to date, and its chat.

keeper  — one pass over one deal: context (one DB call) → one model call →
          apply (one DB call). Runs from the Postgres queue (copilot_jobs).
repo    — the four database verbs the keeper uses, over the direct Postgres pool.
actions — what the model answers.
"""
