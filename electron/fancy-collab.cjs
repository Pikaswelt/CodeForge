// FancyAgent-Collab für FancyCode Desktop: meldet die App mit dem FancyServers-Konto als Gerät bei FancyAgent an
// (POST /api/app/session) und speichert das Geräte-Token verschlüsselt. Verbunden ist das Gerät erst nach
// Bestätigung per Popup (in FancyAgent oder hier). Siehe /root/fancyagent/docs/COLLAB.md.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, safeStorage } = require('electron');
const fancyAccount = require('./fancy-account.cjs');

const HUB = process.env.FANCYAGENT_URL || 'https://fancyagent.crazymine.de';

function tokenFile() {
  return path.join(app.getPath('userData'), 'fancyagent-device.bin');
}

function readToken() {
  try {
    const raw = fs.readFileSync(tokenFile());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
  } catch {
    return '';
  }
}

function writeToken(token) {
  const file = tokenFile();
  if (!token) return fs.rmSync(file, { force: true });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : token, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Geräte-Token holen (bei Bedarf neu anmelden). reset = altes Token verwerfen (z. B. nach „getrennt“). */
async function deviceToken({ reset = false } = {}) {
  if (reset) writeToken('');
  const cached = readToken();
  if (cached) return { hub: HUB, token: cached };
  const accountToken = fancyAccount.sessionToken();
  if (!accountToken) return { hub: HUB, token: '', error: 'Bitte zuerst mit deinem FancyServers-Konto anmelden.' };
  const host = os.hostname().replace(/[^\w .-]/g, '').slice(0, 30) || process.platform;
  const res = await fetch(`${HUB}/api/app/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accountToken}` },
    body: JSON.stringify({ app: 'fancycode', name: `FancyCode · ${host}` }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) return { hub: HUB, token: '', error: data.error || `FancyAgent antwortet mit ${res.status}` };
  writeToken(data.token);
  return { hub: HUB, token: data.token };
}

function forget() {
  writeToken('');
}

module.exports = { deviceToken, forget, HUB };
