#!/usr/bin/env node
// FancyCode remote MCP server. Runs on the V-Server next to the agent (Claude Code, Codex, agy)
// and forwards questions and notifications to the FancyCode app (desktop or Android).
//
// The app watches ~/.fancycode/ui/events.jsonl over its existing SSH connection and writes the
// answer to ~/.fancycode/ui/answers/<id>.json. No extra port or tunnel is needed.
//
// Agent config:
//   command: node
//   args: ["~/.fancycode/fancycode-remote-mcp.mjs"]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';

const DIR = process.env.FANCYCODE_UI_DIR || path.join(os.homedir(), '.fancycode', 'ui');
const EVENTS = path.join(DIR, 'events.jsonl');
const ANSWERS = path.join(DIR, 'answers');
const VERSION = '1.0.0';

fs.mkdirSync(ANSWERS, { recursive: true });

function log(...parts) {
  process.stderr.write(`[fancycode-mcp] ${parts.join(' ')}\n`);
}

function publish(event) {
  fs.appendFileSync(EVENTS, `${JSON.stringify(event)}\n`, { mode: 0o600 });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value) => ({ content: [{ type: 'text', text: String(value) }] });

// Same limits and option names as the local MCP server (fancycode_ask accepts timeout_seconds).
function answerTimeout(args) {
  const seconds = Number(args.timeout_seconds);
  const millis = Number(args.timeout_ms);
  return Math.max(15_000, Math.min(seconds > 0 ? seconds * 1000 : millis || 600_000, 3_600_000));
}

async function waitForAnswer(id, timeoutMs) {
  const file = path.join(ANSWERS, `${id}.json`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      fs.rmSync(file, { force: true });
      return parsed;
    } catch {
      await sleep(400);
    }
  }
  return { dismissed: true, timedOut: true };
}

function id() {
  return crypto.randomBytes(9).toString('hex');
}

const TOOLS = [
  {
    name: 'fancycode_notify',
    description: 'Shows a short notification in the FancyCode app (desktop or phone).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title' },
        message: { type: 'string', description: 'Optional details' },
        kind: { type: 'string', enum: ['info', 'success', 'warning', 'error'] },
      },
      required: ['title'],
    },
  },
  {
    name: 'fancycode_ask',
    description: 'Asks the user a question in the FancyCode app and waits for the answer.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        details: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        allow_text: { type: 'boolean' },
        timeout_seconds: { type: 'number' },
      },
      required: ['question'],
    },
  },
  {
    name: 'fancycode_form',
    description: 'Shows a small form in the FancyCode app and waits for the values.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        message: { type: 'string' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              label: { type: 'string' },
              type: { type: 'string', enum: ['text', 'textarea', 'number', 'select', 'checkbox'] },
              options: { type: 'array', items: { type: 'string' } },
              placeholder: { type: 'string' },
              required: { type: 'boolean' },
              help: { type: 'string' },
            },
            required: ['name', 'label'],
          },
        },
        submit_label: { type: 'string' },
        timeout_seconds: { type: 'number' },
      },
      required: ['title', 'fields'],
    },
  },
];

async function callTool(name, args = {}) {
  if (name === 'fancycode_notify') {
    publish({
      id: id(),
      type: 'notify',
      title: String(args.title || 'FancyCode').slice(0, 120),
      message: String(args.message || '').slice(0, 4000),
      kind: ['info', 'success', 'warning', 'error'].includes(args.kind) ? args.kind : 'info',
      createdAt: Date.now(),
    });
    return text('Popup gezeigt.');
  }

  if (name === 'fancycode_ask') {
    const eventId = id();
    const timeoutMs = answerTimeout(args);
    publish({
      id: eventId,
      type: 'ask',
      question: String(args.question || '').slice(0, 500),
      message: String(args.details || '').slice(0, 4000),
      options: Array.isArray(args.options) ? args.options.map(String).slice(0, 8) : [],
      allowText: Boolean(args.allow_text),
      timeoutMs,
      createdAt: Date.now(),
    });
    const answer = await waitForAnswer(eventId, timeoutMs);
    if (answer?.timedOut) return text('Keine Antwort (Zeit abgelaufen). Im Chat nachfragen statt zu raten.');
    if (answer?.dismissed) return text('Der Nutzer hat die Frage geschlossen, ohne zu antworten.');
    const value = answer?.answer;
    if (value && typeof value === 'object' && value.dismissed) return text('Der Nutzer hat die Frage geschlossen, ohne zu antworten.');
    if (value && typeof value === 'object') return text(`Antwort: ${JSON.stringify(value)}`);
    return text(`Antwort: ${value ?? ''}`);
  }

  if (name === 'fancycode_form') {
    const eventId = id();
    const timeoutMs = answerTimeout(args);
    const fields = (Array.isArray(args.fields) ? args.fields : []).slice(0, 12).map((field) => ({
      name: String(field?.name || '').slice(0, 60),
      label: String(field?.label || field?.name || '').slice(0, 120),
      type: ['text', 'textarea', 'number', 'select', 'checkbox'].includes(field?.type) ? field.type : 'text',
      options: Array.isArray(field?.options) ? field.options.map(String).slice(0, 20) : [],
      placeholder: String(field?.placeholder || '').slice(0, 200),
      required: Boolean(field?.required),
      help: String(field?.help || '').slice(0, 400),
    })).filter((field) => field.name);
    publish({
      id: eventId,
      type: 'form',
      title: String(args.title || 'Eingabe').slice(0, 120),
      message: String(args.message || '').slice(0, 4000),
      fields,
      submitLabel: String(args.submit_label || 'Senden').slice(0, 40),
      timeoutMs,
      createdAt: Date.now(),
    });
    const answer = await waitForAnswer(eventId, timeoutMs);
    if (answer?.timedOut) return text('Formular nicht abgeschickt (Zeit abgelaufen). Im Chat nachfragen statt zu raten.');
    if (answer?.dismissed) return text('Der Nutzer hat das Formular geschlossen, ohne es abzuschicken.');
    const value = answer?.answer;
    if (value && typeof value === 'object' && value.dismissed) return text('Der Nutzer hat das Formular geschlossen, ohne es abzuschicken.');
    return text(JSON.stringify(value ?? {}, null, 2));
  }

  throw new Error(`Unbekanntes Werkzeug: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  if (!request.id && request.method) return; // notification, nothing to answer
  try {
    if (request.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: request.params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'fancycode-remote', version: VERSION },
        },
      });
      return;
    }
    if (request.method === 'ping') {
      send({ jsonrpc: '2.0', id: request.id, result: {} });
      return;
    }
    if (request.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: request.id, result: { tools: TOOLS } });
      return;
    }
    if (request.method === 'tools/call') {
      const result = await callTool(String(request.params?.name || ''), request.params?.arguments || {});
      send({ jsonrpc: '2.0', id: request.id, result });
      return;
    }
    send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: `Unbekannte Methode: ${request.method}` } });
  } catch (error) {
    log(error.message);
    send({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } });
  }
});
