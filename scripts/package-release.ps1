param(
    [string]$OutputDir = "dist-release",
    [string]$BundleTarget = "",
    [switch]$SkipAudit
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutputPath = Join-Path $Root $OutputDir

function Invoke-Checked {
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

function Invoke-InDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Push-Location $Path
    try {
        & $Command
    }
    finally {
        Pop-Location
    }
}

function Resolve-BundleTarget {
    if ($BundleTarget) {
        return $BundleTarget
    }
    if ($IsWindows -or $env:OS -eq "Windows_NT") {
        return "nsis,msi"
    }
    if ($IsMacOS) {
        return "dmg"
    }
    throw "Release packaging is only supported on Windows and macOS."
}

function Assert-SupportedBundleTarget {
    param(
        [Parameter(Mandatory = $true)][string]$Target
    )

    $UnsupportedTargets = @("deb", "appimage", "app", "rpm")
    foreach ($UnsupportedTarget in $UnsupportedTargets) {
        if ($Target.ToLowerInvariant().Split(",") -contains $UnsupportedTarget) {
            throw "Unsupported bundle target '$UnsupportedTarget'. Release packaging is only supported on Windows and macOS."
        }
    }
}

function Add-ArtifactsFromPattern {
    param(
        [System.Collections.Generic.List[object]]$Artifacts,
        [Parameter(Mandatory = $true)][string]$Pattern
    )

    if ($null -eq $Artifacts) {
        throw "Artifact collection target cannot be null."
    }

    Get-ChildItem -Path $Pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
        [void]$Artifacts.Add($_)
    }
}

function Find-ReleaseArtifacts {
    $BundleRoot = Join-Path $Root "src-tauri/target/release/bundle"
    $Artifacts = [System.Collections.Generic.List[object]]::new()

    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "nsis/*.exe")
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "msi/*.msi")
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "dmg/*.dmg")

    return $Artifacts | Sort-Object FullName -Unique
}

function Get-ChecksumFileName {
    $Leaf = Split-Path -Leaf $OutputPath
    if ($Leaf -match "^dist-release-(.+)$") {
        return "SHA256SUMS-$($Matches[1]).txt"
    }
    return "SHA256SUMS.txt"
}

$ResolvedBundleTarget = Resolve-BundleTarget
Assert-SupportedBundleTarget $ResolvedBundleTarget

Push-Location $Root
try {
    Invoke-Checked "Install frontend dependencies" { npm ci }
    Invoke-Checked "Static checks" { npm run check:static }
    if ($SkipAudit) {
        Write-Host ""
        Write-Host "== Dependency audit =="
        Write-Host "Skipped by -SkipAudit."
    }
    else {
        Invoke-Checked "Dependency audit" { npm audit --audit-level=moderate }
    }
    Invoke-Checked "Frontend tests" { npm test }
    Invoke-Checked "Frontend production build" { npm run build }
    Invoke-Checked "Rust format" {
        Invoke-InDirectory (Join-Path $Root "src-tauri") { cargo fmt --check }
    }

    Invoke-Checked "Rust tests" {
        Invoke-InDirectory (Join-Path $Root "src-tauri") { cargo test }
    }
    Invoke-Checked "Build Tauri bundle ($ResolvedBundleTarget)" { npm run tauri build -- --bundles $ResolvedBundleTarget }

    $Artifacts = Find-ReleaseArtifacts
    if (-not $Artifacts -or $Artifacts.Count -eq 0) {
        throw "No release artifacts were found under src-tauri/target/release/bundle."
    }

    Invoke-Checked "Collect release artifacts" {
        New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null
        Get-ChildItem -Path $OutputPath -File -ErrorAction SilentlyContinue | Remove-Item -Force

        foreach ($Artifact in $Artifacts) {
            Copy-Item -LiteralPath $Artifact.FullName -Destination $OutputPath -Force
            Write-Host ("Copied {0}" -f $Artifact.Name)
        }

        $ChecksumPath = Join-Path $OutputPath (Get-ChecksumFileName)
        Get-ChildItem -Path $OutputPath -File |
            Where-Object { $_.Name -notlike "SHA256SUMS*.txt" } |
            Sort-Object Name |
            ForEach-Object {
                $Hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
                "{0}  {1}" -f $Hash.Hash.ToLowerInvariant(), $_.Name
            } |
            Set-Content -LiteralPath $ChecksumPath -Encoding UTF8
    }

    Write-Host ""
    Write-Host "Release artifacts are ready:"
    Get-ChildItem -Path $OutputPath -File | Sort-Object Name | ForEach-Object {
        Write-Host ("  {0}" -f $_.FullName)
    }
}
finally {
    Pop-Location
}
