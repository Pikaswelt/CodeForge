'use strict';
// FancyCode Desktop MCP server (stdio). Lets an agent such as Claude Code or agy manage FancyCode Desktop's
// terminal sessions: see what each terminal shows, send tasks and keys, wait for results, and
// start or reopen sessions.
//
// Reading and writing go straight to the session host (works while FancyCode Desktop is closed) or, for
// V-Server tabs, to their tmux session over SSH. Starting sessions and opening workspaces goes
// through FancyCode Desktop's control pipe so everything also appears in the FancyCode Desktop window.
//
// Started as: node mcp-server.cjs --data <FancyCode Desktop user data folder>

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { createSessionClient } = require('./session-client.cjs');

const VERSION = '1.0.0';
const dataIndex = process.argv.indexOf('--data');
const userDataDir = dataIndex > 0 ? process.argv[dataIndex + 1] : path.resolve(__dirname, '..', '..');
const hostDir = path.join(userDataDir, 'session-host');

const sessions = createSessionClient({ userDataDir, isPackaged: true, resourcesPath: '' });

function log(...parts) {
  process.stderr.write(`[fancycode-mcp] ${parts.join(' ')}\n`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

const readState = () => readJson(path.join(hostDir, 'control-state.json'), { workspaces: [], accounts: [], servers: [] });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- control pipe (FancyCode Desktop window) ----------

let control = null;
let controlSeq = 0;
const controlPending = new Map();

function connectControl() {
  const info = readJson(path.join(hostDir, 'control.json'), null);
  const token = fs.existsSync(path.join(hostDir, 'token')) ? fs.readFileSync(path.join(hostDir, 'token'), 'utf8').trim() : '';
  if (!info || !token) return Promise.resolve(null);
  return new Promise((resolve) => {
    const socket = net.createConnection(info.pipe);
    socket.setEncoding('utf8');
    let pending = '';
    let ready = false;
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, 3000);
    socket.on('connect', () => socket.write(JSON.stringify({ op: 'hello', token }) + '\n'));
    socket.on('data', (chunk) => {
      pending += chunk;
      let index;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch (_) {
          continue;
        }
        if (!ready && message.hello) {
          ready = true;
          clearTimeout(timer);
          resolve(socket);
        } else if (message.id && controlPending.has(message.id)) {
          const { resolve: done, reject } = controlPending.get(message.id);
          controlPending.delete(message.id);
          if (message.ok) done(message.result);
          else reject(new Error(message.error));
        }
      }
    });
    const drop = () => {
      clearTimeout(timer);
      if (control === socket) control = null;
      for (const { reject } of controlPending.values()) reject(new Error('Verbindung zu FancyCode Desktop verloren.'));
      controlPending.clear();
      if (!ready) resolve(null);
    };
    socket.on('error', drop);
    socket.on('close', drop);
  });
}

// Opens FancyCode Desktop when it is not running, then talks to its window.
async function ensureControl() {
  if (control && !control.destroyed) return control;
  control = await connectControl();
  if (control) return control;
  const info = readJson(path.join(hostDir, 'control.json'), null);
  if (!info || !info.exe || !fs.existsSync(info.exe)) throw new Error('FancyCode Desktop laeuft nicht und wurde nicht gefunden. Bitte FancyCode Desktop einmal starten.');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(info.exe, [], { detached: true, stdio: 'ignore', env }).unref();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(1000);
    control = await connectControl();
    if (control) {
      await sleep(1500); // let the window load its state
      return control;
    }
  }
  throw new Error('FancyCode Desktop wurde gestartet, antwortet aber nicht.');
}

async function askFancyCode(op, args = {}, timeoutMs = 30000) {
  const socket = await ensureControl();
  const id = ++controlSeq;
  const result = new Promise((resolve, reject) => controlPending.set(id, { resolve, reject }));
  socket.write(JSON.stringify({ id, op, args, timeoutMs }) + '\n');
  return Promise.race([
    result,
    sleep(timeoutMs + 2000).then(() => {
      controlPending.delete(id);
      throw new Error('FancyCode Desktop hat nicht rechtzeitig geantwortet.');
    }),
  ]);
}

// ---------- popups, questions and forms in the FancyCode Desktop window ----------
// Terminals of FancyCode Desktop set these, and the agent passes its environment on to this server.
const ownSessionId = process.env.FANCYCODE_SESSION_ID || process.env.CODEFORGE_SESSION_ID || '';
const insideDesktop = process.env.FANCYCODE_DESKTOP === '1' || Boolean(ownSessionId);
let clientName = '';

// Popups never start FancyCode Desktop: without an open window they are skipped.
async function askOpenWindow(op, args, timeoutMs = 30000) {
  if (!(control && !control.destroyed)) control = await connectControl();
  if (!control) throw new Error('FancyCode Desktop ist gerade nicht offen, das Popup wurde nicht gezeigt.');
  return askFancyCode(op, args, timeoutMs);
}

const CLIENT_NAMES = { 'claude-code': 'Claude Code', fancycode: 'FancyCode', opencode: 'OpenCode', 'codex-mcp-client': 'Codex', antigravity: 'Antigravity', 'gemini-cli-mcp-client': 'Gemini CLI' };
const clientLabel = () => CLIENT_NAMES[clientName] || clientName;

const POPUP_KINDS = ['info', 'success', 'warning', 'error'];

function popupBase(args) {
  return {
    title: String(args.title || '').slice(0, 120),
    message: String(args.message || '').slice(0, 1200),
    kind: POPUP_KINDS.includes(args.kind) ? args.kind : 'info',
    sessionId: String(args.session_id || ownSessionId || ''),
    source: clientLabel(),
  };
}

const FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'checkbox', 'radio'];

function cleanFields(fields) {
  if (!Array.isArray(fields) || !fields.length) throw new Error('fields fehlt (mindestens ein Feld).');
  return fields.slice(0, 12).map((field, index) => {
    const type = FIELD_TYPES.includes(field?.type) ? field.type : 'text';
    const options = Array.isArray(field?.options) ? field.options.slice(0, 12).map((option) => String(option).slice(0, 80)) : [];
    if ((type === 'select' || type === 'radio') && !options.length) throw new Error(`Feld ${field?.name || index + 1}: options fehlt.`);
    return {
      name: String(field?.name || `feld${index + 1}`).slice(0, 40),
      label: String(field?.label || field?.name || `Feld ${index + 1}`).slice(0, 120),
      type,
      options,
      placeholder: String(field?.placeholder || '').slice(0, 120),
      default: field?.default === undefined ? undefined : field.default,
      required: Boolean(field?.required),
      help: String(field?.help || '').slice(0, 200),
    };
  });
}

const answerTimeout = (args) => Math.min(1800, Math.max(15, Number(args.timeout_seconds) || 600)) * 1000;

function contextText() {
  const lines = [];
  if (!insideDesktop) {
    lines.push('Dieser Agent laeuft NICHT in einem Terminal von FancyCode Desktop. Popups erscheinen trotzdem im FancyCode Desktop-Fenster, falls es offen ist.');
  } else {
    const info = ownSessionId ? findTab(ownSessionId) : null;
    lines.push('Dieser Agent laeuft in FancyCode Desktop.');
    if (ownSessionId) lines.push(`Eigenes Terminal: session_id ${ownSessionId}${info ? ` ("${info.tab.title}" im Workspace "${info.workspace.title}")` : ''}. Diese Session nie selbst mit fancycode_send/fancycode_keys steuern.`);
  }
  lines.push(`FancyCode Desktop-Fenster offen: ${control && !control.destroyed ? 'ja' : 'nein'}. Popups (fancycode_notify), Fragen (fancycode_ask) und Formulare (fancycode_form) sind verfuegbar.`);
  return lines.join('\n');
}

// ---------- sessions: lookup, read, write ----------

function findTab(sessionId) {
  for (const workspace of readState().workspaces || []) {
    for (const tab of workspace.terminalTabs?.length ? workspace.terminalTabs : [{ id: workspace.workspaceId, title: workspace.title }]) {
      if (tab.id === sessionId) {
        const server = tab.location === 'local' ? undefined : tab.vserver || workspace.vserver;
        return { workspace, tab, server, tmuxName: server ? (tab.agyAccountId ? `cf-agy-${tab.agyAccountId}` : `cf-t-${tab.id}`) : null };
      }
    }
  }
  return null;
}

function savedServer(server) {
  if (!server) return null;
  return (readState().servers || []).find((item) => item.id === server.id) || server;
}

function runSsh(server, remoteCommand, input) {
  return new Promise((resolve) => {
    const full = savedServer(server);
    if (!full || !full.host) {
      resolve({ ok: false, stdout: '', stderr: 'Server unbekannt' });
      return;
    }
    const args = ['-p', String(full.port || 22), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new'];
    if (full.keyPath) args.push('-i', full.keyPath, '-o', 'IdentitiesOnly=yes');
    args.push(`${full.user ? `${full.user}@` : ''}${full.host}`, remoteCommand);
    const child = execFile('ssh', args, { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

const shq = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

let Terminal = null;
async function renderScreen(buffer, cols, rows, scrollback) {
  if (!Terminal) Terminal = require('@xterm/headless').Terminal;
  const term = new Terminal({ cols: Math.max(cols, 20), rows: Math.max(rows, 5), scrollback: 5000, allowProposedApi: true });
  await new Promise((resolve) => term.write(buffer, resolve));
  const active = term.buffer.active;
  const end = active.baseY + term.rows;
  const start = Math.max(0, active.baseY - scrollback);
  const lines = [];
  for (let index = start; index < end; index += 1) lines.push(active.getLine(index)?.translateToString(true) ?? '');
  term.dispose();
  return lines;
}

function tidy(lines, maxLines) {
  const out = [...lines];
  while (out.length && !out[out.length - 1].trim()) out.pop();
  while (out.length && !out[0].trim()) out.shift();
  return out.slice(-maxLines).join('\n');
}

// Where a session lives right now: in the local session host, or only in tmux on a V-Server.
// Cached briefly so fancycode_wait does not open new SSH connections for every poll.
const locateCache = new Map();
async function locate(sessionId) {
  const cached = locateCache.get(sessionId);
  if (cached && Date.now() - cached.at < 10000) return cached.where;
  const where = await locateUncached(sessionId);
  locateCache.set(sessionId, { at: Date.now(), where });
  return where;
}

async function locateUncached(sessionId) {
  const hostSessions = await sessions.list();
  const inHost = hostSessions.find((item) => item.id === sessionId);
  const info = findTab(sessionId);
  if (info?.tmuxName) {
    const check = await runSsh(info.server, `tmux has-session -t ${shq(info.tmuxName)} 2>/dev/null && echo YES`);
    if (check.stdout.includes('YES')) return { kind: 'tmux', info, inHost: Boolean(inHost) };
  }
  if (inHost) return { kind: 'host', info };
  return { kind: 'none', info };
}

async function readSession(sessionId, scrollback = 0, maxLines = 120) {
  const where = await locate(sessionId);
  if (where.kind === 'tmux') {
    const start = scrollback > 0 ? `-S -${Math.min(scrollback, 5000)}` : '';
    const result = await runSsh(where.info.server, `tmux capture-pane -p -J ${start} -t ${shq(where.info.tmuxName)}`);
    if (result.ok) return tidy(result.stdout.split('\n'), maxLines + scrollback);
  }
  if (where.kind === 'host' || where.kind === 'tmux') {
    const snap = await sessions.snapshot(sessionId);
    if (snap) return tidy(await renderScreen(snap.buffer, snap.cols, snap.rows, scrollback), maxLines + scrollback);
  }
  throw new Error(`Session ${sessionId} laeuft nicht. Mit fancycode_overview nachsehen oder mit fancycode_open_workspace / fancycode_start_* starten.`);
}

const HOST_KEYS = {
  enter: '\r', esc: '\x1b', escape: '\x1b', tab: '\t', 'shift+tab': '\x1b[Z', backspace: '\x7f', space: ' ',
  up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D', pageup: '\x1b[5~', pagedown: '\x1b[6~',
  home: '\x1b[H', end: '\x1b[F', delete: '\x1b[3~',
};
const TMUX_KEYS = {
  enter: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab', 'shift+tab': 'BTab', backspace: 'BSpace', space: 'Space',
  up: 'Up', down: 'Down', right: 'Right', left: 'Left', pageup: 'PPage', pagedown: 'NPage', home: 'Home', end: 'End', delete: 'DC',
};

function keyFor(name, forTmux) {
  const key = String(name).trim().toLowerCase();
  const ctrl = key.match(/^ctrl\+([a-z])$/);
  if (ctrl) return forTmux ? `C-${ctrl[1]}` : String.fromCharCode(ctrl[1].charCodeAt(0) - 96);
  const table = forTmux ? TMUX_KEYS : HOST_KEYS;
  if (table[key]) return table[key];
  if (key.length === 1) return forTmux ? null : key;
  throw new Error(`Unbekannte Taste: ${name}`);
}

async function sendKeys(sessionId, keys) {
  const where = await locate(sessionId);
  if (where.kind === 'host' || (where.kind === 'tmux' && where.inHost)) {
    await sessions.list();
    for (const key of keys) {
      sessions.write(sessionId, keyFor(key, false));
      await sleep(80);
    }
    return;
  }
  if (where.kind === 'tmux') {
    for (const key of keys) {
      const mapped = keyFor(key, true);
      const command = mapped ? `tmux send-keys -t ${shq(where.info.tmuxName)} ${mapped}` : `tmux send-keys -t ${shq(where.info.tmuxName)} -l ${shq(key)}`;
      await runSsh(where.info.server, command);
    }
    return;
  }
  throw new Error(`Session ${sessionId} laeuft nicht.`);
}

async function sendText(sessionId, text, submit) {
  const where = await locate(sessionId);
  // Multi-line text goes in as one paste, so the newlines do not submit early.
  const payload = text.includes('\n') ? `\x1b[200~${text}\x1b[201~` : text;
  if (where.kind === 'host' || (where.kind === 'tmux' && where.inHost)) {
    await sessions.list();
    sessions.write(sessionId, payload);
    if (submit) {
      await sleep(400);
      sessions.write(sessionId, '\r');
    }
    return;
  }
  if (where.kind === 'tmux') {
    const name = shq(where.info.tmuxName);
    await runSsh(where.info.server, `tmux load-buffer -b cfmcp - && tmux paste-buffer -p -d -b cfmcp -t ${name}`, text);
    if (submit) {
      await sleep(400);
      await runSsh(where.info.server, `tmux send-keys -t ${name} Enter`);
    }
    return;
  }
  throw new Error(`Session ${sessionId} laeuft nicht.`);
}

async function waitForSession(sessionId, { idleSeconds = 5, timeoutSeconds = 180, untilText } = {}) {
  const started = Date.now();
  let last = null;
  let stableSince = Date.now();
  while (Date.now() - started < timeoutSeconds * 1000) {
    const screen = await readSession(sessionId, 0, 80);
    if (untilText && screen.toLowerCase().includes(String(untilText).toLowerCase())) return { reason: `Text "${untilText}" gefunden`, screen };
    if (screen !== last) {
      last = screen;
      stableSince = Date.now();
    } else if (!untilText && Date.now() - stableSince >= idleSeconds * 1000) {
      return { reason: `seit ${idleSeconds}s keine Aenderung`, screen };
    }
    await sleep(1500);
  }
  return { reason: `Zeitlimit (${timeoutSeconds}s) erreicht`, screen: last || '' };
}

// After a start, the UI opens the terminals; wait until their sessions exist.
async function waitForSessions(ids, timeoutMs = 40000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const running = new Set((await sessions.list()).map((item) => item.id));
    if (ids.every((id) => running.has(id))) return true;
    await sleep(1000);
  }
  return false;
}

async function overview() {
  const state = readState();
  const hostSessions = await sessions.list();
  const hostIds = new Set(hostSessions.map((item) => item.id));
  const accountName = (id) => (state.accounts || []).find((item) => item.id === id)?.name;
  const tmuxByServer = new Map();
  await Promise.all(
    (state.servers || []).map(async (server) => {
      const result = await runSsh(server, "tmux ls -F '#S' 2>/dev/null | grep '^cf-' || true");
      tmuxByServer.set(server.id, result.ok ? new Set(result.stdout.split('\n').map((line) => line.trim()).filter(Boolean)) : null);
    }),
  );
  const lines = [];
  const known = new Set();
  const usedTmux = new Set();
  for (const workspace of state.workspaces || []) {
    const tabs = workspace.terminalTabs?.length ? workspace.terminalTabs : [{ id: workspace.workspaceId, title: workspace.title }];
    lines.push(`Workspace "${workspace.title}" (workspace_id: ${workspace.workspaceId})${workspace.open ? ' - in FancyCode Desktop offen' : ''}`);
    for (const tab of tabs) {
      known.add(tab.id);
      const server = tab.location === 'local' ? undefined : tab.vserver || workspace.vserver;
      const tmuxName = server ? (tab.agyAccountId ? `cf-agy-${tab.agyAccountId}` : `cf-t-${tab.id}`) : null;
      const tmux = server ? tmuxByServer.get(server.id) : null;
      if (tmuxName && tmux?.has(tmuxName)) usedTmux.add(`${server.id}:${tmuxName}`);
      const status = hostIds.has(tab.id)
        ? 'laeuft'
        : tmuxName && tmux?.has(tmuxName)
          ? 'laeuft auf dem Server (nicht in FancyCode Desktop verbunden)'
          : server && tmux === null
            ? 'unbekannt (Server nicht erreichbar)'
            : 'beendet';
      const parts = [`  - session_id: ${tab.id}`, `"${tab.title}"`, server ? `auf ${server.name}` : 'auf diesem PC'];
      if (tab.agyAccountId) parts.push(`Antigravity-Account: ${accountName(tab.agyAccountId) || tab.agyAccountId}`);
      if (tab.command) parts.push(`Befehl: ${tab.command}`);
      parts.push(`Status: ${status}`);
      lines.push(parts.join(' | '));
    }
  }
  const loose = hostSessions.filter((item) => !known.has(item.id));
  if (loose.length) {
    lines.push('Weitere laufende Terminals ohne gespeicherten Workspace:');
    for (const item of loose) lines.push(`  - session_id: ${item.id}`);
  }
  for (const server of state.servers || []) {
    const tmux = tmuxByServer.get(server.id);
    const extra = [...(tmux || [])].filter((name) => !usedTmux.has(`${server.id}:${name}`) && name.startsWith('cf-agy-'));
    if (extra.length) {
      lines.push(`Auf ${server.name} laufen Antigravity-Accounts ohne offenen Workspace (mit fancycode_start_antigravity server="${server.name}" wieder verbinden): ${extra.map((name) => accountName(name.slice(7)) || name).join(', ')}`);
    }
  }
  if (!lines.length) lines.push('Keine Workspaces gespeichert.');
  lines.push('');
  lines.push(`Antigravity-Accounts: ${(state.accounts || []).map((item) => item.name).join(', ') || 'keine'}`);
  lines.push(`V-Server: ${(state.servers || []).map((item) => `${item.name} (${item.host})`).join(', ') || 'keine'}`);
  return lines.join('\n');
}

// ---------- MCP tools ----------

const TOOLS = [
  {
    name: 'fancycode_context',
    description: 'Sagt, ob dieser Agent gerade in einem Terminal von FancyCode Desktop laeuft, und welches seine eigene session_id ist.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'fancycode_notify',
    description: 'Zeigt dem Nutzer ein Popup im FancyCode Desktop-Fenster (im Hintergrund zusaetzlich als System-Benachrichtigung). Darunter ein Button, der zum Terminal des Agenten springt. Nutzen beim Start einer laengeren Aufgabe, wenn sie fertig ist (kind success) oder wenn der Nutzer etwas tun muss.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Kurz, z. B. "Aufgabe fertig".' },
        message: { type: 'string', description: 'Ein bis zwei Saetze.' },
        kind: { type: 'string', enum: POPUP_KINDS },
        button_label: { type: 'string', description: 'Beschriftung des Buttons (Standard "Zur Arbeit").' },
        session_id: { type: 'string', description: 'Terminal, zu dem der Button springt (Standard: das eigene).' },
      },
      required: ['title'],
    },
  },
  {
    name: 'fancycode_ask',
    description: 'Stellt dem Nutzer eine Frage als Popup mit 2-6 Antwort-Buttons und wartet auf die Antwort (Standard 10 Minuten). allow_text=true erlaubt zusaetzlich eine freie Antwort. Gibt die gewaehlte Antwort zurueck.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, description: '2-6 kurze Antworten.' },
        details: { type: 'string', description: 'Optionale Erklaerung unter der Frage.' },
        allow_text: { type: 'boolean' },
        timeout_seconds: { type: 'number' },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'fancycode_form',
    description: 'Zeigt dem Nutzer ein Formular als Popup und wartet, bis er es abschickt (Standard 10 Minuten). Felder: text, textarea, number, select/radio (mit options), checkbox. Gibt die Werte als JSON zurueck. Keine Passwoerter oder Schluessel abfragen.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        message: { type: 'string', description: 'Optionale Erklaerung ueber den Feldern.' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Schluessel in der Antwort.' },
              label: { type: 'string' },
              type: { type: 'string', enum: FIELD_TYPES },
              options: { type: 'array', items: { type: 'string' } },
              placeholder: { type: 'string' },
              default: {},
              required: { type: 'boolean' },
              help: { type: 'string' },
            },
            required: ['name', 'label'],
          },
        },
        submit_label: { type: 'string' },
        timeout_seconds: { type: 'number' },
      },
      required: ['title', 'fields'],
    },
  },
  {
    name: 'fancycode_overview',
    description: 'Listet alle FancyCode Desktop-Workspaces mit ihren Terminals (session_id, Titel, PC oder V-Server, Antigravity-Account, Status) sowie die gespeicherten Accounts und V-Server. Zuerst aufrufen.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'fancycode_read',
    description: 'Zeigt, was gerade in einem Terminal zu sehen ist (gerenderter Bildschirm, auch fuer TUIs wie agy oder Claude Code).',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        scrollback_lines: { type: 'number', description: 'Zusaetzliche Zeilen aus dem Verlauf oberhalb des Bildschirms (Standard 0).' },
        max_lines: { type: 'number', description: 'Hoechstens so viele Bildschirmzeilen zurueckgeben (Standard 120).' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'fancycode_send',
    description: 'Schreibt Text in ein Terminal, z. B. eine Aufgabe fuer den Agenten darin, und schickt ihn standardmaessig mit Enter ab.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        text: { type: 'string' },
        submit: { type: 'boolean', description: 'Danach Enter druecken (Standard true).' },
      },
      required: ['session_id', 'text'],
    },
  },
  {
    name: 'fancycode_keys',
    description: 'Drueckt Tasten in einem Terminal, z. B. ["esc"], ["ctrl+c"], ["down","enter"], ["y"]. Moeglich: enter, esc, tab, shift+tab, backspace, space, up, down, left, right, pageup, pagedown, home, end, delete, ctrl+<buchstabe> und einzelne Zeichen.',
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string' }, keys: { type: 'array', items: { type: 'string' } } },
      required: ['session_id', 'keys'],
    },
  },
  {
    name: 'fancycode_wait',
    description: 'Wartet, bis sich ein Terminal eine Weile nicht mehr veraendert (Agent fertig oder wartet auf Eingabe) oder ein bestimmter Text erscheint, und gibt dann den Bildschirm zurueck.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        idle_seconds: { type: 'number', description: 'So lange ohne Aenderung gilt als fertig (Standard 5).' },
        timeout_seconds: { type: 'number', description: 'Hoechstens so lange warten (Standard 180, max 900).' },
        until_text: { type: 'string', description: 'Stattdessen warten, bis dieser Text auf dem Bildschirm steht.' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'fancycode_start_antigravity',
    description: 'Startet Antigravity (agy) fuer gespeicherte Accounts nebeneinander in FancyCode Desktop, auf diesem PC oder einem V-Server. Laeuft ein Account auf dem Server schon, wird er wieder verbunden. resume=true setzt die letzte agy-Unterhaltung jedes Accounts fort. Optional bekommt jeder Account danach dieselbe Aufgabe.',
    inputSchema: {
      type: 'object',
      properties: {
        accounts: { type: 'array', items: { type: 'string' }, description: 'Account-Namen oder IDs; leer = alle.' },
        server: { type: 'string', description: 'Name des V-Servers; leer = dieser PC.' },
        resume: { type: 'boolean', description: 'Letzte Unterhaltung fortsetzen (agy --continue).' },
        task: { type: 'string', description: 'Aufgabe, die nach dem Start an jeden Account geschickt wird.' },
      },
    },
  },
  {
    name: 'fancycode_start_terminal',
    description: 'Oeffnet einen neuen Workspace mit einem oder mehreren Terminals (bis 6), optional mit Startbefehl (z. B. "claude", "codex", "agy --dangerously-skip-permissions") und auf einem V-Server.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        tabs: {
          type: 'array',
          items: {
            type: 'object',
            properties: { command: { type: 'string' }, server: { type: 'string' }, title: { type: 'string' } },
          },
        },
      },
    },
  },
  {
    name: 'fancycode_add_terminal',
    description: 'Fuegt einem bestehenden Workspace ein Terminal hinzu (max. 6). Ohne server laeuft es auf diesem PC. manager=true oeffnet das Manager-Fenster (Claude Code ohne Rueckfragen, steuert die anderen ueber diesen MCP-Server).',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string' },
        command: { type: 'string' },
        server: { type: 'string' },
        title: { type: 'string' },
        manager: { type: 'boolean' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'fancycode_layout',
    description: 'Stellt in einem offenen Workspace das Layout um (grid = alle Terminals nebeneinander, single = eins gross) und/oder holt ein Terminal nach vorne.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string' },
        layout: { type: 'string', enum: ['grid', 'single'] },
        active_session_id: { type: 'string' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'fancycode_ui_snapshot',
    description: 'Listet alles Bedienbare, was gerade im FancyCode Desktop-Fenster sichtbar ist (Buttons, Felder, Schalter, Tabs, Menues) mit einer Kennung [eN] und dem Zustand. Damit laesst sich jede FancyCode Desktop-Funktion bedienen (Einstellungen, Projekte, Chats, Library, Themes, Automationen ...). Kennungen gelten bis zum naechsten Snapshot.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'fancycode_ui_click',
    description: 'Klickt ein Element aus fancycode_ui_snapshot an (button: left, right fuer Kontextmenue, double). Gibt danach einen neuen Snapshot zurueck.',
    inputSchema: {
      type: 'object',
      properties: { ref: { type: 'string', description: 'z. B. e12' }, button: { type: 'string', enum: ['left', 'right', 'double'] } },
      required: ['ref'],
    },
  },
  {
    name: 'fancycode_ui_type',
    description: 'Tippt Text in ein Feld aus fancycode_ui_snapshot (bei Auswahllisten: den Namen der Option). clear=true ersetzt den bisherigen Inhalt, submit=true drueckt danach Enter. Gibt danach einen neuen Snapshot zurueck.',
    inputSchema: {
      type: 'object',
      properties: { ref: { type: 'string' }, text: { type: 'string' }, clear: { type: 'boolean' }, submit: { type: 'boolean' } },
      required: ['ref', 'text'],
    },
  },
  {
    name: 'fancycode_ui_key',
    description: 'Drueckt eine Taste/Tastenkombination im FancyCode Desktop-Fenster, z. B. "Escape" (Dialog schliessen), "ctrl+," (Einstellungen), "alt+s" (Spracheingabe). Gibt danach einen neuen Snapshot zurueck.',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
  },
  {
    name: 'fancycode_screenshot',
    description: 'Bild des FancyCode Desktop-Fensters, um das Ergebnis von UI-Aktionen zu sehen.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'fancycode_open_workspace',
    description: 'Oeffnet einen gespeicherten Workspace in FancyCode Desktop wieder; seine Terminals verbinden sich mit den laufenden Sessions.',
    inputSchema: { type: 'object', properties: { workspace_id: { type: 'string' } }, required: ['workspace_id'] },
  },
  {
    name: 'fancycode_stop',
    description: 'Beendet einen ganzen Workspace (workspace_id) oder ein einzelnes Terminal (session_id), inklusive der tmux-Session auf dem V-Server.',
    inputSchema: { type: 'object', properties: { workspace_id: { type: 'string' }, session_id: { type: 'string' } } },
  },
];

const INSTRUCTIONS = [
  insideDesktop
    ? `Du laeufst gerade in FancyCode Desktop${ownSessionId ? ` (eigenes Terminal: session_id ${ownSessionId})` : ''}. Wenn eine laengere Aufgabe fertig ist, schick mit fancycode_notify ein Popup (kind success); Entscheidungen mit wenigen Antworten per fancycode_ask, mehrere Angaben auf einmal per fancycode_form.`
    : 'Popups (fancycode_notify), Fragen (fancycode_ask) und Formulare (fancycode_form) erscheinen im FancyCode Desktop-Fenster, wenn es offen ist.',
  'FancyCode Desktop verwaltet Terminal-Workspaces mit KI-Agenten (Antigravity/agy, Claude Code, Codex) auf diesem PC und auf V-Servern.',
  'Ablauf: fancycode_overview -> fancycode_read um den Stand zu sehen -> fancycode_send fuer Aufgaben -> fancycode_wait bis der Agent fertig ist -> fancycode_read.',
  'Bei Rueckfragen im Terminal (z. B. Auswahlmenues) mit fancycode_keys antworten. Vor dem Senden pruefen, ob der Agent gerade arbeitet (dann erst warten).',
  'Fuer alles andere in FancyCode Desktop (Einstellungen, Projekte, Chats, Library, Themes, Automationen ...): fancycode_ui_snapshot, dann fancycode_ui_click / fancycode_ui_type / fancycode_ui_key; fancycode_screenshot zeigt das Ergebnis.',
].join('\n');

function text(value) {
  return { content: [{ type: 'text', text: value }] };
}

async function callTool(name, args = {}) {
  // Older registrations (from before the rename to FancyCode) still call the codeforge_* names.
  if (typeof name === 'string' && name.startsWith('codeforge_')) name = `fancycode_${name.slice(10)}`;
  switch (name) {
    case 'fancycode_context':
      if (!(control && !control.destroyed)) control = await connectControl();
      return text(contextText());
    case 'fancycode_notify':
      await askOpenWindow('notify', { ...popupBase(args), buttonLabel: String(args.button_label || '').slice(0, 40) });
      return text('Popup gezeigt.');
    case 'fancycode_ask': {
      const options = (Array.isArray(args.options) ? args.options : []).slice(0, 6).map((option) => String(option).slice(0, 80)).filter(Boolean);
      if (!options.length && !args.allow_text) throw new Error('options fehlt.');
      const timeoutMs = answerTimeout(args);
      const answer = await askOpenWindow(
        'ask',
        { ...popupBase({ ...args, title: args.question, message: args.details }), question: String(args.question || '').slice(0, 300), options, allowText: Boolean(args.allow_text), timeoutMs },
        timeoutMs,
      ).catch((error) => {
        if (/rechtzeitig/.test(error.message)) return { timedOut: true };
        throw error;
      });
      if (answer?.timedOut) return text('Keine Antwort (Zeit abgelaufen). Im Chat nachfragen statt zu raten.');
      if (answer?.dismissed) return text('Der Nutzer hat die Frage geschlossen, ohne zu antworten.');
      return text(`Antwort: ${answer?.answer ?? ''}`);
    }
    case 'fancycode_form': {
      const fields = cleanFields(args.fields);
      const timeoutMs = answerTimeout(args);
      const answer = await askOpenWindow(
        'form',
        { ...popupBase(args), fields, submitLabel: String(args.submit_label || '').slice(0, 40), timeoutMs },
        timeoutMs,
      ).catch((error) => {
        if (/rechtzeitig/.test(error.message)) return { timedOut: true };
        throw error;
      });
      if (answer?.timedOut) return text('Formular nicht abgeschickt (Zeit abgelaufen). Im Chat nachfragen statt zu raten.');
      if (answer?.dismissed) return text('Der Nutzer hat das Formular geschlossen, ohne es abzuschicken.');
      return text(JSON.stringify(answer?.values ?? {}, null, 2));
    }
    case 'fancycode_overview':
      return text(await overview());
    case 'fancycode_read':
      return text(await readSession(args.session_id, Math.max(0, Number(args.scrollback_lines) || 0), Math.max(5, Number(args.max_lines) || 120)) || '(leerer Bildschirm)');
    case 'fancycode_send':
      await sendText(args.session_id, String(args.text ?? ''), args.submit !== false);
      return text('Gesendet. Mit fancycode_wait auf das Ergebnis warten.');
    case 'fancycode_keys':
      await sendKeys(args.session_id, Array.isArray(args.keys) ? args.keys : [args.keys]);
      return text('Tasten gesendet.');
    case 'fancycode_wait': {
      const result = await waitForSession(args.session_id, {
        idleSeconds: Math.max(1, Number(args.idle_seconds) || 5),
        timeoutSeconds: Math.min(900, Math.max(5, Number(args.timeout_seconds) || 180)),
        untilText: args.until_text,
      });
      return text(`${result.reason}.\n\n${result.screen}`);
    }
    case 'fancycode_start_antigravity': {
      const workspace = await askFancyCode('start-agy', { accounts: args.accounts, server: args.server, resume: Boolean(args.resume) });
      const ids = workspace.tabs.map((tab) => tab.sessionId);
      const ready = await waitForSessions(ids);
      let note = ready ? 'Alle Terminals laufen.' : 'Noch nicht alle Terminals laufen (FancyCode Desktop-Fenster pruefen).';
      // The task goes to the agy accounts only, not to the manager window.
      const agyIds = workspace.tabs.filter((tab) => tab.agyAccountId).map((tab) => tab.sessionId);
      if (args.task && ready) {
        await Promise.all(agyIds.map((id) => waitForSession(id, { idleSeconds: 4, timeoutSeconds: 60 })));
        for (const id of agyIds) await sendText(id, String(args.task), true);
        note += ' Aufgabe an alle gesendet.';
      }
      return text(`${note}\nworkspace_id: ${workspace.workspaceId}\n${workspace.tabs.map((tab) => `- session_id: ${tab.sessionId} | ${tab.title}${tab.server ? ` | auf ${tab.server}` : ''}`).join('\n')}`);
    }
    case 'fancycode_start_terminal': {
      const workspace = await askFancyCode('start-terminals', { title: args.title, tabs: args.tabs });
      const ids = workspace.tabs.map((tab) => tab.sessionId);
      const ready = await waitForSessions(ids);
      return text(`${ready ? 'Terminals laufen.' : 'Noch nicht alle Terminals laufen.'}\nworkspace_id: ${workspace.workspaceId}\n${workspace.tabs.map((tab) => `- session_id: ${tab.sessionId} | ${tab.title}${tab.command ? ` | ${tab.command}` : ''}${tab.server ? ` | auf ${tab.server}` : ''}`).join('\n')}`);
    }
    case 'fancycode_add_terminal': {
      const workspace = await askFancyCode('add-tab', {
        workspaceId: args.workspace_id,
        command: args.command,
        server: args.server,
        title: args.title,
        manager: Boolean(args.manager),
      });
      const added = workspace.tabs[workspace.tabs.length - 1];
      const ready = await waitForSessions([added.sessionId], 20000);
      return text(`${ready ? 'Terminal laeuft.' : 'Terminal startet noch.'}\n- session_id: ${added.sessionId} | ${added.title}${added.command ? ` | ${added.command}` : ''}${added.server ? ` | auf ${added.server}` : ' | auf diesem PC'}`);
    }
    case 'fancycode_layout':
      await askFancyCode('layout', { workspaceId: args.workspace_id, layout: args.layout, activeSessionId: args.active_session_id });
      return text('Layout geaendert.');
    case 'fancycode_ui_snapshot':
      return text(await askFancyCode('ui-snapshot'));
    case 'fancycode_ui_click':
      return text(await askFancyCode('ui-click', { ref: args.ref, button: args.button }));
    case 'fancycode_ui_type':
      return text(await askFancyCode('ui-type', { ref: args.ref, text: args.text, clear: args.clear, submit: args.submit }));
    case 'fancycode_ui_key':
      return text(await askFancyCode('ui-key', { key: args.key }));
    case 'fancycode_screenshot': {
      const shot = await askFancyCode('screenshot');
      return { content: [{ type: 'image', data: shot.data, mimeType: shot.mimeType }] };
    }
    case 'fancycode_open_workspace': {
      await askFancyCode('open-workspace', { workspaceId: args.workspace_id });
      const state = readState();
      const workspace = (state.workspaces || []).find((item) => item.workspaceId === args.workspace_id);
      if (workspace) await waitForSessions(workspace.tabs.map((tab) => tab.sessionId), 20000);
      return text('Workspace ist in FancyCode Desktop geoeffnet.');
    }
    case 'fancycode_stop': {
      if (args.workspace_id) {
        await askFancyCode('end-workspace', { workspaceId: args.workspace_id });
        return text('Workspace beendet.');
      }
      if (args.session_id) {
        const info = findTab(args.session_id);
        // With FancyCode Desktop open, the tab also disappears from the window; otherwise just end it.
        const viaUi = await connectControl().then((socket) => {
          if (socket) socket.destroy();
          return Boolean(socket);
        });
        if (viaUi) {
          await askFancyCode('remove-tab', { sessionId: args.session_id });
          return text('Terminal beendet und Tab geschlossen.');
        }
        await sessions.list();
        sessions.kill(args.session_id);
        if (info?.tmuxName) await runSsh(info.server, `tmux kill-session -t ${shq(info.tmuxName)} 2>/dev/null || true`);
        return text('Terminal beendet.');
      }
      throw new Error('workspace_id oder session_id angeben.');
    }
    default:
      throw new Error(`Unbekanntes Werkzeug: ${name}`);
  }
}

// One popup per agent start, only when FancyCode Desktop is open (it is never started for this).
function announceConnection() {
  // Die MCP-Ansicht in den Einstellungen verbindet sich nur zum Nachsehen – das ist kein Agent.
  if (clientName === 'fancycode-desktop') return;
  const name = clientLabel() || 'einem Agenten';
  void askOpenWindow('notify', {
    ...popupBase({ title: `Verbunden mit ${name}` }),
    connect: true,
  }).catch(() => {});
}

// ---------- JSON-RPC over stdio ----------

function respond(id, result, error) {
  const message = error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(message) + '\n');
}

async function handle(message) {
  const { id, method, params } = message;
  if (id === undefined || id === null) return; // notification
  try {
    switch (method) {
      case 'initialize':
        clientName = String(params?.clientInfo?.name || '').slice(0, 60);
        announceConnection();
        respond(id, {
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'fancycode', version: VERSION },
          instructions: INSTRUCTIONS,
        });
        return;
      case 'ping':
        respond(id, {});
        return;
      case 'tools/list':
        respond(id, { tools: TOOLS });
        return;
      case 'tools/call':
        try {
          respond(id, await callTool(params?.name, params?.arguments || {}));
        } catch (error) {
          respond(id, { content: [{ type: 'text', text: `Fehler: ${error.message}` }], isError: true });
        }
        return;
      default:
        respond(id, undefined, { code: -32601, message: `Method not found: ${method}` });
    }
  } catch (error) {
    respond(id, undefined, { code: -32603, message: error.message });
  }
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  let index;
  while ((index = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, index).trim();
    input = input.slice(index + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch (_) {
      continue;
    }
    void handle(message);
  }
});
process.stdin.on('end', () => process.exit(0));
log(`bereit (Daten: ${userDataDir})`);
