"""Sequential, credit-aware executor for a multi-action `ActionPlan`.

Iterates the plan's actions IN ORDER. For each non-confirmation action it dispatches
the Core-Table verb and, on success, charges exactly 1 credit. It stops early on
`InsufficientCredits` (recording a `no_credits` halt). Actions flagged
`requires_confirmation=True` are NOT executed here — they are returned as
`pending_confirmations` for the HITL path (B5). When `emit` is given, a run-event is
emitted per step for the Telemetry HUD.
"""
from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from app.credits import InsufficientCredits
from app.schemas import ActionPlan, ActionResult, PlannedAction
from app.security import TenantContext
from app.skills import registry
from app.cascade.field_dictionary import contact_dictionary, pipeline_dictionary
from app.cascade.field_validation import FIELD_WRITE_VERBS, validate_field_action


@dataclass
class ExecResult:
    applied_count: int = 0
    results: list[ActionResult] = field(default_factory=list)
    pending_confirmations: list[PlannedAction] = field(default_factory=list)
    halted: bool = False
    halt_reason: str | None = None


def _skill_for(skill_name: str, *, client: Any, equipe_id: str, actor: str):
    return registry.get_skill(skill_name)(client=client, equipe_id=equipe_id, actor=actor)


async def _dispatch(
    skill: Any,
    action: PlannedAction,
    *,
    opportunity: dict | None,
    lead: dict | None,
) -> ActionResult:
    method = getattr(skill, action.verb, None)
    if not callable(method):
        return ActionResult(success=False, error=f"unknown_verb:{action.verb}")
    args = dict(action.args)
    sig = inspect.signature(method).parameters
    if "opportunity_id" in sig and "opportunity_id" not in args and opportunity:
        args["opportunity_id"] = opportunity.get("id")
    if "lead_id" in sig and "lead_id" not in args and lead:
        args["lead_id"] = lead.get("id")
    out = method(**args)
    if inspect.isawaitable(out):
        out = await out
    return out if isinstance(out, ActionResult) else ActionResult(success=True, detail={"result": out})


async def run_plan(
    plan: ActionPlan,
    *,
    ctx: TenantContext,
    opportunity: dict | None,
    lead: dict | None,
    rules: dict | None,
    client: Any,
    charge_fn: Callable[..., Awaitable[str]],
    check_fn: Callable[..., Awaitable[dict]] | None = None,
    mode: str = "manual",
    run_id: str = "run",
    emit: Callable[[str, dict], Awaitable[None]] | None = None,
) -> ExecResult:
    res = ExecResult()
    actor = ctx.actor_user_id or "copilot"
    seq = 0

    # Field-write guard: any set_field / set_contact_field / attach_file action —
    # from ANY producer (enricher, Floor doorman, future) — may only target a
    # field that exists in the dictionaries. Load them once per run.
    contact_fields = contact_dictionary(client, ctx.equipe_id)
    try:
        pipeline_fields = pipeline_dictionary(
            client, ctx.equipe_id, (opportunity or {}).get("pipeline_id")
        )
    except Exception:
        pipeline_fields = {}

    # Pre-flight (Sprint 8 T10). charge_fn already charges on success and halts
    # mid-plan when the wallet runs dry, which is correct but wasteful: the first
    # actions have already been applied to the customer's CRM before we discover
    # the plan was unaffordable. Checking the whole plan up front means a tenant
    # without credits gets a clean refusal instead of a half-applied plan.
    if check_fn is not None:
        billable = sum(1 for a in plan.actions if not a.requires_confirmation)
        if billable:
            try:
                verdict = await check_fn(equipe_id=ctx.equipe_id, estimated=billable)
            except Exception:
                verdict = None  # never block the plan on a failed check
            if verdict is not None and not verdict.get("allowed", True):
                res.halted = True
                res.halt_reason = "no_credits"
                if emit:
                    await emit("halted", {
                        "reason": "no_credits",
                        "balance": verdict.get("balance"),
                        "deficit": verdict.get("deficit"),
                    })
                return res

    for action in plan.actions:
        if action.requires_confirmation:
            res.pending_confirmations.append(action)
            if emit:
                await emit("awaiting_confirmation", {"verb": action.verb, "args": action.args})
            continue

        if action.verb in FIELD_WRITE_VERBS and not validate_field_action(
            action, pipeline_fields=pipeline_fields, contact_fields=contact_fields
        ):
            if emit:
                await emit("dropped_unknown_field", {"verb": action.verb, "args": action.args})
            continue

        skill = _skill_for(action.skill, client=client, equipe_id=ctx.equipe_id, actor=actor)
        if emit:
            await emit("action_start", {"verb": action.verb, "args": action.args})
        result = await _dispatch(skill, action, opportunity=opportunity, lead=lead)
        res.results.append(result)

        if result.success:
            seq += 1
            opp = (opportunity or {}).get("id", "")
            try:
                await charge_fn(
                    equipe_id=ctx.equipe_id,
                    idempotency_key=f"{run_id}:{action.verb}:{opp}:{seq}",
                    ledger={
                        "verb": action.verb,
                        "opportunity_id": opp,
                        "lead_id": (lead or {}).get("id", ""),
                        "mode": mode,
                    },
                )
            except InsufficientCredits:
                res.halted = True
                res.halt_reason = "no_credits"
                if emit:
                    await emit("halted", {"reason": "no_credits"})
                break
            res.applied_count += 1
            if emit:
                await emit("action_done", {"verb": action.verb, "ok": True})
        else:
            if emit:
                await emit("action_done", {"verb": action.verb, "ok": False, "error": result.error})
    return res
