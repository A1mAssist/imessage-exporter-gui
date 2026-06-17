param(
    [switch]$Install,
    [switch]$InstallOptionalTools
)

$ErrorActionPreference = "Stop"

function Has-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WithWinget {
    param(
        [string]$Id,
        [string]$Name
    )

    if (-not (Has-Command "winget")) {
        throw "winget was not found. Install prerequisites manually, then run scripts\doctor.ps1."
    }

    Write-Host "Installing $Name with winget..."
    winget install --id $Id --exact --silent --accept-package-agreements --accept-source-agreements
}

function Install-BuildTools {
    if (-not (Has-Command "winget")) {
        throw "winget was not found. Install Visual Studio Build Tools manually, then run scripts\doctor.ps1."
    }

    Write-Host "Installing Visual Studio Build Tools 2022 with the C++ workload..."
    winget install `
        --id Microsoft.VisualStudio.2022.BuildTools `
        --exact `
        --silent `
        --accept-package-agreements `
        --accept-source-agreements `
        --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
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

function Test-WebView2Runtime {
    $Keys = @(
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    )

    foreach ($Key in $Keys) {
        if (Test-Path $Key) {
            return $true
        }
    }

    return $false
}

Write-Host "iMessage Exporter GUI Windows setup"
Write-Host ""

if (-not $Install) {
    Write-Host "Dry run only. Re-run with -Install to install missing prerequisites via winget."
    Write-Host "Add -InstallOptionalTools to include ffmpeg and ImageMagick."
    Write-Host ""
}

if (Has-Command "node") {
    node --version
}
elseif ($Install) {
    Install-WithWinget -Id "OpenJS.NodeJS.LTS" -Name "Node.js LTS"
}
else {
    Write-Host "[missing] Node.js LTS"
}

if (Has-Command "cargo") {
    cargo --version
}
elseif ($Install) {
    Install-WithWinget -Id "Rustlang.Rustup" -Name "Rustup"
}
else {
    Write-Host "[missing] Rust/Cargo"
}

if (Has-Command "link") {
    link /? | Select-Object -First 1
}
elseif ($Install) {
    Install-BuildTools
}
else {
    Write-Host "[missing] MSVC linker / Visual Studio Build Tools C++ workload"
    Write-Host "          Install with: winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --silent --override `"--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended`""
}

if (Test-WindowsSdkLibs) {
    Write-Host "[ok] Windows SDK libraries found"
}
else {
    Write-Host "[missing] Windows SDK libraries such as kernel32.lib"
    Write-Host "          The Visual Studio C++ workload with recommended components normally installs these."
}

if (Test-WebView2Runtime) {
    Write-Host "[ok] WebView2 Runtime found"
}
elseif ($Install) {
    Install-WithWinget -Id "Microsoft.EdgeWebView2Runtime" -Name "Microsoft Edge WebView2 Runtime"
}
else {
    Write-Host "[missing] Microsoft Edge WebView2 Runtime"
}

if (Has-Command "ffmpeg") {
    ffmpeg -version | Select-Object -First 1
}
elseif ($InstallOptionalTools) {
    Install-WithWinget -Id "Gyan.FFmpeg" -Name "ffmpeg"
}
else {
    Write-Host "[optional] ffmpeg is not installed."
}

if (Has-Command "magick") {
    magick -version | Select-Object -First 1
}
elseif ($InstallOptionalTools) {
    Install-WithWinget -Id "ImageMagick.ImageMagick" -Name "ImageMagick"
}
else {
    Write-Host "[optional] ImageMagick is not installed."
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Restart the terminal if Node, Rust, or Build Tools were installed."
Write-Host "  2. npm install"
Write-Host "  3. .\scripts\verify.ps1 -Native"
Write-Host "  4. npm run tauri dev"
Write-Host "  5. imessage-exporter is built into the app; install optional converters only if you need basic/full attachment conversion."
