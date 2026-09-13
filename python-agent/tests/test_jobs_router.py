"""Sprint 11 · Onda 6 · T60 — the queue's alarm clock (POST /api/v1/jobs/tick).

What these tests protect: no token, no entry; switched off, nothing is claimed;
switched on, the batch is claimed, the answer is 202 at once, and every claimed
job is processed; the concurrency cap holds across the batch.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers import jobs as jobs_module

TOKEN = "internal-token"


def _settings(*, enabled: bool = True) -> MagicMock:
    s = MagicMock()
    s.agent_internal_token = TOKEN
    s.copilot_jobs_enabled = enabled
    s.copilot_jobs_batch = 10
    s.copilot_jobs_concurrency = 2
    s.keeper_model = None
    s.doorman_model = "deepseek"
    return s


class FakeRepo:
    def __init__(self, jobs):
        self.jobs = jobs
        self.claims: list[int] = []

    def claim(self, limit):
        self.claims.append(limit)
        return self.jobs


@pytest.fixture(autouse=True)
def _fresh_gate():
    jobs_module._semaphore = None
    yield
    jobs_module._semaphore = None


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(jobs_module.router, prefix="/api/v1")
    return TestClient(app)


def test_without_the_token_nothing_happens():
    with patch.object(jobs_module, "get_settings", return_value=_settings()):
        assert _client().post("/api/v1/jobs/tick").status_code == 401
        assert _client().post("/api/v1/jobs/tick", headers={"X-Agent-Token": "wrong"}).status_code == 401


def test_switched_off_claims_nothing():
    repo = FakeRepo([{"id": "j1"}])
    with patch.object(jobs_module, "get_settings", return_value=_settings(enabled=False)), \
         patch.object(jobs_module, "get_repo", return_value=repo):
        response = _client().post("/api/v1/jobs/tick", headers={"X-Agent-Token": TOKEN})
    assert response.json() == {"status": "disabled", "claimed": 0}
    assert repo.claims == []


def test_switched_on_claims_answers_202_and_processes_every_job():
    jobs = [{"id": f"j{i}", "opportunity_id": f"o{i}", "equipe_id": "e"} for i in range(3)]
    repo = FakeRepo(jobs)
    seen: list[str] = []

    async def fake_run_job(job, *, repo, think, model_id):
        seen.append(job["id"])
        assert model_id == "deepseek"
        return {"status": "done"}

    with patch.object(jobs_module, "get_settings", return_value=_settings()), \
         patch.object(jobs_module, "get_repo", return_value=repo), \
         patch.object(jobs_module, "get_think", return_value=object()), \
         patch("app.copilot.keeper.run_job", fake_run_job):
        response = _client().post("/api/v1/jobs/tick", headers={"X-Agent-Token": TOKEN})

    assert response.status_code == 202
    assert response.json() == {"status": "accepted", "claimed": 3}
    assert repo.claims == [10]
    assert sorted(seen) == ["j0", "j1", "j2"]


def test_the_concurrency_cap_holds():
    running = 0
    peak = 0

    async def slow_run_job(job, *, repo, think, model_id):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1
        return {"status": "done"}

    jobs = [{"id": f"j{i}"} for i in range(6)]
    with patch("app.copilot.keeper.run_job", slow_run_job):
        results = asyncio.run(jobs_module.process(jobs, repo=None, think=None, model_id="m", concurrency=2))
    assert len(results) == 6
    assert peak == 2
