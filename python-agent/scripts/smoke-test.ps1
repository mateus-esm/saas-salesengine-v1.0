<#
.SYNOPSIS
  G7 - Deploy Smoke Test (PowerShell for Windows)
.DESCRIPTION
  Verifica se o agente esta no ar, saudavel, e opcionalmente executa um sync real.
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

# Ensure TLS 1.2+ and ignore cert validation (smoke test only)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
[Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

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
    $params = @{ Uri = $url; Method = $method; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 15 }
    if ($body) { $params.Body = $body; $params.ContentType = "application/json" }
    $resp = Invoke-WebRequest @params
    return $resp.StatusCode, ($resp.Content -replace "`n"," " -replace "`r","")
  } catch [System.Net.WebException] {
    $statusCode = [int]$_.Exception.Response.StatusCode
    if ($statusCode -gt 0) { return $statusCode, $_.Exception.Message }
    return 0, $_.Exception.Message
  } catch {
    return 0, $_.Exception.Message
  }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  G7 - Smoke Test: $BaseUrl"
Write-Host "  $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')) UTC"
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Health check -----------------------------------------------------------
Write-Host "1) Health endpoint" -ForegroundColor Yellow
$code, $body = HttpStatus "$BaseUrl/api/v1/health"
Write-Host "   HTTP $code - $(if ($body) { $body } else { 'empty' })"
Check "GET /api/v1/health -> $code" ($code -eq 200)
Write-Host ""

# -- 2. Health legacy ----------------------------------------------------------
Write-Host "2) Health endpoint (legacy /health)" -ForegroundColor Yellow
$code, $_ = HttpStatus "$BaseUrl/health"
Check "GET /health -> $code" ($code -eq 200)
Write-Host ""

# -- 3. OpenAPI schema ---------------------------------------------------------
Write-Host "3) OpenAPI schema" -ForegroundColor Yellow
$code, $_ = HttpStatus "$BaseUrl/openapi.json"
Check "GET /openapi.json -> $code" ($code -eq 200)
Write-Host ""

# -- 4. Shape preview sem auth (esperado 401/403) ------------------------------
Write-Host "4) Shape preview sem auth (esperado 401/403)" -ForegroundColor Yellow
$code, $_ = HttpStatus "$BaseUrl/api/v1/shape/preview" "POST" @{} '{"prompt":"teste"}'
Check "POST /api/v1/shape/preview -> $code (401/403 esperado)" (($code -eq 401) -or ($code -eq 403))
Write-Host ""

# -- 5. Ingest sem token (esperado 503) ----------------------------------------
Write-Host "5) Ingest sem token interno (esperado 503)" -ForegroundColor Yellow
$code, $_ = HttpStatus "$BaseUrl/api/v1/ingest" "POST"
Check "POST /api/v1/ingest -> $code (503 esperado)" (($code -eq 503) -or ($code -eq 401))
Write-Host ""

# -- 6. Sync test (so com JWT) -------------------------------------------------
if ($Jwt -ne "" -and $LeadId -ne "") {
  Write-Host "6) Sync endpoint (autenticado)" -ForegroundColor Yellow
  $payload = @{ lead_id = $LeadId; pipeline_id = $null; opportunity_id = $null } | ConvertTo-Json
  if ($PipelineId -ne "") {
    $payload = @{ lead_id = $LeadId; pipeline_id = $PipelineId; opportunity_id = $null } | ConvertTo-Json
  }

  $code, $body = HttpStatus "$BaseUrl/api/v1/sync" "POST" @{ Authorization = "Bearer $Jwt" } $payload
  Write-Host "   HTTP $code - $(if ($body) { $body.Substring(0, [Math]::Min(200, $body.Length)) } else { 'empty' })"
  Check "POST /api/v1/sync -> $code" ($code -eq 200)

  Write-Host ""

  # -- 7. Shape preview autenticado -------------------------------------------
  Write-Host "7) Shape preview (autenticado)" -ForegroundColor Yellow
  $shapePrompt = '{"prompt":"Crie um pipeline para capturar proprietarios de imoveis na planta, com estagios de qualificacao, vistoria e contrato."}'
  $code, $_ = HttpStatus "$BaseUrl/api/v1/shape/preview" "POST" @{ Authorization = "Bearer $Jwt" } $shapePrompt
  Check "POST /api/v1/shape/preview autenticado -> $code" ($code -eq 200)

  Write-Host ""

  # -- 8. Shape apply invalido (422) ------------------------------------------
  Write-Host "8) Shape apply - payload invalido (esperado 422)" -ForegroundColor Yellow
  $code, $_ = HttpStatus "$BaseUrl/api/v1/shape/apply" "POST" @{ Authorization = "Bearer $Jwt" } '{"bad":"data"}'
  Check "POST /api/v1/shape/apply -> $code (422 esperado)" ($code -eq 422)
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Resultados: $Pass passed, $Fail failed" -ForegroundColor $(if ($Fail -eq 0) { "Green" } else { "Red" })
Write-Host "==========================================" -ForegroundColor Cyan

if ($Jwt -eq "" -or $LeadId -eq "") {
  Write-Host ""
  Write-Host "Para testar o Sync real:" -ForegroundColor Yellow
  Write-Host "  1. Abra o dashboard, DevTools -> Application -> Session Storage" -ForegroundColor Yellow
  Write-Host "     -> supabase-auth -> access_token (copie o JWT)" -ForegroundColor Yellow
  Write-Host "  2. Descubra um lead_id pela URL de um deal" -ForegroundColor Yellow
  Write-Host "  3. Execute:" -ForegroundColor Yellow
  Write-Host "     .\smoke-test.ps1 -Jwt '<access_token>' -LeadId '<lead_uuid>' -PipelineId '<pipeline_uuid>'" -ForegroundColor Yellow
}
