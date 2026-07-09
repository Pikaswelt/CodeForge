#!/usr/bin/env node
/**
 * ⚔️ CodeForge CLI — コードフォージ ☆ 君のコードを完全にする！
 *
 * Usage:
 *   npx codeforge-cli --url http://server:8787 --token YOUR_TOKEN --prompt "Your prompt"
 *   npx codeforge-cli --url http://server:8787 --token YOUR_TOKEN --interactive
 *
 * Install globally:
 *   npm install -g codeforge-cli
 */

import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

const VERSION = '2.2.1';

// ── ANSI Colors ──────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  pink: '\x1b[38;5;213m',
  cyan: '\x1b[38;5;51m',
  gold: '\x1b[38;5;220m',
  purple: '\x1b[38;5;141m',
  green: '\x1b[38;5;120m',
  red: '\x1b[38;5;203m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  sparkle: '\x1b[38;5;225m',
  sakura: '\x1b[38;5;218m',
};

const BANNER = `
${C.pink}  ╔══════════════════════════════════════════════════════════╗
  ║${C.reset}  ${C.sparkle}☆ﾟ.*･｡ﾟ${C.pink}  ＣＯＤＥＦＯＲＧＥ  ＣＬＩ  ${C.sparkle}☆ﾟ.*･｡ﾟ${C.pink}    ║
  ║${C.reset}  ${C.sakura}⚔️  コードフォージ — 君のコードを完全にする！${C.pink}  ║
  ╚══════════════════════════════════════════════════════════╝${C.reset}`;

const HELP = `
${C.pink}╔══════════════════════════════════════════════════════════════╗
║${C.reset}  ${C.sparkle}☆ﾟ.*･｡ CodeForge CLI v${VERSION} ｡･*.ﾟ☆${C.pink}                    ║
╚══════════════════════════════════════════════════════════════╝${C.reset}

${C.gold}USAGE:${C.reset}
  codeforge-cli [OPTIONS]

${C.gold}OPTIONS:${C.reset}
  --url <url>         Server-URL (z.B. http://192.168.1.100:8787)
  --token <token>     Authentifizierungs-Token 🔑
  --prompt <text>     Prompt an deinen KI-Senpai senden ✨
  --provider <id>     KI-Provider wählen:
                      ${C.cyan}antigravity${C.reset}, ${C.green}openai${C.reset}, ${C.purple}anthropic${C.reset}, cursor, opencode, ${C.gold}freebuff${C.reset}
                      Standard: ${C.cyan}antigravity${C.reset}
  --model <id>        Modell-ID (anbieterspezifisch)
  --project <path>    Projektpfad auf dem Server
  --access <mode>     Zugriffsmodus: read-only, workspace-write, full
                      Standard: full
  --interactive, -i   Interaktiver Modus (Chat mit dem Agent) 💬
  --output <format>   Ausgabeformat: raw, clean, summary
  --timeout <sec>     Timeout in Sekunden (Standard: 300)
  --version, -v       Version anzeigen
  --help, -h          Diese Hilfe anzeigen

${C.gold}BEISPIELE:${C.reset}
  # Einfacher Prompt
  ${C.dim}codeforge-cli --url http://192.168.1.100:8787 --token abc123 --prompt \"Erstelle eine TODO-App\"${C.reset}

  # Interaktiver Modus mit FreeBuff-chan ✨
  ${C.dim}codeforge-cli --url http://192.168.1.100:8787 --token abc123 --provider freebuff -i${C.reset}

  # Schneller Prompt mit Ausgabe-Zusammenfassung
  ${C.dim}codeforge-cli --url http://192.168.1.100:8787 --token abc123 --prompt \"Fix den Bug in auth.ts\" --output summary${C.reset}

${C.gold}UMGEBUNGSVARIABLEN:${C.reset}
  CODEFORGE_URL      Server-URL
  CODEFORGE_TOKEN    Authentifizierungs-Token
  CODEFORGE_PROVIDER KI-Provider
  CODEFORGE_MODEL    Modell-ID
  CODEFORGE_PROJECT  Projektpfad

${C.sakura}Mehr Infos: https://codeforge.dev${C.reset}
`;

const PROVIDER_LABELS = {
  antigravity: `${C.cyan}Antigravity${C.reset}`,
  openai: `${C.green}Codex${C.reset}`,
  anthropic: `${C.purple}Claude${C.reset}`,
  cursor: 'Cursor',
  opencode: 'OpenCode',
  freebuff: `${C.gold}FreeBuff-chan${C.reset}`,
};

function parseArgs() {
  const args = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--version' || arg === '-v') {
      args.version = true;
    } else if (arg === '--interactive' || arg === '-i') {
      args.interactive = true;
    } else if (arg.startsWith('--') && i + 1 < raw.length && !raw[i + 1].startsWith('--')) {
      args[arg.slice(2)] = raw[++i];
    } else if (arg.startsWith('--')) {
      args[arg.slice(2)] = 'true';
    }
  }
  return args;
}

function resolveConfig(args) {
  return {
    url: String(args.url || process.env.CODEFORGE_URL || ''),
    token: String(args.token || process.env.CODEFORGE_TOKEN || ''),
    prompt: String(args.prompt || ''),
    provider: String(args.provider || process.env.CODEFORGE_PROVIDER || 'antigravity'),
    model: String(args.model || process.env.CODEFORGE_MODEL || ''),
    project: String(args.project || process.env.CODEFORGE_PROJECT || ''),
    access: String(args.access || 'full'),
    output: String(args.output || 'raw'),
    timeout: parseInt(String(args.timeout || '300'), 10),
    interactive: Boolean(args.interactive),
    help: Boolean(args.help),
    version: Boolean(args.version),
  };
}

function validateConfig(config) {
  const errors = [];
  if (!config.url) errors.push('--url ist erforderlich (oder CODEFORGE_URL setzen)');
  if (!config.token) errors.push('--token ist erforderlich (oder CODEFORGE_TOKEN setzen)');
  if (!config.interactive && !config.prompt) errors.push('--prompt oder --interactive ist erforderlich');

  const validProviders = ['antigravity', 'openai', 'anthropic', 'cursor', 'opencode', 'freebuff'];
  if (!validProviders.includes(config.provider)) {
    errors.push(`--provider muss einer von sein: ${validProviders.join(', ')}`);
  }

  const validAccess = ['read-only', 'workspace-write', 'full'];
  if (!validAccess.includes(config.access)) {
    errors.push(`--access muss einer von sein: ${validAccess.join(', ')}`);
  }

  return errors;
}

async function checkHealth(url, token) {
  try {
    const res = await fetch(`${url}/discover`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendPrompt(config) {
  const runId = randomUUID();

  const body = {
    provider: config.provider,
    model: config.model || undefined,
    prompt: config.prompt,
    projectPath: config.project || undefined,
    access: config.access,
    systemPrompt: '',
    reasoningEffort: 'medium',
    outputLimit: 50000,
  };

  const cleanBody = JSON.parse(JSON.stringify(body));

  const label = PROVIDER_LABELS[config.provider] || config.provider;
  process.stderr.write(`\n  ${C.sparkle}✨${C.reset} ${label} ${C.dim}arbeitet an deinem Prompt...${C.reset}\n`);
  process.stderr.write(`  ${C.pink}📡${C.reset} ${C.dim}Verbinde mit${C.reset} ${C.cyan}${config.url}${C.reset}\n\n`);

  try {
    const res = await fetch(`${config.url}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(cleanBody),
      signal: AbortSignal.timeout(config.timeout * 1000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      process.stderr.write(`\n  ${C.red}💢 Server-Fehler${C.reset} (${res.status}): ${errText}\n`);
      process.exit(1);
    }

    const data = await res.json();

    if (config.output === 'summary') {
      const text = data.output || data.error || '';
      const lines = text.split('\n').filter(Boolean);
      const summary = lines.slice(-10).join('\n');
      process.stdout.write(summary || 'Keine Ausgabe.\n');
    } else if (config.output === 'clean') {
      const text = data.output || data.error || '';
      const clean = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
      process.stdout.write(clean || 'Keine Ausgabe.\n');
    } else {
      process.stdout.write(data.output || data.error || 'Keine Ausgabe.\n');
    }

    if (!data.ok) {
      process.stderr.write(`\n  ${C.red}💢 Senpai meldete Fehler${C.reset} (Exit ${data.exitCode})\n`);
    } else {
      process.stderr.write(`\n  ${C.green}✨✨ 完了！Aufgabe erledigt! ✨✨${C.reset}\n`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      process.stderr.write(`\n  ${C.gold}⏰ Timeout nach ${config.timeout}s${C.reset} — Senpai braucht zu lange...\n`);
    } else {
      process.stderr.write(`\n  ${C.red}💔 Verbindungsfehler:${C.reset} ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exit(1);
  }
}

async function interactiveMode(config) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const question = (prompt) =>
    new Promise((resolve) => rl.question(prompt, resolve));

  process.stderr.write(BANNER);
  process.stderr.write('\n');
  process.stderr.write(`  ${C.sakura}Provider:${C.reset} ${PROVIDER_LABELS[config.provider] || config.provider}\n`);
  process.stderr.write(`  ${C.cyan}Server:${C.reset}   ${config.url}\n`);
  process.stderr.write('\n');
  process.stderr.write(`  ${C.dim}Tippe deinen Prompt ein, Senpai!${C.reset} ✨\n`);
  process.stderr.write(`  ${C.dim}/help für Befehle, /exit zum Beenden${C.reset}\n\n`);

  while (true) {
    const input = await question(`  ${C.pink}forge${C.reset}${C.gold}〉${C.reset} `);

    if (!input.trim()) continue;

    if (input === '/exit' || input === '/quit' || input === '/q') {
      process.stderr.write(`\n  ${C.sakura}またね、Senpai! 👋✨${C.reset}\n\n`);
      break;
    }

    if (input === '/help' || input === '/?') {
      process.stdout.write(`\n  ${C.gold}Verfügbare Befehle:${C.reset}\n`);
      process.stdout.write(`    /exit, /quit    – ${C.dim}Tschüss sagen${C.reset}\n`);
      process.stdout.write(`    /help           – ${C.dim}Diese Hilfe${C.reset}\n`);
      process.stdout.write(`    /status         – ${C.dim}Server-Status prüfen${C.reset}\n`);
      process.stdout.write(`    /provider <id>  – ${C.dim}Provider wechseln${C.reset}\n`);
      process.stdout.write(`    /clear          – ${C.dim}Bildschirm leeren${C.reset}\n`);
      process.stdout.write(`    /nyaa           – ${C.sakura}にゃー！${C.reset}\n\n`);
      continue;
    }

    if (input === '/nyaa') {
      process.stdout.write(`  ${C.sakura}にゃー！CodeForge-chan ist bereit, Senpai! ٩(◕‿◕｡)۶${C.reset}\n`);
      continue;
    }

    if (input === '/status') {
      const healthy = await checkHealth(config.url, config.token);
      process.stdout.write(healthy
        ? `  ${C.green}✨ Server ist erreichbar!${C.reset}\n`
        : `  ${C.red}💔 Server nicht erreichbar...${C.reset}\n`);
      continue;
    }

    if (input.startsWith('/provider ')) {
      const newProvider = input.slice(10).trim();
      const validProviders = ['antigravity', 'openai', 'anthropic', 'cursor', 'opencode', 'freebuff'];
      if (validProviders.includes(newProvider)) {
        config.provider = newProvider;
        process.stdout.write(`  ${C.green}✨ Provider gewechselt zu:${C.reset} ${PROVIDER_LABELS[newProvider] || newProvider}\n`);
      } else {
        process.stdout.write(`  ${C.red}💢 Ungültiger Provider. Verfügbar:${C.reset} ${validProviders.join(', ')}\n`);
      }
      continue;
    }

    if (input === '/clear') {
      process.stdout.write('\x1b[2J\x1b[H');
      continue;
    }

    config.prompt = input;
    await sendPrompt(config);
    process.stdout.write('\n');
  }

  rl.close();
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    process.stdout.write(BANNER);
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (args.version) {
    process.stdout.write(`${C.sparkle}CodeForge CLI v${VERSION}${C.reset} ${C.sakura}☆ 君のコードを完全にする！${C.reset}\n`);
    process.exit(0);
  }

  const config = resolveConfig(args);
  const errors = validateConfig(config);

  if (errors.length > 0) {
    process.stderr.write(`\n  ${C.red}💢 Validierungsfehler:${C.reset}\n`);
    for (const err of errors) {
      process.stderr.write(`     ${C.red}✗${C.reset} ${err}\n`);
    }
    process.stderr.write(`\n  ${C.dim}Nutze --help für Hilfe.${C.reset}\n\n`);
    process.exit(1);
  }

  const healthy = await checkHealth(config.url, config.token);
  if (!healthy) {
    process.stderr.write(`\n  ${C.red}💔 Server unter ${config.url} antwortet nicht...${C.reset}\n`);
    process.stderr.write(`  ${C.dim}Stelle sicher, dass der CodeForge-Server läuft und der Token korrekt ist.${C.reset}\n\n`);
    process.exit(1);
  }

  process.stderr.write(`\n  ${C.green}✨ Verbindung zu ${config.url} erfolgreich!${C.reset}\n`);

  if (config.interactive) {
    await interactiveMode(config);
  } else {
    await sendPrompt(config);
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`\n  ${C.red}💢 Unerwarteter Fehler:${C.reset} ${err.message}\n\n`);
  process.exit(1);
});
