// SFTP for saved V-Servers. Uses ssh2 (pure JS) instead of the system `sftp`
// binary so the app can list, upload and download without a terminal.
// Connections are cached per V-Server id and closed after a period of inactivity.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('ssh2');

const IDLE_MS = 5 * 60 * 1000;
const connections = new Map();

let dataDir = null;

function init(userDataDir) {
  dataDir = userDataDir;
}

function knownHostsFile() {
  return path.join(dataDir || '.', 'sftp-known-hosts.json');
}

function readKnownHosts() {
  try {
    return JSON.parse(fs.readFileSync(knownHostsFile(), 'utf8')) || {};
  } catch {
    return {};
  }
}

// Trust on first use, like OpenSSH's StrictHostKeyChecking=accept-new: remember the
// fingerprint of a new host, refuse a host whose key changed.
function verifyHostKey(hostId, key) {
  const fingerprint = crypto.createHash('sha256').update(key).digest('base64');
  const known = readKnownHosts();
  if (!known[hostId]) {
    known[hostId] = fingerprint;
    try {
      fs.mkdirSync(path.dirname(knownHostsFile()), { recursive: true });
      fs.writeFileSync(knownHostsFile(), JSON.stringify(known, null, 2));
    } catch (_) {}
    return { ok: true };
  }
  if (known[hostId] === fingerprint) return { ok: true };
  return { ok: false, fingerprint };
}

function validateServer(server = {}) {
  const host = String(server.host || '').trim();
  const user = String(server.user || '').trim();
  const port = Number(server.port || 22);
  if (!host || !/^[a-z0-9._:\[\]-]+$/i.test(host) || host.startsWith('-')) throw new Error('V-Server: Adresse ist ungueltig.');
  if (!user || !/^[a-z0-9._~@-]+$/i.test(user) || user.startsWith('-')) throw new Error('SFTP: Benutzername fehlt oder ist ungueltig.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('V-Server: Port ist ungueltig.');
  const keyPath = String(server.keyPath || '').trim();
  if (keyPath && !fs.existsSync(keyPath)) throw new Error('V-Server: Key-Datei fehlt. Bitte Key neu hochladen.');
  return { host, user, port, keyPath, id: String(server.id || `${user}@${host}:${port}`) };
}

function friendlyError(error, hasKey) {
  const message = String(error?.message || error);
  if (/Encrypted private (OpenSSH )?key detected|passphrase/i.test(message)) {
    return Object.assign(new Error('Der Key ist mit einer Passphrase geschuetzt. Bitte Passphrase eingeben.'), { code: 'NEED_SECRET' });
  }
  if (/All configured authentication methods failed|Authentication failed/i.test(message)) {
    return Object.assign(
      new Error(hasKey ? 'Anmeldung fehlgeschlagen. Key oder Passphrase stimmt nicht.' : 'Anmeldung fehlgeschlagen. Bitte Passwort eingeben.'),
      { code: 'NEED_SECRET' },
    );
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) return new Error('Server nicht gefunden. Adresse pruefen.');
  if (/ECONNREFUSED/i.test(message)) return new Error('Verbindung abgelehnt. Laeuft SSH auf diesem Port?');
  if (/Timed out|ETIMEDOUT/i.test(message)) return new Error('Zeitueberschreitung beim Verbinden.');
  return error instanceof Error ? error : new Error(message);
}

function touch(entry) {
  clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => disconnect(entry.id), IDLE_MS);
}

function disconnect(id) {
  const entry = connections.get(id);
  if (!entry) return false;
  clearTimeout(entry.idleTimer);
  connections.delete(id);
  try {
    entry.client.end();
  } catch (_) {}
  return true;
}

function openConnection(server, secret) {
  const config = validateServer(server);
  return new Promise((resolve, reject) => {
    const client = new Client();
    let hostKeyChanged = false;
    const options = {
      host: config.host,
      port: config.port,
      username: config.user,
      readyTimeout: 15000,
      keepaliveInterval: 20000,
      hostVerifier: (key) => {
        const result = verifyHostKey(`${config.host}:${config.port}`, key);
        if (!result.ok) {
          hostKeyChanged = true;
          return false;
        }
        return true;
      },
    };
    if (config.keyPath) {
      options.privateKey = fs.readFileSync(config.keyPath);
      if (secret) options.passphrase = secret;
    } else if (secret) {
      options.password = secret;
      options.tryKeyboard = true;
    } else {
      return reject(Object.assign(new Error('Kein Key hinterlegt. Bitte Passwort eingeben.'), { code: 'NEED_SECRET' }));
    }
    client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => finish(prompts.map(() => secret || '')));
    client.once('ready', () => {
      client.sftp((err, sftp) => {
        if (err) {
          client.end();
          return reject(friendlyError(err, Boolean(config.keyPath)));
        }
        const entry = { id: config.id, client, sftp, idleTimer: null };
        client.once('close', () => {
          if (connections.get(config.id) === entry) {
            clearTimeout(entry.idleTimer);
            connections.delete(config.id);
          }
        });
        connections.set(config.id, entry);
        touch(entry);
        resolve(entry);
      });
    });
    client.once('error', (err) => {
      if (hostKeyChanged) {
        return reject(new Error('Der Server-Schluessel hat sich geaendert. Verbindung aus Sicherheitsgruenden abgebrochen (moeglicher Angriff oder Server neu installiert).'));
      }
      reject(friendlyError(err, Boolean(config.keyPath)));
    });
    client.connect(options);
  });
}

async function getEntry(server, secret) {
  const id = validateServer(server).id;
  const existing = connections.get(id);
  if (existing) {
    touch(existing);
    return existing;
  }
  return openConnection(server, secret);
}

const call = (sftp, method, ...args) =>
  new Promise((resolve, reject) => {
    sftp[method](...args, (err, result) => (err ? reject(err) : resolve(result)));
  });

function entryType(attrs) {
  if (typeof attrs.isDirectory === 'function' && attrs.isDirectory()) return 'dir';
  if (typeof attrs.isSymbolicLink === 'function' && attrs.isSymbolicLink()) return 'link';
  return 'file';
}

const joinRemote = (dir, name) => (dir === '/' ? `/${name}` : `${dir.replace(/\/+$/, '')}/${name}`);

function cleanRemotePath(value, fallback = '.') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

// Connects (or reuses the cached connection) and returns the home directory.
async function connect(server, secret) {
  const entry = await getEntry(server, secret);
  const home = await call(entry.sftp, 'realpath', '.');
  return { home };
}

async function list(server, remotePath) {
  const entry = await getEntry(server);
  const target = await call(entry.sftp, 'realpath', cleanRemotePath(remotePath));
  const items = await call(entry.sftp, 'readdir', target);
  const entries = [];
  for (const item of items) {
    if (item.filename === '.' || item.filename === '..') continue;
    let type = entryType(item.attrs);
    if (type === 'link') {
      try {
        const real = await call(entry.sftp, 'stat', joinRemote(target, item.filename));
        type = entryType(real);
      } catch (_) {}
    }
    entries.push({
      name: item.filename,
      type,
      size: Number(item.attrs.size || 0),
      modifiedAt: Number(item.attrs.mtime || 0) * 1000,
      mode: item.attrs.mode,
    });
  }
  entries.sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { path: target, entries };
}

async function downloadFile(server, remotePath, localPath, onProgress) {
  const entry = await getEntry(server);
  await new Promise((resolve, reject) => {
    entry.sftp.fastGet(remotePath, localPath, { step: (done, _chunk, total) => onProgress?.(done, total) }, (err) => (err ? reject(err) : resolve()));
  });
}

async function uploadFile(server, localPath, remotePath, onProgress) {
  const entry = await getEntry(server);
  await new Promise((resolve, reject) => {
    entry.sftp.fastPut(localPath, remotePath, { step: (done, _chunk, total) => onProgress?.(done, total) }, (err) => (err ? reject(err) : resolve()));
  });
}

async function mkdirRemote(server, remotePath) {
  const entry = await getEntry(server);
  await call(entry.sftp, 'mkdir', remotePath);
}

async function rename(server, fromPath, toPath) {
  const entry = await getEntry(server);
  await call(entry.sftp, 'rename', fromPath, toPath);
}

async function removeRecursive(sftp, target, depth = 0) {
  if (depth > 40) throw new Error('Verzeichnis zu tief verschachtelt.');
  const stats = await call(sftp, 'lstat', target);
  if (typeof stats.isDirectory === 'function' && stats.isDirectory()) {
    const items = await call(sftp, 'readdir', target);
    for (const item of items) {
      if (item.filename === '.' || item.filename === '..') continue;
      await removeRecursive(sftp, joinRemote(target, item.filename), depth + 1);
    }
    await call(sftp, 'rmdir', target);
  } else {
    await call(sftp, 'unlink', target);
  }
}

async function remove(server, remotePath) {
  const target = String(remotePath || '').trim();
  // Refuse to wipe the root or a top-level system folder by accident.
  if (!target || target === '/' || target === '.' || target === '~' || /^\/[^/]+\/?$/.test(target)) {
    throw new Error('Dieser Pfad kann aus Sicherheitsgruenden nicht geloescht werden.');
  }
  const entry = await getEntry(server);
  await removeRecursive(entry.sftp, target);
}

function disconnectAll() {
  for (const id of [...connections.keys()]) disconnect(id);
}

module.exports = {
  init,
  connect,
  list,
  downloadFile,
  uploadFile,
  mkdirRemote,
  rename,
  remove,
  disconnect,
  disconnectAll,
  joinRemote,
};
