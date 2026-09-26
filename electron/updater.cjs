/**
 * CodeForge Auto-Updater
 *
 * Reads latest.yml (Windows) or latest-linux.yml (Linux) from the newest public
 * GitHub release, downloads the matching artifact in the background
 * (sha512-verified) and installs it on request:
 *   Windows  -> silent NSIS install
 *   AppImage -> replaces the running AppImage file and relaunches
 *   .deb     -> opens the package with the system installer
 */
const { spawn } = require('node:child_process');
const { shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const UPDATE_OWNER = 'Pikaswelt';
const UPDATE_REPO = 'CodeForge';
const RELEASE_BASE_URL = `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest/download/`;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function compareVersions(left, right) {
  const a = String(left || '').split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right || '').split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const max = Math.max(a.length, b.length);
  for (let index = 0; index < max; index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return 1;
    if ((a[index] || 0) < (b[index] || 0)) return -1;
  }
  return 0;
}

function parseLatestYml(text) {
  const valueFor = (key) => {
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${key}:\\s*["']?([^"'\\n]+)["']?`, 'i'));
    return match?.[1]?.trim() || '';
  };
  // "files:" entries look like "- url: X" followed by "sha512: Y".
  const files = [...text.matchAll(/-\s*url:\s*["']?([^"'\n]+)["']?\s*\n\s*sha512:\s*["']?([^"'\n]+)/g)].map((match) => ({
    fileName: path.basename(match[1].trim()),
    sha512: match[2].trim(),
  }));
  const wantedExt = process.platform === 'linux' ? (isAppImage() ? '.AppImage' : '.deb') : '.exe';
  const file = files.find((item) => item.fileName.endsWith(wantedExt));
  const url = valueFor('path') || valueFor('url');
  return {
    version: valueFor('version'),
    sha512: file?.sha512 || valueFor('sha512'),
    fileName: file?.fileName || (url ? path.basename(url.replace(/\\/g, '/')) : ''),
  };
}

function isAppImage() {
  return process.platform === 'linux' && Boolean(process.env.APPIMAGE);
}

async function fetchLatestMetadata() {
  const feedFile = process.platform === 'linux' ? 'latest-linux.yml' : 'latest.yml';
  const response = await fetch(`${RELEASE_BASE_URL}${feedFile}`, {
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
  });
  if (response.status === 404) {
    throw new Error(`Kein Release gefunden (${feedFile} fehlt in ${UPDATE_OWNER}/${UPDATE_REPO}).`);
  }
  if (!response.ok) throw new Error(`Update-Server nicht erreichbar (${response.status}).`);
  const metadata = parseLatestYml(await response.text());
  if (!metadata.version || !metadata.fileName) throw new Error(`${feedFile} ist unvollstaendig.`);
  return { ...metadata, downloadUrl: `${RELEASE_BASE_URL}${encodeURIComponent(metadata.fileName)}` };
}

function setupUpdater({ app, mainWindow }) {
  const state = {
    status: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: '',
    downloaded: false,
    percent: 0,
    message: 'Bereit',
    error: '',
    feedUrl: `GitHub Releases: ${UPDATE_OWNER}/${UPDATE_REPO}`,
    installerPath: '',
  };
  let downloadPromise = null;

  const getUpdateState = () => ({ ...state, currentVersion: app.getVersion() });

  function setState(patch) {
    Object.assign(state, patch);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:status', getUpdateState());
    }
    return getUpdateState();
  }

  const pendingDir = () => path.join(app.getPath('userData'), 'pending-updates');

  async function download(metadata) {
    const targetPath = path.join(pendingDir(), metadata.fileName);
    // Reuse an already downloaded, verified installer.
    if (fs.existsSync(targetPath) && (!metadata.sha512 || sha512Of(fs.readFileSync(targetPath)) === metadata.sha512)) {
      return targetPath;
    }
    const response = await fetch(metadata.downloadUrl, { headers: { 'cache-control': 'no-cache' } });
    if (!response.ok || !response.body) throw new Error(`Installer konnte nicht geladen werden (${response.status}).`);
    const total = Number(response.headers.get('content-length')) || 0;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    let lastPercent = -1;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const percent = total ? Math.round((received / total) * 100) : 0;
      if (percent !== lastPercent) {
        lastPercent = percent;
        setState({ status: 'downloading', percent, message: `Lade Update ${metadata.version} (${percent}%)...` });
      }
    }
    const buffer = Buffer.concat(chunks);
    if (metadata.sha512 && sha512Of(buffer) !== metadata.sha512) {
      throw new Error('Download beschaedigt (Pruefsumme stimmt nicht).');
    }
    fs.rmSync(pendingDir(), { recursive: true, force: true });
    fs.mkdirSync(pendingDir(), { recursive: true });
    fs.writeFileSync(targetPath, buffer);
    return targetPath;
  }

  function sha512Of(buffer) {
    return crypto.createHash('sha512').update(buffer).digest('base64');
  }

  async function checkForAppUpdates(_event, input = {}) {
    if (['checking', 'downloading'].includes(state.status)) return getUpdateState();
    if (state.status === 'downloaded' && input.manual) return getUpdateState();
    setState({ status: 'checking', message: 'Pruefe Updates...', error: '' });
    try {
      const metadata = await fetchLatestMetadata();
      if (compareVersions(metadata.version, app.getVersion()) <= 0) {
        return setState({
          status: 'idle',
          availableVersion: metadata.version,
          downloaded: false,
          percent: 0,
          message: 'CodeForge ist aktuell.',
        });
      }
      setState({ status: 'downloading', availableVersion: metadata.version, percent: 0, message: `Update ${metadata.version} gefunden.` });
      downloadPromise = download(metadata);
      const installerPath = await downloadPromise;
      return setState({
        status: 'downloaded',
        downloaded: true,
        percent: 100,
        installerPath,
        message: `Update ${metadata.version} bereit. Zum Installieren neu starten.`,
      });
    } catch (error) {
      return setState({
        status: 'error',
        message: input.manual ? 'Update fehlgeschlagen.' : 'Update-Pruefung fehlgeschlagen.',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      downloadPromise = null;
    }
  }

  function installUpdate() {
    if (!state.installerPath || !fs.existsSync(state.installerPath)) return false;
    const installerPath = state.installerPath;
    const exePath = process.execPath;
    const installDir = path.dirname(exePath);

    if (isAppImage()) {
      // Replace the AppImage in place (allowed while it runs on Linux) and relaunch it.
      const target = process.env.APPIMAGE;
      const temp = `${target}.update`;
      fs.copyFileSync(installerPath, temp);
      fs.chmodSync(temp, 0o755);
      fs.renameSync(temp, target);
      spawn(target, [], { detached: true, stdio: 'ignore' }).unref();
      app.quit();
      return true;
    }

    if (process.platform !== 'win32') {
      // .deb and other packages: hand them to the system installer.
      void shell.openPath(installerPath);
      return true;
    }

    // Runs after CodeForge exits. Kills leftover processes from the install dir
    // (terminal helpers like OpenConsole.exe lock files), removes broken
    // uninstall entries, installs silently and falls back to a clean install.
    const ps = (value) => value.replace(/'/g, "''");
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$appPid = ${process.pid}
$installer = '${ps(installerPath)}'
$installDir = '${ps(installDir)}'
$exe = '${ps(exePath)}'
while (Get-Process -Id $appPid) { Start-Sleep -Milliseconds 250 }
function Stop-AppProcesses {
  Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installDir, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Milliseconds 800
}
function Remove-BrokenUninstallEntries {
  Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath
    if ($p.DisplayName -like 'CodeForge*' -and -not $p.UninstallString) { Remove-Item $_.PSPath -Recurse -Force }
  }
}
Stop-AppProcesses
Remove-BrokenUninstallEntries
$proc = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
if ($proc.ExitCode -ne 0) {
  Stop-AppProcesses
  Remove-Item $installDir -Recurse -Force
  Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' | ForEach-Object {
    if ((Get-ItemProperty $_.PSPath).DisplayName -like 'CodeForge*') { Remove-Item $_.PSPath -Recurse -Force }
  }
  Start-Process -FilePath $installer -ArgumentList '/S' -Wait
}
Start-Process -FilePath $exe
`;
    const scriptPath = path.join(pendingDir(), 'install-update.ps1');
    fs.writeFileSync(scriptPath, `﻿${script}`, 'utf8');
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    app.quit();
    return true;
  }

  function initializeAutoUpdates() {
    if (!app.isPackaged) return;
    setTimeout(() => void checkForAppUpdates(null, { manual: false }), 5000).unref?.();
    setInterval(() => void checkForAppUpdates(null, { manual: false }), CHECK_INTERVAL_MS).unref?.();
  }

  return {
    getUpdateState,
    checkForAppUpdates,
    initializeAutoUpdates,
    installUpdate,
    UPDATE_OWNER,
    UPDATE_REPO,
  };
}

module.exports = { setupUpdater };
