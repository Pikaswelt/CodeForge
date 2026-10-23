// FancyCode Desktop-Plugins: kleiner Katalog vom FancyGames-Server, Installation mit Prüfsumme.
// Ein Plugin ist ein Ordner mit fancy-plugin.json und main.js; der Code läuft im Renderer
// in einem eigenen Worker und bekommt nur die dokumentierte api.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app } = require('electron');
const fancyAccount = require('./fancy-account.cjs');
const { mt } = require('./i18n.cjs');

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const MAX_PLUGIN_BYTES = 512 * 1024;

function pluginRoot() {
  return path.join(app.getPath('userData'), 'plugins');
}

function pluginDir(id) {
  if (!ID_PATTERN.test(String(id || ''))) throw new Error(mt('Ungültige Plugin-ID.'));
  return path.join(pluginRoot(), id);
}

function versionParts(value) {
  return String(value || '0')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => parseInt(part, 10) || 0);
}

function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

async function fetchText(url, what) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(mt('{what} konnte nicht geladen werden (HTTP {status}).', { what, status: response.status }));
  const text = await response.text();
  if (text.length > MAX_PLUGIN_BYTES) throw new Error(mt('{what} ist zu groß.', { what }));
  return text;
}

function catalogBase() {
  const base = fancyAccount.apiBase();
  if (!base) throw new Error(mt('Der Plugin-Katalog ist in dieser Version nicht eingerichtet.'));
  return base.replace(/\/$/, '');
}

function readInstalled(id) {
  const dir = pluginDir(id);
  const manifestPath = path.join(dir, 'fancy-plugin.json');
  const mainPath = path.join(dir, 'main.js');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(mainPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!ID_PATTERN.test(String(manifest.id || '')) || manifest.id !== id) return null;
    let install = {};
    try {
      install = JSON.parse(fs.readFileSync(path.join(dir, 'install.json'), 'utf8'));
    } catch {}
    return {
      id,
      name: String(manifest.name || id),
      version: String(manifest.version || install.version || '0.0.0'),
      description: String(manifest.description || ''),
      author: String(manifest.author || ''),
      minAppVersion: String(manifest.minAppVersion || ''),
      installedAt: Number(install.installedAt) || 0,
    };
  } catch {
    return null;
  }
}

function list() {
  const root = pluginRoot();
  if (!fs.existsSync(root)) return [];
  const entries = [];
  for (const dirent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dirent.isDirectory() || !ID_PATTERN.test(dirent.name)) continue;
    const installed = readInstalled(dirent.name);
    if (installed) entries.push(installed);
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

async function catalog() {
  const base = catalogBase();
  const text = await fetchText(`${base}/plugins/catalog.json`, mt('Der Plugin-Katalog'));
  const data = JSON.parse(text);
  const plugins = Array.isArray(data?.plugins) ? data.plugins : [];
  const clean = plugins
    .filter((entry) => entry && ID_PATTERN.test(String(entry.id || '')) && typeof entry.sha256 === 'string')
    .map((entry) => ({
      id: String(entry.id),
      name: String(entry.name || entry.id),
      version: String(entry.version || '0.0.0'),
      description: String(entry.description || ''),
      author: String(entry.author || ''),
      minAppVersion: String(entry.minAppVersion || ''),
      manifest: String(entry.manifest || ''),
      main: String(entry.main || ''),
      sha256: String(entry.sha256).toLowerCase(),
    }));
  return { base, updated: String(data?.updated || ''), plugins: clean };
}

function resolveUrl(base, value) {
  try {
    return new URL(value, base).toString();
  } catch {
    throw new Error(mt('Plugin-Adresse im Katalog ist ungültig.'));
  }
}

async function install(id) {
  if (!ID_PATTERN.test(String(id || ''))) throw new Error(mt('Ungültige Plugin-ID.'));
  const { base, plugins } = await catalog();
  const entry = plugins.find((plugin) => plugin.id === id);
  if (!entry) throw new Error(mt('Dieses Plugin steht nicht im Katalog.'));
  if (entry.minAppVersion && compareVersions(app.getVersion(), entry.minAppVersion) < 0) {
    throw new Error(mt('Das Plugin braucht FancyCode Desktop {version} oder neuer.', { version: entry.minAppVersion }));
  }
  if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(mt('Für dieses Plugin fehlt eine gültige Prüfsumme.'));

  const [manifestText, mainText] = await Promise.all([
    fetchText(resolveUrl(base, entry.manifest), mt('Das Plugin-Manifest')),
    fetchText(resolveUrl(base, entry.main), mt('Das Plugin')),
  ]);
  const hash = crypto.createHash('sha256').update(mainText).digest('hex');
  if (hash !== entry.sha256) throw new Error(mt('Die Prüfsumme des Downloads stimmt nicht – Installation abgebrochen.'));

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error(mt('Das Plugin-Manifest ist kein gültiges JSON.'));
  }
  if (manifest.id !== entry.id) throw new Error(mt('Das Manifest gehört nicht zu diesem Plugin.'));

  const dir = pluginDir(entry.id);
  const tmp = `${dir}.tmp-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    fs.writeFileSync(path.join(tmp, 'fancy-plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(tmp, 'main.js'), mainText);
    fs.writeFileSync(
      path.join(tmp, 'install.json'),
      JSON.stringify({ version: entry.version, sha256: entry.sha256, installedAt: Date.now() }, null, 2) + '\n',
    );
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return readInstalled(entry.id);
}

function remove(id) {
  const dir = pluginDir(id);
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

function source(id) {
  const file = path.join(pluginDir(id), 'main.js');
  if (!fs.existsSync(file)) throw new Error(mt('Das Plugin ist nicht installiert.'));
  return fs.readFileSync(file, 'utf8');
}

module.exports = { catalog, list, install, remove, source, compareVersions };
