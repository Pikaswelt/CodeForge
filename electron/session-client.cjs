'use strict';
// Connects CodeForge to the session host (session-host.cjs) and starts it when needed.
// The host runs from a copy in the user data folder with the system Node.js when available,
// so it is neither part of CodeForge's process tree nor locked to the install folder that an
// update replaces. Without Node.js it falls back to CodeForge's own runtime (survives a
// restart of CodeForge, not an update).

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');

function findNode() {
  return new Promise((resolve) => {
    execFile(process.platform === 'win32' ? 'where.exe' : 'which', ['node'], { windowsHide: true }, (error, stdout) => {
      const first = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      resolve(!error && first ? first : null);
    });
  });
}

function createSessionClient({ userDataDir, isPackaged, resourcesPath }) {
  const baseDir = path.join(userDataDir, 'session-host');
  // One host per data folder (dev and installed builds keep separate sessions and tokens).
  const folderHash = crypto.createHash('sha1').update(path.resolve(userDataDir).toLowerCase()).digest('hex').slice(0, 12);
  const pipePath = process.platform === 'win32'
    ? `\\\\.\\pipe\\codeforge-sessions-${String(process.env.USERNAME || 'user').replace(/[^a-z0-9_-]/gi, '_')}-${folderHash}`
    : path.join(baseDir, 'host.sock');
  const tokenFile = path.join(baseDir, 'token');

  let socket = null;
  let connecting = null;
  let reqCounter = 0;
  const pendingCreates = new Map();
  const pendingLists = new Map();
  const dataListeners = new Map();
  const exitListeners = new Map();

  function prepareFiles() {
    fs.mkdirSync(baseDir, { recursive: true });
    if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, crypto.randomBytes(24).toString('hex'), { mode: 0o600 });
    const hostSource = fs.readFileSync(path.join(__dirname, 'session-host.cjs'), 'utf8');
    const hostScript = path.join(baseDir, 'session-host.cjs');
    if (!fs.existsSync(hostScript) || fs.readFileSync(hostScript, 'utf8') !== hostSource) fs.writeFileSync(hostScript, hostSource);
    const ptySource = isPackaged
      ? path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'node-pty')
      : path.dirname(require.resolve('node-pty/package.json'));
    const version = JSON.parse(fs.readFileSync(path.join(ptySource, 'package.json'), 'utf8')).version;
    // One folder per node-pty version: a running host keeps its files open.
    const ptyDir = path.join(baseDir, `node-pty-${version}`);
    if (!fs.existsSync(path.join(ptyDir, 'package.json'))) {
      const temp = `${ptyDir}.tmp-${process.pid}`;
      fs.rmSync(temp, { recursive: true, force: true });
      fs.cpSync(ptySource, temp, { recursive: true });
      fs.renameSync(temp, ptyDir);
    }
    return { hostScript, ptyDir };
  }

  async function startHost() {
    const { hostScript, ptyDir } = prepareFiles();
    const node = await findNode();
    const env = { ...process.env };
    let command = node;
    if (!command) {
      command = process.execPath;
      env.ELECTRON_RUN_AS_NODE = '1';
    } else {
      delete env.ELECTRON_RUN_AS_NODE;
    }
    const child = spawn(command, [hostScript, '--daemon', ptyDir, pipePath, tokenFile], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env,
    });
    child.unref();
  }

  function onLine(message) {
    if (message.ev === 'data') {
      dataListeners.get(message.id)?.(message.data);
    } else if (message.ev === 'exit') {
      exitListeners.get(message.id)?.(message.code);
    } else if (message.ev === 'created' || message.ev === 'error') {
      const pending = pendingCreates.get(message.id);
      if (pending) {
        pendingCreates.delete(message.id);
        if (message.ev === 'error') pending.reject(new Error(message.message));
        else pending.resolve({ resumed: Boolean(message.resumed), pid: message.pid });
      }
    } else if (message.ev === 'list' || message.ev === 'snapshot') {
      const pending = pendingLists.get(message.req);
      if (pending) {
        pendingLists.delete(message.req);
        pending(message.ev === 'list' ? message.sessions || [] : message);
      }
    }
  }

  function tryConnect() {
    return new Promise((resolve) => {
      const candidate = net.createConnection(pipePath);
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      candidate.setEncoding('utf8');
      let pending = '';
      candidate.on('data', (chunk) => {
        pending += chunk;
        let index;
        while ((index = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, index);
          pending = pending.slice(index + 1);
          if (!line) continue;
          let message;
          try {
            message = JSON.parse(line);
          } catch (_) {
            continue;
          }
          if (message.ev === 'hello') finish(candidate);
          else onLine(message);
        }
      });
      candidate.on('error', () => finish(null));
      candidate.on('close', () => {
        finish(null);
        if (socket === candidate) {
          socket = null;
          // The host is gone, and with it every session it held.
          for (const [id, listener] of [...exitListeners]) listener(-1, id);
          for (const pending of pendingCreates.values()) pending.reject(new Error('Session-Host wurde beendet.'));
          pendingCreates.clear();
          for (const pending of pendingLists.values()) pending([]);
          pendingLists.clear();
        }
      });
      candidate.on('connect', () => {
        candidate.write(JSON.stringify({ op: 'hello', token: fs.readFileSync(tokenFile, 'utf8').trim() }) + '\n');
      });
      setTimeout(() => {
        if (!settled) {
          candidate.destroy();
          finish(null);
        }
      }, 3000);
    });
  }

  async function connect() {
    if (socket) return socket;
    if (connecting) return connecting;
    connecting = (async () => {
      try {
        if (fs.existsSync(tokenFile)) {
          const existing = await tryConnect();
          if (existing) return (socket = existing);
        }
        await startHost();
        for (let attempt = 0; attempt < 40; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          const fresh = await tryConnect();
          if (fresh) return (socket = fresh);
        }
        throw new Error('Session-Host konnte nicht gestartet werden.');
      } finally {
        connecting = null;
      }
    })();
    return connecting;
  }

  function sendMessage(message) {
    if (socket && !socket.destroyed) socket.write(JSON.stringify(message) + '\n');
  }

  // Creates the session, or joins it when it is already running (resumed: true).
  async function create(id, options, onData, onExit) {
    await connect();
    dataListeners.set(id, onData);
    exitListeners.set(id, (code) => {
      dataListeners.delete(id);
      exitListeners.delete(id);
      onExit(code);
    });
    const result = new Promise((resolve, reject) => pendingCreates.set(id, { resolve, reject }));
    sendMessage({ op: 'create', id, ...options });
    return result;
  }

  async function list() {
    try {
      await connect();
    } catch (_) {
      return [];
    }
    const req = ++reqCounter;
    const result = new Promise((resolve) => pendingLists.set(req, resolve));
    sendMessage({ op: 'list', req });
    return Promise.race([result, new Promise((resolve) => setTimeout(() => resolve([]), 3000))]);
  }

  // Only lists when a host is already running; never starts one.
  async function listIfRunning() {
    if (!socket && !fs.existsSync(tokenFile)) return [];
    if (!socket) {
      const existing = await tryConnect();
      if (!existing) return [];
      socket = existing;
    }
    return list();
  }

  // Recent output and size of a running session, or null. Hosts started by an older CodeForge
  // have no 'snapshot' op; for them a 'create' on the existing id returns the same output.
  async function snapshot(id) {
    const sessions = await listIfRunning();
    const info = sessions.find((item) => item.id === id);
    if (!info) return null;
    const req = ++reqCounter;
    const answer = await Promise.race([
      new Promise((resolve) => {
        pendingLists.set(req, resolve);
        sendMessage({ op: 'snapshot', req, id });
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    pendingLists.delete(req);
    if (answer && answer.found) return { buffer: answer.buffer, cols: answer.cols, rows: answer.rows, meta: info.meta || {} };
    if (answer) return null;
    let buffer = '';
    const previous = dataListeners.get(id);
    const previousExit = exitListeners.get(id);
    dataListeners.set(id, (data) => {
      buffer += data;
      previous?.(data);
    });
    const created = new Promise((resolve, reject) => pendingCreates.set(id, { resolve, reject }));
    sendMessage({ op: 'create', id });
    try {
      await Promise.race([created, new Promise((resolve) => setTimeout(resolve, 1500))]);
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (_) {
      // the session ended in between
    }
    if (previous) dataListeners.set(id, previous);
    else dataListeners.delete(id);
    if (previousExit) exitListeners.set(id, previousExit);
    return { buffer, cols: info.cols || 100, rows: info.rows || 30, meta: info.meta || {} };
  }

  return {
    create,
    snapshot,
    list: listIfRunning,
    write: (id, data) => sendMessage({ op: 'write', id, data }),
    resize: (id, cols, rows) => sendMessage({ op: 'resize', id, cols, rows }),
    kill: (id) => sendMessage({ op: 'kill', id }),
    // Stop listening (window closed) without ending the session.
    detach: (id) => {
      dataListeners.delete(id);
      exitListeners.delete(id);
    },
  };
}

module.exports = { createSessionClient };
