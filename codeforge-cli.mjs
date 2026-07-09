#!/usr/bin/env node
/**
 * CodeForge CLI – Standalone command-line interface for CodeForge
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

const VERSION = '2.1.0';
const HELP = `
CodeForge CLI v${VERSION} – Terminal-Interface für CodeForge

USAGE:
  codeforge-cli [OPTIONS]

OPTIONS:
  --url <url>         Server-URL (z.B. http://192.168.1.100:8787)
  --token <token>     Authentifizierungs-Token
  --prompt <text>     Prompt an den KI-Agent senden (nicht-interaktiv)
  --provider <id>     KI-Provider wählen (antigravity, openai, anthropic, cursor, opencode, freebuff)
                      Standard: antigravity
  --model <id>        Modell-ID (anbieterspezifisch)
  --project <path>    Projektpfad auf dem Server
  --access <mode>     Zugriffsmodus: read-only, workspace-write, full (Standard: full)
  --interactive, -i   Interaktiver Modus (Chat mit dem Agent)
  --output <format>   Ausgabeformat: raw, clean, summary (Standard: raw)
  --timeout <sec>     Timeout in Sekunden (Standard: 300)
  --version, -v       Version anzeigen
  --help, -h          Diese Hilfe anzeigen

BEISPIELE:
  # Einfacher Prompt
  codeforge-cli --url http://192.168.1.100:8787 --token abc123 --prompt "Erstelle eine TODO-App"

  # Interaktiver Modus mit FreeBuff
  codeforge-cli --url http://192.168.1.100:8787 --token abc123 --provider freebuff -i

  # Schneller Prompt mit Ausgabe-Zusammenfassung
  codeforge-cli --url http://192.168.1.100:8787 --token abc123 --prompt "Fix den Bug in auth.ts" --output summary

UMGEBUNGSVARIABLEN (alternativ zu Flags):
  CODEFORGE_URL      Server-URL
  CODEFORGE_TOKEN    Authentifizierungs-Token
  CODEFORGE_PROVIDER KI-Provider
  CODEFORGE_MODEL    Modell-ID
  CODEFORGE_PROJECT  Projektpfad

Mehr Infos: https://codeforge.dev
`;

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

  // Remove undefined fields
  const cleanBody = JSON.parse(JSON.stringify(body));

  process.stderr.write(`\n  🤖 Sende Prompt an ${config.provider}...\n`);
  process.stderr.write(`  📡 Verbinde mit ${config.url}\n\n`);

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
      process.stderr.write(`\n  ❌ Server-Fehler (${res.status}): ${errText}\n`);
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
      // Strip ANSI codes
      const clean = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
      process.stdout.write(clean || 'Keine Ausgabe.\n');
    } else {
      process.stdout.write(data.output || data.error || 'Keine Ausgabe.\n');
    }

    if (!data.ok) {
      process.stderr.write(`\n  ⚠️  Agent meldete Fehler (Exit ${data.exitCode})\n`);
    } else {
      process.stderr.write(`\n  ✅ Aufgabe abgeschlossen.\n`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      process.stderr.write(`\n  ⏱️  Timeout nach ${config.timeout}s erreicht.\n`);
    } else {
      process.stderr.write(`\n  ❌ Verbindungsfehler: ${err instanceof Error ? err.message : String(err)}\n`);
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

  process.stderr.write('\n');
  process.stderr.write('  ╔══════════════════════════════════════════╗\n');
  process.stderr.write(`  ║   CodeForge CLI v${VERSION}                    ║\n`);
  process.stderr.write(`  ║   Provider: ${config.provider.padEnd(30)}║\n`);
  process.stderr.write(`  ║   Server:   ${config.url.padEnd(30)}║\n`);
  process.stderr.write('  ╚══════════════════════════════════════════╝\n');
  process.stderr.write('\n');
  process.stderr.write('  Tippe deinen Prompt ein (mehrzeilig mit \\ am Zeilenende).\n');
  process.stderr.write('  /help für Befehle, /exit zum Beenden.\n\n');

  while (true) {
    const input = await question('  codeforge> ');

    if (!input.trim()) continue;

    if (input === '/exit' || input === '/quit' || input === '/q') {
      process.stderr.write('\n  👋 Auf Wiedersehen!\n\n');
      break;
    }

    if (input === '/help' || input === '/?') {
      process.stdout.write('\n  Verfügbare Befehle:\n');
      process.stdout.write('    /exit, /quit    – CLI beenden\n');
      process.stdout.write('    /help           – Diese Hilfe\n');
      process.stdout.write('    /status         – Server-Status prüfen\n');
      process.stdout.write('    /provider <id>  – Provider wechseln\n');
      process.stdout.write('    /clear          – Bildschirm leeren\n\n');
      continue;
    }

    if (input === '/status') {
      const healthy = await checkHealth(config.url, config.token);
      process.stdout.write(healthy ? '  ✅ Server ist erreichbar.\n' : '  ❌ Server nicht erreichbar.\n');
      continue;
    }

    if (input.startsWith('/provider ')) {
      const newProvider = input.slice(10).trim();
      const validProviders = ['antigravity', 'openai', 'anthropic', 'cursor', 'opencode', 'freebuff'];
      if (validProviders.includes(newProvider)) {
        config.provider = newProvider;
        process.stdout.write(`  ✅ Provider gewechselt zu: ${newProvider}\n`);
      } else {
        process.stdout.write(`  ❌ Ungültiger Provider. Verfügbar: ${validProviders.join(', ')}\n`);
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
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (args.version) {
    process.stdout.write(`CodeForge CLI v${VERSION}\n`);
    process.exit(0);
  }

  const config = resolveConfig(args);
  const errors = validateConfig(config);

  if (errors.length > 0) {
    process.stderr.write('\n  ❌ Validierungsfehler:\n');
    for (const err of errors) {
      process.stderr.write(`     - ${err}\n`);
    }
    process.stderr.write('\n  Nutze --help für Hilfe.\n\n');
    process.exit(1);
  }

  // Check server health
  const healthy = await checkHealth(config.url, config.token);
  if (!healthy) {
    process.stderr.write(`\n  ⚠️  Server unter ${config.url} antwortet nicht.\n`);
    process.stderr.write('  Stelle sicher, dass der CodeForge-Server läuft und der Token korrekt ist.\n\n');
    process.exit(1);
  }

  process.stderr.write(`  ✅ Verbindung zu ${config.url} erfolgreich.\n`);

  if (config.interactive) {
    await interactiveMode(config);
  } else {
    await sendPrompt(config);
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`\n  ❌ Unerwarteter Fehler: ${err.message}\n\n`);
  process.exit(1);
});
