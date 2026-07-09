# ⚔️ CodeForge v2.4.1 ☆ コードフォージ

<p align="center">
  <i>✨ 君'のコードを完全にする！— Make your code perfect, Senpai! ✨</i>
</p>

---

Desktop & Mobile App für lokale KI-Coding-Agenten. Verbinde dich mit deinem PC, Laptop oder VPS und lasse KI-Agenten direkt in deinen Projekten arbeiten. **にゃー！**

```text
   ☆ React UI ☆
  → secure Electron IPC bridge / Capacitor WebView
  → Node child_process / HTTP API
  → Antigravity CLI, Codex CLI, Claude Code, Cursor Agent, OpenCode, FreeBuff
  → selected project folder ✨
```

## 🆕 Neu in v2.4.1 ～☆

- **⚡ Connection Key System** – Einfach den generierten Base64-Key kopieren, in der App einfügen → **SOFORT VERBUNDEN!**
- **🤖 Auto-Pairing & Fallback** – Server startet automatisch im Kopplungsmodus, falls eine LAN-Verbindung gesucht wird
- **🔐 Höchste Sicherheit** – Token wird verschlüsselt im Connection-Key transportiert, keine Klartext-Eingaben
- **🔄 GitHub Actions CI/CD** – Automatische Builds & Releases bei Push/Tag
- **📱 Vereinfachte Mobile-UI** – Connection-Key-Eingabe direkt auf der Startseite

## ⚡ Quick Start – In 10 Sekunden verbunden

```bash
# 1. Auf deinem Linux-PC / VPS / Windows:
bash codeforge-connect.sh
# (Auf Windows: powershell -File codeforge-connect-windows.ps1)

# 2. Den gedruckten Base64-Key kopieren (wird GROSS im Terminal angezeigt)

# 3. In der CodeForge-App:
#    Tippe auf »Verbinden« → Key einfügen → ✨ FERTIG!
```

### Für Debian VPS (Dauerbetrieb):

```bash
# Ein Befehl, alles automatisch:
sudo bash codeforge-connect-debian.sh

# → Server läuft als systemd-Dienst
# → Druckt den Connection Key direkt aus
# → Key in der App einfügen → VERBUNDEN!
```

## Requirements ～☆

- Node.js 20 oder neuer
- Mindestens eine installierte CLI:
  - `agy` – Google Antigravity ✨
  - `codex` – OpenAI Codex 🧠
  - `claude` – Anthropic Claude Code 💜
  - `agent` / `cursor-agent` – Cursor Agent 🖱️
  - `opencode` – OpenCode 📖
  - `freebuff` – **FreeBuff-chan** (kostenlos! ただ！) 🎀
- Optional: Git für Branch-Auswahl

## Entwicklung ～☆

```bash
# Desktop App
npm install
npm run dev

# CLI (Anime-Style! 🌸)
npx codeforge-cli --url http://server:8787 --token YOUR_TOKEN --interactive
```

## Build & Release ～☆

```bash
npm run lint          # TypeScript-Check ✨
npm run build         # Vite Build
npm run dist:win      # Windows EXE (release/)
npm run apk:build     # Android APK 📱
npm run release:all   # Alles auf einmal (EXE + APK + CLI) ⚡
```

**Automatische Releases via GitHub Actions:** Bei jedem Push auf `main` oder Tag `v*` werden Windows EXE + Android APK automatisch gebaut und als Release veröffentlicht.

---

## 📱 Tutorial: Mobile Verbindung in 3 Schritten

### 📋 Voraussetzungen

- Ein **Linux-PC** oder **Debian VPS** (11/12)
- Die **CodeForge-App** auf deinem Handy ([Releases](https://github.com/Pikaswelt/CodeForge/releases))

---

### 🚀 Schritt 1 – Server starten

**Auf dem Linux-PC (im selben WLAN wie das Handy):**

```bash
bash codeforge-connect.sh
```

**Auf einem Debian-VPS (Remote-Server):**

```bash
ssh root@DEINE-SERVER-IP
apt update && apt install -y git
git clone https://github.com/Pikaswelt/CodeForge.git
cd CodeForge
sudo bash codeforge-connect-debian.sh
```

> ⏳ Die VPS-Installation dauert ca. 2–3 Minuten und installiert Node.js, KI-CLIs und richtet den systemd-Dienst ein.

---

### 🔢 Schritt 2 – Connection Key kopieren

Nach dem Start zeigt das Terminal den **Connection Key** in einer großen Box:

```
  ╔══════════════════════════════════════════════════════════╗
  ║  📱 CONNECTION KEY FÜR DIE MOBILE APP:                  ║
  ║  Kopiere diesen Key und füge ihn in der App ein:         ║
  ║                                                          ║
  ║  eyJ1cmwiOiJodHRwOi8vMTkyLjE2OC4xLjEwMDo4Nzg3IiwidG9rZW4i...
  ║                                                          ║
  ║  CodeForge-App → Verbinden → Einfügen → FERTIG! ✨     ║
  ╚══════════════════════════════════════════════════════════╝
```

---

### 📱 Schritt 3 – In der App verbinden

1. **CodeForge-App** auf dem Handy öffnen
2. Auf **»Verbinden«** tippen (unten rechts)
3. Den **Base64 Connection Key** in das Eingabefeld einfügen
4. Auf **»Verbinden«** tippen

✨ **FERTIG!** Die App ist jetzt verschlüsselt mit deinem Server verbunden und alle CodeForge-Funktionen können remote genutzt werden!

---

### 🔧 Manuelle Verbindung (Alternative)

Falls du die Verbindung manuell einrichten willst:

1. In der App: **»Server-URL + Token (Manuell)«** wählen
2. Eintragen:
   - **Server-URL:** `http://DEINE-SERVER-IP:8787`
   - **API-Token:** Dein generierter Token
   - **Projektpfad:** `/root/codeforge-project`
3. **Verbinden**

---

### 📂 Schritt 4 (optional) – Projekt einrichten

```bash
# Neues Projekt klonen
mkdir -p /root/mein-projekt
cd /root/mein-projekt
git clone https://github.com/dich/dein-repo.git .
```

In der App unter **Projekt** den Pfad `/root/mein-projekt` eintragen.

---

## 🔧 Nützliche Befehle

| Befehl | Zweck |
|--------|-------|
| `systemctl status codeforge-remote` | Server-Status prüfen |
| `sudo journalctl -u codeforge-remote -f` | Live-Logs ansehen |
| `sudo systemctl restart codeforge-remote` | Server neustarten (neuer Kopplungscode!) |
| `curl http://localhost:8787/discover` | Verbindung lokal testen |
| `curl -X POST http://localhost:8787/pair/start` | Manuell neuen Kopplungscode anfordern |

---

## 🔒 Sicherheit

- 🔑 **Token** wird automatisch generiert – niemals committen oder teilen
- ⏱️ **Kopplungscode** nur 10 Minuten gültig
- 🛡️ **Zugriffsmodus** pro Request: `read-only` / `workspace-write` / `full`
- 🔥 Für Produktivbetrieb: **Caddy/Nginx + Let's Encrypt** als HTTPS-Reverse-Proxy
- 🚫 Alternativ: Nur über **VPN/Tailscale** erreichbar machen (Port nicht in Firewall öffnen!)

## 🆘 Troubleshooting

| Problem | Lösung |
|---------|--------|
| App findet keinen Server | Firewall: `ufw allow 8787/tcp`, Handy & PC im selben WLAN? |
| Falscher Code | Code abgelaufen? Server neustarten für neuen Code |
| `EADDRINUSE` | Port belegt: `CODEFORGE_PORT=8788` im systemd-Service setzen |
| Token verloren | In `/etc/systemd/system/codeforge-remote.service` nachschauen |
| `node: command not found` | Setup-Skript erneut ausführen (installiert Node.js 22) |
| KI-CLI fehlt | `npm install -g agy` oder `npm install -g freebuff` |

---

## Provider ～☆

| Provider | CLI | Beschreibung |
|----------|-----|-------------|
| ✨ Google Antigravity | `agy` | Gemini, Claude & GPT-OSS |
| 🧠 OpenAI Codex | `codex` | Nicht-interaktiv im Projekt |
| 💜 Anthropic Claude | `claude` | Claude Code |
| 🖱️ Cursor Agent | `cursor-agent` | Cursor CLI |
| 📖 OpenCode | `opencode` | OpenCode Run-Modus |
| 🎀 **FreeBuff-chan** | `freebuff` | Kostenlos, kein API-Key nötig! にゃー！ |

## Security 🛡️

Der Renderer hat keinen direkten Node-Zugriff. Dateioperationen, Git, npm und Agent-Prozesse laufen ausschließlich über die eingeschränkte Preload-API. Zugriffsmodus pro Request: Read-Only, Workspace-Write oder Full.

---

<p align="center">
  <i>🌸 コードフォージ — 君のコードを完全にする！🌸</i><br>
  <sub>Made with 💖 by the CodeForge team</sub>
</p>
