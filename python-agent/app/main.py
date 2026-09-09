"""E10 — FastAPI application entry-point for the Solo Copilot service.

Dockerfile CMD: uvicorn app.main:app --host 0.0.0.0 --port 8000

Routers mounted under /api/v1:
  - /api/v1/shape/preview  (POST)  — §P5/C3
  - /api/v1/shape/apply    (POST)  — §P5/C3
  - /api/v1/sync           (POST)  — §P5/E8
  - /api/v1/ingest         (POST)  — §P5/E7
  - /api/v1/approvals/{decision_id}/resolve  (POST)  — §P5/E9

CORS:
  Origins are sourced from settings.cors_origins when the setting is present
  (default: ["http://localhost:5173"]).  If the list is empty at runtime, ["*"]
  is used as a safety fallback (commented below) — operators should set
  CORS_ORIGINS in the environment for production deployments.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.llm import ModelProviderError
from app.routers import admin, approvals, cycle_pass, decisions, forecast, ingest, revenue, shape, sweep, sync

# ---------------------------------------------------------------------------
# Application instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Solo Copilot",
    version="0.1.0",
    description="Sprint 6 — Solo Copilot agent API.",
)


# ---------------------------------------------------------------------------
# The model provider failing is not the caller's fault
#
# An OpenAI-compatible router answers a bad credential with
# ``401 {"error": "invalid or expired token"}``, and Agno hands that string back
# where model output belongs. Validating it against a schema used to produce a
# 422 that said the caller's pipeline blueprint was invalid -- pointing the
# diagnosis at the one place that was fine. 502 says who actually failed, and the
# message names the credential so the next person does not have to guess.
# ---------------------------------------------------------------------------


@app.exception_handler(ModelProviderError)
async def _model_provider_error(_: Request, exc: ModelProviderError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={
            "detail": {
                "error": "model_provider_unavailable",
                "message": (
                    "O provedor de modelo recusou a chamada, entao o Copilot nao "
                    "chegou a gerar nada. Verifique LLM_API_KEY / LLM_BASE_URL no "
                    "servico do Copilot."
                ),
                "provider_said": str(exc),
            }
        },
    )

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

_settings = get_settings()
# cors_origins comes from Settings.cors_origins (default: ["http://localhost:5173"]).
# Fall back to ["*"] only if the list is empty so the server is never broken by
# a misconfigured env.  Production deployments SHOULD set CORS_ORIGINS explicitly.
_cors_origins: list[str] = _settings.cors_origins if _settings.cors_origins else ["*"]
# Regex allows the whole *.soloventures.com.br space (all niches are aliases of one
# site) so new niches need no CORS change. `or None` treats an empty env as disabled.
_cors_origin_regex: str | None = _settings.cors_origin_regex or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

_API_PREFIX = "/api/v1"

app.include_router(shape.router, prefix=_API_PREFIX)
app.include_router(sync.router, prefix=_API_PREFIX)
app.include_router(sweep.router, prefix=_API_PREFIX)
app.include_router(ingest.router, prefix=_API_PREFIX)
app.include_router(approvals.router, prefix=_API_PREFIX)
app.include_router(cycle_pass.router, prefix=_API_PREFIX)
app.include_router(decisions.router, prefix=_API_PREFIX)
app.include_router(revenue.router, prefix=_API_PREFIX)
app.include_router(forecast.router, prefix=_API_PREFIX)
# Admin ops surface — NOT under /api/v1 (non-tenant), internal-token gated.
app.include_router(admin.router)

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health", tags=["health"])
@app.get("/api/v1/health", tags=["health"])
async def health() -> dict:
    """Liveness probe — returns {"status": "ok"}. Exposed at both /health and
    /api/v1/health (the latter is the path documented in the deploy guide)."""
    return {"status": "ok"}


@app.get("/", tags=["health"])
async def root() -> dict:
    """Friendly root banner so the bare domain doesn't look broken (404).

    Real functionality lives under /api/v1/* (see /docs)."""
    return {"status": "ok", "service": "solo-copilot", "docs": "/docs"}
