<#
.SYNOPSIS
  Builds the plugin and copies it to a Steam Deck over SSH.

.DESCRIPTION
  Windows ships OpenSSH's ssh/scp but not rsync, so this uses scp -r.
  Only the files Decky actually loads are copied -- never node_modules,
  tests, or the dev harness.

.EXAMPLE
  .\scripts\deploy.ps1 -DeckHost 192.168.1.42
  .\scripts\deploy.ps1                # reads DECK_HOST from deploy.env
#>
[CmdletBinding()]
param(
    [string]$DeckHost,
    [string]$DeckUser = "deck",
    [string]$PluginName = "retroachievements",
    [switch]$SkipBuild,
    [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# deploy.env is gitignored: DECK_HOST=192.168.1.42
$envFile = Join-Path $root "deploy.env"
if (-not $DeckHost -and (Test-Path $envFile)) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$') {
            switch ($Matches[1]) {
                "DECK_HOST" { if (-not $DeckHost) { $DeckHost = $Matches[2] } }
                "DECK_USER" { $DeckUser = $Matches[2] }
            }
        }
    }
}

if (-not $DeckHost) {
    Write-Error "No Deck host. Pass -DeckHost <ip> or create deploy.env with DECK_HOST=<ip>."
}

$target = "$DeckUser@$DeckHost"
$remoteDir = "~/homebrew/plugins/$PluginName"

if (-not $SkipBuild) {
    Write-Host "==> Building" -ForegroundColor Cyan
    Push-Location $root
    try { & yarn build; if ($LASTEXITCODE -ne 0) { throw "build failed" } }
    finally { Pop-Location }
}

if (-not (Test-Path (Join-Path $root "dist/index.js"))) {
    Write-Error "dist/index.js is missing. Run the build first."
}

Write-Host "==> Creating $remoteDir on $target" -ForegroundColor Cyan
& ssh $target "mkdir -p $remoteDir"
if ($LASTEXITCODE -ne 0) { throw "ssh failed -- is sshd running on the Deck?" }

# Exactly what Decky loads: the built frontend, the Python backend, the manifests.
$payload = @("dist", "main.py", "py_modules", "plugin.json", "package.json", "LICENSE", "README.md")

Write-Host "==> Copying" -ForegroundColor Cyan
Push-Location $root
try {
    $existing = $payload | Where-Object { Test-Path $_ }
    & scp -r @existing "${target}:$remoteDir/"
    if ($LASTEXITCODE -ne 0) { throw "scp failed" }
}
finally { Pop-Location }

if (-not $NoRestart) {
    Write-Host "==> Restarting plugin_loader (needs your Deck password)" -ForegroundColor Cyan
    # -t allocates a TTY so sudo can prompt.
    & ssh -t $target "sudo systemctl restart plugin_loader"
}

Write-Host "==> Done. Open the Decky menu on your Deck." -ForegroundColor Green
