'use strict';

// Language for texts that the main process shows itself (native dialogs and
// IPC error messages). The choice comes from the UI and is stored next to the
// other app data, so dialogs are already in the right language on next start.
const fs = require('fs');
const path = require('path');

let current = 'de';
let storageFile = '';

const EN = {
  // Native dialog titles
  'Speicherort fuer neues Projekt auswaehlen': 'Choose location for new project',
  'Projektordner auswaehlen': 'Choose project folder',
  'Dateien anhaengen': 'Attach files',
  'Theme-Hintergrund auswaehlen': 'Choose theme background',
  'Desktop-App als Tab hinzufuegen': 'Add desktop app as tab',
  'Codex-Plugin-Ordner auswaehlen': 'Choose Codex plugin folder',
  'Fuer FancyCode Android exportieren': 'Export for FancyCode Android',
  'Datei speichern unter': 'Save file as',
  'Dateien zum Hochladen auswaehlen': 'Choose files to upload',
  'Datei auswaehlen': 'Choose file',
  'Alle Medien': 'All media',
  'Apps und Verknuepfungen': 'Apps and shortcuts',
  'Alle Dateien': 'All files',
  'Programme und Starter': 'Programs and launchers',

  // Window, tabs and embedding
  'Das Fenster von FancyCode Desktop ist nicht bereit.': 'The FancyCode Desktop window is not ready.',
  'Das Fenster von FancyCode Desktop ist nicht offen.': 'The FancyCode Desktop window is not open.',
  'FancyCode Desktop hat nicht rechtzeitig geantwortet.': 'FancyCode Desktop did not respond in time.',
  'Native App-Tabs sind aktuell nur unter Windows verfuegbar.': 'Native app tabs are currently only available on Windows.',
  'Noch kein eingebettetes Fenster.': 'No embedded window yet.',
  'App-Fenster beendet.': 'App window closed.',
  'Kein Fenster eingebettet.': 'No window embedded.',
  'Native Tab-ID fehlt.': 'Native tab ID missing.',
  'App-Pfad fehlt.': 'App path missing.',
  'Die App wurde auf diesem Pfad nicht gefunden.': 'The app was not found at this path.',
  'Die App konnte nicht gestartet werden.': 'The app could not be started.',
  'Apps werden unter macOS und Linux in einem eigenen Fenster gestartet.': 'Apps start on macOS and Linux in their own window.',
  'Native Fensterantwort konnte nicht gelesen werden.': 'The native window response could not be read.',
  'URL-Protokoll nicht erlaubt.': 'URL protocol not allowed.',
  'Nur spotify:-Links sind hier erlaubt.': 'Only spotify: links are allowed here.',
  'Nur lokale Dateipfade sind erlaubt.': 'Only local file paths are allowed.',

  // Agents, CLIs and servers
  'CLI fehlt.': 'CLI missing.',
  'Agent laeuft': 'Agent running',
  'Ohne Projekt': 'No project',
  'Git wurde nicht gefunden.': 'Git was not found.',
  'npm wurde nicht gefunden.': 'npm was not found.',
  'npm konnte nicht ausgefuehrt werden.': 'npm could not be run.',
  'PowerShell wurde nicht gefunden.': 'PowerShell was not found.',
  'Kein Test-, Lint- oder TypeScript-Pruefbefehl im Projekt gefunden.': 'No test, lint or TypeScript check command found in the project.',
  'Kein Modell angegeben.': 'No model specified.',
  'V-Server fehlt.': 'VPS missing.',
  'V-Server: Port ist ungueltig.': 'VPS: port is invalid.',
  'V-Server: Key-Datei fehlt. Bitte Key neu hochladen.': 'VPS: key file missing. Please upload the key again.',
  'Dieser Server steht nicht mehr in den Konfigurationen.': 'This server is no longer in the configurations.',
  'Der Eintrag hat weder command noch url.': 'The entry has neither command nor url.',
  'Dieser Server laeuft nicht.': 'This server is not running.',
  'Der Server liess sich nicht starten.': 'The server could not be started.',
  'Keine Antwort auf {method}.': 'No response to {method}.',
  'Der MCP-Server nimmt keine Eingaben mehr an.': 'The MCP server no longer accepts input.',
  'Der MCP-Server wurde beendet (Code {code}).': 'The MCP server stopped (code {code}).',
  'Der MCP-Server hat keine verwertbare Antwort geschickt.': 'The MCP server sent no usable response.',
  'Fuer Antigravity wird unter Windows die native agy-Installation benoetigt, kein unsicherer .cmd-Wrapper.': 'Antigravity on Windows requires the native agy installation, not an unsafe .cmd wrapper.',
  'Dieser Ordner enthaelt keine .codex-plugin/plugin.json.': 'This folder does not contain a .codex-plugin/plugin.json.',
  'Dieses Plugin kann in FancyCode Desktop nicht entfernt werden.': 'This plugin cannot be removed in FancyCode Desktop.',
  'Aktionen (action.cmd) werden nur unter Windows unterstuetzt.': 'Actions (action.cmd) are only supported on Windows.',
  'Aktion konnte nicht gestartet werden: {error}': 'The action could not be started: {error}',
  'Action "{name}" existiert nicht.': 'Action "{name}" does not exist.',
  'action.cmd wurde im Ordner {dir} nicht gefunden.': 'action.cmd was not found in folder {dir}.',
  'Aufnahme konnte nicht gestartet werden: {error}': 'Recording could not be started: {error}',
  'Recording konnte nicht gestartet werden (Code {code})': 'Recording could not be started (code {code})',
  'Modelle konnten nicht geladen werden ({status}): {error}': 'Models could not be loaded ({status}): {error}',
  'Verbunden mit …': 'Connected to …',
  'Ein Agent braucht deine Antwort.': 'An agent needs your answer.',
  'Keine Startdetails in der Konfiguration gefunden.': 'No launch details found in the configuration.',
  'Diese CLI liefert aktuell keine abrufbaren Limitdaten.': 'This CLI currently provides no retrievable limit data.',
  'Antigravity CLI ist nicht installiert.': 'Antigravity CLI is not installed.',
  'Antigravity hat keine Terminalausgabe geliefert.': 'Antigravity returned no terminal output.',
  'Keine Ausgabe.': 'No output.',
  'Keine Workspace-Terminals ausgewaehlt.': 'No workspace terminals selected.',
  'Windows Terminal (wt.exe) wurde nicht gefunden.': 'Windows Terminal (wt.exe) was not found.',
  'Workspace-Panes werden aktuell nur mit Windows Terminal unter Windows gestartet.': 'Workspace panes currently start only with Windows Terminal on Windows.',
  'OpenSSH wurde nicht gefunden. Installiere den Windows-OpenSSH-Client oder fuege ssh zum PATH hinzu.': 'OpenSSH was not found. Install the Windows OpenSSH client or add ssh to PATH.',
  'Key-Datei nicht gefunden.': 'Key file not found.',
  'Das ist kein privater SSH-Key (erwartet z.B. id_ed25519 oder id_rsa, nicht die .pub-Datei).': 'This is not a private SSH key (expected e.g. id_ed25519 or id_rsa, not the .pub file).',
  'PuTTY-Keys (.ppk) werden nicht unterstuetzt. In PuTTYgen: Conversions > Export OpenSSH key.': 'PuTTY keys (.ppk) are not supported. In PuTTYgen: Conversions > Export OpenSSH key.',
  'Nur Windows Media Session wird aktuell unterstuetzt.': 'Only Windows media sessions are currently supported.',
  'Spotify konnte nicht abgefragt werden.': 'Spotify could not be queried.',
  'Spotify-Antwort konnte nicht gelesen werden.': 'The Spotify response could not be read.',

  // SFTP
  'SFTP: Benutzername fehlt oder ist ungueltig.': 'SFTP: username missing or invalid.',
  'Anmeldung fehlgeschlagen. Key oder Passphrase stimmt nicht.': 'Login failed. Key or passphrase is wrong.',
  'Anmeldung fehlgeschlagen. Bitte Passwort eingeben.': 'Login failed. Please enter the password.',
  'Server nicht gefunden. Adresse pruefen.': 'Server not found. Check the address.',
  'Das SFTP-Modul (ssh2) ist nicht verfuegbar.': 'The SFTP module (ssh2) is not available.',
  'Kein Key hinterlegt. Bitte Passwort eingeben.': 'No key stored. Please enter the password.',
  'Dieser Pfad kann aus Sicherheitsgruenden nicht geloescht werden.': 'This path cannot be deleted for security reasons.',

  // Whisper
  '{label} konnte nicht geladen werden ({status}).': '{label} could not be loaded ({status}).',
  'Entpacken fehlgeschlagen: {error}': 'Extraction failed: {error}',
  'Whisper ist auf diesem System nicht verfuegbar.': 'Whisper is not available on this system.',
  'whisper-server wurde im Download nicht gefunden.': 'whisper-server was not found in the download.',
  'Kein Whisper-Modell installiert.': 'No Whisper model installed.',
  'Whisper ist nicht installiert.': 'Whisper is not installed.',
  'whisper-server startet nicht.': 'whisper-server does not start.',
  'Whisper-Fehler ({status}).': 'Whisper error ({status}).',

  // Plugins
  'Ungültige Plugin-ID.': 'Invalid plugin ID.',
  '{what} konnte nicht geladen werden (HTTP {status}).': '{what} could not be loaded (HTTP {status}).',
  '{what} ist zu groß.': '{what} is too large.',
  'Der Plugin-Katalog ist in dieser Version nicht eingerichtet.': 'The plugin catalog is not configured in this version.',
  'Plugin-Adresse im Katalog ist ungültig.': 'Plugin address in the catalog is invalid.',
  'Dieses Plugin steht nicht im Katalog.': 'This plugin is not in the catalog.',
  'Für dieses Plugin fehlt eine gültige Prüfsumme.': 'This plugin has no valid checksum.',
  'Die Prüfsumme des Downloads stimmt nicht – Installation abgebrochen.': 'The download checksum does not match – installation aborted.',
  'Das Plugin-Manifest ist kein gültiges JSON.': 'The plugin manifest is not valid JSON.',
  'Das Manifest gehört nicht zu diesem Plugin.': 'The manifest does not belong to this plugin.',
  'Das Plugin ist nicht installiert.': 'The plugin is not installed.',

  // Updates
  'Kein Release gefunden ({feed} fehlt in {owner}/{repo}).': 'No release found ({feed} is missing in {owner}/{repo}).',
  'Update-Server nicht erreichbar ({status}).': 'Update server not reachable ({status}).',
  'Installer konnte nicht geladen werden ({status}).': 'The installer could not be downloaded ({status}).',
  'Download beschaedigt (Pruefsumme stimmt nicht).': 'Download corrupted (checksum does not match).',
  'Update {version} gefunden.': 'Update {version} found.',
  'Update fehlgeschlagen.': 'Update failed.',
  'Update-Pruefung fehlgeschlagen.': 'Update check failed.',
  'Update-Datei fehlt.': 'Update file missing.',
  'Bitte erneut nach Updates suchen.': 'Please check for updates again.',

  // Account, skills, sessions
  'Der FancyCode-Server ist in dieser Version nicht eingerichtet.': 'The FancyCode server is not configured in this version.',
  'Bitte melde dich an, um dein Limit zurückzusetzen.': 'Please sign in to reset your limit.',
  'Bitte melde dich an, um die eingebaute KI zu nutzen.': 'Please sign in to use the built-in AI.',
  'Diesen Skill gibt es nicht.': 'This skill does not exist.',
  'Diese Harness gibt es nicht.': 'This harness does not exist.',
  'Session-Host konnte nicht gestartet werden.': 'The session host could not be started.',
  // External servers, projects and plugins
  'Unter {platform} startet die App in einem eigenen Fenster.': 'On {platform} the app opens in its own window.',
  'Externer Server: Host ist ungueltig.': 'External server: host is invalid.',
  'Externer Server: SSH-Benutzer ist ungueltig.': 'External server: SSH user is invalid.',
  'Externer Server: SSH-Port ist ungueltig.': 'External server: SSH port is invalid.',
  'Externer Server: Remote-Projektpfad muss mit / oder ~/ beginnen.': 'External server: remote project path must start with / or ~/.',
  'Externer Server: SSH-Key-Datei wurde nicht gefunden.': 'External server: SSH key file was not found.',
  'OpenSSH wurde nicht gefunden. Installiere den Windows-OpenSSH-Client (Einstellungen > Apps > Optionale Features).': 'OpenSSH was not found. Install the Windows OpenSSH client (Settings > Apps > Optional features).',
  'OpenSSH (ssh) wurde nicht gefunden. Installiere es z.B. mit: brew install openssh': 'OpenSSH (ssh) was not found. Install it e.g. with: brew install openssh',
  'OpenSSH (ssh) wurde nicht gefunden. Installiere es z.B. mit: sudo apt install openssh-client': 'OpenSSH (ssh) was not found. Install it e.g. with: sudo apt install openssh-client',
  'Unbekannter Anbieter im Workspace.': 'Unknown provider in the workspace.',
  '{provider} wurde nicht gefunden. Installiere die CLI und starte FancyCode Desktop neu.': '{provider} was not found. Install the CLI and restart FancyCode Desktop.',
  'Der Key ist mit einer Passphrase geschuetzt. Bitte Passphrase eingeben.': 'The key is protected by a passphrase. Please enter the passphrase.',
  'Verbindung abgelehnt. Laeuft SSH auf diesem Port?': 'Connection refused. Is SSH running on this port?',
  'Der Server-Schluessel hat sich geaendert. Verbindung aus Sicherheitsgruenden abgebrochen (moeglicher Angriff oder Server neu installiert).': 'The server key has changed. Connection aborted for security reasons (possible attack or the server was reinstalled).',
  'Plugin-Pfad liegt ausserhalb des erlaubten Zielordners.': 'Plugin path is outside the allowed target folder.',
  'Waehle einen gueltigen Plugin-Ordner.': 'Choose a valid plugin folder.',
  'Der Plugin-Katalog': 'The plugin catalog',
  'Das Plugin-Manifest': 'The plugin manifest',
  'Das Plugin': 'The plugin',
  'Das Plugin braucht FancyCode Desktop {version} oder neuer.': 'The plugin requires FancyCode Desktop {version} or newer.',
  'Aufgabe ist erledigt.': 'Task completed.',
  'Unbekannter Anbieter.': 'Unknown provider.',
  'Unbekannter Anbieter': 'Unknown provider',
  '{provider} ist nicht installiert.': '{provider} is not installed.',
  '{command} wurde nicht gefunden.': '{command} was not found.',
  'Kein Terminal-Programm gefunden. Installiere {provider} selbst mit: {command}': 'No terminal program found. Install {provider} yourself with: {command}',
  'Installationsfenster fuer {provider} wurde geoeffnet: {command}': 'Installation window for {provider} opened: {command}',
  'Das angeforderte Modell ist fuer diesen Anbieter nicht freigegeben.': 'The requested model is not enabled for this provider.',
  'Die Anfrage ist leer oder zu lang.': 'The request is empty or too long.',
  'Der Projektordner existiert nicht.': 'The project folder does not exist.',
  'Ungueltiger App-Pfad.': 'Invalid app path.',
  'Ungueltiger Pfad.': 'Invalid path.',
  'Fehler beim Lesen des Action-Ordners: {error}': 'Error reading the actions folder: {error}',
  'Fehler beim Loeschen: {error}': 'Error deleting: {error}',
  'Fehler in FancyCode Desktop.': 'Error in FancyCode Desktop.',
  '{file} ist kein reines JSON (Kommentare?). Bitte den Eintrag "{name}" unter "mcp" selbst ergänzen.': '{file} is not plain JSON (comments?). Please add the "{name}" entry under "mcp" yourself.',
  'Schon eingetragen.': 'Already added.',
  '{feed} ist unvollstaendig.': '{feed} is incomplete.',
  'FancyCode Desktop ist aktuell.': 'FancyCode Desktop is up to date.',
  'Warte bis FancyCode Desktop beendet ist...': 'Waiting for FancyCode Desktop to quit...',
  'whisper-server wurde unerwartet beendet.': 'whisper-server exited unexpectedly.',
  'Session-Host wurde beendet.': 'Session host was closed.',
  'MCP-Fehler {code}': 'MCP error {code}',
  'API-Fehler {status}: {error}': 'API error {status}: {error}',

  // Agent prompts and MCP tool descriptions
  'Du darfst die fuer die Aufgabe erforderlichen lokalen Werkzeuge verwenden.': 'You may use the local tools required for the task.',
  'WICHTIG: Arbeite ausschliesslich lesend. Veraendere keine Dateien und fuehre keine destruktiven Befehle aus.': 'IMPORTANT: Work read-only. Do not change any files and do not run destructive commands.',
  'WICHTIG: Veraendere nur Dateien innerhalb dieses Projektordners: {path}': 'IMPORTANT: Only change files inside this project folder: {path}',
  'Antigravity laeuft, liefert aber noch keine Konsolenausgabe. Falls das so bleibt, wartet die CLI vermutlich auf Login, Modellzugriff oder Berechtigungen.': 'Antigravity is running but has not produced console output yet. If this persists, the CLI is probably waiting for login, model access or permissions.',
  'Antigravity laeuft, liefert aber noch keine Konsolenausgabe. Bei schreibenden Aufgaben startet FancyCode Desktop jetzt mit uebersprungenen CLI-Permissions; falls es trotzdem haengt, pruefe Login/Modellzugriff mit `agy` im Terminal.': 'Antigravity is running but has not produced console output yet. For write tasks FancyCode Desktop now continues with skipped CLI permissions; if it still hangs, check login/model access with `agy` in the terminal.',
  'Windows-Sandbox-Setup blockiert lokale Befehle. Starte Codex erneut ohne User-Config...': 'Windows sandbox setup blocks local commands. Restarting Codex without the user config...',
  'Antigravity hat keine direkte Konsolenausgabe geliefert; Antwort aus dem lokalen Transcript wiederhergestellt.': 'Antigravity produced no direct console output; the answer was recovered from the local transcript.',
  'Antigravity wurde beendet, hat aber keine Textausgabe geliefert. Oeffne Antigravity einmal direkt, pruefe Login/Modellzugriff und fuehre `agy update` aus.': 'Antigravity exited without producing text output. Open Antigravity once directly, check login/model access and run `agy update`.',
  'Erstelle einen empfohlenen System-Prompt fuer einen lokalen Coding-Agenten in diesem Projekt. Antworte nur mit dem fertigen System-Prompt, ohne Markdown, ohne Erklaerung. Der Prompt soll kurz, praezise und sicher sein: bestehende Patterns lesen, Nutzerarbeit schuetzen, relevante Dateien aendern, Tests/Builds pruefen, knapp auf Deutsch antworten.': 'Create a recommended system prompt for a local coding agent in this project. Reply only with the finished system prompt, no markdown, no explanation. The prompt should be short, precise and safe: read existing patterns, protect user work, change relevant files, check tests/builds, answer briefly in English.',
  'Steuert die Terminals von FancyCode Desktop: lesen, senden, auf Ergebnisse warten, Sessions starten.': 'Controls the FancyCode Desktop terminals: read, send, wait for results, start sessions.',

  // Account sign-in
  'Anmeldung abgelaufen. Bitte erneut versuchen.': 'Sign-in expired. Please try again.',
  'Bitte melde dich an, um deine Nutzung zu sehen.': 'Please sign in to see your usage.',
  'Bitte melde dich erneut an.': 'Please sign in again.',
  '<!doctype html><meta charset="utf-8"><body style="background:#09090b;color:#f4f4f5;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Angemeldet ✓</h2><p>Du kannst dieses Fenster schließen und zu FancyCode Desktop zurückkehren.</p></div>': '<!doctype html><meta charset="utf-8"><body style="background:#09090b;color:#f4f4f5;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Signed in ✓</h2><p>You can close this window and return to FancyCode Desktop.</p></div>',

};

function detectLocale() {
  try {
    const { app } = require('electron');
    const locale = String(app.getLocale() || '').toLowerCase();
    return locale.startsWith('de') ? 'de' : 'en';
  } catch {
    return 'de';
  }
}

function init(userDataDir) {
  storageFile = path.join(userDataDir, 'language.json');
  current = detectLocale();
  try {
    const saved = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
    if (saved.language === 'de' || saved.language === 'en') current = saved.language;
  } catch {
    // first start: use the system language
  }
}

function setLanguage(language) {
  if (language !== 'de' && language !== 'en') return;
  current = language;
  if (!storageFile) return;
  try {
    fs.mkdirSync(path.dirname(storageFile), { recursive: true });
    fs.writeFileSync(storageFile, JSON.stringify({ language }));
  } catch {
    // read-only profile: keep it in memory
  }
}

function getLanguage() {
  return current;
}

// Translates a German source text; unknown keys fall back to German.
function mt(key, vars) {
  let text = current === 'en' ? EN[key] || key : key;
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])));
  }
  return text;
}

module.exports = { init, setLanguage, getLanguage, mt };
