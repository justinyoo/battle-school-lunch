$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv가 필요합니다."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "Node.js와 npm이 필요합니다."
}

Write-Host "Running frontend tests..."
Push-Location (Join-Path $root "src\frontend")
try {
    & npm.cmd test -- --run
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

Write-Host "Running backend tests..."
Push-Location (Join-Path $root "src\backend")
try {
    & uv run --extra dev pytest
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

Write-Host "Running MCP tests..."
Push-Location (Join-Path $root "src\mcp")
try {
    & uv run --extra dev pytest
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

Write-Host "Running E2E tests..."
& npm.cmd --prefix (Join-Path $root "src\e2e") test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "All tests passed."
