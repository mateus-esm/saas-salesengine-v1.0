# Solo Copilot backend — dev/CI targets.
#
# Unit gate (every PR):   make test
# Evals (pre-deploy):     make evals   (needs LLM_API_KEY for the accuracy suite)

PY ?= python

.PHONY: test evals lint all

test:
	$(PY) -m pytest tests/ -q

evals:
	$(PY) -m pytest evals/ -v

all: test evals
