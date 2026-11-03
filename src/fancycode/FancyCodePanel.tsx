// FancyCode – grafische Agent-Ansicht für FancyCode Desktop und FancyGames Studio (wie Claude Code in Claude Desktop).
// Die Komponente spricht über eine „Bridge“ mit dem Hauptprozess, der die Harness im Protokoll-Modus startet
// (fancycode --sdk). Quelle: fancycode-cli/ui – per scripts/sync-to-apps.mjs in die Apps kopiert, dort nicht ändern.
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Copy,
  FileEdit,
  FolderOpen,
  Gauge,
  History,
  Info,
  ListChecks,
  LogIn,
  LogOut,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Terminal,
  TriangleAlert,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import './fancycode.css';

export interface FancyCodeBridge {
  start(opts: { cwd: string; resume?: string; server?: unknown; engine?: Engine }): Promise<string>;
  send(id: string, msg: unknown): void;
  stop(id: string): void;
  onEvent(cb: (id: string, ev: FcEvent) => void): () => void;
  openExternal?(url: string): void;
}

export type Engine = 'fancycode' | 'claude';
/** Steuerung von außen (z. B. Live-Teilen): aktuelle Sitzung und Aufträge, die wie eigene Eingaben laufen. */
export type PanelControl = { sessionId: string; engine: Engine; ready: boolean; folder: string; prompt: (text: string) => void };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FcEvent = { type: string; [key: string]: any };
type Account = { name: string; plan: string; avatar?: string; offline?: boolean } | null;
type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' };
type Window = { used: number; limit: number; resetAt: number };
type Usage = { fiveHour: Window; weekly: Window; plan: string; resets: number; unit?: 'percent' };
type Mode = { id: string; label: string; hint: string };
type Question = { question: string; header: string; multiSelect: boolean; options: { label: string; description: string }[] };
type Model = { id: string; label: string; note: string };

type Item =
  | { k: 'user'; id: string; text: string }
  | { k: 'assistant'; id: string; text: string }
  | { k: 'tool'; id: string; name: string; kind: string; summary: string; preview: string; output?: string; ok?: boolean }
  | { k: 'ask'; id: string; kind: string; summary: string; preview: string; answer?: string }
  | { k: 'question'; id: string; questions: Question[]; answered?: boolean }
  | { k: 'note'; id: string; level: 'info' | 'warn' | 'error'; text: string }
  | { k: 'card'; id: string; title: string; body: ReactNode };

const MODES: Mode[] = [
  { id: 'default', label: 'Nachfragen', hint: 'Fragt vor Änderungen und Befehlen' },
  { id: 'acceptEdits', label: 'Änderungen erlauben', hint: 'Dateien ändern ohne Rückfrage, Befehle mit Rückfrage' },
  { id: 'plan', label: 'Planen', hint: 'Nur lesen und einen Plan erstellen' },
  { id: 'bypass', label: 'Alles erlauben', hint: 'Keine Rückfragen – nur in vertrauten Projekten' },
];

const SLASH: { cmd: string; hint: string }[] = [
  { cmd: '/new', hint: 'Neue Sitzung' },
  { cmd: '/model', hint: 'Modell wechseln' },
  { cmd: '/usage', hint: 'Verbrauch und Limits' },
  { cmd: '/status', hint: 'Konto, Modell, Modus, Sitzung' },
  { cmd: '/resume', hint: 'Frühere Sitzung fortsetzen' },
  { cmd: '/init', hint: 'FANCYCODE.md mit Projektwissen anlegen' },
  { cmd: '/compact', hint: 'Verlauf zusammenfassen' },
  { cmd: '/mode', hint: 'Rechte: Nachfragen, Änderungen, Planen, Alles' },
  { cmd: '/effort', hint: 'Denktiefe: low, medium, high' },
  { cmd: '/todos', hint: 'Aufgabenliste anzeigen' },
  { cmd: '/cost', hint: 'Tokens dieser Sitzung' },
  { cmd: '/login', hint: 'Mit FancyServers-Konto anmelden' },
  { cmd: '/logout', hint: 'Abmelden' },
  { cmd: '/help', hint: 'Alle Befehle' },
];

const CLAUDE_SLASH: { cmd: string; hint: string }[] = [
  { cmd: '/new', hint: 'Neue Sitzung' },
  { cmd: '/model', hint: 'Claude-Modell wechseln' },
  { cmd: '/effort', hint: 'Denktiefe: low, medium, high, xhigh, max' },
  { cmd: '/mode', hint: 'Rechte: Automatisch, Nachfragen, Änderungen, Planen, Alles' },
  { cmd: '/usage', hint: 'Claude-Limits (5 Stunden, 7 Tage)' },
  { cmd: '/status', hint: 'Konto, Modell, Modus, Sitzung' },
  { cmd: '/resume', hint: 'Frühere Claude-Sitzung fortsetzen' },
  { cmd: '/init', hint: 'CLAUDE.md mit Projektwissen anlegen' },
  { cmd: '/compact', hint: 'Verlauf zusammenfassen' },
  { cmd: '/login', hint: 'Mit Claude anmelden' },
  { cmd: '/logout', hint: 'Bei Claude abmelden' },
  { cmd: '/help', hint: 'Alle Befehle – andere /Befehle und Skills gehen direkt an Claude' },
];

const EFFORT_LABEL: Record<string, string> = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', xhigh: 'Sehr hoch', max: 'Maximal' };

const ENGINE_KEY = 'fancycode.engine';
// FancyServers-Pläne: intern free/mini/pro/max, angezeigt Free/Spark/Nova/Galaxy.
const PLAN_NAMES: Record<string, string> = { free: 'Free', mini: 'Spark', pro: 'Nova', max: 'Galaxy' };
const planName = (p?: string | null) => PLAN_NAMES[String(p || 'free')] || String(p || 'Free').toUpperCase();
const isPaidPlan = (p?: string | null) => p === 'mini' || p === 'pro' || p === 'max';
function storedEngine(engines: Engine[]): Engine {
  try {
    const v = localStorage.getItem(ENGINE_KEY) as Engine | null;
    if (v && engines.includes(v)) return v;
  } catch {}
  return engines[0] || 'fancycode';
}

let seq = 0;
const uid = () => `i${++seq}`;
const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} Mio.` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const when = (t: number) => (t ? new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');

// ------------------------------------------------------------- Markdown (sicher, ohne HTML)

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('`')) out.push(<code key={n++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<b key={n++}>{t.slice(2, -2)}</b>);
    else {
      const l = /^\[([^\]]+)\]\((.+)\)$/.exec(t)!;
      out.push(
        <a key={n++} href={l[2]} target="_blank" rel="noreferrer">
          {l[1]}
        </a>,
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*```(\S*)/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push(<CodeBlock key={key++} lang={fence[1]} text={buf.join('\n')} />);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(<div key={key++} className={`fc-h fc-h${Math.min(h[1].length, 3)}`}>{inline(h[2])}</div>);
      i++;
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={key++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={key++}>{inline(buf.join('\n'))}</p>);
  }
  return <div className="fc-md">{blocks}</div>;
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fc-code">
      <div className="fc-code-head">
        <span>{lang || 'Code'}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Ohne Clipboard-Berechtigung (z. B. file://) klassisch über eine unsichtbare Textfläche.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Kleine Symbole unter einer Nachricht: kopieren, bei der letzten Antwort auch neu erzeugen. */
function MessageActions({ text, onRegenerate }: { text: string; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fc-msg-actions">
      <button
        type="button"
        className="fc-act"
        title="Nachricht kopieren"
        onClick={async () => {
          if (!(await copyToClipboard(text))) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Kopiert' : 'Kopieren'}
      </button>
      {onRegenerate && (
        <button type="button" className="fc-act" title="Antwort neu erzeugen (verbraucht Guthaben)" onClick={onRegenerate}>
          <RotateCcw size={12} /> Neu
        </button>
      )}
    </div>
  );
}

function Diff({ text }: { text: string }) {
  if (!text) return null;
  return (
    <pre className="fc-diff">
      {text.split('\n').map((l, i) => (
        <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>
          {l || ' '}
        </div>
      ))}
    </pre>
  );
}

// ------------------------------------------------------------- Bausteine

function toolIcon(name: string, kind: string) {
  if (kind === 'exec') return <Terminal size={14} />;
  if (kind === 'edit') return <FileEdit size={14} />;
  if (kind === 'mcp') return <Wrench size={14} />;
  if (name === 'grep' || name === 'glob') return <Search size={14} />;
  if (name === 'todo_write') return <ListChecks size={14} />;
  return <Sparkles size={14} />;
}

function ToolCard({ item }: { item: Extract<Item, { k: 'tool' }> }) {
  const [open, setOpen] = useState(item.kind === 'edit');
  const running = item.ok === undefined;
  const hasBody = Boolean(item.preview || item.output);
  return (
    <div className={`fc-tool ${running ? 'running' : item.ok ? 'ok' : 'fail'}`}>
      <button type="button" className="fc-tool-head" onClick={() => hasBody && setOpen(!open)}>
        <span className="fc-tool-icon">{toolIcon(item.name, item.kind)}</span>
        <span className="fc-tool-sum">{item.summary}</span>
        {running ? <span className="fc-dot-pulse" /> : item.ok ? <Check size={14} className="fc-ok" /> : <X size={14} className="fc-fail" />}
        {hasBody && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
      </button>
      {open && hasBody && (
        <div className="fc-tool-body">
          {item.kind === 'edit' && item.preview ? <Diff text={item.preview} /> : null}
          {item.output && !(item.kind === 'edit' && item.ok) ? <pre className="fc-out">{item.output}</pre> : null}
          {item.kind === 'edit' && item.ok && item.output ? <div className="fc-tool-note">{item.output}</div> : null}
        </div>
      )}
    </div>
  );
}

function permissionTitle(kind: string) {
  return kind === 'plan' ? 'Plan freigeben?' : kind === 'edit' ? 'Datei ändern?' : kind === 'exec' ? 'Befehl ausführen?' : kind === 'trust' ? 'Projekt vertrauen?' : 'Werkzeug ausführen?';
}

function AskCard({ item, onAnswer }: { item: Extract<Item, { k: 'ask' }>; onAnswer: (a: string) => void }) {
  const title = permissionTitle(item.kind);
  return (
    <div className={`fc-ask ${item.answer ? 'done' : ''}`}>
      <div className="fc-ask-head">
        <Shield size={15} /> <b>{title}</b>
      </div>
      <div className="fc-ask-sum">{item.summary}</div>
      {item.preview ? item.kind === 'plan' ? <div className="fc-plan"><Markdown text={item.preview} /></div> : <Diff text={item.preview} /> : null}
      {item.answer ? (
        <div className="fc-ask-answer">{item.answer === 'no' ? (item.kind === 'plan' ? 'Wird überarbeitet' : 'Abgelehnt') : item.answer === 'always' ? 'Für diese Sitzung erlaubt' : item.kind === 'plan' ? 'Freigegeben' : 'Erlaubt'}</div>
      ) : item.kind === 'plan' ? (
        <div className="fc-ask-btns">
          <button type="button" className="fc-btn primary" onClick={() => onAnswer('yes')}>
            Plan freigeben
          </button>
          <button type="button" className="fc-btn" onClick={() => onAnswer('no')}>
            Weiter planen
          </button>
        </div>
      ) : (
        <div className="fc-ask-btns">
          <button type="button" className="fc-btn primary" onClick={() => onAnswer('yes')}>
            Erlauben
          </button>
          <button type="button" className="fc-btn" onClick={() => onAnswer('always')}>
            {item.kind === 'trust' ? 'Immer vertrauen' : 'Immer in dieser Sitzung'}
          </button>
          <button type="button" className="fc-btn danger" onClick={() => onAnswer('no')}>
            Ablehnen
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ item, onAnswer }: { item: Extract<Item, { k: 'question' }>; onAnswer: (answers: Record<string, string> | null) => void }) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const toggle = (q: Question, label: string) =>
    setPicked((p) => {
      const cur = p[q.question] || [];
      return { ...p, [q.question]: q.multiSelect ? (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]) : [label] };
    });
  const complete = item.questions.every((q) => (picked[q.question] || []).length || (other[q.question] || '').trim());
  const submit = () => {
    const answers: Record<string, string> = {};
    for (const q of item.questions) {
      const vals = [...(picked[q.question] || [])];
      if ((other[q.question] || '').trim()) vals.push(other[q.question].trim());
      answers[q.question] = vals.join(', ');
    }
    onAnswer(answers);
  };
  return (
    <div className={`fc-ask fc-question ${item.answered ? 'done' : ''}`}>
      {item.questions.map((q) => (
        <div key={q.question} className="fc-q">
          <div className="fc-ask-head">
            <Sparkles size={15} /> {q.header ? <span className="fc-q-tag">{q.header}</span> : null} <b>{q.question}</b>
          </div>
          <div className="fc-q-opts">
            {q.options.map((o) => (
              <button
                key={o.label}
                type="button"
                disabled={item.answered}
                className={`fc-q-opt ${(picked[q.question] || []).includes(o.label) ? 'active' : ''}`}
                onClick={() => toggle(q, o.label)}
              >
                <b>{o.label}</b>
                {o.description ? <span>{o.description}</span> : null}
              </button>
            ))}
          </div>
          {!item.answered && (
            <input
              className="fc-q-other"
              placeholder="Andere Antwort …"
              value={other[q.question] || ''}
              onChange={(e) => setOther((x) => ({ ...x, [q.question]: e.target.value }))}
            />
          )}
        </div>
      ))}
      {item.answered ? (
        <div className="fc-ask-answer">Beantwortet</div>
      ) : (
        <div className="fc-ask-btns">
          <button type="button" className="fc-btn primary" disabled={!complete} onClick={submit}>
            Antworten
          </button>
          <button type="button" className="fc-btn" onClick={() => onAnswer(null)}>
            Überspringen
          </button>
        </div>
      )}
    </div>
  );
}

function Meter({ w, label, percent }: { w: Window; label: string; percent?: boolean }) {
  const pct = w.limit ? Math.min(100, (100 * w.used) / w.limit) : 0;
  return (
    <div className="fc-meter-row">
      <div className="fc-row">
        <span>{label}</span>
        <span className="fc-muted">
          {percent ? `${Math.round(pct)} % genutzt` : `${fmtTokens(w.used)} / ${fmtTokens(w.limit)} Tokens`}
        </span>
      </div>
      <div className={`fc-meter ${pct >= 100 ? 'full' : ''}`}>
        <i style={{ width: `${pct}%` }} />
      </div>
      {w.used > 0 && w.resetAt ? <div className="fc-muted fc-small">wieder frei ab {when(w.resetAt)}</div> : null}
    </div>
  );
}

// Aufgabenliste wie in Claude Desktop: Fortschritt, abgehakte Schritte, aktueller Schritt hervorgehoben.
// Ist alles erledigt, klappt sie nach kurzer Zeit auf eine Zeile zusammen.
function Todos({ todos, running }: { todos: Todo[]; running: boolean }) {
  const [open, setOpen] = useState(true);
  const done = todos.filter((t) => t.status === 'completed').length;
  const allDone = todos.length > 0 && done === todos.length;
  const current = todos.find((t) => t.status === 'in_progress');
  useEffect(() => {
    if (!allDone) {
      setOpen(true);
      return;
    }
    const t = setTimeout(() => setOpen(false), 2500);
    return () => clearTimeout(t);
  }, [allDone, todos.length]);
  if (!todos.length) return null;
  const pct = Math.round((done / todos.length) * 100);
  return (
    <div className={`fc-todos ${allDone ? 'done' : ''}`}>
      <button type="button" className="fc-todos-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ListChecks size={14} />
        <span className="fc-todos-title">{allDone ? 'Alle Aufgaben erledigt' : !open && current ? current.content : 'Aufgaben'}</span>
        <span className="fc-todos-count">
          {done}/{todos.length}
        </span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      <div className="fc-todos-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      {open && (
        <ul>
          {todos.map((t, i) => (
            <li key={i} className={t.status}>
              <span className={`fc-todo-box ${t.status}`} aria-hidden="true">
                {t.status === 'completed' ? <Check size={11} strokeWidth={3} /> : t.status === 'in_progress' && running ? <i className="fc-todo-spin" /> : null}
              </span>
              <span className="fc-todo-text">{t.content}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Panel

export function FancyCodePanel({
  bridge,
  cwd,
  server,
  onPickFolder,
  emptyHint,
  onOpenUsage,
  askPermission,
  engines = ['fancycode'],
  controlRef,
  topActions,
  plan: hostPlan,
  paidEngines = [],
  onEngineLocked,
  appearance = 'solid',
}: {
  bridge: FancyCodeBridge;
  cwd: string;
  // FancyCode Desktop kann den Agenten auf einem V-Server starten; die CLI ignoriert den Wert.
  server?: unknown;
  onPickFolder?: () => void;
  emptyHint?: ReactNode;
  // Wenn die App ein eigenes Usage-Popup hat (FancyCode Desktop), oeffnet dieser Aufruf es.
  onOpenUsage?: (usage: Usage | null) => void;
  // App-eigene Darstellung für Rückfragen (FancyCode Desktop zeigt sie als Popup unten rechts).
  // Fehlt der Aufruf, erscheint die Frage wie bisher als Karte im Verlauf.
  askPermission?: (req: { question: string; summary: string; preview: string; sessionId: string }) => Promise<'yes' | 'always' | 'no' | null>;
  // Verfügbare Engines: „fancycode“ (FancyServers-Modelle) und „claude“ (installierte Claude-CLI des Nutzers).
  engines?: Engine[];
  controlRef?: MutableRefObject<PanelControl | null>;
  // Zusätzliche Knöpfe in der Kopfzeile (z. B. „Live teilen“).
  topActions?: ReactNode;
  // „glass“: durchsichtig wie die Terminals der App (Hintergrundbild/Theme scheint durch, Farben aus dem Theme).
  appearance?: 'solid' | 'glass';
  // FancyServers-Plan aus der App (free/mini/pro/max). Ohne Wert gibt es keine Sperren.
  plan?: string | null;
  // Engines, die erst ab Spark (bezahlter Plan) gehen, z. B. ['claude'].
  paidEngines?: Engine[];
  // Gesperrte Engine angeklickt: die App zeigt „Ab Spark verfügbar“.
  onEngineLocked?: (engine: Engine) => void;
}) {
  const queued = useRef<string[]>([]);
  const sendTextRef = useRef<(t: string) => void>(() => {});
  const engineLocked = (e: Engine) => hostPlan !== undefined && hostPlan !== null && paidEngines.includes(e) && !isPaidPlan(hostPlan);
  const [engine, setEngineState] = useState<Engine>(() => storedEngine(engines));
  const setEngine = (e: Engine) => {
    if (engineLocked(e)) {
      onEngineLocked?.(e);
      return;
    }
    setEngineState(e);
    try {
      localStorage.setItem(ENGINE_KEY, e);
    } catch {}
  };
  const isClaude = engine === 'claude';
  // Plan gesunken oder gespeicherte Engine nicht mehr frei: zurück auf FancyCode.
  useEffect(() => {
    if (engineLocked(engine)) setEngineState(engines.find((e) => !engineLocked(e)) || 'fancycode');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostPlan, engine]);
  const [modes, setModes] = useState<Mode[]>(MODES);
  const [efforts, setEfforts] = useState<string[]>([]);
  const [effort, setEffort] = useState('');
  const [claudeInfo, setClaudeInfo] = useState<{ installed: boolean; version: string } | null>(null);
  const [loginUrl, setLoginUrl] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [installing, setInstalling] = useState<string[] | null>(null);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account>(null);
  const [model, setModel] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [hoverModel, setHoverModel] = useState('');
  const [frontierInfo, setFrontierInfo] = useState(false);
  const [mode, setMode] = useState('default');
  const [profile, setProfile] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [running, setRunning] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [acIndex, setAcIndex] = useState(0);
  const [acClosed, setAcClosed] = useState(false);
  const [menu, setMenu] = useState<'' | 'model' | 'mode' | 'effort'>('');
  const [invite, setInvite] = useState('');
  const [startError, setStartError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const sidRef = useRef('');

  const push = useCallback((item: Item) => setItems((list) => [...list, item]), []);
  const send = useCallback((msg: unknown) => sidRef.current && bridge.send(sidRef.current, msg), [bridge]);

  // Geschenk-Freischaltungen und deren Ablauf auch während einer offenen Sitzung aktualisieren.
  useEffect(() => {
    if (!account) return;
    const timer = setInterval(() => send({ type: 'command', name: 'usage' }), 60_000);
    return () => clearInterval(timer);
  }, [account, send]);

  // Harness für diesen Ordner starten (neu bei Ordnerwechsel).
  useEffect(() => {
    if (!cwd) return;
    let alive = true;
    let current = '';
    setReady(false);
    setItems([]);
    setTodos([]);
    setStartError('');
    setUsage(null);
    setModels([]);
    setLoginUrl('');
    setInstalling(null);
    bridge
      .start({ cwd, ...(server ? { server } : {}), ...(engine !== 'fancycode' ? { engine } : {}) })
        .then((id) => {
        if (!alive) return bridge.stop(id);
        current = id;
        sidRef.current = id;
      })
      .catch((err: Error) => setStartError(err.message));
    return () => {
      alive = false;
      if (current) bridge.stop(current);
      sidRef.current = '';
    };
  }, [bridge, cwd, server, engine]);

  useEffect(
    () =>
      bridge.onEvent((id, ev) => {
        if (id !== sidRef.current) return;
        switch (ev.type) {
          case 'ready':
          case 'state':
            setReady(true);
            setAccount(ev.account);
            setModel(ev.model || '');
            setMode(ev.mode || 'default');
            setModes(Array.isArray(ev.modes) && ev.modes.length ? ev.modes : MODES);
            setEfforts(Array.isArray(ev.efforts) ? ev.efforts : []);
            setEffort(ev.effort || '');
            setClaudeInfo(ev.claude || null);
            if (ev.claude?.installed) setInstalling(null);
            setProfile(ev.profile?.label || '');
            if (ev.type === 'ready') {
              bridge.send(id, { type: 'command', name: 'models' });
              if (ev.account) bridge.send(id, { type: 'command', name: 'usage' });
              for (const e of ev.mcpErrors || []) push({ k: 'note', id: uid(), level: 'warn', text: `MCP ${e.name}: ${e.message}` });
            }
            break;
          case 'text':
            setThinking(false);
            setItems((list) => {
              const last = list[list.length - 1];
              if (last?.k === 'assistant') return [...list.slice(0, -1), { ...last, text: last.text + ev.text }];
              return [...list, { k: 'assistant', id: uid(), text: ev.text }];
            });
            break;
          case 'reasoning':
            setThinking(true);
            break;
          case 'turn_end':
            setThinking(true);
            setItems((list) => [...list]);
            break;
          case 'tool_use':
            setThinking(false);
            if (ev.name === 'todo_write') break;
            setItems((list) => {
              const i = list.findIndex((x) => x.k === 'tool' && x.id === ev.id);
              const tool: Item = { k: 'tool', id: ev.id, name: ev.name, kind: ev.kind, summary: ev.summary, preview: ev.preview || '' };
              return i >= 0 ? list.map((x, j) => (j === i ? tool : x)) : [...list, tool];
            });
            break;
          case 'tool_result':
            if (ev.name === 'todo_write') break;
            setItems((list) => {
              const i = list.findIndex((x) => x.k === 'tool' && x.id === ev.id);
              if (i < 0) return [...list, { k: 'tool', id: ev.id, name: ev.name, kind: '', summary: ev.name, preview: '', output: ev.output, ok: ev.ok }];
              return list.map((x, j) => (j === i ? { ...(x as Extract<Item, { k: 'tool' }>), output: ev.output, ok: ev.ok } : x));
            });
            setThinking(true);
            break;
          case 'permission_request':
            setThinking(false);
            if (askPermission) {
              const question = permissionTitle(ev.kind);
              push({ k: 'note', id: uid(), level: 'info', text: `${question} ${ev.summary}` });
              void askPermission({ question, summary: ev.summary, preview: ev.preview || '', sessionId: id })
                .then((answer) => bridge.send(id, { type: 'permission', id: ev.id, answer: answer || 'no' }))
                .catch(() => bridge.send(id, { type: 'permission', id: ev.id, answer: 'no' }));
            } else {
              push({ k: 'ask', id: ev.id, kind: ev.kind, summary: ev.summary, preview: ev.preview || '' });
            }
            break;
          case 'question':
            setThinking(false);
            push({ k: 'question', id: ev.id, questions: ev.questions || [] });
            break;
          case 'permission_cancel':
            setItems((list) => list.map((x) => ((x.k === 'ask' && x.id === ev.id && !x.answer) ? { ...x, answer: 'no' } : x.k === 'question' && x.id === ev.id ? { ...x, answered: true } : x)));
            break;
          case 'install_log':
            setInstalling((l) => [...(l || []), String(ev.text || '')].slice(-6));
            break;
          case 'login_done':
            setLoginUrl('');
            setLoginCode('');
            if (!ev.ok) push({ k: 'note', id: uid(), level: 'warn', text: 'Anmeldung bei Claude nicht abgeschlossen.' });
            break;
          case 'todos':
            setTodos(ev.todos || []);
            break;
          case 'info':
          case 'warning':
            push({ k: 'note', id: uid(), level: ev.type === 'info' ? 'info' : 'warn', text: ev.message });
            break;
          case 'error':
            setRunning(false);
            setThinking(false);
            push({ k: 'note', id: uid(), level: 'error', text: ev.status === 401 && ev.engine !== 'claude' ? 'Nicht angemeldet. Melde dich mit deinem FancyServers-Konto an.' : ev.message });
            if (ev.status === 401) setAccount(null);
            break;
          case 'done':
            setRunning(false);
            setThinking(false);
            // Aufträge, die während der Antwort von außen kamen, der Reihe nach abarbeiten.
            if (queued.current.length) setTimeout(() => sendTextRef.current(queued.current.shift()!), 0);
            if (ev.aborted) push({ k: 'note', id: uid(), level: 'info', text: 'Abgebrochen.' });
            bridge.send(id, { type: 'command', name: 'usage' });
            break;
          case 'usage':
            setUsage(ev.data);
            break;
          case 'models':
            setModels(ev.data?.models || []);
            if (!ev.current && ev.data?.default) setModel(ev.data.default);
            break;
          case 'account':
            setAccount(ev.account);
            if (ev.account) bridge.send(id, { type: 'command', name: 'usage' });
            break;
          case 'login_url':
            if (ev.engine === 'claude') {
              setLoginUrl(ev.url || '');
              if (ev.url) bridge.openExternal?.(ev.url);
            } else push({ k: 'note', id: uid(), level: 'info', text: 'Anmeldung im Browser geöffnet …' });
            break;
          case 'suggestions':
            setSuggestions(Array.isArray(ev.items) ? ev.items.filter((s: unknown): s is string => typeof s === 'string').slice(0, 3) : []);
            break;
          case 'session':
            setItems([]);
            setTodos([]);
            setSuggestions([]);
            break;
          case 'history':
            setItems(
              (ev.messages || []).map((m: { role: string; content: string; tools: string[] }) =>
                m.role === 'user' ? { k: 'user', id: uid(), text: m.content } : { k: 'assistant', id: uid(), text: m.content || `(${m.tools.join(', ')})` },
              ),
            );
            break;
          case 'status':
            push({
              k: 'card',
              id: uid(),
              title: 'Status',
              body: (
                <dl className="fc-dl">
                  <dt>Konto</dt>
                  <dd>{ev.data.account ? `${ev.data.account.name} · ${String(ev.data.account.plan).toUpperCase()}` : 'nicht angemeldet'}</dd>
                  <dt>Modell</dt>
                  <dd>
                    {ev.data.model || 'fancy (Standard)'}
                    {ev.data.effort ? ` · Denktiefe ${EFFORT_LABEL[ev.data.effort] || ev.data.effort}` : ''}
                  </dd>
                  <dt>Profil</dt>
                  <dd>{ev.data.profile?.label}</dd>
                  <dt>Modus</dt>
                  <dd>{((ev.data.modes as Mode[] | undefined) || MODES).find((x) => x.id === ev.data.mode)?.label || ev.data.mode}</dd>
                  <dt>Ordner</dt>
                  <dd>{ev.data.cwd}</dd>
                  <dt>Sitzung</dt>
                  <dd>
                    {ev.data.session || '–'} · {ev.data.engine === 'claude' ? `${fmtTokens(ev.data.usage.input + ev.data.usage.output)} Tokens (letzte Anfrage)` : `${ev.data.messages} Nachrichten · ${fmtTokens(ev.data.usage.input + ev.data.usage.output)} Tokens`}
                  </dd>
                  <dt>MCP</dt>
                  <dd>{ev.data.mcp.length ? ev.data.mcp.map((m: { name: string; tools: number }) => `${m.name} (${m.tools})`).join(', ') : '–'}</dd>
                  <dt>Version</dt>
                  <dd>{ev.data.engine === 'claude' ? ev.data.version : `FancyCode ${ev.data.version}`}</dd>
                </dl>
              ),
            });
            break;
          case 'sessions':
            push({
              k: 'card',
              id: uid(),
              title: 'Frühere Sitzungen',
              body: ev.list.length ? (
                <div className="fc-sessions">
                  {ev.list.map((s: { id: string; title: string; updated: number }) => (
                    <button key={s.id} type="button" onClick={() => bridge.send(id, { type: 'command', name: 'resume', arg: s.id })}>
                      <span>{s.title || '(ohne Titel)'}</span>
                      <span className="fc-muted">{when(s.updated)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="fc-muted">Noch keine Sitzungen in diesem Ordner.</span>
              ),
            });
            break;
        }
      }),
    [bridge, push, askPermission],
  );

  // Automatisch mitscrollen, solange der Nutzer unten ist.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, thinking, todos]);

  const answer = (id: string, a: string) => {
    send({ type: 'permission', id, answer: a });
    setItems((list) => list.map((x) => (x.k === 'ask' && x.id === id ? { ...x, answer: a } : x)));
  };

  const slash = isClaude ? CLAUDE_SLASH : SLASH;

  const answerQuestion = (id: string, answers: Record<string, string> | null) => {
    send({ type: 'answer', id, answers });
    setItems((list) => list.map((x) => (x.k === 'question' && x.id === id ? { ...x, answered: true } : x)));
  };

  const showUsageCard = () => {
    if (onOpenUsage) {
      if (!usage) send({ type: 'command', name: 'usage' });
      return onOpenUsage(usage);
    }
    if (!usage) return send({ type: 'command', name: 'usage' });
    push({
      k: 'card',
      id: uid(),
      title: usage.unit === 'percent' ? `Claude · ${usage.plan}` : `Verbrauch · Plan ${planName(usage.plan)}`,
      body: (
        <div>
          <Meter w={usage.fiveHour} label="5 Stunden" percent={usage.unit === 'percent'} />
          <Meter w={usage.weekly} label="7 Tage" percent={usage.unit === 'percent'} />
          <div className="fc-muted fc-small">
            {usage.unit === 'percent'
              ? 'Limits deines Claude-Abos – sie gelten auch für Claude Code und claude.ai.'
              : `Resets: ${usage.resets}. Dieses Token-Budget gilt gemeinsam für den Agenten und die eingebauten KI-Chats aller FancyServers-Apps.`}
          </div>
        </div>
      ),
    });
  };

  const runSlash = (raw: string) => {
    const [cmd, ...rest] = raw.trim().split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd) {
      case '/new':
      case '/clear':
        return send({ type: 'command', name: 'new' });
      case '/model':
        if (arg === 'frontier') return setFrontierInfo(true);
        if (arg) return send({ type: 'set', model: arg });
        return setMenu('model');
      case '/mode':
        if (modes.some((m) => m.id === arg)) return send({ type: 'set', mode: arg });
        return setMenu('mode');
      case '/effort':
        if (!arg && efforts.length) return setMenu('effort');
        return send({ type: 'set', effort: arg });
      case '/usage':
        return showUsageCard();
      case '/status':
        return send({ type: 'command', name: 'status' });
      case '/resume':
        return send({ type: 'command', name: 'sessions' });
      case '/init':
        setRunning(true);
        setThinking(true);
        push({ k: 'user', id: uid(), text: isClaude ? '/init – CLAUDE.md anlegen' : '/init – FANCYCODE.md anlegen' });
        return send({ type: 'command', name: 'init' });
      case '/compact':
        return send({ type: 'command', name: 'compact' });
      case '/todos':
        return push({
          k: 'note',
          id: uid(),
          level: 'info',
          text: todos.length
            ? todos.map((t) => `${t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '▶' : '☐'} ${t.content}`).join('\n')
            : 'Noch keine Aufgabenliste in dieser Sitzung.',
        });
      case '/cost':
        return send({ type: 'command', name: 'status' });
      case '/login':
        if (isClaude) return send({ type: 'command', name: 'login', provider: arg === 'console' ? 'console' : 'claudeai' });
        return send({ type: 'command', name: 'login', provider: arg === 'discord' ? 'discord' : 'github', invite });
      case '/logout':
        return send({ type: 'command', name: 'logout' });
      case '/help':
        return push({
          k: 'card',
          id: uid(),
          title: 'Befehle',
          body: (
            <div className="fc-help">
              {slash.map((s) => (
                <div key={s.cmd}>
                  <code>{s.cmd}</code> {s.hint}
                </div>
              ))}
              <div className="fc-muted fc-small">Enter sendet, Shift+Enter neue Zeile. Esc bricht die laufende Antwort ab.</div>
            </div>
          ),
        });
      default:
        // Claude kennt eigene Befehle und Skills (z. B. /review) – die gehen direkt an Claude.
        if (isClaude) return sendText(raw);
        push({ k: 'note', id: uid(), level: 'warn', text: `Unbekannter Befehl ${cmd}. /help zeigt alle.` });
    }
  };

  // Abschicken eines Vorschlags oder der Eingabe (Slash-Befehle laufen getrennt).
  const sendText = (raw: string) => {
    const text = raw.trim();
    if (!text || !ready || running) return;
    setSuggestions([]);
    setInput('');
    stick.current = true;
    push({ k: 'user', id: uid(), text });
    setRunning(true);
    setThinking(true);
    send({ type: 'prompt', text });
  };

  sendTextRef.current = sendText;
  if (controlRef)
    controlRef.current = {
      sessionId: sidRef.current,
      engine,
      ready,
      folder: cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() || cwd : '',
      prompt: (t: string) => {
        if (running || !ready) {
          queued.current.push(t);
          push({ k: 'note', id: uid(), level: 'info', text: `Auftrag aus dem Team wartet: ${t.slice(0, 120)}` });
        } else sendText(t);
      },
    };

  const submit = () => {
    const text = input.trim();
    if (!text || !ready) return;
    if (text.startsWith('/') && !text.includes('\n')) {
      setInput('');
      return runSlash(text);
    }
    sendText(text);
  };

  // Antwort der letzten Runde verwerfen und dieselbe Anfrage neu beantworten lassen.
  const regenerate = () => {
    if (running) return;
    // Alles ab der letzten Nutzernachricht wegwerfen – dort antwortet der Agent neu.
    let cut = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].k === 'user') {
        cut = i + 1;
        break;
      }
    }
    if (cut < 0) return;
    setItems(items.slice(0, cut));
    setSuggestions([]);
    setRunning(true);
    setThinking(true);
    send({ type: 'command', name: 'regenerate' });
  };

  // Vervollständigung beim Tippen: Befehle ab „/“, sonst die zuletzt vorgeschlagenen Fragen.
  // Exakte Treffer zuerst, damit „/mode“ nicht bei „/model“ landet.
  type Completion = { value: string; hint: string; kind: 'cmd' | 'idea' };
  const hits = useMemo<Completion[]>(() => {
    if (acClosed) return [];
    const q = input.trim().toLowerCase();
    if (input.startsWith('/')) {
      if (input.includes(' ')) return [];
      const typed = input.toLowerCase();
      return slash.filter((s) => s.cmd.startsWith(typed))
        .sort((a, b) => Number(b.cmd === typed) - Number(a.cmd === typed))
        .map((s) => ({ value: s.cmd, hint: s.hint, kind: 'cmd' as const }));
    }
    if (!q) return [];
    return suggestions
      .filter((s) => s.toLowerCase().includes(q))
      .map((s) => ({ value: s, hint: 'Vorschlag', kind: 'idea' as const }));
  }, [input, suggestions, acClosed, slash]);
  useEffect(() => {
    const ta = textarea.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [input]);

  const engineName = isClaude ? 'Claude' : 'FancyCode';
  // Gespeicherte Modelle, die der Plan nicht (mehr) hat, laufen serverseitig über Auto – so auch anzeigen.
  const activeModel = models.some((m) => m.id === model) ? model : models[0]?.id || (isClaude ? 'default' : 'auto');
  const modelLabel = models.find((m) => m.id === activeModel)?.label || (isClaude ? 'Claude' : 'Auto');
  // Beim Hovern das gehoverte Modell, sonst das aktive – so springt das Panel nicht.
  const hoverInfo = menu === 'model' ? models.find((m) => m.id === (hoverModel || activeModel)) || models[0] : undefined;
  const plan = isClaude ? String(usage?.plan || account?.plan || 'Claude').toUpperCase() : planName(usage?.plan || account?.plan);
  const modeInfo = modes.find((m) => m.id === mode) || modes[0];
  const folderName = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() : '';

  if (!cwd) {
    return (
      <div className={`fc-root fc-empty-state${appearance === 'glass' ? ' fc-glass' : ''}`}>
        <Zap size={34} />
        <h2>{engineName}</h2>
        <p>{emptyHint || `Wähle einen Projektordner, in dem ${engineName} arbeiten soll.`}</p>
        {onPickFolder && (
          <button type="button" className="fc-btn primary" onClick={onPickFolder}>
            <FolderOpen size={15} /> Ordner wählen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`fc-root${appearance === 'glass' ? ' fc-glass' : ''}`} onKeyDown={(e) => e.key === 'Escape' && running && !frontierInfo && send({ type: 'abort' })}>
      {frontierInfo && (
        <div className="fc-modal-backdrop" onClick={() => setFrontierInfo(false)}>
          <div className="fc-modal" role="dialog" aria-modal="true" aria-labelledby="fc-frontier-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setFrontierInfo(false); }}>
            <h2 id="fc-frontier-title">Frontier Model</h2>
            <p>Frontier Model von FancyNode nutzt ausgewählte Spitzenmodelle. Ist es gerade nicht erreichbar, nimm „Auto“ – das wechselt selbst auf ein freies Modell.</p>
            <a href="https://livebench.ai/#/" target="_blank" rel="noreferrer">LiveBench-Rangliste öffnen ↗</a>
            <div className="fc-ask-btns">
              <button type="button" className="fc-btn" onClick={() => setFrontierInfo(false)}>Abbrechen</button>
              <button type="button" className="fc-btn primary" onClick={() => { send({ type: 'set', model: 'frontier' }); setFrontierInfo(false); }}>Frontier Model auswählen</button>
            </div>
          </div>
        </div>
      )}
      <div className="fc-top">
        {engines.length > 1 ? (
          <div className="fc-engines" role="tablist" aria-label="Agent">
            {engines.map((e) => (
              <button
                key={e}
                type="button"
                role="tab"
                aria-selected={engine === e}
                className={engine === e ? 'active' : ''}
                disabled={running}
                title={engineLocked(e) ? 'Ab Spark verfügbar' : e === 'claude' ? 'Claude über dein eigenes Claude-Konto (Claude Code)' : 'FancyCode über dein FancyServers-Konto'}
                onClick={() => engine !== e && setEngine(e)}
              >
                {e === 'claude' ? <Sparkles size={14} /> : <Zap size={14} />} {e === 'claude' ? 'Claude' : 'FancyCode'}
                {engineLocked(e) ? <span className="fc-lock-tag">Spark</span> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="fc-brand">
            <Zap size={16} /> FancyCode
          </div>
        )}
        <button type="button" className="fc-chip" onClick={onPickFolder} title={cwd} disabled={!onPickFolder}>
          <FolderOpen size={13} /> {folderName}
        </button>
        <div className="fc-spacer" />
        {topActions}
        {usage && (
          <button type="button" className="fc-usage" onClick={showUsageCard} title={usage.unit === 'percent' ? `Claude-Limit 5 Stunden: ${usage.fiveHour.used} %` : 'Verbrauch (5 Stunden)'}>
            <Gauge size={13} />
            <span className="fc-meter mini">
              <i style={{ width: `${Math.min(100, (100 * usage.fiveHour.used) / Math.max(1, usage.fiveHour.limit))}%` }} />
            </span>
          </button>
        )}
        <button type="button" className="fc-icon-btn" title="Frühere Sitzungen" onClick={() => runSlash('/resume')}>
          <History size={15} />
        </button>
        <button type="button" className="fc-icon-btn" title="Neue Sitzung" onClick={() => runSlash('/new')}>
          <Plus size={15} />
        </button>
        {account ? (
          <button type="button" className="fc-icon-btn" title={`${account.name} abmelden`} onClick={() => runSlash('/logout')}>
            <LogOut size={15} />
          </button>
        ) : null}
      </div>

      <div
        className="fc-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        <div className="fc-thread">
          {startError && <div className="fc-note error">{engineName} konnte nicht starten: {startError}</div>}
          {!ready && !startError && <div className="fc-loading">{engineName} startet …</div>}
          {ready && isClaude && !account && (
            <div className="fc-login">
              <Sparkles size={26} />
              {claudeInfo && !claudeInfo.installed ? (
                <>
                  <h3>Claude Code einrichten</h3>
                  <p className="fc-muted">Claude arbeitet hier mit deinem eigenen Claude-Abo (Pro/Max) oder API-Konto. Dafür braucht es das offizielle Claude Code – die App installiert es mit einem Klick von claude.ai.</p>
                  {installing ? (
                    <div className="fc-install-log">
                      <div className="fc-loading">Installiere …</div>
                      {installing.map((l, i) => (
                        <div key={i} className="fc-muted fc-small">{l}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="fc-ask-btns">
                      <button type="button" className="fc-btn primary" onClick={() => { setInstalling([]); send({ type: 'command', name: 'install' }); }}>
                        <Sparkles size={14} /> Claude Code installieren
                      </button>
                      <button type="button" className="fc-btn" onClick={() => send({ type: 'command', name: 'refresh' })}>
                        Erneut prüfen
                      </button>
                    </div>
                  )}
                </>
              ) : loginUrl ? (
                <>
                  <h3>Anmeldung im Browser abschließen</h3>
                  <p className="fc-muted">Der Browser ist offen. Meldet sich Claude danach nicht von selbst, kopiere den angezeigten Code hierher.</p>
                  <div className="fc-login-code">
                    <input value={loginCode} onChange={(e) => setLoginCode(e.target.value)} placeholder="Code aus dem Browser" maxLength={500} />
                    <button type="button" className="fc-btn primary" disabled={!loginCode.trim()} onClick={() => send({ type: 'command', name: 'login_code', arg: loginCode })}>
                      Bestätigen
                    </button>
                  </div>
                  <div className="fc-ask-btns">
                    <button type="button" className="fc-btn" onClick={() => bridge.openExternal?.(loginUrl)}>
                      Browser erneut öffnen
                    </button>
                    <button type="button" className="fc-btn" onClick={() => copyToClipboard(loginUrl)}>
                      <Copy size={13} /> Link kopieren
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3>Mit Claude anmelden</h3>
                  <p className="fc-muted">Nutze dein Claude-Abo (Pro/Max) oder ein Anthropic-API-Konto. Die Anmeldung läuft über Claude Code selbst – {claudeInfo?.version ? `Version ${claudeInfo.version}` : 'installiert'}. Die App sieht deine Zugangsdaten nie.</p>
                  <div className="fc-ask-btns">
                    <button type="button" className="fc-btn primary" onClick={() => runSlash('/login')}>
                      <LogIn size={14} /> Mit Claude-Abo anmelden
                    </button>
                    <button type="button" className="fc-btn" onClick={() => runSlash('/login console')}>
                      <LogIn size={14} /> Mit API-Konto
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {ready && !isClaude && !account && (
            <div className="fc-login">
              <Zap size={26} />
              <h3>Mit deinem FancyServers-Konto anmelden</h3>
              <p className="fc-muted">Dasselbe Konto wie in FancyCode Desktop, FancyGames Studio und FancyAgent. Ein Einladungscode ist nur beim allerersten Mal nötig.</p>
              <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Einladungscode (optional)" maxLength={40} />
              <div className="fc-ask-btns">
                <button type="button" className="fc-btn primary" onClick={() => runSlash('/login github')}>
                  <LogIn size={14} /> Mit GitHub
                </button>
                <button type="button" className="fc-btn" onClick={() => runSlash('/login discord')}>
                  <LogIn size={14} /> Mit Discord
                </button>
              </div>
            </div>
          )}
          {ready && account && !items.length && (
            <div className="fc-welcome">
              <Zap size={30} />
              <h3>Was soll ich in {folderName} tun?</h3>
              <p className="fc-muted">
                {isClaude
                  ? `Claude arbeitet mit deinem Konto ${account.name}: liest Code, ändert Dateien, führt Befehle aus und nutzt deine Skills und MCP-Server.`
                  : 'FancyCode liest deinen Code, ändert Dateien und führt Befehle aus – vor Änderungen fragt es nach.'}
              </p>
              <div className="fc-suggest">
                {['Erkläre mir dieses Projekt', 'Finde und behebe Fehler im Build', 'Schreib Tests für die wichtigsten Funktionen', '/init'].map((s) => (
                  <button key={s} type="button" onClick={() => (s.startsWith('/') ? runSlash(s) : setInput(s))}>
                    {s === '/init' ? 'Projektwissen anlegen (/init)' : s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {items.map((item) => {
            if (item.k === 'user')
              return (
                <div key={item.id} className="fc-user-wrap">
                  <div className="fc-user">{item.text}</div>
                  <MessageActions text={item.text} />
                </div>
              );
            if (item.k === 'assistant') {
              // „Neu“ nur unter der letzten Antwort – der Agent wiederholt immer die letzte Anfrage.
              const lastAssistant = [...items].reverse().find((x) => x.k === 'assistant')?.id === item.id;
              return (
                <div key={item.id} className="fc-assistant">
                  <Markdown text={item.text} />
                  <MessageActions text={item.text} onRegenerate={lastAssistant && !running ? regenerate : undefined} />
                </div>
              );
            }
            if (item.k === 'tool') return <ToolCard key={item.id} item={item} />;
            if (item.k === 'ask') return <AskCard key={item.id} item={item} onAnswer={(a) => answer(item.id, a)} />;
            if (item.k === 'question') return <QuestionCard key={item.id} item={item} onAnswer={(a) => answerQuestion(item.id, a)} />;
            if (item.k === 'card')
              return (
                <div key={item.id} className="fc-card">
                  <div className="fc-card-title">{item.title}</div>
                  {item.body}
                </div>
              );
            return (
              <div key={item.id} className={`fc-note ${item.level}`}>
                {item.level === 'error' ? <TriangleAlert size={14} /> : <Info size={14} />} {item.text}
              </div>
            );
          })}
          {running && thinking && (
            <div className="fc-thinking">
              <span className="fc-spark" /> denkt …
            </div>
          )}
        </div>
      </div>

      <div className="fc-bottom">
        <Todos todos={todos} running={running} />
        {suggestions.length > 0 && (!input.trim() || suggestions.includes(input)) && (
          <div className="fc-suggests">
            {suggestions.map((s) => (
              <button key={s} type="button" title="Sofort senden" onClick={() => sendText(s)}>
                {s}
              </button>
            ))}
            <span className="fc-suggests-hint">Tab übernimmt · Enter sendet</span>
          </div>
        )}
        <div className="fc-composer">
          {hits.length > 0 && (
            <div className="fc-popover">
              {hits.map((s, i) => (
                <button
                  key={s.value}
                  type="button"
                  className={i === acIndex ? 'active' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (s.kind === 'cmd') {
                      setInput('');
                      runSlash(s.value);
                    } else {
                      setInput(s.value);
                    }
                  }}
                >
                  {s.kind === 'cmd' ? <code>{s.value}</code> : <b>{s.value}</b>} <span>{s.hint}</span>
                </button>
              ))}
            </div>
          )}
          {menu && (
            <div className="fc-popover">
              {menu === 'mode' && profile && (
                <div className="fc-pop-profile">
                  <span className="fc-muted">Aktives Profil</span> <b>{profile}</b>
                </div>
              )}
              <div className="fc-pop-title">
                {menu === 'model' ? 'Modell' : menu === 'effort' ? 'Denktiefe' : 'Rechte'}
                <button type="button" onClick={() => setMenu('')}>
                  <X size={13} />
                </button>
              </div>
              <div className="fc-pop-list">
                {menu === 'model'
                  ? models.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={activeModel === m.id ? 'active' : ''}
                        onMouseEnter={() => setHoverModel(m.id)}
                        onMouseLeave={() => setHoverModel('')}
                        onFocus={() => setHoverModel(m.id)}
                        onBlur={() => setHoverModel('')}
                        onClick={() => {
                          if (m.id === 'frontier') setFrontierInfo(true);
                          else send({ type: 'set', model: m.id });
                          setMenu('');
                        }}
                      >
                        <b>{m.label}</b> <span>{m.note}</span>
                      </button>
                    ))
                  : menu === 'effort'
                    ? efforts.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className={effort === e ? 'active' : ''}
                          onClick={() => {
                            send({ type: 'set', effort: e });
                            setMenu('');
                          }}
                        >
                          <b>{EFFORT_LABEL[e] || e}</b> <span>{e === 'low' ? 'Schnell, für einfache Aufgaben' : e === 'medium' ? 'Ausgewogen' : e === 'high' ? 'Gründlich – empfohlen' : e === 'xhigh' ? 'Sehr gründlich für schwere Aufgaben' : 'Maximale Tiefe, langsam und teuer'}</span>
                        </button>
                      ))
                    : modes.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={mode === o.id ? 'active' : ''}
                        onClick={() => {
                          send({ type: 'set', mode: o.id });
                          setMenu('');
                        }}
                      >
                        <b>{o.label}</b> <span>{o.hint}</span>
                      </button>
                    ))}
              </div>
              {menu === 'model' && hoverInfo && !isClaude && (
                <div className="fc-model-info">
                  <div className="fc-mi-title">Rate-Limits</div>
                  <div className="fc-mi-row">
                    <span>Modell</span>
                    <b>{hoverInfo.label}</b>
                  </div>
                  <div className="fc-mi-row">
                    <span>Anbieter</span>
                    <b>{hoverInfo.note || '–'}</b>
                  </div>
                  <div className="fc-mi-row">
                    <span>Plan</span>
                    <b>{plan}</b>
                  </div>
                  <div className="fc-mi-row">
                    <span>5 Stunden</span>
                    <b>{usage ? `${fmtTokens(usage.fiveHour.used)} / ${fmtTokens(usage.fiveHour.limit)}` : '–'}</b>
                  </div>
                  <div className="fc-mi-row">
                    <span>7 Tage</span>
                    <b>{usage ? `${fmtTokens(usage.weekly.used)} / ${fmtTokens(usage.weekly.limit)}` : '–'}</b>
                  </div>
                </div>
              )}
            </div>
          )}
          <textarea
            ref={textarea}
            rows={1}
            value={input}
            disabled={!ready}
            placeholder={account ? `Beschreibe, was ${engineName} tun soll … (/ für Befehle)` : 'Bitte zuerst anmelden'}
            onChange={(e) => {
              setInput(e.target.value);
              setAcClosed(false);
              setAcIndex(0);
            }}
            onKeyDown={(e) => {
              if (hits.length && e.key === 'Escape') {
                e.preventDefault();
                setAcClosed(true);
                return;
              }
              if (hits.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setAcIndex((i) => (i + step + hits.length) % hits.length);
                return;
              }
              if (hits.length && e.key === 'Tab') {
                // Tab übernimmt den markierten Treffer, Shift+Tab den vorherigen.
                e.preventDefault();
                const pick = e.shiftKey ? (acIndex - 1 + hits.length) % hits.length : acIndex;
                setAcIndex(pick);
                setInput(hits[pick].value);
                setAcClosed(true);
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="fc-composer-bar">
            <button type="button" className="fc-chip" onClick={() => setMenu(menu === 'mode' ? '' : 'mode')} title={modeInfo.hint}>
              <Shield size={13} /> {modeInfo.label}
            </button>
            <button type="button" className="fc-chip" onClick={() => setMenu(menu === 'model' ? '' : 'model')}>
              <Sparkles size={13} /> {modelLabel}
            </button>
            {efforts.length > 0 && (
              <button type="button" className="fc-chip" onClick={() => setMenu(menu === 'effort' ? '' : 'effort')} title="Denktiefe (Reasoning)">
                <Gauge size={13} /> {EFFORT_LABEL[effort] || effort || 'Denktiefe'}
              </button>
            )}
            <div className="fc-spacer" />
            {running ? (
              <button type="button" className="fc-send stop" title="Abbrechen (Esc)" onClick={() => send({ type: 'abort' })}>
                <CircleStop size={17} />
              </button>
            ) : (
              <button type="button" className="fc-send" title="Senden (Enter)" disabled={!input.trim() || !ready} onClick={submit}>
                <ArrowUp size={17} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
