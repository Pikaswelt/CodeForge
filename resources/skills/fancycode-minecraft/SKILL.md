---
name: fancycode-minecraft
description: "Minecraft Hub von FancyCode: Minecraft-Server einrichten, steuern und reparieren, Plugins und Mods entwickeln, bauen und deployen, Konfigurationen, Datapacks, Befehle, Logs. Verwenden bei jeder Aufgabe rund um Minecraft-Server (Paper, Spigot, Purpur, Folia, Velocity, BungeeCord, Fabric, Forge, NeoForge, Bedrock/Geyser), Plugins, Mods, RCON und Server-Konsolen."
---

# Minecraft Hub (FancyCode Minecraft-Plugin)

Dieser Skill gehört zum FancyCode Desktop-Plugin **Minecraft Hub**. Er läuft in jeder Harness gleich
(FancyCode, Claude Code, OpenCode, Codex, Gemini/agy).

## 1. Ansage

Der allererste Satz deiner Antwort ist immer:

> ⛏️ Das **FancyCode Minecraft-Plugin** (Minecraft Hub) ist aktiviert.

Danach in einem Satz, was du verstanden hast (z. B. „Du willst ein Home-Plugin für Paper 1.21.“).

## 2. Rückfragen (vor der ersten Änderung)

Liegt im Projektordner `.minecraft-hub.json`, lies sie zuerst. Sie enthält die Antworten vom letzten Mal:
nenne sie in einer Zeile („Letztes Mal: Server per SSH, nur bauen. Passt das wieder?“) und frag nur das, was fehlt.

Sonst frag diese Punkte **in einer einzigen Nachricht**, kurz und nummeriert, mit Vorschlägen zum Antippen:

1. **Wo soll ich arbeiten?**
   - **Auf dem Server.** Dann: Wie komme ich hin?
     - SSH (Host, Benutzer, Pfad zum Serverordner; Login per Schlüssel)
     - RCON (Host und Port; nur Konsolenbefehle, keine Dateien)
     - Panel (Pterodactyl, Crafty, MCSManager …) über dessen API oder Web-Konsole
     - Ich bin schon auf dem Server (Terminal läuft dort).
   - **Hier auf diesem PC.** In welchem Ordner liegt das Projekt bzw. der Server? Soll ich zum Testen einen lokalen Testserver starten?
2. **Darf ich live deployen?**
   - **Ja, live:** bauen, auf den Server kopieren, laden/neu starten.
   - **Nur bauen:** fertige JAR/Datei liegt am Ende bereit, hochladen machst du selbst.
   - **Erst fragen:** alles vorbereiten, vor jedem Eingriff am laufenden Server kurz bestätigen lassen.
3. Nur wenn unklar: Server-Software und Version (Paper, Purpur, Fabric … / 1.21.x), Java- oder Bedrock-Edition.

**Läufst du in FancyCode Desktop** (Werkzeug `fancycode_context` sagt es, oder `FANCYCODE_DESKTOP=1` steht in der
Umgebung), stell die Rückfragen als **ein Formular** mit `fancycode_form`, z. B.:
- `where` (radio): „Auf dem Server“, „Hier auf diesem PC“
- `access` (select): „SSH“, „RCON“, „Panel (Pterodactyl …)“, „Bin schon auf dem Server“
- `target` (text): Host/Benutzer/Serverordner bzw. Projektordner
- `deploy` (radio): „Live deployen“, „Nur bauen“, „Erst fragen“
- `remember` (checkbox): „Antworten für dieses Projekt merken“

Kommt keine Antwort oder gibt es die Werkzeuge nicht, frag normal im Chat und warte auf die Antwort.

Passwörter (RCON, Panel-API-Keys) **nie im Chat erfragen**. Bitte den Nutzer, sie als Umgebungsvariable zu setzen
(`MC_RCON_PASSWORD`, `PANEL_API_KEY`) oder vorhandene Dateien wie `server.properties` zu nutzen.

Biete am Ende der Rückfragen an, die Antworten (ohne Geheimnisse) in `.minecraft-hub.json` zu speichern:
```json
{ "where": "server", "access": "ssh", "host": "mc.example.net", "user": "mc", "serverDir": "/srv/minecraft", "deploy": "build-only", "software": "paper", "version": "1.21.4" }
```

## 3. Arbeiten

Erst die Lage prüfen, dann ändern:
- Software und Version erkennen: `version_history.json`, `paper-global.yml` → Paper; `purpur.yml` → Purpur; `velocity.toml` → Velocity; `config.yml` + `modules.yml` → BungeeCord/Waterfall; `mods/` + `fabric-server-launch.jar` / `libraries/net/neoforged` → Fabric/NeoForge; `bedrock_server` → Bedrock.
- Java-Version passend zur Minecraft-Version: 1.20.5+ braucht Java 21, 1.18–1.20.4 Java 17.
- Logs zuerst: `logs/latest.log` (Fehler, Stacktraces, „Could not load plugin“). Fehler an der Ursache beheben, nicht nur die Meldung.
- Laufende Server erkennen: `screen -ls`, `tmux ls`, `systemctl status <dienst>`, Docker-Container, Prozess `java -jar`.

### Plugins entwickeln (Paper/Spigot/Velocity)
- Gradle (Kotlin DSL) mit `io.papermc.paperweight.userdev` oder `paper-api` als `compileOnly`, Java-Toolchain passend zur Version.
- `plugin.yml` bzw. `paper-plugin.yml` mit `api-version`, Befehle und Rechte dort eintragen. Abhängigkeiten per Shadow einbetten und relocaten.
- Lokal testen mit `xyz.jpenilla.run-paper` (`./gradlew runServer`) statt auf dem Live-Server.
- Nichts Blockierendes im Main-Thread (Datenbank, HTTP, Dateien → async). Folia: Region-Scheduler statt `Bukkit.getScheduler()`.
- Texte mit Adventure/MiniMessage, keine §-Codes in neuem Code.
- Konfiguration mit Standardwerten (`saveDefaultConfig()`), bestehende Configs des Nutzers nie überschreiben.

### Mods (Fabric/Forge/NeoForge) und Datapacks
- Mod-Vorlagen über die offiziellen Generatoren (Fabric Template, NeoForge MDK). Client- und Server-Seite trennen.
- Datapacks: `pack.mcmeta` mit dem richtigen `pack_format` für die Version, Funktionen unter `data/<namespace>/function/` (ab 1.21 Einzahl).

### Befehle und RCON
- Per RCON z. B. mit `mcrcon -H <host> -P <port> -p "$MC_RCON_PASSWORD" "list"`. Fehlt ein Client, ein kleines Skript schreiben (RCON-Protokoll: Login-Paket Typ 3, Befehl Typ 2).
- Auf dem Server ohne RCON: Befehle in die laufende Konsole schicken (`screen -S <name> -X stuff "say hi\n"`, `tmux send-keys -t <name> "say hi" Enter`) oder über die Panel-API.

## 4. Deployen (nur wie in Schritt 2 erlaubt)

- **Vorher sichern:** betroffene Plugin-JARs und Configs kopieren (`*.bak-<datum>`), bei größeren Eingriffen Welt-Backup anbieten.
- **JARs atomar austauschen:** neue Datei als `.tmp` hochladen, dann `mv` über die alte. Nie `cp` direkt über eine laufende JAR.
- **Kein `/reload`.** Plugins per Neustart laden; einzelne Plugins nur, wenn das Plugin selbst einen Reload-Befehl hat.
- **Neustart nur ohne Spieler** oder mit Ankündigung: vorher `list` prüfen. Sind Spieler online, nachfragen und mit Countdown warnen (`say Neustart in 60 Sekunden`), danach sauber stoppen (`stop`), nicht killen.
- Welten, Spielerdaten und Datenbanken nie löschen oder zurücksetzen, außer der Nutzer sagt es ausdrücklich.
- Nach dem Deploy: Server-Log prüfen, ob das Plugin ohne Fehler geladen ist (`Enabling <Plugin>`), und das Ergebnis melden.

Bei **Nur bauen**: Build ausführen, Pfad zur fertigen Datei nennen und in 1–3 Sätzen sagen, wohin sie gehört.

## 5. Abschluss

Kurz zusammenfassen: was geändert, wo die Datei liegt, was live ist, was der Nutzer noch tun muss.
Ist das Werkzeug `fancycode_notify` verfügbar, schick am Ende ein Popup „Aufgabe fertig“ mit einer Zeile zum Ergebnis.
