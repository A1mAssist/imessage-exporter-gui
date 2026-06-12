param(
    [string]$BrowserPath = "",
    [string]$DesktopSize = "1440,1000",
    [string]$CompactSize = "1100,850"
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Preview = Join-Path $Root "preview\index.html"
$DesktopOut = Join-Path $Root "preview\preview-desktop.png"
$CompactOut = Join-Path $Root "preview\preview-compact.png"

function Find-Node {
    $Node = Get-Command node -ErrorAction SilentlyContinue
    if ($Node) {
        return $Node.Source
    }

    $Tools = Join-Path $Root ".tools"
    if (Test-Path $Tools) {
        $Portable = Get-ChildItem $Tools -Directory -Filter "node-v*-win-x64" | Select-Object -First 1
        if ($Portable) {
            $NodeExe = Join-Path $Portable.FullName "node.exe"
            if (Test-Path $NodeExe) {
                return $NodeExe
            }
        }
    }

    return $null
}

$NodeExe = Find-Node
$NodeRenderer = Join-Path $Root "scripts\render-preview.mjs"
$PlaywrightCore = Join-Path $Root "node_modules\playwright-core"
if ($NodeExe -and (Test-Path $NodeRenderer) -and (Test-Path $PlaywrightCore)) {
    & $NodeExe $NodeRenderer
    exit $LASTEXITCODE
}

function Find-Browsers {
    if ($BrowserPath -and (Test-Path $BrowserPath)) {
        return @($BrowserPath)
    }

    $Candidates = @(
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )

    $Found = @()
    foreach ($Candidate in $Candidates) {
        if (Test-Path $Candidate) {
            $Found += $Candidate
        }
    }

    if ($Found.Count -eq 0) {
        throw "Chrome or Edge was not found. Pass -BrowserPath to a Chromium-compatible browser."
    }

    return $Found
}

function Render-Shot {
    param(
        [string]$Browser,
        [string]$Size,
        [string]$Output
    )

    $Uri = (New-Object System.Uri($Preview)).AbsoluteUri
    $TempOutput = "$Output.tmp.png"
    if (Test-Path $TempOutput) {
        Remove-Item -LiteralPath $TempOutput -Force
    }

    $Args = @(
        "--headless",
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=$Size",
        "--screenshot=$TempOutput",
        $Uri
    )

    Write-Host "Rendering $Output at $Size with $Browser..."
    & $Browser @Args | Out-Null

    if (-not (Test-Path $TempOutput)) {
        throw "Screenshot was not created: $Output"
    }

    Move-Item -LiteralPath $TempOutput -Destination $Output -Force
}

$Browsers = Find-Browsers
$LastError = $null
foreach ($Browser in $Browsers) {
    try {
        Render-Shot -Browser $Browser -Size $DesktopSize -Output $DesktopOut
        Render-Shot -Browser $Browser -Size $CompactSize -Output $CompactOut
        $LastError = $null
        break
    }
    catch {
        $LastError = $_
        Write-Host ("[warn] Browser failed: {0}" -f $_.Exception.Message)
    }
}

if ($LastError) {
    throw $LastError
}

Write-Host "Preview screenshots updated."
