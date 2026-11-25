import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCode2,
  FolderOpen,
  GitBranch,
  GitCommit,
  GitMerge,
  History,
  Kanban,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { tr } from '../i18n';
import type {
  CliHistoryEntry,
  GitDiffStatus,
  ProjectShortcut,
  SwarmTask,
  SwarmTaskStatus,
  TerminalLiveState,
  TerminalLiveStatus,
  TerminalTab,
} from '../types';

// Strips ANSI escape codes so we can inspect terminal lines for status & activity.
const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\))/g;
const OSC_TITLE_REGEX = /\x1B\](?:0|2);([^\x07\x1B]{2,90})(?:\x07|\x1B\\)/;

const WAITING_PROMPT_REGEX =
  /(?:\(y\/n\)|\[Y\/n\]|\[y\/N\]|Allow\s+(?:once|always|tool|bash|command|edit|write)|Do you want to\s+(?:proceed|continue|run|edit|create|delete)|Proceed\?|Press Enter to continue|Waiting for (?:input|approval|confirmation)|Genehmigen\?|Ausführen erlauben)/i;

const ACTION_LINE_REGEX =
  /^(?:[●✻✶✢✳✽⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏►▶•]\s*)?((?:Read|Reading|Edit|Editing|Write|Writing|Bash|Run|Running|Search|Searching|Grep|Glob|Thinking|Testing|Fixing|Building|Deploying|Analyzing|Update|Updating|Create|Creating)\b[^\r\n]{0,68})/i;

const WORKING_SPINNER_REGEX =
  /(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✻✶✢✳✽◐◓◑◒]\s+\S[^\r\n]{1,70}|\b(?:esc|ctrl\+c)\s+to\s+(?:interrupt|cancel)\b)/i;

const OSC_WORKING_REGEX =
  /(?:^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✻✶✢✳✽◐◓◑◒⏳⚡]\s*|\b(?:working|running|thinking|building|testing|searching|editing)\b)/i;

// Menu / model-picker / settings redraws must never flip the terminal into "working".
const IGNORE_UI_LINE_REGEX =
  /(?:select\s+(?:a\s+)?model|model\s+(?:switched|changed|updated|selected|set)|choose\s+(?:a\s+)?model|use\s+arrow|↑\/↓|press\s+enter\s+to\s+select|\/model\b|\/settings\b|\/theme\b|\/config\b)/i;

// Dangerous commands that Turbo Mode must NEVER auto-approve
const DANGEROUS_GUARDRAIL_REGEX =
  /(?:\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r\b|\bRemove-Item\b[^\r\n]*-Recurse|\bgit\s+push\b[^\r\n]*--force\b|\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-zA-Z]*f|\bDROP\s+(?:TABLE|DATABASE)\b|\bTRUNCATE\s+TABLE\b|\bmkfs\b|\bdd\s+if=|\bchmod\s+-R\s+777\s+\/|\bformat\s+[a-zA-Z]:)/i;

export function evaluateTurboPrompt(
  rawChunk: string,
): { action: 'approve'; reply: string } | { action: 'block'; reason: string } | null {
  if (!rawChunk) return null;
  const plain = rawChunk.replace(ANSI_REGEX, '').replace(/\r/g, '\n');
  if (!WAITING_PROMPT_REGEX.test(plain)) return null;

  const dangerMatch = plain.match(DANGEROUS_GUARDRAIL_REGEX);
  if (dangerMatch) {
    return {
      action: 'block',
      reason: dangerMatch[0].trim().slice(0, 48),
    };
  }

  const reply = /Press Enter to continue/i.test(plain) ? '\r' : 'y\r';
  return {
    action: 'approve',
    reply,
  };
}

export function parseTerminalChunkForLiveState(
  rawChunk: string,
): { status?: TerminalLiveStatus; activity?: string } | null {
  if (!rawChunk) return null;

  let oscActivity: string | undefined;
  const oscMatch = rawChunk.match(OSC_TITLE_REGEX);
  if (oscMatch && oscMatch[1]) {
    const cleanedTitle = oscMatch[1].trim();
    if (cleanedTitle && !/^(bash|zsh|fish|sh|cmd|powershell|terminal)$/i.test(cleanedTitle)) {
      oscActivity = cleanedTitle.slice(0, 72);
    }
  }

  const plain = rawChunk.replace(ANSI_REGEX, '').replace(/\r/g, '\n');
  const lines = plain
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (WAITING_PROMPT_REGEX.test(line)) {
      return {
        status: 'waiting',
        activity: line.slice(0, 72),
      };
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (IGNORE_UI_LINE_REGEX.test(line)) continue;
    const match = line.match(ACTION_LINE_REGEX);
    if (match && match[1]) {
      return {
        status: 'working',
        activity: match[1].trim().slice(0, 72),
      };
    }
    if (WORKING_SPINNER_REGEX.test(line)) {
      const cleaned = line.replace(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✻✶✢✳✽◐◓◑◒\s]+/, '').trim();
      return {
        status: 'working',
        ...(cleaned ? { activity: cleaned.slice(0, 72) } : {}),
      };
    }
  }

  if (oscActivity && OSC_WORKING_REGEX.test(oscActivity)) {
    return {
      status: 'working',
      activity: oscActivity.replace(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✻✶✢✳✽◐◓◑◒⏳⚡\s]+/, '').trim() || oscActivity,
    };
  }

  return null;
}

export function TerminalStatusBadge({
  state,
  compact = false,
}: {
  state?: TerminalLiveState;
  compact?: boolean;
}) {
  const status: TerminalLiveStatus = state?.status || 'idle';
  const activity = state?.activity?.trim() || '';

  if (status === 'idle' && !activity) {
    return null;
  }

  const meta: Record<
    TerminalLiveStatus,
    { label: string; dot: string; pill: string }
  > = {
    idle: {
      label: tr('Bereit'),
      dot: 'bg-zinc-500',
      pill: 'bg-white/[0.04] text-zinc-400 border-white/10',
    },
    working: {
      label: tr('Arbeitet'),
      dot: 'bg-amber-400 animate-pulse',
      pill: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    },
    waiting: {
      label: tr('Eingabe'),
      dot: 'bg-orange-400 animate-ping',
      pill: 'bg-orange-500/15 text-orange-300 border-orange-500/35',
    },
    done: {
      label: tr('Fertig'),
      dot: 'bg-emerald-400',
      pill: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    },
  };

  const current = meta[status];

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1.5 min-w-0"
        title={activity ? `${current.label}: ${activity}` : current.label}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${current.dot}`} />
        {activity && (
          <span className="text-[10px] text-zinc-400 truncate max-w-[100px] font-normal">
            {activity}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 min-w-0">
      <span
        className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border text-[9px] font-medium tracking-wide shrink-0 ${current.pill}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
        {current.label}
      </span>
      {activity && (
        <span
          className="text-[10px] text-zinc-400 font-mono truncate max-w-[180px]"
          title={activity}
        >
          {activity}
        </span>
      )}
    </div>
  );
}

const CUSTOM_SHORTCUTS_KEY = 'agentWorkspace.customShortcuts';

export function ProjectShortcutsMenu({
  projectPath,
  onRunInActive,
  onRunInAll,
  onClose,
}: {
  projectPath?: string;
  onRunInActive(command: string): void;
  onRunInAll(command: string): void;
  onClose(): void;
}) {
  const [detected, setDetected] = useState<ProjectShortcut[]>([]);
  const [custom, setCustom] = useState<ProjectShortcut[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_SHORTCUTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [newLabel, setNewLabel] = useState('');
  const [newCmd, setNewCmd] = useState('');

  useEffect(() => {
    if (!projectPath || !window.agentWorkspace?.getProjectShortcuts) return;
    void window.agentWorkspace
      .getProjectShortcuts(projectPath)
      .then((list) => setDetected(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [projectPath]);

  const saveCustom = (next: ProjectShortcut[]) => {
    setCustom(next);
    try {
      localStorage.setItem(CUSTOM_SHORTCUTS_KEY, JSON.stringify(next));
    } catch {}
  };

  const addShortcut = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = newCmd.trim();
    if (!cmd) return;
    const item: ProjectShortcut = {
      id: `custom-${Date.now().toString(36)}`,
      label: newLabel.trim() || cmd,
      command: cmd,
      source: 'custom',
    };
    saveCustom([item, ...custom]);
    setNewLabel('');
    setNewCmd('');
  };

  const all = [...custom, ...detected];

  return (
    <div className="dropdown-pop absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-white/10 bg-[#18161a]/95 p-2.5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between px-1 pb-2 border-b border-white/5">
        <span className="section-label">{tr('Projekt-Shortcuts')}</span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="my-2 max-h-56 overflow-y-auto space-y-1 custom-scrollbar pr-0.5">
        {all.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-zinc-500">
            {tr('Keine Scripts erkannt. Unten eigenen Befehl anlegen.')}
          </p>
        ) : (
          all.map((item) => (
            <div
              key={item.id}
              className="group flex items-center justify-between gap-1.5 rounded-lg border border-white/[0.05] bg-white/[0.025] px-2.5 py-1.5 hover:bg-white/[0.05]"
            >
              <button
                onClick={() => {
                  onRunInActive(item.command);
                  onClose();
                }}
                className="min-w-0 flex-1 text-left"
                title={tr('Im aktiven Terminal ausführen')}
              >
                <div className="truncate text-xs font-medium text-zinc-200">{item.label}</div>
                {item.label !== item.command && (
                  <div className="truncate font-mono text-[10px] text-zinc-500">{item.command}</div>
                )}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    onRunInAll(item.command);
                    onClose();
                  }}
                  className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-zinc-400 hover:bg-white/10 hover:text-white"
                  title={tr('In allen Terminals dieses Workspaces ausführen')}
                >
                  {tr('Alle')}
                </button>
                {item.source === 'custom' && (
                  <button
                    onClick={() => saveCustom(custom.filter((c) => c.id !== item.id))}
                    className="rounded p-1 text-zinc-500 hover:text-red-400"
                    title={tr('Löschen')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={addShortcut} className="space-y-1.5 border-t border-white/5 pt-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={tr('Name (z. B. Tests & Lint)...')}
          className="input !py-1 !px-2.5 !text-[11px] w-full"
        />
        <div className="flex items-center gap-1.5">
          <input
            value={newCmd}
            onChange={(e) => setNewCmd(e.target.value)}
            placeholder={tr('Befehl (z. B. npm test)...')}
            className="input !py-1 !px-2.5 !text-[11px] flex-1 font-mono"
          />
          <button
            type="submit"
            disabled={!newCmd.trim()}
            className="primary-button !py-1 !px-2.5 !text-[11px]"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </form>
    </div>
  );
}

export function SwarmHistoryModal({
  projectPath,
  onResumeInNewTab,
  onResumeInActiveTab,
  onClose,
}: {
  projectPath?: string;
  onResumeInNewTab(entry: CliHistoryEntry): void;
  onResumeInActiveTab(entry: CliHistoryEntry): void;
  onClose(): void;
}) {
  const [entries, setEntries] = useState<CliHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<'all' | 'claude' | 'codex' | 'agy' | 'fancycode'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const list = (await window.agentWorkspace?.searchCliHistory?.(projectPath)) || [];
      setEntries(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((item) => {
      if (vendorFilter !== 'all' && item.vendor !== vendorFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.preview.toLowerCase().includes(q) ||
        (item.projectPath || '').toLowerCase().includes(q) ||
        item.resumeCommand.toLowerCase().includes(q)
      );
    });
  }, [entries, query, vendorFilter]);

  const vendorBadge: Record<CliHistoryEntry['vendor'], string> = {
    claude: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    codex: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    agy: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    fancycode: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  };

  const iconButton =
    'rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white disabled:opacity-40 transition-colors';

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="modal-card flex h-[80vh] w-full max-w-[880px] flex-col rounded-2xl border border-white/10 bg-[#18161a] text-zinc-200 shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-200">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {tr('Zentrale CLI-History-Suche')}
              </div>
              <div className="text-[11px] text-zinc-500">
                {tr('Vergangene Sessions aus Claude Code, Codex, Antigravity & FancyCode durchsuchen und fortsetzen')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => void load()} className={iconButton} title={tr('Neu laden')}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className={iconButton} title={tr('Schließen')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Vendor Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 bg-white/[0.02] px-5 py-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('In allen CLI-Gesprächsverläufen suchen (Prompt, Datei, Projekt)...')}
              className="input !py-1.5 !pl-8 !pr-3 !text-xs w-full"
            />
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                ['all', tr('Alle')],
                ['claude', 'Claude Code'],
                ['codex', 'Codex'],
                ['agy', 'Antigravity'],
                ['fancycode', 'FancyCode'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setVendorFilter(id)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  vendorFilter === id
                    ? 'border-white/20 bg-zinc-800 text-white'
                    : 'border-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {tr('Lade CLI-Verläufe...')}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              {tr('Keine passenden CLI-Sessions gefunden.')}
            </div>
          ) : (
            filtered.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.04] hover:border-white/[0.12] p-3.5 transition-all"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${vendorBadge[entry.vendor]}`}
                    >
                      {entry.vendorLabel}
                    </span>
                    <span className="truncate text-xs font-semibold text-white">
                      {entry.title}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.updatedAt).toLocaleString()}
                    </span>
                    <span className="rounded bg-white/[0.04] px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
                      {entry.messageCount} {tr('Nachrichten')}
                    </span>
                  </div>
                  {entry.preview && (
                    <p className="text-[11px] text-zinc-400 line-clamp-2">{entry.preview}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[10px] font-mono text-zinc-500">
                    {entry.projectPath && (
                      <span className="inline-flex items-center gap-1 truncate max-w-[360px]">
                        <FolderOpen className="w-3 h-3 shrink-0" />
                        {entry.projectPath}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-zinc-400">
                      <Terminal className="w-3 h-3 shrink-0" />
                      {entry.resumeCommand}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      onResumeInActiveTab(entry);
                      onClose();
                    }}
                    className="secondary-button !py-1.5 !px-2.5 !text-xs"
                    title={tr('Resume-Befehl im aktuell ausgewählten Terminal ausführen')}
                  >
                    {tr('Im aktiven Tab')}
                  </button>
                  <button
                    onClick={() => {
                      onResumeInNewTab(entry);
                      onClose();
                    }}
                    className="primary-button !py-1.5 !px-3 !text-xs"
                    title={tr('Neues Terminal-Tab öffnen und diese Session fortsetzen')}
                  >
                    <Play className="w-3 h-3" />
                    {tr('Neues Tab')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function SwarmKanbanBoard({
  tasks,
  setTasks,
  tabs,
  workspaceId,
  projectId,
  onDispatchToTab,
  onClose,
}: {
  tasks: SwarmTask[];
  setTasks: React.Dispatch<React.SetStateAction<SwarmTask[]>>;
  tabs: TerminalTab[];
  workspaceId: string;
  projectId?: string;
  onDispatchToTab(task: SwarmTask, tab: TerminalTab): void;
  onClose(): void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [targetTabId, setTargetTabId] = useState<string>('');
  const [assignMenuTaskId, setAssignMenuTaskId] = useState<string | null>(null);

  const columns: { id: SwarmTaskStatus; title: string; dotClass: string }[] = [
    { id: 'todo', title: tr('Offen'), dotClass: 'bg-zinc-500' },
    { id: 'in_progress', title: tr('In Arbeit'), dotClass: 'bg-amber-400 animate-pulse' },
    { id: 'done', title: tr('Erledigt'), dotClass: 'bg-emerald-400' },
  ];

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const assignedTab = tabs.find((t) => t.id === targetTabId);
    const now = Date.now();
    const task: SwarmTask = {
      id: `task-${Math.random().toString(36).slice(2, 8)}`,
      title,
      description: newDesc.trim() || undefined,
      status: assignedTab ? 'in_progress' : 'todo',
      workspaceId,
      projectId,
      sessionId: assignedTab?.id,
      assignee: assignedTab?.title,
      branch: assignedTab?.worktreeBranch,
      createdAt: now,
      updatedAt: now,
    };
    setTasks((prev) => [task, ...prev]);
    setNewTitle('');
    setNewDesc('');
    if (assignedTab) {
      onDispatchToTab(task, assignedTab);
    }
  };

  const updateStatus = (taskId: string, status: SwarmTaskStatus) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status, updatedAt: Date.now() } : t)),
    );
  };

  const removeTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  return (
    <section className="panel panel-animate mb-4 !p-4 border border-white/[0.08] bg-[#18161a]/90 backdrop-blur-xl shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-amber-300">
            <Kanban className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">
                {tr('Swarm-Aufgaben')}
              </span>
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
                MCP: fancycode_task_*
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white transition-colors"
          title={tr('Schließen')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <form onSubmit={handleAddTask} className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={tr('Neue Aufgabe für den Agent-Schwarm...')}
          className="input !py-1.5 !px-3 !text-xs flex-1 min-w-[200px]"
        />
        <input
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder={tr('Details / Zieldateien (optional)...')}
          className="input !py-1.5 !px-3 !text-xs flex-1 min-w-[180px]"
        />
        <select
          value={targetTabId}
          onChange={(e) => setTargetTabId(e.target.value)}
          className="input !py-1.5 !px-2.5 !text-xs bg-[#141216] text-zinc-300"
        >
          <option value="">{tr('Nur auf Board anlegen')}</option>
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tr('Direkt an:')} {tab.title}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="primary-button !py-1.5 !px-3 !text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          {targetTabId ? tr('Starten') : tr('Hinzufügen')}
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 max-h-[240px] overflow-y-auto custom-scrollbar pr-0.5">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              className="flex flex-col rounded-xl border border-white/[0.06] bg-black/25 p-2.5 min-h-[120px]"
            >
              <div className="flex items-center justify-between mb-2 px-0.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${col.dotClass}`} />
                  {col.title}
                </span>
                <span className="rounded bg-white/[0.04] px-1.5 py-0.2 text-[10px] font-mono text-zinc-500">
                  {colTasks.length}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 flex-1">
                {colTasks.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-[11px] text-zinc-600 py-4">
                    {tr('Keine Aufgaben')}
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const linkedTab = tabs.find((t) => t.id === task.sessionId);
                    return (
                      <div
                        key={task.id}
                        className="group rounded-lg border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.04] hover:border-white/[0.12] p-2.5 text-xs transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-zinc-100 leading-snug">
                            {task.title}
                          </span>
                          <button
                            onClick={() => removeTask(task.id)}
                            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-0.5 shrink-0 transition-opacity"
                            title={tr('Löschen')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        {task.description && (
                          <p className="mt-1 text-[11px] text-zinc-400 line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        {task.result && (
                          <p className="mt-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[10px] text-emerald-300">
                            ✓ {task.result}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-white/[0.05]">
                          <div className="flex flex-wrap items-center gap-1">
                            {(linkedTab || task.assignee) && (
                              <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-300">
                                {linkedTab?.title || task.assignee}
                              </span>
                            )}
                            {(task.branch || linkedTab?.worktreeBranch) && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300">
                                <GitBranch className="w-2.5 h-2.5" />
                                {(task.branch || linkedTab?.worktreeBranch || '').replace(/^swarm\//, '')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 relative">
                            {col.id !== 'done' && (
                              <div className="relative">
                                <button
                                  onClick={() =>
                                    setAssignMenuTaskId(
                                      assignMenuTaskId === task.id ? null : task.id,
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-zinc-200 hover:bg-white/10 hover:text-white transition-colors"
                                  title={tr('An ein Terminal schicken')}
                                >
                                  <Send className="w-2.5 h-2.5" />
                                  {tr('Senden')}
                                </button>
                                {assignMenuTaskId === task.id && (
                                  <div className="dropdown-pop absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-white/10 bg-[#18161a] p-1 shadow-2xl">
                                    {tabs.map((tab) => (
                                      <button
                                        key={tab.id}
                                        onClick={() => {
                                          setAssignMenuTaskId(null);
                                          onDispatchToTab(task, tab);
                                        }}
                                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11px] text-zinc-200 hover:bg-white/[0.07]"
                                      >
                                        <span className="truncate">{tab.title}</span>
                                        <Play className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {col.id !== 'todo' && (
                              <button
                                onClick={() => updateStatus(task.id, 'todo')}
                                className="rounded-md border border-white/5 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10 hover:text-white"
                              >
                                {tr('Offen')}
                              </button>
                            )}
                            {col.id !== 'done' && (
                              <button
                                onClick={() => updateStatus(task.id, 'done')}
                                className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/20"
                              >
                                <Check className="w-2.5 h-2.5" />
                                {tr('Fertig')}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SwarmDiffDrawer({
  tabs,
  activeTabId,
  baseProjectPath,
  onSelectTab,
  onIsolateTabWorktree,
  onRemoveTabWorktree,
  onClose,
}: {
  tabs: TerminalTab[];
  activeTabId: string;
  baseProjectPath?: string;
  onSelectTab(tabId: string): void;
  onIsolateTabWorktree(tab: TerminalTab): Promise<void>;
  onRemoveTabWorktree(tab: TerminalTab, mergeIntoMain: boolean): Promise<void>;
  onClose(): void;
}) {
  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const targetCwd = currentTab?.worktreePath || currentTab?.cwd || baseProjectPath || '';

  const [status, setStatus] = useState<GitDiffStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadDiff = async () => {
    if (!targetCwd || !window.agentWorkspace?.getGitDiffStatus) return;
    setLoading(true);
    try {
      const res = await window.agentWorkspace.getGitDiffStatus(targetCwd);
      setStatus(res);
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err?.message || 'Git-Status fehlgeschlagen.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedFile(null);
    setFeedback(null);
    void loadDiff();
    const timer = window.setInterval(() => void loadDiff(), 4500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCwd, activeTabId]);

  const totals = useMemo(() => {
    const files = status?.files || [];
    return files.reduce(
      (acc, f) => ({
        add: acc.add + (f.additions || 0),
        del: acc.del + (f.deletions || 0),
      }),
      { add: 0, del: 0 },
    );
  }, [status]);

  const filteredDiff = useMemo(() => {
    const raw = status?.diff || '';
    if (!selectedFile || !raw) return raw;
    const chunks = raw.split(/(?=^diff --git )/m);
    const match = chunks.filter((chunk) => chunk.includes(` b/${selectedFile}`));
    return match.join('\n').trim() || raw;
  }, [status, selectedFile]);

  const generateCommitMessage = () => {
    const files = status?.files || [];
    if (!files.length) return;
    const names = files.slice(0, 3).map((f) => f.path.split('/').pop() || f.path);
    const allNew = files.every((f) => f.status === 'A' || f.status === '?');
    const prefix = allNew ? 'feat' : 'fix';
    const scope = currentTab?.worktreeBranch
      ? `(${currentTab.worktreeBranch.replace(/^swarm\//, '')})`
      : '';
    const summary =
      files.length <= 3
        ? names.join(', ')
        : `${names.slice(0, 2).join(', ')} (+${files.length - 2} files)`;
    setCommitMessage(`${prefix}${scope}: update ${summary}`);
  };

  const handleCommit = async (push: boolean) => {
    if (!targetCwd || !commitMessage.trim() || !window.agentWorkspace?.gitCommit) return;
    setCommitting(true);
    setFeedback(null);
    try {
      const res = await window.agentWorkspace.gitCommit({
        cwd: targetCwd,
        message: commitMessage.trim(),
        push,
      });
      if (!res.ok) {
        setFeedback({ kind: 'err', text: res.error || 'Commit fehlgeschlagen.' });
      } else {
        setCommitMessage('');
        setFeedback({
          kind: 'ok',
          text: push ? tr('Commit erstellt und gepusht.') : tr('Commit erfolgreich erstellt.'),
        });
        await loadDiff();
      }
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err?.message || 'Commit fehlgeschlagen.' });
    } finally {
      setCommitting(false);
    }
  };

  const iconButton =
    'rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white disabled:opacity-40 transition-colors';

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="modal-card flex h-[84vh] w-full max-w-[980px] flex-col rounded-2xl border border-white/10 bg-[#18161a] text-zinc-200 shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-200">
              <GitBranch className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {tr('Git-Worktrees & Live-Diff')}
                </span>
                {status?.isRepository && (
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                    {status.branch || 'HEAD'}
                  </span>
                )}
                {status && status.files.length > 0 && (
                  <span className="font-mono text-xs text-zinc-500">
                    <span className="text-emerald-400">+{totals.add}</span> /{' '}
                    <span className="text-red-400">-{totals.del}</span>
                  </span>
                )}
              </div>
              <div className="truncate font-mono text-[11px] text-zinc-500">
                {targetCwd || tr('Kein Projektordner ausgewählt')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => void loadDiff()}
              className={iconButton}
              title={tr('Diff aktualisieren')}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className={iconButton} title={tr('Schließen')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal Tab Switcher + Worktree Isolation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 bg-white/[0.02] px-5 py-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
            {tabs.map((tab) => {
              const active = tab.id === currentTab?.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors shrink-0 ${
                    active
                      ? 'border-white/20 bg-zinc-800 text-white shadow-sm'
                      : 'border-transparent bg-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                  }`}
                >
                  <span>{tab.title}</span>
                  {tab.worktreeBranch && (
                    <span className="rounded bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.2 font-mono text-[10px] text-emerald-300">
                      {tab.worktreeBranch.replace(/^swarm\//, '')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {currentTab && (
            <div className="flex items-center gap-2 shrink-0">
              {!currentTab.worktreePath ? (
                <button
                  disabled={worktreeBusy || !baseProjectPath}
                  onClick={async () => {
                    setWorktreeBusy(true);
                    setFeedback(null);
                    try {
                      await onIsolateTabWorktree(currentTab);
                      setFeedback({
                        kind: 'ok',
                        text: tr('Worktree angelegt & Terminal in den isolierten Branch gewechselt.'),
                      });
                    } catch (err: any) {
                      setFeedback({
                        kind: 'err',
                        text: err?.message || 'Worktree konnte nicht erstellt werden.',
                      });
                    } finally {
                      setWorktreeBusy(false);
                    }
                  }}
                  className="secondary-button !py-1 !px-2.5 !text-xs"
                >
                  {worktreeBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  {tr('In Worktree isolieren')}
                </button>
              ) : (
                <>
                  <button
                    disabled={worktreeBusy}
                    onClick={async () => {
                      setWorktreeBusy(true);
                      setFeedback(null);
                      try {
                        await onRemoveTabWorktree(currentTab, true);
                        setFeedback({
                          kind: 'ok',
                          text: tr('Worktree-Branch in den Hauptbranch gemergt und aufgeräumt.'),
                        });
                      } catch (err: any) {
                        setFeedback({
                          kind: 'err',
                          text: err?.message || 'Merge fehlgeschlagen.',
                        });
                      } finally {
                        setWorktreeBusy(false);
                      }
                    }}
                    className="secondary-button !py-1 !px-2.5 !text-xs !border-emerald-500/30 !bg-emerald-500/10 !text-emerald-300 hover:!bg-emerald-500/20"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    {tr('In Hauptbranch mergen')}
                  </button>
                  <button
                    disabled={worktreeBusy}
                    onClick={async () => {
                      setWorktreeBusy(true);
                      try {
                        await onRemoveTabWorktree(currentTab, false);
                      } finally {
                        setWorktreeBusy(false);
                      }
                    }}
                    className="secondary-button !py-1 !px-2.5 !text-xs"
                  >
                    {tr('Worktree trennen')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {feedback && (
          <div
            className={`mx-5 mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              feedback.kind === 'ok'
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/25 bg-red-500/10 text-red-300'
            }`}
          >
            {feedback.kind === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Main Body: File List + Unified Diff */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="w-64 shrink-0 border-r border-white/5 bg-black/20 overflow-y-auto p-3 custom-scrollbar">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="section-label">
                {tr('Dateien')} ({status?.files.length || 0})
              </span>
              {selectedFile && (
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-[10px] text-zinc-400 hover:text-white"
                >
                  {tr('Alle')}
                </button>
              )}
            </div>

            {!status?.isRepository ? (
              <p className="px-1 text-xs text-zinc-500 py-4">
                {tr('Kein Git-Repository im Ordner.')}
              </p>
            ) : status.files.length === 0 ? (
              <p className="px-1 text-xs text-zinc-500 py-4">
                {tr('Working Tree ist sauber.')}
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {status.files.map((file) => {
                  const active = selectedFile === file.path;
                  return (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFile(active ? null : file.path)}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                        active
                          ? 'bg-white/10 text-white border border-white/15'
                          : 'text-zinc-300 hover:bg-white/[0.04] border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <FileCode2 className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                        <span className="truncate font-mono text-[11px]" title={file.path}>
                          {file.path}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 font-mono text-[10px] shrink-0">
                        {file.additions > 0 && (
                          <span className="text-emerald-400">+{file.additions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span className="text-red-400">-{file.deletions}</span>
                        )}
                        <span className="rounded bg-white/[0.06] px-1 text-[9px] text-zinc-400">
                          {file.status}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4 font-mono text-xs custom-scrollbar bg-black/35">
            {!filteredDiff ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                {status?.isRepository
                  ? tr('Keine uncommitteten Änderungen.')
                  : tr('Wähle einen Projektordner mit Git-Repository.')}
              </div>
            ) : (
              <pre className="leading-relaxed whitespace-pre-wrap break-all">
                {filteredDiff.split('\n').map((line, idx) => {
                  let cls = 'text-zinc-300';
                  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')) {
                    cls = 'text-zinc-100 font-semibold';
                  } else if (line.startsWith('@@')) {
                    cls = 'text-sky-300 bg-sky-500/10';
                  } else if (line.startsWith('+')) {
                    cls = 'text-emerald-300 bg-emerald-500/10';
                  } else if (line.startsWith('-')) {
                    cls = 'text-red-300 bg-red-500/10';
                  }
                  return (
                    <div key={idx} className={`px-2 py-0.2 rounded-sm ${cls}`}>
                      {line || ' '}
                    </div>
                  );
                })}
              </pre>
            )}
          </div>
        </div>

        {/* 1-Click Commit Footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-white/[0.02] px-5 py-3">
          <button
            type="button"
            onClick={generateCommitMessage}
            disabled={!status?.files.length}
            className="secondary-button !py-1.5 !px-3 !text-xs"
            title={tr('Commit-Nachricht aus geänderten Dateien vorschlagen')}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            {tr('Auto-Message')}
          </button>
          <input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder={tr('Commit-Nachricht...')}
            className="input !py-1.5 !px-3 !text-xs flex-1 min-w-[220px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && commitMessage.trim()) {
                void handleCommit(false);
              }
            }}
          />
          <button
            type="button"
            disabled={committing || !commitMessage.trim() || !status?.files.length}
            onClick={() => void handleCommit(false)}
            className="primary-button !py-1.5 !px-3.5 !text-xs"
          >
            {committing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GitCommit className="w-3.5 h-3.5" />
            )}
            {tr('Commit')}
          </button>
          <button
            type="button"
            disabled={committing || !commitMessage.trim() || !status?.files.length}
            onClick={() => void handleCommit(true)}
            className="secondary-button !py-1.5 !px-3.5 !text-xs"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            {tr('Commit & Push')}
          </button>
        </div>
      </div>
    </div>
  );
}
