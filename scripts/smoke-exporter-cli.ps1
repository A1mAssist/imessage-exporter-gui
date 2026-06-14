param(
    [string]$ExporterPath = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Resolve-ExporterPath {
    if ($ExporterPath) {
        return (Resolve-Path -LiteralPath $ExporterPath).Path
    }

    if ($env:IMESSAGE_EXPORTER_PATH) {
        return (Resolve-Path -LiteralPath $env:IMESSAGE_EXPORTER_PATH).Path
    }

    $Command = Get-Command "imessage-exporter" -ErrorAction SilentlyContinue
    if ($Command) {
        return $Command.Source
    }

    $Downloads = Join-Path $env:USERPROFILE "Downloads"
    $Candidate = Get-ChildItem -LiteralPath $Downloads -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^imessage-exporter.*\.exe$' } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($Candidate) {
        return $Candidate.FullName
    }

    return ""
}

function Resolve-Cargo {
    $LocalCargo = Join-Path $Root ".tools\cargo\bin\cargo.exe"
    if (Test-Path $LocalCargo) {
        return $LocalCargo
    }

    $Command = Get-Command "cargo" -ErrorAction SilentlyContinue
    if ($Command) {
        return $Command.Source
    }

    throw "cargo was not found. Run scripts\doctor.ps1 for setup details."
}

$Exporter = Resolve-ExporterPath
if (-not $Exporter) {
    Write-Host "No local imessage-exporter executable was found; real CLI compatibility smoke skipped."
    Write-Host "Set IMESSAGE_EXPORTER_PATH or pass -ExporterPath to enable this check."
    exit 0
}

$Cargo = Resolve-Cargo
$OldSmokePath = $env:IMESSAGE_EXPORTER_REAL_SMOKE_PATH
$env:IMESSAGE_EXPORTER_REAL_SMOKE_PATH = $Exporter

Push-Location (Join-Path $Root "src-tauri")
try {
    & $Cargo test real_exporter_accepts_gui_generated_command_matrix -- --nocapture
    if ($LASTEXITCODE -ne 0) {
        throw "Real imessage-exporter CLI compatibility smoke failed with exit code $LASTEXITCODE"
    }
}
finally {
    if ($null -eq $OldSmokePath) {
        Remove-Item Env:\IMESSAGE_EXPORTER_REAL_SMOKE_PATH -ErrorAction SilentlyContinue
    }
    else {
        $env:IMESSAGE_EXPORTER_REAL_SMOKE_PATH = $OldSmokePath
    }
    Pop-Location
}
