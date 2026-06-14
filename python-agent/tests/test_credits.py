import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.credits import InsufficientCredits, charge_credit, get_balance


class _FakeRPC:
    def __init__(self, result=None, error=None):
        self._result = result
        self._error = error
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return self

    def execute(self):
        if self._error:
            raise RuntimeError(self._error)

        class _R:
            data = self._result
            error = None

        return _R()


class _FakeQuery:
    def __init__(self, data):
        self._data = data
        self.filters = []
        self.limit_count = None

    def select(self, columns):
        self.columns = columns
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def limit(self, count):
        self.limit_count = count
        return self

    def execute(self):
        class _R:
            data = self._data
            error = None

        return _R()


class _FakeBalanceClient:
    def __init__(self, data):
        self.query = _FakeQuery(data)

    def table(self, name):
        self.table_name = name
        return self.query


@pytest.mark.asyncio
async def test_charge_credit_returns_ledger_id():
    client = _FakeRPC(result="ledger-123")

    ledger_id = await charge_credit(
        client,
        equipe_id="e1",
        idempotency_key="k1",
        ledger={"verb": "move_stage", "mode": "manual"},
    )

    assert ledger_id == "ledger-123"
    name, params = client.calls[0]
    assert name == "charge_credits"
    assert params["p_equipe_id"] == "e1"
    assert params["p_credits"] == 1
    assert params["p_idempotency_key"] == "k1"
    assert params["p_ledger"] == {"verb": "move_stage", "mode": "manual"}


@pytest.mark.asyncio
async def test_insufficient_credits_raises_typed_error():
    client = _FakeRPC(error="insufficient_credits")

    with pytest.raises(InsufficientCredits):
        await charge_credit(client, equipe_id="e1", idempotency_key="k2", ledger={"verb": "x"})


@pytest.mark.asyncio
async def test_get_balance_returns_wallet_balance():
    client = _FakeBalanceClient([{"balance": 42}])

    balance = await get_balance(client, equipe_id="e1")

    assert balance == 42
    assert client.table_name == "agent_credits_balance"
    assert ("equipe_id", "e1") in client.query.filters
    assert client.query.limit_count == 1


@pytest.mark.asyncio
async def test_get_balance_returns_zero_when_wallet_missing():
    client = _FakeBalanceClient([])

    assert await get_balance(client, equipe_id="e1") == 0
