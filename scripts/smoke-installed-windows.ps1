param(
    [string]$BundleRoot = "",
    [string]$InstallerPath = "",
    [int]$LaunchSeconds = 8
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-CargoTargetDir {
    if ($env:CARGO_TARGET_DIR) {
        if ([System.IO.Path]::IsPathRooted($env:CARGO_TARGET_DIR)) {
            return [System.IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)
        }
        return [System.IO.Path]::GetFullPath((Join-Path $Root $env:CARGO_TARGET_DIR))
    }

    return Join-Path $Root "src-tauri\target"
}

function Get-TauriConfig {
    Get-Content -LiteralPath (Join-Path $Root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
}

function Get-ArtifactPrefix {
    $TauriConfig = Get-TauriConfig
    return "$($TauriConfig.productName)_$($TauriConfig.version)"
}

function Get-ProductName {
    return (Get-TauriConfig).productName
}

function Get-PackageName {
    return (Get-Content -LiteralPath (Join-Path $Root "package.json") -Raw | ConvertFrom-Json).name
}

function Find-InstalledExecutable {
    param(
        [Parameter(Mandatory = $true)][string]$InstallDir,
        [Parameter(Mandatory = $true)][string]$ProductName
    )

    $PackageName = Get-PackageName
    $SlugName = "$($ProductName -replace '\s+', '-')".ToLowerInvariant()
    $CandidateNames = @("$ProductName.exe", "$PackageName.exe", "$SlugName.exe") | Sort-Object -Unique

    foreach ($CandidateName in $CandidateNames) {
        $Candidate = Get-ChildItem -LiteralPath $InstallDir -Filter $CandidateName -File -Recurse -ErrorAction SilentlyContinue |
            Sort-Object FullName |
            Select-Object -First 1
        if ($Candidate) {
            return $Candidate
        }
    }

    $Executables = @(Get-ChildItem -LiteralPath $InstallDir -Filter "*.exe" -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne "uninstall.exe" } |
        Sort-Object FullName)
    if ($Executables.Count -eq 1) {
        return $Executables[0]
    }

    $Found = if ($Executables.Count) { ($Executables | Select-Object -ExpandProperty Name) -join ", " } else { "none" }
    throw "Installed executable was not found in $InstallDir. Found executable(s): $Found."
}

function Resolve-InstallerPath {
    if ($InstallerPath) {
        $Resolved = Resolve-Path -LiteralPath $InstallerPath
        return $Resolved.Path
    }

    if (-not $BundleRoot) {
        $BundleRoot = Join-Path (Get-CargoTargetDir) "release\bundle"
    }

    $Prefix = Get-ArtifactPrefix
    $Candidate = Get-ChildItem -Path (Join-Path $BundleRoot "nsis") -Filter "*.exe" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name.StartsWith($Prefix, [System.StringComparison]::OrdinalIgnoreCase) } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1

    if (-not $Candidate) {
        throw "No NSIS installer for $Prefix was found under $BundleRoot."
    }

    return $Candidate.FullName
}

function Invoke-Process {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [switch]$AllowNonZeroExit
    )

    $Process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -Wait -PassThru -WindowStyle Hidden
    if (-not $AllowNonZeroExit -and $Process.ExitCode -ne 0) {
        throw "$FilePath exited with code $($Process.ExitCode)."
    }
}

if ($env:OS -ne "Windows_NT") {
    Write-Host "Installed-artifact smoke test is only applicable on Windows; skipped."
    exit 0
}

$Installer = Resolve-InstallerPath
$ProductName = Get-ProductName
$InstallDir = Join-Path ([System.IO.Path]::GetTempPath()) ("imessage-exporter-gui-smoke-{0}" -f $PID)
$StartedProcess = $null

Write-Host "Smoke testing installed artifact:"
Write-Host "  Installer: $Installer"
Write-Host "  Install directory: $InstallDir"

try {
    if (Test-Path -LiteralPath $InstallDir) {
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

    Invoke-Process -FilePath $Installer -ArgumentList @("/S", "/D=$InstallDir")

    $AppExe = Find-InstalledExecutable -InstallDir $InstallDir -ProductName $ProductName

    $VersionInfo = (Get-Item -LiteralPath $AppExe.FullName).VersionInfo
    if ($VersionInfo.ProductName -and $VersionInfo.ProductName -notlike "*$ProductName*") {
        throw "Installed executable metadata product name looked unexpected: $($VersionInfo.ProductName)"
    }

    $StartedProcess = Start-Process -FilePath $AppExe.FullName -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds $LaunchSeconds
    $StartedProcess.Refresh()
    if ($StartedProcess.HasExited) {
        throw "Installed executable exited during the smoke window with code $($StartedProcess.ExitCode)."
    }

    Write-Host "Installed executable launched successfully: $($AppExe.FullName)"
}
finally {
    if ($StartedProcess -and -not $StartedProcess.HasExited) {
        Stop-Process -Id $StartedProcess.Id -Force -ErrorAction SilentlyContinue
    }

    $Uninstaller = Get-ChildItem -LiteralPath $InstallDir -Filter "uninstall.exe" -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName |
        Select-Object -First 1
    if ($Uninstaller) {
        Invoke-Process -FilePath $Uninstaller.FullName -ArgumentList @("/S") -AllowNonZeroExit
    }

    if (Test-Path -LiteralPath $InstallDir) {
        Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
