// FancyServers-Konto: ein Login und ein Abo für FancyCode, FancyGames Studio und FancyAgent (Gast mit Einladung, Discord, GitHub).
// Limits und Resets der eingebauten KI zählt der Server pro App (Header x-fg-app).
// und die eingebaute KI, die über diesen Server läuft. Der KI-Key liegt nur auf dem Server.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { app, safeStorage, shell } = require('electron');
const pkg = require('../package.json');
const { mt } = require('./i18n.cjs');

const APP_ID = 'fancycode';

function apiBase() {
  const override = app.isPackaged ? '' : process.env.FANCY_API_URL;
  return (override || pkg.fancyApi || '').replace(/\/$/, '');
}

function requireBase() {
  const base = apiBase();
  if (!base) throw new Error(mt('Der FancyCode-Server ist in dieser Version nicht eingerichtet.'));
  return base;
}

// ---- Sitzungs-Token: verschlüsselt per Schlüsselbund, sonst Datei nur für den Nutzer lesbar ----
function sessionFile(ext) {
  return path.join(app.getPath('userData'), `fancy-session.${ext}`);
}

function writePrivate(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function setSession(token) {
  for (const ext of ['bin', 'txt']) fs.rmSync(sessionFile(ext), { force: true });
  if (!token) return;
  if (safeStorage.isEncryptionAvailable()) writePrivate(sessionFile('bin'), safeStorage.encryptString(token));
  else writePrivate(sessionFile('txt'), token);
}

function getSession() {
  try {
    if (safeStorage.isEncryptionAvailable() && fs.existsSync(sessionFile('bin'))) return safeStorage.decryptString(fs.readFileSync(sessionFile('bin')));
  } catch {}
  try {
    return fs.readFileSync(sessionFile('txt'), 'utf8').trim();
  } catch {
    return '';
  }
}

function grantedFile() {
  return path.join(app.getPath('userData'), 'fancy-access.json');
}

function setGranted(ok) {
  try { writePrivate(grantedFile(), JSON.stringify({ granted: ok, ts: Date.now() })); } catch {}
}

function wasGranted() {
  try { return JSON.parse(fs.readFileSync(grantedFile(), 'utf8')).granted === true; } catch { return false; }
}

// ---- HTTP ----
async function readError(res) {
  try {
    const j = await res.json();
    return j.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function post(pathname, body, opts = {}) {
  const token = opts.auth ? getSession() : '';
  return fetch(requireBase() + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-fg-app': APP_ID, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
    signal: opts.signal || AbortSignal.timeout(opts.timeout || 15000),
  });
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let pendingLogin = null;

function login(provider, invite = '') {
  if (!['discord', 'github'].includes(provider)) throw new Error(mt('Unbekannter Anbieter'));
  const base = requireBase();
  pendingLogin?.cancel();
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return new Promise((resolve, reject) => {
    let done = false;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') return res.writeHead(404).end();
      const code = url.searchParams.get('code') || '';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(mt('<!doctype html><meta charset="utf-8"><body style="background:#09090b;color:#f4f4f5;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Angemeldet ✓</h2><p>Du kannst dieses Fenster schließen und zu FancyCode Desktop zurückkehren.</p></div>'));
      finish(async () => {
        const r = await post('/auth/exchange', { code, verifier });
        if (!r.ok) throw new Error(await readError(r));
        const j = await r.json();
        setSession(j.token);
        setGranted(true);
        return j.user;
      });
    });
    const timer = setTimeout(() => finish(() => Promise.reject(new Error(mt('Anmeldung abgelaufen. Bitte erneut versuchen.')))), 5 * 60_000);
    function finish(fn) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
      pendingLogin = null;
      Promise.resolve().then(fn).then(resolve, reject);
    }
    pendingLogin = { cancel: () => finish(() => Promise.reject(new Error('Anmeldung abgebrochen.'))) };
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const inv = invite ? `&invite=${encodeURIComponent(String(invite).slice(0, 40))}` : '';
      shell.openExternal(`${base}/auth/${provider}/start?challenge=${challenge}&port=${port}${inv}`);
    });
    server.on('error', (e) => finish(() => Promise.reject(e)));
  });
}

async function guest(invite) {
  const r = await post('/auth/guest', { invite: String(invite || '').slice(0, 40) });
  if (!r.ok) throw new Error(await readError(r));
  const j = await r.json();
  setSession(j.token);
  setGranted(true);
  return j.user;
}

async function checkInvite(invite) {
  const r = await post('/auth/invite-check', { invite: String(invite || '').slice(0, 40) });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()).valid === true;
}

async function me() {
  if (!apiBase() || !getSession()) return null;
  const r = await fetch(`${apiBase()}/v1/me`, { headers: { authorization: `Bearer ${getSession()}`, 'x-fg-app': APP_ID }, signal: AbortSignal.timeout(15000) });
  if (r.status === 401) {
    setSession('');
    setGranted(false);
    return null;
  }
  if (!r.ok) throw new Error(await readError(r));
  setGranted(true);
  return r.json();
}

// Die eingebaute KI zählt pro App: fancycode-cli sind die Tokens des FancyCode-Agenten,
// fancycode die Nachrichten des einfachen Chats. Beide Fenster kommen direkt vom Server.
const USAGE_APPS = new Set(['fancycode', 'fancycode-cli', 'fancygames', 'fancyagent']);
const usageApp = (app) => (USAGE_APPS.has(String(app || '')) ? String(app) : APP_ID);

async function usage(app) {
  if (!apiBase()) throw new Error(mt('Der FancyCode-Server ist in dieser Version nicht eingerichtet.'));
  if (!getSession()) throw new Error(mt('Bitte melde dich an, um deine Nutzung zu sehen.'));
  const r = await fetch(`${apiBase()}/v1/usage`, {
    headers: { authorization: `Bearer ${getSession()}`, 'x-fg-app': usageApp(app) },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 401) {
    setSession('');
    setGranted(false);
    throw new Error(mt('Bitte melde dich erneut an.'));
  }
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

// Verbraucht ein Reset-Guthaben der App und setzt beide Nutzungsfenster zurück.
async function resetUsage(app) {
  if (!getSession()) throw new Error(mt('Bitte melde dich an, um dein Limit zurückzusetzen.'));
  const r = await fetch(`${apiBase()}/v1/usage/reset`, {
    method: 'POST',
    headers: { authorization: `Bearer ${getSession()}`, 'x-fg-app': usageApp(app) },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 401) {
    setSession('');
    setGranted(false);
    throw new Error(mt('Bitte melde dich erneut an.'));
  }
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

// Popups vom Betreiber: Hinweise, Geschenke und eine Sperre (Ban-Screen). Die App fragt beim
// Start und danach alle paar Minuten; geschlossene Popups meldet sie über seenAnnouncements.
async function announcements() {
  if (!apiBase() || !getSession()) return { items: [], ban: null };
  const r = await fetch(`${apiBase()}/v1/announcements`, {
    headers: { authorization: `Bearer ${getSession()}`, 'x-fg-app': APP_ID },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 401) {
    setSession('');
    setGranted(false);
    return { items: [], ban: null };
  }
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}

async function seenAnnouncements(ids) {
  const list = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string').slice(0, 50);
  if (!apiBase() || !getSession() || !list.length) return true;
  const r = await post('/v1/announcements/seen', { ids: list }, { auth: true });
  return r.ok;
}

async function logout() {
  if (getSession()) await post('/auth/logout', {}, { auth: true }).catch(() => {});
  setSession('');
  setGranted(false);
  return true;
}

// Eingebaute KI: Antwort-Stream vom Server vollständig einlesen.
async function chat(system, messages) {
  const r = await post('/v1/chat', { messages, context: system ? String(system).slice(0, 12000) : undefined }, { auth: true, timeout: 180000 });
  if (r.status === 401) throw new Error(mt('Bitte melde dich an, um die eingebaute KI zu nutzen.'));
  if (!r.ok) throw new Error(await readError(r));
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  for await (const chunk of r.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try {
        const ev = JSON.parse(line.slice(5));
        if (ev.type === 'content_block_delta' && ev.delta?.text) text += ev.delta.text;
      } catch {}
    }
  }
  return { text, tokens: 0 };
}

module.exports = { apiBase, login, guest, checkInvite, me, usage, resetUsage, announcements, seenAnnouncements, logout, chat, wasGranted, sessionToken: getSession, cancelLogin: () => pendingLogin?.cancel() };
