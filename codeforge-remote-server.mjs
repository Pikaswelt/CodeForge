#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, statSync, createReadStream, mkdirSync } from 'node:fs';
import { randomUUID, randomInt } from 'node:crypto';
import { networkInterfaces, hostname } from 'node:os';
import path, { extname, join } from 'node:path';
import dgram from 'node:dgram';
import { WebSocketServer } from 'ws';
import pty from 'node-pty';

let pairingMode = false;
let pairingCode = '';
let pairingBroadcastInterval = null;
let udpSocket = null;
let udpEaccesLogged = false;
let pairingBlockedUntil = 0;
let pairingFailCount = 0;

function getHostname() { return hostname(); }

const PORT = Number(process.env.PORT || process.env.CODEFORGE_PORT || 8787);
const HOST = process.env.HOST || process.env.CODEFORGE_HOST || '0.0.0.0';
const TOKEN = process.env.CODEFORGE_TOKEN || '';
const PROJECT_PATH = process.env.CODEFORGE_PROJECT_PATH || process.cwd();
const PAIRING_PORT = Number(process.env.CODEFORGE_PAIRING_PORT || 8789);
const PAIRING_AUTO_STOP_MINUTES = Number(process.env.CODEFORGE_PAIRING_TIMEOUT_MINUTES || 5);
const MAX_PROMPT_CHARS = Number(process.env.CODEFORGE_MAX_PROMPT_CHARS || 100_000);

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
  const header = req.headers.authorization || '';
  return header === `Bearer ${TOKEN}`;
}

function unauthorized(res) {
  return json(res, 401, { ok: false, error: 'Unauthorized.' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_PROMPT_CHARS + 20_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ── Pairing mode ──────────────────────────────────────────────

function generatePairingCode() {
  return String(randomInt(1000, 9999));
}

function startPairingBroadcast() {
  if (pairingMode) return; // Already active
  pairingMode = true;
  pairingCode = generatePairingCode();

  const localIp = getLocalIp();
  const serverName = getHostname();

  // Create UDP socket for broadcasting
  udpSocket = dgram.createSocket('udp4');
  udpSocket.bind(PAIRING_PORT, () => {
    udpSocket.setBroadcast(true);
    const easySetupUrl = `http://${getEffectivePublicIp()}:${PORT}/pair?code=${pairingCode}`;
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════════╗');
    console.log('  ║  📱 EASY SETUP – In die App einfügen:                   ║');
    console.log('  ║                                                        ║');
    console.log(`  ║  ${easySetupUrl}  ║`);
    console.log('  ║                                                        ║');
    console.log('  ║  CodeForge-App → Verbinden → Einfügen → FERTIG! ✨     ║');
    console.log('  ╚══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`   🔢 Kopplungscode: ${pairingCode}  ⏱️  ${PAIRING_AUTO_STOP_MINUTES} Min gültig`);
    console.log(`   📡 UDP-Broadcast auf Port ${PAIRING_PORT} (LAN-Discovery)`);
  });

  const broadcastMessage = () => {
    if (!pairingMode || !udpSocket) return;
    const payload = JSON.stringify({
      type: 'codeforge-pairing',
      service: 'codeforge-remote',
      name: serverName,
      ip: localIp,
      port: PORT,
      pairingCode,
      tokenRequired: Boolean(TOKEN),
      version: '2.4.3',
      providers: Object.keys(providers),
      timestamp: Date.now(),
    });
    const buffer = Buffer.from(payload, 'utf-8');
    udpSocket.send(buffer, 0, buffer.length, PAIRING_PORT, '255.255.255.255', (err) => {
      if (err) {
        if (err.code === 'EACCES' && !udpEaccesLogged) {
          udpEaccesLogged = true;
          console.log('   ⚠️  UDP-Broadcast nicht möglich (keine root-Rechte). Kopplung funktioniert trotzdem via HTTP.');
        }
      }
    });
  };

  // Send immediately, then every 2 seconds
  broadcastMessage();
  pairingBroadcastInterval = setInterval(broadcastMessage, 2000);
  pairingBroadcastInterval.unref();

  // Auto-stop after configured minutes (default 5)
  const timeoutMs = (PAIRING_AUTO_STOP_MINUTES || 5) * 60 * 1000;
  setTimeout(() => { if (pairingMode) stopPairingBroadcast(); }, timeoutMs).unref();
}

function stopPairingBroadcast() {
  pairingMode = false;
  pairingCode = '';
  if (pairingBroadcastInterval) {
    clearInterval(pairingBroadcastInterval);
    pairingBroadcastInterval = null;
  }
  if (udpSocket) {
    try { udpSocket.close(); } catch {}
    udpSocket = null;
  }
  console.log('🔗 Kopplungsmodus beendet.');
}

function getPairingQRData() {
  const publicIp = getEffectivePublicIp();
  const url = `http://${publicIp}:${PORT}/pair?code=${pairingCode}`;
  return {
    url,
    qrContent: url,
    pairingCode,
    serverName: getHostname(),
    serverIp: publicIp,
    serverPort: PORT,
    tokenRequired: Boolean(TOKEN),
  };
}

// ── Pairing HTTP endpoint ─────────────────────────────────────

async function handlePairing(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // GET /pair?code=XXXX – return QR data or verify code (rate-limited)
  if (req.method === 'GET') {
    const code = url.searchParams.get('code');
    if (!pairingMode) {
      return json(res, 400, { ok: false, error: 'Kopplungsmodus ist nicht aktiv. Starte ihn mit POST /pair/start' });
    }
    if (code) {
      // Same rate limiting as POST /pair/verify
      if (Date.now() < pairingBlockedUntil) {
        return json(res, 429, { ok: false, error: 'Zu viele Fehlversuche. Bitte warte 30 Sekunden.' });
      }
      if (code === pairingCode) {
        pairingFailCount = 0;
        pairingBlockedUntil = 0;
        return json(res, 200, {
          ok: true,
          paired: true,
          serverUrl: `http://${getEffectivePublicIp()}:${PORT}`,
          token: TOKEN || null,
          providers: Object.keys(providers),
          message: 'Code korrekt! Verwende diese Daten für die Verbindung.',
        });
      }
      pairingFailCount++;
      if (pairingFailCount >= 5) {
        pairingBlockedUntil = Date.now() + 30_000;
        pairingFailCount = 0;
        return json(res, 429, { ok: false, error: 'Zu viele Fehlversuche. 30 Sekunden Sperre.' });
      }
      return json(res, 403, { ok: false, error: 'Falscher Kopplungscode.' });
    }
    return json(res, 200, getPairingQRData());
  }

  // POST /pair/start – start pairing mode
  if (req.method === 'POST' && url.pathname === '/pair/start') {
    if (pairingMode) stopPairingBroadcast();
    startPairingBroadcast();
    return json(res, 200, {
      ok: true,
      pairingCode,
      ...getPairingQRData(),
      message: 'Kopplungsmodus gestartet. Der Server sendet nun UDP-Broadcasts.',
    });
  }

  // POST /pair/stop – stop pairing mode
  if (req.method === 'POST' && url.pathname === '/pair/stop') {
    stopPairingBroadcast();
    return json(res, 200, { ok: true, message: 'Kopplungsmodus beendet.' });
  }

  // POST /pair/verify – verify code and return connection config (rate-limited)
  if (req.method === 'POST' && url.pathname === '/pair/verify') {
    if (Date.now() < pairingBlockedUntil) {
      return json(res, 429, { ok: false, error: 'Zu viele Fehlversuche. Bitte warte 30 Sekunden.' });
    }
    let body;
    try { body = JSON.parse(await readBody(req)); } catch {
      return json(res, 400, { ok: false, error: 'Invalid JSON.' });
    }
    if (!pairingMode) {
      return json(res, 400, { ok: false, error: 'Kopplungsmodus ist nicht aktiv.' });
    }
    if (body.code !== pairingCode) {
      pairingFailCount++;
      if (pairingFailCount >= 5) {
        pairingBlockedUntil = Date.now() + 30_000;
        pairingFailCount = 0;
        return json(res, 429, { ok: false, error: 'Zu viele Fehlversuche. 30 Sekunden Sperre.' });
      }
      return json(res, 403, { ok: false, error: 'Falscher Kopplungscode.' });
    }
    pairingFailCount = 0;
    pairingBlockedUntil = 0;
    return json(res, 200, {
      ok: true,
      serverUrl: `http://${getEffectivePublicIp()}:${PORT}`,
      token: TOKEN || body.token || '',
      pairingCode,
      serverName: getHostname(),
      providers: Object.keys(providers),
    });
  }

  return json(res, 404, { ok: false, error: 'Pairing endpoint not found.' });
}

// ── Existing handlers ─────────────────────────────────────────

function accessToCodexSandbox(access) {
  if (access === 'read-only') return 'read-only';
  if (access === 'full') return 'danger-full-access';
  return 'workspace-write';
}

function normalizeReasoningEffort(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium';
}

function buildPrompt(systemPrompt, prompt, access, projectPath) {
  const accessInstruction =
    access === 'read-only'
      ? 'WICHTIG: Arbeite ausschliesslich lesend. Veraendere keine Dateien und fuehre keine destruktiven Befehle aus.'
      : access === 'workspace-write'
        ? `WICHTIG: Veraendere nur Dateien innerhalb dieses Projektordners: ${projectPath}`
        : 'Du darfst die fuer die Aufgabe erforderlichen Werkzeuge verwenden.';
  const system = String(systemPrompt || '').trim();
  return [accessInstruction, system ? `System-Prompt:\n${system}` : '', prompt].filter(Boolean).join('\n\n');
}

function accessToClaudeMode(access) {
  if (access === 'read-only') return 'plan';
  if (access === 'full') return 'bypassPermissions';
  return 'auto';
}

function buildAgentCommand(providerId, model, prompt, access, projectPath, reasoningEffort) {
  const args = [];
  let stdin = '';

  if (providerId === 'antigravity') {
    args.push('-p', prompt, '--model', model, '--dangerously-skip-permissions');
  } else if (providerId === 'openai') {
    args.push(
      'exec',
      '-',
      '--model',
      model,
      '--cd',
      projectPath,
      '--color',
      'never',
      '--skip-git-repo-check',
      '--config',
      `model_reasoning_effort="${normalizeReasoningEffort(reasoningEffort)}"`,
      '--sandbox',
      accessToCodexSandbox(access),
    );
    if (access === 'full') args.push('--dangerously-bypass-approvals-and-sandbox');
    stdin = prompt;
  } else if (providerId === 'anthropic') {
    args.push('-p', '--model', model, '--output-format', 'text', '--permission-mode', accessToClaudeMode(access));
    if (access === 'full') args.push('--dangerously-skip-permissions');
    stdin = prompt;
  } else if (providerId === 'cursor') {
    args.push('-p', prompt, '--output-format', 'text');
    if (model && model !== 'default') args.push('--model', model);
  } else if (providerId === 'opencode') {
    args.push('run', '--dir', projectPath);
    if (model && model !== 'default') args.push('--model', model);
    if (access === 'full') args.push('--dangerously-skip-permissions');
    args.push(prompt);
  } else if (providerId === 'freebuff') {
    args.push('-p', prompt);
    if (model && model !== 'default') args.push('--model', model);
  }

  return { args, stdin };
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { 
        ...(!isWin && {
          HOME: process.env.HOME || '/root', 
          USER: process.env.USER || 'root',
        }),
        ...process.env, 
        FORCE_COLOR: '0', 
        NO_COLOR: '1' 
      },
      shell: isWin,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      options.onOutput?.(chunk, 'stdout');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      options.onOutput?.(chunk, 'stderr');
    });
    child.on('error', (error) => resolve({ ok: false, stdout, stderr, error: error.message, exitCode: -1 }));
    child.on('close', (exitCode) => {
      resolve({
        ok: exitCode === 0,
        stdout,
        stderr,
        error: exitCode === 0 ? '' : stderr.trim() || `Process exited with code ${exitCode}.`,
        exitCode: exitCode ?? -1,
      });
    });
    if (options.stdin) child.stdin.write(options.stdin);
    child.stdin.end();
    setTimeout(() => {
      if (!child.killed) child.kill('SIGTERM');
    }, options.timeoutMs || 10 * 60 * 1000).unref();
  });
}

async function handleHealth(req, res) {
  if (!isAuthorized(req)) return unauthorized(res);
  json(res, 200, {
    ok: true,
    name: 'CodeForge Remote Server',
    providers: Object.fromEntries(
      Object.entries(providers).map(([id, provider]) => [id, { command: resolveCommand(provider) }]),
    ),
    tokenConfigured: Boolean(TOKEN),
  });
}

async function handleRun(req, res) {
  if (!isAuthorized(req)) return unauthorized(res);

  let input;
  try {
    input = JSON.parse(await readBody(req));
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'Invalid JSON.' });
  }

  const providerId = String(input.provider || 'openai');
  const provider = providers[providerId];
  const prompt = String(input.prompt || '').trim();
  const projectPath = String(input.projectPath || '').trim();
  const access = ['read-only', 'workspace-write', 'full'].includes(input.access) ? input.access : 'workspace-write';
  const model = String(input.model || (providerId === 'openai' ? 'gpt-5.5' : 'default'));
  const reasoningEffort = normalizeReasoningEffort(input.reasoningEffort);
  const outputLimit = Math.max(1000, Math.min(50_000, Number(input.outputLimit || 12_000)));
  const wantsStream = input.stream === true || /\bapplication\/x-ndjson\b/i.test(String(req.headers.accept || ''));

  if (!provider) return json(res, 400, { ok: false, error: 'Unknown provider.' });
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) return json(res, 400, { ok: false, error: 'Prompt is empty or too large.' });

  let effectiveProjectPath = projectPath;
  if (!projectPath || !existsSync(effectiveProjectPath) || !statSync(effectiveProjectPath).isDirectory()) {
    const isWin = process.platform === 'win32';
    const userHome = process.env.USERPROFILE || process.env.HOME || '';
    if (isWin) {
      if (projectPath.startsWith('/root/') || projectPath === '/root/codeforge-project' || projectPath.startsWith('~/')) {
        const docPath = path.join(userHome, 'OneDrive/Dokumente/CodeForge/Ohne Projekt');
        const docPathAlt = path.join(userHome, 'Documents/CodeForge/Ohne Projekt');
        if (existsSync(docPath)) {
          effectiveProjectPath = docPath;
        } else if (existsSync(docPathAlt)) {
          effectiveProjectPath = docPathAlt;
        } else {
          try {
            mkdirSync(docPath, { recursive: true });
            effectiveProjectPath = docPath;
          } catch (_) {
            effectiveProjectPath = userHome || process.cwd();
          }
        }
      } else {
        try {
          mkdirSync(projectPath, { recursive: true });
          effectiveProjectPath = projectPath;
        } catch (_) {
          effectiveProjectPath = userHome || process.cwd();
        }
      }
    } else {
      try {
        mkdirSync(projectPath, { recursive: true });
        effectiveProjectPath = projectPath;
      } catch (_) {
        return json(res, 400, { ok: false, error: 'Project path does not exist on the server and could not be created.' });
      }
    }
  }

  const finalPrompt = buildPrompt(input.systemPrompt, prompt, access, effectiveProjectPath);
  const { args, stdin } = buildAgentCommand(providerId, model, finalPrompt, access, effectiveProjectPath, reasoningEffort);
  const startedAt = Date.now();
  const runId = randomUUID();

  if (wantsStream) {
    const allowedOrigin = process.env.CODEFORGE_CORS_ORIGIN || '*';
    res.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no',
      'access-control-allow-origin': allowedOrigin,
    });
    const writeEvent = (payload) => res.write(`${JSON.stringify(payload)}\n`);
    writeEvent({ type: 'start', ok: true, runId, provider: providerId, startedAt });
    const result = await runCapture(resolveCommand(provider), args, {
      cwd: effectiveProjectPath,
      stdin,
      onOutput: (chunk, stream) => writeEvent({ type: 'output', runId, stream, chunk }),
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    writeEvent({
      type: 'done',
      ok: result.ok,
      runId,
      exitCode: result.exitCode,
      durationMs: Date.now() - startedAt,
      output: output.slice(0, outputLimit),
      truncated: output.length > outputLimit,
      error: result.error,
    });
    res.end();
    return;
  }

  const result = await runCapture(resolveCommand(provider), args, { cwd: effectiveProjectPath, stdin });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

  json(res, result.ok ? 200 : 500, {
    ok: result.ok,
    runId,
    exitCode: result.exitCode,
    durationMs: Date.now() - startedAt,
    output: output.slice(0, outputLimit),
    truncated: output.length > outputLimit,
    error: result.error,
  });
}

async function handleUsage(req, res) {
  if (!isAuthorized(req)) return unauthorized(res);
  try {
    const disk = await runCapture('df', ['-h', '/']);
    const mem = await runCapture('free', ['-h']);
    const cpu = await runCapture('uptime', []);
    let agyOutput = 'Not available';
    try {
      const agyVersion = await runCapture('agy', ['--version']);
      agyOutput = agyVersion.stdout.trim() || agyVersion.stderr.trim() || 'Not available';
    } catch (_) {}
    
    const usageOutput = [
      `=== SYSTEM STATUS ===`,
      cpu.stdout.trim(),
      `\n=== MEMORY USAGE ===`,
      mem.stdout.trim(),
      `\n=== DISK SPACE ===`,
      disk.stdout.trim(),
      `\n=== ANTIGRAVITY VERSION ===`,
      agyOutput
    ].join('\n');
    
    json(res, 200, { ok: true, output: usageOutput });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
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

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith('/pair')) {
    return handlePairing(req, res);
  }

  if (req.method === 'GET' && pathname === '/discover') {
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

  if (req.method === 'POST' && pathname === '/run') {
    return handleRun(req, res);
  }

  if (req.method === 'GET' && pathname === '/media') {
    return handleMedia(req, res);
  }

  if (req.method === 'GET' && pathname === '/usage') {
    return handleUsage(req, res);
  }

  if (req.method === 'GET' && pathname === '/health') {
    return handleHealth(req, res);
  }

  json(res, 404, { ok: false, error: 'Not found.' });
});

// -- WebSocket IPC Server (Sync Server) --
const wss = new WebSocketServer({ server });
const handlers = new Map();
const activeShells = new Map();
const activeTerminalProcesses = new Map();

function broadcast(msg, excludeWs = null, targetWs = null) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === 1 && (!targetWs || client === targetWs)) {
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
              ws,
              sender: {
                send: (ch, data) => broadcast({ type: 'ipc-event', channel: ch, data }, null, ws)
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

  ws.on('close', () => {
    if (ws.activeChatId && activeShells.has(ws.activeChatId)) {
      const ptyProc = activeShells.get(ws.activeChatId);
      try { ptyProc.kill(); } catch (e) {}
      activeShells.delete(ws.activeChatId);
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
  if (event.ws) event.ws.activeChatId = chatId;
  if (activeShells.has(chatId)) return;
  const isWin = process.platform === 'win32';
  const shell = isWin ? (shellType === 'powershell' ? 'powershell.exe' : (process.env.COMSPEC || 'cmd.exe')) : 'bash';
  const args = isWin && shellType === 'powershell' ? ['-NoLogo'] : [];
  
  let spawnCwd = PROJECT_PATH;
  if (cwd && existsSync(cwd) && statSync(cwd).isDirectory()) spawnCwd = cwd;

  const env = { ...process.env };
  if (isWin) {
    const agyPath = join(userHome, 'AppData/Local/agy/bin');
    const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
    const paths = (env[pathKey] || '').split(';');
    if (!paths.some(p => p.toLowerCase() === agyPath.toLowerCase())) {
      paths.push(agyPath);
    }
    // Clean up case-variant duplicates of PATH on Windows to prevent node-pty launch errors
    for (const k of Object.keys(env)) {
      if (k.toUpperCase() === 'PATH') delete env[k];
    }
    env[pathKey] = paths.join(';');
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
