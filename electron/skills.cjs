// Mitgelieferte Skills (resources/skills/<id>/SKILL.md) für FancyCode und andere Harnesses.
// Eingeschaltete Skills werden in die Skill-Ordner der Harnesses kopiert, ausgeschaltete wieder entfernt.
// Angefasst werden nur Ordner mit unserer Markierung – gleichnamige eigene Skills des Nutzers bleiben unberührt.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { mt } = require('./i18n.cjs');

const MARKER = '.fancycode-managed';
const ID_PATTERN = /^fancycode-[a-z0-9-]{1,40}$/;

// plugin: erscheint als mitgeliefertes Plugin (eigener Schalter), sonst in der Skill-Liste.
const BUILTIN = {
  'fancycode-minecraft': { title: 'Minecraft Hub', plugin: true, defaultOn: false, icon: 'minecraft' },
  'fancycode-desktop': { title: 'FancyCode Desktop', defaultOn: true },
  'fancycode-debug': { title: 'Fehlersuche', defaultOn: true },
  'fancycode-review': { title: 'Code-Review', defaultOn: true },
  'fancycode-git': { title: 'Git & Pull Requests', defaultOn: true },
  'fancycode-server': { title: 'Server & Deploy', defaultOn: true },
};

function fancycodeHome(home) {
  if (process.env.FANCYCODE_HOME) return process.env.FANCYCODE_HOME;
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'fancycode');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'fancycode');
}

// Harness → Konfigurationsordner (muss existieren, sonst ist die Harness nicht installiert) und Skill-Ordner darin.
function targets(home = os.homedir()) {
  return [
    { id: 'fancycode', label: 'FancyCode', roots: [fancycodeHome(home)], always: true },
    { id: 'claude', label: 'Claude Code', roots: [path.join(home, '.claude')] },
    { id: 'opencode', label: 'OpenCode', roots: [path.join(home, '.config', 'opencode')] },
    { id: 'codex', label: 'Codex', roots: [path.join(home, '.agents'), path.join(home, '.codex')], skillsIn: [path.join(home, '.agents')] },
    { id: 'gemini', label: 'Gemini CLI / Antigravity', roots: [path.join(home, '.gemini'), path.join(home, '.gemini', 'antigravity')] },
  ];
}

function sourceDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'skills') : path.join(__dirname, '..', 'resources', 'skills');
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'skills.json');
}

function readSettings() {
  try {
    const data = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return { enabled: data.enabled || {}, targets: data.targets || {} };
  } catch {
    return { enabled: {}, targets: {} };
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const meta = {};
  for (const line of (match ? match[1] : '').split(/\r?\n/)) {
    const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (m) meta[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return meta;
}

function bundled() {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(sourceDir(), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue;
    const file = path.join(sourceDir(), entry.name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const info = BUILTIN[entry.name] || {};
    out.push({
      id: entry.name,
      title: info.title || entry.name,
      description: String(frontmatter(text).description || ''),
      plugin: Boolean(info.plugin),
      defaultOn: Boolean(info.defaultOn),
      text,
    });
  }
  return out;
}

const isEnabled = (settings, skill) => (skill.id in settings.enabled ? Boolean(settings.enabled[skill.id]) : skill.defaultOn);

function detected(target) {
  return target.always || target.roots.some((root) => fs.existsSync(root));
}

// Standard: jede installierte Harness bekommt die Skills, bis der Nutzer sie abwählt.
const targetOn = (settings, target) => (target.id in settings.targets ? Boolean(settings.targets[target.id]) : detected(target));

function skillDirsOf(target) {
  return (target.skillsIn || target.roots).filter((root) => target.always || fs.existsSync(root)).map((root) => path.join(root, 'skills'));
}

function installInto(dir, skill) {
  const target = path.join(dir, skill.id);
  if (fs.existsSync(target) && !fs.existsSync(path.join(target, MARKER))) return 'eigener';
  const tmp = `${target}.tmp-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(path.join(sourceDir(), skill.id), tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, MARKER), `FancyCode Desktop ${app.getVersion()}\n`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(tmp, target);
  return 'ok';
}

function removeFrom(dir, id) {
  const target = path.join(dir, id);
  if (fs.existsSync(path.join(target, MARKER))) fs.rmSync(target, { recursive: true, force: true });
}

// Bringt alle Skill-Ordner auf den Stand der Einstellungen. Läuft beim Start und nach jeder Änderung.
function sync() {
  const settings = readSettings();
  const skills = bundled();
  const conflicts = [];
  for (const target of targets()) {
    const on = targetOn(settings, target) && detected(target);
    for (const dir of skillDirsOf(target)) {
      for (const skill of skills) {
        try {
          if (on && isEnabled(settings, skill)) {
            fs.mkdirSync(dir, { recursive: true });
            if (installInto(dir, skill) === 'eigener') conflicts.push(`${target.label}: ${skill.id}`);
          } else removeFrom(dir, skill.id);
        } catch (error) {
          conflicts.push(`${target.label}: ${skill.id} (${error.message})`);
        }
      }
    }
  }
  return conflicts;
}

function state() {
  const settings = readSettings();
  const conflicts = sync();
  return {
    skills: bundled().map(({ text, ...skill }) => ({ ...skill, enabled: isEnabled(settings, skill) })),
    targets: targets().map((target) => ({ id: target.id, label: target.label, detected: detected(target), enabled: targetOn(settings, target) })),
    conflicts,
  };
}

function setSkill(id, enabled) {
  if (!bundled().some((skill) => skill.id === id)) throw new Error(mt('Diesen Skill gibt es nicht.'));
  const settings = readSettings();
  settings.enabled[id] = Boolean(enabled);
  writeSettings(settings);
  return state();
}

function setTarget(id, enabled) {
  if (!targets().some((target) => target.id === id)) throw new Error(mt('Diese Harness gibt es nicht.'));
  const settings = readSettings();
  settings.targets[id] = Boolean(enabled);
  writeSettings(settings);
  return state();
}

const shq = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

// Shell-Skript für einen V-Server: gleiche Ordner relativ zu $HOME, nur Harnesses, die dort installiert sind.
// Je Skill ein Aufruf, damit die Befehlszeile auch unter Windows kurz genug bleibt.
function remoteScripts() {
  const settings = readSettings();
  const roots = ['.config/fancycode', '.claude', '.config/opencode', '.agents', '.gemini', '.gemini/antigravity'];
  return bundled().map((skill) => {
    const on = isEnabled(settings, skill);
    const body = Buffer.from(skill.text).toString('base64');
    const lines = [`for R in ${roots.map((root) => `"$HOME/${root}"`).join(' ')}; do`, '  [ -d "$R" ] || continue', `  T="$R/skills/${skill.id}"`];
    if (on) {
      lines.push(
        `  if [ ! -e "$T" ] || [ -f "$T/${MARKER}" ]; then`,
        `    mkdir -p "$T" && echo ${shq(body)} | base64 -d > "$T/SKILL.md" && echo ${shq(`FancyCode Desktop ${app.getVersion()}`)} > "$T/${MARKER}"`,
        '  fi',
      );
    } else lines.push(`  [ -f "$T/${MARKER}" ] && rm -rf "$T"`);
    lines.push('done', 'true');
    return { id: skill.id, script: `bash -c "$(echo ${Buffer.from(lines.join('\n')).toString('base64')} | base64 -d)"` };
  });
}

module.exports = { state, sync, setSkill, setTarget, remoteScripts, fancycodeHome };
