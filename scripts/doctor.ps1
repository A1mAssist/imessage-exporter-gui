$ErrorActionPreference = "Continue"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Sidecar = Join-Path $Root "src-tauri\binaries\imessage-exporter-x86_64-pc-windows-msvc.exe"
$MissingRequired = New-Object System.Collections.Generic.List[string]
$MissingOptional = New-Object System.Collections.Generic.List[string]

function Resolve-Tool {
    param([string]$Name)

    if ($Name -eq "node" -or $Name -eq "npm") {
        $NodeHome = Get-ChildItem (Join-Path $Root ".tools") -Directory -Filter "node-v*-win-x64" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($NodeHome) {
            $Exe = Join-Path $NodeHome.FullName ($(if ($Name -eq "npm") { "npm.cmd" } else { "node.exe" }))
            if (Test-Path $Exe) {
                return $Exe
            }
        }
    }

    if ($Name -eq "npm") {
        $NpmCmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
        if ($NpmCmd) {
            return $NpmCmd.Source
        }
    }

    $Command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($Command) {
        return $Command.Source
    }

    if ($Name -eq "cargo" -or $Name -eq "rustc") {
        $Exe = Join-Path $Root ".tools\cargo\bin\$Name.exe"
        if (Test-Path $Exe) {
            return $Exe
        }
    }

    return $null
}

function Test-Tool {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string[]]$Args = @("--version"),
        [switch]$Required
    )

    $Command = Resolve-Tool -Name $Name
    if (-not $Command) {
        $Level = if ($Required) { "MISSING" } else { "optional" }
        Write-Host ("[{0}] {1} not found" -f $Level, $Name)
        if ($Required) {
            $script:MissingRequired.Add($Name)
        }
        else {
            $script:MissingOptional.Add($Name)
        }
        return
    }

    try {
        $OldCargoHome = $env:CARGO_HOME
        $OldRustupHome = $env:RUSTUP_HOME
        if ($Command -like (Join-Path $Root ".tools*")) {
            $env:CARGO_HOME = Join-Path $Root ".tools\cargo"
            $env:RUSTUP_HOME = Join-Path $Root ".tools\rustup"
        }

        $Output = & $Command @Args 2>&1
        $ExitCode = $LASTEXITCODE
        $Version = $Output | Where-Object { $_ -match "^\s*$Name\b" -or $_ -match "\b$Name\s+\d" } | Select-Object -First 1
        if (-not $Version) {
            $Version = $Output | Where-Object { $_ -notmatch "^\s*warn:" } | Select-Object -First 1
        }
        if (-not $Version) {
            $Version = $Output | Select-Object -First 1
        }
        if ($ExitCode -ne 0) {
            throw ($Output -join "`n")
        }
        Write-Host ("[ok] {0}: {1}" -f $Name, $Version)
    }
    catch {
        Write-Host ("[warn] {0} found at {1}, but version check failed: {2}" -f $Name, $Command, $_.Exception.Message)
    }
    finally {
        $env:CARGO_HOME = $OldCargoHome
        $env:RUSTUP_HOME = $OldRustupHome
    }
}

function Test-WindowsSdkLibs {
    $Candidates = @(
        "C:\Program Files (x86)\Windows Kits\10\Lib\*\um\x64\kernel32.lib",
        "C:\Program Files\Windows Kits\10\Lib\*\um\x64\kernel32.lib"
    )

    foreach ($Candidate in $Candidates) {
        $Match = Get-ChildItem $Candidate -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
        if ($Match) {
            Write-Host ("[ok] Windows SDK libs: {0}" -f $Match.FullName)
            return
        }
    }

    Write-Host "[MISSING] Windows SDK libs: kernel32.lib was not found"
    $script:MissingRequired.Add("Windows SDK libs")
}

Write-Host "iMessage Exporter GUI doctor"
Write-Host ("Project: {0}" -f $Root)
Write-Host ""

Test-Tool -Name "node" -Required
Test-Tool -Name "npm" -Required
Test-Tool -Name "cargo" -Required
Test-Tool -Name "rustc" -Required
Test-Tool -Name "link" -Args @("/?") -Required
Test-WindowsSdkLibs
Test-Tool -Name "ffmpeg"
Test-Tool -Name "magick"

Write-Host ""
if (Test-Path $Sidecar) {
    Write-Host ("[ok] sidecar: {0}" -f $Sidecar)
    try {
        & $Sidecar --version
    }
    catch {
        Write-Host ("[warn] sidecar exists but failed to run: {0}" -f $_.Exception.Message)
    }
}
else {
    Write-Host ("[MISSING] sidecar: {0}" -f $Sidecar)
    Write-Host "          Run .\scripts\build-sidecar.ps1 after installing Rust."
    $MissingRequired.Add("imessage-exporter sidecar")
}

Write-Host ""
Write-Host "Static checks:"
$Node = Resolve-Tool -Name "node"
if ($Node) {
    & $Node (Join-Path $Root "scripts\sanity-check.mjs")
}
else {
    Write-Host "[skip] node is required for scripts\sanity-check.mjs"
}

Write-Host ""
Write-Host "Next steps:"
if ($MissingRequired.Count -eq 0) {
    Write-Host "  Native prerequisites look ready."
    Write-Host "  1. .\scripts\build-sidecar.ps1"
    Write-Host "  2. .\scripts\verify.ps1 -Native"
    Write-Host "  3. npm run tauri build"
}
else {
    $UniqueMissing = $MissingRequired | Select-Object -Unique
    Write-Host ("  Missing required item(s): {0}" -f ($UniqueMissing -join ", "))
    if ($UniqueMissing -contains "link" -or $UniqueMissing -contains "Windows SDK libs") {
        Write-Host "  Install Visual Studio Build Tools 2022 with the C++ workload and recommended Windows SDK components:"
        Write-Host "    .\scripts\setup-windows.ps1 -Install"
        Write-Host "  Then restart PowerShell so link.exe and kernel32.lib are visible."
    }
    if ($UniqueMissing -contains "imessage-exporter sidecar") {
        Write-Host "  After the native toolchain is ready, build the pinned sidecar:"
        Write-Host "    .\scripts\build-sidecar.ps1"
    }
    Write-Host "  Re-check and package:"
    Write-Host "    .\scripts\doctor.ps1"
    Write-Host "    .\scripts\verify.ps1 -Native"
    Write-Host "    npm run tauri build"
}

if ($MissingOptional.Count -gt 0) {
    $UniqueOptional = $MissingOptional | Select-Object -Unique
    Write-Host ("  Optional converter(s) missing: {0}" -f ($UniqueOptional -join ", "))
    Write-Host "  Install them only if you need basic/full attachment conversion:"
    Write-Host "    .\scripts\setup-windows.ps1 -Install -InstallOptionalTools"
}
