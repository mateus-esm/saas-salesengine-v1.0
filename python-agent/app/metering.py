"""Copilot credit metering for successful Core-Table verb calls."""

from __future__ import annotations

import hashlib
import inspect
import json
from collections.abc import Awaitable, Callable
from typing import Any, Literal

from app.schemas import ActionResult

ChargeFn = Callable[..., Awaitable[Any] | Any]


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _idempotency_key(run_id: str, function_name: str, args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    payload = _stable_json({"args": args, "kwargs": kwargs})
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
    return f"{run_id}:{function_name}:{digest}"


async def _maybe_await(value: Awaitable[Any] | Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def _split_args(raw_args: Any, raw_kwargs: dict[str, Any] | None) -> tuple[tuple[Any, ...], dict[str, Any]]:
    if raw_kwargs is not None:
        if raw_args is None:
            return (), dict(raw_kwargs)
        if isinstance(raw_args, tuple):
            return raw_args, dict(raw_kwargs)
        if isinstance(raw_args, list):
            return tuple(raw_args), dict(raw_kwargs)
        return (raw_args,), dict(raw_kwargs)

    if raw_args is None:
        return (), {}
    if isinstance(raw_args, dict):
        return (), dict(raw_args)
    if isinstance(raw_args, tuple):
        return raw_args, {}
    if isinstance(raw_args, list):
        return tuple(raw_args), {}
    return (raw_args,), {}


def make_metering_hook(
    *,
    equipe_id: str,
    mode: Literal["auto", "manual"],
    run_id: str,
    context: dict[str, Any] | None,
    charge_fn: ChargeFn,
    model: str | None = None,
) -> Callable[[str, Callable[..., Any], Any, dict[str, Any] | None], Awaitable[Any]]:
    """Build a tenant/run-scoped async metering hook.

    The hook wraps one tool call, charges one credit only after a successful
    ``ActionResult``, and leaves the original action result intact when metering
    itself fails.
    """

    base_context = dict(context or {})

    async def hook(
        function_name: str,
        func: Callable[..., Any],
        args: Any = None,
        kwargs: dict[str, Any] | None = None,
    ) -> Any:
        call_args, call_kwargs = _split_args(args, kwargs)
        result = await _maybe_await(func(*call_args, **call_kwargs))

        if not isinstance(result, ActionResult) or not result.success:
            return result

        ledger = {
            **base_context,
            "verb": function_name,
            "mode": mode,
            "run_id": run_id,
        }
        if model is not None:
            ledger["model"] = model
        key = _idempotency_key(run_id, function_name, call_args, call_kwargs)

        try:
            ledger_id = await _maybe_await(
                charge_fn(
                    equipe_id=equipe_id,
                    credits=1,
                    idempotency_key=key,
                    ledger=ledger,
                )
            )
            result.detail = {**(result.detail or {}), "ledger_id": str(ledger_id)}
        except Exception as exc:
            result.detail = {**(result.detail or {}), "metering_error": str(exc)}

        return result

    return hook
