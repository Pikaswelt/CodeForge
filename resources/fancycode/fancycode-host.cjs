// Einbindung der Harness „FancyCode“ in FancyCode Desktop und FancyGames Studio.
// Wird zusammen mit fancycode.mjs per scripts/sync-to-apps.mjs in die Apps kopiert – dort nicht ändern.
//  - install(): legt die Befehle „fancycode“ (sh) und „fancycode.cmd“ im bin-Ordner der App an
//  - ensureSession(): gibt der Harness eine eigene Sitzung des angemeldeten FancyServers-Kontos
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const isWin = process.platform === 'win32';

function configDir() {
  if (process.env.FANCYCODE_HOME) return process.env.FANCYCODE_HOME;
  if (isWin) return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'fancycode');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'fancycode');
}

function writeIfChanged(file, content, mode) {
  try {
    if (fs.readFileSync(file, 'utf8') === content) return;
  } catch {}
  fs.writeFileSync(file, content, { mode });
}

/**
 * bundle: Pfad zu fancycode.mjs in den App-Ressourcen.
 * runtime: { electron: execPath } startet mit Electron als Node, sonst { node: 'node' }.
 * Liefert den bin-Ordner, den die App an PATH hängt.
 */
function install({ bundle, binDir, runtime }) {
  fs.mkdirSync(binDir, { recursive: true });
  const target = path.join(binDir, 'fancycode.mjs');
  const src = fs.readFileSync(bundle);
  let same = false;
  try {
    same = fs.readFileSync(target).equals(src);
  } catch {}
  if (!same) fs.writeFileSync(target, src);
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  // Wird der Befehl über einen Symlink gestartet (z. B. ~/.local/bin/fancycode), zeigt $0 in den
  // Symlink-Ordner – dort liegt kein fancycode.mjs. Deshalb erst den echten Pfad auflösen.
  const self = `self="$0"\ncase "$self" in /*) ;; *) self="$PWD/$self" ;; esac\nwhile [ -L "$self" ]; do\n  t=$(readlink "$self") || break\n  case "$t" in /*) ;; *) t="$(dirname "$self")/$t" ;; esac\n  self="$t"\ndone\n`;
  if (runtime.electron) {
    writeIfChanged(path.join(binDir, 'fancycode'), `#!/bin/sh\n${self}ELECTRON_RUN_AS_NODE=1 exec ${q(runtime.electron)} "$(dirname "$self")/fancycode.mjs" "$@"\n`, 0o755);
    writeIfChanged(path.join(binDir, 'fancycode.cmd'), `@ECHO off\r\nSET dp0=%~dp0\r\nSET ELECTRON_RUN_AS_NODE=1\r\n${q(runtime.electron)} "%dp0%\\fancycode.mjs" %*\r\n`, 0o644);
  } else {
    writeIfChanged(path.join(binDir, 'fancycode'), `#!/bin/sh\n${self}exec node "$(dirname "$self")/fancycode.mjs" "$@"\n`, 0o755);
    // Gleicher Aufbau wie npm-Shims, damit Apps sie ohne cmd.exe direkt mit node starten können.
    writeIfChanged(path.join(binDir, 'fancycode.cmd'), `@ECHO off\r\nSET dp0=%~dp0\r\nnode "%dp0%\\fancycode.mjs" %*\r\n`, 0o644);
  }
  return binDir;
}

function hasSession() {
  try {
    return Boolean(JSON.parse(fs.readFileSync(path.join(configDir(), 'session.json'), 'utf8')).token);
  } catch {
    return false;
  }
}

/** Legt für die Harness eine eigene Sitzung an, falls sie noch keine hat. appToken = Sitzung der App. */
async function ensureSession({ apiBase, appToken }) {
  if (!apiBase || !appToken || hasSession()) return false;
  const res = await fetch(`${apiBase}/auth/fork`, {
    method: 'POST',
    headers: { authorization: `Bearer ${appToken}`, 'x-fg-app': 'fancycode-cli' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return false;
  const { token, user } = await res.json();
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'session.json');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ token, user: user ? { id: user.id, name: user.name, plan: user.plan } : null, saved: Date.now(), from: 'app' }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  return true;
}

/**
 * IPC für die grafische Ansicht: startet pro Ansicht eine Harness im Protokoll-Modus (fancycode --sdk)
 * und reicht Ereignisse an das Fenster weiter. Kanäle: fancycode:start / :send / :stop, Ereignisse fancycode:event.
 */
function registerIpc({ ipcMain, bundle, runtime, apiBase, extraArgs = [], allow = () => true, log = console }) {
  const { spawn } = require('node:child_process');
  const crypto = require('node:crypto');
  const procs = new Map();

  const stop = (id) => {
    const p = procs.get(id);
    if (!p) return;
    procs.delete(id);
    try {
      p.child.stdin.end();
    } catch {}
    setTimeout(() => {
      try {
        p.child.kill();
      } catch {}
    }, 3000).unref();
  };

  // allow(event): nur Aufrufe aus dem eigenen App-Fenster zulassen.
  ipcMain.handle('fancycode:start', (event, opts) => {
    if (!allow(event)) throw new Error('Nicht erlaubt');
    const cwd = String(opts?.cwd || '');
    if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`Ordner nicht gefunden: ${cwd}`);
    const id = crypto.randomUUID();
    const env = { ...process.env, FANCYCODE_APP: '1', NO_COLOR: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    if (apiBase) env.FANCY_API_URL = apiBase();
    const args = [bundle, '--sdk', '--cwd', cwd, ...extraArgs];
    if (opts?.resume) args.push('--resume', String(opts.resume).slice(0, 60));
    let file = 'node';
    if (runtime.electron) {
      file = runtime.electron;
      env.ELECTRON_RUN_AS_NODE = '1';
    } else if (runtime.resolveNode) {
      file = runtime.resolveNode();
      if (!file) throw new Error('FancyCode braucht Node.js 20 oder neuer. Installiere es von https://nodejs.org und starte die App neu.');
    }
    const child = spawn(file, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const sender = event.sender;
    const emit = (ev) => {
      if (!sender.isDestroyed()) sender.send('fancycode:event', id, ev);
    };
    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        try {
          emit(JSON.parse(line));
        } catch {
          log.warn?.('[fancycode]', line.slice(0, 200));
        }
      }
    });
    let errTail = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => {
      errTail = (errTail + d).slice(-2000);
    });
    child.on('error', (err) => emit({ type: 'error', message: `FancyCode konnte nicht starten: ${err.message}` }));
    child.on('exit', (code) => {
      if (procs.has(id) && code) emit({ type: 'error', message: `FancyCode wurde beendet (Code ${code}). ${errTail.trim().split('\n').slice(-3).join(' ')}` });
      procs.delete(id);
    });
    procs.set(id, { child, sender });
    sender.once('destroyed', () => stop(id));
    return id;
  });

  ipcMain.on('fancycode:send', (event, id, msg) => {
    const p = procs.get(String(id));
    if (!p || p.sender !== event.sender || !msg || typeof msg !== 'object') return;
    try {
      p.child.stdin.write(`${JSON.stringify(msg)}\n`);
    } catch {}
  });

  ipcMain.on('fancycode:stop', (event, id) => {
    if (procs.get(String(id))?.sender === event.sender) stop(String(id));
  });

  return { stopAll: () => [...procs.keys()].forEach(stop) };
}

module.exports = { install, ensureSession, registerIpc, configDir };
