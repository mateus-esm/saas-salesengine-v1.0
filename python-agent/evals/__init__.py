"""Sprint 6.1 Evals dyno.

Two suites:
  • test_eval_doorman_accuracy.py — LLM-as-judge accuracy over seeded cases
    (slow; hits a model; skipped when no LLM key is configured).
  • test_eval_reliability.py — structural reliability checks that need NO model
    (the executor never fabricates equipe_id and never runs unknown verbs).

Run pre-deploy / nightly:  python -m pytest evals/ -v
These are intentionally OUTSIDE the fast unit gate (tests/).
"""
