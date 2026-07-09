# ⚔️ CodeForge v2.2.1 ☆ コードフォージ

<p align="center">
  <i>✨ 君のコードを完全にする！— Make your code perfect, Senpai! ✨</i>
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

## 🆕 Neu in v2.2.1 ～☆

- **🌸 Anime CLI** – Die CLI erstrahlt im Kawaii-Style mit bunten ASCII-Artworks und Sparkles!
- **🤖 FreeBuff** – Neuer kostenloser KI-Provider (`npm install -g freebuff`) — FreeBuff-chan ist da!
- **🛡️ Konfigurierbares CORS** – `CODEFORGE_CORS_ORIGIN` für den Remote Server
- **🧩 Updater-Modul** – Sauber extrahiert aus main.cjs in eigenes Modul
- **🔧 TypeScript-Fixes** – `tsc --noEmit` läuft jetzt sauber durch ✨
- **🔑 Token-Generator** – Kein hardcodetes Token mehr, wird zur Laufzeit generiert

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

## Quick Start ～☆

```bash
# Desktop App
npm install
npm run dev

# CLI (Anime-Style! 🌸)
npx codeforge-cli --url http://server:8787 --token YOUR_TOKEN --interactive

# Server (Debian/Linux)
sudo bash install-codeforge-debian.sh
```

## Build & Release ～☆

```bash
npm run lint          # TypeScript-Check ✨
npm run build         # Vite Build
npm run dist:win      # Windows EXE (release/)
npm run apk:build     # Android APK 📱
npm run release:all   # Alles auf einmal (EXE + APK + CLI) ⚡
```

## Mobile App (Android APK) 📱

Die Android-App nutzt Capacitor und ist für Smartphones optimiert. Im **Mobile Modus** verbindest du dich mit einem PC oder VPS als KI-Server.

**Kopplungsmodus (einfachste Methode):**
1. Auf dem PC/Server: `bash codeforge-connect.sh`
2. 4-stelligen Code ablesen 🔢
3. In der App: Verbinden → Kopplungsmodus → Code eingeben → **完了！** ✨

## Debian VPS Installation 🐧

```bash
sudo bash install-codeforge-debian.sh
```

Das Skript installiert Node.js, richtet den systemd-Dienst ein und generiert ein Token. Nach der Installation läuft der Server dauerhaft – auch nach Neustarts.

```bash
# Status prüfen
systemctl status codeforge-remote

# Kopplungsmodus starten
curl -X POST http://localhost:8787/pair/start
```

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
