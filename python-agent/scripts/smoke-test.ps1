<#
.SYNOPSIS
  G7 — Deploy Smoke Test (PowerShell para Windows)
.DESCRIPTION
  Verifica se o agente está no ar, saudável, e opcionalmente executa um sync real.
.PARAMETER Jwt
  Supabase access_token JWT para testar endpoints autenticados.
.PARAMETER LeadId
  UUID do lead para o sync (opcional, requer Jwt).
.PARAMETER PipelineId
  UUID do pipeline (opcional, requer Jwt e LeadId).
.EXAMPLE
  .\smoke-test.ps1
  .\smoke-test.ps1 -Jwt "eyJ..." -LeadId "abc-123" -PipelineId "def-456"
#>

param(
  [string]$Jwt = "",
  [string]$LeadId = "",
  [string]$PipelineId = ""
)

$BaseUrl = "https://agent.soloventures.com.br"
$Pass = 0
$Fail = 0

function Check($label, $ok) {
  if ($ok) {
    Write-Host "  [PASS] $label" -ForegroundColor Green
    $script:Pass++
  } else {
    Write-Host "  [FAIL] $label" -ForegroundColor Red
    $script:Fail++
  }
}

function HttpStatus($url, $method = "GET", $headers = @{}, $body = $null) {
  try {
    $params = @{ Uri = $url; Method = $method; Headers = $headers }
    if ($body) { $params.Body = $body; $params.ContentType = "application/json" }
    $resp = Invoke-WebRequest @params -UseBasicParsing -SkipHttpErrorCheck
    return $resp.StatusCode, ($resp.Content -replace "`n"," " -replace "`r","")
  } catch {
    return 0, "exception"
  }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  G7 — Smoke Test: agent.soloventures.com.br"
Write-Host "  $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Health check ───────────────────────────────────────────────────────────
Write-Host "1) Health endpoint" -ForegroundColor Yellow
$code, $body = HttpStatus "$BaseUrl/api/v1/health"
Write-Host "   HTTP $code — $body"
Check "GET /api/v1/health → $code" ($code -eq 200)
Write-Host ""

# ── 2. Health legacy ──────────────────────────────────────────────────────────
Write-Host "2) Health endpoint (legacy /health)" -ForegroundColor Yellow
$code, $_ = HttpStatus "$BaseUrl/health"
Check "GET /health → $code" ($code -eq 200)
Write-Host ""

# ── 3. OpenAPI schema ─────────────────────────────────────────────────────────
Write-Host "3) OpenAPI schema" -ForegroundColor Yellow
$code, $_ = HttpStatus "$BaseUrl/openapi.json"
Check "GET /openapi.json → $code" ($code -eq 200)
Write-Host ""

# ── 4. Sync test ──────────────────────────────────────────────────────────────
if ($Jwt -ne "" -and $LeadId -ne "") {
  Write-Host "4) Sync endpoint (autenticado)" -ForegroundColor Yellow
  $payload = @{ lead_id = $LeadId; pipeline_id = $null; opportunity_id = $null } | ConvertTo-Json
  if ($PipelineId -ne "") { $payload = @{ lead_id = $LeadId; pipeline_id = $PipelineId; opportunity_id = $null } | ConvertTo-Json }

  $code, $body = HttpStatus "$BaseUrl/api/v1/sync" "POST" @{ Authorization = "Bearer $Jwt" } $payload
  Write-Host "   HTTP $code — $(if ($body) { $body.Substring(0, [Math]::Min(200, $body.Length)) } else { 'empty' })"
  Check "POST /api/v1/sync → $code" ($code -eq 200)

  Write-Host ""

  # ── 5. Shape preview ──────────────────────────────────────────────────────
  Write-Host "5) Shape preview (autenticado)" -ForegroundColor Yellow
  $shapeBody = '{"prompt":"Eu preciso capturar proprietários de imóveis na planta em Florianópolis, descobrir o número de dormitórios e o valor do condomínio, agendar uma vistoria técnica presencial com no máximo 24 horas de prazo, e depois enviar o contrato padrão."}'
  $code, $_ = HttpStatus "$BaseUrl/api/v1/shape/preview" "POST" @{ Authorization = "Bearer $Jwt" } $shapeBody
  Check "POST /api/v1/shape/preview → $code" ($code -eq 200)

  Write-Host ""

  # ── 6. Shape apply inválido ───────────────────────────────────────────────
  Write-Host "6) Shape apply — payload inválido (esperado 422)" -ForegroundColor Yellow
  $code, $_ = HttpStatus "$BaseUrl/api/v1/shape/apply" "POST" @{ Authorization = "Bearer $Jwt" } '{"bad":"data"}'
  Check "POST /api/v1/shape/apply → $code (422 esperado)" ($code -eq 422)

  Write-Host ""
  Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
  Write-Host "  Resultados: $Pass passed, $Fail failed" -ForegroundColor $(if ($Fail -eq 0) { "Green" } else { "Red" })
  Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan

} elseif ($Jwt -ne "") {
  Write-Host "4) Sync — forneça também um LeadId:" -ForegroundColor Yellow
  Write-Host "   .\smoke-test.ps1 -Jwt `"<token>`" -LeadId `<lead_uuid>`"
  Write-Host ""

  # ── 5. Shape sem auth ─────────────────────────────────────────────────────
  Write-Host "5) Shape preview sem auth (esperado 401/403)" -ForegroundColor Yellow
  $code, $_ = HttpStatus "$BaseUrl/api/v1/shape/preview" "POST" @{} '{"prompt":"teste"}'
  Check "POST /api/v1/shape/preview → $code (401/403 esperado)" (($code -eq 401) -or ($code -eq 403))

  Write-Host ""

  # ── 6. Ingest sem token ───────────────────────────────────────────────────
  Write-Host "6) Ingest sem token interno (esperado 503/401)" -ForegroundColor Yellow
  $code, $_ = HttpStatus "$BaseUrl/api/v1/ingest" "POST"
  Check "POST /api/v1/ingest → $code (503 esperado)" (($code -eq 503) -or ($code -eq 401))

  Write-Host ""
  Write-Host "══════════════════════════════════════════════" -ForegroundColor Yellow
  Write-Host "  Teste seco concluído. Para testar Sync real:"
  Write-Host "  1. Abra o dashboard → DevTools → Application → Session Storage"
  Write-Host "     → supabase-auth → access_token"
  Write-Host "  2. Descubra o lead_id e pipeline_id desejados"
  Write-Host "  3. Execute:"
  Write-Host "     .\smoke-test.ps1 -Jwt `"<access_token>`" -LeadId `<lead_uuid>`" -PipelineId `<pipeline_uuid>`"
  Write-Host "══════════════════════════════════════════════" -ForegroundColor Yellow
} else {
  Write-Host "4) Sync — ignorado (sem JWT)" -ForegroundColor Yellow
  Write-Host "   Para testar o sync real, extraia um JWT do navegador:"
  Write-Host "   DevTools → Application → Session Storage → supabase-auth → access_token"
  Write-Host ""

  Write-Host "5) Shape preview sem auth (esperado 401/403)" -ForegroundColor Yellow
  $code, $_ = HttpStatus "$BaseUrl/api/v1/shape/preview" "POST" @{} '{"prompt":"teste"}'
  Check "POST /api/v1/shape/preview → $code (401/403 esperado)" (($code -eq 401) -or ($code -eq 403))

  Write-Host ""

  Write-Host "══════════════════════════════════════════════" -ForegroundColor Yellow
  Write-Host "  Teste seco concluído. $Pass passed, $Fail failed"
  Write-Host "══════════════════════════════════════════════" -ForegroundColor Yellow
}
