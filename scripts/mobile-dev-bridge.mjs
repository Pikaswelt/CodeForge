#!/usr/bin/env node
// Development bridge for the Android UI: serves the CodeForgeNative plugin API over a
// WebSocket so the mobile app can run in a desktop browser (npm run mobile:dev) against a
// real V-Server. Same behaviour as the native plugin, implemented with ssh2.
// Listens on 127.0.0.1 only. Not part of the APK.

import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import ssh2 from 'ssh2';

const { Client, utils } = ssh2;
const PORT = Number(process.env.CODEFORGE_BRIDGE_PORT || 8790);
const DATA_DIR = process.env.CODEFORGE_BRIDGE_DIR || path.join(homedir(), '.codeforge-mobile-dev');
const KEY_DIR = path.join(DATA_DIR, 'ssh-keys');
const HOSTS_FILE = path.join(DATA_DIR, 'known-hosts.json');
mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });

const sessions = new Map(); // server id -> { client, signature, sftp }
const shells = new Map(); // channelId -> { stream, serverId, closedByUser }

class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const readHosts = () => {
  try {
    return JSON.parse(readFileSync(HOSTS_FILE, 'utf8'));
  } catch {
    return {};
  }
};

function keyFile(keyId) {
  if (!/^[a-z0-9-]{1,64}$/.test(String(keyId || ''))) throw new BridgeError('INVALID', 'Ungueltige Key-ID.');
  return path.join(KEY_DIR, keyId);
}

function friendly(error, hasKey) {
  const message = String(error?.message || error);
  if (/All configured authentication methods failed|Authentication failed/i.test(message)) {
    return new BridgeError('NEED_SECRET', hasKey ? 'Anmeldung fehlgeschlagen. Key oder Passphrase stimmt nicht.' : 'Anmeldung fehlgeschlagen. Bitte Passwort pruefen.');
  }
  if (/Encrypted private (OpenSSH )?key detected|passphrase/i.test(message)) {
    return new BridgeError('NEED_SECRET', 'Der Key ist mit einer Passphrase geschuetzt. Bitte Passphrase eingeben.');
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) return new BridgeError('NETWORK', 'Server nicht gefunden. Adresse pruefen.');
  if (/ECONNREFUSED/i.test(message)) return new BridgeError('NETWORK', 'Verbindung abgelehnt. Laeuft SSH auf diesem Port?');
  if (/Timed out|ETIMEDOUT/i.test(message)) return new BridgeError('NETWORK', 'Zeitueberschreitung beim Verbinden. Internetverbindung pruefen.');
  return error instanceof BridgeError ? error : new BridgeError('SSH', message);
}

function config(server = {}) {
  const host = String(server.host || '').trim();
  const user = String(server.user || '').trim();
  const port = Number(server.port || 22);
  if (!host || !/^[a-z0-9._:\[\]-]+$/i.test(host) || host.startsWith('-')) throw new BridgeError('INVALID', 'V-Server: Adresse ist ungueltig.');
  if (!user || !/^[a-z0-9._~@-]+$/i.test(user) || user.startsWith('-')) throw new BridgeError('INVALID', 'V-Server: Benutzername fehlt oder ist ungueltig.');
  let privateKey = null;
  if (server.keyId) {
    const file = keyFile(server.keyId);
    if (!existsSync(file)) throw new BridgeError('NO_KEY', 'V-Server: Key fehlt auf diesem Geraet. Bitte Key neu hinterlegen.');
    privateKey = readFileSync(file, 'utf8');
  }
  const id = String(server.id || `${user}@${host}:${port}`);
  return { id, host, port, user, privateKey, secret: server.secret || '' };
}

function session(server) {
  const cfg = config(server);
  const signature = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.privateKey ? createHash('sha1').update(cfg.privateKey).digest('hex') : ''}`;
  const existing = sessions.get(cfg.id);
  if (existing && existing.signature === signature) return existing.ready.then(() => existing);
  if (existing) disconnect(cfg.id);
  if (!cfg.privateKey && !cfg.secret) return Promise.reject(new BridgeError('NEED_SECRET', 'Kein Key hinterlegt. Bitte Passwort eingeben.'));
  if (cfg.privateKey) {
    const parsed = utils.parseKey(cfg.privateKey, cfg.secret || undefined);
    if (parsed instanceof Error) {
      return Promise.reject(/passphrase|encrypted/i.test(parsed.message)
        ? new BridgeError('NEED_SECRET', 'Der Key ist mit einer Passphrase geschuetzt. Bitte Passphrase eingeben.')
        : new BridgeError('INVALID_KEY', `Der Key konnte nicht gelesen werden: ${parsed.message}`));
    }
  }
  const client = new Client();
  const entry = { client, signature, sftp: null, ready: null };
  let changed = false;
  entry.ready = new Promise((resolve, reject) => {
    const hostId = `${cfg.host}:${cfg.port}`;
    client.once('ready', resolve);
    client.once('error', (error) => {
      sessions.delete(cfg.id);
      reject(changed
        ? new BridgeError('HOSTKEY_CHANGED', 'Der Server-Schluessel hat sich geaendert. Verbindung aus Sicherheitsgruenden abgebrochen (moeglicher Angriff oder Server neu installiert).')
        : friendly(error, Boolean(cfg.privateKey)));
    });
    client.on('close', () => {
      if (sessions.get(cfg.id) === entry) sessions.delete(cfg.id);
    });
    client.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => finish(prompts.map(() => cfg.secret)));
    client.connect({
      host: cfg.host,
      port: cfg.port,
      username: cfg.user,
      readyTimeout: 15000,
      keepaliveInterval: 20000,
      ...(cfg.privateKey ? { privateKey: cfg.privateKey, passphrase: cfg.secret || undefined } : { password: cfg.secret, tryKeyboard: true }),
      hostVerifier: (key) => {
        const fingerprint = createHash('sha256').update(key).digest('base64');
        const hosts = readHosts();
        if (!hosts[hostId]) {
          hosts[hostId] = fingerprint;
          writeFileSync(HOSTS_FILE, JSON.stringify(hosts, null, 2));
          return true;
        }
        if (hosts[hostId] === fingerprint) return true;
        changed = true;
        return false;
      },
    });
  });
  sessions.set(cfg.id, entry);
  return entry.ready.then(() => entry);
}

function disconnect(id) {
  const entry = sessions.get(id);
  sessions.delete(id);
  try {
    entry?.client.end();
  } catch {}
}

async function sftp(server) {
  const entry = await session(server);
  if (entry.sftp) return entry.sftp;
  entry.sftp = await new Promise((resolve, reject) => entry.client.sftp((error, channel) => (error ? reject(friendly(error)) : resolve(channel))));
  entry.sftp.on('close', () => {
    entry.sftp = null;
  });
  return entry.sftp;
}

const call = (channel, method, ...args) =>
  new Promise((resolve, reject) => channel[method](...args, (error, result) => (error ? reject(sftpError(error)) : resolve(result))));

function sftpError(error) {
  if (error?.code === 2) return new BridgeError('NOT_FOUND', 'Datei oder Ordner nicht gefunden.');
  if (error?.code === 3) return new BridgeError('DENIED', 'Keine Berechtigung.');
  if (error?.code === 4) return new BridgeError('SFTP', 'Aktion fehlgeschlagen (existiert der Name schon oder ist der Ordner nicht leer?).');
  return new BridgeError('SFTP', String(error?.message || error));
}

const joinRemote = (dir, name) => (dir === '/' ? `/${name}` : `${dir.replace(/\/+$/, '')}/${name}`);

async function removeRecursive(channel, target, depth = 0) {
  if (depth > 40) throw new BridgeError('SFTP', 'Verzeichnis zu tief verschachtelt.');
  const stats = await call(channel, 'lstat', target);
  if (stats.isDirectory()) {
    for (const item of await call(channel, 'readdir', target)) await removeRecursive(channel, joinRemote(target, item.filename), depth + 1);
    await call(channel, 'rmdir', target);
  } else {
    await call(channel, 'unlink', target);
  }
}

function publicKeyOf(privateKey, passphrase) {
  const parsed = utils.parseKey(privateKey, passphrase);
  if (parsed instanceof Error) return null;
  const key = Array.isArray(parsed) ? parsed[0] : parsed;
  return `${key.type} ${key.getPublicSSH().toString('base64')} codeforge-android`;
}

let emit = () => {};

const methods = {
  async saveKey({ keyId, privateKey }) {
    if (!/PRIVATE KEY/.test(privateKey || '')) throw new BridgeError('INVALID_KEY', 'Das ist kein privater SSH-Key (erwartet z.B. id_ed25519 oder id_rsa, nicht die .pub-Datei).');
    const parsed = utils.parseKey(privateKey);
    const encrypted = parsed instanceof Error && /passphrase|encrypted/i.test(parsed.message);
    if (parsed instanceof Error && !encrypted) throw new BridgeError('INVALID_KEY', `Der Key konnte nicht gelesen werden: ${parsed.message}`);
    writeFileSync(keyFile(keyId), privateKey.replace(/\r\n/g, '\n').replace(/\n*$/, '\n'), { mode: 0o600 });
    return { encrypted, publicKey: encrypted ? null : publicKeyOf(privateKey) };
  },
  async generateKey({ keyId, comment }) {
    const pair = utils.generateKeyPairSync('ed25519', { comment: comment || 'codeforge-android' });
    writeFileSync(keyFile(keyId), pair.private, { mode: 0o600 });
    return { publicKey: pair.public.trim() };
  },
  async getPublicKey({ keyId, passphrase }) {
    const publicKey = publicKeyOf(readFileSync(keyFile(keyId), 'utf8'), passphrase);
    if (!publicKey) throw new BridgeError('NEED_SECRET', 'Der Key ist mit einer Passphrase geschuetzt.');
    return { publicKey };
  },
  async deleteKey({ keyId }) {
    rmSync(keyFile(keyId), { force: true });
    return { deleted: true };
  },
  async forgetHost({ host, port }) {
    const hosts = readHosts();
    delete hosts[`${host}:${port}`];
    writeFileSync(HOSTS_FILE, JSON.stringify(hosts, null, 2));
  },
  async connect({ server }) {
    const channel = await sftp(server);
    const home = await call(channel, 'realpath', '.');
    const cfg = config(server);
    return { home, fingerprint: `SHA256:${readHosts()[`${cfg.host}:${cfg.port}`] || ''}` };
  },
  async disconnect({ id }) {
    disconnect(id);
  },
  async isConnected({ id }) {
    return { connected: sessions.has(id) };
  },
  async exec({ server, command, stdin, timeoutMs = 30000, outputLimit = 2_000_000 }) {
    const entry = await session(server);
    return new Promise((resolve, reject) => {
      entry.client.exec(command, (error, stream) => {
        if (error) return reject(friendly(error));
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
          stream.close();
          reject(new BridgeError('TIMEOUT', 'Der Befehl hat zu lange gedauert.'));
        }, timeoutMs);
        stream.on('data', (chunk) => {
          if (stdout.length < outputLimit) stdout += chunk.toString('utf8');
        });
        stream.stderr.on('data', (chunk) => {
          if (stderr.length < outputLimit) stderr += chunk.toString('utf8');
        });
        stream.on('close', (code) => {
          clearTimeout(timer);
          resolve({ exitCode: typeof code === 'number' ? code : -1, stdout, stderr });
        });
        if (stdin) stream.write(stdin);
        stream.end();
      });
    });
  },
  async openShell({ server, channelId, command, cols, rows }) {
    await methods.closeShell({ channelId });
    const entry = await session(server);
    const serverId = config(server).id;
    await new Promise((resolve, reject) => {
      entry.client.exec(command, { pty: { term: 'xterm-256color', cols: Math.max(cols, 20), rows: Math.max(rows, 5) } }, (error, stream) => {
        if (error) return reject(friendly(error));
        const shell = { stream, serverId, closedByUser: false };
        shells.set(channelId, shell);
        const decoder = new TextDecoder('utf-8');
        let exitCode = -1;
        stream.on('exit', (code) => {
          if (typeof code === 'number') exitCode = code;
        });
        stream.on('data', (chunk) => emit('shellData', { channelId, data: decoder.decode(chunk, { stream: true }) }));
        stream.on('close', () => {
          if (shells.get(channelId) === shell) shells.delete(channelId);
          const lost = !shell.closedByUser && !sessions.has(serverId);
          emit('shellExit', { channelId, code: exitCode, lost });
        });
        resolve();
      });
    });
  },
  async write({ channelId, data }) {
    const shell = shells.get(channelId);
    if (!shell) return { ok: false };
    shell.stream.write(data);
    return { ok: true };
  },
  async resize({ channelId, cols, rows }) {
    const shell = shells.get(channelId);
    if (!shell) return { ok: false };
    shell.stream.setWindow(Math.max(rows, 5), Math.max(cols, 20), 0, 0);
    return { ok: true };
  },
  async closeShell({ channelId }) {
    const shell = shells.get(channelId);
    if (!shell) return;
    shell.closedByUser = true;
    shells.delete(channelId);
    shell.stream.close();
  },
  async sftpList({ server, path: remotePath }) {
    const channel = await sftp(server);
    const target = await call(channel, 'realpath', remotePath || '.');
    const entries = [];
    for (const item of await call(channel, 'readdir', target)) {
      let type = item.attrs.isDirectory() ? 'dir' : item.attrs.isSymbolicLink() ? 'link' : 'file';
      if (type === 'link') {
        try {
          type = (await call(channel, 'stat', joinRemote(target, item.filename))).isDirectory() ? 'dir' : 'file';
        } catch {
          type = 'file';
        }
      }
      entries.push({ name: item.filename, type, size: Number(item.attrs.size || 0), modifiedAt: Number(item.attrs.mtime || 0) * 1000, mode: item.attrs.mode });
    }
    entries.sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return { path: target, entries };
  },
  async sftpMkdir({ server, path: remotePath }) {
    await call(await sftp(server), 'mkdir', remotePath);
  },
  async sftpRename({ server, from, to }) {
    await call(await sftp(server), 'rename', from, to);
  },
  async sftpDelete({ server, path: remotePath }) {
    const target = String(remotePath || '').trim();
    if (!target || target === '/' || target === '.' || target === '~' || /^\/[^/]+\/?$/.test(target)) {
      throw new BridgeError('DENIED', 'Dieser Pfad kann aus Sicherheitsgruenden nicht geloescht werden.');
    }
    await removeRecursive(await sftp(server), target);
  },
  async sftpReadText({ server, path: remotePath, maxBytes = 2_000_000 }) {
    const channel = await sftp(server);
    const stats = await call(channel, 'stat', remotePath);
    if (stats.size > maxBytes) throw new BridgeError('TOO_LARGE', 'Die Datei ist zu gross fuer den Editor.');
    return { content: (await call(channel, 'readFile', remotePath)).toString('utf8') };
  },
  async sftpWriteText({ server, path: remotePath, content }) {
    await call(await sftp(server), 'writeFile', remotePath, Buffer.from(content, 'utf8'));
  },
  async sftpUploadData({ server, remoteDir, name, data, transferId }) {
    const buffer = Buffer.from(data, 'base64');
    await call(await sftp(server), 'writeFile', joinRemote(remoteDir, name.replace(/[\\/]/g, '_')), buffer);
    emit('transfer', { transferId, name, done: buffer.length, total: buffer.length });
  },
  async sftpDownloadData({ server, path: remotePath }) {
    const buffer = await call(await sftp(server), 'readFile', remotePath);
    return { name: remotePath.split('/').pop(), data: buffer.toString('base64') };
  },
};

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
const clients = new Set();
emit = (event, data) => {
  const payload = JSON.stringify({ event, data });
  for (const client of clients) if (client.readyState === 1) client.send(payload);
};

wss.on('connection', (socket) => {
  clients.add(socket);
  socket.on('close', () => clients.delete(socket));
  socket.on('message', async (raw) => {
    let request;
    try {
      request = JSON.parse(String(raw));
    } catch {
      return;
    }
    const handler = methods[request.method];
    try {
      if (!handler) throw new BridgeError('UNIMPLEMENTED', `Unbekannte Methode ${request.method}`);
      const result = await handler(request.args || {});
      socket.send(JSON.stringify({ id: request.id, result: result ?? null }));
    } catch (error) {
      socket.send(JSON.stringify({ id: request.id, error: { code: error.code || 'ERROR', message: error.message || String(error) } }));
    }
  });
});

console.log(`CodeForge mobile dev bridge on ws://127.0.0.1:${PORT} (data: ${DATA_DIR}) [${randomUUID().slice(0, 8)}]`);
