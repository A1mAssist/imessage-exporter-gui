param(
    [string]$ArtifactsDir = "dist-release",
    [string]$OutputPath = "",
    [string]$Repository = "A1mAssist/imessage-exporter-gui",
    [string]$Tag = ""
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-TauriConfig {
    Get-Content -LiteralPath (Join-Path $Root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
}

function Get-ReleaseAssetUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Name
    )

    $EscapedName = [System.Uri]::EscapeDataString($Name)
    if ($Tag) {
        $EscapedTag = [System.Uri]::EscapeDataString($Tag)
        return "https://github.com/$Repository/releases/download/$EscapedTag/$EscapedName"
    }

    return "https://github.com/$Repository/releases/latest/download/$EscapedName"
}

function Get-ArchFromName {
    param(
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($Name -match "(?i)(?:_|-)(x64|x86_64)(?:_|-|\.|$)") {
        return "x86_64"
    }
    if ($Name -match "(?i)(?:_|-)(arm64|aarch64)(?:_|-|\.|$)") {
        return "aarch64"
    }
    if ($Name -match "(?i)(?:_|-)(x86|i686)(?:_|-|\.|$)") {
        return "i686"
    }

    return "x86_64"
}

function Get-UpdaterTargets {
    param(
        [Parameter(Mandatory = $true)][System.IO.FileInfo]$Artifact
    )

    $Name = $Artifact.Name
    $Arch = Get-ArchFromName $Name
    if ($Name.EndsWith("-setup.exe", [System.StringComparison]::OrdinalIgnoreCase)) {
        return @("windows-$Arch-nsis", "windows-$Arch")
    }
    if ($Name.EndsWith(".msi", [System.StringComparison]::OrdinalIgnoreCase)) {
        return @("windows-$Arch-msi")
    }
    if ($Name.EndsWith(".app.tar.gz", [System.StringComparison]::OrdinalIgnoreCase) -or $Name.EndsWith(".tar.gz", [System.StringComparison]::OrdinalIgnoreCase)) {
        return @("darwin-$Arch-app", "darwin-$Arch")
    }

    return @()
}

$ArtifactsPath = (Resolve-Path -LiteralPath (Join-Path $Root $ArtifactsDir)).Path
if (-not $OutputPath) {
    $OutputPath = Join-Path $ArtifactsPath "latest.json"
}
elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $Root $OutputPath
}

$Config = Get-TauriConfig
$Platforms = [ordered]@{}
$SignatureFiles = Get-ChildItem -LiteralPath $ArtifactsPath -Filter "*.sig" -File -ErrorAction SilentlyContinue | Sort-Object Name

foreach ($SignatureFile in $SignatureFiles) {
    $ArtifactName = $SignatureFile.Name.Substring(0, $SignatureFile.Name.Length - 4)
    $Artifact = Get-Item -LiteralPath (Join-Path $ArtifactsPath $ArtifactName) -ErrorAction SilentlyContinue
    if (-not $Artifact) {
        Write-Warning "Skipping $($SignatureFile.Name); matching artifact $ArtifactName was not found."
        continue
    }

    $Targets = Get-UpdaterTargets $Artifact
    if (-not $Targets -or $Targets.Count -eq 0) {
        Write-Warning "Skipping $ArtifactName; updater target could not be inferred."
        continue
    }

    $Platform = [ordered]@{
        signature = (Get-Content -LiteralPath $SignatureFile.FullName -Raw).Trim()
        url = Get-ReleaseAssetUrl $Artifact.Name
    }

    foreach ($Target in $Targets) {
        if (-not $Platforms.Contains($Target)) {
            $Platforms[$Target] = $Platform
        }
    }
}

if ($Platforms.Count -eq 0) {
    throw "No updater artifacts with matching .sig files were found in $ArtifactsPath."
}

$Manifest = [ordered]@{
    version = $Config.version
    notes = "iMessage Exporter GUI $($Config.version)"
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = $Platforms
}

$Manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Host "Updater manifest written to $OutputPath"
