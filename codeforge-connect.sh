#!/usr/bin/env bash
# =============================================================================
# CodeForge Connect – Ein Befehl, ein Code, verbunden!
# =============================================================================
# Auf dem Linux-PC ausführen:
#   bash codeforge-connect.sh
#
# Das Skript:
#   1. Findet die lokale IP
#   2. Generiert einen zufälligen Token
#   3. Startet den Server mit automatischem Kopplungsmodus
#   4. Zeigt den 4-stelligen Code GROSS an
#   5. Du gibst den Code in der App ein → FERTIG!
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN="${CODEFORGE_TOKEN:-$(openssl rand -hex 16 2>/dev/null || echo \"codeforge-$(date +%s)\")}"
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
if [ -d "${SCRIPT_DIR:-}" ]; then
  SERVER_SCRIPT="$SCRIPT_DIR/codeforge-remote-server.mjs"
else
  SERVER_SCRIPT="./codeforge-remote-server.mjs"
fi

if [ ! -f "$SERVER_SCRIPT" ]; then
  SERVER_SCRIPT="./codeforge-remote-server.mjs"
fi

if [ ! -f "$SERVER_SCRIPT" ]; then
  echo "  ✗ codeforge-remote-server.mjs nicht gefunden! Lade von GitHub herunter..."
  if command -v curl &>/dev/null; then
    curl -fsSL -o "codeforge-remote-server.mjs" "https://raw.githubusercontent.com/Pikaswelt/CodeForge/main/codeforge-remote-server.mjs"
  elif command -v wget &>/dev/null; then
    wget -q -O "codeforge-remote-server.mjs" "https://raw.githubusercontent.com/Pikaswelt/CodeForge/main/codeforge-remote-server.mjs"
  else
    echo "Fehler: Weder curl noch wget gefunden."
    exit 1
  fi
  SERVER_SCRIPT="./codeforge-remote-server.mjs"
fi

clear
cat << "BANNER"

  ╔══════════════════════════════════════════════════════════╗
  ║                                                        ║
  ║           ⚔️  CODEFORGE MOBILE CONNECT  ⚔️               ║
  ║                                                        ║
  ║       Ein Befehl → Ein Code → Verbunden! にゃー ✨      ║
  ║                                                        ║
  ╚══════════════════════════════════════════════════════════╝

BANNER

echo "  🌐 Server: http://${IP}:${PORT}"
echo ""

# QR-Code anzeigen wenn qrencode verfügbar
if command -v qrencode &>/dev/null; then
  qrencode -t ANSIUTF8 -m 2 -s 8 "http://${IP}:${PORT}" 2>/dev/null || true
  echo ""
fi

echo "  Für Debian VPS (Dauereinrichtung):"
echo "    sudo bash codeforge-connect-debian.sh"
echo "  Für Windows:"
echo "    powershell -File codeforge-connect-windows.ps1"
echo ""

# Server starten mit Auto-Pairing
echo "  🚀 Starte Server mit Kopplungsmodus..."
echo "  📡 Der 4-stellige Code erscheint in Kürze unten..."
echo ""
echo "  Drücke Strg+C zum Beenden."
echo ""

export CODEFORGE_TOKEN="$TOKEN"
export CODEFORGE_PORT="$PORT"
export CODEFORGE_HOST="$HOST"
export CODEFORGE_AUTO_PAIR="true"

exec node "$SERVER_SCRIPT"
