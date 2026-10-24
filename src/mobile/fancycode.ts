import { Native } from './native';
import { base64Utf8, nativeServer, run, shellQuote } from './remote';
import type { MobileServer } from './types';
import type { FancyCodeBridge } from '../fancycode/FancyCodePanel';

// Mobile bridge for the FancyCode agent. The harness runs over SSH on the V-Server in SDK mode;
// questions and permission requests therefore behave exactly like on the desktop, only the
// process lives on the server.

type FcEvent = { type: string; [key: string]: unknown };
type EventHandler = (id: string, event: FcEvent) => void;

let counter = 0;
const nextId = () => `fc-${Date.now().toString(36)}-${(++counter).toString(36)}`;

const installed = new Map<string, Promise<{ home: string; bundle: string; mcp: string }>>();

async function fetchAsset(name: string) {
  const response = await fetch(new URL(name, document.baseURI).toString(), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Asset ${name} fehlt (${response.status}).`);
  return response.text();
}

async function ensureHarness(server: MobileServer) {
  const key = server.id || `${server.user}@${server.host}`;
  const cached = installed.get(key);
  if (cached) return cached;
  const task = (async () => {
    const info = await run(
      server,
      'mkdir -p "$HOME/.fancycode" && printf "H=%s\\n" "$HOME" && printf "V="; cat "$HOME/.fancycode/.version" 2>/dev/null || true',
      { timeoutMs: 20000 },
    );
    const home = info.stdout.split(/\r?\n/).find((line) => line.startsWith('H='))?.slice(2) || '';
    const current = info.stdout.split(/\r?\n/).find((line) => line.startsWith('V='))?.slice(2) || '';
    if (!home) throw new Error('Home-Verzeichnis auf dem V-Server nicht gefunden.');
    const [bundle, mcp] = await Promise.all([fetchAsset('fancycode.mjs'), fetchAsset('fancycode-remote-mcp.mjs').catch(() => '')]);
    const version = `${__APP_VERSION__}:${bundle.length}:${mcp.length}`;
    if (current !== version) {
      await Native.sftpWriteText({ server: nativeServer(server), path: `${home}/.fancycode/fancycode.mjs`, content: bundle });
      if (mcp) await Native.sftpWriteText({ server: nativeServer(server), path: `${home}/.fancycode/fancycode-remote-mcp.mjs`, content: mcp });
      await run(server, `printf '%s' ${shellQuote(version)} > "$HOME/.fancycode/.version"`, { timeoutMs: 15000 });
    }
    const mcpPath = mcp ? `${home}/.fancycode/fancycode-remote-mcp.mjs` : '';
    if (mcpPath) {
      // The harness on the server reads ~/.config/fancycode/mcp.json; merge our entry and
      // keep every other MCP server the user configured there.
      const script = [
        "const fs=require('fs'),os=require('os'),path=require('path');",
        "const file=path.join(os.homedir(),'.config','fancycode','mcp.json');",
        "let config={};try{config=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}",
        "const servers={...(config.mcpServers||{})};delete servers.codeforge;",
        `servers.fancycode={command:'node',args:[${JSON.stringify(mcpPath)}]};`,
        'config.mcpServers=servers;',
        'fs.mkdirSync(path.dirname(file),{recursive:true});',
        'fs.writeFileSync(file,JSON.stringify(config,null,2)+String.fromCharCode(10),{mode:0o600});',
      ].join('');
      await run(server, `printf '%s' ${shellQuote(base64Utf8(script))} | base64 -d | node`, { timeoutMs: 15000 }).catch(() => {});
    }
    return { home, bundle: `${home}/.fancycode/fancycode.mjs`, mcp: mcpPath };
  })();
  installed.set(key, task);
  task.catch(() => installed.delete(key));
  return task;
}

export class MobileFancyCodeBridge implements FancyCodeBridge {
  private handlers = new Set<EventHandler>();
  private buffers = new Map<string, string>();
  private ready = new Set<string>();
  private stopped = new Set<string>();
  private loginPorts = new Set<number>();
  private listeners: Promise<{ remove(): void } | void>[] = [];
  private disposed = false;

  constructor(private server: MobileServer) {
    this.listeners.push(Native.addListener('shellData', (event) => {
      let buffer = (this.buffers.get(event.channelId) || '') + event.data;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as FcEvent;
          if (typeof parsed?.type !== 'string') continue;
          if (parsed.type === 'ready') this.ready.add(event.channelId);
          // The harness runs on the server and starts its OAuth callback server there. Forward the
          // callback port over SSH, then open the login page in the phone's browser.
          if (parsed.type === 'login_url' && typeof parsed.url === 'string' && /^https?:\/\//i.test(parsed.url)) {
            const url = parsed.url;
            let port = 0;
            try {
              port = Number(new URL(url).searchParams.get('port') || '');
            } catch {
              // Not a URL we can parse; open it without the callback forward.
            }
            if (this.loginPorts.has(port)) {
              void Native.openUrl({ url }).catch(() => {});
            } else if (Number.isInteger(port) && port > 0 && port <= 65535) {
              void Native.forwardPort({ server: nativeServer(this.server), port })
                .then(() => {
                  this.loginPorts.add(port);
                  window.setTimeout(() => {
                    if (this.loginPorts.delete(port)) void Native.cancelForwardPort({ server: nativeServer(this.server), port }).catch(() => {});
                  }, 5 * 60 * 1000);
                  void Native.openUrl({ url }).catch(() => {});
                })
                .catch((error) => {
                  const message = `Anmeldung: ${error instanceof Error ? error.message : String(error)}`;
                  this.handlers.forEach((handler) => handler(event.channelId, { type: 'error', message }));
                });
            } else {
              void Native.openUrl({ url }).catch(() => {});
            }
          }
          if (parsed.type === 'account' && parsed.account && this.loginPorts.size) {
            for (const port of this.loginPorts) void Native.cancelForwardPort({ server: nativeServer(this.server), port }).catch(() => {});
            this.loginPorts.clear();
          }
          this.handlers.forEach((handler) => handler(event.channelId, parsed));
        } catch {
          // Login hints and other plain text are not part of the protocol.
        }
      }
      this.buffers.set(event.channelId, buffer);
    }).catch(() => {}));
    this.listeners.push(Native.addListener('shellExit', (event) => {
      this.buffers.delete(event.channelId);
      const interrupted = !this.stopped.has(event.channelId) && !this.ready.has(event.channelId);
      this.ready.delete(event.channelId);
      this.stopped.delete(event.channelId);
      if (interrupted) {
        const message = event.lost
          ? 'Die Verbindung zum V-Server ist abgebrochen.'
          : `FancyCode wurde auf dem V-Server beendet${event.code ? ` (Code ${event.code})` : ''}. Läuft dort Node.js?`;
        this.handlers.forEach((handler) => handler(event.channelId, { type: 'error', message }));
      }
    }).catch(() => {}));
  }

  async start(opts: { cwd: string; resume?: string }): Promise<string> {
    if (this.disposed) throw new Error('Agent wurde geschlossen.');
    const { bundle } = await ensureHarness(this.server);
    const id = nextId();
    const cwd = opts.cwd || '~';
    const target = cwd === '~' ? '"$HOME"' : cwd.startsWith('~/') ? `"$HOME"/${shellQuote(cwd.slice(2))}` : shellQuote(cwd);
    const args = [
      `cd -- ${target}`,
      '&& NO_COLOR=1 FANCYCODE_APP=1',
      `node ${shellQuote(bundle)}`,
      '--sdk',
      '--cwd',
      '"$PWD"',
      ...(opts.resume ? ['--resume', shellQuote(String(opts.resume).replace(/[^a-z0-9-]/gi, '').slice(0, 60))] : []),
    ].join(' ');
    await Native.openShell({
      server: nativeServer(this.server),
      channelId: id,
      command: `bash -lc ${shellQuote(args)}`,
      cols: 200,
      rows: 50,
      // No PTY: the SDK speaks plain NDJSON and must not get terminal echo.
      pty: false,
    });
    return id;
  }

  send(id: string, message: unknown) {
    void Native.write({ channelId: id, data: `${JSON.stringify(message)}\n` }).catch(() => {});
  }

  stop(id: string) {
    this.buffers.delete(id);
    this.stopped.add(id);
    void Native.closeShell({ channelId: id }).catch(() => {});
  }

  onEvent(handler: EventHandler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  dispose() {
    this.disposed = true;
    this.handlers.clear();
    this.buffers.clear();
    this.ready.clear();
    this.stopped.clear();
    for (const port of this.loginPorts) void Native.cancelForwardPort({ server: nativeServer(this.server), port }).catch(() => {});
    this.loginPorts.clear();
    for (const handle of this.listeners) void handle.then((listener) => { if (listener) listener.remove(); }).catch(() => {});
    this.listeners = [];
  }
}

