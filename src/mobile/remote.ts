import { Native, type NativeServer } from './native';
import type { MobileServer } from './types';

// Commands that run on the V-Server. Kept in step with electron/main.cjs so a session started
// on the PC can be continued on the phone and the other way round (same tmux names).

export const SESSION_ID_PATTERN = /^[a-z0-9-]{1,80}$/i;
export const AGY_ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
export const TMUX_NAME_PATTERN = /^cf-[a-z0-9-]{1,90}$/i;

export function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function base64Utf8(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function tmuxNameFor(tabId: string, agyAccountId?: string) {
  return agyAccountId ? `cf-agy-${agyAccountId}` : `cf-t-${tabId}`;
}

// V-Server tabs run inside tmux on the server: they survive a lost connection, a locked phone
// and a closed app, and opening the tab again re-attaches. Antigravity accounts use one tmux
// session per account (cf-agy-<id>), each with its own HOME so the agy logins stay separate.
export function buildRemoteSessionCommand({ tmuxName, agyAccountId, startCommand, cwd }: {
  tmuxName: string;
  agyAccountId?: string;
  startCommand?: string;
  cwd?: string;
}) {
  if (!TMUX_NAME_PATTERN.test(tmuxName)) throw new Error('Ungueltiger Session-Name.');
  if (agyAccountId && !AGY_ACCOUNT_ID_PATTERN.test(agyAccountId)) throw new Error('Ungueltige Antigravity-Account-ID.');
  let inner = 'export COLORTERM=truecolor; ';
  if (agyAccountId) {
    // The login profile runs first so PATH (e.g. ~/.local/bin) still finds agy; git/npm keep the real config.
    const dir = `$R/.codeforge-agy/${agyAccountId}`;
    inner += `R=$HOME; export GIT_CONFIG_GLOBAL=$R/.gitconfig NPM_CONFIG_USERCONFIG=$R/.npmrc; mkdir -p ${dir} && chmod 700 $R/.codeforge-agy; export HOME=${dir}; cd $R; `;
  }
  if (cwd) {
    // "~" means the real home, also in agy account sessions where HOME points to the profile.
    const home = '"${R:-$HOME}"';
    const target = cwd === '~' ? home : cwd.startsWith('~/') ? `${home}/${shellQuote(cwd.slice(2))}` : shellQuote(cwd);
    inner += `cd -- ${target} 2>/dev/null; `;
  }
  if (startCommand) inner += `${startCommand}; `;
  inner += 'exec bash -i';
  const script = [
    `S=${tmuxName}`,
    'if command -v tmux >/dev/null 2>&1; then',
    // No status bar; mouse on so swiping scrolls tmux's history.
    '  if tmux has-session -t "=$S" 2>/dev/null || tmux new-session -d -s "$S" -x 200 -y 50 bash -lc ' + shellQuote(inner) + '; then',
    '    tmux set -t "$S" status off >/dev/null 2>&1; tmux set -t "$S" mouse on >/dev/null 2>&1',
    '    exec tmux attach -t "=$S"',
    '  fi',
    'fi',
    `exec bash -lc ${shellQuote(inner)}`,
  ].join('\n');
  return `bash -c "$(echo ${base64Utf8(script)} | base64 -d)"`;
}

// ── Secrets (passwords / key passphrases) live in memory only ──

const secrets = new Map<string, string>();

export function setSecret(serverId: string, secret: string) {
  if (secret) secrets.set(serverId, secret);
  else secrets.delete(serverId);
}

export function hasSecret(serverId: string) {
  return secrets.has(serverId);
}

export function nativeServer(server: MobileServer): NativeServer {
  return {
    id: server.id,
    host: server.host,
    port: server.port || 22,
    user: server.user,
    keyId: server.keyId || undefined,
    secret: secrets.get(server.id),
  };
}

export async function run(server: MobileServer, command: string, options: { stdin?: string; timeoutMs?: number } = {}) {
  return Native.exec({ server: nativeServer(server), command, stdin: options.stdin, timeoutMs: options.timeoutMs ?? 30000 });
}

export async function listTmuxSessions(server: MobileServer) {
  const result = await run(server, "tmux ls -F '#S|#{session_activity}|#{session_attached}' 2>/dev/null | grep '^cf-' || true", { timeoutMs: 15000 });
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, activity, attached] = line.split('|');
      return { name, lastActivity: Number(activity || 0) * 1000, attached: Number(attached || 0) };
    });
}

export async function killTmuxSession(server: MobileServer, tmuxName: string) {
  if (!TMUX_NAME_PATTERN.test(tmuxName)) return false;
  await run(server, `tmux kill-session -t '=${tmuxName}' 2>/dev/null || true`, { timeoutMs: 15000 });
  return true;
}

export type ServerStats = { load: string; memory: string; disk: string; uptime: string; hostname: string; tools: Record<string, boolean> };

export async function serverStats(server: MobileServer): Promise<ServerStats> {
  // Sent on stdin so no quoting is needed; -l loads the login profile (PATH with ~/.local/bin).
  const script = [
    'echo "H=$(hostname)"',
    'echo "U=$(uptime -p 2>/dev/null || uptime)"',
    'echo "L=$(cut -d" " -f1-3 /proc/loadavg 2>/dev/null)"',
    `printf 'M='; free -m 2>/dev/null | awk '/^Mem:/ {printf "%d/%d MB", $3, $2}'; echo`,
    `printf 'D='; df -h / 2>/dev/null | awk 'NR==2 {printf "%s/%s (%s)", $3, $2, $5}'; echo`,
    'for t in tmux claude codex agy git node; do if command -v $t >/dev/null 2>&1; then echo "T=$t=1"; else echo "T=$t=0"; fi; done',
  ].join('\n');
  const result = await run(server, 'bash -l -s', { stdin: `${script}\n`, timeoutMs: 20000 });
  const stats: ServerStats = { load: '', memory: '', disk: '', uptime: '', hostname: '', tools: {} };
  for (const line of result.stdout.split(/\r?\n/)) {
    const [key, ...rest] = line.split('=');
    const value = rest.join('=').trim();
    if (key === 'H') stats.hostname = value;
    if (key === 'U') stats.uptime = value.replace(/^up\s+/, '');
    if (key === 'L') stats.load = value;
    if (key === 'M') stats.memory = value;
    if (key === 'D') stats.disk = value;
    if (key === 'T') {
      const [tool, installed] = value.split('=');
      stats.tools[tool] = installed === '1';
    }
  }
  return stats;
}

// Adds the phone's public key to ~/.ssh/authorized_keys (run over a password login).
export async function installPublicKey(server: MobileServer, publicKey: string) {
  const line = publicKey.trim();
  if (!/^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp\d+) [A-Za-z0-9+/=]+( .*)?$/.test(line)) throw new Error('Ungueltiger Public Key.');
  const command = `umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && (grep -qxF ${shellQuote(line)} ~/.ssh/authorized_keys || printf '%s\\n' ${shellQuote(line)} >> ~/.ssh/authorized_keys) && echo OK`;
  const result = await run(server, command, { timeoutMs: 20000 });
  if (!result.stdout.includes('OK')) throw new Error(result.stderr.trim() || 'Key konnte nicht eingetragen werden.');
}

// File list of a project folder on the server, used as context for API chats.
export async function projectFiles(server: MobileServer, root: string) {
  const command = `cd -- ${shellQuote(root)} && find . -maxdepth 6 \\( -name node_modules -o -name .git -o -name dist -o -name build -o -name .venv -o -name __pycache__ \\) -prune -o -type f -print 2>/dev/null | head -n 400`;
  const result = await run(server, command, { timeoutMs: 20000 });
  return result.stdout.split(/\r?\n/).map((line) => line.replace(/^\.\//, '').trim()).filter(Boolean);
}

export async function gitBranch(server: MobileServer, root: string) {
  const result = await run(server, `cd -- ${shellQuote(root)} 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null`, { timeoutMs: 10000 });
  return result.exitCode === 0 ? result.stdout.trim() : '';
}
