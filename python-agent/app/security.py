from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import HTTPException, status
from supabase import Client

from app.config import get_settings


@dataclass(frozen=True)
class TenantContext:
    equipe_id: str
    actor_user_id: str
    role: str


def tenant_from_jwt(authorization: str | None, *, client: Client | None = None) -> TenantContext:
    token = _extract_bearer_token(authorization)
    payload = _decode_token(token)
    actor_user_id = payload.get("sub")
    if not isinstance(actor_user_id, str) or not actor_user_id:
        raise _unauthorized("Token is missing subject")

    db = client or _get_service_client()
    profile = _fetch_profile(db, actor_user_id)
    equipe_id = profile.get("equipe_id")
    if not equipe_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated user has no equipe_id",
        )

    return TenantContext(
        equipe_id=str(equipe_id),
        actor_user_id=actor_user_id,
        role=str(profile.get("role") or payload.get("role") or "authenticated"),
    )


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise _unauthorized("Missing authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized("Authorization header must use Bearer token")

    return token.strip()


def _decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as exc:
        raise _unauthorized("Invalid authentication token") from exc


def _fetch_profile(client: Client, actor_user_id: str) -> dict[str, Any]:
    profile = _select_profile(client, "user_id", actor_user_id)
    if not profile:
        profile = _select_profile(client, "id", actor_user_id)
    return profile


def _select_profile(client: Client, column: str, value: str) -> dict[str, Any]:
    response = (
        client.table("profiles")
        .select("id,user_id,equipe_id,role")
        .eq(column, value)
        .limit(1)
        .execute()
    )
    data = getattr(response, "data", None)
    if isinstance(data, list):
        return data[0] if data else {}
    if isinstance(data, dict):
        return data
    return {}


def _get_service_client() -> Client:
    from app.db import get_service_client

    return get_service_client()


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
