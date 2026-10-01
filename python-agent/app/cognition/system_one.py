"""Sprint 13 — the System One client: fast, typed, calibrated judgments (Jev).

    SystemOne(api_key).judge(state, {"id": noul(...), "id2": choice(...)}) -> Judgments

A System One model (TypeSafe's Jev) does not write text. It reads a `state`
once and answers every question about it in parallel, each with a probability
trained to be calibrated: among the answers it gives 0.8, about 80 % are right.
That makes it the right tool where an agent needs a *number it can trust* —
"is there anything here worth an LLM?", "which stage?", "does the evidence
support this action?" — and the wrong tool for writing anything.

Two question types are used here (a third, `score`, exists in the API):

  noul   — P(yes) of one condition                    -> Judgments.noul(id)
  choice — one option of a set, with the distribution -> Judgments.choice(id)

Plain HTTP on purpose: the contract is one POST, the service already ships
httpx, and the whole path stays readable end to end. Failure policy: one more
try on 429/5xx/timeout (the API asks for backoff on 429), none on 4xx; anything
that is not a well-formed answer is SystemOneError — callers catch only that and
fall back to what they did before System One existed.

Docs: https://docs.typesafe.ai/api · models/pricing: https://docs.typesafe.ai/models
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

import httpx

JEV_URL = "https://api.typesafe.ai/v1/systemone"
# Pinned, not "jev-latest": thresholds are measured against one model version,
# and an alias can move under them. Upgrading is a decision (JEV_MODEL).
JEV_MODEL = "jev-1.13.0"

_TRANSIENT = {429, 500, 502, 503, 504}


class SystemOneError(RuntimeError):
    """System One could not give a usable answer (network, status, shape)."""


def noul(instructions: Any, *, true: Any = None, false: Any = None) -> dict[str, Any]:
    """A yes/no question. `true`/`false` say what each answer means."""
    q: dict[str, Any] = {"type": "noul", "instructions": instructions}
    if true is not None or false is not None:
        q["criteria"] = {k: v for k, v in (("true", true), ("false", false)) if v is not None}
    return q


def choice(instructions: Any, criteria: dict[str, Any]) -> dict[str, Any]:
    """Pick one option. Keys are for code; the descriptions carry the meaning."""
    return {"type": "choice", "instructions": instructions, "criteria": criteria}


@dataclass(frozen=True)
class Judgments:
    model: str
    answers: dict[str, dict[str, Any]]
    input_tokens: int = 0
    ms: int = 0
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    def noul(self, key: str) -> float | None:
        value = (self.answers.get(key) or {}).get("noul")
        return float(value) if isinstance(value, (int, float)) else None

    def choice(self, key: str) -> tuple[str | None, float | None]:
        answer = self.answers.get(key) or {}
        conf = answer.get("confidence")
        return answer.get("choice"), float(conf) if isinstance(conf, (int, float)) else None

    def probabilities(self, key: str) -> dict[str, float]:
        return dict((self.answers.get(key) or {}).get("probabilities") or {})


class SystemOne:
    def __init__(
        self,
        api_key: str,
        *,
        model: str = JEV_MODEL,
        url: str = JEV_URL,
        timeout: float = 5.0,
        retry_wait: float = 0.3,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("System One needs an API key (JEV_API_KEY).")
        self.model = model
        self.url = url
        self.retry_wait = retry_wait
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._timeout = timeout
        self._transport = transport
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        # One client per SystemOne, reused across calls: keep-alive saves the TLS
        # handshake, which is a large part of a ~400 ms judgment.
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self._timeout, transport=self._transport, headers=self._headers)
        return self._client

    async def judge(self, state: Any, questions: dict[str, dict[str, Any]]) -> Judgments:
        body = {"model": self.model, "state": state, "questions": questions}
        started = perf_counter()
        last = "no attempt"
        for attempt in range(2):
            if attempt:
                await asyncio.sleep(self.retry_wait)
            try:
                response = await self._http().post(self.url, json=body)
            except httpx.TimeoutException:
                last = "timeout"
                continue
            except httpx.HTTPError as exc:
                last = f"network: {exc.__class__.__name__}"
                continue
            if response.status_code in _TRANSIENT:
                last = f"status {response.status_code}"
                continue
            if response.status_code != 200:
                raise SystemOneError(f"status {response.status_code}: {response.text[:200]}")
            return _read(response, started)
        raise SystemOneError(last)

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()


def _read(response: httpx.Response, started: float) -> Judgments:
    try:
        data = response.json()
    except ValueError as exc:
        raise SystemOneError("answer is not JSON") from exc
    answers = data.get("answers") if isinstance(data, dict) else None
    if not isinstance(answers, dict):
        raise SystemOneError("answer without answers")
    usage = data.get("usage") or {}
    return Judgments(
        model=str(data.get("model") or ""),
        answers=answers,
        input_tokens=int(usage.get("input_tokens") or 0),
        ms=int(round((perf_counter() - started) * 1000)),
        raw=data,
    )
