// Live-Arbeit im Team (FancyAgent-Hub) für FancyCode Desktop:
// - Terminal teilen (andere schauen nur zu) und geteilte Terminals ansehen
// - FancyCode-Agent-Session teilen: alle sehen live mit, Aufträge brauchen die Bestätigung des Besitzers (Popup)
// - Datei live gemeinsam bearbeiten (CodeMirror + Yjs, Cursor der anderen über Awareness)
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { EditorView, basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { Compartment } from '@codemirror/state';
import { languages } from '@codemirror/language-data';
import { yCollab } from 'y-codemirror.next';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { currentTeam, setTeamHooks } from './team';

const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const client = () => currentTeam()?.client ?? null;
const COLORS = ['#3b82f6', '#ec4868', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#ef4444'];

// ------------------------------------------------------------------ Fenster (schwebendes Panel)

function panel(title: string, onClose: () => void) {
  const wrap = document.createElement('div');
  wrap.className = 'fsc-root fc-live-panel';
  wrap.innerHTML = `<div class="fc-live-head"><b></b><span class="fc-live-info"></span><span class="fc-live-actions"></span><button class="fsc-icon-btn" title="Schließen">×</button></div><div class="fc-live-body"></div>`;
  wrap.querySelector('b')!.textContent = title;
  wrap.querySelector('.fc-live-head > button')!.addEventListener('click', () => {
    wrap.remove();
    onClose();
  });
  document.body.appendChild(wrap);
  return {
    el: wrap,
    body: wrap.querySelector<HTMLElement>('.fc-live-body')!,
    info: wrap.querySelector<HTMLElement>('.fc-live-info')!,
    actions: wrap.querySelector<HTMLElement>('.fc-live-actions')!,
  };
}

function button(label: string, onClick: () => void, primary = false) {
  const b = document.createElement('button');
  b.className = `fsc-btn${primary ? ' fsc-btn-primary' : ''}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// ------------------------------------------------------------------ Terminal teilen

const sharedTerms = new Map<string, { project: number; stop: () => void }>();
export const isTerminalShared = (tabId: string) => sharedTerms.has(tabId);

export function shareTerminal(project: number, tabId: string, title: string) {
  const c = client();
  if (!c?.approved) throw new Error('Erst mit FancyAgent verbinden (Bereich „Team“).');
  const sid = tabId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || `t${Date.now()}`;
  c.send({ t: 'term-share', project, sid, title });
  let buf = '';
  let timer: any = null;
  const flush = () => {
    timer = null;
    if (buf) c.send({ t: 'term-data', project, sid, data: buf });
    buf = '';
  };
  const off = window.agentWorkspace?.onShellOutput?.(tabId, (p: any) => {
    if (p.type !== 'stdout' && p.type !== 'stderr') return;
    buf += p.text;
    if (buf.length > 32_000) flush();
    else if (!timer) timer = setTimeout(flush, 60);
  });
  const stop = () => {
    off?.();
    c.send({ t: 'term-stop', project, sid });
    sharedTerms.delete(tabId);
  };
  sharedTerms.set(tabId, { project, stop });
  return stop;
}

export function stopTerminal(tabId: string) {
  sharedTerms.get(tabId)?.stop();
}

function watchTerminal(t: { project: number; sid: string; title: string; owner: any }) {
  const c = client();
  if (!c) return;
  const p = panel(`▶ ${t.title}`, () => {
    off();
    c.send({ t: 'term-leave', project: t.project, sid: t.sid });
    term.dispose();
  });
  p.info.textContent = `Terminal von ${t.owner?.name ?? '?'} · nur zuschauen`;
  const term = new Terminal({ disableStdin: true, convertEol: true, fontSize: 12.5, theme: { background: '#0b0b0d' }, scrollback: 5000 });
  term.open(p.body);
  const off = c.on('term-data', (m: any) => {
    if (m.project !== t.project || m.sid !== t.sid) return;
    if (m.replay) term.reset();
    if (m.data) term.write(m.data);
    if (m.ended) term.write('\r\n\x1b[90m— Teilen beendet —\x1b[0m\r\n');
  });
  c.send({ t: 'term-join', project: t.project, sid: t.sid });
}

// ------------------------------------------------------------------ Agent-Session teilen

type AgentShare = { project: number; doc: string; sessionId: string; stop: () => void };
const agentShares = new Map<string, AgentShare>();
const sessions = new Map<string, { title: string; last: number }>();
let watchingHarness = false;

/** Merkt sich laufende FancyCode-Sessions (für die Auswahl beim Teilen). */
export function trackHarnessSessions() {
  if (watchingHarness || !window.fancycode?.onEvent) return;
  watchingHarness = true;
  window.fancycode.onEvent((id: string, ev: any) => {
    const s = sessions.get(id) ?? { title: 'FancyCode-Session', last: 0 };
    s.last = Date.now();
    if (ev?.type === 'state' && ev.cwd) s.title = `FancyCode · ${String(ev.cwd).split(/[\\/]/).pop()}`;
    sessions.set(id, s);
  });
}
export const harnessSessions = () => [...sessions.entries()].sort((a, b) => b[1].last - a[1].last).map(([id, s]) => ({ id, ...s }));

export function shareAgentSession(project: number, sessionId: string, title: string) {
  const c = client();
  if (!c?.approved) throw new Error('Erst mit FancyAgent verbinden (Bereich „Team“).');
  const doc = `agent/${sessionId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
  c.subscribe(project);
  c.joinDoc(project, doc, { kind: 'agent-session', title });
  let text = '';
  let timer: any = null;
  const push = (entry: unknown) => c.send({ t: 'doc-op', project, doc, op: JSON.stringify(entry) });
  const flushText = () => {
    timer = null;
    if (text) push({ k: 'text', text });
    text = '';
  };
  const off = window.fancycode!.onEvent((id: string, ev: any) => {
    if (id !== sessionId || !ev) return;
    if (ev.type === 'text') {
      text += ev.text ?? ev.delta ?? '';
      if (!timer) timer = setTimeout(flushText, 400);
      return;
    }
    flushText();
    if (ev.type === 'tool_use') push({ k: 'tool', name: ev.name, summary: String(ev.summary ?? ev.input?.command ?? ev.input?.path ?? '').slice(0, 300) });
    else if (ev.type === 'tool_result') push({ k: 'result', ok: !ev.is_error, text: String(ev.summary ?? ev.output ?? '').slice(0, 500) });
    else if (ev.type === 'user' || ev.type === 'prompt') push({ k: 'prompt', text: String(ev.text ?? '').slice(0, 2000) });
    else if (ev.type === 'turn_end' || ev.type === 'done') push({ k: 'end' });
    else if (ev.type === 'error') push({ k: 'error', text: String(ev.message ?? ev.error ?? '').slice(0, 500) });
  });
  const stop = () => {
    off();
    c.leaveDoc(project, doc);
    agentShares.delete(sessionId);
  };
  agentShares.set(sessionId, { project, doc, sessionId, stop });
  return stop;
}

/** Angenommener Team-Auftrag → als Prompt in die geteilte Session. */
function runAgentTask(t: { project: number; doc: string; text: string; from: any }) {
  const share = [...agentShares.values()].find((s) => s.project === t.project && s.doc === t.doc);
  if (!share) return;
  client()?.send({ t: 'doc-op', project: t.project, doc: t.doc, op: JSON.stringify({ k: 'prompt', text: t.text, by: t.from?.name }) });
  window.fancycode?.send(share.sessionId, { type: 'prompt', text: `[Auftrag von ${t.from?.name ?? 'Team'}] ${t.text}` });
}

function watchAgentSession(d: { project: number; doc: string; title: string }) {
  const c = client();
  if (!c) return;
  const p = panel(`🤖 ${d.title}`, () => {
    offs.forEach((f) => f());
    c.leaveDoc(d.project, d.doc);
  });
  p.info.textContent = 'Geteilte Agent-Session · live';
  const log = document.createElement('div');
  log.className = 'fc-agent-log';
  p.body.appendChild(log);
  let current: HTMLElement | null = null;
  const add = (cls: string, text: string) => {
    const el = document.createElement('div');
    el.className = `fc-agent-${cls}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };
  const apply = (raw: string) => {
    let e: any;
    try {
      e = JSON.parse(raw);
    } catch {
      return;
    }
    if (e.k === 'text') {
      if (!current) current = add('text', '');
      current.textContent += e.text;
      log.scrollTop = log.scrollHeight;
      return;
    }
    current = null;
    if (e.k === 'prompt') add('prompt', `${e.by ? `${e.by}: ` : ''}${e.text}`);
    else if (e.k === 'tool') add('tool', `⚙ ${e.name}${e.summary ? ` · ${e.summary}` : ''}`);
    else if (e.k === 'result') add(e.ok ? 'result' : 'error', e.text || (e.ok ? 'fertig' : 'Fehler'));
    else if (e.k === 'error') add('error', e.text);
    else if (e.k === 'end') add('end', '— fertig —');
  };
  const input = document.createElement('input');
  input.className = 'fsc-field';
  input.placeholder = 'Auftrag an den Agent (Besitzer bestätigt) …';
  const ask = () => {
    if (!input.value.trim()) return;
    c.send({ t: 'agent-ask', project: d.project, doc: d.doc, text: input.value.trim() });
    add('pending', `Gesendet, wartet auf Bestätigung: ${input.value.trim()}`);
    input.value = '';
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && ask());
  const row = document.createElement('div');
  row.className = 'fsc-row fc-agent-ask';
  row.append(input, button('Senden', ask, true));
  p.body.appendChild(row);
  const offs = [
    c.on('doc-state', (m: any) => {
      if (m.project !== d.project || m.doc !== d.doc) return;
      log.replaceChildren();
      current = null;
      (m.ops || []).forEach((o: any) => apply(o.op));
    }),
    c.on('doc-op', (m: any) => m.project === d.project && m.doc === d.doc && apply(m.op)),
    c.on('agent-answer', (m: any) => add(m.accept ? 'result' : 'error', m.accept ? `${m.by?.name} hat den Auftrag angenommen.` : `${m.by?.name} hat den Auftrag abgelehnt.`)),
  ];
  c.subscribe(d.project);
  c.joinDoc(d.project, d.doc);
}

// ------------------------------------------------------------------ Live-Datei (Yjs)

const openFiles = new Map<string, () => void>();

/** Lokale Datei auswählen und als Live-Dokument ins Projekt teilen. */
export async function shareFile(project: number) {
  const f = await window.agentWorkspace?.fancyAccount?.openLiveFile();
  if (!f) return;
  const doc = `code/${f.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)}-${Math.random().toString(36).slice(2, 6)}`;
  openLiveFile({ project, doc, title: f.name, initial: f.content, localPath: f.path });
}

function openLiveFile(d: { project: number; doc: string; title: string; initial?: string; localPath?: string }) {
  const c = client();
  if (!c) return;
  const key = `${d.project}:${d.doc}`;
  if (openFiles.has(key)) return;
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('content');
  const awareness = new Awareness(ydoc);
  const me = c.state?.me;
  awareness.setLocalStateField('user', { name: me?.name ?? 'Ich', color: COLORS[(me?.id ?? 0) % COLORS.length], colorLight: `${COLORS[(me?.id ?? 0) % COLORS.length]}33` });
  let ready = false;
  let pending: Uint8Array[] = [];
  let timer: any = null;
  const flush = () => {
    timer = null;
    if (!pending.length) return;
    const update = pending.length === 1 ? pending[0] : Y.mergeUpdates(pending);
    pending = [];
    c.send({ t: 'doc-op', project: d.project, doc: d.doc, op: b64(update), cid: Date.now() });
  };
  ydoc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote' || !ready) return;
    pending.push(update);
    if (!timer) timer = setTimeout(flush, 80);
  });
  awareness.on('update', ({ added, updated, removed }: any, origin: unknown) => {
    if (origin === 'remote') return;
    const changed = [...added, ...updated, ...removed];
    c.send({ t: 'awareness', project: d.project, doc: d.doc, data: b64(encodeAwarenessUpdate(awareness, changed)) });
  });

  const lang = new Compartment();
  const p = panel(`📄 ${d.title}`, () => {
    offs.forEach((f) => f());
    removeAwarenessStates(awareness, [ydoc.clientID], 'close');
    c.leaveDoc(d.project, d.doc);
    view.destroy();
    ydoc.destroy();
    openFiles.delete(key);
  });
  p.el.classList.add('wide');
  p.info.textContent = 'Live · verbinde …';
  const view = new EditorView({
    parent: p.body,
    extensions: [basicSetup, oneDark, lang.of([]), yCollab(ytext, awareness), EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontSize: '13px' } })],
  });
  const desc = languages.find((l) => l.extensions.some((ext) => d.title.toLowerCase().endsWith(`.${ext}`)));
  desc?.load().then((support) => view.dispatch({ effects: lang.reconfigure(support) })).catch(() => {});
  let savePath = d.localPath;
  p.actions.append(
    button('Speichern', async () => {
      try {
        const r = await window.agentWorkspace?.fancyAccount?.saveLiveFile({ path: savePath, name: d.title, content: ytext.toString() });
        if (r) {
          savePath = r.path;
          p.info.textContent = `Gespeichert: ${r.path}`;
        }
      } catch (e: any) {
        p.info.textContent = e?.message ?? 'Speichern fehlgeschlagen';
      }
    }),
  );
  const people = () => {
    const names = [...awareness.getStates().entries()].filter(([id]) => id !== ydoc.clientID).map(([, s]: any) => s.user?.name).filter(Boolean);
    p.info.textContent = names.length ? `Live mit ${names.join(', ')}` : 'Live · nur du';
  };
  awareness.on('change', people);

  const offs = [
    c.on('doc-state', (m: any) => {
      if (m.project !== d.project || m.doc !== d.doc) return;
      Y.transact(ydoc, () => {
        if (m.snapshot) Y.applyUpdate(ydoc, unb64(m.snapshot), 'remote');
        for (const o of m.ops || []) Y.applyUpdate(ydoc, unb64(o.op), 'remote');
      }, 'remote');
      ready = true;
      // Neu geteilt: Dateiinhalt als Startstand einfügen.
      if (!m.snapshot && !(m.ops || []).length && d.initial) ytext.insert(0, d.initial);
      people();
      c.presence(d.project, `bearbeitet ${d.title}`, d.doc);
    }),
    c.on('doc-op', (m: any) => {
      if (m.project !== d.project || m.doc !== d.doc) return;
      try {
        Y.applyUpdate(ydoc, unb64(m.op), 'remote');
      } catch {}
    }),
    c.on('doc-ack', (m: any) => {
      if (m.project === d.project && m.doc === d.doc && m.compact) {
        c.send({ t: 'doc-snapshot', project: d.project, doc: d.doc, seq: m.seq, snapshot: b64(Y.encodeStateAsUpdate(ydoc)) });
      }
    }),
    c.on('awareness', (m: any) => {
      if (m.project !== d.project || m.doc !== d.doc || typeof m.data !== 'string') return;
      try {
        applyAwarenessUpdate(awareness, unb64(m.data), 'remote');
      } catch {}
    }),
  ];
  openFiles.set(key, () => {});
  c.subscribe(d.project);
  c.joinDoc(d.project, d.doc, { kind: 'text', title: d.title });
}

// ------------------------------------------------------------------ Verdrahtung

export function initLive() {
  trackHarnessSessions();
  setTeamHooks({
    openTerminal: watchTerminal,
    openDoc: (d) => (d.kind === 'agent-session' ? watchAgentSession(d) : d.kind === 'text' ? openLiveFile(d) : undefined),
    agentTask: runAgentTask,
  });
}
