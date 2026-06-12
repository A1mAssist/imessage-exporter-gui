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

Push-Location $Root
try {
    $VerifyArgs = @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $Root "scripts\verify.ps1"), "-Native")
    if ($SkipAudit) {
        $VerifyArgs += "-SkipAudit"
    }

    Invoke-Checked "Native verification and bundle" {
        & powershell @VerifyArgs
    }

    $BundleRoot = Join-Path $Root "src-tauri\target\release\bundle"
    $Installers = @(
        Get-ChildItem -Path (Join-Path $BundleRoot "nsis") -Filter "*.exe" -File -ErrorAction SilentlyContinue
        Get-ChildItem -Path (Join-Path $BundleRoot "msi") -Filter "*.msi" -File -ErrorAction SilentlyContinue
    ) | Where-Object { $_ }

    if (-not $Installers -or $Installers.Count -eq 0) {
        throw "No Windows installers were found under $BundleRoot."
    }

    Invoke-Checked "Collect installers" {
        New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null
        Get-ChildItem -Path $OutputPath -File -ErrorAction SilentlyContinue | Remove-Item -Force

        foreach ($Installer in $Installers) {
            Copy-Item -LiteralPath $Installer.FullName -Destination $OutputPath -Force
            Write-Host ("Copied {0}" -f $Installer.Name)
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
    Write-Host "Windows installers are ready:"
    Get-ChildItem -Path $OutputPath -File | Sort-Object Name | ForEach-Object {
        Write-Host ("  {0}" -f $_.FullName)
    }
}
finally {
    Pop-Location
}
