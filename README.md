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

---

## 🐧 Tutorial: Debian-VPS aufsetzen & mit Mobile verbinden

> Komplett-Anleitung in **5 Minuten** – vom nackten Debian-Server bis zur CodeForge-App auf dem Handy. にゃー！ ✨

### 📋 Voraussetzungen

- Ein **vServer mit Debian 11 oder 12** (Hetzner, Netcup, Contabo, IONOS, DigitalOcean, etc.)
- **SSH-Zugang** als `root`
- Die **CodeForge-App** auf deinem Handy (Android APK aus den [Releases](https://github.com/Pikaswelt/CodeForge/releases))

---

### 🚀 Schritt 1 – Mit dem Server verbinden

Verbinde dich per SSH mit deinem frischen Debian-Server:

```bash
ssh root@DEINE-SERVER-IP
```

> 💡 **Tipp:** Unter Windows nimm [PuTTY](https://www.putty.org/) oder das neue Windows-Terminal.

---

### 🛠️ Schritt 2 – CodeForge auf dem VPS installieren

Klone das Repository und starte das Setup-Skript. **Ein Befehl, alles drin:**

```bash
apt update && apt install -y git
git clone https://github.com/Pikaswelt/CodeForge.git
cd CodeForge
sudo bash codeforge-connect-debian.sh
```

Das Skript erledigt **automatisch**:

- ✅ Installation von **Node.js 22**
- ✅ Einrichtung der KI-CLIs (`agy`, `codex`)
- ✅ Anlegen eines **systemd-Dienstes** (läuft dauerhaft, startet bei Reboot neu)
- ✅ Öffnet den Port `8787` in der Firewall (`ufw`)
- ✅ Generiert einen **sicheren Token**

> ⏳ Die Installation dauert ca. 1–3 Minuten. Bei der Installation der KI-CLIs kann es zu Warnungen kommen – das ist okay.

---

### 🔑 Schritt 3 – Verbindungsdaten notieren

Am Ende zeigt das Skript eine Box wie diese:

```
   Server:    http://203.0.113.10:8787
   Token:     a1b2c3d4e5f6789...
   Projekt:   /root/codeforge-project
```

> 📌 **Notiere dir Server-URL und Token** – du brauchst sie gleich in der App!
>
> 🔍 Den Token findest du jederzeit wieder in `/etc/systemd/system/codeforge-remote.service`.

---

### 📱 Schritt 4 – CodeForge-App auf dem Handy verbinden

1. Öffne die **CodeForge-App** auf deinem Handy
2. Tippe auf **Verbinden** / **Mobile Verbindung**
3. Wähle **„Server-URL manuell eingeben"**
4. Trage ein:

   | Feld      | Wert                          |
   | --------- | ----------------------------- |
   | Server    | `http://DEINE-IP:8787`        |
   | Token     | dein notiertes Token          |

5. Tippe **Verbinden** ✨

**Alternativ per Kopplungsmodus (QR-Code):**

```bash
# Auf dem Server starten:
curl -X POST http://localhost:8787/pair/start
```

→ 4-stelligen Code in der App eingeben oder den QR-Code scannen. **完了！**

---

### 📂 Schritt 5 – Projektordner vorbereiten

Lege das Projekt an, an dem die KI arbeiten soll:

```bash
# Beispiel: Neues Projekt klonen
mkdir -p /root/mein-projekt
cd /root/mein-projekt
git clone https://github.com/dich/dein-repo.git .

# ODER: Bestehende Dateien hochladen via SCP
scp -r ./lokaler-ordner/* root@DEINE-SERVER-IP:/root/mein-projekt/
```

In der App unter **Projekt** den Pfad `/root/mein-projekt` eintragen.

---

### 🔧 Nützliche Befehle für den Alltag

| Befehl                                                    | Zweck                          |
| --------------------------------------------------------- | ------------------------------ |
| `systemctl status codeforge-remote`                       | Status prüfen                  |
| `sudo journalctl -u codeforge-remote -f`                  | Live-Logs ansehen              |
| `sudo systemctl restart codeforge-remote`                 | Server neustarten              |
| `sudo systemctl stop codeforge-remote`                    | Server stoppen                 |
| `curl http://localhost:8787/discover`                      | Verbindung lokal testen        |
| `curl -X POST http://localhost:8787/pair/start`           | Kopplungsmodus starten         |
| `nano /etc/systemd/system/codeforge-remote.service`       | Token oder Port ändern         |

Nach Änderungen an der Service-Datei:

```bash
sudo systemctl daemon-reload
sudo systemctl restart codeforge-remote
```

---

### 🔒 Sicherheits-Hinweise

- 🔥 **Port 8787** nicht ungeschützt ins Internet hängen. Für Produktivbetrieb **Caddy** oder **Nginx** als Reverse-Proxy mit HTTPS davorsetzen (Let's Encrypt ist kostenlos).
- 🔑 Den **Token** wie ein Passwort behandeln – niemals committen oder weitergeben.
- 🛡️ In der App den **Zugriffsmodus** pro Request einschränken: `read-only` / `workspace-write` / `full`.
- 🚫 Falls der Server **nur intern** erreichbar sein soll, genügt es, den Port **nicht** in der Firewall zu öffnen und per VPN/Tailscale darauf zuzugreifen.

---

### 🆘 Troubleshooting

| Problem                              | Lösung                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------- |
| App kann nicht verbinden             | Firewall prüfen: `ufw status`, Port `8787/tcp` erlauben                   |
| `EADDRINUSE` Fehler im Log           | Anderer Prozess nutzt Port 8787 → `CODEFORGE_PORT=8788` setzen            |
| Token verloren                       | In `/etc/systemd/system/codeforge-remote.service` nachschauen             |
| `node: command not found`            | Setup-Skript erneut ausführen – installiert Node.js 22                    |
| KI-CLI nicht gefunden                Manuell installieren: `npm install -g agy` bzw. `codex`                       |

---

**Fertig!** 🎉 Du kannst jetzt von **überall auf der Welt** mit deinem Handy KI-Agenten auf deinem VPS arbeiten lassen. にゃー！ ٩(◕‿◕｡)۶

---

## 🐧 Tutorial: Debian-VPS aufsetzen & mit Mobile verbinden

> Komplett-Anleitung in **5 Minuten** – vom nackten Debian-Server bis zur CodeForge-App auf dem Handy. にゃー！ ✨

### 📋 Voraussetzungen

- Ein **vServer mit Debian 11 oder 12** (Hetzner, Netcup, Contabo, IONOS, DigitalOcean, etc.)
- **SSH-Zugang** als `root`
- Die **CodeForge-App** auf deinem Handy (Android APK aus den [Releases](https://github.com/Pikaswelt/CodeForge/releases))

---

### 🚀 Schritt 1 – Mit dem Server verbinden

Verbinde dich per SSH mit deinem frischen Debian-Server:

```bash
ssh root@DEINE-SERVER-IP
```

> 💡 **Tipp:** Unter Windows nimm [PuTTY](https://www.putty.org/) oder das neue Windows-Terminal.

---

### 🛠️ Schritt 2 – CodeForge auf dem VPS installieren

Klone das Repository und starte das Setup-Skript. **Ein Befehl, alles drin:**

```bash
apt update && apt install -y git
git clone https://github.com/Pikaswelt/CodeForge.git
cd CodeForge
sudo bash codeforge-connect-debian.sh
```

Das Skript erledigt **automatisch**:

- ✅ Installation von **Node.js 22**
- ✅ Einrichtung der KI-CLIs (`agy`, `codex`)
- ✅ Anlegen eines **systemd-Dienstes** (läuft dauerhaft, startet bei Reboot neu)
- ✅ Öffnet den Port `8787` in der Firewall (`ufw`)
- ✅ Generiert einen **sicheren Token**

> ⏳ Die Installation dauert ca. 1–3 Minuten. Bei der Installation der KI-CLIs kann es zu Warnungen kommen – das ist okay.

### 🔐 Schritt 2.5 – KI-CLIs einloggen (einmalig)

Nach der Installation musst du die CLIs **einmalig** bei ihrem Anbieter authentifizieren, sonst schlägt der erste Run fehl:

```bash
agy login      # Google Antigravity – Browser-Login
codex login    # OpenAI Codex – Browser-Login
```

> 💡 **FreeBuff-chan** (`npm install -g freebuff`) braucht **keinen Login** – komplett kostenlos und ohne API-Key! 🎀

---

### 🔑 Schritt 3 – Verbindungsdaten notieren

Am Ende zeigt das Skript eine Box wie diese:

```
   Server:    http://203.0.113.10:8787
   Token:     <dein-32-stelliger-token>
   Projekt:   /root/codeforge-project
```

> 📌 **Notiere dir Server-URL und Token** – du brauchst sie gleich in der App!
>
> 🔍 Den Token findest du jederzeit wieder in `/etc/systemd/system/codeforge-remote.service`.

---

### 📱 Schritt 4 – CodeForge-App auf dem Handy verbinden

1. Öffne die **CodeForge-App** auf deinem Handy
2. Tippe auf **Verbinden** / **Mobile Verbindung**
3. Wähle **„Server-URL manuell eingeben"**
4. Trage ein:

   | Feld      | Wert                          |
   | --------- | ----------------------------- |
   | Server    | `http://DEINE-IP:8787`        |
   | Token     | dein notiertes Token          |

5. Tippe **Verbinden** ✨

**Alternativ per Kopplungsmodus (QR-Code):**

```bash
# Auf dem Server starten:
curl -X POST http://localhost:8787/pair/start
```

→ 4-stelligen Code in der App eingeben oder den QR-Code scannen. **完了！**

---

### 📂 Schritt 5 – Projektordner vorbereiten

Lege das Projekt an, an dem die KI arbeiten soll:

```bash
# Beispiel: Neues Projekt klonen
mkdir -p /root/mein-projekt
cd /root/mein-projekt
git clone https://github.com/dich/dein-repo.git .

# ODER: Bestehende Dateien hochladen via SCP
scp -r ./lokaler-ordner/* root@DEINE-SERVER-IP:/root/mein-projekt/
```

In der App unter **Projekt** den Pfad `/root/mein-projekt` eintragen.

---

### 🔧 Nützliche Befehle für den Alltag

| Befehl                                                    | Zweck                          |
| --------------------------------------------------------- | ------------------------------ |
| `systemctl status codeforge-remote`                       | Status prüfen                  |
| `sudo journalctl -u codeforge-remote -f`                  | Live-Logs ansehen              |
| `sudo systemctl restart codeforge-remote`                 | Server neustarten              |
| `sudo systemctl stop codeforge-remote`                    | Server stoppen                 |
| `curl http://localhost:8787/discover`                      | Verbindung lokal testen        |
| `curl -X POST http://localhost:8787/pair/start`           | Kopplungsmodus starten         |
| `nano /etc/systemd/system/codeforge-remote.service`       | Token oder Port ändern         |

Nach Änderungen an der Service-Datei:

```bash
sudo systemctl daemon-reload
sudo systemctl restart codeforge-remote
```

---

### 🔒 Sicherheits-Hinweise

- 🔥 **Port 8787** nicht ungeschützt ins Internet hängen. Für Produktivbetrieb **Caddy** oder **Nginx** als Reverse-Proxy mit HTTPS davorsetzen (Let's Encrypt ist kostenlos).
- 🔑 Den **Token** wie ein Passwort behandeln – niemals committen oder weitergeben.
- 🛡️ In der App den **Zugriffsmodus** pro Request einschränken: `read-only` / `workspace-write` / `full`.
- 🚫 Falls der Server **nur intern** erreichbar sein soll, genügt es, den Port **nicht** in der Firewall zu öffnen und per VPN/Tailscale darauf zuzugreifen.

---

### 🆘 Troubleshooting

| Problem                              | Lösung                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------- |
| App kann nicht verbinden             | Firewall prüfen: `ufw status` – Port `8787/tcp` muss offen sein           |
| `EADDRINUSE` Fehler im Log           | Anderer Prozess nutzt Port 8787 → in der Service-Datei `CODEFORGE_PORT=8788` setzen |
| Token verloren                       | In `/etc/systemd/system/codeforge-remote.service` nachschauen             |
| `node: command not found`            | Setup-Skript erneut ausführen – installiert Node.js 22                    |
| KI-CLI fehlt                         | Manuell nachinstallieren: `bash <(curl -fsSL https://antigravity.google/cli/install.sh)` bzw. `bash <(curl -fsSL https://chatgpt.com/codex/install.sh)` |
| Erster Run schlägt fehl              | CLI-Login vergessen! Einmalig `agy login` / `codex login` ausführen       |

---

**Fertig!** 🎉 Du kannst jetzt von **überall auf der Welt** mit deinem Handy KI-Agenten auf deinem VPS arbeiten lassen. にゃー！ ٩(◕‿◕｡)۶

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
