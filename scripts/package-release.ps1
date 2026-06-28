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
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Prefix,
        [string[]]$ExactNames = @()
    )

    if ($null -eq $Artifacts) {
        throw "Artifact collection target cannot be null."
    }

    Get-ChildItem -Path $Pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
        $MatchesPrefix = $_.Name.StartsWith($Prefix, [System.StringComparison]::OrdinalIgnoreCase)
        $MatchesExactName = $ExactNames -contains $_.Name
        if ($MatchesPrefix -or $MatchesExactName) {
            [void]$Artifacts.Add($_)
        }
    }
}

function Get-CargoTargetDir {
    if ($env:CARGO_TARGET_DIR) {
        if ([System.IO.Path]::IsPathRooted($env:CARGO_TARGET_DIR)) {
            return [System.IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)
        }
        return [System.IO.Path]::GetFullPath((Join-Path $Root $env:CARGO_TARGET_DIR))
    }

    return Join-Path $Root "src-tauri/target"
}

function Get-ArtifactPrefix {
    $TauriConfig = Get-Content -LiteralPath (Join-Path $Root "src-tauri/tauri.conf.json") -Raw | ConvertFrom-Json
    return "$($TauriConfig.productName)_$($TauriConfig.version)"
}

function Get-PublicArtifactName {
    param(
        [Parameter(Mandatory = $true)][string]$Name
    )

    return $Name.Replace(" ", ".")
}

function Get-BundleRoot {
    return Join-Path (Get-CargoTargetDir) "release/bundle"
}

function Find-ReleaseArtifacts {
    $BundleRoot = Get-BundleRoot
    $Prefix = Get-ArtifactPrefix
    $Artifacts = [System.Collections.Generic.List[object]]::new()

    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "nsis/*.exe") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "nsis/*.zip") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "nsis/*.sig") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "msi/*.msi") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "msi/*.zip") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "msi/*.sig") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "dmg/*.dmg") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "dmg/*.tar.gz") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "dmg/*.zip") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "dmg/*.sig") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "macos/*.tar.gz") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "macos/*.sig") $Prefix
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "updater/*") $Prefix @("latest.json")
    Add-ArtifactsFromPattern $Artifacts (Join-Path $BundleRoot "latest.json") $Prefix @("latest.json")

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

    $RequestedTargets = $ResolvedBundleTarget.ToLowerInvariant().Split(",") | ForEach-Object { $_.Trim() }
    if (($env:OS -eq "Windows_NT") -and ($RequestedTargets -contains "nsis")) {
        Invoke-Checked "Installed artifact smoke test" {
            powershell -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\smoke-installed-windows.ps1") -BundleRoot (Get-BundleRoot)
        }
    }

    $Artifacts = Find-ReleaseArtifacts
    if (-not $Artifacts -or $Artifacts.Count -eq 0) {
        throw "No release artifacts for $(Get-ArtifactPrefix) were found under $(Get-BundleRoot)."
    }

    Invoke-Checked "Collect release artifacts" {
        New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null
        Get-ChildItem -Path $OutputPath -File -ErrorAction SilentlyContinue | Remove-Item -Force

        foreach ($Artifact in $Artifacts) {
            $PublicName = Get-PublicArtifactName $Artifact.Name
            Copy-Item -LiteralPath $Artifact.FullName -Destination (Join-Path $OutputPath $PublicName) -Force
            Write-Host ("Copied {0} as {1}" -f $Artifact.Name, $PublicName)
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
