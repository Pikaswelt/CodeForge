#!/usr/bin/env node
// Regression check for the Linux setup paths that ship the remote server without a checkout.
//
// It verifies three things that were silently broken before:
//   1. every embedded copy (src/components/serverCode.ts, codeforge-connect-debian.sh,
//      server-setup-codeforge.sh) decodes to exactly the current codeforge-remote-server.mjs,
//   2. the shell scripts are LF-only, so bash does not fail on stray CR characters,
//   3. the command the app prints for a Linux server is valid shell.
//
// Run with: node scripts/check-remote-server-embedding.mjs   (also part of CI)
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const failures = [];
const fail = (message) => {
  failures.push(message);
  console.error(`FAIL  ${message}`);
};
const ok = (message) => console.log(`ok    ${message}`);

// The generator writes LF; a Windows checkout (core.autocrlf=true) hands us CRLF. Compare neutral.
const toLf = (text) => text.replace(/\r\n?/g, '\n');
const source = toLf(readFileSync('codeforge-remote-server.mjs', 'utf8'));
const shellScripts = readdirSync('.').filter((name) => name.endsWith('.sh'));

function checkDecoded(label, decoded) {
  if (decoded === source) ok(`${label} entspricht codeforge-remote-server.mjs`);
  else fail(`${label} weicht von codeforge-remote-server.mjs ab (node scripts/embed-remote-server.mjs ausfuehren)`);
}

// 1. src/components/serverCode.ts (gzip + base64)
const serverCode = readFileSync('src/components/serverCode.ts', 'utf8');
const serverCodeMatch = serverCode.match(/REMOTE_SERVER_BASE64 = '([A-Za-z0-9+/=]+)'/);
if (!serverCodeMatch) fail('src/components/serverCode.ts: REMOTE_SERVER_BASE64 fehlt');
else checkDecoded('serverCode.ts', gunzipSync(Buffer.from(serverCodeMatch[1], 'base64')).toString('utf8'));

// 2. the setup scripts (plain base64) and their line endings
for (const fileName of ['codeforge-connect-debian.sh', 'server-setup-codeforge.sh']) {
  const text = readFileSync(fileName, 'utf8');
  const match = text.match(/REMOTE_SERVER_B64="([A-Za-z0-9+/=]*)"|REMOTE_SERVER_B64="([\s\S]*?)"/);
  const encoded = match && (match[1] || match[2]);
  if (!encoded) fail(`${fileName}: REMOTE_SERVER_B64 fehlt`);
  else checkDecoded(fileName, Buffer.from(encoded, 'base64').toString('utf8'));
  if (/\r/.test(text)) fail(`${fileName} enthaelt CR-Zeichen (bash bricht unter Linux ab)`);
}

// 3. every shell script must parse, including the command the app prints for Linux
for (const fileName of shellScripts) {
  if (/\r/.test(readFileSync(fileName, 'utf8'))) fail(`${fileName} enthaelt CR-Zeichen`);
  try {
    execFileSync('bash', ['-n', fileName], { stdio: 'pipe' });
    ok(`${fileName} ist gueltiges bash`);
  } catch (error) {
    fail(`${fileName} ist kein gueltiges bash: ${String(error.stderr || error.message).trim()}`);
  }
}

const modal = readFileSync('src/components/MobileConnectModal.tsx', 'utf8');
const start = modal.indexOf("if (os === 'linux') {");
const terminator = 'codeforge-remote-server.mjs`;';
const end = modal.indexOf(terminator, start);
if (start < 0 || end < 0) {
  fail('MobileConnectModal.tsx: Linux-Befehl nicht gefunden');
} else {
  const block = modal.slice(start, end + terminator.length);
  // The slice ends at the return statement, so the closing brace of the if-block is appended.
  const command = new Function('os', 'REMOTE_SERVER_BASE64', `${block}\n}\nreturn null;`)('linux', 'PLACEHOLDER');
  try {
    execFileSync('bash', ['-n'], { input: command, stdio: ['pipe', 'pipe', 'pipe'] });
    ok('Der Linux-Befehl der App ist gueltiges bash');
  } catch (error) {
    fail(`Der Linux-Befehl der App ist kein gueltiges bash: ${String(error.stderr || error.message).trim()}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} Problem(e) gefunden.`);
  process.exit(1);
}
console.log('\nAlles in Ordnung.');
