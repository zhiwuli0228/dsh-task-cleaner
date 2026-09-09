$ErrorActionPreference = "Stop"

function Invoke-GovernanceStep([string]$Label, [scriptblock]$Body) {
    Write-Host "==> $Label"
    & $Body
    if ($LASTEXITCODE -ne 0) {
        [Console]::Error.Write("Harness stage failed: $Label (exit $LASTEXITCODE).`n")
        exit 1
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot
try {
    Invoke-GovernanceStep "build runtime" { npm run build }
    Invoke-GovernanceStep "build web" { npm run build:web }
    Invoke-GovernanceStep "build governance CLI" { npm run build:governance }
    Invoke-GovernanceStep "workflow-checker" { node ./dist/tools/governance/cli.js workflow --root $repoRoot }
    Invoke-GovernanceStep "governance unit tests" { npm run test:governance }
    Invoke-GovernanceStep "traceability/accepted-document check" { node ./dist/tools/governance/cli.js check --root $repoRoot }
    Invoke-GovernanceStep "typecheck" { npm run typecheck }
    Invoke-GovernanceStep "lint" { npm run lint }
    Invoke-GovernanceStep "test" { npm run test }
} finally {
    Pop-Location
}

Write-Host "Closed-loop Harness verification passed."
