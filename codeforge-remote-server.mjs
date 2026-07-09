#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { networkInterfaces, hostname } from 'node:os';
import { extname, join } from 'node:path';
import { WebSocketServer } from 'ws';
import pty from 'node-pty';

const PORT = Number(process.env.PORT || process.env.CODEFORGE_PORT || 8787);
const HOST = process.env.HOST || process.env.CODEFORGE_HOST || '0.0.0.0';
const TOKEN = process.env.CODEFORGE_TOKEN || '';
const PROJECT_PATH = process.env.CODEFORGE_PROJECT_PATH || process.cwd();

const userHome = process.env.USERPROFILE || process.env.HOME || '';

const providers = {
  antigravity: {
    command: 'agy',
    candidates: [
      'agy',
      join(userHome, 'AppData/Local/agy/bin/agy.exe').replace(/\\/g, '/'),
      '/root/.local/bin/agy',
      '/usr/local/bin/agy',
      '/usr/bin/agy'
    ]
  },
  openai: {
    command: 'codex',
    candidates: [
      'codex',
      join(userHome, 'AppData/Local/Programs/OpenAI/Codex/bin/codex.exe').replace(/\\/g, '/'),
      '/root/.local/bin/codex',
      '/usr/local/bin/codex',
      '/usr/bin/codex'
    ]
  },
  anthropic: {
    command: 'claude',
    candidates: [
      'claude',
      '/root/.local/bin/claude',
      '/usr/local/bin/claude',
      '/usr/bin/claude'
    ]
  },
  cursor: {
    command: 'cursor-agent',
    candidates: [
      'cursor-agent',
      'agent',
      '/root/.local/bin/cursor-agent',
      '/usr/local/bin/cursor-agent'
    ]
  },
  opencode: {
    command: 'opencode',
    candidates: [
      'opencode',
      '/root/.local/bin/opencode',
      '/usr/local/bin/opencode',
      '/usr/bin/opencode'
    ]
  },
  freebuff: {
    command: 'freebuff',
    candidates: [
      'freebuff',
      '/root/.local/bin/freebuff',
      '/usr/local/bin/freebuff',
      '/usr/bin/freebuff'
    ]
  },
};

function resolveCommand(provider) {
  for (const candidate of provider.candidates || [provider.command]) {
    if (candidate.includes('/') && existsSync(candidate)) return candidate;
  }
  return provider.command;
}

function getLocalIp() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && !iface.internal && iface.family === 'IPv4')
    .map((iface) => iface.address)[0] || HOST;
}

function getEffectivePublicIp() {
  return process.env.CODEFORGE_PUBLIC_IP || getLocalIp();
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function isAuthorized(req) {
  if (!TOKEN) return false;
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

const MEDIA_TYPES = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
  '.ogg': 'video/ogg', '.ogv': 'video/ogg', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
};

async function handleMedia(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const filePath = url.searchParams.get('path');
  if (!filePath) return json(res, 400, { ok: false, error: 'Missing path parameter.' });
  
  const normalized = join('/', filePath.replace(/\\/g, '/').replace(/^~/, 'root'));
  const resolved = join('/', normalized);
  
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    return json(res, 404, { ok: false, error: 'File not found or not a file.' });
  }
  
  const ext = extname(resolved).toLowerCase();
  const contentType = MEDIA_TYPES[ext] || 'application/octet-stream';
  
  res.writeHead(200, {
    'content-type': contentType,
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=3600',
    'content-length': statSync(resolved).size,
  });
  
  const stream = createReadStream(resolved);
  stream.on('error', () => { if (!res.headersSent) { json(res, 500, { ok: false, error: 'Error reading file.' }); } else { res.destroy(); } });
  stream.pipe(res);
}


function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleRun(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, error: 'Unauthorized.' });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return json(res, 400, { ok: false, error: 'Invalid JSON' });
  }
  const runHandler = handlers.get('agent:run');
  if (!runHandler) {
    return json(res, 500, { ok: false, error: 'Agent runner not initialized' });
  }
  try {
    const mockEvent = { sender: { send: () => {} } };
    const result = await runHandler(mockEvent, body);
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    return json(res, result.ok ? 200 : 500, {
      ok: result.ok,
      output: output,
      error: result.error,
      exitCode: result.exitCode ?? (result.ok ? 0 : 1)
    });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = req.url || '/';

  if (req.method === 'GET' && url === '/discover') {
    return json(res, 200, {
      ok: true,
      service: 'codeforge-remote',
      name: 'CodeForge Remote Server',
      version: '2.5.0',
      localIp: getLocalIp(),
      port: PORT,
      tokenRequired: Boolean(TOKEN),
      providers: Object.keys(providers),
      hostname: hostname(),
    });
  }

  if (req.method === 'POST' && url === '/run') {
    return handleRun(req, res);
  }

  if (req.method === 'GET' && (url === '/media' || url.startsWith('/media?'))) {
    return handleMedia(req, res);
  }

  if (req.method === 'GET' && url === '/health') {
    if (!isAuthorized(req)) return json(res, 401, { ok: false, error: 'Unauthorized.' });
    return json(res, 200, { ok: true, name: 'CodeForge Remote Server' });
  }

  json(res, 404, { ok: false, error: 'Not found.' });
});

// -- WebSocket IPC Server (Sync Server) --
const wss = new WebSocketServer({ server });
const handlers = new Map();
const activeShells = new Map();
const activeTerminalProcesses = new Map();

function broadcast(msg, excludeWs = null) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(data);
    }
  }
}

wss.on('connection', (ws, req) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const wsToken = urlObj.searchParams.get('token') || req.headers['authorization']?.replace(/^Bearer /i, '').trim() || '';
  const isWsAuthorized = TOKEN && wsToken === TOKEN;

  if (!isWsAuthorized) {
    console.log('WebSocket connection rejected (invalid token)');
    ws.send(JSON.stringify({ type: 'error', error: 'Unauthorized' }));
    ws.close(4001, 'Unauthorized');
    return;
  }

  console.log('WebSocket connected');

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);
      if (msg.type === 'ipc-call') {
        const fn = handlers.get(msg.method);
        if (fn) {
          try {
            const mockEvent = {
              sender: {
                send: (ch, data) => broadcast({ type: 'ipc-event', channel: ch, data })
              }
            };
            const result = await fn(mockEvent, ...msg.args);
            ws.send(JSON.stringify({ type: 'ipc-response', id: msg.id, result }));
          } catch (err) {
            ws.send(JSON.stringify({ type: 'ipc-response', id: msg.id, error: err.message }));
          }
        } else {
          ws.send(JSON.stringify({ type: 'ipc-response', id: msg.id, error: `IPC handler not found for ${msg.method}` }));
        }
      }
    } catch (err) {
      console.error('WS Error:', err);
    }
  });
});

// IPC Handlers
handlers.set('system:status', async () => {
  return Object.fromEntries(
    Object.entries(providers).map(([id, provider]) => [id, { command: resolveCommand(provider) }])
  );
});

handlers.set('shell:create', async (event, { chatId, cwd, shellType }) => {
  if (activeShells.has(chatId)) return;
  const isWin = process.platform === 'win32';
  const shell = isWin ? (shellType === 'powershell' ? 'powershell.exe' : 'cmd.exe') : 'bash';
  const args = isWin && shellType === 'powershell' ? ['-NoLogo'] : [];
  
  let spawnCwd = PROJECT_PATH;
  if (cwd && existsSync(cwd) && statSync(cwd).isDirectory()) spawnCwd = cwd;

  const env = { ...process.env };
  if (isWin) {
    const agyPath = join(userHome, 'AppData/Local/agy/bin');
    const paths = (env.PATH || '').split(';');
    if (!paths.some(p => p.toLowerCase() === agyPath.toLowerCase())) {
      paths.push(agyPath);
      env.PATH = paths.join(';');
    }
  }

  try {
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-color',
      cols: 100,
      rows: 30,
      cwd: spawnCwd,
      env: env,
      useConpty: true
    });
    
    activeShells.set(chatId, ptyProcess);
    
    ptyProcess.onData((data) => {
      event.sender.send(`shell:output:${chatId}`, { type: 'stdout', text: data });
    });
    
    ptyProcess.onExit(({ exitCode }) => {
      activeShells.delete(chatId);
      event.sender.send(`shell:output:${chatId}`, { type: 'exit', code: exitCode });
    });
  } catch (err) {
    event.sender.send(`shell:output:${chatId}`, { type: 'stderr', text: `PTY Spawn error: ${err.message}` });
  }
});

handlers.set('shell:write', async (event, { chatId, text }) => {
  const ptyProcess = activeShells.get(chatId);
  if (ptyProcess) ptyProcess.write(text);
});

handlers.set('shell:resize', async (event, { chatId, cols, rows }) => {
  const ptyProcess = activeShells.get(chatId);
  if (ptyProcess) {
    try { ptyProcess.resize(cols, rows); } catch (e) {}
  }
});

handlers.set('shell:kill', async (event, chatId) => {
  const ptyProcess = activeShells.get(chatId);
  if (ptyProcess) {
    ptyProcess.kill();
    activeShells.delete(chatId);
  }
});

handlers.set('terminal:run', async (event, { command, args, cwd }) => {
  return new Promise((resolve) => {
    const id = randomUUID();
    let spawnCwd = PROJECT_PATH;
    if (cwd && existsSync(cwd)) spawnCwd = cwd;

    const child = spawn(command, args || [], {
      cwd: spawnCwd,
      env: process.env,
      shell: true
    });
    
    activeTerminalProcesses.set(id, child);
    
    child.stdout.on('data', (data) => event.sender.send(`terminal:output:${id}`, { type: 'stdout', text: data.toString() }));
    child.stderr.on('data', (data) => event.sender.send(`terminal:output:${id}`, { type: 'stderr', text: data.toString() }));
    child.on('close', (code) => {
      activeTerminalProcesses.delete(id);
      event.sender.send(`terminal:output:${id}`, { type: 'exit', code });
      resolve({ exitCode: code });
    });
    child.on('error', (err) => {
      activeTerminalProcesses.delete(id);
      event.sender.send(`terminal:output:${id}`, { type: 'stderr', text: err.message });
      resolve({ error: err.message });
    });
  });
});

handlers.set('terminal:cancel', async (event, id) => {
  const child = activeTerminalProcesses.get(id);
  if (child) {
    child.kill();
    activeTerminalProcesses.delete(id);
    return true;
  }
  return false;
});

handlers.set('agent:run', async (event, request) => {
  const providerId = request.provider || 'openai';
  const provider = providers[providerId];
  if (!provider) throw new Error('Unknown provider.');
  
  const model = request.model || (providerId === 'openai' ? 'gpt-5.5' : 'default');
  const prompt = request.prompt || '';
  const access = ['read-only', 'workspace-write', 'full'].includes(request.access) ? request.access : 'workspace-write';
  
  const accessInstruction = access === 'read-only' ? 'WICHTIG: Arbeite lesend.' : access === 'workspace-write' ? `WICHTIG: Ändere nur Dateien in: ${PROJECT_PATH}` : '';
  const finalPrompt = [accessInstruction, request.systemPrompt ? `System:\n${request.systemPrompt}` : '', prompt].filter(Boolean).join('\n\n');
  
  const args = [];
  let stdin = '';
  
  if (providerId === 'antigravity') {
    args.push('-p', finalPrompt, '--model', model, '--dangerously-skip-permissions');
  } else if (providerId === 'openai') {
    args.push('exec', '-', '--model', model, '--cd', PROJECT_PATH, '--color', 'never', '--skip-git-repo-check', '--sandbox', access === 'full' ? 'danger-full-access' : (access === 'read-only' ? 'read-only' : 'workspace-write'));
    if (access === 'full') args.push('--dangerously-bypass-approvals-and-sandbox');
    stdin = finalPrompt;
  } else if (providerId === 'anthropic') {
    args.push('-p', '--model', model, '--output-format', 'text', '--permission-mode', access === 'full' ? 'bypassPermissions' : (access === 'read-only' ? 'plan' : 'auto'));
    if (access === 'full') args.push('--dangerously-skip-permissions');
    stdin = finalPrompt;
  } else if (providerId === 'cursor') {
    args.push('-p', finalPrompt, '--output-format', 'text');
    if (model && model !== 'default') args.push('--model', model);
  }
  
  const isWin = process.platform === 'win32';
  const child = spawn(resolveCommand(provider), args, {
    cwd: PROJECT_PATH,
    env: { 
      ...process.env, 
      ...(!isWin && {
        HOME: process.env.HOME || '/root',
        USER: process.env.USER || 'root',
      }),
      FORCE_COLOR: '0', 
      NO_COLOR: '1' 
    },
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  
  const runId = request.runId || randomUUID();
  let stdout = '', stderr = '';
  
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    event.sender.send('agent:output', { type: 'output', runId, stream: 'stdout', chunk });
  });
  
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    event.sender.send('agent:output', { type: 'output', runId, stream: 'stderr', chunk });
  });
  
  if (stdin) child.stdin.write(stdin);
  child.stdin.end();
  
  return new Promise((resolve) => {
    child.on('error', (err) => resolve({ ok: false, stdout, stderr, error: err.message, exitCode: -1 }));
    child.on('close', (exitCode) => resolve({ ok: exitCode === 0, stdout, stderr, error: exitCode === 0 ? '' : stderr.trim(), exitCode: exitCode ?? -1 }));
  });
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  if (!TOKEN) {
    console.error('CODEFORGE_TOKEN is missing! Connection impossible.');
    process.exit(1);
  }
  
  const connectionData = { url: `http://${getEffectivePublicIp()}:${PORT}`, token: TOKEN, projectPath: PROJECT_PATH };
  const connectionKey = Buffer.from(JSON.stringify(connectionData)).toString('base64');
  
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║  📱 CONNECTION KEY FÜR DIE MOBILE APP:                  ║');
  console.log('  ║  Kopiere diesen Key und füge ihn in der App ein:         ║');
  console.log('  ║                                                          ║');
  console.log(`  ║  ${connectionKey}`);
  console.log('  ║                                                          ║');
  console.log('  ║  CodeForge-App → Verbinden → Einfügen → FERTIG! ✨     ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`CodeForge Remote Server v2.5.0 läuft auf http://${HOST}:${PORT}`);
});
