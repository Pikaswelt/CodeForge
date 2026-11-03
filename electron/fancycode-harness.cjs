// Eingebaute Harness „FancyCode“: läuft mit dem Electron dieser App als Node (keine Node-Installation nötig).
// Der Befehl „fancycode“ wird bei jedem Start mitgeliefert und aktualisiert: im bin-Ordner der App und
// zusätzlich außerhalb (~/.local/bin bzw. %LOCALAPPDATA%\FancyServers\bin), damit er in jedem Terminal gilt.
// Die Harness bekommt eine eigene Sitzung des FancyServers-Kontos (kein zweiter Login).
const path = require('node:path');
const { app } = require('electron');
const fancyAccount = require('./fancy-account.cjs');

function resDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'fancycode') : path.join(__dirname, '..', 'resources', 'fancycode');
}

function host() {
  return require(path.join(resDir(), 'fancycode-host.cjs'));
}

function setup() {
  try {
    // AppImage: process.execPath zeigt in einen wechselnden Mount, $APPIMAGE bleibt gleich.
    const electron = process.env.APPIMAGE || process.execPath;
    const bin = host().install({ bundle: path.join(resDir(), 'fancycode.mjs'), binDir: path.join(app.getPath('userData'), 'bin'), runtime: { electron } });
    if (!(process.env.PATH || '').split(path.delimiter).includes(bin)) process.env.PATH = [process.env.PATH, bin].filter(Boolean).join(path.delimiter);
  } catch (err) {
    console.warn('[fancycode] Einrichtung fehlgeschlagen:', err.message);
  }
}

async function syncSession() {
  try {
    await host().ensureSession({ apiBase: fancyAccount.apiBase(), appToken: fancyAccount.sessionToken() });
  } catch (err) {
    console.warn('[fancycode] Sitzung:', err.message);
  }
}

// Grafische Ansicht: Harness pro Projekt im Protokoll-Modus, mit dem Electron dieser App als Node.
function registerIpc(ipcMain, allow) {
  try {
    return host().registerIpc({
      ipcMain,
      bundle: path.join(resDir(), 'fancycode.mjs'),
      runtime: { electron: process.env.APPIMAGE || process.execPath },
      apiBase: fancyAccount.apiBase,
      allow,
    });
  } catch (err) {
    console.warn('[fancycode] IPC:', err.message);
    return null;
  }
}

module.exports = { setup, syncSession, registerIpc };
