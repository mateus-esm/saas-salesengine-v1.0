#!/usr/bin/env bash
# ==============================================================================
# G7 — Deploy Smoke Test
# Verifica se o agente está no ar, saudável, e executando um sync real.
#
# Uso:
#   chmod +x scripts/smoke-test.sh
#   ./scripts/smoke-test.sh                        # teste seco (health only)
#   ./scripts/smoke-test.sh "<SUPABASE_JWT>"       + teste de sync autenticado
#   ./scripts/smoke-test.sh "<JWT>" <lead_id> <pipeline_id>   + sync num lead específico
# ==============================================================================

BASE_URL="${BASE_URL:-https://agent.soloventures.com.br}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
PASS=0
FAIL=0

check() {
  local label="$1" status="$2"
  if [ "$status" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} $label"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "=========================================="
echo "  G7 — Smoke Test: agent.soloventures.com.br"
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "=========================================="
echo ""

# ── 1. Health check ───────────────────────────────────────────────────────────
echo "1) Health endpoint"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/health")
if [ "$HEALTH" = "200" ]; then
  BODY=$(curl -s "$BASE_URL/api/v1/health")
  echo "   HTTP $HEALTH — $BODY"
  STATUS=0
else
  echo "   HTTP $HEALTH (expected 200)"
  STATUS=1
fi
check "GET /api/v1/health → $HEALTH" "$STATUS"

echo ""

# ── 2. Health — fallback /health ──────────────────────────────────────────────
echo "2) Health endpoint (legacy /health)"
H2=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
check "GET /health → $H2" $([ "$H2" = "200" ] && echo 0 || echo 1)

echo ""

# ── 3. OpenAPI schema ─────────────────────────────────────────────────────────
echo "3) OpenAPI schema"
OA=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/openapi.json")
check "GET /openapi.json → $OA" $([ "$OA" = "200" ] && echo 0 || echo 1)

echo ""

# ── 4. Sync (authenticated) ───────────────────────────────────────────────────
JWT="${1:-}"
LEAD_ID="${2:-}"
PIPELINE_ID="${3:-}"

if [ -n "$JWT" ]; then
  echo "4) Sync endpoint (autenticado)"

  # Monta payload
  if [ -n "$LEAD_ID" ]; then
    PAYLOAD=$(cat <<JSON
{
  "lead_id": "$LEAD_ID",
  "pipeline_id": $([ -n "$PIPELINE_ID" ] && echo "\"$PIPELINE_ID\"" || echo "null"),
  "opportunity_id": null
}
JSON
)
  else
    # Pega o primeiro lead disponível via Supabase REST (opcional — fallback se falhar)
    echo "   (sem lead_id — sync será testado com o botão na UI)"
    echo "   Para testar via curl, forneça: ./smoke-test.sh \"<JWT>\" <lead_id> <pipeline_id>"
    echo "   ${YELLOW}SKIP — teste manual via UI${NC}"
    echo ""
    echo "5) Shape preview (sem auth — esperado 403)"
    SP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/shape/preview" \
      -H "Content-Type: application/json" \
      -d '{"prompt":"teste"}')
    check "POST /api/v1/shape/preview → $SP (401/403 esperado sem JWT)" $([ "$SP" = "401" ] || [ "$SP" = "403" ] && echo 0 || echo 1)

    echo ""
    echo "6) Ingest sem token interno (esperado 503 ou 401)"
    ING=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/ingest")
    check "POST /api/v1/ingest → $ING (503 esperado)" $([ "$ING" = "503" ] || [ "$ING" = "401" ] && echo 0 || echo 1)

    echo ""
    echo "══════════════════════════════════════════════"
    echo -e "${YELLOW}Para testar o Sync real via curl:${NC}"
    echo "  1. Copie um JWT do dashboard (abre o devtools → Application → Session Storage → supabase-auth → access_token)"
    echo "  2. Execute:"
    echo "     ./scripts/smoke-test.sh \"<access_token>\" \"<lead_uuid>\" \"<pipeline_uuid>\""
    echo ""
    echo -e "Ou use o botão ${GREEN}⚡ Sync com Copilot${NC} na UI de um deal."
    echo "══════════════════════════════════════════════"
    exit 0
  fi

  SYNC_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/sync" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT" \
    -d "$PAYLOAD")

  if [ "$SYNC_HTTP" = "200" ]; then
    SYNC_BODY=$(curl -s -X POST "$BASE_URL/api/v1/sync" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $JWT" \
      -d "$PAYLOAD")
    echo "   HTTP $SYNC_HTTP — $(echo "$SYNC_BODY" | head -c 200)"
    STATUS=0
  else
    echo "   HTTP $SYNC_HTTP (expected 200)"
    STATUS=1
  fi
  check "POST /api/v1/sync (autenticado) → $SYNC_HTTP" "$STATUS"

  echo ""

  # ── 5. Shape preview ──────────────────────────────────────────────────────
  echo "5) Shape preview (autenticado)"
  SHAPE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/shape/preview" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT" \
    -d '{"prompt":"Eu preciso capturar proprietários de imóveis na planta em Florianópolis, descobrir o número de dormitórios e o valor do condomínio, agendar uma vistoria técnica presencial com no máximo 24 horas de prazo, e depois enviar o contrato padrão."}')
  check "POST /api/v1/shape/preview → $SHAPE" $([ "$SHAPE" = "200" ] && echo 0 || echo 1)

  echo ""

  # ── 6. Shape apply sem blueprint (422 esperado) ────────────────────────────
  echo "6) Shape apply — payload inválido (esperado 422)"
  SA=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/shape/apply" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT" \
    -d '{"bad":"data"}')
  check "POST /api/v1/shape/apply (invalido) → $SA (422 esperado)" $([ "$SA" = "422" ] && echo 0 || echo 1)

  echo ""
  echo "══════════════════════════════════════════════"
  echo "  Resultados: $PASS passed, $FAIL failed"
  echo "══════════════════════════════════════════════"
fi
