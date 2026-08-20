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


async def check_credits(client: Any, *, equipe_id: str, estimated: int = 1) -> dict[str, Any]:
    """Pre-flight: can this tenant afford ``estimated`` credits?

    Reads only — never debits. Returns ``{allowed, balance, deficit}``. Lets a
    plan be refused before any action touches the customer's CRM, instead of
    halting halfway once charge_credits runs dry.
    """

    def _call() -> Any:
        response = client.rpc(
            "check_credits",
            {"p_equipe_id": equipe_id, "p_estimated": estimated},
        ).execute()
        error = getattr(response, "error", None)
        if error:
            raise RuntimeError(str(error))
        return getattr(response, "data", None)

    data = await asyncio.to_thread(_call)
    if not isinstance(data, dict):
        # Unknown shape: allow rather than block. charge_credits is still the
        # authority and will refuse an unaffordable action anyway.
        return {"allowed": True, "balance": 0, "deficit": 0}
    return data
