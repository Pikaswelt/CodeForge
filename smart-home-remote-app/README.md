# CodeForge Mobile

Android-App fuer CodeForge auf dem Handy. Die App ist fuer mobile Nutzung
optimiert und arbeitet nur remote gegen einen Debian-Linux-VServer.

## Was die App kann

- PIN-Schutz auf dem Handy
- Remote-API-URL und API-Token speichern
- Provider, Modell, Remote-Projektpfad, System-Prompt, Zugriff und Reasoning setzen
- Verbindung zum VServer testen
- Agent-Aufgaben an den VServer senden
- Antworten und Fehler im mobilen Verlauf anzeigen
- Vollstaendiges Debian-Setup-Tutorial direkt in der App

## Debian-VServer Setup

Kopiere `codeforge-remote-server.mjs` aus dem Repo auf deinen Server oder starte
es aus deinem Projektordner.

Die APK ist vorkonfiguriert fuer:

- Server: `http://88.214.56.241:8787`
- Token: `HsuBh3M5p1ka24QUzWqGgLDXyZYTm0leSK86FwJfnrCbtVAR`
- Projektpfad: `/root/codeforge-project`

Auf dem Server kann das fertige Setup-Skript aus dem Repo genutzt werden:

```bash
bash server-setup-codeforge.sh
codex login
```

Standard-Port: `8787`

In der App:

- URL: `http://88.214.56.241:8787`
- Token: `HsuBh3M5p1ka24QUzWqGgLDXyZYTm0leSK86FwJfnrCbtVAR`
- Remote-Projektpfad: `/root/codeforge-project`

Fuer Zugriff von unterwegs nutze HTTPS ueber Nginx/Caddy oder ein VPN.

## Build

```powershell
cd smart-home-remote-app
.\gradlew.bat assembleDebug
```

Debug-APK:

```text
app/build/outputs/apk/debug/app-debug.apk
```
