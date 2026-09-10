param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("install", "build", "typecheck", "lint", "test", "test:governance", "verify", "harness:layout", "harness:check", "harness:workflow", "verify:harness")]
    [string]$Command
)

$ErrorActionPreference = "Stop"

function Invoke-Step([string]$Label, [scriptblock]$Body) {
    Write-Host "==> $Label"
    & $Body
    if ($LASTEXITCODE -ne 0) {
        Write-Error "$Label failed (exit $LASTEXITCODE)."
    }
}

switch ($Command) {
    "install" {
        Invoke-Step "npm install" {
            if (Test-Path ./package-lock.json) {
                npm ci
            } else {
                npm install
            }
        }
    }
    "build" { Invoke-Step "build" { npm run build } }
    "typecheck" { Invoke-Step "typecheck" { npm run typecheck } }
    "lint" { Invoke-Step "lint" { npm run lint } }
    "test" { Invoke-Step "test" { npm run test } }
    "test:governance" { Invoke-Step "governance tests" { npm run test:governance } }
    "verify" { Invoke-Step "verify" { npm run verify } }
    "harness:layout" { Invoke-Step "harness layout guard" { npm run harness:layout } }
    "harness:check" { Invoke-Step "harness traceability check" { npm run harness:check } }
    "harness:workflow" { Invoke-Step "harness workflow check" { npm run harness:workflow } }
    "verify:harness" { Invoke-Step "verify harness" { ./scripts/verify-harness.ps1 } }
}

Write-Host "dev $Command passed."
