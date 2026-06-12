param(
    [string]$Version = "4.1.0",
    [string]$Target = "x86_64-pc-windows-msvc"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$binDir = Join-Path $root "src-tauri\binaries"
$installRoot = Join-Path $root ".sidecar"
$cargoHome = Join-Path $installRoot "cargo"
$sourceExe = Join-Path $cargoHome "bin\imessage-exporter.exe"
$targetExe = Join-Path $binDir "imessage-exporter-$Target.exe"

function Resolve-Cargo {
    $LocalCargo = Join-Path $root ".tools\cargo\bin\cargo.exe"
    if (Test-Path $LocalCargo) {
        return $LocalCargo
    }

    $Command = Get-Command cargo -ErrorAction SilentlyContinue
    if ($Command) {
        return $Command.Source
    }

    throw "Cargo is required to build the imessage-exporter sidecar. Run scripts\setup-windows.ps1 -Install or install Rust stable first."
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

if ($Target -like "*windows-msvc") {
    if (-not (Get-Command link -ErrorAction SilentlyContinue)) {
        throw "MSVC link.exe was not found. Install Visual Studio Build Tools 2022 with the C++ workload, restart PowerShell, then re-run this script."
    }
    if (-not (Test-WindowsSdkLibs)) {
        throw "Windows SDK libraries were not found. Install the Visual Studio C++ workload with recommended components so kernel32.lib is available."
    }
}

$cargo = Resolve-Cargo

New-Item -ItemType Directory -Force -Path $binDir, $cargoHome | Out-Null

Write-Host "Installing imessage-exporter $Version from crates.io..."
$env:CARGO_HOME = $cargoHome
$LocalRustup = Join-Path $root ".tools\rustup"
if (Test-Path $LocalRustup) {
    $env:RUSTUP_HOME = $LocalRustup
}
& $cargo install imessage-exporter --version $Version --locked --force --target $Target

if (-not (Test-Path $sourceExe)) {
    throw "cargo install completed but $sourceExe was not found."
}

Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force
Write-Host "Sidecar copied to $targetExe"
& $targetExe --version
