param(
    [string]$Version = "4.1.0",
    [string]$Target = ""
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$binDir = Join-Path (Join-Path $root "src-tauri") "binaries"
$installRoot = Join-Path $root ".sidecar"
$cargoHome = Join-Path $installRoot "cargo"

function Resolve-Cargo {
    $CargoFile = if ($IsWindows -or $env:OS -eq "Windows_NT") { "cargo.exe" } else { "cargo" }
    $LocalCargo = Join-Path (Join-Path (Join-Path $root ".tools") "cargo") (Join-Path "bin" $CargoFile)
    if (Test-Path $LocalCargo) {
        return $LocalCargo
    }

    $Command = Get-Command cargo -ErrorAction SilentlyContinue
    if ($Command) {
        return $Command.Source
    }

    throw "Cargo is required to build the imessage-exporter sidecar. Run scripts\setup-windows.ps1 -Install or install Rust stable first."
}

function Resolve-RustTarget {
    param(
        [Parameter(Mandatory = $true)][string]$Cargo
    )

    if ($Target) {
        return $Target
    }

    $VersionOutput = & $Cargo -vV
    foreach ($Line in $VersionOutput) {
        if ($Line -match "^host:\s+(.+)$") {
            return $Matches[1]
        }
    }

    throw "Could not determine the Rust host target from cargo -vV. Pass -Target explicitly."
}

function Get-CargoBinaryName {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedTarget
    )

    if ($ResolvedTarget -like "*windows*") {
        return "imessage-exporter.exe"
    }
    return "imessage-exporter"
}

function Get-SidecarFileName {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedTarget
    )

    $Extension = if ($ResolvedTarget -like "*windows*") { ".exe" } else { "" }
    return "imessage-exporter-$ResolvedTarget$Extension"
}

function Test-WindowsSdkLibs {
    $Candidates = @(
        "C:\Program Files (x86)\Windows Kits\10\Lib\*\um\x64\kernel32.lib",
        "C:\Program Files\Windows Kits\10\Lib\*\um\x64\kernel32.lib"
    )

    foreach ($Candidate in $Candidates) {
        if (Get-ChildItem $Candidate -ErrorAction SilentlyContinue | Select-Object -First 1) {
            return $true
        }
    }

    return $false
}

$cargo = Resolve-Cargo
$ResolvedTarget = Resolve-RustTarget -Cargo $cargo
$sourceExe = Join-Path (Join-Path $cargoHome "bin") (Get-CargoBinaryName -ResolvedTarget $ResolvedTarget)
$targetExe = Join-Path $binDir (Get-SidecarFileName -ResolvedTarget $ResolvedTarget)

if ($ResolvedTarget -like "*windows-msvc") {
    if (-not (Get-Command link -ErrorAction SilentlyContinue)) {
        throw "MSVC link.exe was not found. Install Visual Studio Build Tools 2022 with the C++ workload, restart PowerShell, then re-run this script."
    }
    if (-not (Test-WindowsSdkLibs)) {
        throw "Windows SDK libraries were not found. Install the Visual Studio C++ workload with recommended components so kernel32.lib is available."
    }
}

New-Item -ItemType Directory -Force -Path $binDir, $cargoHome | Out-Null

Write-Host "Installing imessage-exporter $Version for $ResolvedTarget from crates.io..."
$env:CARGO_HOME = $cargoHome
$LocalRustup = Join-Path (Join-Path $root ".tools") "rustup"
if (Test-Path $LocalRustup) {
    $env:RUSTUP_HOME = $LocalRustup
}
& $cargo install imessage-exporter --version $Version --locked --force --target $ResolvedTarget

if (-not (Test-Path $sourceExe)) {
    throw "cargo install completed but $sourceExe was not found."
}

Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force
Write-Host "Sidecar copied to $targetExe"
& $targetExe --version
