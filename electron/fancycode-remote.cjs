'use strict';
// FancyCode harness on a V-Server: the agent process runs over SSH in the remote project
// folder. The bundle is uploaded once per server and version, then started in SDK mode.
// Events use the same channel as the local harness (fancycode:event), so the panel is unchanged.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const sftp = require('./sftp.cjs');

const REMOTE_DIR = '.fancycode';
const BUNDLE_NAME = 'fancycode.mjs';
const MCP_NAME = 'fancycode-remote-mcp.mjs';

const quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

function validateServer(server) {
  const host = String(server?.host || '').trim();
  const user = String(server?.user || '').trim();
  if (!host || !user) throw new Error('V-Server: Adresse und Benutzer fehlen.');
  return {
    id: String(server.id || `${user}@${host}`),
    name: String(server.name || host),
    host,
    user,
    port: Number(server.port || 22),
    keyPath: String(server.keyPath || ''),
  };
}

function registerIpc({ ipcMain, allow, buildSshArgs, runCommand, getWindow, openExternal, bundlePath, mcpPath }) {
  const procs = new Map();
  const installed = new Map();
  const watchers = new Map();
  const tunnels = new Map();

  const closeTunnels = () => {
    for (const child of tunnels.values()) {
      try {
        child.kill();
      } catch (_) {}
    }
    tunnels.clear();
  };

  // The harness starts its OAuth callback server on the server's 127.0.0.1. Tunnel that port
  // over SSH, then open the login page in the browser on this PC.
  async function openLoginUrl(vserver, url) {
    if (!openExternal) return;
    let port = 0;
    try {
      port = Number(new URL(url).searchParams.get('port') || '');
    } catch (_) {}
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      await openExternal(url);
      return;
    }
    if (!tunnels.has(port)) {
      const ssh = await buildSshArgs(vserver, { tty: false });
      const host = ssh.args[ssh.args.length - 1];
      const args = [...ssh.args.slice(0, -1), '-N', '-o', 'ExitOnForwardFailure=yes', '-L', `127.0.0.1:${port}:127.0.0.1:${port}`, host];
      const child = spawn(ssh.command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let errorText = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        errorText = (errorText + chunk).slice(-500);
      });
      child.on('exit', () => {
        if (tunnels.get(port) === child) tunnels.delete(port);
      });
      tunnels.set(port, child);
      setTimeout(() => {
        if (tunnels.get(port) !== child) return;
        tunnels.delete(port);
        try {
          child.kill();
        } catch (_) {}
      }, 5 * 60 * 1000).unref();
      // Give ssh a moment to bind the local port before the browser follows the redirect.
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (child.exitCode !== null) {
        throw new Error(`Anmelde-Port ${port} konnte nicht weitergeleitet werden. ${errorText.trim().split('\n').slice(-1)[0] || ''}`);
      }
    }
    await openExternal(url);
  }

  async function ensureRemoteFiles(vserver) {
    const stat = fs.statSync(bundlePath);
    const signature = `${stat.size}:${Math.round(stat.mtimeMs)}`;
    const cached = installed.get(vserver.id);
    if (cached?.signature === signature) return cached;

    const { home } = await sftp.connect(vserver);
    const dir = `${home}/${REMOTE_DIR}`;
    try {
      await sftp.mkdirRemote(vserver, dir);
    } catch (_) {
      // Already there (or the server keeps the home read-only); upload reports the real error.
    }
    const remoteBundle = `${dir}/${BUNDLE_NAME}`;
    await sftp.uploadFile(vserver, bundlePath, remoteBundle);
    let remoteMcp = '';
    if (mcpPath && fs.existsSync(mcpPath)) {
      remoteMcp = `${dir}/${MCP_NAME}`;
      await sftp.uploadFile(vserver, mcpPath, remoteMcp);
    }
    if (remoteMcp && runCommand) {
      // Stable entry point for agent configs: ~/.fancycode/fancycode-mcp
      const wrapper = `${dir}/fancycode-mcp`;
      const script = `#!/bin/sh\nexec node "$HOME/.fancycode/${MCP_NAME}"\n`;
      await runCommand(vserver, `printf '%s' ${quote(Buffer.from(script).toString('base64'))} | base64 -d > ${quote(wrapper)} && chmod 755 ${quote(wrapper)}`, 12000);
      // The built-in FancyCode harness on the server reads ~/.config/fancycode/mcp.json.
      // Merge our entry and keep other servers the user configured there.
      const configScript = [
        "const fs=require('fs'),os=require('os'),path=require('path');",
        "const file=path.join(os.homedir(),'.config','fancycode','mcp.json');",
        "let config={};try{config=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}",
        "const servers={...(config.mcpServers||{})};delete servers.codeforge;",
        `servers.fancycode={command:'node',args:[path.join(os.homedir(),'.fancycode','${MCP_NAME}')]};`,
        'config.mcpServers=servers;',
        'fs.mkdirSync(path.dirname(file),{recursive:true});',
        "fs.writeFileSync(file,JSON.stringify(config,null,2)+String.fromCharCode(10),{mode:0o600});",
      ].join('');
      await runCommand(vserver, `printf '%s' ${quote(Buffer.from(configScript).toString('base64'))} | base64 -d | node`, 12000);
    }
    const entry = { home, dir, bundle: remoteBundle, mcp: remoteMcp, signature };
    installed.set(vserver.id, entry);
    return entry;
  }

  ipcMain.handle('fancycode:remote-start', async (event, opts = {}) => {
    if (!allow(event)) throw new Error('Nicht erlaubt');
    const vserver = validateServer(opts.server);
    const cwd = String(opts.cwd || '').trim();
    if (!cwd || /[\r\n]/.test(cwd)) throw new Error('Projektordner auf dem V-Server fehlt.');
    const resume = opts.resume ? String(opts.resume).replace(/[^a-z0-9-]/gi, '').slice(0, 60) : '';
    const files = await ensureRemoteFiles(vserver);
    const ssh = await buildSshArgs(vserver, { tty: false });
    // Resolve ~ on the server, then hand the harness the absolute path.
    const target = cwd === '~' ? '"$HOME"' : cwd.startsWith('~/') ? `"$HOME"/${quote(cwd.slice(2))}` : quote(cwd);
    const remote = `cd -- ${target} && NO_COLOR=1 FANCYCODE_APP=1 node ${quote(files.bundle)} --sdk --cwd "$PWD"${resume ? ` --resume ${quote(resume)}` : ''}`;
    const child = spawn(ssh.command, [...ssh.args, remote], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const id = crypto.randomUUID();
    const sender = event.sender;
    const emit = (payload) => {
      if (!sender.isDestroyed()) sender.send('fancycode:event', id, payload);
    };
    let buffer = '';
    let errTail = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        try {
          const payload = JSON.parse(line);
          emit(payload);
          if (payload.type === 'login_url' && typeof payload.url === 'string') {
            void openLoginUrl(vserver, payload.url).catch((error) => {
              emit({ type: 'error', message: `Anmeldung: ${error.message}` });
            });
          }
          if (payload.type === 'account' && payload.account) closeTunnels();
        } catch (_) {
          errTail = (errTail + line).slice(-1000);
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      errTail = (errTail + chunk).slice(-2000);
    });
    child.on('error', (error) => {
      emit({ type: 'error', message: `FancyCode auf ${vserver.name} konnte nicht starten: ${error.message}` });
    });
    child.on('exit', (code) => {
      if (procs.has(id) && code) {
        emit({ type: 'error', message: `FancyCode auf ${vserver.name} wurde beendet (Code ${code}). ${errTail.trim().split('\n').slice(-3).join(' ')}` });
      }
      procs.delete(id);
    });
    procs.set(id, { child, sender });
    sender.once('destroyed', () => stop(id));
    return id;
  });

  const stop = (id) => {
    const proc = procs.get(id);
    if (!proc) return;
    procs.delete(id);
    try {
      proc.child.stdin.end();
    } catch (_) {}
    setTimeout(() => {
      try {
        proc.child.kill();
      } catch (_) {}
    }, 2500).unref();
  };

  ipcMain.on('fancycode:send', (event, id, message) => {
    const proc = procs.get(String(id));
    if (!proc || proc.sender !== event.sender || !message || typeof message !== 'object') return;
    try {
      proc.child.stdin.write(`${JSON.stringify(message)}\n`);
    } catch (_) {}
  });

  ipcMain.on('fancycode:stop', (event, id) => {
    const proc = procs.get(String(id));
    if (proc && proc.sender === event.sender) stop(String(id));
  });

  // ---------- questions and notifications from agents running on the server ----------

  async function startWatch(server) {
    const vserver = validateServer(server);
    if (watchers.has(vserver.id)) return true;
    // Install the harness and the remote MCP server on first use (also for terminal-only workspaces).
    try {
      await ensureRemoteFiles(vserver);
    } catch (_) {
      // Still start the watch: a missing upload must not hide agent questions.
    }
    const ssh = await buildSshArgs(vserver, { tty: false });
    const remote = 'mkdir -p "$HOME/.fancycode/ui/answers"; touch "$HOME/.fancycode/ui/events.jsonl"; tail -n 0 -F "$HOME/.fancycode/ui/events.jsonl"';
    const child = spawn(ssh.command, [...ssh.args, remote], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const entry = { child, vserver, buffer: '' };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      entry.buffer += chunk;
      let index;
      while ((index = entry.buffer.indexOf('\n')) >= 0) {
        const line = entry.buffer.slice(0, index).trim();
        entry.buffer = entry.buffer.slice(index + 1);
        if (!line) continue;
        try {
          const payload = JSON.parse(line);
          if (payload && typeof payload.type === 'string') {
            const window = getWindow();
            if (window && !window.isDestroyed()) window.webContents.send('fancycode:remote-event', { server: vserver, event: payload });
          }
        } catch (_) {}
      }
    });
    // tail ends on connection loss; drop the entry so the next event restarts it.
    child.on('exit', () => watchers.delete(vserver.id));
    child.on('error', () => watchers.delete(vserver.id));
    watchers.set(vserver.id, child);
    return true;
  }

  ipcMain.handle('fancycode:remote-watch', async (event, { server } = {}) => {
    if (!allow(event)) throw new Error('Nicht erlaubt');
    await startWatch(server);
    return true;
  });

  ipcMain.handle('fancycode:remote-answer', async (event, { server, id, answer } = {}) => {
    if (!allow(event)) throw new Error('Nicht erlaubt');
    const vserver = validateServer(server);
    const answerId = String(id || '').replace(/[^a-f0-9]/gi, '').slice(0, 40);
    if (!answerId || !runCommand) return false;
    const payload = Buffer.from(JSON.stringify(answer ?? null)).toString('base64');
    const command = `mkdir -p "$HOME/.fancycode/ui/answers" && printf '%s' '${payload}' | base64 -d > "$HOME/.fancycode/ui/answers/${answerId}.json"`;
    await runCommand(vserver, command, 12000);
    return true;
  });

  return {
    stopAll: () => {
      [...procs.keys()].forEach(stop);
      closeTunnels();
    },
    stopWatchers: () => {
      for (const child of watchers.values()) {
        try {
          child.kill();
        } catch (_) {}
      }
      watchers.clear();
    },
  };
}

module.exports = { registerIpc, validateServer };
