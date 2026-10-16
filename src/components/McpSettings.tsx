import { useCallback, useEffect, useState } from 'react';
import { Bot, Check, Copy, Loader2, Play, Plug, RefreshCw, Square, Wrench } from 'lucide-react';
import { useAppContext } from '../AppContext';
import type { McpServerInfo, McpSessionInfo } from '../types';

// The MCP tab: CodeForge's own MCP server, the servers Claude Code / Cursor / Codex spawn from their
// config files, and a look at the tools each of them exposes. Starting a server speaks the real MCP
// handshake; stopping it ends the process again.

const TRANSPORT_LABEL: Record<McpServerInfo['transport'], string> = {
  stdio: 'stdio (lokaler Prozess)',
  http: 'HTTP',
  sse: 'SSE',
  unknown: 'unbekannt',
};

function StatusBadge({ server, session }: { server: McpServerInfo; session?: McpSessionInfo }) {
  const tone = session
    ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
    : server.status === 'missing-command'
      ? 'text-red-300 bg-red-500/10 border-red-500/20'
      : server.status === 'configured'
        ? 'text-zinc-300 bg-white/[0.06] border-white/10'
        : 'text-zinc-500 bg-white/[0.03] border-white/10';
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {session ? 'läuft' : server.status === 'missing-command' ? 'nicht gefunden' : 'bereit'}
    </span>
  );
}

// In the browser (CodeForge Web) the bridge answers over a socket that may never come up; a slow or
// missing answer must not leave the tab spinning forever.
function withTimeout<T>(promise: Promise<T>, fallback: T, ms = 6000): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms)),
  ]);
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-[11px] leading-5">
      <div className="w-[86px] shrink-0 text-zinc-600">{label}</div>
      <div className="min-w-0 flex-1 break-all text-zinc-400">{value}</div>
    </div>
  );
}

function ServerCard({
  server,
  session,
  busy,
  note,
  canControl,
  onToggle,
  extra,
}: {
  server: McpServerInfo;
  session?: McpSessionInfo;
  busy: boolean;
  note?: { ok: boolean; text: string };
  canControl: boolean;
  onToggle(): void;
  extra?: React.ReactNode;
}) {
  const tools = session?.tools || [];
  return (
    <div className={`panel border transition-colors ${session ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-white/10'}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg border border-white/10 bg-black/30 p-1.5">
          <Plug className="w-3.5 h-3.5 text-zinc-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{server.name}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-400">{server.source}</span>
            <StatusBadge server={server} session={session} />
          </div>
          {server.details && <p className="mt-1 text-[11px] leading-4 text-zinc-500">{server.details}</p>}
          <div className="mt-2 space-y-0.5">
            <InfoRow label="Transport" value={TRANSPORT_LABEL[server.transport]} />
            <InfoRow label="Befehl" value={[server.command, ...(server.args || [])].filter(Boolean).join(' ')} />
            <InfoRow label="URL" value={server.url} />
            <InfoRow label="Konfig" value={server.sourcePath} />
            {session?.pid && <InfoRow label="Prozess" value={`PID ${session.pid}`} />}
            {session?.serverVersion && (
              <InfoRow label="Server" value={[session.serverName, session.serverVersion].filter(Boolean).join(' ')} />
            )}
            {session?.protocolVersion && <InfoRow label="Protokoll" value={session.protocolVersion} />}
          </div>
        </div>
        {canControl && (
          <button
            onClick={onToggle}
            disabled={busy}
            className={`shrink-0 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors disabled:opacity-50 ${
              session
                ? 'border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
            }`}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : session ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {session ? 'Stoppen' : 'Starten'}
          </button>
        )}
      </div>

      {session && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <div className="flex items-center gap-2 section-label">
            <Wrench className="w-3.5 h-3.5" />
            {tools.length} Werkzeug{tools.length === 1 ? '' : 'e'} verfügbar
          </div>
          {tools.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tools.map((tool) => (
                <span
                  key={tool.name}
                  title={tool.description}
                  className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-[10px] text-zinc-400"
                >
                  {tool.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-zinc-500">Der Server hat geantwortet, aber keine Werkzeuge gemeldet.</p>
          )}
        </div>
      )}

      {note && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${note.ok ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>
          {note.text}
        </div>
      )}

      {extra}
    </div>
  );
}

export function McpSettings() {
  const { agyAccounts } = useAppContext();
  const [own, setOwn] = useState<McpServerInfo | null>(null);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [sessions, setSessions] = useState<McpSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [command, setCommand] = useState('');
  const [copied, setCopied] = useState(false);
  const [registerBusy, setRegisterBusy] = useState<'' | 'claude' | 'agy'>('');
  const [registerResult, setRegisterResult] = useState<{ ok: boolean; text: string } | null>(null);

  const api = window.agentWorkspace;
  const canControl = Boolean(api?.startMcpServer && api?.stopMcpServer);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ownServer, found, running] = await Promise.all([
        withTimeout(api?.getOwnMcpServer?.() ?? Promise.resolve(null), null),
        withTimeout(api?.getMcpServers?.() ?? Promise.resolve<McpServerInfo[]>([]), []),
        withTimeout(api?.getMcpSessions?.() ?? Promise.resolve<McpSessionInfo[]>([]), []),
      ]);
      setOwn(ownServer);
      setServers(found);
      setSessions(running);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    void api?.getMcpInfo?.().then((info) => {
      const env = Object.entries(info.env).map(([key, value]) => `${key}=${value} `).join('');
      setCommand(`${env}"${info.command}" ${info.args.map((arg) => `"${arg}"`).join(' ')}`);
    });
    // A server that stops on its own must not stay listed as running.
    return api?.onMcpSessionEnded?.(() => void refresh());
  }, [api, refresh]);

  const toggle = async (server: McpServerInfo, session?: McpSessionInfo) => {
    setBusyId(server.id);
    setNotes((current) => ({ ...current, [server.id]: { ok: true, text: '' } }));
    try {
      if (session) {
        const answer = await api!.stopMcpServer!({ id: server.id });
        setNotes((current) => ({
          ...current,
          [server.id]: { ok: answer.ok, text: answer.ok ? 'Server gestoppt.' : answer.error || 'Stoppen fehlgeschlagen.' },
        }));
      } else {
        const answer = await api!.startMcpServer!({ id: server.id });
        const started = answer.session;
        if (answer.ok && started) {
          setSessions((current) => [...current.filter((item) => item.id !== server.id), started]);
          setNotes((current) => ({
            ...current,
            [server.id]: { ok: true, text: `Verbunden: ${started.tools.length} Werkzeuge.` },
          }));
        } else {
          setNotes((current) => ({
            ...current,
            [server.id]: { ok: false, text: answer.error || 'Der Server liess sich nicht starten.' },
          }));
        }
      }
      await refresh();
    } catch (error) {
      setNotes((current) => ({
        ...current,
        [server.id]: { ok: false, text: error instanceof Error ? error.message : 'Aktion fehlgeschlagen.' },
      }));
    } finally {
      setBusyId('');
    }
  };

  const register = async (target: 'claude' | 'agy') => {
    if (!api?.registerMcp) return;
    setRegisterBusy(target);
    setRegisterResult(null);
    try {
      const answer = await api.registerMcp({ target, accountIds: agyAccounts.map((account) => account.id) });
      const name =
        target === 'claude'
          ? 'Claude Code'
          : `Antigravity (Hauptlogin + ${agyAccounts.length} Account${agyAccounts.length === 1 ? '' : 's'} auf diesem PC)`;
      setRegisterResult({
        ok: answer.ok,
        text: answer.ok ? `In ${name} eingetragen. Dort neu starten, dann ist "codeforge" verfuegbar.` : answer.output,
      });
    } catch (error) {
      setRegisterResult({ ok: false, text: error instanceof Error ? error.message : 'Eintragen fehlgeschlagen.' });
    } finally {
      setRegisterBusy('');
    }
  };

  const sessionFor = (id: string) => sessions.find((session) => session.id === id);
  const ownSession = own ? sessionFor(own.id) : undefined;

  const registerButton = 'flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.08] disabled:opacity-50';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] leading-4 text-zinc-500">
          MCP-Server verbinden Agenten mit CodeForge und anderen Werkzeugen. Hier startest du einen Server, um seine
          Werkzeuge zu sehen; Stoppen beendet den Prozess wieder.
        </p>
        <button onClick={() => void refresh()} disabled={loading} className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.08] disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Neu laden
        </button>
      </div>

      {!canControl && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          Server lassen sich nur in der Desktop-App starten und stoppen. Die Infos unten kommen aus deinen Konfigurationsdateien.
        </div>
      )}

      <section>
        {api?.getOwnMcpServer && <div className="section-label">CodeForge MCP-Server</div>}
        {!api?.getOwnMcpServer ? (
          <p className="mt-2 text-[11px] leading-4 text-zinc-500">
            Den eigenen MCP-Server von CodeForge zeigt nur die Desktop-App; hier steht nur, was in deinen Konfigurationsdateien steht.
          </p>
        ) : own ? (
          <div className="mt-2">
            <ServerCard
              server={own}
              session={ownSession}
              busy={busyId === own.id}
              note={notes[own.id]}
              canControl={canControl}
              onToggle={() => void toggle(own, ownSession)}
              extra={
                <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
                  {api?.registerMcp && (
                    <>
                      <p className="text-[11px] leading-4 text-zinc-500">
                        Ein Agent wie Claude Code kann damit alle Terminals sehen, Aufgaben schicken, auf Ergebnisse warten und
                        Sessions starten oder fortsetzen. Lesen und Senden geht auch, wenn CodeForge zu ist.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => void register('claude')} disabled={Boolean(registerBusy)} className={registerButton}>
                          {registerBusy === 'claude' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                          In Claude Code eintragen
                        </button>
                        <button onClick={() => void register('agy')} disabled={Boolean(registerBusy)} className={registerButton}>
                          {registerBusy === 'agy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                          In Antigravity eintragen
                        </button>
                      </div>
                      {registerResult && (
                        <div className={`whitespace-pre-wrap rounded-lg border px-3 py-2 text-[11px] ${registerResult.ok ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>
                          {registerResult.text}
                        </div>
                      )}
                    </>
                  )}
                  {command && (
                    <div>
                      <div className="text-[11px] text-zinc-500">Für andere Tools (stdio-Befehl):</div>
                      <div className="mt-1 flex items-start gap-2">
                        <code className="min-w-0 flex-1 break-all rounded-lg border border-white/5 bg-black/30 px-2 py-1.5 text-[10px] text-zinc-400">{command}</code>
                        <button
                          onClick={() => {
                            void navigator.clipboard.writeText(command);
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1500);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-zinc-200"
                          title="Kopieren"
                        >
                          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              }
            />
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-zinc-500">Dieser Rechner hat noch keinen CodeForge-MCP-Server.</p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div className="section-label">Gefundene Server ({servers.length})</div>
          <div className="text-[10px] text-zinc-600">{sessions.length} verbunden</div>
        </div>
        {servers.length === 0 ? (
          <p className="mt-2 text-[11px] leading-4 text-zinc-500">
            In den Konfigurationen von Claude Desktop, Cursor und Codex steht kein MCP-Server. Trage dort einen ein, dann
            erscheint er hier.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {servers.map((server) => {
              const session = sessionFor(server.id);
              return (
                <ServerCard
                  key={server.id}
                  server={server}
                  session={session}
                  busy={busyId === server.id}
                  note={notes[server.id]}
                  canControl={canControl && (Boolean(server.command) || Boolean(server.url))}
                  onToggle={() => void toggle(server, session)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
