#!/bin/bash
# CodeForge Debian Server Installer v2.4.3
# Installation: sudo bash install-codeforge-debian.sh

set -e

echo "==============================================="
echo "  CodeForge Debian Server Installer v2.4.3"
echo "==============================================="
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root ausführen: sudo bash install-codeforge-debian.sh"
  exit 1
fi

# ── Konfiguration ──────────────────────────────────────────────
INSTALL_DIR="/opt/codeforge"
SERVICE_NAME="codeforge-remote"
PORT="${PORT:-8787}"
TOKEN="${CODEFORGE_TOKEN:-}"

# ── Abhängigkeiten installieren ─────────────────────────────────
echo "[1/5] Installiere Abhängigkeiten..."
apt-get update -qq
apt-get install -y -qq curl nodejs npm 2>/dev/null || apt-get install -y -qq curl

# Node.js 20+ falls nötig
if ! node -v 2>/dev/null | grep -qE 'v(1[89]|2[0-9])'; then
  echo "  Installiere Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

# ── Installationsverzeichnis ────────────────────────────────────
echo "[2/5] Erstelle Installationsverzeichnis..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# ── Server-Datei installieren ───────────────────────────────────
echo "[3/5] Installiere CodeForge Remote Server..."

# Falls die Datei im aktuellen Verzeichnis liegt, kopieren
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/codeforge-remote-server.mjs" ]; then
  cp "$SCRIPT_DIR/codeforge-remote-server.mjs" "$INSTALL_DIR/"
elif [ -f "$SCRIPT_DIR/../codeforge-remote-server.mjs" ]; then
  cp "$SCRIPT_DIR/../codeforge-remote-server.mjs" "$INSTALL_DIR/"
else
  # Aus Repository laden
  echo "  Lade Server von GitHub..."
  curl -fsSL "https://raw.githubusercontent.com/Pikaswelt/CodeForge/main/codeforge-remote-server.mjs" -o "$INSTALL_DIR/codeforge-remote-server.mjs" 2>/dev/null || {
    echo "  FEHLER: Konnte codeforge-remote-server.mjs nicht finden."
    echo "  Bitte die Datei manuell nach $INSTALL_DIR/ kopieren."
    exit 1
  }
fi

chmod +x "$INSTALL_DIR/codeforge-remote-server.mjs"

# CLI Tool mitkopieren
if [ -f "$SCRIPT_DIR/codeforge-cli.mjs" ]; then
  cp "$SCRIPT_DIR/codeforge-cli.mjs" "$INSTALL_DIR/"
  chmod +x "$INSTALL_DIR/codeforge-cli.mjs"
  echo "  CLI installiert: codeforge-cli"
fi

# ── Token generieren ────────────────────────────────────────────
if [ -z "$TOKEN" ]; then
  TOKEN=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
fi

# ── systemd Service ─────────────────────────────────────────────
echo "[4/5] Richte systemd-Dienst ein..."

cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=CodeForge Remote Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
Environment=PORT=${PORT}
Environment=CODEFORGE_TOKEN=${TOKEN}
Environment=CODEFORGE_HOST=0.0.0.0
ExecStart=/usr/bin/node ${INSTALL_DIR}/codeforge-remote-server.mjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# ── Abschluss ───────────────────────────────────────────────────
echo "[5/5] Installation abgeschlossen!"
echo ""
echo "==============================================="
echo "  CodeForge Server ist bereit!"
echo "==============================================="
echo ""

IP_ADDR=$(hostname -I | awk '{print $1}')
CONNECTION_JSON="{\"url\":\"http://${IP_ADDR}:${PORT}\",\"token\":\"${TOKEN}\",\"projectPath\":\"/opt/codeforge\"}"
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

echo "  Server-URL:  http://${IP_ADDR}:${PORT}"
echo "  Token:       ${TOKEN}"
echo ""
echo "  Befehle:"
echo "    systemctl status ${SERVICE_NAME}   – Status prüfen"
echo "    systemctl restart ${SERVICE_NAME}  – Neustarten"
echo "    journalctl -u ${SERVICE_NAME} -f   – Logs anzeigen"
echo ""
echo "  Kopplungsmodus starten:"
echo "    curl -X POST http://localhost:${PORT}/pair/start"
echo ""
echo "  CLI lokal nutzen:"
echo "    node /opt/codeforge/codeforge-cli.mjs --url http://localhost:${PORT} --token ${TOKEN} --interactive"
echo ""
