#!/usr/bin/env bash
# =============================================================================
# CodeForge Connect – Ein Befehl, und dein Handy findet den PC
# =============================================================================
# Einfach auf dem Linux-PC ausführen:
#   bash codeforge-connect.sh
#
# Das Skript:
#   1. Findet die lokale IP
#   2. Generiert einen zufälligen Token
#   3. Startet den CodeForge Remote Server
#   4. Zeigt QR-Code und Verbindungsdaten
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN="${CODEFORGE_TOKEN:-$(openssl rand -hex 16 2>/dev/null || echo "codeforge-$(date +%s)")}"
PORT="${CODEFORGE_PORT:-8787}"
HOST="0.0.0.0"

# Lokale IP finden
detect_ip() {
  local ip
  ip=$(ip route get 1 2>/dev/null | awk '{print $7; exit}') || true
  if [ -z "$ip" ]; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
  fi
  if [ -z "$ip" ]; then
    ip=$(ifconfig 2>/dev/null | grep -E 'inet\s' | grep -v '127.0.0.1' | awk '{print $2}' | head -1) || true
  fi
  if [ -z "$ip" ]; then
    ip="127.0.0.1"
  fi
  echo "$ip"
}

IP=$(detect_ip)

# Prüfen ob Node.js installiert ist
if ! command -v node &>/dev/null; then
  echo "Fehler: Node.js ist nicht installiert."
  echo "Installiere es mit:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
  echo "  apt install -y nodejs"
  exit 1
fi

# Prüfen ob der Remote-Server existiert
SERVER_SCRIPT="$SCRIPT_DIR/codeforge-remote-server.mjs"
if [ ! -f "$SERVER_SCRIPT" ]; then
  # Fallback: Im aktuellen Verzeichnis suchen
  SERVER_SCRIPT="./codeforge-remote-server.mjs"
fi
if [ ! -f "$SERVER_SCRIPT" ]; then
  echo "Fehler: codeforge-remote-server.mjs nicht gefunden."
  echo "Stelle sicher, dass das Skript im selben Ordner liegt wie dieses Script."
  exit 1
fi

clear
cat << "EOF"
  ╔══════════════════════════════════════════════════════╗
  ║              CodeForge Mobile Connect                ║
  ║         Ein Befehl – PC bereit für dein Handy        ║
  ╚══════════════════════════════════════════════════════╝
EOF
echo ""

# Prüfen ob qrencode verfügbar ist und QR anzeigen
if command -v qrencode &>/dev/null; then
  QR_DATA="http://${IP}:${PORT}"
  echo "  Scanne diesen QR-Code mit der CodeForge-App:"
  echo ""
  qrencode -t ANSIUTF8 "$QR_DATA" 2>/dev/null || true
  echo ""
else
  echo "  Tipp: Installiere 'qrencode' für QR-Code:"
  echo "    apt install qrencode"
  echo ""
fi

echo "  ═══════════════════════════════════════════════════"
echo "   Verbindungsdaten für die CodeForge-App:"
echo ""
echo "   Server:    http://${IP}:${PORT}"
echo "   Token:     ${TOKEN}"
echo ""
echo "   Oder führe auf dem Handy aus:"
echo "   LAN-Suche → findet den Server automatisch"
echo ""
echo "   ═══════════════════════════════════════════════════"
echo ""

# Server starten
echo "  Starte Server auf http://${IP}:${PORT} ..."
echo "  Drücke Strg+C zum Beenden."
echo ""

export CODEFORGE_TOKEN="$TOKEN"
export CODEFORGE_PORT="$PORT"
export CODEFORGE_HOST="$HOST"

exec node "$SERVER_SCRIPT"
