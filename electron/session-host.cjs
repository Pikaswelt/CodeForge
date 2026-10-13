'use strict';
// CodeForge session host: owns the terminal processes (PTYs) so they keep running while
// CodeForge is closed, restarted or updated. CodeForge talks to it over a local pipe
// (newline-delimited JSON) and re-attaches to running sessions by id.
//
// Started by CodeForge as:  node session-host.cjs <node-pty dir> <pipe path> <token file>
// With --daemon it re-spawns itself detached and exits, so the host is not part of
// CodeForge's process tree (CodeForge tree-kills itself on quit).

const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

const PROTOCOL = 1;
const MAX_BUFFER = 512 * 1024;
const IDLE_EXIT_MS = 60 * 1000;

const args = process.argv.slice(2);
if (args[0] === '--daemon') {
  const child = spawn(process.execPath, [__filename, ...args.slice(1)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  process.exit(0);
}

const [ptyDir, pipePath, tokenFile] = args;
const pty = require(ptyDir);
const token = fs.readFileSync(tokenFile, 'utf8').trim();

// id -> { proc, meta, buffer, cols, rows }
const sessions = new Map();
const clients = new Set();
let idleTimer = null;

function send(socket, message) {
  if (!socket.destroyed && socket.authed) socket.write(JSON.stringify(message) + '\n');
}

function broadcast(message) {
  for (const socket of clients) send(socket, message);
}

function scheduleIdleExit() {
  clearTimeout(idleTimer);
  if (sessions.size > 0 || clients.size > 0) return;
  idleTimer = setTimeout(() => {
    if (sessions.size === 0 && clients.size === 0) process.exit(0);
  }, IDLE_EXIT_MS);
}

function createSession(socket, msg) {
  const existing = sessions.get(msg.id);
  if (existing) {
    // Already running: hand the new client the recent output so its screen matches.
    send(socket, { ev: 'created', id: msg.id, resumed: true, pid: existing.proc.pid });
    if (existing.buffer) send(socket, { ev: 'data', id: msg.id, data: existing.buffer });
    if (msg.cols && msg.rows) resize(existing, msg.cols, msg.rows);
    return;
  }
  let proc;
  try {
    proc = pty.spawn(msg.file, msg.args || [], {
      name: 'xterm-256color',
      cols: msg.cols || 100,
      rows: msg.rows || 30,
      cwd: msg.cwd,
      env: msg.env,
      useConpty: true,
    });
  } catch (error) {
    send(socket, { ev: 'error', id: msg.id, message: error.message });
    return;
  }
  const session = { proc, meta: msg.meta || {}, buffer: '', cols: msg.cols || 100, rows: msg.rows || 30 };
  sessions.set(msg.id, session);
  clearTimeout(idleTimer);
  proc.onData((data) => {
    session.buffer += data;
    if (session.buffer.length > MAX_BUFFER) session.buffer = session.buffer.slice(-MAX_BUFFER);
    broadcast({ ev: 'data', id: msg.id, data });
  });
  proc.onExit(({ exitCode }) => {
    if (sessions.get(msg.id) === session) sessions.delete(msg.id);
    broadcast({ ev: 'exit', id: msg.id, code: exitCode });
    scheduleIdleExit();
  });
  send(socket, { ev: 'created', id: msg.id, resumed: false, pid: proc.pid });
}

function resize(session, cols, rows) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) return;
  if (session.cols === cols && session.rows === rows) return;
  try {
    session.proc.resize(cols, rows);
    session.cols = cols;
    session.rows = rows;
  } catch (_) {}
}

function handle(socket, msg) {
  if (!socket.authed) {
    if (msg.op === 'hello' && msg.token === token) {
      socket.authed = true;
      send(socket, { ev: 'hello', protocol: PROTOCOL, pid: process.pid });
    } else {
      socket.destroy();
    }
    return;
  }
  const session = msg.id ? sessions.get(msg.id) : null;
  switch (msg.op) {
    case 'create':
      createSession(socket, msg);
      break;
    case 'write':
      if (session) session.proc.write(msg.data);
      break;
    case 'resize':
      if (session) resize(session, msg.cols, msg.rows);
      break;
    case 'kill':
      if (session) {
        try {
          session.proc.kill();
        } catch (_) {}
      }
      break;
    case 'list':
      send(socket, {
        ev: 'list',
        req: msg.req,
        sessions: [...sessions].map(([id, item]) => ({ id, pid: item.proc.pid, meta: item.meta, cols: item.cols, rows: item.rows })),
      });
      break;
    case 'snapshot':
      // Recent output plus size, so a reader (the MCP server) can render the current screen.
      send(socket, {
        ev: 'snapshot',
        req: msg.req,
        id: msg.id,
        found: Boolean(session),
        buffer: session ? session.buffer : '',
        cols: session ? session.cols : 0,
        rows: session ? session.rows : 0,
      });
      break;
    default:
      break;
  }
}

const server = net.createServer((socket) => {
  socket.setEncoding('utf8');
  clients.add(socket);
  clearTimeout(idleTimer);
  let pending = '';
  socket.on('data', (chunk) => {
    pending += chunk;
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, index);
      pending = pending.slice(index + 1);
      if (!line) continue;
      try {
        handle(socket, JSON.parse(line));
      } catch (_) {}
    }
  });
  const drop = () => {
    clients.delete(socket);
    scheduleIdleExit();
  };
  socket.on('close', drop);
  socket.on('error', drop);
});

server.on('error', (error) => {
  // Another host already serves this pipe: nothing to do.
  if (error.code === 'EADDRINUSE') process.exit(0);
  process.exit(1);
});

if (process.platform !== 'win32') {
  try {
    fs.unlinkSync(pipePath);
  } catch (_) {}
}
server.listen(pipePath, () => {
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(pipePath, 0o600);
    } catch (_) {}
  }
  scheduleIdleExit();
});
