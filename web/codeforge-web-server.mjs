#!/usr/bin/env node
// CodeForge Web: serves the CodeForge UI and runs its terminals on this server.
//
// Security model (fail closed):
//  - Listens on 127.0.0.1 only; the public hostname reaches it through a Cloudflare Tunnel.
//  - Cloudflare Access sits in front. Every HTTP request and WebSocket upgrade must carry a
//    valid Access JWT (RS256, signed by the team's keys, matching audience, not expired)
//    whose e-mail is on CODEFORGE_ALLOWED_EMAILS. Without that configuration nothing is served.
//  - WebSocket upgrades must come from the public origin.
//
// Terminals are tmux sessions (shared with the `codeforge` CLI), so they keep running when the
// browser disconnects and end only when they are closed.
import { createServer } from 'node:http';
import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { WebSocketServer } from 'ws';
import pty from 'node-pty';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 8790);
const HOST = '127.0.0.1';
const PUBLIC_ORIGIN = (process.env.CODEFORGE_PUBLIC_ORIGIN || '').replace(/\/+$/, '');
const TEAM_DOMAIN = (process.env.CF_ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const AUDIENCES = (process.env.CF_ACCESS_AUD || '').split(',').map((item) => item.trim()).filter(Boolean);
const ALLOWED_EMAILS = new Set(
  (process.env.CODEFORGE_ALLOWED_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean),
);
const DIST_DIR = resolve(process.env.CODEFORGE_DIST || join(import.meta.dirname, '..', 'dist'));
const WORK_DIR = resolve(process.env.CODEFORGE_WORKDIR || process.env.HOME || '/root');
const REAL_HOME = process.env.HOME || '/root';
const ACCOUNTS_ROOT = resolve(process.env.CODEFORGE_HOME || join(REAL_HOME, '.codeforge'), 'agy-accounts');
const CLI = process.env.CODEFORGE_CLI || '/usr/local/bin/codeforge';
const SESSION_PREFIX = 'cf-w-';
const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const CHAT_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

const configError = [
  !PUBLIC_ORIGIN && 'CODEFORGE_PUBLIC_ORIGIN',
  !TEAM_DOMAIN && 'CF_ACCESS_TEAM_DOMAIN',
  AUDIENCES.length === 0 && 'CF_ACCESS_AUD',
  ALLOWED_EMAILS.size === 0 && 'CODEFORGE_ALLOWED_EMAILS',
].filter(Boolean);
if (configError.length) {
  console.error(`[CodeForge Web] Missing configuration: ${configError.join(', ')}. Refusing to start.`);
  process.exit(1);
}

// ---------- Cloudflare Access JWT ----------

const CERTS_URL = `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`;
const ISSUER = `https://${TEAM_DOMAIN}`;
let signingKeys = new Map();
let keysFetchedAt = 0;

async function refreshKeys(force = false) {
  const age = Date.now() - keysFetchedAt;
  // Forced refreshes (unknown key id) are limited to one per minute.
  if (signingKeys.size && (force ? age < 60 * 1000 : age < 10 * 60 * 1000)) return;
  const response = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Access certs: HTTP ${response.status}`);
  const { keys = [] } = await response.json();
  const next = new Map();
  for (const jwk of keys) {
    if (jwk.kty === 'RSA' && jwk.kid) next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
  }
  if (next.size === 0) throw new Error('Access certs: no keys');
  signingKeys = next;
  keysFetchedAt = Date.now();
}

function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

// Returns the verified e-mail or throws.
async function verifyAccessJwt(token) {
  if (typeof token !== 'string' || token.length > 8192) throw new Error('missing token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = decodePart(parts[0]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('unexpected algorithm');
  await refreshKeys();
  if (!signingKeys.has(header.kid)) await refreshKeys(true);
  const key = signingKeys.get(header.kid);
  if (!key) throw new Error('unknown signing key');
  const valid = verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!valid) throw new Error('bad signature');
  const claims = decodePart(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER) throw new Error('wrong issuer');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.some((item) => AUDIENCES.includes(item))) throw new Error('wrong audience');
  if (typeof claims.exp !== 'number' || claims.exp < now - 30) throw new Error('expired');
  if (typeof claims.nbf === 'number' && claims.nbf > now + 30) throw new Error('not yet valid');
  const email = String(claims.email || '').toLowerCase();
  if (!email || !ALLOWED_EMAILS.has(email)) throw new Error('e-mail not allowed');
  return email;
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

async function authenticate(req) {
  const token = req.headers['cf-access-jwt-assertion'] || readCookie(req, 'CF_Authorization');
  return verifyAccessJwt(Array.isArray(token) ? token[0] : token);
}

// ---------- HTTP ----------

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const wsOrigin = PUBLIC_ORIGIN.replace(/^http/, 'ws');
const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    `connect-src 'self' ${wsOrigin}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body);
}

function serveStatic(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  let filePath = resolve(DIST_DIR, `.${pathname}`);
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + sep)) return send(res, 404, 'Not found');
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // Missing files stay missing; only app routes fall back to the SPA entry.
    if (extname(pathname)) return send(res, 404, 'Not found');
    filePath = join(DIST_DIR, 'index.html');
  }
  const isIndex = filePath.endsWith('index.html');
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'cache-control': isIndex ? 'no-store' : 'private, max-age=86400',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  try {
    await authenticate(req);
  } catch (error) {
    console.warn(`[Auth] HTTP ${req.url} rejected: ${error.message}`);
    return send(res, 403, 'Forbidden');
  }
  serveStatic(req, res);
});

// ---------- terminals (tmux) ----------

function tmux(args) {
  return execFileAsync('tmux', args, { timeout: 5000 });
}

async function hasSession(name) {
  try {
    await tmux(['has-session', '-t', `=${name}`]);
    return true;
  } catch {
    return false;
  }
}

function sessionName(chatId) {
  return `${SESSION_PREFIX}${chatId}`;
}

function accountHome(accountId) {
  if (!ACCOUNT_ID_PATTERN.test(String(accountId || ''))) throw new Error('Ungueltige Antigravity-Account-ID.');
  const home = resolve(ACCOUNTS_ROOT, accountId);
  if (!home.startsWith(ACCOUNTS_ROOT + sep)) throw new Error('Ungueltige Antigravity-Account-ID.');
  return home;
}

function accountName(accountId) {
  try {
    return readFileSync(join(accountHome(accountId), '.codeforge-name'), 'utf8').trim() || accountId;
  } catch {
    return accountId;
  }
}

function safeCwd(cwd) {
  if (typeof cwd === 'string' && cwd.startsWith('/')) {
    try {
      if (statSync(cwd).isDirectory()) return cwd;
    } catch {}
  }
  return WORK_DIR;
}

// One tmux client (PTY) per browser connection and tab.
const clients = new Map(); // `${connId}:${chatId}` -> { pty, ws }

async function createShell(conn, { chatId, cwd, agyAccountId, cols, rows, reattachOnly }) {
  if (!CHAT_ID_PATTERN.test(String(chatId || ''))) throw new Error('Ungueltige Terminal-ID.');
  const key = `${conn.id}:${chatId}`;
  if (clients.has(key)) return { reattached: true, skipStartCommand: true };
  const name = sessionName(chatId);
  const existed = await hasSession(name);
  // After a reconnect the browser only re-attaches; a session that was closed meanwhile stays closed.
  if (!existed && reattachOnly) {
    conn.emit(`shell:output:${chatId}`, { type: 'exit', code: 0 });
    return { reattached: false, skipStartCommand: true };
  }
  if (!existed) {
    const startDir = safeCwd(cwd);
    let command;
    let label = 'Web-Terminal';
    if (agyAccountId) {
      accountHome(agyAccountId);
      label = accountName(agyAccountId);
      command = `exec ${CLI} __run ${agyAccountId}`;
    } else {
      command = 'exec bash -l';
    }
    await tmux(['new-session', '-d', '-s', name, '-c', startDir, '-x', '200', '-y', '50', '-e', `CODEFORGE_REAL_HOME=${REAL_HOME}`, command]);
    await tmux([
      'set', '-t', name, '@cf_session', `${label} (Web)`, ';',
      'set', '-t', name, 'status', 'off', ';',
      'set', '-t', name, 'mouse', 'on', ';',
      'set', '-s', 'escape-time', '10',
    ]).catch(() => {});
  }
  const term = pty.spawn('tmux', ['attach-session', '-t', `=${name}`], {
    name: 'xterm-256color',
    cols: Math.max(20, Math.min(500, Number(cols) || 120)),
    rows: Math.max(5, Math.min(200, Number(rows) || 30)),
    cwd: WORK_DIR,
    env: { ...process.env, TERM: 'xterm-256color' },
  });
  clients.set(key, { pty: term, ws: conn.ws });
  const channel = `shell:output:${chatId}`;
  term.onData((data) => conn.emit(channel, { type: 'stdout', text: data }));
  term.onExit(async () => {
    clients.delete(key);
    // The client ends on detach as well; only report an exit when the session itself is gone.
    if (!(await hasSession(name))) conn.emit(channel, { type: 'exit', code: 0 });
  });
  // Existing sessions already run their program: tell the UI not to type the start command again.
  // Account sessions start agy themselves.
  return { reattached: existed, skipStartCommand: existed || Boolean(agyAccountId) };
}

function writeShell(conn, { chatId, text }) {
  const client = clients.get(`${conn.id}:${chatId}`);
  if (!client || typeof text !== 'string') return false;
  client.pty.write(text.slice(0, 64 * 1024));
  return true;
}

function resizeShell(conn, { chatId, cols, rows }) {
  const client = clients.get(`${conn.id}:${chatId}`);
  if (!client) return false;
  try {
    client.pty.resize(Math.max(20, Math.min(500, Number(cols) || 120)), Math.max(5, Math.min(200, Number(rows) || 30)));
  } catch {}
  return true;
}

// Closing a tab ends the session for good.
async function killShell(conn, chatId) {
  if (!CHAT_ID_PATTERN.test(String(chatId || ''))) return false;
  await tmux(['kill-session', '-t', `=${sessionName(chatId)}`]).catch(() => {});
  for (const [key, client] of clients) {
    if (key.endsWith(`:${chatId}`)) {
      try {
        client.pty.kill();
      } catch {}
      clients.delete(key);
    }
  }
  return true;
}

function detachConnection(conn) {
  for (const [key, client] of clients) {
    if (key.startsWith(`${conn.id}:`)) {
      try {
        client.pty.kill();
      } catch {}
      clients.delete(key);
    }
  }
}

// ---------- Antigravity accounts (same folders as the CLI) ----------

function listAccounts() {
  if (!existsSync(ACCOUNTS_ROOT)) return [];
  return readdirSync(ACCOUNTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ACCOUNT_ID_PATTERN.test(entry.name))
    .map((entry) => ({ id: entry.name, created: statSync(join(ACCOUNTS_ROOT, entry.name)).mtimeMs, name: accountName(entry.name) }))
    .sort((a, b) => a.created - b.created)
    .map(({ id, name }) => ({ id, name }));
}

// Creates folders for new accounts and stores names; never deletes (that is remove-profile).
function saveAccounts(_conn, accounts) {
  if (!Array.isArray(accounts)) throw new Error('Ungueltige Accounts.');
  mkdirSync(ACCOUNTS_ROOT, { recursive: true, mode: 0o700 });
  for (const account of accounts.slice(0, 16)) {
    const home = accountHome(account?.id);
    const name = String(account?.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60) || account.id;
    if (!existsSync(home)) mkdirSync(home, { recursive: true, mode: 0o700 });
    writeFileSync(join(home, '.codeforge-name'), name, { mode: 0o600 });
  }
  return listAccounts();
}

function readAccountEmail(home) {
  const logDir = join(home, '.gemini', 'antigravity-cli', 'log');
  let files;
  try {
    files = readdirSync(logDir)
      .filter((name) => name.endsWith('.log'))
      .map((name) => join(logDir, name))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
      .slice(0, 5);
  } catch {
    return '';
  }
  for (const file of files) {
    let lines;
    try {
      const text = readFileSync(file, 'utf8');
      lines = text.slice(-1024 * 1024).split(/\r?\n/);
    } catch {
      continue;
    }
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const login = lines[index].match(/authenticated successfully as (\S+@\S+)/);
      if (login) return login[1];
      if (/Logging out current user/.test(lines[index])) return '';
    }
  }
  return '';
}

function accountsStatus(_conn, ids = []) {
  return (Array.isArray(ids) ? ids.slice(0, 16) : []).map((id) => {
    try {
      const home = accountHome(id);
      const exists = existsSync(home);
      return { id, profileExists: exists, email: exists ? readAccountEmail(home) : '' };
    } catch {
      return { id, profileExists: false, email: '' };
    }
  });
}

async function removeAccountProfile(_conn, accountId) {
  const home = accountHome(accountId);
  // End this account's sessions first (web and CLI), they keep files open in the folder.
  try {
    const { stdout } = await tmux(['list-panes', '-a', '-F', '#{session_name}\t#{pane_start_command}']);
    for (const line of stdout.split('\n')) {
      const [session, command = ''] = line.split('\t');
      if (session && new RegExp(`__run[ '"]+${accountId}['"]?(\\s|$)`).test(command)) {
        await tmux(['kill-session', '-t', `=${session}`]).catch(() => {});
      }
    }
  } catch {}
  rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  return true;
}

// ---------- other UI calls ----------

const PROVIDERS = {
  antigravity: 'agy',
  openai: 'codex',
  anthropic: 'claude',
  cursor: 'agent',
  opencode: 'opencode',
  freebuff: 'freebuff',
};

async function systemStatus() {
  const entries = await Promise.all(
    Object.entries(PROVIDERS).map(async ([id, command]) => {
      try {
        const { stdout } = await execFileAsync('bash', ['-lc', `command -v ${command}`], { timeout: 5000 });
        const executable = stdout.trim().split('\n')[0];
        let version = '';
        try {
          const result = await execFileAsync(executable, ['--version'], { timeout: 8000 });
          version = (result.stdout || result.stderr).trim().split(/\r?\n/)[0] || '';
        } catch {}
        return [id, { installed: Boolean(executable), executable, version }];
      } catch {
        return [id, { installed: false, executable: '', version: '' }];
      }
    }),
  );
  return Object.fromEntries(entries);
}

async function runGit(projectPath, args) {
  if (typeof projectPath !== 'string' || !projectPath.startsWith('/')) return { ok: false, output: '' };
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectPath, ...args], { timeout: 8000 });
    return { ok: true, output: stdout.trim() };
  } catch {
    return { ok: false, output: '' };
  }
}

const handlers = new Map(
  Object.entries({
    'shell:create': createShell,
    'shell:write': writeShell,
    'shell:resize': resizeShell,
    'shell:kill': killShell,
    'agy-accounts:list': () => listAccounts(),
    'agy-accounts:save': saveAccounts,
    'agy-accounts:status': accountsStatus,
    'agy-accounts:remove-profile': removeAccountProfile,
    'system:status': systemStatus,
    getScratchProjectFolder: () => WORK_DIR,
    'dialog:scratch-project': () => WORK_DIR,
    selectProjectFolder: () => null,
    'git:info': async (_conn, projectPath) => {
      const branch = await runGit(projectPath, ['branch', '--show-current']);
      const root = await runGit(projectPath, ['rev-parse', '--show-toplevel']);
      return { isRepository: branch.ok || root.ok, branch: branch.output, root: root.output };
    },
    'git:branches': async (_conn, projectPath) => {
      const result = await runGit(projectPath, ['branch', '--format=%(refname:short)']);
      return result.ok ? result.output.split('\n').filter(Boolean) : [];
    },
    // Desktop-only features answer with empty data instead of failing.
    'updates:status': () => ({ status: 'idle', web: true }),
    'system:mcp-servers': () => [],
    'codex-plugins:list': () => [],
    'usage:provider': () => null,
    'spotify:track': () => null,
    'discord:presence': () => false,
    'agent:notify-complete': () => false,
    'sync:get-server-status': () => null,
  }),
);

// ---------- WebSocket ----------

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
let nextConnId = 1;

server.on('upgrade', async (req, socket, head) => {
  const reject = (reason) => {
    console.warn(`[Auth] WS rejected: ${reason}`);
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
  };
  if (req.headers.origin !== PUBLIC_ORIGIN) return reject(`origin ${req.headers.origin}`);
  let email;
  try {
    email = await authenticate(req);
  } catch (error) {
    return reject(error.message);
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const conn = {
      id: nextConnId++,
      ws,
      email,
      emit: (channel, data) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ipc-event', channel, data }));
      },
    };
    console.log(`[WS] ${email} connected (#${conn.id})`);
    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg?.type !== 'ipc-call' || typeof msg.method !== 'string') return;
      const reply = (payload) => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ type: 'ipc-response', id: msg.id, ...payload }));
      const handler = handlers.get(msg.method);
      if (!handler) return reply({ error: `In CodeForge Web nicht verfuegbar: ${msg.method}` });
      try {
        reply({ result: await handler(conn, ...(Array.isArray(msg.args) ? msg.args : [])) });
      } catch (error) {
        reply({ error: error?.message || 'Fehler' });
      }
    });
    // A closed tab or dropped connection only detaches; the tmux sessions keep running.
    ws.on('close', () => {
      detachConnection(conn);
      console.log(`[WS] #${conn.id} disconnected`);
    });
  });
});

try {
  execFileSync('tmux', ['-V'], { stdio: 'ignore' });
} catch {
  console.error('[CodeForge Web] tmux is required.');
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.log(`[CodeForge Web] http://${HOST}:${PORT} -> ${PUBLIC_ORIGIN} (Access team ${TEAM_DOMAIN}, ${ALLOWED_EMAILS.size} e-mail(s))`);
});
