param(
    [switch]$BoQuaOBS,
    [switch]$ThemDocTikTok,
    [switch]$ThemGiongNgoaiTuyen,
    [switch]$BoQuaGiongOnline
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$hadFailure = $false

function Resolve-Python {
    $choices = @()
    if ($env:LocalAppData) { $choices += "$env:LocalAppData\Programs\Python\Python312\python.exe" }
    if ($env:ProgramFiles) { $choices += "$env:ProgramFiles\Python312\python.exe" }
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        try {
            $candidate = & $launcher.Source -3.12 -c 'import sys; print(sys.executable)' 2>$null
            if ($LASTEXITCODE -eq 0) { $choices += $candidate }
        } catch { }
    }
    $command = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($command -and $command.Source -notmatch '[\\/]WindowsApps[\\/]') { $choices += $command.Source }
    foreach ($candidate in $choices) {
        if (!$candidate -or !(Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try {
            & $candidate -c 'import sys; raise SystemExit(not (sys.version_info >= (3, 10)))' 2>$null
            if ($LASTEXITCODE -eq 0) { return $candidate }
        } catch { }
    }
}

function Install-WingetPackage {
    param([string]$Package)
    if (!(Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        throw 'WinGet is missing. Read BAT-DAU.txt for the official manual downloads.'
    }
    & winget.exe install --id $Package --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "WinGet could not finish installing $Package (exit $LASTEXITCODE)." }
}

$venv = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
try {
    $usable = $false
    if (Test-Path -LiteralPath $venv -PathType Leaf) {
        try {
            & $venv -c 'import sys; raise SystemExit(not (sys.version_info >= (3, 10)))' 2>$null
            $usable = ($LASTEXITCODE -eq 0)
        } catch { }
    }
    if (!$usable) {
        $python = Resolve-Python
        if (!$python) {
            Write-Host 'Installing Python 3.12...'
            Install-WingetPackage 'Python.Python.3.12'
            $python = Resolve-Python
        }
        if (!$python) { throw 'Python was not found. Reopen the setup or install it from python.org.' }
        & $python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the local Python environment.' }
    }
    if (!$BoQuaGiongOnline) {
        & $venv -m pip install --disable-pip-version-check -r requirements-voice.txt
        if ($LASTEXITCODE -ne 0) { throw 'Could not install the online voice. Use -BoQuaGiongOnline -ThemGiongNgoaiTuyen for offline speech.' }
    }
    if ($ThemDocTikTok) {
        & $venv -m pip install --disable-pip-version-check -r requirements-tiktok.txt
        if ($LASTEXITCODE -ne 0) { throw 'Could not install the optional TikTokLive dependency.' }
    }
    & $venv app.py --check
    if ($LASTEXITCODE -ne 0) { throw 'Check the first channel profile in profiles\kenh-1.json.' }
} catch {
    Write-Warning $_.Exception.Message
    $hadFailure = $true
}

if ($ThemGiongNgoaiTuyen) {
    try {
        if (!(Test-Path -LiteralPath $venv -PathType Leaf)) { throw 'Install Python first.' }
        & $venv -c 'from giong_noi import find_espeak; raise SystemExit(0 if find_espeak() else 1)'
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'Installing eSpeak NG offline Vietnamese speech...'
            Install-WingetPackage 'eSpeak-NG.eSpeak-NG'
            & $venv -c 'from giong_noi import find_espeak; raise SystemExit(0 if find_espeak() else 1)'
            if ($LASTEXITCODE -ne 0) { throw 'eSpeak NG was not detected. See BAT-DAU.txt for ESPEAK_NG_EXE.' }
        } else {
            Write-Host 'eSpeak NG found.'
        }
    } catch {
        Write-Warning $_.Exception.Message
        $hadFailure = $true
    }
}

if (!$BoQuaOBS) {
    try {
        $obs = Get-Command obs64.exe -ErrorAction SilentlyContinue
        $defaultObs = Join-Path $env:ProgramFiles 'obs-studio\bin\64bit\obs64.exe'
        if (!$obs -and !(Test-Path -LiteralPath $defaultObs -PathType Leaf)) {
            Write-Host 'Installing OBS Studio...'
            Install-WingetPackage 'OBSProject.OBSStudio'
        } else {
            Write-Host 'OBS Studio found.'
        }
    } catch {
        Write-Warning $_.Exception.Message
        $hadFailure = $true
    }
}

if ($hadFailure) { exit 1 }
Write-Host 'Ready. Open 03-CHAY-KENH-1.bat.'
