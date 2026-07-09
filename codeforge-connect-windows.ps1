# =============================================================================
# CodeForge Connect – Windows PowerShell Setup
# =============================================================================
# In PowerShell (als Administrator) ausführen:
#   powershell -ExecutionPolicy Bypass -File codeforge-connect-windows.ps1
#
# Das Skript:
#   1. Prüft/installiert Node.js
#   2. Startet den CodeForge Remote Server
#   3. Zeigt Verbindungsdaten für die CodeForge-App
# =============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = if ($env:CODEFORGE_PORT) { $env:CODEFORGE_PORT } else { "8787" }
$Token = if ($env:CODEFORGE_TOKEN) { $env:CODEFORGE_TOKEN } else { (-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | ForEach-Object { [char]$_ })) }
$HostAddr = "0.0.0.0"
$ProjectPath = if ($env:CODEFORGE_PROJECT_PATH) { $env:CODEFORGE_PROJECT_PATH } else { "$env:USERPROFILE\codeforge-project" }

Clear-Host
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        CodeForge Connect – Windows Setup            ║" -ForegroundColor Cyan
Write-Host "║     Ein Befehl – PC bereit für dein Handy          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# =============================================================================
# 1. Node.js prüfen
# =============================================================================
Write-Host "  [1/3] Node.js wird geprüft..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  ✓ Node.js $nodeVersion gefunden" -ForegroundColor Green
}
catch {
    Write-Host "  ✗ Node.js ist nicht installiert!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Lade Node.js von https://nodejs.org herunter und installiere es."
    Write-Host "  Danach dieses Skript erneut ausführen."
    Write-Host ""
    Write-Host "  Oder mit winget:"
    Write-Host "    winget install OpenJS.NodeJS.LTS"
    Read-Host "  Drücke Enter zum Öffnen der Node.js-Website..."
    Start-Process "https://nodejs.org"
    exit 1
}

# =============================================================================
# 2. Server-Datei prüfen
# =============================================================================
Write-Host ""
Write-Host "  [2/3] Server-Datei wird gesucht..." -ForegroundColor Yellow
$ServerScript = Join-Path $ScriptDir "codeforge-remote-server.mjs"
if (-not (Test-Path $ServerScript)) {
    # Fallback: aktuelles Verzeichnis
    $ServerScript = Join-Path (Get-Location) "codeforge-remote-server.mjs"
}
if (-not (Test-Path $ServerScript)) {
    Write-Host "  ✗ codeforge-remote-server.mjs nicht gefunden!" -ForegroundColor Red
    Write-Host "  Lade es von GitHub herunter..."
    try {
        $url = "https://raw.githubusercontent.com/Pikaswelt/CodeForge/main/codeforge-remote-server.mjs"
        $ServerScript = Join-Path $ScriptDir "codeforge-remote-server.mjs"
        Invoke-WebRequest -Uri $url -OutFile $ServerScript -TimeoutSec 15
        Write-Host "  ✓ Von GitHub geladen: $ServerScript" -ForegroundColor Green
    }
    catch {
        Write-Host "  ✗ Konnte Server nicht herunterladen." -ForegroundColor Red
        Write-Host "    Bitte manuell von https://github.com/Pikaswelt/CodeForge holen"
        exit 1
    }
}
else {
    Write-Host "  ✓ Server-Datei gefunden: $ServerScript" -ForegroundColor Green
}

# Projektordner erstellen
if (-not (Test-Path $ProjectPath)) {
    New-Item -Path $ProjectPath -ItemType Directory -Force | Out-Null
    Write-Host "  ✓ Projektordner erstellt: $ProjectPath" -ForegroundColor Green
}

# =============================================================================
# 3. Firewall-Regel hinzufügen (für LAN-Discovery)
# =============================================================================
Write-Host ""
Write-Host "  [3/4] Firewall wird konfiguriert..." -ForegroundColor Yellow
try {
    $ruleName = "CodeForge Remote Server (Port $Port)"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName $ruleName `
            -Direction Inbound `
            -Protocol TCP `
            -LocalPort $Port `
            -Action Allow `
            -Profile Any `
            -Description "Erlaubt eingehende Verbindungen für CodeForge Mobile Connect" | Out-Null
        Write-Host "  ✓ Firewall-Regel erstellt: Port $Port (TCP)" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Firewall-Regel existiert bereits" -ForegroundColor Green
    }
}
catch {
    Write-Host "  ⚠ Konnte Firewall-Regel nicht erstellen (kein Admin?)" -ForegroundColor Yellow
    Write-Host "    Manuell: Windows-Firewall → Port $Port TCP freigeben" -ForegroundColor Yellow
}

# =============================================================================
# 4. Server starten
# =============================================================================
Write-Host ""
Write-Host "  [4/4] Starte Server..." -ForegroundColor Yellow

# Lokale IP ermitteln
$IpAddress = ""
try {
    $IpAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -ne "Loopback" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress
}
catch {
    # Fallback
    $IpAddress = "127.0.0.1"
}
if (-not $IpAddress) { $IpAddress = "127.0.0.1" }

Clear-Host
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        CodeForge Connect – Windows bereit!          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$ConnectionJson = '{"url":"http://' + $IpAddress + ':' + $Port + '","token":"' + $Token + '","projectPath":"' + $ProjectPath.Replace('\', '/') + '"}'
$Bytes = [System.Text.Encoding]::UTF8.GetBytes($ConnectionJson)
$ConnectionKey = [Convert]::ToBase64String($Bytes)

Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║  📱 CONNECTION KEY FÜR DIE MOBILE APP:                  ║" -ForegroundColor Green
Write-Host "  ║  Kopiere diesen Key und füge ihn in der App ein:         ║" -ForegroundColor Green
Write-Host "  ║                                                          ║" -ForegroundColor Green
Write-Host "  ║  $ConnectionKey" -ForegroundColor Yellow
Write-Host "  ║                                                          ║" -ForegroundColor Green
Write-Host "  ║  CodeForge-App -> Verbinden -> Einfügen -> FERTIG! ✨     ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Write-Host "  ═══════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "   Server-Daten (für manuelle Verbindung):" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "   Server:    http://${IpAddress}:${Port}" -ForegroundColor Cyan
Write-Host "   Token:     ${Token}" -ForegroundColor Cyan
Write-Host "   Projekt:   ${ProjectPath}" -ForegroundColor Cyan
Write-Host ""
Write-Host "   In der App unter 'Mobile Verbindung'" -ForegroundColor Gray
Write-Host "   → 'Server-URL manuell eingeben' eintragen." -ForegroundColor Gray
Write-Host ""
Write-Host "   Oder im selben Netzwerk:" -ForegroundColor Gray
Write-Host "   → 'Netzwerk durchsuchen' findet den Server" -ForegroundColor Gray
Write-Host ""
Write-Host "   ═══════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Starte Server auf http://${IpAddress}:${Port} ..." -ForegroundColor Yellow
Write-Host "  Drücke Strg+C zum Beenden." -ForegroundColor Gray
Write-Host ""

$env:CODEFORGE_TOKEN = $Token
$env:CODEFORGE_PORT = $Port
$env:CODEFORGE_HOST = $HostAddr
$env:CODEFORGE_AUTO_PAIR = "true"

node $ServerScript
