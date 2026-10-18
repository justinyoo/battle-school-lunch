$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv가 필요합니다. https://docs.astral.sh/uv/getting-started/installation/ 를 참고하세요."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Node.js와 npm이 필요합니다."
}

$backendDir = Join-Path $root "src\backend"
$mcpDir = Join-Path $root "src\mcp"

function Stop-ProcessTree([int]$rootId) {
    $ids = [System.Collections.Generic.List[int]]::new()
    $queue = [System.Collections.Generic.Queue[int]]::new()
    $queue.Enqueue($rootId)

    while ($queue.Count -gt 0) {
        $parentId = $queue.Dequeue()
        if ($ids.Contains($parentId)) {
            continue
        }
        $ids.Add($parentId)
        $children = @(Get-CimInstance Win32_Process `
            -Filter "ParentProcessId = $parentId" `
            -ErrorAction SilentlyContinue)
        foreach ($child in $children) {
            $queue.Enqueue([int]$child.ProcessId)
        }
    }

    foreach ($id in ($ids | Sort-Object -Descending)) {
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    }
}

$backend = Start-Process `
    -FilePath "uv" `
    -ArgumentList "run --project src/backend python -m uvicorn app.main:app --app-dir src/backend --host 127.0.0.1 --port 8000" `
    -WorkingDirectory $root `
    -PassThru

$devui = Start-Process `
    -FilePath "uv" `
    -ArgumentList "run --project `"$backendDir`" --extra dev python -c `"from app.main import run_devui; run_devui()`"" `
    -WorkingDirectory $root `
    -PassThru

$mcp = Start-Process `
    -FilePath "uv" `
    -ArgumentList "run --project `"$mcpDir`" --extra dev python -m school_lunch_mcp.server" `
    -WorkingDirectory $root `
    -Environment @{ MCP_TRANSPORT = "streamable-http" } `
    -PassThru

try {
    Write-Host "Backend: http://localhost:8000"
    Write-Host "MCP: http://localhost:8001/mcp"
    Write-Host "DevUI: http://localhost:8080"
    Write-Host "Frontend: http://localhost:5173"
    Write-Host "Press Ctrl+C to stop all apps."
    & npm --prefix (Join-Path $root "src\frontend") run dev -- --host 127.0.0.1
}
finally {
    foreach ($process in @($backend, $devui, $mcp)) {
        if ($process) {
            Stop-ProcessTree $process.Id
        }
    }
}
