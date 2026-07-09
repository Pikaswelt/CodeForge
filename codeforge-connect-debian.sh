#!/usr/bin/env bash
# =============================================================================
# CodeForge Connect – Debian VPS Einrichtung (Dauerbetrieb)
# =============================================================================
# Ein Befehl auf dem Debian-VPS:
#   sudo bash codeforge-connect-debian.sh
#
# Das Skript:
#   1. Installiert Node.js (falls nicht vorhanden)
#   2. Installiert agy + codex CLI (optional)
#   3. Startet den Remote-Server als systemd-Dienst mit Auto-Pairing
#   4. Zeigt den 4-stelligen Kopplungscode GROSS an
# =============================================================================
#
# Sicherheitshinweis: Der CODEFORGE_TOKEN wird automatisch generiert.
# Du kannst einen eigenen Token setzen:
#   CODEFORGE_TOKEN=dein-token sudo bash codeforge-connect-debian.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN="${CODEFORGE_TOKEN:-$(openssl rand -hex 16 2>/dev/null || echo "codeforge-$(date +%s)")}"
PORT="${CODEFORGE_PORT:-8787}"
CODEFORGE_ROOT="/opt/codeforge-mobile"
PROJECT_PATH="${CODEFORGE_PROJECT_PATH:-/root/codeforge-project}"
SERVER_FILE="$CODEFORGE_ROOT/codeforge-remote-server.mjs"
SERVICE_FILE="/etc/systemd/system/codeforge-remote.service"

# Prüfen ob wir root sind
if [ "$(id -u)" -ne 0 ]; then
  echo "Dieses Skript braucht root-Rechte. Bitte mit sudo ausführen:"
  echo "  sudo bash codeforge-connect-debian.sh"
  exit 1
fi

clear
cat << "BANNER"

  ╔══════════════════════════════════════════════════════════╗
  ║                                                        ║
  ║           ⚔️  CODEFORGE DEBIAN VPS SETUP  ⚔️            ║
  ║                                                        ║
  ║       Ein Befehl → Ein Code → Verbunden! にゃー ✨      ║
  ║                                                        ║
  ╚══════════════════════════════════════════════════════════╝

BANNER
echo ""

# =============================================================================
# 1. Node.js installieren
# =============================================================================
echo "  [1/4] Node.js wird installiert..."
if ! command -v node &>/dev/null; then
  apt-get update -qq
  apt-get install -y -qq curl gnupg ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
  echo "  ✓ Node.js $(node --version) installiert"
else
  echo "  ✓ Node.js $(node --version) bereits installiert"
fi

# =============================================================================
# 2. CLIs installieren (optional, fehlertolerant)
# =============================================================================
echo ""
echo "  [2/4] KI-CLIs werden installiert..."

# agy (Antigravity)
if ! command -v agy &>/dev/null; then
  echo "    Installiere agy..."
  curl -fsSL https://antigravity.google/cli/install.sh | bash 2>/dev/null || true
  if command -v agy &>/dev/null; then
    ln -sf "$(command -v agy)" /usr/local/bin/agy 2>/dev/null || true
    echo "    ✓ agy $(agy --version 2>/dev/null | head -1 || echo 'installiert')"
  elif [ -x /root/.local/bin/agy ]; then
    ln -sf /root/.local/bin/agy /usr/local/bin/agy
    echo "    ✓ agy installiert (aus ~/.local/bin)"
  else
    echo "    ⚠ agy konnte nicht automatisch installiert werden."
    echo "      Nach dem Setup: curl -fsSL https://antigravity.google/cli/install.sh | bash"
  fi
else
  echo "    ✓ agy $(agy --version 2>/dev/null | head -1 || echo 'installiert') bereits vorhanden"
fi

# codex (OpenAI)
if ! command -v codex &>/dev/null; then
  echo "    Installiere codex..."
  curl -fsSL https://chatgpt.com/codex/install.sh | sh 2>/dev/null || true
  if command -v codex &>/dev/null; then
    ln -sf "$(command -v codex)" /usr/local/bin/codex 2>/dev/null || true
    echo "    ✓ codex installiert"
  elif [ -x /root/.local/bin/codex ]; then
    ln -sf /root/.local/bin/codex /usr/local/bin/codex
    echo "    ✓ codex installiert (aus ~/.local/bin)"
  else
    echo "    ⚠ codex konnte nicht automatisch installiert werden."
    echo "      Nach dem Setup: curl -fsSL https://chatgpt.com/codex/install.sh | sh"
  fi
else
  echo "    ✓ codex bereits vorhanden"
fi

# =============================================================================
# 3. Remote-Server einrichten
# =============================================================================
echo ""
echo "  [3/4] Remote-Server wird eingerichtet..."

mkdir -p "$CODEFORGE_ROOT" "$PROJECT_PATH"

# Remote-Server-Datei kopieren (falls vorhanden)
if [ -f "$SCRIPT_DIR/codeforge-remote-server.mjs" ]; then
  cp "$SCRIPT_DIR/codeforge-remote-server.mjs" "$SERVER_FILE"
  echo "  ✓ Server-Datei kopiert"
else
  # Download from GitHub
  echo "    Lade Server von GitHub herunter..."
  curl -fsSL -o "$SERVER_FILE" \
    "https://raw.githubusercontent.com/Pikaswelt/CodeForge/main/codeforge-remote-server.mjs" 2>/dev/null || {
    echo "    ⚠ Konnte Server nicht herunterladen. Bitte manuell bereitstellen."
    exit 1
  }
  echo "  ✓ Server von GitHub geladen"
fi
chmod 755 "$SERVER_FILE"

# systemd Service erstellen (mit Auto-Pairing)
cat > "$SERVICE_FILE" <<EOF_SERVICE
[Unit]
Description=CodeForge Remote Server (Mobile Connect)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=CODEFORGE_TOKEN=$TOKEN
Environment=CODEFORGE_HOST=0.0.0.0
Environment=CODEFORGE_PORT=$PORT
Environment=CODEFORGE_AUTO_PAIR=true
Environment=CODEFORGE_PAIRING_TIMEOUT=10
Environment=PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin
WorkingDirectory=$PROJECT_PATH
ExecStart=/usr/bin/node $SERVER_FILE
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF_SERVICE

systemctl daemon-reload
systemctl enable --now codeforge-remote.service
echo "  ✓ systemd-Dienst eingerichtet und gestartet"

# Firewall öffnen
if command -v ufw &>/dev/null; then
  ufw allow "$PORT/tcp" 2>/dev/null || true
  echo "  ✓ Port $PORT in ufw geöffnet"
fi

# =============================================================================
# 4. Verbindungsdaten anzeigen
# =============================================================================
echo ""
echo "  [4/4] Verbindung testen..."
sleep 2

# Server-IP ermitteln
detect_ip() {
  local ip
  ip=$(curl -fsS --connect-timeout 3 https://api.ipify.org 2>/dev/null) || true
  if [ -z "$ip" ]; then
    ip=$(curl -fsS --connect-timeout 3 https://icanhazip.com 2>/dev/null) || true
  fi
  if [ -z "$ip" ]; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
  fi
  echo "${ip:-127.0.0.1}"
}

IP=$(detect_ip)

clear
cat << "FINISH"

  ╔══════════════════════════════════════════════════════════╗
  ║                                                        ║
  ║           ✨  DEBIAN VPS IST BEREIT!  ✨                 ║
  ║                                                        ║
  ╚══════════════════════════════════════════════════════════╝

FINISH

# Lokalen Test durchführen
LOCAL_TEST=$(curl -fsS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$PORT/discover 2>/dev/null || echo '{"ok":false}')
if echo "$LOCAL_TEST" | grep -q '"ok":true'; then
  echo "  ✓ Server läuft und antwortet"
else
  echo "  ⚠ Server läuft, aber der Test war nicht erfolgreich."
  echo "    Status prüfen: systemctl status codeforge-remote"
fi
echo ""

# Connection Key für Mobile App
CONNECTION_JSON="{\"url\":\"http://${IP}:${PORT}\",\"token\":\"${TOKEN}\",\"projectPath\":\"${PROJECT_PATH}\"}"
CONNECTION_KEY=$(echo -n "$CONNECTION_JSON" | base64 | tr -d '\n\r')
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  📱 CONNECTION KEY FÜR DIE MOBILE APP:                  ║"
echo "  ║  Kopiere diesen Key und füge ihn in der App ein:         ║"
echo "  ║                                                          ║"
echo "  ║  $CONNECTION_KEY"
echo "  ║                                                          ║"
echo "  ║  CodeForge-App → Verbinden → Einfügen → FERTIG! ✨     ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

# Kopplungsmodus starten und Code abrufen
PAIRING_RESPONSE=$(curl -fsS -X POST http://127.0.0.1:$PORT/pair/start 2>/dev/null || echo '{}')
PAIRING_CODE=$(echo "$PAIRING_RESPONSE" | grep -o '"pairingCode":"[0-9]*"' | grep -o '[0-9]*' || echo "")

if [ -n "$PAIRING_CODE" ]; then
  EASY_SETUP_URL="http://${IP}:${PORT}/pair?code=${PAIRING_CODE}"
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║                                                        ║"
  echo "  ║  📱 ALTERNATIVES AUTO-PAIRING (im selben Netzwerk):    ║"
  echo "  ║                                                        ║"
  echo "  ║  ${EASY_SETUP_URL}  ║"
  echo "  ║                                                        ║"
  echo "  ║  CodeForge-App → Verbinden → Einfügen → FERTIG! ✨     ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo ""
  echo "  🔢 Alternativ nur den Code: ${PAIRING_CODE}"
  echo "  ⏱️  Code gültig für 10 Minuten"
else
  echo "  ⚠ Kopplungsmodus konnte nicht automatisch gestartet werden."
  echo "    Manuell starten: curl -X POST http://127.0.0.1:$PORT/pair/start"
fi
echo ""

echo "  ═══════════════════════════════════════════════════"
echo "   Server-Daten (für manuelle Verbindung):"
echo ""
echo "   Server:    http://${IP}:${PORT}"
echo "   Token:     ${TOKEN:0:16}..."
echo "   Projekt:   ${PROJECT_PATH}"
echo ""
echo "  ═══════════════════════════════════════════════════"
echo ""
echo "  🔧 Nützliche Befehle:"
echo "    systemctl status codeforge-remote     – Status prüfen"
echo "    sudo journalctl -u codeforge-remote -f – Live-Logs"
echo "    curl -X POST http://127.0.0.1:$PORT/pair/start – Neuen Kopplungscode"
echo ""
echo "  🔑 Token (im Service gespeichert): $SERVICE_FILE"
echo ""
