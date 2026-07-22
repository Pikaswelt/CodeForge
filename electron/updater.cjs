/**
 * CodeForge Auto-Updater Module
 * Extracted from electron/main.cjs
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const UPDATE_OWNER = 'Pikaswelt';
const UPDATE_REPO = 'agent-manager';
const UPDATE_LATEST_YML_URL = `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest/download/latest.yml`;
const UPDATE_DOWNLOAD_BASE_URL = `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest/download/`;

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
  const url = valueFor('url') || valueFor('path');
  return {
    version: valueFor('version'),
    sha512: valueFor('sha512'),
    fileName: url ? path.basename(url.replace(/\\/g, '/')) : '',
  };
}

function setupUpdater({ app, mainWindow, autoUpdater }) {
  const updateState = {
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

  function getUpdateState() {
    return {
      ...updateState,
      currentVersion: app.getVersion(),
    };
  }

  function setUpdateState(patch) {
    Object.assign(updateState, patch, { currentVersion: app.getVersion() });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:status', getUpdateState());
    }
    return getUpdateState();
  }

  function updateMetadataCachePath() {
    return path.join(app.getPath('userData'), 'update-metadata.json');
  }

  function readUpdateMetadataCache() {
    try {
      return JSON.parse(fs.readFileSync(updateMetadataCachePath(), 'utf8'));
    } catch {
      return {};
    }
  }

  function writeUpdateMetadataCache(cache) {
    try {
      fs.mkdirSync(path.dirname(updateMetadataCachePath()), { recursive: true });
      fs.writeFileSync(updateMetadataCachePath(), JSON.stringify(cache, null, 2));
    } catch {
      // Update metadata is a convenience cache; auto-updates still work without it.
    }
  }

  async function fetchLatestInstallerMetadata() {
    const response = await fetch(UPDATE_LATEST_YML_URL, {
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    });
    if (!response.ok) throw new Error(`Update-Metadaten nicht erreichbar (${response.status}).`);
    const metadata = parseLatestYml(await response.text());
    if (!metadata.version || !metadata.sha512 || !metadata.fileName) {
      throw new Error('Update-Metadaten sind unvollstaendig.');
    }
    return {
      ...metadata,
      downloadUrl: `${UPDATE_DOWNLOAD_BASE_URL}${encodeURIComponent(metadata.fileName)}`,
    };
  }

  function executeUninstallAndInstall(installerPath) {
    const currentPid = process.pid;
    const uninstallerPath = path.join(path.dirname(process.execPath), 'Uninstall CodeForge.exe');

    if (process.platform === 'win32') {
      const uninstallerPathNormalized = uninstallerPath.replace(/\\/g, '/');
      const installerPathNormalized = installerPath ? installerPath.replace(/\\/g, '/') : '';
      const installDirNormalized = path.dirname(uninstallerPath).replace(/\\/g, '/');
      const releaseDir = 'C:/Users/Chris/Name/name/release';

      const psCommand = `
        $pidToWait = ${currentPid};
        while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) {
          Start-Sleep -Milliseconds 200;
        }
        if (Test-Path "${uninstallerPathNormalized}") {
          Start-Process -FilePath "${uninstallerPathNormalized}" -ArgumentList "/S", "_?=${installDirNormalized}" -Wait;
        }
        $latest = Get-ChildItem -Path "${releaseDir}" -Filter "*.exe" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1;
        if ($latest) {
          Start-Process -FilePath $latest.FullName;
        } elseif ("${installerPathNormalized}" -and (Test-Path "${installerPathNormalized}")) {
          Start-Process -FilePath "${installerPathNormalized}";
        }
      `.replace(/\s+/g, ' ').trim();

      spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    } else {
      if (installerPath) {
        spawn(installerPath, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        }).unref();
      }
    }
    app.quit();
    return true;
  }

  async function installReadyUpdate() {
    if (updateState.installerPath) {
      return executeUninstallAndInstall(updateState.installerPath);
    }
    return false;
  }

  async function downloadSameVersionInstaller(metadata) {
    setUpdateState({
      status: 'downloading',
      availableVersion: metadata.version,
      downloaded: false,
      percent: 0,
      message: 'Aktualisierter Installer wird geladen...',
      error: '',
      installerPath: '',
    });
    const response = await fetch(metadata.downloadUrl, { headers: { 'cache-control': 'no-cache' } });
    if (!response.ok) throw new Error(`Installer konnte nicht geladen werden (${response.status}).`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const targetDir = path.join(app.getPath('userData'), 'pending-updates');
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, metadata.fileName);
    fs.writeFileSync(targetPath, buffer);
    setUpdateState({
      status: 'downloaded',
      downloaded: true,
      percent: 100,
      message: 'Aktualisierter Installer ist bereit.',
      installerPath: targetPath,
    });
    void installReadyUpdate();
  }

  async function checkSameVersionInstallerUpdate() {
    const metadata = await fetchLatestInstallerMetadata();
    const cache = readUpdateMetadataCache();
    const currentVersion = app.getVersion();
    if (compareVersions(metadata.version, currentVersion) !== 0) return false;

    const previousSha = cache[metadata.version]?.sha512 || '';
    writeUpdateMetadataCache({
      ...cache,
      [metadata.version]: {
        sha512: metadata.sha512,
        fileName: metadata.fileName,
        checkedAt: new Date().toISOString(),
      },
    });

    if (!previousSha || previousSha === metadata.sha512) return false;
    await downloadSameVersionInstaller(metadata);
    return true;
  }

  async function downloadAndInstallLatest() {
    if (['downloading'].includes(updateState.status)) return;

    setUpdateState({
      status: 'downloading',
      percent: 0,
      message: 'Lade neuesten Installer...',
      error: '',
      installerPath: '',
    });

    try {
      const metadata = await fetchLatestInstallerMetadata();
      const response = await fetch(metadata.downloadUrl, { headers: { 'cache-control': 'no-cache' } });
      if (!response.ok) throw new Error(`Installer konnte nicht geladen werden (${response.status}).`);

      const contentLength = Number(response.headers.get('content-length')) || 0;
      const reader = response.body.getReader();
      const chunks = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        if (contentLength > 0) {
          const percent = Math.round((receivedLength / contentLength) * 100);
          setUpdateState({
            status: 'downloading',
            percent,
            message: `Lade neuesten Installer (${percent}%)...`,
            error: '',
          });
        }
      }

      const buffer = Buffer.concat(chunks);
      const targetDir = path.join(app.getPath('userData'), 'pending-updates');
      fs.mkdirSync(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, metadata.fileName);
      fs.writeFileSync(targetPath, buffer);

      setUpdateState({
        status: 'downloaded',
        downloaded: true,
        percent: 100,
        message: 'Installer bereit. Starte Installation...',
        installerPath: targetPath,
      });

      executeUninstallAndInstall(targetPath);
    } catch (error) {
      setUpdateState({
        status: 'error',
        message: 'Update fehlgeschlagen.',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function checkForAppUpdates(_event, input = {}) {
    const manual = Boolean(input.manual);
    if (manual) {
      void downloadAndInstallLatest();
      return getUpdateState();
    }

    if (['checking', 'downloading'].includes(updateState.status)) return getUpdateState();
    setUpdateState({
      status: 'checking',
      downloaded: false,
      percent: 0,
      message: 'Pruefe Updates...',
      error: '',
      installerPath: '',
    });

    try {
      const metadata = await fetchLatestInstallerMetadata();
      const currentVersion = app.getVersion();
      const isNewer = compareVersions(metadata.version, currentVersion) > 0;

      if (isNewer) {
        return setUpdateState({
          status: 'available',
          availableVersion: metadata.version,
          downloaded: false,
          percent: 0,
          message: `Update ${metadata.version} verfuegbar.`,
          error: '',
        });
      } else {
        return setUpdateState({
          status: 'idle',
          availableVersion: metadata.version,
          downloaded: false,
          percent: 0,
          message: 'CodeForge ist aktuell.',
          error: '',
          installerPath: '',
        });
      }
    } catch (error) {
      return setUpdateState({
        status: 'error',
        message: 'Update-Pruefung fehlgeschlagen.',
        error: error instanceof Error ? error.message : 'Unbekannter Update-Fehler.',
      });
    }
  }

  function initializeAutoUpdates() {
    autoUpdater.on('checking-for-update', () => {
      setUpdateState({ status: 'checking', message: 'Suche nach Updates...', error: '' });
    });
    autoUpdater.on('update-available', (info) => {
      setUpdateState({
        status: 'available',
        availableVersion: info?.version || '',
        downloaded: false,
        percent: 0,
        message: `Update ${info?.version || ''} gefunden.`.trim(),
        error: '',
      });
    });
    autoUpdater.on('update-not-available', async (info) => {
      setUpdateState({
        status: 'idle',
        availableVersion: info?.version || '',
        downloaded: false,
        percent: 0,
        message: 'CodeForge ist aktuell.',
        error: '',
        installerPath: '',
      });
      try {
        await checkSameVersionInstallerUpdate();
      } catch {
        // A same-version metadata probe should not turn a normal "current" result into an error.
      }
    });
    autoUpdater.on('download-progress', (progress) => {
      setUpdateState({
        status: 'downloading',
        percent: Math.max(0, Math.min(100, Math.round(progress?.percent || 0))),
        message: 'Update wird geladen...',
        error: '',
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      setUpdateState({
        status: 'downloaded',
        availableVersion: info?.version || updateState.availableVersion,
        downloaded: true,
        percent: 100,
        message: 'Update ist bereit.',
        error: '',
      });
      void installReadyUpdate();
    });
    autoUpdater.on('error', (error) => {
      setUpdateState({
        status: 'error',
        message: 'Update-Fehler.',
        error: error instanceof Error ? error.message : String(error || 'Unbekannter Update-Fehler.'),
      });
    });
  }

  return {
    getUpdateState,
    checkForAppUpdates,
    initializeAutoUpdates,
    installUpdate: () => installReadyUpdate(),
    UPDATE_OWNER,
    UPDATE_REPO,
  };
}

module.exports = { setupUpdater };
