import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import jwt
import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import deps, security


SECRET = "test-supabase-jwt-secret-32-bytes-minimum"
USER_ID = "11111111-1111-4111-8111-111111111111"
EQUIPE_ID = "22222222-2222-4222-8222-222222222222"


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeProfilesQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []

    def select(self, columns):
        self.columns = columns
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, count):
        self.limit_count = count
        return self

    def execute(self):
        column, value = self.filters[-1]
        return FakeResponse([row for row in self.rows if row.get(column) == value])


class FakeClient:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def table(self, name):
        assert name == "profiles"
        query = FakeProfilesQuery(self.rows)
        self.queries.append(query)
        return query


def make_token(**overrides):
    payload = {
        "aud": "authenticated",
        "exp": datetime.now(UTC) + timedelta(minutes=5),
        "sub": USER_ID,
        "role": "authenticated",
    }
    payload.update(overrides)
    return jwt.encode(payload, SECRET, algorithm="HS256")


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(supabase_jwt_secret=SECRET),
    )


def test_valid_token_returns_tenant_context():
    client = FakeClient(
        [{"user_id": USER_ID, "equipe_id": EQUIPE_ID, "role": "admin"}]
    )

    ctx = security.tenant_from_jwt(f"Bearer {make_token()}", client=client)

    assert ctx == security.TenantContext(
        equipe_id=EQUIPE_ID,
        actor_user_id=USER_ID,
        role="admin",
    )


def test_profile_id_fallback_resolves_team():
    client = FakeClient([{"id": USER_ID, "equipe_id": EQUIPE_ID}])

    ctx = security.tenant_from_jwt(f"Bearer {make_token()}", client=client)

    assert ctx.equipe_id == EQUIPE_ID
    assert [query.filters[-1] for query in client.queries] == [
        ("user_id", USER_ID),
        ("id", USER_ID),
    ]


@pytest.mark.parametrize(
    "authorization",
    [
        None,
        "",
        f"Basic {make_token()}",
        "Bearer ",
        f"Bearer {make_token()}x",
        f"Bearer {make_token(exp=datetime.now(UTC) - timedelta(minutes=1))}",
        f"Bearer {make_token(aud='anon')}",
    ],
)
def test_invalid_tokens_raise_401(authorization):
    with pytest.raises(HTTPException) as exc:
        security.tenant_from_jwt(authorization, client=FakeClient([]))

    assert exc.value.status_code == 401


def test_missing_subject_raises_401():
    with pytest.raises(HTTPException) as exc:
        security.tenant_from_jwt(f"Bearer {make_token(sub='')}", client=FakeClient([]))

    assert exc.value.status_code == 401


def test_no_tenant_raises_403():
    client = FakeClient([{"user_id": USER_ID, "equipe_id": None}])

    with pytest.raises(HTTPException) as exc:
        security.tenant_from_jwt(f"Bearer {make_token()}", client=client)

    assert exc.value.status_code == 403


def test_deps_get_tenant_context_uses_security_module():
    client = FakeClient([{"user_id": USER_ID, "equipe_id": EQUIPE_ID}])

    ctx = deps.get_tenant_context(f"Bearer {make_token()}", client=client)

    assert ctx.equipe_id == EQUIPE_ID
