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
SERVER_SCRIPT="$SCRIPT_DIR/codeforge-remote-server.mjs"
if [ ! -f "$SERVER_SCRIPT" ]; then
  SERVER_SCRIPT="./codeforge-remote-server.mjs"
fi
if [ ! -f "$SERVER_SCRIPT" ]; then
  echo "Fehler: codeforge-remote-server.mjs nicht gefunden."
  echo "Stelle sicher, dass das Skript im selben Ordner liegt wie dieses Script."
  exit 1
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

echo "  🌐 Server startet auf:  http://${IP}:${PORT}"
echo ""

# QR-Code anzeigen wenn qrencode verfügbar
if command -v qrencode &>/dev/null; then
  QR_DATA="http://${IP}:${PORT}"
  echo "  📱 QR-Code (mit der CodeForge-App scannen):"
  echo ""
  qrencode -t ANSIUTF8 -m 2 -s 8 "$QR_DATA" 2>/dev/null || true
  echo ""
fi

echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║                                                  ║"
echo "  ║     📱 SO GEHT'S – 3 Schritte:                   ║"
echo "  ║                                                  ║"
echo "  ║  1. Öffne die CodeForge-App auf deinem Handy    ║"
echo "  ║  2. Tippe auf »Verbinden«                        ║"
echo "  ║  3. Gib den 4-stelligen Code ein (erscheint      ║"
echo "  ║     gleich unten)                                ║"
echo "  ║                                                  ║"
echo "  ║  ✨ FERTIG – du bist verbunden! ✨                ║"
echo "  ║                                                  ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
echo "  ═══════════════════════════════════════════════════"
echo ""
echo "  Für Debian VPS (Dauereinrichtung):"
echo "    sudo bash codeforge-connect-debian.sh"
echo ""
echo "  Für Windows:"
echo "    powershell -File codeforge-connect-windows.ps1"
echo ""
echo "  ═══════════════════════════════════════════════════"
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
