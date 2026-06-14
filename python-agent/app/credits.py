"""Copilot credit metering helpers over the charge_credits RPC."""

from __future__ import annotations

import asyncio
from typing import Any


class InsufficientCredits(Exception):
    """Raised when the Copilot wallet cannot cover the requested charge."""


async def charge_credit(
    client: Any,
    *,
    equipe_id: str,
    idempotency_key: str,
    ledger: dict[str, Any],
    credits: int = 1,
) -> str:
    """Atomically charge credits and return the ledger row id.

    The Postgres RPC is idempotent by ``idempotency_key``: replaying the same key
    returns the original ledger id without debiting the wallet again.
    """

    def _call() -> Any:
        response = client.rpc(
            "charge_credits",
            {
                "p_equipe_id": equipe_id,
                "p_credits": credits,
                "p_idempotency_key": idempotency_key,
                "p_ledger": ledger,
            },
        ).execute()
        error = getattr(response, "error", None)
        if error:
            raise RuntimeError(str(error))
        return getattr(response, "data", None)

    try:
        return str(await asyncio.to_thread(_call))
    except RuntimeError as exc:
        message = str(exc)
        if "insufficient_credits" in message or "no_wallet" in message:
            raise InsufficientCredits(message) from exc
        raise


async def get_balance(client: Any, *, equipe_id: str) -> int:
    """Return the current Copilot wallet balance, or 0 when no wallet exists."""

    def _call() -> Any:
        response = (
            client.table("agent_credits_balance")
            .select("balance")
            .eq("equipe_id", equipe_id)
            .limit(1)
            .execute()
        )
        error = getattr(response, "error", None)
        if error:
            raise RuntimeError(str(error))
        return getattr(response, "data", None)

    data = await asyncio.to_thread(_call)
    if not data:
        return 0
    row = data[0] if isinstance(data, list) else data
    return int(row.get("balance", 0))
