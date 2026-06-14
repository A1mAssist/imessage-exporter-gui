param(
    [switch]$SkipAudit,
    [string]$OutputDir = "dist-installers"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
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

function Get-CargoTargetDir {
    if ($env:CARGO_TARGET_DIR) {
        if ([System.IO.Path]::IsPathRooted($env:CARGO_TARGET_DIR)) {
            return [System.IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)
        }
        return [System.IO.Path]::GetFullPath((Join-Path $Root $env:CARGO_TARGET_DIR))
    }

    return Join-Path $Root "src-tauri\target"
}

function Get-ArtifactPrefix {
    $TauriConfig = Get-Content -LiteralPath (Join-Path $Root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
    return "$($TauriConfig.productName)_$($TauriConfig.version)"
}

function Get-CurrentWindowsArtifacts {
    param(
        [Parameter(Mandatory = $true)][string]$BundleRoot
    )

    $Prefix = Get-ArtifactPrefix
    @(
        Get-ChildItem -Path (Join-Path $BundleRoot "nsis") -Filter "*.exe" -File -ErrorAction SilentlyContinue
        Get-ChildItem -Path (Join-Path $BundleRoot "nsis") -Filter "*.zip" -File -ErrorAction SilentlyContinue
        Get-ChildItem -Path (Join-Path $BundleRoot "nsis") -Filter "*.sig" -File -ErrorAction SilentlyContinue
        Get-ChildItem -Path (Join-Path $BundleRoot "msi") -Filter "*.msi" -File -ErrorAction SilentlyContinue
        Get-ChildItem -Path (Join-Path $BundleRoot "msi") -Filter "*.zip" -File -ErrorAction SilentlyContinue
        Get-ChildItem -Path (Join-Path $BundleRoot "msi") -Filter "*.sig" -File -ErrorAction SilentlyContinue
        Get-ChildItem -Path (Join-Path $BundleRoot "updater") -File -ErrorAction SilentlyContinue
        Get-ChildItem -Path (Join-Path $BundleRoot "latest.json") -File -ErrorAction SilentlyContinue
    ) | Where-Object {
        $_ -and ($_.Name.StartsWith($Prefix, [System.StringComparison]::OrdinalIgnoreCase) -or $_.Name -eq "latest.json")
    }
}

Push-Location $Root
try {
    $VerifyArgs = @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $Root "scripts\verify.ps1"), "-Native")
    if ($SkipAudit) {
        $VerifyArgs += "-SkipAudit"
    }

    Invoke-Checked "Native verification and bundle" {
        & powershell @VerifyArgs
    }

    $BundleRoot = Join-Path (Get-CargoTargetDir) "release\bundle"
    $Artifacts = @(Get-CurrentWindowsArtifacts -BundleRoot $BundleRoot)

    if (-not $Artifacts -or $Artifacts.Count -eq 0) {
        throw "No Windows artifacts for $(Get-ArtifactPrefix) were found under $BundleRoot."
    }

    Invoke-Checked "Installed artifact smoke test" {
        powershell -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\smoke-installed-windows.ps1") -BundleRoot $BundleRoot
    }

    Invoke-Checked "Collect installers" {
        New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null
        Get-ChildItem -Path $OutputPath -File -ErrorAction SilentlyContinue | Remove-Item -Force

        foreach ($Artifact in $Artifacts) {
            Copy-Item -LiteralPath $Artifact.FullName -Destination $OutputPath -Force
            Write-Host ("Copied {0}" -f $Artifact.Name)
        }

        $CopiedSignature = Get-ChildItem -Path $OutputPath -Filter "*.sig" -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($CopiedSignature) {
            powershell -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\create-updater-manifest.ps1") -ArtifactsDir $OutputDir
        }
        else {
            Write-Host "No updater signatures were produced; latest.json generation skipped for this local unsigned build."
        }

        $ChecksumPath = Join-Path $OutputPath "SHA256SUMS.txt"
        Get-ChildItem -Path $OutputPath -File |
            Where-Object { $_.Name -ne "SHA256SUMS.txt" } |
            Sort-Object Name |
            ForEach-Object {
                $Hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
                "{0}  {1}" -f $Hash.Hash.ToLowerInvariant(), $_.Name
            } |
            Set-Content -LiteralPath $ChecksumPath -Encoding UTF8
    }

    Write-Host ""
    Write-Host "Windows artifacts are ready:"
    Get-ChildItem -Path $OutputPath -File | Sort-Object Name | ForEach-Object {
        Write-Host ("  {0}" -f $_.FullName)
    }
}
finally {
    Pop-Location
}
