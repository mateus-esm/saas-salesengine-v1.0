from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header
from supabase import Client

from app.security import TenantContext, tenant_from_jwt


def _get_db() -> Client:
    from app.db import get_db

    return get_db()


def get_tenant_context(
    authorization: Annotated[str | None, Header()] = None,
    client: Client = Depends(_get_db),
) -> TenantContext:
    return tenant_from_jwt(authorization, client=client)
