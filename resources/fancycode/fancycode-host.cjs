// Einbindung der Harness „FancyCode“ in FancyCode Desktop und FancyGames Studio.
// Wird zusammen mit fancycode.mjs per scripts/sync-to-apps.mjs in die Apps kopiert – dort nicht ändern.
//  - install(): legt die Befehle „fancycode“ (sh) und „fancycode.cmd“ im bin-Ordner der App an
//  - ensureSession(): gibt der Harness eine eigene Sitzung des angemeldeten FancyServers-Kontos
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const isWin = process.platform === 'win32';
// Kennung in unseren Launchern: daran erkennen wir beim Aktualisieren, dass die Datei von uns ist.
const MARKER = 'fancycode – automatisch von FancyCode Desktop verwaltet';

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

/** Schreibt Bundle und Launcher (sh + cmd) in einen Ordner; aktualisiert nur, was sich ändert. */
function writeSet(dir, bundle, runtime) {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'fancycode.mjs');
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
    writeIfChanged(path.join(dir, 'fancycode'), `#!/bin/sh\n# ${MARKER}\n${self}ELECTRON_RUN_AS_NODE=1 exec ${q(runtime.electron)} "$(dirname "$self")/fancycode.mjs" "$@"\n`, 0o755);
    writeIfChanged(path.join(dir, 'fancycode.cmd'), `@ECHO off\r\nREM ${MARKER}\r\nSET dp0=%~dp0\r\nSET ELECTRON_RUN_AS_NODE=1\r\n${q(runtime.electron)} "%dp0%\\fancycode.mjs" %*\r\n`, 0o644);
  } else {
    writeIfChanged(path.join(dir, 'fancycode'), `#!/bin/sh\n# ${MARKER}\n${self}exec node "$(dirname "$self")/fancycode.mjs" "$@"\n`, 0o755);
    // Gleicher Aufbau wie npm-Shims, damit Apps sie ohne cmd.exe direkt mit node starten können.
    writeIfChanged(path.join(dir, 'fancycode.cmd'), `@ECHO off\r\nREM ${MARKER}\r\nSET dp0=%~dp0\r\nnode "%dp0%\\fancycode.mjs" %*\r\n`, 0o644);
  }
  return dir;
}

/** Ordner, in dem „fancycode“ auch in normalen Terminals liegt (außerhalb der App). */
function globalDir() {
  if (isWin) return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'FancyServers', 'bin');
  return path.join(os.homedir(), '.local', 'bin');
}

/** Windows: Ordner dauerhaft an den PATH des Nutzers hängen (nur wenn er dort fehlt). */
function ensureUserPath(dir) {
  try {
    const { execFileSync } = require('node:child_process');
    const d = dir.replace(/'/g, "''");
    const ps = `$d='${d}';$p=[Environment]::GetEnvironmentVariable('Path','User');if(-not (($p -split ';') -contains $d)){if($p){$p=$p.TrimEnd(';')+';'+$d}else{$p=$d};[Environment]::SetEnvironmentVariable('Path',$p,'User')}`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 15000, windowsHide: true });
  } catch {}
}

/**
 * Legt „fancycode“ auch außerhalb der App ab, damit der Befehl in jedem Terminal gilt und nach jedem
 * App-Update automatisch die neue Fassung nutzt. Fremde Installationen bleiben unangetastet.
 */
function installGlobal(bundle, runtime) {
  const dir = globalDir();
  const target = path.join(dir, 'fancycode');
  try {
    let st = null;
    try {
      st = fs.lstatSync(target);
    } catch {}
    // Alte Verweise (z. B. auf einen früheren Build) ersetzen, fremde Dateien in Ruhe lassen.
    if (st && st.isSymbolicLink()) fs.unlinkSync(target);
    else if (st && !fs.readFileSync(target, 'utf8').includes(MARKER)) {
      console.log(`[fancycode] ${target} stammt nicht von FancyCode Desktop – bleibt unverändert.`);
      return '';
    }
    writeSet(dir, bundle, runtime);
    if (isWin) ensureUserPath(dir);
    return target;
  } catch (err) {
    console.warn('[fancycode] Befehl außerhalb der App:', err.message);
    return '';
  }
}

/** Merkzettel: womit und womit gebündelt FancyCode Desktop zuletzt lief (für andere Apps). */
function desktopRecord() {
  return path.join(configDir(), 'desktop.json');
}

/**
 * Sucht eine installierte FancyCode Desktop über den Merkzettel im gemeinsamen Config-Ordner.
 * Liefert { runtime, bundle } oder null – andere Apps starten damit die Harness ohne eigenes Node.js.
 */
function findDesktop() {
  try {
    const rec = JSON.parse(fs.readFileSync(desktopRecord(), 'utf8'));
    if (!rec?.runtime || !fs.existsSync(rec.runtime)) return null;
    return { runtime: rec.runtime, bundle: rec.bundle && fs.existsSync(rec.bundle) ? rec.bundle : '' };
  } catch {
    return null;
  }
}

function rememberDesktop(runtime, bundle) {
  try {
    const data = JSON.stringify({ app: 'FancyCode Desktop', runtime: runtime.electron, bundle, saved: Date.now() }, null, 2);
    const file = desktopRecord();
    let same = false;
    try {
      same = fs.readFileSync(file, 'utf8') === data;
    } catch {}
    if (same) return;
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(file, data, { mode: 0o600 });
  } catch {}
}

/**
 * bundle: Pfad zu fancycode.mjs in den App-Ressourcen.
 * runtime: { electron: execPath } startet mit Electron als Node, sonst { node: 'node' }.
 * global: auch außerhalb der App installieren (Standard: ja, wenn Electron die Laufzeit ist).
 * Liefert den bin-Ordner, den die App an PATH hängt.
 */
function install({ bundle, binDir, runtime, global }) {
  writeSet(binDir, bundle, runtime);
  if (global ?? Boolean(runtime.electron)) {
    const where = installGlobal(bundle, runtime);
    if (runtime.electron) rememberDesktop(runtime, where ? path.join(globalDir(), 'fancycode.mjs') : path.join(binDir, 'fancycode.mjs'));
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
 * IPC für die grafische Ansicht: startet pro Ansicht eine Harness im Protokoll-Modus (fancycode --sdk,
 * mit opts.engine = 'claude' über die Claude-CLI)
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
    if (typeof p.stop === 'function') {
      try {
        p.stop();
      } catch {}
      return;
    }
    try {
      p.child.stdin.end();
    } catch {}
    setTimeout(() => {
      try {
        p.child.kill();
      } catch {}
    }, 3000).unref();
  };

  const stripAnsi = (str) =>
    String(str || '')
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '');

  const AGY_MODELS = [
    { id: 'Gemini 3.5 Flash (Medium)', label: 'Gemini 3.5 Flash (Medium)', note: 'Google Antigravity' },
    { id: 'Gemini 3.5 Flash (High)', label: 'Gemini 3.5 Flash (High)', note: 'Google Antigravity' },
    { id: 'Gemini 3.1 Pro (High)', label: 'Gemini 3.1 Pro (High)', note: 'Google Antigravity' },
    { id: 'Claude Sonnet 4.6 (Thinking)', label: 'Claude Sonnet 4.6 Thinking', note: 'Google Antigravity' },
    { id: 'Claude Opus 4.6 (Thinking)', label: 'Claude Opus 4.6 Thinking', note: 'Google Antigravity' },
    { id: 'GPT-OSS 120B (Medium)', label: 'GPT-OSS 120B', note: 'Google Antigravity' },
  ];

  // Startet Antigravity CLI (agy) oder eine eigene CLI-Engine im selben JSON-Protokoll für FancyCodePanel.
  const startCustomCliSession = ({ id, cwd, engine, command, label, sender }) => {
    const emit = (ev) => {
      if (!sender.isDestroyed()) sender.send('fancycode:event', id, ev);
    };
    const isAgy = engine === 'agy' || /^agy(\s|$)/i.test(String(command || '').trim());
    const cmdString = String(command || (isAgy ? 'agy' : engine)).trim() || 'agy';
    const displayLabel = String(label || (isAgy ? 'Antigravity CLI' : engine)).trim();
    const models = isAgy
      ? AGY_MODELS
      : [{ id: 'default', label: displayLabel, note: cmdString }];
    const modes = [
      { id: 'default', label: 'Nachfragen', hint: 'Standard-CLI-Ausführung' },
      { id: 'bypass', label: 'Alles erlauben', hint: 'Keine Rückfragen (--dangerously-skip-permissions)' },
    ];
    const efforts = isAgy ? ['low', 'medium', 'high'] : [];
    let currentModel = models[0].id;
    let currentMode = 'bypass';
    let currentEffort = isAgy ? 'medium' : '';
    let messageCount = 0;
    let activeChild = null;

    const getAccount = () => ({ name: displayLabel, plan: 'CLI' });

    const killActive = () => {
      if (!activeChild) return false;
      const c = activeChild;
      activeChild = null;
      try {
        c.kill('SIGTERM');
      } catch {}
      return true;
    };

    const runPrompt = (promptText) => {
      const text = String(promptText || '').trim();
      if (!text) {
        emit({ type: 'done' });
        return;
      }
      killActive();
      messageCount += 1;

      const parts = cmdString.split(/\s+/).filter(Boolean);
      const bin = parts[0];
      const baseBin = path.basename(bin).toLowerCase().replace(/\.(exe|cmd|bat)$/i, '');
      const extraParts = parts.slice(1);
      let args = [...extraParts];
      let stdinPayload = '';

      if (isAgy || baseBin === 'agy' || baseBin === 'antigravity') {
        args.push('-p', text);
        if (currentModel && currentModel !== 'default') {
          args.push('--model', currentModel);
        }
        if (currentMode === 'bypass') {
          args.push('--dangerously-skip-permissions');
        }
      } else if (baseBin === 'codex') {
        args.push('exec', '-', '--cd', cwd, '--color', 'never', '--skip-git-repo-check');
        if (currentMode === 'bypass') {
          args.push('--sandbox', 'danger-full-access', '--dangerously-bypass-approvals-and-sandbox');
        }
        stdinPayload = text;
      } else if (baseBin === 'claude') {
        args.push('-p', '--output-format', 'text');
        if (currentMode === 'bypass') args.push('--dangerously-skip-permissions');
        stdinPayload = text;
      } else if (baseBin === 'hermes') {
        args.push('chat', '--query-file', '-');
        stdinPayload = text;
      } else if (baseBin === 'opencode') {
        args.push('run', '--dir', cwd, text);
      } else if (baseBin === 'cursor-agent' || baseBin === 'agent') {
        args.push('-p', text, '--output-format', 'text');
      } else if (cmdString.includes('{prompt}')) {
        args = extraParts.map((part) => part.replace(/\{prompt\}/g, text));
      } else {
        args.push(text);
      }

      emit({
        type: 'tool_use',
        id: `cli-${Date.now()}`,
        name: baseBin || engine,
        kind: 'bash',
        summary: `${bin} ${args.map((a) => (a === text ? `"${text.slice(0, 48)}${text.length > 48 ? '…' : ''}"` : a)).join(' ')}`,
        preview: cwd,
      });

      const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
      delete env.ELECTRON_RUN_AS_NODE;

      let child;
      try {
        child = spawn(bin, args, {
          cwd,
          env,
          shell: process.platform === 'win32',
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        emit({ type: 'error', engine, message: `${displayLabel} konnte nicht gestartet werden: ${err.message}` });
        emit({ type: 'done' });
        return;
      }

      activeChild = child;
      let emittedText = false;
      let errBuf = '';

      if (stdinPayload) {
        try {
          child.stdin.write(stdinPayload);
        } catch {}
      }
      try {
        child.stdin.end();
      } catch {}

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        const clean = stripAnsi(chunk);
        if (!clean) return;
        emittedText = true;
        emit({ type: 'text', text: clean });
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        const clean = stripAnsi(chunk);
        errBuf = (errBuf + clean).slice(-4000);
      });

      child.on('error', (err) => {
        if (activeChild === child) activeChild = null;
        emit({
          type: 'error',
          engine,
          message: `${displayLabel} (${bin}) konnte nicht gestartet werden: ${err.message}`,
        });
        emit({ type: 'done' });
      });

      child.on('close', (code) => {
        const wasActive = activeChild === child;
        if (wasActive) activeChild = null;
        if (!wasActive) return;
        if (code && !emittedText) {
          emit({
            type: 'error',
            engine,
            message: errBuf.trim() || `${displayLabel} wurde mit Code ${code} beendet.`,
          });
        } else if (errBuf.trim() && !emittedText) {
          emit({ type: 'text', text: errBuf.trim() });
        }
        emit({ type: 'done' });
      });
    };

    const onMessage = (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'abort') {
        if (killActive()) emit({ type: 'done', aborted: true });
        return;
      }
      if (msg.type === 'set') {
        if (msg.model) currentModel = String(msg.model);
        if (msg.mode) currentMode = String(msg.mode);
        if (msg.effort) currentEffort = String(msg.effort);
        emit({
          type: 'state',
          engine,
          account: getAccount(),
          model: currentModel,
          mode: currentMode,
          modes,
          efforts,
          effort: currentEffort,
        });
        return;
      }
      if (msg.type === 'command') {
        switch (msg.name) {
          case 'models':
            emit({
              type: 'models',
              current: currentModel,
              data: { default: models[0].id, models },
            });
            break;
          case 'new':
            killActive();
            messageCount = 0;
            emit({ type: 'session' });
            break;
          case 'sessions':
            emit({ type: 'sessions', list: [] });
            break;
          case 'status':
            emit({
              type: 'status',
              data: {
                account: getAccount(),
                model: currentModel,
                effort: currentEffort,
                mode: currentMode,
                modes,
                cwd,
                session: id.slice(0, 8),
                messages: messageCount,
                usage: { input: 0, output: 0 },
                mcp: [],
                version: cmdString,
                engine,
              },
            });
            break;
          case 'init':
            runPrompt('Analysiere dieses Projekt und erstelle eine kompakte Projektübersicht.');
            break;
          default:
            break;
        }
        return;
      }
      if (msg.type === 'prompt') {
        runPrompt(msg.text);
      }
    };

    setImmediate(() => {
      emit({
        type: 'ready',
        engine,
        account: getAccount(),
        model: currentModel,
        mode: currentMode,
        modes,
        efforts,
        effort: currentEffort,
      });
    });

    return {
      sender,
      send: onMessage,
      stop: () => {
        killActive();
      },
    };
  };

  // allow(event): nur Aufrufe aus dem eigenen App-Fenster zulassen.
  ipcMain.handle('fancycode:start', (event, opts) => {
    if (!allow(event)) throw new Error('Nicht erlaubt');
    const cwd = String(opts?.cwd || '');
    if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`Ordner nicht gefunden: ${cwd}`);
    const id = crypto.randomUUID();
    const engine = opts?.engine ? String(opts.engine) : 'fancycode';
    if (engine !== 'fancycode' && engine !== 'claude') {
      const customSession = startCustomCliSession({
        id,
        cwd,
        engine,
        command: opts?.command ? String(opts.command) : engine,
        label: opts?.label ? String(opts.label) : engine,
        sender: event.sender,
      });
      procs.set(id, customSession);
      event.sender.once('destroyed', () => stop(id));
      return id;
    }
    const env = { ...process.env, FANCYCODE_APP: '1', NO_COLOR: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    if (apiBase) env.FANCY_API_URL = apiBase();
    const args = [bundle, '--sdk', '--cwd', cwd, ...extraArgs];
    if (opts?.resume) args.push('--resume', String(opts.resume).slice(0, 60));
    // „claude“: dieselbe Ansicht, aber mit der installierten Claude-CLI des Nutzers (siehe src/claude.mjs).
    if (opts?.engine === 'claude') args.push('--engine', 'claude');
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
    if (typeof p.send === 'function') {
      try {
        p.send(msg);
      } catch {}
      return;
    }
    try {
      p.child.stdin.write(`${JSON.stringify(msg)}\n`);
    } catch {}
  });

  ipcMain.on('fancycode:stop', (event, id) => {
    if (procs.get(String(id))?.sender === event.sender) stop(String(id));
  });

  return { stopAll: () => [...procs.keys()].forEach(stop) };
}

module.exports = { install, findDesktop, ensureSession, registerIpc, configDir };
