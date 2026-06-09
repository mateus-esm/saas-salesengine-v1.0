"""C3 — Shape Router: /shape/preview and /shape/apply.

E10 will mount this router under /api/v1, producing final paths:
  POST /api/v1/shape/preview
  POST /api/v1/shape/apply
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ValidationError

from app.cascade.track_shaper import shape_track
from app.config import get_settings
from app.db import get_service_client
from app.deps import get_tenant_context
from app.schemas import PipelineBlueprint
from app.security import TenantContext

router = APIRouter(prefix="/shape", tags=["shape"])


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


class PreviewRequest(BaseModel):
    prompt: str
    locale: str = "pt-BR"


# ---------------------------------------------------------------------------
# POST /shape/preview
# ---------------------------------------------------------------------------


@router.post("/preview")
async def preview(
    body: PreviewRequest,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Convert a natural-language sales process description into a PipelineBlueprint.

    Calls shape_track (LLM) without writing anything to the database.
    Returns the blueprint as JSON.
    On ValidationError (bad LLM output) → HTTP 422.
    """
    settings = get_settings()
    try:
        blueprint = await shape_track(
            prompt=body.prompt,
            locale=body.locale,
            model_id=settings.shaper_model,
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=exc.errors(),
        ) from exc

    return blueprint.model_dump()


# ---------------------------------------------------------------------------
# POST /shape/apply
# ---------------------------------------------------------------------------


@router.post("/apply")
async def apply(
    blueprint: PipelineBlueprint,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
) -> dict:
    """Persist a validated PipelineBlueprint by calling the shape_pipeline RPC.

    The body IS the PipelineBlueprint — FastAPI validates it automatically;
    invalid input returns 422 before this handler is ever called.

    The equipe_id ALWAYS comes from the authenticated TenantContext (ctx),
    never from the client body.

    Returns {"pipeline_id": <uuid>}.
    """
    client = get_service_client()
    result = client.rpc(
        "shape_pipeline",
        {
            "p_equipe_id": ctx.equipe_id,
            "p_payload": blueprint.model_dump(),
        },
    ).execute()

    return {"pipeline_id": result.data}
