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
const { spawn, spawnSync } = require('node:child_process');
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
    receivedBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
    installing: false,
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
    let lastSent = 0;
    const startedAt = Date.now();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const now = Date.now();
      if (now - lastSent > 200) {
        lastSent = now;
        const percent = total ? Math.min(99, Math.round((received / total) * 100)) : 0;
        setState({
          status: 'downloading',
          percent,
          receivedBytes: received,
          totalBytes: total,
          bytesPerSecond: Math.round(received / Math.max(0.25, (now - startedAt) / 1000)),
          message: `Lade Update ${metadata.version} (${percent}%)...`,
        });
      }
    }
    setState({ status: 'downloading', percent: 100, receivedBytes: received, totalBytes: total || received, message: 'Pruefe Download...' });
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
    if (!state.installerPath || !fs.existsSync(state.installerPath)) {
      setState({ status: 'error', message: 'Update-Datei fehlt.', error: 'Bitte erneut nach Updates suchen.', downloaded: false });
      return false;
    }
    setState({ status: 'installing', installing: true, message: 'Installiere Update...' });
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

    // Runs after CodeForge exits: shows a small progress window, kills leftover
    // processes from the install dir (terminal helpers lock files), installs
    // silently, falls back to a clean install and restarts CodeForge.
    const ps = (value) => value.replace(/'/g, "''");
    const versionText = state.availableVersion ? ` auf ${state.availableVersion}` : '';
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$appPid = ${process.pid}
$installer = '${ps(installerPath)}'
$installDir = '${ps(installDir)}'
$exe = '${ps(exePath)}'
$log = Join-Path (Split-Path $installer) 'install-update.log'
function Log($m) { Add-Content -Path $log -Value "$(Get-Date -Format s) $m" }
Log 'start'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form
$form.Text = 'CodeForge Update'
$form.ClientSize = New-Object System.Drawing.Size(420, 110)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ControlBox = $false
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(24, 24, 27)
$form.ForeColor = [System.Drawing.Color]::White
if (Test-Path $exe) { try { $form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exe) } catch {} }
$title = New-Object System.Windows.Forms.Label
$title.Text = 'CodeForge wird aktualisiert${ps(versionText)}'
$title.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(18, 14)
$title.Size = New-Object System.Drawing.Size(390, 24)
$form.Controls.Add($title)
$label = New-Object System.Windows.Forms.Label
$label.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$label.ForeColor = [System.Drawing.Color]::FromArgb(161, 161, 170)
$label.Location = New-Object System.Drawing.Point(18, 44)
$label.Size = New-Object System.Drawing.Size(390, 20)
$form.Controls.Add($label)
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = New-Object System.Drawing.Point(18, 74)
$bar.Size = New-Object System.Drawing.Size(384, 18)
$bar.Minimum = 0
$bar.Maximum = 100
$form.Controls.Add($bar)
$form.Show()
function Step($text, $value) {
  if ($label.Text -ne $text) { Log $text }
  $label.Text = $text
  $bar.Value = [Math]::Min(100, [Math]::Max(0, $value))
  [System.Windows.Forms.Application]::DoEvents()
}
# Waits for the installer; kills it after the timeout (e.g. stuck on a dialog).
function Wait-Proc($proc, $from, $to, $text, $timeoutSec) {
  $v = $from
  $start = Get-Date
  while (-not $proc.HasExited) {
    if ($v -lt $to) { $v += 1 }
    Step $text $v
    if (((Get-Date) - $start).TotalSeconds -gt $timeoutSec) {
      Log 'installer timeout, killing it'
      Stop-Process -Id $proc.Id -Force
      Start-Sleep -Milliseconds 500
      return $false
    }
    Start-Sleep -Milliseconds 400
  }
  return $true
}
Step 'Warte bis CodeForge beendet ist...' 3
$t = 0
while ((Get-Process -Id $appPid) -and $t -lt 120) { Start-Sleep -Milliseconds 250; [System.Windows.Forms.Application]::DoEvents(); $t++ }
function Stop-AppProcesses {
  Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installDir, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Milliseconds 800
}
function Remove-UninstallEntries($onlyBroken) {
  Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath
    if ($p.DisplayName -like 'CodeForge*' -and ((-not $onlyBroken) -or (-not $p.UninstallString))) { Remove-Item $_.PSPath -Recurse -Force }
  }
}
Step 'Beende alte Prozesse...' 10
Stop-AppProcesses
Remove-UninstallEntries $true
$proc = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru
$finished = Wait-Proc $proc 15 85 'Installiere neue Version...' 120
Log "installer exit $($proc.ExitCode)"
if (-not $finished -or $proc.ExitCode -ne 0 -or -not (Test-Path $exe)) {
  Step 'Erster Versuch fehlgeschlagen, saubere Neuinstallation...' 60
  Stop-AppProcesses
  Remove-Item $installDir -Recurse -Force
  Remove-UninstallEntries $false
  $proc = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru
  [void](Wait-Proc $proc 60 95 'Installiere neu...' 300)
  Log "clean install exit $($proc.ExitCode)"
}
Step 'Fertig. Starte CodeForge...' 100
Start-Sleep -Milliseconds 600
Start-Process -FilePath $exe
$form.Close()
Log 'done'
`;
    const scriptPath = path.join(pendingDir(), 'install-update.ps1');
    fs.writeFileSync(scriptPath, `﻿${script}`, 'utf8');
    // Launch through WMI so the script is not a child of CodeForge: nothing
    // that ends CodeForge's process tree can kill the installer halfway.
    const commandLine = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${scriptPath}"`;
    const launched = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${ps(commandLine)}' }; exit $r.ReturnValue`,
    ], { windowsHide: true, timeout: 20_000 });
    if (launched.status !== 0) {
      spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    }
    setTimeout(() => app.quit(), 300);
    return true;
  }

  function initializeAutoUpdates() {
    if (!app.isPackaged) return;
    setTimeout(() => void checkForAppUpdates(null, { manual: false }), 5000).unref?.();
    setInterval(() => void checkForAppUpdates(null, { manual: false }), CHECK_INTERVAL_MS).unref?.();
  }

  return {
    getUpdateState,
    isInstalling: () => state.installing,
    checkForAppUpdates,
    initializeAutoUpdates,
    installUpdate,
    UPDATE_OWNER,
    UPDATE_REPO,
  };
}

module.exports = { setupUpdater };
