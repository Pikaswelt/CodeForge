// Release-Schutz für FancyCode Desktop: verschleiert den Electron-Hauptprozess (electron/*.cjs) in eine Kopie
// unter .protected/electron. electron-builder packt nur diese Kopie ein (package.json → build.files), der
// lesbare Quelltext landet nie im Installer. Läuft automatisch mit `npm run build`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'electron');
const out = path.join(root, '.protected', 'electron');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const options = {
  compact: true,
  target: 'node',
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 10,
  transformObjectKeys: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  sourceMap: false,
  // IPC-Kanäle, Umgebungsvariablen und Pfade bleiben gültig, weil nur Bezeichner/Strings umgeschrieben werden.
  reservedNames: ['^require$', '^module$', '^exports$', '^__dirname$', '^__filename$'],
};
let n = 0;
for (const f of fs.readdirSync(src)) {
  const from = path.join(src, f);
  if (!fs.statSync(from).isFile() || /\.test\.cjs$/.test(f)) continue;
  const to = path.join(out, f);
  if (f.endsWith('.cjs') || f.endsWith('.js')) {
    fs.writeFileSync(to, JavaScriptObfuscator.obfuscate(fs.readFileSync(from, 'utf8'), options).getObfuscatedCode());
    n++;
  } else if (!f.endsWith('.nsh')) fs.copyFileSync(from, to);
}
console.log(`.protected/electron: ${n} Dateien verschleiert`);
