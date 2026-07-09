#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { randomUUID, randomInt } from 'node:crypto';
import { networkInterfaces, hostname } from 'node:os';
import { extname, join } from 'node:path';
import dgram from 'node:dgram';

let PORT = Number(process.env.PORT || process.env.CODEFORGE_PORT || 8787);
const START_PORT = PORT;
const MAX_PORT_TRIES = 10;
const HOST = process.env.HOST || process.env.CODEFORGE_HOST || '0.0.0.0';
const TOKEN = process.env.CODEFORGE_TOKEN || '';
const AUTO_PAIR = process.env.CODEFORGE_AUTO_PAIR === 'true' || process.env.CODEFORGE_AUTO_PAIR === '1';
const MAX_PROMPT_CHARS = Number(process.env.CODEFORGE_MAX_PROMPT_CHARS || 100_000);

// Pairing mode
const PAIRING_PORT = Number(process.env.CODEFORGE_PAIRING_PORT || 8786);
const PAIRING_AUTO_STOP_MINUTES = Number(process.env.CODEFORGE_PAIRING_TIMEOUT || process.env.PAIRING_AUTO_STOP_MINUTES || 5);
let pairingMode = false;
let pairingCode = '';
let pairingBroadcastInterval = null;
let udpSocket = null;
let udpEaccesLogged = false;
let pairingFailCount = 0;
let pairingBlockedUntil = 0;

const providers = {
  antigravity: { command: 'agy', candidates: ['agy', '/root/.local/bin/agy', '/usr/local/bin/agy', '/usr/bin/agy'], versionArgs: ['--version'] },
  openai: { command: 'codex', candidates: ['codex', '/root/.local/bin/codex', '/usr/local/bin/codex', '/usr/bin/codex'], versionArgs: ['--version'] },
  anthropic: { command: 'claude', candidates: ['claude', '/root/.local/bin/claude', '/usr/local/bin/claude', '/usr/bin/claude'], versionArgs: ['--version'] },
  cursor: { command: 'cursor-agent', candidates: ['cursor-agent', 'agent', '/root/.local/bin/cursor-agent', '/usr/local/bin/cursor-agent'], versionArgs: ['--version'] },
  opencode: { command: 'opencode', candidates: ['opencode', '/root/.local/bin/opencode', '/usr/local/bin/opencode', '/usr/bin/opencode'], versionArgs: ['--version'] },
  freebuff: { command: 'freebuff', candidates: ['freebuff', '/root/.local/bin/freebuff', '/usr/local/bin/freebuff', '/usr/bin/freebuff'], versionArgs: ['--version'] },
};

function getLocalIp() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && !iface.internal && iface.family === 'IPv4')
    .map((iface) => iface.address)[0] || HOST;
}

function getEffectivePublicIp() {
  return process.env.CODEFORGE_PUBLIC_IP || getLocalIp();
}

function getHostname() {
  try { return hostname(); } catch { return 'codeforge-server'; }
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  const allowedOrigin = process.env.CODEFORGE_CORS_ORIGIN || '*';
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function unauthorized(res) {
  json(res, 401, { ok: false, error: 'Unauthorized. Set CODEFORGE_TOKEN on the server and use it in the app.' });
}

function isAuthorized(req) {
  if (!TOKEN) return false;
  const header = req.headers.authorization || '';
  return header === `Bearer ${TOKEN}`;
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
      version: '2.3.0',
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
    serverIp: localIp,
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

function resolveCommand(provider) {
  for (const candidate of provider.candidates || [provider.command]) {
    if (candidate.includes('/') && existsSync(candidate)) return candidate;
  }
  return provider.command;
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
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { 
        HOME: process.env.HOME || '/root', 
        USER: process.env.USER || 'root', 
        ...process.env, 
        FORCE_COLOR: '0', 
        NO_COLOR: '1' 
      },
      shell: false,
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
  if (!projectPath || !existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
    return json(res, 400, { ok: false, error: 'Project path does not exist on the server.' });
  }

  const finalPrompt = buildPrompt(input.systemPrompt, prompt, access, projectPath);
  const { args, stdin } = buildAgentCommand(providerId, model, finalPrompt, access, projectPath, reasoningEffort);
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
      cwd: projectPath,
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

  const result = await runCapture(resolveCommand(provider), args, { cwd: projectPath, stdin });
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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

async function handleMedia(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const filePath = url.searchParams.get('path');
  
  if (!filePath) {
    return json(res, 400, { ok: false, error: 'Missing path parameter.' });
  }
  
  const normalized = join('/', filePath.replace(/\\/g, '/').replace(/^~/, 'root'));
  const resolved = join('/', normalized);
  
  if (!existsSync(resolved)) {
    return json(res, 404, { ok: false, error: 'File not found.' });
  }
  
  if (!statSync(resolved).isFile()) {
    return json(res, 400, { ok: false, error: 'Not a file.' });
  }
  
  const ext = extname(resolved).toLowerCase();
  const contentType = MEDIA_TYPES[ext] || 'application/octet-stream';
  
  const allowedOrigin = process.env.CODEFORGE_CORS_ORIGIN || '*';
  res.writeHead(200, {
    'content-type': contentType,
    'access-control-allow-origin': allowedOrigin,
    'cache-control': 'public, max-age=3600',
    'content-length': statSync(resolved).size,
  });
  
  const stream = createReadStream(resolved);
  stream.on('error', () => {
    if (!res.headersSent) {
      json(res, 500, { ok: false, error: 'Error reading file.' });
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

async function handleDiscover(req, res) {
  const localIp = getLocalIp();
  json(res, 200, {
    ok: true,
    service: 'codeforge-remote',
    name: 'CodeForge Remote Server',
    version: '2.3.0',
    localIp,
    port: PORT,
    tokenRequired: Boolean(TOKEN),
    providers: Object.keys(providers),
    pairingActive: pairingMode,
    pairingCode: pairingMode ? pairingCode : undefined,
    hostname: getHostname(),
  });
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  // Pairing endpoints (public – no auth for discovery/verify)
  const url = req.url || '/';
  if (url === '/pair' || url.startsWith('/pair?') || url.startsWith('/pair/')) {
    return void handlePairing(req, res);
  }
  if (req.method === 'GET' && url === '/discover') return void handleDiscover(req, res);
  if (req.method === 'GET' && url === '/health') return void handleHealth(req, res);
  if (req.method === 'GET' && (url === '/media' || url.startsWith('/media?'))) return void handleMedia(req, res);
  if (req.method === 'GET' && url === '/usage') return void handleUsage(req, res);
  if (req.method === 'POST' && url === '/run') return void handleRun(req, res);
  json(res, 404, { ok: false, error: 'Not found.' });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    if (PORT - START_PORT < MAX_PORT_TRIES) {
      PORT++;
      console.log(`⚠️  Port ${PORT - 1} belegt → versuche Port ${PORT}...`);
      server.listen(PORT, HOST);
      return;
    }
    console.error(`❌ Kein freier Port gefunden (${START_PORT}–${START_PORT + MAX_PORT_TRIES - 1}).`);
    process.exit(1);
  }
  console.error('Server error:', err.message);
});

server.listen(PORT, HOST, () => {
  if (!TOKEN) {
    console.error('CODEFORGE_TOKEN is not set. The API will reject all requests.');
  }
  const localIp = getLocalIp();
  console.log(`CodeForge Remote Server v2.4.0 – http://${HOST}:${PORT}`);
  console.log(`Entdeckbar unter: http://${getEffectivePublicIp()}:${PORT}`);
  
  // Auto-pairing mode
  if (AUTO_PAIR) {
    startPairingBroadcast();
  }
});
