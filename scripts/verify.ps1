param(
    [switch]$Native,
    [switch]$SkipAudit
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ToolState = Join-Path $Root ".tools"
New-Item -ItemType Directory -Force -Path $ToolState | Out-Null
$env:npm_config_cache = Join-Path $ToolState "npm-cache"

function Resolve-LocalTool {
    param(
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($Name -eq "node" -or $Name -eq "npm") {
        $NodeHome = Get-ChildItem (Join-Path $Root ".tools") -Directory -Filter "node-v*-win-x64" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($NodeHome) {
            $Tool = Join-Path $NodeHome.FullName ($(if ($Name -eq "npm") { "npm.cmd" } else { "node.exe" }))
            if (Test-Path $Tool) {
                return $Tool
            }
        }
    }

    if ($Name -eq "npm") {
        $NpmCmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
        if ($NpmCmd) {
            return $NpmCmd.Source
        }
    }

    if ($Name -eq "cargo" -or $Name -eq "rustc") {
        $LocalTool = Join-Path $Root ".tools\cargo\bin\$Name.exe"
        if (Test-Path $LocalTool) {
            return $LocalTool
        }
    }

    $Command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($Command) {
        return $Command.Source
    }

    throw "$Name was not found. Run scripts\doctor.ps1 for setup details."
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Host ""
    Write-Host "== $Name =="
    $global:LASTEXITCODE = 0
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

function Invoke-NodeScript {
    param(
        [Parameter(Mandatory = $true)][string]$Script,
        [string[]]$Args = @()
    )

    & $Node (Join-Path $Root $Script) @Args
}

function Get-TauriBuildArgs {
    if ($env:TAURI_SIGNING_PRIVATE_KEY) {
        return @("build")
    }

    Write-Host "TAURI_SIGNING_PRIVATE_KEY is not set; building local unsigned installers."
    return @("build", "--", "--no-sign")
}

$Node = Resolve-LocalTool "node"
$Npm = Resolve-LocalTool "npm"
$Cargo = Resolve-LocalTool "cargo"

$NodeDir = Split-Path -Parent $Node
if ($env:PATH -notlike "*$NodeDir*") {
    $env:PATH = "$NodeDir;$env:PATH"
}

$LocalCargo = Join-Path $Root ".tools\cargo"
$LocalRustup = Join-Path $Root ".tools\rustup"
if (Test-Path $LocalCargo) {
    $env:CARGO_HOME = $LocalCargo
}
if (Test-Path $LocalRustup) {
    $env:RUSTUP_HOME = $LocalRustup
}

Push-Location $Root
try {
    Invoke-Step "Static checks" { Invoke-NodeScript "scripts\sanity-check.mjs" }
    Invoke-Step "TypeScript build" {
        Invoke-NodeScript "node_modules\typescript\bin\tsc"
        if ($LASTEXITCODE -ne 0) { return }
        Invoke-NodeScript "node_modules\vite\bin\vite.js" @("build", "--configLoader", "runner")
    }
    Invoke-Step "Unit tests" { Invoke-NodeScript "node_modules\vitest\vitest.mjs" @("run", "--configLoader", "runner") }
    if ($SkipAudit) {
        Write-Host ""
        Write-Host "== Dependency audit =="
        Write-Host "Skipped by -SkipAudit. Run npm audit --audit-level=moderate when network access is available."
    }
    else {
        Invoke-Step "Dependency audit" { & $Npm audit --audit-level=moderate }
    }
    Invoke-Step "Mock UI smoke" {
        $OldPort = $env:MOCK_UI_PORT
        $env:MOCK_UI_PORT = if ($OldPort) { $OldPort } else { "1422" }
        try {
            Invoke-NodeScript "scripts\smoke-mock-ui.mjs"
        }
        finally {
            $env:MOCK_UI_PORT = $OldPort
        }
    }
    Invoke-Step "Rust format" {
        Push-Location (Join-Path $Root "src-tauri")
        try {
            & $Cargo fmt --check
        }
        finally {
            Pop-Location
        }
    }
    Invoke-Step "Rust metadata" {
        Push-Location (Join-Path $Root "src-tauri")
        try {
            $MetadataOut = Join-Path $ToolState "cargo-metadata.out"
            $MetadataErr = Join-Path $ToolState "cargo-metadata.err"
            if (Test-Path $MetadataOut) { Remove-Item -LiteralPath $MetadataOut -Force }
            if (Test-Path $MetadataErr) { Remove-Item -LiteralPath $MetadataErr -Force }
            $PreviousErrorActionPreference = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            try {
                & $Cargo metadata --no-deps --format-version=1 > $MetadataOut 2> $MetadataErr
                $ExitCode = $LASTEXITCODE
            }
            finally {
                $ErrorActionPreference = $PreviousErrorActionPreference
            }
            if ($ExitCode -ne 0) {
                Get-Content $MetadataOut -ErrorAction SilentlyContinue
                Get-Content $MetadataErr -ErrorAction SilentlyContinue
            }
            $global:LASTEXITCODE = $ExitCode
        }
        finally {
            Pop-Location
        }
    }
    if ($Native) {
        Invoke-Step "Rust tests" {
            Push-Location (Join-Path $Root "src-tauri")
            try {
                & $Cargo test
            }
            finally {
                Pop-Location
            }
        }
        Invoke-Step "Rust check" {
            Push-Location (Join-Path $Root "src-tauri")
            try {
                & $Cargo check
            }
            finally {
                Pop-Location
            }
        }
        Invoke-Step "Tauri bundle" { & $Npm run tauri @(Get-TauriBuildArgs) }
    }
    else {
        Invoke-Step "Native environment doctor" { & powershell -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\doctor.ps1") }
        Write-Host ""
        Write-Host "Native build was skipped. Re-run with -Native after MSVC Build Tools and Windows SDK libs are ready."
    }

    Write-Host ""
    Write-Host "Verification complete."
}
finally {
    Pop-Location
}
