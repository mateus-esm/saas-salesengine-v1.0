from __future__ import annotations

import inspect
from typing import Any

from app.db import get_service_client
from app.schemas import ActionResult, IntentDecision
from app.security import TenantContext
from app.skills import registry


def is_pipeline_relevant(conversation: Any) -> bool:
    """
    Heuristic to determine if a conversation is relevant to the pipeline.
    Runs without any LLM/model calls.
    
    Checks if there is any meaningful text content in the conversation:
    - If string: checks if it has non-whitespace characters.
    - If list: checks if any item (string or dict message content) contains non-whitespace text.
    - If dict: checks nested messages/rows lists.
    """
    if not conversation:
        return False

    if isinstance(conversation, str):
        content = conversation.strip()
        return len(content) > 1 and not content.isspace()

    if isinstance(conversation, list):
        for msg in conversation:
            if isinstance(msg, dict):
                content = msg.get("content") or msg.get("text") or ""
                if isinstance(content, str) and len(content.strip()) > 1:
                    return True
            elif isinstance(msg, str):
                if len(msg.strip()) > 1:
                    return True
        return False

    if isinstance(conversation, dict):
        messages = conversation.get("messages") or conversation.get("rows")
        if messages:
            return is_pipeline_relevant(messages)

    return False


async def run_worker(
    *,
    ctx: TenantContext,
    decision: IntentDecision,
    opportunity: dict | None,
    lead: dict | None,
    rules: dict | None,
    client: Any = None,
) -> ActionResult:
    """
    Worker that executes the cascade's next action:
    - deterministic: dispatches the specified skill and method.
    - agentic: delegates to autonomous_team.run_autonomous.
    - none: returns a no-op success action result.
    """
    automation_kind = decision.automation_kind

    if automation_kind == "none":
        return ActionResult(success=True, detail={"info": "automation_kind is none, no action taken"})

    if automation_kind == "agentic":
        try:
            from app.cascade.autonomous_team import run_autonomous
            return await run_autonomous(
                ctx=ctx,
                decision=decision,
                opportunity=opportunity,
                lead=lead,
                rules=rules,
            )
        except ImportError:
            # Fallback when autonomous_team is not yet implemented (Wave 4)
            return ActionResult(success=False, error="autonomous_team_not_implemented")

    if automation_kind == "deterministic":
        if not decision.skill:
            return ActionResult(success=False, error="missing_skill_name_for_deterministic")

        try:
            skill_cls = registry.get_skill(decision.skill)
        except Exception as exc:
            return ActionResult(success=False, error=str(exc))

        # Instantiate skill with Supabase client
        db_client = client or get_service_client()
        actor = ctx.actor_user_id or "copilot"
        
        try:
            skill_instance = skill_cls(client=db_client, equipe_id=ctx.equipe_id, actor=actor)
        except Exception as exc:
            return ActionResult(success=False, error=f"failed_to_initialize_skill: {exc}")

        # The verb (method to execute) must be specified in the decision args
        verb = decision.args.get("verb") or decision.args.get("action")
        if not verb:
            return ActionResult(success=False, error="missing_verb_or_action")

        method = getattr(skill_instance, verb, None)
        if not method or not callable(method):
            return ActionResult(success=False, error=f"unknown_verb: {verb}")

        # Filter out special args and prepare method arguments
        method_args = {k: v for k, v in decision.args.items() if k not in ("verb", "action")}

        # Inspect method signature to inject context parameters if they are accepted but missing
        try:
            sig = inspect.signature(method)
            params = sig.parameters
        except Exception:
            params = {}

        if "opportunity_id" in params and "opportunity_id" not in method_args:
            if opportunity and isinstance(opportunity, dict) and "id" in opportunity:
                method_args["opportunity_id"] = opportunity["id"]

        if "lead_id" in params and "lead_id" not in method_args:
            if lead and isinstance(lead, dict) and "id" in lead:
                method_args["lead_id"] = lead["id"]

        # Execute the skill method
        try:
            result = await method(**method_args)
            if not isinstance(result, ActionResult):
                # Ensure we return an ActionResult
                result = ActionResult(
                    success=True,
                    detail=result if isinstance(result, dict) else {"result": result}
                )
            return result
        except Exception as exc:
            return ActionResult(success=False, error=str(exc))

    return ActionResult(success=False, error=f"invalid_automation_kind: {automation_kind}")
