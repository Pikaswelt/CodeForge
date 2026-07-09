const { app, BrowserWindow, dialog, ipcMain, shell, Notification, protocol, net } = require('electron');
protocol.registerSchemesAsPrivileged([
  { scheme: 'codeforge-media', privileges: { bypassCSP: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);
const { spawn, execFile } = require('node:child_process');
const pty = require('node-pty');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DiscordRPC = require('discord-rpc');
const { autoUpdater } = require('electron-updater');
const { setupUpdater } = require('./updater.cjs');
let updater = null;

const http = require('node:http');
const os = require('node:os');
const { WebSocketServer } = require('ws');

const handlers = new Map();
let syncServer = null;
let wss = null;
let syncState = {};
let syncToken = '';

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

function broadcast(msg, excludeWs = null) {
  if (!wss) return;
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(data);
    }
  }
}

function startSyncServer() {
  if (syncServer) {
    const port = syncServer.address().port;
    const ip = getLocalIpAddress();
    return { url: `http://${ip}:${port}`, ip, port };
  }

  const port = 8788;
  const ip = getLocalIpAddress();

  // Initialize sync token
  syncToken = process.env.CODEFORGE_SYNC_TOKEN || '';
  if (!syncToken) {
    syncToken = 'codeforge-' + crypto.randomUUID().slice(0, 8);
    console.log('CodeForge Sync Token (set CODEFORGE_SYNC_TOKEN env to customize): ' + syncToken);
  }

  syncServer = http.createServer((req, res) => {
    // CORS headers for all responses
    const setCors = () => {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-headers', 'authorization, content-type, accept');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    };
    setCors();

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = req.url.split('?')[0];
    const authHeader = req.headers.authorization || '';
    const isAuthorized = authHeader === 'Bearer ' + syncToken;
    const jsonResponse = (status, payload) => {
      const body = JSON.stringify(payload);
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(body);
    };

    // ---- REST API ROUTES ----

    // GET /health - Server status and provider info
    if (req.method === 'GET' && urlPath === '/health') {
      if (!isAuthorized) { jsonResponse(401, { ok: false, error: 'Unauthorized.' }); return; }
      getCliStatus().then(function(status) {
        jsonResponse(200, {
          ok: true,
          name: 'CodeForge Desktop Sync Server',
          version: app.getVersion(),
          providers: status,
          tokenConfigured: true,
          syncUrl: 'http://' + ip + ':' + port,
        });
      }).catch(function(err) {
        jsonResponse(500, { ok: false, error: err.message });
      });
      return;
    }

    // GET /usage - Provider usage information
    if (req.method === 'GET' && urlPath === '/usage') {
      if (!isAuthorized) { jsonResponse(401, { ok: false, error: 'Unauthorized.' }); return; }
      var providerIds = Object.keys(PROVIDERS);
      var results = {};
      var pending = providerIds.length;
      var responded = false;
      var respond = function() {
        if (responded) return;
        responded = true;
        jsonResponse(200, { ok: true, providers: results });
      };
      if (pending === 0) { respond(); return; }
      var usageTimer = setTimeout(respond, 15000);
      providerIds.forEach(function(id) {
        getProviderUsage(id).then(function(usage) {
          results[id] = usage;
          pending -= 1;
          if (pending === 0) { clearTimeout(usageTimer); respond(); }
        }).catch(function(err) {
          results[id] = { error: err.message };
          pending -= 1;
          if (pending === 0) { clearTimeout(usageTimer); respond(); }
        });
      });
      return;
    }

    // POST /run - Run an agent task
    if (req.method === 'POST' && urlPath === '/run') {
      if (!isAuthorized) { jsonResponse(401, { ok: false, error: 'Unauthorized.' }); return; }
      var bodyChunks = [];
      req.on('error', function() { if (!res.headersSent) jsonResponse(400, { ok: false, error: 'Request aborted.' }); });
      req.on('data', function(chunk) { bodyChunks.push(chunk); });
      req.on('end', function() {
        var body = Buffer.concat(bodyChunks).toString('utf8');
        var input;
        try { input = JSON.parse(body); } catch (e) {
          jsonResponse(400, { ok: false, error: 'Invalid JSON: ' + e.message });
          return;
        }

        var wantsStream = input.stream === true || /application\/x-ndjson/i.test(req.headers.accept || '');
        var runId = input.runId || crypto.randomUUID();
        var startedAt = Date.now();
        var outputLimit = Math.max(1000, Math.min(50000, Number(input.outputLimit || 12000)));

        // Validate required fields
        if (!input.prompt || !input.prompt.trim() || String(input.prompt).length > 100000) {
          jsonResponse(400, { ok: false, error: 'Prompt is empty or too large.' });
          return;
        }
        if (!input.projectPath) {
          jsonResponse(400, { ok: false, error: 'Project path is required.' });
          return;
        }

        // Build a display-friendly version for the desktop UI
        var mockEvent = {
          sender: {
            send: function(ch, data) {
              // Forward to main window if available
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(ch, data);
              }
              // Broadcast via WebSocket to connected clients
              broadcast({ type: 'ipc-event', channel: ch, data: data });
              // If streaming, also write to HTTP response
              if (wantsStream && ch === 'agent:output') {
                try {
                  res.write(JSON.stringify({ type: 'output', runId: runId, stream: data.stream, chunk: data.chunk }) + '\n');
                } catch (_) { /* ignore write errors after client disconnect */ }
              }
            }
          }
        };

        var requestPayload = {
          provider: input.provider || 'openai',
          model: input.model || (input.provider === 'openai' ? 'gpt-5.5' : 'default'),
          prompt: String(input.prompt).trim(),
          projectPath: String(input.projectPath).trim(),
          systemPrompt: String(input.systemPrompt || '').trim(),
          access: ['read-only', 'workspace-write', 'full'].indexOf(input.access) >= 0 ? input.access : 'workspace-write',
          reasoningEffort: ['low', 'medium', 'high'].indexOf(input.reasoningEffort) >= 0 ? input.reasoningEffort : 'medium',
          runId: runId,
          attachments: Array.isArray(input.attachments) ? input.attachments : [],
          apiKeys: input.apiKeys || {},
          externalServer: input.externalServer || null,
          originalPluginEnabled: input.originalPluginEnabled === true,
        };

        if (wantsStream) {
          res.writeHead(200, {
            'content-type': 'application/x-ndjson; charset=utf-8',
            'cache-control': 'no-cache',
            'x-accel-buffering': 'no',
          });
          res.write(JSON.stringify({ type: 'start', ok: true, runId: runId, provider: requestPayload.provider, startedAt: startedAt }) + '\n');

          runAgent(mockEvent, requestPayload).then(function(result) {
            var output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
            res.write(JSON.stringify({
              type: 'done',
              ok: result.ok,
              runId: runId,
              exitCode: result.exitCode,
              durationMs: Date.now() - startedAt,
              output: output.slice(0, outputLimit),
              truncated: output.length > outputLimit,
              error: result.error,
            }) + '\n');
            res.end();
          }).catch(function(err) {
            res.write(JSON.stringify({
              type: 'done',
              ok: false,
              runId: runId,
              exitCode: -1,
              durationMs: Date.now() - startedAt,
              output: '',
              error: err.message,
            }) + '\n');
            res.end();
          });
        } else {
          runAgent(mockEvent, requestPayload).then(function(result) {
            var output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
            jsonResponse(result.ok ? 200 : 500, {
              ok: result.ok,
              runId: runId,
              exitCode: result.exitCode,
              durationMs: Date.now() - startedAt,
              output: output.slice(0, outputLimit),
              truncated: output.length > outputLimit,
              error: result.error,
            });
          }).catch(function(err) {
            jsonResponse(500, {
              ok: false,
              runId: runId,
              exitCode: -1,
              durationMs: Date.now() - startedAt,
              output: '',
              error: err.message,
            });
          });
        }
      });
      return;
    }

    // ---- EXISTING: Media File Serving ----
    if (req.url.startsWith('/media')) {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const filePath = urlObj.searchParams.get('path');
        if (filePath && fs.existsSync(filePath)) {
          const ext = path.extname(filePath).toLowerCase();
          let contentType = 'application/octet-stream';
          if (ext === '.mp4') contentType = 'video/mp4';
          else if (ext === '.webm') contentType = 'video/webm';
          else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
          else if (ext === '.png') contentType = 'image/png';
          
          const stat = fs.statSync(filePath);
          const fileSize = stat.size;
          const range = req.headers.range;
          
          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
            });
            file.pipe(res);
          } else {
            res.writeHead(200, {
              'Content-Length': fileSize,
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
            });
            fs.createReadStream(filePath).pipe(res);
          }
          return;
        }
      } catch (err) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(err.message);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const distPath = path.join(__dirname, '..', 'dist');
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    
    const targetFile = path.join(distPath, reqPath);
    if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      const ext = path.extname(targetFile).toLowerCase();
      let contentType = 'text/html';
      if (ext === '.js') contentType = 'application/javascript';
      else if (ext === '.css') contentType = 'text/css';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.svg') contentType = 'image/svg+xml';
      
      res.writeHead(200, {
        'content-type': contentType,
        'access-control-allow-origin': '*',
      });
      fs.createReadStream(targetFile).pipe(res);
      return;
    }

    const indexHtml = path.join(distPath, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, {
        'content-type': 'text/html',
        'access-control-allow-origin': '*',
      });
      fs.createReadStream(indexHtml).pipe(res);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
  });

  wss = new WebSocketServer({ server: syncServer });

  wss.on('connection', (ws, req) => {
    // Authenticate WebSocket connections with the same sync token
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const wsToken = url.searchParams.get('token') || req.headers['authorization']?.replace(/^Bearer /i, '').trim() || '';
    const isWsAuthorized = syncToken && wsToken === syncToken;

    ws.isAuthorized = isWsAuthorized;

    if (!isWsAuthorized) {
      console.log('Sync WebSocket connection rejected (invalid token)');
      ws.send(JSON.stringify({ type: 'error', error: 'Unauthorized. Provide ?token= or Authorization header with the sync token.' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    console.log('Sync WebSocket connection established (authenticated)');

    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message);
        
        if (msg.type === 'init') {
          ws.send(JSON.stringify({ type: 'sync-state', state: syncState }));
        } 
        else if (msg.type === 'state-update') {
          Object.assign(syncState, msg.state);
          broadcast({ type: 'state-update', state: msg.state }, ws);
        }
        else if (msg.type === 'ipc-call') {
          // IPC calls always require authorization
          if (!ws.isAuthorized) {
            ws.send(JSON.stringify({ type: 'ipc-response', id: msg.id, error: 'Unauthorized' }));
            return;
          }
          const fn = handlers.get(msg.method);
          if (fn) {
            try {
              const mockEvent = {
                sender: {
                  send: (ch, data) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send(ch, data);
                    }
                    broadcast({ type: 'ipc-event', channel: ch, data });
                  }
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
        console.error('Error handling sync socket message:', err);
      }
    });
  });

  syncServer.listen(port, '0.0.0.0', () => {
    console.log(`Sync Server started at http://localhost:${port}`);
  });

  return { url: `http://${ip}:${port}`, ip, port };
}

// Monkeypatch ipcMain.handle
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, fn) => {
  handlers.set(channel, fn);
  originalHandle(channel, async (event, ...args) => {
    if (event && event.sender && typeof event.sender.send === 'function') {
      const originalSend = event.sender.send.bind(event.sender);
      event.sender.send = (ch, data) => {
        originalSend(ch, data);
        broadcast({ type: 'ipc-event', channel: ch, data });
      };
    }
    return fn(event, ...args);
  });
};

const activeProcesses = new Map();
const artworkCache = new Map();
const nativeAppTabs = new Map();
let mainWindow = null;
let discordClient = null;
let discordReady = false;
let discordStartedAt = Date.now();
const DISCORD_CLIENT_ID = '1518686223676342282';
const UPDATE_OWNER = 'Pikaswelt';
const UPDATE_REPO = 'agent-manager';
const UPDATE_LATEST_YML_URL = `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest/download/latest.yml`;
const UPDATE_DOWNLOAD_BASE_URL = `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest/download/`;

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

if (process.platform === 'win32') {
  app.setAppUserModelId('app.codeforge.desktop');
}

DiscordRPC.register(DISCORD_CLIENT_ID);

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

// Updater initialized later in createWindow() to have mainWindow reference

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

const PROVIDERS = {
  antigravity: {
    command: 'agy',
    label: 'Antigravity CLI',
    versionArgs: ['--version'],
    installCommand:
      process.platform === 'win32'
        ? 'irm https://antigravity.google/cli/install.ps1 | iex'
        : 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    installUrl: 'https://antigravity.google/docs/cli-getting-started',
  },
  openai: {
    command: 'codex',
    label: 'Codex CLI',
    versionArgs: ['--version'],
    installCommand:
      process.platform === 'win32'
        ? 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"'
        : 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
    installUrl: 'https://developers.openai.com/codex/cli',
  },
  anthropic: {
    command: 'claude',
    label: 'Claude Code',
    versionArgs: ['--version'],
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    installUrl: 'https://code.claude.com/docs',
  },
  cursor: {
    command: 'agent',
    aliases: ['cursor-agent'],
    label: 'Cursor Agent',
    versionArgs: ['--version'],
    installCommand:
      process.platform === 'win32'
        ? "irm 'https://cursor.com/install?win32=true' | iex"
        : 'curl https://cursor.com/install -fsS | bash',
    installUrl: 'https://cursor.com/docs/cli/installation',
  },
  opencode: {
    command: 'opencode',
    label: 'OpenCode',
    versionArgs: ['--version'],
    installCommand: 'npm install -g opencode-ai@latest',
    installUrl: 'https://opencode.ai/docs/',
  },
  freebuff: {
    command: 'freebuff',
    label: 'FreeBuff',
    versionArgs: ['--version'],
    installCommand: 'npm install -g freebuff',
    installUrl: 'https://github.com/FreeBuff/FreeBuff',
  },
};

const USAGE_PROBES = {
  antigravity: [
    { args: [], stdin: '/usage\n\u001b', label: 'agy /usage' },
    { args: ['-p', '/usage'], label: 'agy -p /usage' },
    { command: 'antigravity-usage', args: ['--json'] },
    ['usage'],
    ['account', 'usage'],
    ['status'],
  ],
  openai: [
    ['/status'],
    ['ccusage'],
    ['usage'],
    ['status'],
    ['auth', 'status'],
  ],
  anthropic: [
    { command: 'ccusage', args: [] },
    ['usage'],
    ['status'],
    ['doctor'],
  ],
  cursor: [
    ['status'],
    ['usage'],
  ],
  opencode: [
    ['stats'],
    ['auth', 'list'],
  ],
  freebuff: [
    ['--version'],
  ],
};

function getAssetPath(fileName) {
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, 'app.asar', 'assets', fileName) : '',
    app.isPackaged ? path.join(process.resourcesPath, 'app', 'assets', fileName) : '',
    path.join(__dirname, '..', 'assets', fileName),
    path.join(process.cwd(), 'assets', fileName),
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || candidates.at(-1);
}

const MODEL_ALLOWLIST = {
  antigravity: new Set([
    'Gemini 3.5 Flash (Medium)',
    'Gemini 3.5 Flash (High)',
    'Gemini 3.5 Flash (Low)',
    'Gemini 3.1 Pro (High)',
    'Gemini 3.1 Pro (Low)',
    'Claude Sonnet 4.6 (Thinking)',
    'Claude Opus 4.6 (Thinking)',
    'GPT-OSS 120B (Medium)',
  ]),
  openai: new Set(['gpt-5.5', 'gpt-5.4']),
  anthropic: new Set(['sonnet', 'opus', 'haiku', 'fable', 'claude-sonnet-4-6', 'claude-opus-4-6']),
  cursor: new Set(['default', 'gpt-5.5', 'claude-sonnet-4-6']),
  opencode: new Set(['default', 'openai/gpt-5.5', 'anthropic/claude-sonnet-4-6', 'google/gemini-3.5-flash']),
  freebuff: new Set(['default', 'deepseek-v4', 'kimi-k2.6', 'minimax-m2.7']),
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#111111',
    title: 'CodeForge',
    icon: getAssetPath(process.platform === 'win32' ? 'codeforge.ico' : 'codeforge.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
  });

  mainWindow.webContents.on('did-attach-webview', (_event, webContents) => {
    webContents.setWindowOpenHandler((details) => {
      if (/^https?:\/\//i.test(details.url)) {
        process.nextTick(() => {
          if (!webContents.isDestroyed()) {
            webContents.loadURL(details.url);
          }
        });
      }
      return { action: 'deny' };
    });
  });
}

function findExecutable(command) {
  return new Promise((resolve) => {
    const locator = process.platform === 'win32' ? 'where.exe' : 'which';
    execFile(locator, [command], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const candidates = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const executable =
        process.platform === 'win32'
          ? candidates.find((file) => /\.(exe|com)$/i.test(file)) ||
            candidates.find((file) => /\.(cmd|bat)$/i.test(file))
          : candidates[0];
      resolve(executable || null);
    });
  });
}

function getMainWindowHwnd() {
  if (!mainWindow) throw new Error('CodeForge-Fenster ist nicht bereit.');
  const handle = mainWindow.getNativeWindowHandle();
  if (handle.length >= 8) return handle.readBigUInt64LE(0).toString();
  return String(handle.readUInt32LE(0));
}

function normalizeNativeBounds(bounds = {}, dpr = 1) {
  const scale = Number.isFinite(Number(dpr)) && Number(dpr) > 0 ? Number(dpr) : 1;
  const toPixel = (value, fallback) => Math.round((Number.isFinite(Number(value)) ? Number(value) : fallback) * scale);
  return {
    x: toPixel(bounds.x, -32000),
    y: toPixel(bounds.y, -32000),
    width: Math.max(1, toPixel(bounds.width, 100)),
    height: Math.max(1, toPixel(bounds.height, 100)),
  };
}

function buildNativeWindowScript(payload) {
  const json = JSON.stringify(payload);
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$payload = @'
${json}
'@ | ConvertFrom-Json

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class CodeForgeNativeWindow {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr SetParent(IntPtr child, IntPtr newParent);

  [DllImport("user32.dll", EntryPoint="GetWindowLongPtr", SetLastError=true)]
  public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll", EntryPoint="SetWindowLongPtr", SetLastError=true)]
  public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

  [DllImport("user32.dll")]
  public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int command);
}
"@

$GWL_STYLE = -16
$WS_CHILD = 0x40000000L
$WS_POPUP = 0x80000000L
$WS_CAPTION = 0x00C00000L
$WS_THICKFRAME = 0x00040000L
$WS_SYSMENU = 0x00080000L
$WS_MINIMIZEBOX = 0x00020000L
$WS_MAXIMIZEBOX = 0x00010000L
$SW_SHOW = 5
$SW_RESTORE = 9

function Convert-Hwnd([object]$value) {
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) { return [IntPtr]::Zero }
  return [IntPtr]::new([Int64]([string]$value))
}

function Find-TopWindow([int]$processId) {
  $ids = New-Object 'System.Collections.Generic.HashSet[UInt32]'
  [void]$ids.Add([uint32]$processId)
  $changed = $true
  while ($changed) {
    $changed = $false
    Get-CimInstance Win32_Process | ForEach-Object {
      if ($ids.Contains([uint32]$_.ParentProcessId) -and -not $ids.Contains([uint32]$_.ProcessId)) {
        [void]$ids.Add([uint32]$_.ProcessId)
        $changed = $true
      }
    }
  }

  $script:WindowProcessIds = $ids
  $script:FoundHwnd = [IntPtr]::Zero
  $callback = [CodeForgeNativeWindow+EnumWindowsProc]{
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    [uint32]$windowPid = 0
    [CodeForgeNativeWindow]::GetWindowThreadProcessId($hWnd, [ref]$windowPid) | Out-Null
    if ($script:WindowProcessIds.Contains($windowPid) -and
        [CodeForgeNativeWindow]::IsWindowVisible($hWnd) -and
        [CodeForgeNativeWindow]::GetWindowTextLength($hWnd) -gt 0) {
      $script:FoundHwnd = $hWnd
      return $false
    }
    return $true
  }
  [CodeForgeNativeWindow]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
  return $script:FoundHwnd
}

function Wait-TopWindow([int]$processId) {
  $deadline = (Get-Date).AddSeconds(15)
  do {
    $hwnd = Find-TopWindow $processId
    if ($hwnd -ne [IntPtr]::Zero) { return $hwnd }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  return [IntPtr]::Zero
}

function Write-Result([hashtable]$result) {
  $result | ConvertTo-Json -Compress -Depth 4
}

$action = [string]$payload.action
$hwnd = Convert-Hwnd $payload.hwnd
$targetPid = if ($payload.pid) { [int]$payload.pid } else { 0 }

if ($action -eq 'attach') {
  if ($hwnd -eq [IntPtr]::Zero -or -not [CodeForgeNativeWindow]::IsWindow($hwnd)) {
    if ($targetPid -le 0) {
      $path = [string]$payload.path
      if (-not (Test-Path -LiteralPath $path)) { throw "App-Pfad nicht gefunden: $path" }
      $workingDirectory = [System.IO.Path]::GetDirectoryName($path)
      if ([string]::IsNullOrWhiteSpace($workingDirectory)) {
        $workingDirectory = [Environment]::CurrentDirectory
      }
      $process = Start-Process -FilePath $path -WorkingDirectory $workingDirectory -PassThru
      $targetPid = [int]$process.Id
    }
    $hwnd = Wait-TopWindow $targetPid
  }

  if ($hwnd -eq [IntPtr]::Zero) {
    Write-Result @{ ok = $false; pid = $targetPid; hwnd = ""; message = "Die App wurde gestartet, aber CodeForge konnte kein einbettbares Hauptfenster finden." }
    exit 0
  }

  $parent = Convert-Hwnd $payload.parentHwnd
  $style = [Int64][CodeForgeNativeWindow]::GetWindowLongPtr($hwnd, $GWL_STYLE)
  $style = ($style -bor $WS_CHILD)
  $style = ($style -band (-bnot $WS_POPUP))
  $style = ($style -band (-bnot $WS_CAPTION))
  $style = ($style -band (-bnot $WS_THICKFRAME))
  $style = ($style -band (-bnot $WS_SYSMENU))
  $style = ($style -band (-bnot $WS_MINIMIZEBOX))
  $style = ($style -band (-bnot $WS_MAXIMIZEBOX))
  [CodeForgeNativeWindow]::SetWindowLongPtr($hwnd, $GWL_STYLE, [IntPtr]::new($style)) | Out-Null
  [CodeForgeNativeWindow]::SetParent($hwnd, $parent) | Out-Null
  [CodeForgeNativeWindow]::ShowWindow($hwnd, $SW_RESTORE) | Out-Null
  [CodeForgeNativeWindow]::ShowWindow($hwnd, $SW_SHOW) | Out-Null
}

if (($action -eq 'attach' -or $action -eq 'move') -and $hwnd -ne [IntPtr]::Zero -and [CodeForgeNativeWindow]::IsWindow($hwnd)) {
  $bounds = $payload.bounds
  [CodeForgeNativeWindow]::MoveWindow($hwnd, [int]$bounds.x, [int]$bounds.y, [int]$bounds.width, [int]$bounds.height, $true) | Out-Null
  Write-Result @{ ok = $true; pid = $targetPid; hwnd = $hwnd.ToInt64().ToString(); message = "Eingebettet" }
  exit 0
}

if ($action -eq 'detach' -and $hwnd -ne [IntPtr]::Zero -and [CodeForgeNativeWindow]::IsWindow($hwnd)) {
  $style = [Int64][CodeForgeNativeWindow]::GetWindowLongPtr($hwnd, $GWL_STYLE)
  $style = ($style -bor $WS_POPUP)
  $style = ($style -band (-bnot $WS_CHILD))
  [CodeForgeNativeWindow]::SetWindowLongPtr($hwnd, $GWL_STYLE, [IntPtr]::new($style)) | Out-Null
  [CodeForgeNativeWindow]::SetParent($hwnd, [IntPtr]::Zero) | Out-Null
  [CodeForgeNativeWindow]::MoveWindow($hwnd, 120, 120, 1100, 760, $true) | Out-Null
  [CodeForgeNativeWindow]::ShowWindow($hwnd, $SW_SHOW) | Out-Null
  Write-Result @{ ok = $true; pid = $targetPid; hwnd = $hwnd.ToInt64().ToString(); message = "Geloest" }
  exit 0
}

Write-Result @{ ok = $false; pid = $targetPid; hwnd = ""; message = "Kein gueltiges Fenster gefunden." }
`;
}

async function runNativeWindowScript(payload) {
  if (process.platform !== 'win32') {
    return { ok: false, pid: 0, hwnd: '', message: 'Native App-Tabs sind aktuell nur unter Windows verfuegbar.' };
  }
  const powershell = (await findExecutable('powershell.exe')) || (await findExecutable('powershell'));
  if (!powershell) throw new Error('PowerShell wurde nicht gefunden.');
  const script = buildNativeWindowScript(payload);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = await runCapture(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-OutputFormat', 'Text', '-EncodedCommand', encoded], {
    timeoutMs: 25_000,
  });
  const text = cleanPowerShellNativeOutput([result.stdout, result.stderr].filter(Boolean).join('\n'));
  const errorText = cleanPowerShellNativeOutput(result.error);
  const jsonLine = text.split(/\r?\n/).reverse().find((line) => line.trim().startsWith('{'));
  if (!jsonLine) {
    return {
      ok: false,
      pid: Number(payload.pid || 0),
      hwnd: String(payload.hwnd || ''),
      message: text || errorText || 'Native Fensteraktion fehlgeschlagen.',
    };
  }
  try {
    return JSON.parse(jsonLine);
  } catch {
    return {
      ok: false,
      pid: Number(payload.pid || 0),
      hwnd: String(payload.hwnd || ''),
      message: text || 'Native Fensterantwort konnte nicht gelesen werden.',
    };
  }
}

function cleanPowerShellNativeOutput(output) {
  const text = String(output || '').trim();
  if (!text.includes('#< CLIXML')) return text;
  return text
    .replace(/^#< CLIXML\s*/i, '')
    .replace(/_x000D__x000A_/gi, '\n')
    .replace(/<S S="Error">([\s\S]*?)<\/S>/gi, (_match, value) => decodeXmlText(value))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function nativeTabInfo(tabId) {
  return nativeAppTabs.get(String(tabId || '')) || {};
}

async function attachNativeTab(_event, input = {}) {
  const tabId = String(input.tabId || '').trim();
  const targetPath = String(input.path || '').trim();
  if (!tabId) throw new Error('Native Tab-ID fehlt.');
  if (!targetPath) throw new Error('App-Pfad fehlt.');
  if (!fs.existsSync(targetPath)) throw new Error('Die App wurde auf diesem Pfad nicht gefunden.');
  const previous = nativeTabInfo(tabId);
  const payload = {
    action: 'attach',
    path: targetPath,
    parentHwnd: getMainWindowHwnd(),
    pid: previous.pid || 0,
    hwnd: previous.hwnd || '',
    bounds: normalizeNativeBounds(input.bounds, input.dpr),
  };
  const result = await runNativeWindowScript(payload);
  if (result.pid || result.hwnd) {
    nativeAppTabs.set(tabId, { path: targetPath, pid: result.pid || previous.pid || 0, hwnd: result.hwnd || previous.hwnd || '' });
  }
  return result;
}

async function moveNativeTab(_event, input = {}) {
  const tabId = String(input.tabId || '').trim();
  const previous = nativeTabInfo(tabId);
  if (!previous.hwnd) return { ok: false, pid: previous.pid || 0, hwnd: '', message: 'Noch kein eingebettetes Fenster.' };
  const result = await runNativeWindowScript({
    action: 'move',
    pid: previous.pid || 0,
    hwnd: previous.hwnd,
    bounds: normalizeNativeBounds(input.bounds, input.dpr),
  });
  if (result.ok) nativeAppTabs.set(tabId, { ...previous, pid: result.pid || previous.pid || 0, hwnd: result.hwnd || previous.hwnd });
  return result;
}

async function detachNativeTab(_event, tabId) {
  const key = String(tabId || '').trim();
  const previous = nativeTabInfo(key);
  if (!previous.hwnd) return { ok: true, pid: previous.pid || 0, hwnd: '', message: 'Kein Fenster eingebettet.' };
  const result = await runNativeWindowScript({
    action: 'detach',
    pid: previous.pid || 0,
    hwnd: previous.hwnd,
    bounds: normalizeNativeBounds({ x: 120, y: 120, width: 1100, height: 760 }, 1),
  });
  nativeAppTabs.delete(key);
  return result;
}

async function findProviderExecutable(provider) {
  const commands = [provider.command, ...(provider.aliases || [])];
  for (const command of commands) {
    const executable = await findExecutable(command);
    if (executable) return { executable, command };
  }
  return { executable: null, command: provider.command };
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;
    let noOutputId = null;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (noOutputId) clearTimeout(noOutputId);
      resolve(payload);
    };
    const killChild = (child) => {
      if (child.killed) return;
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
          windowsHide: true,
          stdio: 'ignore',
        }).on('error', () => child.kill('SIGTERM'));
        return;
      }
      child.kill('SIGTERM');
    };
    const isCommandScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
    const spawnCommand = isCommandScript ? process.env.ComSpec || 'cmd.exe' : command;
    const scriptCommandLine = isCommandScript
      ? `"${quoteCmdArgument(command)} ${args.map(quoteCmdArgument).join(' ')}"`
      : '';
    const spawnArgs = isCommandScript
      ? ['/d', '/s', '/c', scriptCommandLine]
      : args;
    const baseEnv = {
      ...process.env,
      ...(options.env || {}),
    };
    if (options.interactive) {
      baseEnv.FORCE_COLOR = '1';
      delete baseEnv.NO_COLOR;
    } else {
      baseEnv.FORCE_COLOR = '0';
      baseEnv.NO_COLOR = '1';
    }
    const child = spawn(spawnCommand, spawnArgs, {
      cwd: options.cwd,
      env: baseEnv,
      windowsHide: true,
      shell: false,
      windowsVerbatimArguments: isCommandScript,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const markOutput = () => {
      if (noOutputId) {
        clearTimeout(noOutputId);
        noOutputId = null;
      }
    };
    child.stdout.on('data', (chunk) => {
      markOutput();
      stdout += chunk;
      options.onOutput?.(chunk, 'stdout');
    });
    child.stderr.on('data', (chunk) => {
      markOutput();
      stderr += chunk;
      options.onOutput?.(chunk, 'stderr');
    });
    child.on('error', (error) => finish({ ok: false, stdout, stderr, error: error.message, exitCode: -1 }));
    child.on('close', (exitCode) => {
      finish({
        ok: exitCode === 0,
        stdout,
        stderr,
        error: exitCode === 0 ? '' : stderr.trim() || `Prozess mit Code ${exitCode} beendet.`,
        exitCode: exitCode ?? -1,
      });
    });

    if (options.stdin) child.stdin.write(options.stdin);
    if (!options.interactive) {
      child.stdin.end();
    }
    options.onSpawn?.(child);
    if (options.noOutputMs) {
      noOutputId = setTimeout(() => {
        options.onNoOutput?.();
      }, options.noOutputMs);
      noOutputId.unref?.();
    }
    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        if (!child.killed) {
          stderr += stderr ? '\n' : '';
          stderr += `Prozess nach ${Math.round(options.timeoutMs / 1000)}s ohne Abschluss beendet.`;
          killChild(child);
        }
      }, options.timeoutMs).unref?.();
    }
  });
}

function quoteCmdArgument(value) {
  const text = String(value);
  if (/^[a-zA-Z0-9_./:@=+-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '""').replace(/%/g, '%%')}"`;
}

function quoteShellArgument(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function quoteRemotePath(value) {
  const text = String(value);
  if (text === '~') return '~';
  if (text.startsWith('~/')) {
    const rest = text.slice(2);
    if (!rest) return '~/';
    return `~/${rest.split('/').filter(Boolean).map(quoteShellArgument).join('/')}`;
  }
  return quoteShellArgument(text);
}

function samePath(left, right) {
  const normalize = (value) => path.resolve(String(value || '')).replace(/[\\/]+$/g, '');
  const a = normalize(left);
  const b = normalize(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getAntigravityCliRoot() {
  try {
    return path.join(app.getPath('home'), '.gemini', 'antigravity-cli');
  } catch {
    return '';
  }
}

function findAntigravityConversationId(projectPath) {
  const root = getAntigravityCliRoot();
  if (!root) return '';
  const cache = readJsonFile(path.join(root, 'cache', 'last_conversations.json'));
  if (!cache || typeof cache !== 'object') return '';

  if (typeof cache[projectPath] === 'string') return cache[projectPath];
  const match = Object.entries(cache).find(([cachedPath]) => samePath(cachedPath, projectPath));
  return typeof match?.[1] === 'string' ? match[1] : '';
}

function cleanAntigravityTranscriptContent(content) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findNewestConversationId(startedAtMs) {
  const root = getAntigravityCliRoot();
  const brainDir = root ? path.join(root, 'brain') : '';
  if (!brainDir || !fs.existsSync(brainDir)) return null;
  try {
    const dirs = fs.readdirSync(brainDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^[a-f0-9-]{20,}$/i.test(d.name));
    let bestId = null;
    let bestTime = startedAtMs - 5000;
    for (const d of dirs) {
      const logPath = path.join(brainDir, d.name, '.system_generated', 'logs', 'transcript.jsonl');
      if (fs.existsSync(logPath)) {
        const mtime = fs.statSync(logPath).mtimeMs;
        if (mtime > bestTime) {
          bestTime = mtime;
          bestId = d.name;
        }
      }
    }
    return bestId;
  } catch {
    return null;
  }
}

function startWatchingAntigravity(runId, projectPath, initialConversationId, startedAtMs, event) {
  const root = getAntigravityCliRoot();
  if (!root) return null;

  let conversationId = null;
  let transcriptPath = null;
  let parsedLinesCount = 0;
  let isStopped = false;

  const intervalId = setInterval(async () => {
    if (isStopped) return;

    if (!conversationId) {
      const currentId = findAntigravityConversationId(projectPath);
      if (currentId && currentId !== initialConversationId) {
        conversationId = currentId;
      } else {
        conversationId = findNewestConversationId(startedAtMs);
      }

      if (!conversationId) return;
      transcriptPath = path.join(root, 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl');
    }

    if (!fs.existsSync(transcriptPath)) return;

    try {
      const content = fs.readFileSync(transcriptPath, 'utf8');
      const lines = content.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length > parsedLinesCount) {
        for (let i = parsedLinesCount; i < lines.length; i++) {
          const line = lines[i];
          try {
            const entry = JSON.parse(line);
            let chunk = '';
            const timestamp = entry.created_at ? `[${new Date(entry.created_at).toLocaleTimeString()}]` : '';

            if (entry.source === 'USER_EXPLICIT' && entry.type === 'USER_INPUT') {
              const uContent = cleanAntigravityTranscriptContent(entry.content);
              if (uContent) {
                chunk = `\n${timestamp} USER: ${uContent}\n`;
              }
            } else if (entry.source === 'MODEL') {
              if (entry.content) {
                const cleanContent = cleanAntigravityTranscriptContent(entry.content);
                if (cleanContent) {
                  chunk += `\n${timestamp} ANTIGRAVITY:\n${cleanContent}\n`;
                }
              }
              if (Array.isArray(entry.tool_calls) && entry.tool_calls.length > 0) {
                for (const tool of entry.tool_calls) {
                  const toolName = tool.name || 'unknown';
                  let cleanArgs = '';
                  try {
                    const parsedArgs = typeof tool.args === 'string' ? JSON.parse(tool.args) : tool.args;
                    cleanArgs = JSON.stringify(parsedArgs, null, 2);
                  } catch {
                    cleanArgs = String(tool.args || '');
                  }
                  chunk += `\n${timestamp} ACTION: Call tool "${toolName}" with arguments:\n${cleanArgs}\n`;
                }
              }
            } else if (entry.source === 'SYSTEM') {
              if (entry.type === 'TOOL_RESPONSE') {
                const tContent = cleanAntigravityTranscriptContent(entry.content);
                if (tContent) {
                  chunk = `\n${timestamp} TOOL RESPONSE:\n${tContent}\n`;
                }
              }
            }

            if (chunk) {
              event.sender.send('agent:output', {
                runId,
                chunk,
                stream: 'stdout',
              });
            }
          } catch {
            // Ignore parse errors on incomplete lines
          }
        }
        parsedLinesCount = lines.length;
      }
    } catch {
      // Ignore read errors
    }
  }, 300);

  return {
    stop: () => {
      isStopped = true;
      clearInterval(intervalId);
    },
  };
}

function isAntigravityProgressOnlyText(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return true;
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > 3 || normalized.length > 500) return false;
  return lines.every((line) =>
    /^(?:starte(?:\s+jetzt)?|ich\s+(?:starte|muss|werde|verwende|nutze|pruefe|prüfe|schaue|analysiere|lese|ersetze)|jetzt\s+(?:muss|werde)|now\s+(?:i|we)\s+(?:need|will)|i\s+(?:need|will|am going)\b|let'?s\s+)/i.test(line),
  );
}

function scoreAntigravityTranscriptText(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return -1000;
  let score = Math.min(200, normalized.length / 20);
  if (isAntigravityProgressOnlyText(normalized)) score -= 500;
  if (/(?:fertig|erledigt|completed|done|implemented|fixed|gefixt|geändert|geaendert|erstellt|created|updated)/i.test(normalized)) score += 80;
  if (/(?:tests?|build|lint|typecheck|geprueft|geprüft|passed|failed)/i.test(normalized)) score += 40;
  if (/(?:datei|file|geändert|geaendert|diff|patch|commit)/i.test(normalized)) score += 30;
  return score;
}

function readAntigravityTranscriptOutput(projectPath, startedAtMs) {
  const root = getAntigravityCliRoot();
  const conversationId = findAntigravityConversationId(projectPath);
  if (!root || !conversationId || !/^[a-f0-9-]{20,}$/i.test(conversationId)) return '';

  const logDir = path.join(root, 'brain', conversationId, '.system_generated', 'logs');
  const files = ['transcript.jsonl', 'transcript_full.jsonl']
    .map((name) => path.join(logDir, name))
    .filter((filePath) => {
      try {
        return fs.statSync(filePath).mtimeMs >= startedAtMs - 5000;
      } catch {
        return false;
      }
    });

  const responses = [];
  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry?.source !== 'MODEL' || entry?.status !== 'DONE' || typeof entry.content !== 'string') continue;
      const createdAtMs = Date.parse(entry.created_at || '');
      if (Number.isFinite(createdAtMs) && createdAtMs < startedAtMs - 5000) continue;
      const type = String(entry.type || '');
      if (!/RESPONSE$/i.test(type)) continue;
      const text = cleanAntigravityTranscriptContent(entry.content);
      if (text) responses.push({ type, text });
    }
  }

  const usable = responses
    .filter((item) => !isAntigravityProgressOnlyText(item.text))
    .sort((left, right) => scoreAntigravityTranscriptText(right.text) - scoreAntigravityTranscriptText(left.text));
  return (usable[0] || responses.at(-1))?.text || '';
}

function readAntigravityImportedChats() {
  const root = getAntigravityCliRoot();
  const brainDir = root ? path.join(root, 'brain') : '';
  if (!brainDir || !fs.existsSync(brainDir)) return [];

  const conversations = [];
  const entries = fs.readdirSync(brainDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{20,}$/i.test(entry.name)) continue;
    const logDir = path.join(brainDir, entry.name, '.system_generated', 'logs');
    const transcriptPath = ['transcript_full.jsonl', 'transcript.jsonl']
      .map((name) => path.join(logDir, name))
      .find((filePath) => fs.existsSync(filePath));
    if (!transcriptPath) continue;

    const messages = [];
    let updatedAt = 0;
    for (const line of fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      let item;
      try {
        item = JSON.parse(line);
      } catch {
        continue;
      }
      const source = String(item?.source || '').toUpperCase();
      const sender = source === 'USER' ? 'user' : source === 'MODEL' ? 'ai' : '';
      if (!sender || typeof item?.content !== 'string') continue;
      if (item.status && !/DONE|SUCCESS|COMPLETE/i.test(String(item.status))) continue;
      const text = cleanAntigravityTranscriptContent(item.content);
      if (!text) continue;
      const timestamp = Date.parse(item.created_at || '') || Date.now();
      updatedAt = Math.max(updatedAt, timestamp);
      const previous = messages.at(-1);
      if (previous?.sender === sender && previous.text === text) continue;
      messages.push({ text, sender, timestamp });
    }
    if (messages.length === 0) continue;
    const firstUser = messages.find((message) => message.sender === 'user')?.text || 'Antigravity Chat';
    conversations.push({
      conversationId: entry.name,
      title: firstUser.length > 42 ? `${firstUser.slice(0, 42)}...` : firstUser,
      updatedAt: updatedAt || fs.statSync(transcriptPath).mtimeMs,
      messages: messages.slice(-200),
    });
  }

  return conversations
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 80);
}

function normalizeExternalServerConfig(input = {}) {
  const host = String(input.host || '').trim();
  const user = String(input.user || '').trim();
  const port = Number(input.port || 22);
  const remoteProjectPath = String(input.remoteProjectPath || '').trim();
  const identityFile = String(input.identityFile || '').trim();
  const acceptNewHostKey = input.acceptNewHostKey !== false;

  if (!host || !/^[a-z0-9._:-]+$/i.test(host) || host.startsWith('-')) {
    throw new Error('Externer Server: Host ist ungueltig.');
  }
  if (user && (!/^[a-z0-9._~-]+$/i.test(user) || user.startsWith('-'))) {
    throw new Error('Externer Server: SSH-Benutzer ist ungueltig.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Externer Server: SSH-Port ist ungueltig.');
  }
  if (!remoteProjectPath || !/^(\/|~\/)/.test(remoteProjectPath)) {
    throw new Error('Externer Server: Remote-Projektpfad muss mit / oder ~/ beginnen.');
  }
  if (identityFile && !fs.existsSync(identityFile)) {
    throw new Error('Externer Server: SSH-Key-Datei wurde nicht gefunden.');
  }

  return { enabled: Boolean(input.enabled), host, user, port, remoteProjectPath, identityFile, acceptNewHostKey };
}

async function buildSshInvocation(externalServer, remoteCommand, options = {}) {
  const ssh = await findExecutable('ssh');
  if (!ssh) throw new Error('OpenSSH wurde nicht gefunden. Installiere den Windows-OpenSSH-Client oder fuege ssh zum PATH hinzu.');

  const server = normalizeExternalServerConfig(externalServer);
  const args = [
    '-p',
    String(server.port),
    '-o',
    `ConnectTimeout=${options.connectTimeoutSeconds || 15}`,
    '-o',
    'ServerAliveInterval=15',
  ];
  if (options.batchMode) args.push('-o', 'BatchMode=yes');
  if (server.acceptNewHostKey) args.push('-o', 'StrictHostKeyChecking=accept-new');
  if (server.identityFile) args.push('-i', server.identityFile);
  args.push(`${server.user ? `${server.user}@` : ''}${server.host}`, `bash -lc ${quoteShellArgument(remoteCommand)}`);
  return { command: ssh, args, server };
}

function buildRemoteProviderCommand(provider, providerEnv, cliArgs) {
  const envAssignments = Object.entries(providerEnv || {})
    .filter(([, value]) => typeof value === 'string' && value)
    .map(([key, value]) => `${key}=${quoteShellArgument(value)}`)
    .join(' ');
  const commandLine = [quoteShellArgument(provider.command), ...cliArgs.map(quoteShellArgument)].join(' ');
  return [envAssignments, commandLine].filter(Boolean).join(' ');
}

async function runRemoteProviderCommand(provider, externalServer, providerEnv, cliArgs, options = {}) {
  const server = normalizeExternalServerConfig(externalServer);
  const remoteCommand = [
    `cd -- ${quoteRemotePath(server.remoteProjectPath)}`,
    buildRemoteProviderCommand(provider, providerEnv, cliArgs),
  ].join(' && ');
  const ssh = await buildSshInvocation(server, remoteCommand, { batchMode: options.batchMode });
  return runCapture(ssh.command, ssh.args, {
    stdin: options.stdin,
    interactive: options.interactive,
    timeoutMs: options.timeoutMs,
    noOutputMs: options.noOutputMs,
    onSpawn: options.onSpawn,
    onNoOutput: options.onNoOutput,
    onOutput: options.onOutput,
  });
}

function safeProjectFolderName(value) {
  const name = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '');
  return name || 'Neues Projekt';
}

function scratchProjectFolder() {
  const target = path.join(app.getPath('documents'), 'CodeForge', 'Ohne Projekt');
  fs.mkdirSync(target, { recursive: true });
  return target;
}

async function createProjectFolder(_event, rawName) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Speicherort fuer neues Projekt auswaehlen',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const folderName = safeProjectFolderName(rawName);
  const target = path.join(result.filePaths[0], folderName);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

async function ensureDiscordPresence() {
  if (discordReady) return true;
  if (!discordClient) {
    discordClient = new DiscordRPC.Client({ transport: 'ipc' });
    discordClient.on('ready', () => {
      discordReady = true;
      updateDiscordPresence(null, {});
    });
    discordClient.on('disconnected', () => {
      discordReady = false;
      discordClient = null;
    });
  }
  try {
    await discordClient.login({ clientId: DISCORD_CLIENT_ID });
    return true;
  } catch {
    discordReady = false;
    discordClient = null;
    return false;
  }
}

async function updateDiscordPresence(_event, input = {}) {
  const connected = await ensureDiscordPresence();
  if (!connected || !discordClient) return false;
  const projectName = String(input.projectName || '').trim();
  const provider = String(input.provider || '').trim();
  const model = String(input.model || '').trim();
  const activity = {
    details: String(input.details || (input.isRunning ? 'Agent arbeitet' : 'Bereit')).slice(0, 128),
    state: String(
      input.state ||
        [
          projectName ? `Projekt: ${projectName}` : 'Ohne Projekt',
          provider ? providerLabelForDiscord(provider) : '',
          model,
        ]
          .filter(Boolean)
          .join(' - '),
    ).slice(0, 128),
    startTimestamp: discordStartedAt,
    largeImageKey: 'codeforge',
    largeImageText: 'CodeForge',
    smallImageText: input.isRunning ? 'Agent laeuft' : 'Bereit',
    instance: false,
  };
  try {
    await discordClient.setActivity(activity);
    return true;
  } catch {
    discordReady = false;
    return false;
  }
}

function providerLabelForDiscord(provider) {
  if (provider === 'openai') return 'Codex';
  if (provider === 'anthropic') return 'Claude';
  if (provider === 'antigravity') return 'Antigravity';
  if (provider === 'cursor') return 'Cursor';
  if (provider === 'opencode') return 'OpenCode';
  if (provider === 'freebuff') return 'FreeBuff';
  return provider;
}

function accessToCodexSandbox(access) {
  if (access === 'read-only') return 'read-only';
  if (access === 'full') return 'danger-full-access';
  return 'workspace-write';
}

function accessToClaudeMode(access) {
  if (access === 'read-only') return 'plan';
  if (access === 'full') return 'bypassPermissions';
  return 'auto';
}

function normalizeReasoningEffort(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium';
}

function buildAgentCommand(providerId, model, prompt, access, projectPath, reasoningEffort = 'medium', options = {}) {
  const args = [];
  let stdin = '';

  if (options.originalPluginEnabled) {
    // Original plugin: run the CLI bare / interactive, no permission bypass, no auto-prompt.
    // The user types everything themselves via stdin (password, prompt, y/n).
    if (providerId === 'antigravity') {
      args.push('--model', model);
      // No -p, no --dangerously-skip-permissions → agy starts in interactive mode
    } else if (providerId === 'openai') {
      args.push(
        'exec',
        '-',
        ...(options.ignoreUserConfig ? ['--ignore-user-config'] : []),
        '--model',
        model,
        '--cd',
        projectPath,
        '--skip-git-repo-check',
        '--config',
        `model_reasoning_effort="${normalizeReasoningEffort(reasoningEffort)}"`,
      );
      const codexSandboxUnavailable = process.platform === 'win32' && !options.remote;
      if (access === 'full' || codexSandboxUnavailable) {
        args.push('--sandbox', 'danger-full-access');
      } else {
        args.push('--sandbox', accessToCodexSandbox(access));
      }
      // stdin stays empty – user types prompt themselves
    } else if (providerId === 'anthropic') {
      args.push(
        '-p',
        '--model',
        model,
        '--output-format',
        'text',
        '--permission-mode',
        accessToClaudeMode(access),
      );
      // No --dangerously-skip-permissions, stdin stays empty
    } else if (providerId === 'cursor') {
      args.push('--output-format', 'text');
      if (model && model !== 'default') args.push('--model', model);
    } else if (providerId === 'opencode') {
      args.push('run', '--dir', projectPath);
      if (model && model !== 'default') args.push('--model', model);
    } else if (providerId === 'freebuff') {
      // FreeBuff: runs non-interactively with -p, even in original-plugin mode
      args.push('-p', prompt);
      if (model && model !== 'default') args.push('--model', model);
    }
    return { args, stdin };
  }

  // Normal mode (no Original plugin)
  if (providerId === 'antigravity') {
    args.push('-p', prompt, '--model', model);
    args.push('--dangerously-skip-permissions');
  } else if (providerId === 'openai') {
    args.push(
      'exec',
      '-',
      ...(options.ignoreUserConfig ? ['--ignore-user-config'] : []),
      '--model',
      model,
      '--cd',
      projectPath,
      '--color',
      'never',
      '--skip-git-repo-check',
      '--config',
      `model_reasoning_effort="${normalizeReasoningEffort(reasoningEffort)}"`,
    );
    const codexSandboxUnavailable = process.platform === 'win32' && !options.remote;
    if (access === 'full' || codexSandboxUnavailable) {
      args.push('--sandbox', 'danger-full-access', '--dangerously-bypass-approvals-and-sandbox');
    } else {
      args.push('--sandbox', accessToCodexSandbox(access));
    }
    stdin = prompt;
  } else if (providerId === 'anthropic') {
    args.push(
      '-p',
      '--model',
      model,
      '--output-format',
      'text',
      '--permission-mode',
      accessToClaudeMode(access),
    );
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

function openInstallTerminal(provider) {
  if (process.platform === 'win32') {
    spawn('powershell.exe', ['-NoExit', '-ExecutionPolicy', 'ByPass', '-Command', provider.installCommand], {
      windowsHide: false,
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }

  const shellCommand = process.platform === 'darwin' ? 'zsh' : 'bash';
  spawn(shellCommand, ['-lc', `${provider.installCommand}; exec ${shellCommand}`], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

function quotePowerShellSingle(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function createWorkspaceTerminalScript(slot, index, projectPath) {
  const provider = PROVIDERS[slot.provider];
  if (!provider) throw new Error('Unbekannter Anbieter im Workspace.');
  const found = await findProviderExecutable(provider);
  const executable = found.executable || '';
  if (!executable) {
    throw new Error(`${provider.label} wurde nicht gefunden. Installiere die CLI und starte CodeForge neu.`);
  }
  if (slot.provider === 'antigravity' && /\.(cmd|bat)$/i.test(executable)) {
    throw new Error('Fuer Antigravity wird unter Windows die native agy-Installation benoetigt, kein unsicherer .cmd-Wrapper.');
  }
  const safeProjectPath = fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory()
    ? projectPath
    : app.getPath('home');
  const scriptDir = path.join(app.getPath('temp'), 'codeforge-workspace-terminals');
  fs.mkdirSync(scriptDir, { recursive: true });
  const scriptPath = path.join(scriptDir, `workspace-${Date.now()}-${index + 1}.ps1`);
  const content = [
    '$ErrorActionPreference = "Continue"',
    `[Console]::Title = ${quotePowerShellSingle(slot.title || provider.label)}`,
    `Set-Location -LiteralPath ${quotePowerShellSingle(safeProjectPath)}`,
    `& ${quotePowerShellSingle(executable)}`,
  ].filter(Boolean).join('\n');
  fs.writeFileSync(scriptPath, content, 'utf8');
  return scriptPath;
}

async function launchWorkspaceTerminals(_event, request = {}) {
  if (process.platform !== 'win32') {
    throw new Error('Workspace-Panes werden aktuell nur mit Windows Terminal unter Windows gestartet.');
  }
  const projectPath = request.projectPath || app.getPath('home');
  const slots = Array.isArray(request.terminals) ? request.terminals.slice(0, 8) : [];
  if (slots.length === 0) throw new Error('Keine Workspace-Terminals ausgewaehlt.');
  const wt = (await findExecutable('wt.exe')) || (await findExecutable('wt'));
  if (!wt) throw new Error('Windows Terminal (wt.exe) wurde nicht gefunden.');
  const powershell = (await findExecutable('powershell.exe')) || (await findExecutable('powershell'));
  if (!powershell) throw new Error('PowerShell wurde nicht gefunden.');
  const scripts = [];
  for (let index = 0; index < slots.length; index += 1) {
    scripts.push(await createWorkspaceTerminalScript(slots[index], index, projectPath));
  }
  const args = [];
  scripts.forEach((scriptPath, index) => {
    const slot = slots[index];
    if (index === 0) {
      args.push('new-tab');
    } else {
      args.push(';', 'split-pane', index % 2 === 0 ? '-V' : '-H');
    }
    args.push(
      '--title',
      slot.title || `Workspace ${index + 1}`,
      '-d',
      projectPath,
      powershell,
      '-NoExit',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
    );
  });
  spawn(wt, args, {
    windowsHide: false,
    detached: true,
    stdio: 'ignore',
  }).unref();
  return { ok: true, count: scripts.length };
}

function buildPrompt(prompt, attachments, access, projectPath) {
  const accessInstruction =
    access === 'read-only'
      ? 'WICHTIG: Arbeite ausschliesslich lesend. Veraendere keine Dateien und fuehre keine destruktiven Befehle aus.'
      : access === 'workspace-write'
        ? `WICHTIG: Veraendere nur Dateien innerhalb dieses Projektordners: ${projectPath}`
        : 'Du darfst die fuer die Aufgabe erforderlichen lokalen Werkzeuge verwenden.';
  const attachmentInstruction = attachments?.length
    ? `\n\nLokale Anhaenge, die du bei Bedarf lesen sollst:\n${attachments.map((file) => `- ${file}`).join('\n')}`
    : '';
  return `${accessInstruction}\n\n${prompt}${attachmentInstruction}`;
}

function buildProviderEnv(provider, apiKeys = {}) {
  const key = typeof apiKeys[provider] === 'string' ? apiKeys[provider].trim() : '';
  const env = {
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
  };
  if (key) {
    if (provider === 'openai') {
      env.OPENAI_API_KEY = key;
    } else if (provider === 'anthropic') {
      env.ANTHROPIC_API_KEY = key;
    } else if (provider === 'opencode') {
      env.OPENAI_API_KEY = key;
      env.OPENCODE_API_KEY = key;
    } else if (provider === 'cursor') {
      env.CURSOR_API_KEY = key;
    } else {
      env.GOOGLE_API_KEY = key;
      env.GEMINI_API_KEY = key;
      env.ANTIGRAVITY_API_KEY = key;
    }
  }
  return env;
}

function isCodexWindowsSandboxSetupError(result) {
  const text = [result?.stdout, result?.stderr, result?.error].filter(Boolean).join('\n');
  return /windows sandbox:\s*spawn setup refresh/i.test(text);
}

function readProjectPackage(projectPath) {
  const packagePath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packagePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    return null;
  }
}

function codexPersonalPluginRoot() {
  return path.join(app.getPath('home'), '.codex', 'plugins', 'cache', 'personal');
}

function projectCodexPluginRoot(projectPath) {
  return path.join(projectPath, '.codex', 'plugins');
}

function safePluginSegment(value, fallback) {
  const text = String(value || fallback || 'plugin').trim().toLowerCase();
  return text.replace(/[^a-z0-9._~-]+/g, '-').replace(/^-+|-+$/g, '') || fallback || 'plugin';
}

function readCodexPluginManifest(pluginPath) {
  const manifestPath = path.join(pluginPath, '.codex-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const name = String(manifest.name || path.basename(pluginPath));
    const displayName = String(manifest.interface?.displayName || manifest.displayName || name);
    const description = String(
      manifest.interface?.shortDescription ||
        manifest.description ||
        manifest.interface?.longDescription ||
        '',
    );
    return {
      id: '',
      name,
      displayName,
      version: String(manifest.version || '0.0.0'),
      description,
      category: typeof manifest.interface?.category === 'string' ? manifest.interface.category : undefined,
      capabilities: Array.isArray(manifest.interface?.capabilities)
        ? manifest.interface.capabilities.map(String)
        : [],
      path: pluginPath,
      manifestPath,
      source: 'unknown',
      removable: false,
    };
  } catch {
    return null;
  }
}

function sourceForPluginPath(pluginPath, projectPath) {
  const normalized = pluginPath.replace(/\\/g, '/');
  if (projectPath && normalized.startsWith(projectCodexPluginRoot(projectPath).replace(/\\/g, '/'))) return 'project';
  if (normalized.includes('/cache/personal/')) return 'personal';
  if (normalized.includes('/cache/openai-bundled/')) return 'bundled';
  if (normalized.includes('/cache/openai-curated-remote/')) return 'remote';
  if (normalized.includes('/cache/openai-curated/')) return 'curated';
  if (normalized.includes('/cache/openai-primary-runtime/')) return 'runtime';
  return 'unknown';
}

function pluginDirectoriesUnder(root, maxDepth = 4) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  const walk = (dir, depth) => {
    const manifestPath = path.join(dir, '.codex-plugin', 'plugin.json');
    if (fs.existsSync(manifestPath)) {
      found.push(dir);
      return;
    }
    if (depth >= maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

function getCodexPlugins(projectPath) {
  const roots = [
    path.join(app.getPath('home'), '.codex', 'plugins', 'cache'),
    projectPath ? projectCodexPluginRoot(projectPath) : '',
  ].filter(Boolean);
  const seen = new Set();
  return roots
    .flatMap((root) => pluginDirectoriesUnder(root))
    .map((pluginPath) => {
      const manifest = readCodexPluginManifest(pluginPath);
      if (!manifest) return null;
      const source = sourceForPluginPath(pluginPath, projectPath);
      const id = `${source}:${manifest.name}:${manifest.version}:${pluginPath}`;
      return {
        ...manifest,
        id,
        source,
        removable: source === 'personal' || source === 'project',
      };
    })
    .filter(Boolean)
    .filter((plugin) => {
      const key = `${plugin.source}:${plugin.name}:${plugin.version}:${plugin.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const sourceRank = { personal: 0, project: 1, bundled: 2, curated: 3, remote: 4, runtime: 5, unknown: 6 };
      return (sourceRank[a.source] ?? 9) - (sourceRank[b.source] ?? 9) || a.displayName.localeCompare(b.displayName);
    });
}

function assertDirectoryInside(targetPath, allowedRoot) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(allowedRoot);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Plugin-Pfad liegt ausserhalb des erlaubten Zielordners.');
  }
  return resolvedTarget;
}

function installCodexPluginFromFolder(_event, input = {}) {
  const sourcePath = String(input.sourcePath || '').trim();
  const target = input.target === 'project' ? 'project' : 'personal';
  const projectPath = String(input.projectPath || '').trim();
  if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    throw new Error('Waehle einen gueltigen Plugin-Ordner.');
  }
  const manifest = readCodexPluginManifest(sourcePath);
  if (!manifest) throw new Error('Dieser Ordner enthaelt keine .codex-plugin/plugin.json.');
  if (target === 'project' && (!projectPath || !fs.existsSync(projectPath))) {
    throw new Error('Waehle zuerst einen Projektordner.');
  }

  const root = target === 'project' ? projectCodexPluginRoot(projectPath) : codexPersonalPluginRoot();
  const destination = assertDirectoryInside(
    target === 'project'
      ? path.join(root, safePluginSegment(manifest.name, 'plugin'))
      : path.join(root, safePluginSegment(manifest.name, 'plugin'), safePluginSegment(manifest.version, '0.0.0')),
    root,
  );
  fs.mkdirSync(root, { recursive: true });
  if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(sourcePath, destination, {
    recursive: true,
    filter: (source) => {
      const base = path.basename(source);
      return base !== 'node_modules' && base !== '.git' && base !== 'dist';
    },
  });
  return readCodexPluginManifest(destination);
}

function removeCodexPlugin(_event, pluginPath, projectPath = '') {
  const resolved = path.resolve(String(pluginPath || ''));
  const allowedRoots = [codexPersonalPluginRoot()];
  if (projectPath) allowedRoots.push(projectCodexPluginRoot(projectPath));
  const allowed = allowedRoots.some((root) => {
    const relative = path.relative(path.resolve(root), resolved);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  });
  if (!allowed) throw new Error('Dieses Plugin kann in CodeForge nicht entfernt werden.');
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
  return true;
}

function packageManagerFor(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function pickProjectTestCommand(projectPath) {
  const packageJson = readProjectPackage(projectPath);
  const scripts = packageJson?.scripts || {};
  const hasRealTest =
    typeof scripts.test === 'string' &&
    scripts.test.trim() &&
    !/no test specified|exit 1/i.test(scripts.test);
  const manager = packageManagerFor(projectPath);

  if (hasRealTest) return { command: manager, args: ['run', 'test'], label: `${manager} run test` };
  if (typeof scripts.lint === 'string' && scripts.lint.trim()) {
    return { command: manager, args: ['run', 'lint'], label: `${manager} run lint` };
  }
  if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
    return { command: 'npx', args: ['tsc', '--noEmit'], label: 'npx tsc --noEmit' };
  }
  return null;
}

function withSystemPrompt(systemPrompt, prompt) {
  const trimmed = typeof systemPrompt === 'string' ? systemPrompt.trim() : '';
  if (!trimmed) return prompt;
  return `System-Prompt:\n${trimmed}\n\nNutzerauftrag:\n${prompt}`;
}

function showTaskNotification(input = {}) {
  if (!Notification.isSupported()) return false;
  const title = String(input.title || 'CodeForge').slice(0, 80);
  const body = String(input.body || 'Aufgabe ist erledigt.').slice(0, 240);
  const notification = new Notification({
    title,
    body,
    icon: getAssetPath('codeforge.png'),
  });
  notification.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  notification.show();
  return true;
}

function parseUsageInfo(providerId, commandText, output) {
  const text = String(output || '').replace(/\r\n/g, '\n');
  const numberPattern = '([0-9][0-9.,]*)';
  const readNumber = (value) => {
    if (!value) return undefined;
    const normalized = value.trim();
    if (/,\d{1,2}$/.test(normalized)) return Math.round(Number(normalized.replace(/\./g, '').replace(',', '.')));
    return Number(normalized.replace(/[.,]/g, '')) || undefined;
  };
  const limit =
    readNumber(text.match(new RegExp(`(?:token\\s*)?(?:limit|quota|cap|allowance)\\D{0,40}${numberPattern}`, 'i'))?.[1]) ||
    readNumber(text.match(new RegExp(`${numberPattern}\\s*(?:tokens?)?\\s*(?:limit|quota|cap)`, 'i'))?.[1]);
  const used =
    readNumber(text.match(new RegExp(`(?:used|verbrauch|spent|consumed)\\D{0,40}${numberPattern}`, 'i'))?.[1]) ||
    readNumber(text.match(new RegExp(`(?:tokens used|input tokens|output tokens)\\D{0,40}${numberPattern}`, 'i'))?.[1]);
  const remaining =
    readNumber(text.match(new RegExp(`(?:remaining|left|verbleibend|uebrig)\\D{0,40}${numberPattern}`, 'i'))?.[1]) ||
    (limit && used ? Math.max(0, limit - used) : undefined);
  const resetsAt =
    text.match(/(?:reset|resets|erneuert|window)\D{0,24}([0-9]{4}-[0-9]{2}-[0-9]{2}[^\n]*)/i)?.[1]?.trim() ||
    text.match(/(?:reset|resets|erneuert|window)\D{0,24}([A-Z][a-z]{2,9}\s+\d{1,2}[^\n]*)/i)?.[1]?.trim();
  const quotaGroups = parseAntigravityQuotaGroups(providerId, text);

  return {
    provider: providerId,
    available: Boolean(limit || used || remaining || quotaGroups.length),
    label: quotaGroups.length
      ? `${quotaGroups.length} Antigravity-Limitgruppen erkannt`
      : limit || used || remaining ? 'Provider-Limit erkannt' : 'Keine maschinenlesbaren Limitdaten gefunden',
    usedTokens: used,
    limitTokens: limit,
    remainingTokens: remaining,
    resetsAt,
    quotaGroups,
    sourceCommand: commandText,
    raw: text.slice(0, 4000),
    checkedAt: Date.now(),
  };
}

function parseAntigravityQuotaGroups(providerId, text) {
  if (providerId !== 'antigravity' || !/Models\s*&\s*Quota|GEMINI MODELS|CLAUDE AND GPT MODELS/i.test(text)) {
    return [];
  }

  const lines = text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .split('\n')
    .map((line) => line.replace(/[│└]/g, '').trim())
    .filter(Boolean);
  const groups = [];
  let current = null;
  let pendingLimit = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Z][A-Z0-9 &-]+MODELS$/.test(line)) {
      current = { name: toTitleCase(line), models: [], limits: [] };
      groups.push(current);
      pendingLimit = null;
      continue;
    }
    if (!current) continue;

    const models = line.match(/^Models within this group:\s*(.+)$/i)?.[1];
    if (models) {
      current.models = models.split(/\s*,\s*/).filter(Boolean);
      continue;
    }

    const limitName = line.match(/^(Weekly|Five Hour|5 Hour|Daily|Monthly)\s+Limit$/i)?.[0];
    if (limitName) {
      pendingLimit = { name: limitName.replace(/^5 Hour/i, 'Five Hour') };
      current.limits.push(pendingLimit);
      continue;
    }

    if (!pendingLimit) continue;
    const percent = line.match(/([0-9]+(?:[.,][0-9]+)?)%/)?.[1];
    if (percent && pendingLimit.percent === undefined) {
      pendingLimit.percent = Number(percent.replace(',', '.'));
      continue;
    }
    const remaining = line.match(/([0-9]+(?:[.,][0-9]+)?)%\s+remaining/i)?.[1];
    if (remaining) pendingLimit.remainingPercent = Number(remaining.replace(',', '.'));
    if (/quota available/i.test(line)) pendingLimit.status = 'Quota available';
    const refreshesIn = line.match(/Refreshes in\s+(.+)$/i)?.[1]?.trim();
    if (refreshesIn) pendingLimit.refreshesIn = refreshesIn;
  }

  return groups.filter((group) => group.limits.length > 0);
}

function toTitleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function getProviderUsage(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error('Unbekannter Anbieter.');
  const { executable, command } = await findProviderExecutable(provider);
  if (!executable) {
    return {
      provider: providerId,
      available: false,
      label: `${provider.label} ist nicht installiert.`,
      error: 'CLI fehlt.',
      checkedAt: Date.now(),
    };
  }

  for (const probe of USAGE_PROBES[providerId] || []) {
    let lastParsed = null;
    const probeCommand = Array.isArray(probe) ? command : probe.command || command;
    const args = Array.isArray(probe) ? probe : probe.args;
    const probeExecutable = probeCommand === command ? executable : await findExecutable(probeCommand);
    if (!probeExecutable) continue;
    const result = await runCapture(probeExecutable, args, {
      stdin: Array.isArray(probe) ? undefined : probe.stdin,
      timeoutMs: providerId === 'antigravity' ? 30_000 : 12_000,
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    if (!output) continue;
    const parsed = parseUsageInfo(providerId, probe.label || `${probeCommand} ${args.join(' ')}`.trim(), output);
    lastParsed = {
      ...parsed,
      raw: output,
      error: result.ok ? parsed.error : result.error || parsed.error,
    };
    if (parsed.available) return lastParsed;
    if (providerId === 'antigravity') return lastParsed;
  }

  return {
    provider: providerId,
    available: false,
    label: 'Diese CLI liefert aktuell keine abrufbaren Limitdaten.',
    checkedAt: Date.now(),
  };
}

async function getAntigravityTerminalUsage() {
  const provider = PROVIDERS.antigravity;
  const { executable } = await findProviderExecutable(provider);
  if (!executable) {
    return {
      provider: 'antigravity',
      available: false,
      label: 'Antigravity CLI ist nicht installiert.',
      error: 'CLI fehlt.',
      checkedAt: Date.now(),
    };
  }
  const result = await runCapture(executable, [], {
    stdin: '/usage\n\u001b',
    timeoutMs: 30_000,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (!output) {
    return {
      provider: 'antigravity',
      available: false,
      label: 'Antigravity hat keine Terminalausgabe geliefert.',
      error: result.error || 'Keine Ausgabe.',
      sourceCommand: 'agy /usage',
      raw: '',
      checkedAt: Date.now(),
    };
  }
  const parsed = parseUsageInfo('antigravity', 'agy /usage', output);
  return {
    ...parsed,
    raw: output,
    error: result.ok ? parsed.error : result.error || parsed.error,
  };
}

function splitTomlPath(rawPath) {
  const parts = [];
  let current = '';
  let quote = '';
  for (let index = 0; index < rawPath.length; index += 1) {
    const char = rawPath[index];
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '.') {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

function stripTomlComment(line) {
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#') return line.slice(0, index).trim();
  }
  return line.trim();
}

function parseTomlValue(rawValue) {
  const value = stripTomlComment(rawValue);
  if (value.startsWith('[') && value.endsWith(']')) {
    const matches = [...value.matchAll(/"([^"]*)"|'([^']*)'|([^,\[\]\s][^,\[\]]*)/g)];
    return matches
      .map((match) => (match[1] ?? match[2] ?? match[3] ?? '').trim())
      .filter(Boolean);
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function inferMcpTransport(server) {
  const args = Array.isArray(server.args) ? server.args.map(String) : [];
  const transportArg = args.find((item) => /^(stdio|http|sse)$/i.test(item));
  if (transportArg) return transportArg.toLowerCase();
  if (typeof server.url === 'string' && /^https?:\/\//i.test(server.url)) {
    return server.url.includes('/sse') ? 'sse' : 'http';
  }
  if (typeof server.command === 'string' && server.command.trim()) return 'stdio';
  return 'unknown';
}

function parseCodexMcpServers(sourcePath) {
  if (!fs.existsSync(sourcePath)) return [];
  const servers = new Map();
  let currentName = '';
  const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine);
    if (!line) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const parts = splitTomlPath(sectionMatch[1]);
      currentName = parts[0] === 'mcp_servers' && parts.length === 2 ? parts[1] : '';
      if (currentName && !servers.has(currentName)) {
        servers.set(currentName, {
          id: `codex:${currentName}`,
          name: currentName,
          source: 'Codex',
          sourcePath,
          transport: 'unknown',
          status: 'unknown',
        });
      }
      continue;
    }

    if (!currentName) continue;
    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!keyMatch) continue;
    const [, key, rawValue] = keyMatch;
    const server = servers.get(currentName);
    const parsedValue = parseTomlValue(rawValue);
    if (key === 'command' && typeof parsedValue === 'string') server.command = parsedValue;
    if (key === 'args' && Array.isArray(parsedValue)) server.args = parsedValue;
    if (key === 'url' && typeof parsedValue === 'string') server.url = parsedValue;
  }

  return [...servers.values()].map((server) => ({
    ...server,
    transport: inferMcpTransport(server),
    status: server.command || server.url ? 'configured' : 'unknown',
    details: server.command || server.url || 'Keine Startdetails in der Konfiguration gefunden.',
  }));
}

function parseJsonMcpServers(sourcePath, sourceLabel) {
  if (!fs.existsSync(sourcePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const entries = parsed.mcpServers || parsed.servers || {};
    return Object.entries(entries).map(([name, value]) => {
      const server = value && typeof value === 'object' ? value : {};
      const info = {
        id: `${sourceLabel}:${name}`,
        name,
        source: sourceLabel,
        sourcePath,
        command: typeof server.command === 'string' ? server.command : undefined,
        args: Array.isArray(server.args) ? server.args.map(String) : undefined,
        url: typeof server.url === 'string' ? server.url : undefined,
        transport: 'unknown',
        status: 'unknown',
      };
      info.transport = inferMcpTransport(info);
      info.status = info.command || info.url ? 'configured' : 'unknown';
      info.details = info.command || info.url || 'Keine Startdetails in der Konfiguration gefunden.';
      return info;
    });
  } catch {
    return [];
  }
}

function getMcpServers() {
  const home = app.getPath('home');
  const appData = app.getPath('appData');
  const candidates = [
    {
      kind: 'toml',
      source: 'Codex',
      path: path.join(home, '.codex', 'config.toml'),
    },
    {
      kind: 'json',
      source: 'Claude Desktop',
      path: path.join(appData, 'Claude', 'claude_desktop_config.json'),
    },
    {
      kind: 'json',
      source: 'Cursor',
      path: path.join(home, '.cursor', 'mcp.json'),
    },
  ];
  const servers = candidates.flatMap((candidate) =>
    candidate.kind === 'toml'
      ? parseCodexMcpServers(candidate.path)
      : parseJsonMcpServers(candidate.path, candidate.source),
  );

  const seen = new Set();
  return servers
    .filter((server) => {
      const key = `${server.source}:${server.name}:${server.command || server.url || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((server) => {
      if (!server.command) return server;
      const commandPath = server.command.replace(/^"|"$/g, '');
      const looksLikePath = /[\\/]/.test(commandPath);
      if (looksLikePath && !fs.existsSync(commandPath)) {
        return {
          ...server,
          status: 'missing-command',
          details: `${server.command} wurde nicht gefunden.`,
        };
      }
      return server;
    });
}

async function installCli(_event, providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error('Unbekannter Anbieter.');
  openInstallTerminal(provider);
  return {
    ok: true,
    message: `Installationsfenster fuer ${provider.label} wurde geoeffnet: ${provider.installCommand}`,
  };
}

async function testExternalServer(_event, request = {}) {
  const provider = PROVIDERS[request.provider];
  if (!provider) throw new Error('Unbekannter Anbieter.');
  const server = normalizeExternalServerConfig({ ...request.externalServer, enabled: true });
  const remoteCommand = [
    'set -e',
    `echo ${quoteShellArgument('SSH-Verbindung ok.')}`,
    `command -v ${quoteShellArgument(provider.command)}`,
    `${quoteShellArgument(provider.command)} ${provider.versionArgs.map(quoteShellArgument).join(' ')}`,
    `test -d ${quoteRemotePath(server.remoteProjectPath)}`,
    `echo ${quoteShellArgument(`Remote-Projekt gefunden: ${server.remoteProjectPath}`)}`,
  ].join(' && ');
  const ssh = await buildSshInvocation(server, remoteCommand, { batchMode: true, connectTimeoutSeconds: 10 });
  const result = await runCapture(ssh.command, ssh.args, { timeoutMs: 20_000 });
  return {
    ok: result.ok,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
    error: result.error,
    exitCode: result.exitCode,
  };
}

async function runAgent(event, request) {
  const provider = PROVIDERS[request.provider];
  if (!provider) throw new Error('Unbekannter Anbieter.');
  if (!MODEL_ALLOWLIST[request.provider]?.has(request.model)) {
    throw new Error('Das angeforderte Modell ist fuer diesen Anbieter nicht freigegeben.');
  }
  if (!['read-only', 'workspace-write', 'full'].includes(request.access)) {
    throw new Error('Ungueltiger Zugriffsmodus.');
  }
  if (request.reasoningEffort && !['low', 'medium', 'high'].includes(request.reasoningEffort)) {
    throw new Error('Ungueltiger Reasoning-Level.');
  }
  if (typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > 100_000) {
    throw new Error('Die Anfrage ist leer oder zu lang.');
  }
  if (
    !request.projectPath ||
    !fs.existsSync(request.projectPath) ||
    !fs.statSync(request.projectPath).isDirectory()
  ) {
    throw new Error('Der Projektordner existiert nicht.');
  }

  const externalServer = request.externalServer?.enabled
    ? normalizeExternalServerConfig(request.externalServer)
    : null;
  const effectiveProjectPath = externalServer ? externalServer.remoteProjectPath : request.projectPath;
  let executable = '';
  if (!externalServer) {
    const found = await findProviderExecutable(provider);
    executable = found.executable || '';
    if (!executable) {
      return {
        ok: false,
        output: '',
        error: `${provider.label} wurde nicht gefunden. Installiere die CLI und starte CodeForge neu.`,
        exitCode: -1,
      };
    }
    if (request.provider === 'antigravity' && /\.(cmd|bat)$/i.test(executable)) {
      return {
        ok: false,
        output: '',
        error: 'Fuer Antigravity wird unter Windows die native agy-Installation benoetigt, kein unsicherer .cmd-Wrapper.',
        exitCode: -1,
      };
    }
  }

  const prompt = buildPrompt(
    withSystemPrompt(request.systemPrompt, request.prompt),
    request.attachments,
    request.access,
    effectiveProjectPath,
  );
  const runId = request.runId || crypto.randomUUID();
  const providerEnv = buildProviderEnv(request.provider, request.apiKeys);
  const runStartedAtMs = Date.now();
  const isAntigravityRun = request.provider === 'antigravity';
  const isOriginal = request.originalPluginEnabled;
  const runCodex = (ignoreUserConfig = false) => {
    const { args, stdin } = buildAgentCommand(
      request.provider,
      request.model,
      prompt,
      request.access,
      effectiveProjectPath,
      request.reasoningEffort,
      { ignoreUserConfig, remote: Boolean(externalServer), originalPluginEnabled: isOriginal },
    );
    if (externalServer) {
      return runRemoteProviderCommand(provider, externalServer, providerEnv, args, {
        stdin,
        interactive: isOriginal,
        timeoutMs: isOriginal ? undefined : (isAntigravityRun ? 12 * 60 * 1000 : undefined),
        noOutputMs: isOriginal ? undefined : (isAntigravityRun ? 15_000 : undefined),
        onSpawn: (child) => activeProcesses.set(runId, child),
        onNoOutput: () => {
          event.sender.send('agent:output', {
            runId,
            chunk: '\nAntigravity laeuft, liefert aber noch keine Konsolenausgabe. Falls das so bleibt, wartet die CLI vermutlich auf Login, Modellzugriff oder Berechtigungen.\n',
            stream: 'stderr',
          });
        },
        onOutput: (chunk, stream) => {
          event.sender.send('agent:output', { runId, chunk, stream });
        },
      });
    }
    return runCapture(executable, args, {
      cwd: request.projectPath,
      stdin,
      env: providerEnv,
      interactive: isOriginal,
      timeoutMs: isOriginal ? undefined : (isAntigravityRun ? 12 * 60 * 1000 : undefined),
      noOutputMs: isOriginal ? undefined : (isAntigravityRun ? 15_000 : undefined),
      onSpawn: (child) => activeProcesses.set(runId, child),
      onNoOutput: () => {
        event.sender.send('agent:output', {
          runId,
          chunk: '\nAntigravity laeuft, liefert aber noch keine Konsolenausgabe. Bei schreibenden Aufgaben startet CodeForge jetzt mit uebersprungenen CLI-Permissions; falls es trotzdem haengt, pruefe Login/Modellzugriff mit `agy` im Terminal.\n',
          stream: 'stderr',
        });
      },
      onOutput: (chunk, stream) => {
        event.sender.send('agent:output', { runId, chunk, stream });
      },
    });
  };

  const initialConversationId = isAntigravityRun ? findAntigravityConversationId(request.projectPath) : '';
  let watcher = null;
  if (isAntigravityRun) {
    watcher = startWatchingAntigravity(runId, request.projectPath, initialConversationId, runStartedAtMs, event);
  }

  let result;
  try {
    result = await runCodex();
    if (!externalServer && request.provider === 'openai' && process.platform === 'win32' && isCodexWindowsSandboxSetupError(result)) {
      activeProcesses.delete(runId);
      event.sender.send('agent:output', {
        runId,
        chunk: '\nWindows-Sandbox-Setup blockiert lokale Befehle. Starte Codex erneut ohne User-Config...\n',
        stream: 'stderr',
      });
      result = await runCodex(true);
    }
  } finally {
    activeProcesses.delete(runId);
    if (watcher) {
      watcher.stop();
    }
  }

  if (!externalServer && request.provider === 'antigravity' && result.ok && ![result.stdout, result.stderr].filter(Boolean).join('').trim()) {
    const transcriptOutput = readAntigravityTranscriptOutput(request.projectPath, runStartedAtMs);
    if (transcriptOutput) {
      result = {
        ...result,
        stdout: transcriptOutput,
      };
      event.sender.send('agent:output', {
        runId,
        chunk: `\nAntigravity hat keine direkte Konsolenausgabe geliefert; Antwort aus dem lokalen Transcript wiederhergestellt.\n`,
        stream: 'stderr',
      });
    } else {
      result = {
        ...result,
        ok: false,
        error:
          'Antigravity wurde beendet, hat aber keine Textausgabe geliefert. Oeffne Antigravity einmal direkt, pruefe Login/Modellzugriff und fuehre `agy update` aus.',
      };
    }
  }

  return {
    ok: result.ok,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
    error: result.error,
    exitCode: result.exitCode,
  };
}

async function runProjectTest(event, request) {
  if (
    !request.projectPath ||
    !fs.existsSync(request.projectPath) ||
    !fs.statSync(request.projectPath).isDirectory()
  ) {
    throw new Error('Der Projektordner existiert nicht.');
  }

  const picked = pickProjectTestCommand(request.projectPath);
  if (!picked) {
    return {
      ok: false,
      output: '',
      error: 'Kein Test-, Lint- oder TypeScript-Pruefbefehl im Projekt gefunden.',
      exitCode: -1,
    };
  }

  const executable = await findExecutable(picked.command);
  if (!executable) {
    return {
      ok: false,
      output: '',
      error: `${picked.command} wurde nicht gefunden.`,
      exitCode: -1,
    };
  }

  const runId = request.runId || crypto.randomUUID();
  const result = await runCapture(executable, picked.args, {
    cwd: request.projectPath,
    timeoutMs: 10 * 60 * 1000,
    onSpawn: (child) => activeProcesses.set(runId, child),
    onOutput: (chunk, stream) => {
      event.sender.send('agent:output', { runId, chunk, stream });
    },
  });
  activeProcesses.delete(runId);

  const body = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  return {
    ok: result.ok,
    output: [`Lokaler Testlauf ohne KI-Tokens: ${picked.label}`, body].filter(Boolean).join('\n\n').trim(),
    error: result.error,
    exitCode: result.exitCode,
  };
}

async function generateSystemPrompt(_event, request) {
  const generationAccess = 'read-only';
  const provider = PROVIDERS[request.provider];
  if (!provider) throw new Error('Unbekannter Anbieter.');
  if (!MODEL_ALLOWLIST[request.provider]?.has(request.model)) {
    throw new Error('Das angeforderte Modell ist fuer diesen Anbieter nicht freigegeben.');
  }
  if (!['read-only', 'workspace-write', 'full'].includes(request.access)) {
    throw new Error('Ungueltiger Zugriffsmodus.');
  }
  if (request.reasoningEffort && !['low', 'medium', 'high'].includes(request.reasoningEffort)) {
    throw new Error('Ungueltiger Reasoning-Level.');
  }
  if (
    !request.projectPath ||
    !fs.existsSync(request.projectPath) ||
    !fs.statSync(request.projectPath).isDirectory()
  ) {
    throw new Error('Der Projektordner existiert nicht.');
  }

  const externalServer = request.externalServer?.enabled
    ? normalizeExternalServerConfig(request.externalServer)
    : null;
  const effectiveProjectPath = externalServer ? externalServer.remoteProjectPath : request.projectPath;
  let executable = '';
  if (!externalServer) {
    const found = await findProviderExecutable(provider);
    executable = found.executable || '';
    if (!executable) {
      return {
        ok: false,
        output: '',
        error: `${provider.label} wurde nicht gefunden. Installiere die CLI und starte CodeForge neu.`,
        exitCode: -1,
      };
    }
    if (request.provider === 'antigravity' && /\.(cmd|bat)$/i.test(executable)) {
      return {
        ok: false,
        output: '',
        error: 'Fuer Antigravity wird unter Windows die native agy-Installation benoetigt, kein unsicherer .cmd-Wrapper.',
        exitCode: -1,
      };
    }
  }

  const prompt = buildPrompt(
    'Erstelle einen empfohlenen System-Prompt fuer einen lokalen Coding-Agenten in diesem Projekt. Antworte nur mit dem fertigen System-Prompt, ohne Markdown, ohne Erklaerung. Der Prompt soll kurz, praezise und sicher sein: bestehende Patterns lesen, Nutzerarbeit schuetzen, relevante Dateien aendern, Tests/Builds pruefen, knapp auf Deutsch antworten.',
    [],
    generationAccess,
    effectiveProjectPath,
  );
  const providerEnv = buildProviderEnv(request.provider, request.apiKeys);
  const runCodex = (ignoreUserConfig = false) => {
    const { args, stdin } = buildAgentCommand(
      request.provider,
      request.model,
      prompt,
      generationAccess,
      effectiveProjectPath,
      request.reasoningEffort,
      { ignoreUserConfig, remote: Boolean(externalServer) },
    );
    if (externalServer) {
      return runRemoteProviderCommand(provider, externalServer, providerEnv, args, {
        stdin,
      });
    }
    return runCapture(executable, args, {
      cwd: request.projectPath,
      stdin,
      env: providerEnv,
    });
  };

  let result = await runCodex();
  if (!externalServer && request.provider === 'openai' && process.platform === 'win32' && isCodexWindowsSandboxSetupError(result)) {
    result = await runCodex(true);
  }

  return {
    ok: result.ok,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
    error: result.error,
    exitCode: result.exitCode,
  };
}

async function getCliStatus() {
  const entries = await Promise.all(
    Object.entries(PROVIDERS).map(async ([id, provider]) => {
      const { executable } = await findProviderExecutable(provider);
      if (!executable) return [id, { installed: false, executable: '', version: '' }];
      const result = await runCapture(executable, provider.versionArgs);
      return [
        id,
        {
          installed: result.ok,
          executable,
          version: (result.stdout || result.stderr).trim().split(/\r?\n/)[0] || '',
          installCommand: provider.installCommand,
          installUrl: provider.installUrl,
        },
      ];
    }),
  );
  const status = Object.fromEntries(entries);
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    status[id] = {
      installCommand: provider.installCommand,
      installUrl: provider.installUrl,
      ...status[id],
    };
  }
  return status;
}

function validatePackageName(name) {
  return /^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(name);
}

async function runNpm(projectPath, action, packageName) {
  if (!validatePackageName(packageName)) throw new Error('Ungueltiger npm-Paketname.');
  const npm = await findExecutable('npm');
  if (!npm) throw new Error('npm wurde nicht gefunden.');
  const args = action === 'install' ? ['install', packageName] : ['uninstall', packageName];
  const result = await runCapture(npm, args, { cwd: projectPath });
  if (!result.ok) throw new Error(result.error || result.stderr || 'npm konnte nicht ausgefuehrt werden.');
  return (result.stdout || result.stderr).trim();
}

function runGit(projectPath, args) {
  return new Promise(async (resolve) => {
    const git = await findExecutable('git');
    if (!git) {
      resolve({ ok: false, output: '', error: 'Git wurde nicht gefunden.' });
      return;
    }
    const result = await runCapture(git, args, { cwd: projectPath });
    resolve({
      ok: result.ok,
      output: result.stdout.trim(),
      error: result.error || result.stderr.trim(),
    });
  });
}

async function getSpotifyTrack() {
  if (process.platform !== 'win32') {
    return { available: false, isPlaying: false, title: '', artist: '', album: '', appId: '', error: 'Nur Windows Media Session wird aktuell unterstuetzt.' };
  }
  const powershell = (await findExecutable('powershell.exe')) || (await findExecutable('powershell'));
  if (!powershell) {
    return { available: false, isPlaying: false, title: '', artist: '', album: '', appId: '', error: 'PowerShell wurde nicht gefunden.' };
  }
  const script = `
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
  $managerTask = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke($null, @([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()))
  $manager = $managerTask.GetAwaiter().GetResult()
  $session = $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'spotify' } | Select-Object -First 1
  if (-not $session) { $session = $manager.GetCurrentSession() }
  if (-not $session) {
    [pscustomobject]@{ available=$false; isPlaying=$false; title=''; artist=''; album=''; appId='' } | ConvertTo-Json -Compress
    exit 0
  }
  $propsTask = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]).Invoke($null, @($session.TryGetMediaPropertiesAsync()))
  $props = $propsTask.GetAwaiter().GetResult()
  $info = $session.GetPlaybackInfo()
  [pscustomobject]@{
    available=$true
    isPlaying=($info.PlaybackStatus.ToString() -eq 'Playing')
    title=$props.Title
    artist=$props.Artist
    album=$props.AlbumTitle
    appId=$session.SourceAppUserModelId
  } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ available=$false; isPlaying=$false; title=''; artist=''; album=''; appId=''; error=$_.Exception.Message } | ConvertTo-Json -Compress
  exit 0
}
`;
  const result = await runCapture(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeoutMs: 5000 });
  const output = (result.stdout || '').trim();
  if (!output) {
    return { available: false, isPlaying: false, title: '', artist: '', album: '', appId: '', error: result.error || result.stderr || 'Spotify konnte nicht abgefragt werden.' };
  }
  try {
    const track = JSON.parse(output);
    track.artworkUrl = await findTrackArtwork(track);
    return track;
  } catch {
    return { available: false, isPlaying: false, title: '', artist: '', album: '', appId: '', error: 'Spotify-Antwort konnte nicht gelesen werden.' };
  }
}

async function findTrackArtwork(track) {
  const title = String(track?.title || '').trim();
  const artist = String(track?.artist || '').trim();
  const album = String(track?.album || '').trim();
  if (!title && !artist && !album) return '';
  const cacheKey = [artist, title, album].join('|').toLowerCase();
  if (artworkCache.has(cacheKey)) return artworkCache.get(cacheKey);
  const terms = [
    [artist, title].filter(Boolean).join(' '),
    [title, artist].filter(Boolean).join(' '),
    [artist, album].filter(Boolean).join(' '),
    title,
  ]
    .map(cleanArtworkTerm)
    .filter(Boolean);
  const uniqueTerms = [...new Set(terms)];
  try {
    for (const term of uniqueTerms) {
      const deezerArtwork = await findDeezerArtwork(term);
      if (deezerArtwork) {
        artworkCache.set(cacheKey, deezerArtwork);
        return deezerArtwork;
      }
    }
    for (const term of uniqueTerms) {
      const itunesArtwork = await findItunesArtwork(term);
      if (itunesArtwork) {
        artworkCache.set(cacheKey, itunesArtwork);
        return itunesArtwork;
      }
    }
  } catch {
    // Artwork is cosmetic. Keep widget usable when a public lookup fails.
  }
  artworkCache.set(cacheKey, '');
  return '';
}

function cleanArtworkTerm(value) {
  return String(value || '')
    .replace(/\s*[-–—]\s*(radio edit|remaster(ed)?|explicit|clean|sped up|slowed|nightcore|live|mono|stereo)\b/gi, ' ')
    .replace(/\((radio edit|remaster(ed)?|explicit|clean|sped up|slowed|nightcore|live|mono|stereo)[^)]+\)/gi, ' ')
    .replace(/\[[^\]]*(explicit|clean|remaster|live|radio)[^\]]*\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findDeezerArtwork(term) {
  const query = new URLSearchParams({ q: term, limit: '1' });
  const response = await fetch(`https://api.deezer.com/search?${query.toString()}`);
  if (!response.ok) return '';
  const data = await response.json();
  const result = Array.isArray(data?.data) ? data.data[0] : null;
  return typeof result?.album?.cover_big === 'string' ? result.album.cover_big : '';
}

async function findItunesArtwork(term) {
  const query = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: '1',
    country: 'DE',
  });
  const response = await fetch(`https://itunes.apple.com/search?${query.toString()}`);
  if (!response.ok) return '';
  const data = await response.json();
  const result = Array.isArray(data?.results) ? data.results[0] : null;
  const artwork = typeof result?.artworkUrl100 === 'string' ? result.artworkUrl100 : '';
  return artwork.replace(/100x100bb\.(jpg|png|webp)$/i, '300x300bb.$1');
}

const activeTerminalProcesses = new Map();

async function runTerminalCommand(event, { id, command, cwd }) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    const child = spawn(command, { 
      cwd: cwd || app.getPath('home'), 
      env,
      shell: true 
    });
    activeTerminalProcesses.set(id, child);
    
    child.stdout.on('data', (data) => {
      event.sender.send(`terminal:output:${id}`, { type: 'stdout', text: data.toString() });
    });
    
    child.stderr.on('data', (data) => {
      event.sender.send(`terminal:output:${id}`, { type: 'stderr', text: data.toString() });
    });
    
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
}

function cancelTerminalCommand(id) {
  const child = activeTerminalProcesses.get(id);
  if (child) {
    child.kill();
    activeTerminalProcesses.delete(id);
    return true;
  }
  return false;
}

const activeShells = new Map();

async function createShellSession(event, { chatId, cwd, shellType, externalServer }) {
  console.log(`[Shell] Creating PTY session for chat: ${chatId}, requested cwd: ${cwd}, shellType: ${shellType}`);
  if (activeShells.has(chatId)) {
    console.log(`[Shell] PTY Session already active for chat: ${chatId}`);
    return;
  }
  
  const isWin = process.platform === 'win32';
  let shell = isWin ? 'cmd.exe' : 'bash';
  let args = [];
  const env = { ...process.env };

  const server = externalServer?.enabled ? normalizeExternalServerConfig(externalServer) : null;
  if (server) {
    const sshExe = await findExecutable('ssh') || 'ssh';
    shell = sshExe;
    args = [
      '-p', String(server.port),
      '-o', 'ConnectTimeout=15',
      '-o', 'ServerAliveInterval=15',
    ];
    if (server.acceptNewHostKey) args.push('-o', 'StrictHostKeyChecking=accept-new');
    if (server.identityFile) args.push('-i', server.identityFile);
    args.push(`${server.user ? `${server.user}@` : ''}${server.host}`);
    
    const remoteCmd = `cd -- ${quoteRemotePath(server.remoteProjectPath)} && exec bash`;
    args.push('-t', remoteCmd);
  } else {
    if (shellType === 'powershell') {
      shell = isWin ? 'powershell.exe' : 'pwsh';
      args.push('-NoLogo');
    }
    
    if (isWin) {
      const agyPath = path.join(app.getPath('home'), 'AppData', 'Local', 'agy', 'bin');
      const paths = (env.PATH || '').split(path.delimiter);
      if (!paths.some(p => p.toLowerCase() === agyPath.toLowerCase())) {
        paths.push(agyPath);
        env.PATH = paths.join(path.delimiter);
      }
    }
  }

  let spawnCwd = app.getPath('home');
  if (!server && cwd && fs.existsSync(cwd)) {
    try {
      if (fs.statSync(cwd).isDirectory()) {
        spawnCwd = cwd;
      }
    } catch (e) {
      console.error(`[Shell] Error checking cwd directory: ${e.message}`);
    }
  }
  console.log(`[Shell] Spawning PTY ${shell} in ${spawnCwd}`);

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
    console.log(`[Shell] Spawned PTY process PID: ${ptyProcess.pid}`);
    
    ptyProcess.onData((data) => {
      event.sender.send(`shell:output:${chatId}`, { type: 'stdout', text: data });
    });
    
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[Shell CLOSE] pid: ${ptyProcess.pid}, code: ${exitCode}, signal: ${signal}`);
      activeShells.delete(chatId);
      event.sender.send(`shell:output:${chatId}`, { type: 'exit', code: exitCode });
    });
  } catch (err) {
    console.error(`[Shell SPAWN CRITICAL] ${err.message}`);
    event.sender.send(`shell:output:${chatId}`, { type: 'stderr', text: `PTY Spawn error: ${err.message}` });
  }
}

function writeToShellSession(_event, { chatId, text }) {
  console.log(`[Shell WRITE] chat: ${chatId}, textLength: ${text.length}`);
  const ptyProcess = activeShells.get(chatId);
  if (ptyProcess) {
    ptyProcess.write(text);
    return true;
  }
  console.log(`[Shell WRITE FAILED] chat: ${chatId}, PTY found: ${!!ptyProcess}`);
  return false;
}

function resizeShellSession(_event, { chatId, cols, rows }) {
  console.log(`[Shell RESIZE] chat: ${chatId}, cols: ${cols}, rows: ${rows}`);
  const ptyProcess = activeShells.get(chatId);
  if (ptyProcess) {
    try {
      ptyProcess.resize(cols, rows);
      return true;
    } catch (e) {
      console.error(`[Shell RESIZE FAILED] ${e.message}`);
    }
  }
  return false;
}

function killShellSession(_event, chatId) {
  console.log(`[Shell KILL] chat: ${chatId}`);
  const ptyProcess = activeShells.get(chatId);
  if (ptyProcess) {
    ptyProcess.kill();
    activeShells.delete(chatId);
    return true;
  }
  return false;
}

app.whenReady().then(() => {
  protocol.handle('codeforge-media', (request) => {
    let filePath = request.url;
    if (filePath.startsWith('codeforge-media:///')) {
      filePath = filePath.slice('codeforge-media:///'.length);
    } else if (filePath.startsWith('codeforge-media://')) {
      filePath = filePath.slice('codeforge-media://'.length);
    }
    filePath = decodeURIComponent(filePath);
    const { pathToFileURL } = require('node:url');
    return net.fetch(pathToFileURL(filePath).toString());
  });

  ipcMain.handle('dialog:select-project', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Projektordner auswaehlen',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('dialog:create-project', createProjectFolder);
  ipcMain.handle('dialog:scratch-project', () => scratchProjectFolder());

  ipcMain.handle('dialog:select-attachments', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Dateien anhaengen',
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:select-theme-background', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Theme-Hintergrund auswaehlen',
      properties: ['openFile'],
      filters: [
        { name: 'Alle Medien', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'mp4', 'webm', 'mov', 'm4v', 'ogg', 'ogv', 'avi', 'mkv'] },
        { name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] },
        { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogg', 'ogv', 'avi', 'mkv'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:select-application', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Desktop-App als Tab hinzufuegen',
      defaultPath: app.getPath('desktop'),
      properties: ['openFile'],
      filters: [
        process.platform === 'win32'
          ? { name: 'Apps und Verknuepfungen', extensions: ['exe', 'lnk', 'cmd', 'bat'] }
          : { name: 'Apps', extensions: ['app', 'sh', 'command'] },
        { name: 'Alle Dateien', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:select-local-file', async (_event, input = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Datei auswaehlen',
      defaultPath: app.getPath('downloads'),
      properties: ['openFile'],
      filters: [
        { name: 'Alle Dateien', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:select-codex-plugin', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Codex-Plugin-Ordner auswaehlen',
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('system:status', getCliStatus);
  ipcMain.handle('updates:status', () => updater ? updater.getUpdateState() : {});
  ipcMain.handle('updates:check', (_e, input) => updater ? updater.checkForAppUpdates(_e, input) : {});
  ipcMain.handle('updates:install', () => updater ? updater.installUpdate() : false);
  ipcMain.handle('system:mcp-servers', () => getMcpServers());
  ipcMain.handle('system:install-cli', installCli);
  ipcMain.handle('usage:provider', (_event, providerId) => getProviderUsage(providerId));
  ipcMain.handle('usage:antigravity-terminal', () => getAntigravityTerminalUsage());
  ipcMain.handle('antigravity:import-chats', () => readAntigravityImportedChats());
  ipcMain.handle('external-server:test', testExternalServer);
  ipcMain.handle('agent:run', runAgent);
  ipcMain.handle('workspace:launch-terminals', launchWorkspaceTerminals);
  ipcMain.handle('agent:test', runProjectTest);
  ipcMain.handle('agent:generate-system-prompt', generateSystemPrompt);
  ipcMain.handle('agent:notify-complete', (_event, input) => showTaskNotification(input));
  ipcMain.handle('discord:presence', updateDiscordPresence);
  ipcMain.handle('agent:cancel', (_event, runId) => {
    const child = activeProcesses.get(runId);
    if (!child) return false;
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGTERM');
    }
    activeProcesses.delete(runId);
    return true;
  });
  ipcMain.handle('agent:write-input', (_event, { runId, text }) => {
    const child = activeProcesses.get(runId);
    if (child && child.stdin && !child.stdin.destroyed) {
      if (text === '\x1b') {
        child.stdin.write(text);
      } else {
        child.stdin.write(text + '\n');
      }
      return true;
    }
    return false;
  });

  ipcMain.handle('git:info', async (_event, projectPath) => {
    const branch = await runGit(projectPath, ['branch', '--show-current']);
    const root = await runGit(projectPath, ['rev-parse', '--show-toplevel']);
    return {
      isRepository: branch.ok || root.ok,
      branch: branch.output || '',
      root: root.output || '',
    };
  });
  ipcMain.handle('git:branches', async (_event, projectPath) => {
    const result = await runGit(projectPath, ['branch', '--format=%(refname:short)']);
    return result.ok ? result.output.split(/\r?\n/).filter(Boolean) : [];
  });
  ipcMain.handle('git:switch', async (_event, projectPath, branch) => {
    if (!/^[\w./-]+$/.test(branch)) throw new Error('Ungueltiger Branch-Name.');
    return runGit(projectPath, ['switch', branch]);
  });

  ipcMain.handle('plugins:install', (_event, projectPath, packageName) =>
    runNpm(projectPath, 'install', packageName),
  );
  ipcMain.handle('plugins:remove', (_event, projectPath, packageName) =>
    runNpm(projectPath, 'remove', packageName),
  );
  ipcMain.handle('codex-plugins:list', (_event, projectPath) => getCodexPlugins(projectPath));
  ipcMain.handle('codex-plugins:install-folder', installCodexPluginFromFolder);
  ipcMain.handle('codex-plugins:remove', removeCodexPlugin);

  ipcMain.handle('launcher:open-app', async (_event, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath.trim()) throw new Error('Ungueltiger App-Pfad.');
    if (!fs.existsSync(targetPath)) throw new Error('Die App wurde auf diesem Pfad nicht gefunden.');
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
    return '';
  });
  ipcMain.handle('native-tabs:attach', attachNativeTab);
  ipcMain.handle('native-tabs:move', moveNativeTab);
  ipcMain.handle('native-tabs:detach', detachNativeTab);

  ipcMain.handle('launcher:spotify', (_event, uri) => {
    const target = typeof uri === 'string' && uri.trim() ? uri.trim() : 'spotify:';
    if (!/^spotify:/i.test(target)) throw new Error('Nur spotify:-Links sind hier erlaubt.');
    return shell.openExternal(target);
  });
  ipcMain.handle('spotify:track', getSpotifyTrack);

  ipcMain.handle('shell:open-external', (_event, url) => {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('URL-Protokoll nicht erlaubt.');
    return shell.openExternal(parsed.toString());
  });
  ipcMain.handle('shell:open-path', (_event, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath.trim()) throw new Error('Ungueltiger Pfad.');
    if (/^[a-z]+:\/\//i.test(targetPath)) throw new Error('Nur lokale Dateipfade sind erlaubt.');
    return shell.openPath(targetPath);
  });

  ipcMain.handle('actions:list', async (_event, dirPath) => {
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
      dirPath = 'C:\\Users\\Chris\\OneDrive\\Dokumente\\Way';
    }
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    try {
      const files = fs.readdirSync(dirPath);
      const macros = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const fullPath = path.join(dirPath, file);
            const content = fs.readFileSync(fullPath, 'utf8');
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
              macros.push({
                name: file.slice(0, -5),
                events: data.length,
                path: fullPath
              });
            }
          } catch (e) {
            // ignore invalid files
          }
        }
      }
      return macros;
    } catch (err) {
      throw new Error(`Fehler beim Lesen des Action-Ordners: ${err.message}`);
    }
  });

  ipcMain.handle('actions:play', async (_event, dirPath, name) => {
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
      dirPath = 'C:\\Users\\Chris\\OneDrive\\Dokumente\\Way';
    }
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Ungueltiger Action-Name.');
    }
    return new Promise((resolve, reject) => {
      const cmdPath = path.join(dirPath, 'action.cmd');
      if (!fs.existsSync(cmdPath)) {
        reject(new Error(`action.cmd wurde im Ordner ${dirPath} nicht gefunden.`));
        return;
      }
      
      const child = spawn('cmd.exe', ['/c', 'action.cmd', 'play', name], {
        cwd: dirPath,
        shell: true
      });
      
      let errorOut = '';
      child.stderr.on('data', (data) => {
        errorOut += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Action fehlgeschlagen (Code ${code}): ${errorOut}`));
        }
      });
    });
  });

  ipcMain.handle('actions:record', async (_event, dirPath, name) => {
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
      dirPath = 'C:\\Users\\Chris\\OneDrive\\Dokumente\\Way';
    }
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Ungueltiger Action-Name.');
    }
    return new Promise((resolve, reject) => {
      const cmdPath = path.join(dirPath, 'action.cmd');
      if (!fs.existsSync(cmdPath)) {
        reject(new Error(`action.cmd wurde im Ordner ${dirPath} nicht gefunden.`));
        return;
      }
      
      const child = spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', `action.cmd record "${name}"`], {
        cwd: dirPath,
        shell: true
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Recording konnte nicht gestartet werden (Code ${code})`));
        }
      });
    });
  });

  ipcMain.handle('actions:remove', async (_event, dirPath, name) => {
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
      dirPath = 'C:\\Users\\Chris\\OneDrive\\Dokumente\\Way';
    }
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Ungueltiger Action-Name.');
    }
    try {
      const file = path.join(dirPath, `${name}.json`);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        return { success: true };
      } else {
        throw new Error(`Action "${name}" existiert nicht.`);
      }
    } catch (err) {
      throw new Error(`Fehler beim Loeschen: ${err.message}`);
    }
  });

  ipcMain.handle('terminal:run', runTerminalCommand);
  ipcMain.handle('terminal:cancel', (_event, id) => cancelTerminalCommand(id));

  ipcMain.handle('shell:create', createShellSession);
  ipcMain.handle('shell:write', writeToShellSession);
  ipcMain.handle('shell:kill', (_event, chatId) => killShellSession(_event, chatId));
  ipcMain.handle('shell:resize', resizeShellSession);

  ipcMain.handle('sync:start-server', async () => {
    return startSyncServer();
  });
  ipcMain.handle('sync:get-server-status', async () => {
    if (syncServer) {
      const port = syncServer.address().port;
      const ip = getLocalIpAddress();
      return { running: true, url: `http://${ip}:${port}`, ip, port };
    }
    return { running: false };
  });

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  createWindow();
  updater = setupUpdater({ app, mainWindow, autoUpdater });
  updater.initializeAutoUpdates();
  setTimeout(() => {
    void updater.checkForAppUpdates(null, { manual: false });
  }, 4000).unref?.();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
