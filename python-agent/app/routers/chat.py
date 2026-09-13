"""Sprint 11 · Onda 6 · T63 — POST /api/v1/chat (the user's Supabase JWT).

Body: {"message": "...", "thread_id": "..."?}. Answers as Server-Sent Events —
`data: {json}` per event: thread, tools (the queries being made, for the screen to
show), delta (a piece of the answer), done (message id, links) or error.
"""

from __future__ import annotations

import json
from typing import Annotated, AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.deps import get_tenant_context
from app.security import TenantContext

router = APIRouter(tags=["copilot-chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    thread_id: str | None = None


def get_deps(ctx: TenantContext):  # seam for tests
    from app.copilot.chat import build_deps
    from app.db import get_pg_pool

    settings = get_settings()
    return build_deps(pool=get_pg_pool(), user_id=ctx.actor_user_id,
                      model_id=settings.chat_model or settings.doorman_model)


@router.post("/chat")
async def chat(body: ChatRequest, ctx: Annotated[TenantContext, Depends(get_tenant_context)]) -> StreamingResponse:
    from app.copilot.chat import answer_stream

    deps = get_deps(ctx)

    async def events() -> AsyncIterator[str]:
        try:
            async for event in answer_stream(equipe_id=ctx.equipe_id, user_id=ctx.actor_user_id,
                                             thread_id=body.thread_id, question=body.message, deps=deps):
                yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"
        except Exception:
            yield "data: " + json.dumps({"type": "error", "message": "Não consegui responder agora."}) + "\n\n"

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
