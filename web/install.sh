#!/usr/bin/env bash
# Installs or updates CodeForge Web on this server. Run from the repository root:
#   web/install.sh
# Configuration lives in /etc/codeforge-web.env (created once, mode 600).
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET=/opt/codeforge-web

command -v tmux >/dev/null || apt-get install -y tmux
npm ci --ignore-scripts --no-audit --no-fund
npx vite build

install -d -m 755 "$TARGET"
install -m 644 web/codeforge-web-server.mjs web/package.json "$TARGET/"
rm -rf "$TARGET/dist.new" && cp -r dist "$TARGET/dist.new" && rm -rf "$TARGET/dist" && mv "$TARGET/dist.new" "$TARGET/dist"
(cd "$TARGET" && npm install --omit=dev --no-audit --no-fund)
# The build from npm install can crash on newer Node versions; a clean node-gyp rebuild works.
(cd "$TARGET/node_modules/node-pty" && npx --yes node-gyp rebuild >/dev/null)
node -e "require('$TARGET/node_modules/node-pty')"
install -m 755 cli/codeforge /usr/local/bin/codeforge

if [ ! -f /etc/codeforge-web.env ]; then
  install -m 600 /dev/null /etc/codeforge-web.env
  cat > /etc/codeforge-web.env <<CONF
PORT=8790
CODEFORGE_PUBLIC_ORIGIN=https://workspace.example.com
CF_ACCESS_TEAM_DOMAIN=yourteam.cloudflareaccess.com
CF_ACCESS_AUD=
CODEFORGE_ALLOWED_EMAILS=
CODEFORGE_WORKDIR=/root
CONF
  echo "Bitte /etc/codeforge-web.env ausfuellen und dann: systemctl restart codeforge-web"
fi

install -m 644 web/codeforge-web.service /etc/systemd/system/codeforge-web.service
systemctl daemon-reload
systemctl enable codeforge-web >/dev/null
systemctl restart codeforge-web
