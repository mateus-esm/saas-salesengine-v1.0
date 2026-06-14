import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.metering import make_metering_hook
from app.schemas import ActionResult


class _Recorder:
    def __init__(self):
        self.calls: list[dict] = []

    async def charge(self, **kwargs):
        self.calls.append(kwargs)
        return "ledger-1"


@pytest.mark.asyncio
async def test_successful_action_charges_one_credit():
    rec = _Recorder()

    async def move_stage(**kwargs):
        return ActionResult(success=True, detail={"action": "move_stage"})

    hook = make_metering_hook(
        equipe_id="e1",
        mode="manual",
        run_id="run-1",
        context={"lead_id": "lead-1", "opportunity_id": "opp-1", "model": "cheap-model"},
        charge_fn=rec.charge,
    )

    result = await hook("move_stage", move_stage, {"stage_type": "won"})

    assert result.success is True
    assert result.detail["ledger_id"] == "ledger-1"
    assert len(rec.calls) == 1
    call = rec.calls[0]
    assert call["equipe_id"] == "e1"
    assert call["credits"] == 1
    assert call["idempotency_key"].startswith("run-1:move_stage:")
    assert call["ledger"]["verb"] == "move_stage"
    assert call["ledger"]["mode"] == "manual"
    assert call["ledger"]["lead_id"] == "lead-1"
    assert call["ledger"]["opportunity_id"] == "opp-1"
    assert call["ledger"]["model"] == "cheap-model"


@pytest.mark.asyncio
async def test_failed_action_does_not_charge():
    rec = _Recorder()

    async def move_stage(**kwargs):
        return ActionResult(success=False, error="stage_not_found")

    hook = make_metering_hook(equipe_id="e1", mode="auto", run_id="run-1", context={}, charge_fn=rec.charge)

    result = await hook("move_stage", move_stage, {"stage_type": "won"})

    assert result.success is False
    assert rec.calls == []


@pytest.mark.asyncio
async def test_charge_failure_is_reported_without_failing_action():
    async def charge(**kwargs):
        raise RuntimeError("rpc unavailable")

    async def set_field(**kwargs):
        return ActionResult(success=True, detail={"action": "set_field"})

    hook = make_metering_hook(equipe_id="e1", mode="auto", run_id="run-1", context={}, charge_fn=charge)

    result = await hook("set_field", set_field, {"field_id": "budget", "value": "100k"})

    assert result.success is True
    assert result.detail["metering_error"] == "rpc unavailable"
