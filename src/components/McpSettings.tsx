import { tr } from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import { Bot, Check, Copy, Loader2, Plug, RefreshCw, Wrench } from 'lucide-react';
import { useAppContext } from '../AppContext';
import type { McpServerInfo, McpSessionInfo } from '../types';

// The MCP tab: FancyCode Desktop's own MCP server, the servers Claude Code / Cursor / Codex spawn from their
// config files, and a look at the tools each of them exposes. The own server starts with the app and is
// always on; foreign servers are started by their tool, so here they are only shown with their state.

const TRANSPORT_LABEL: Record<McpServerInfo['transport'], string> = {
  stdio: 'stdio (lokaler Prozess)',
  http: 'HTTP',
  sse: 'SSE',
  unknown: 'unbekannt',
};

// an/aus heisst: laeuft gerade eine Verbindung zu diesem Server (an) oder nicht (aus).
function StatusBadge({ server, session }: { server: McpServerInfo; session?: McpSessionInfo }) {
  const on = Boolean(session);
  const missing = !on && server.status === 'missing-command';
  const tone = on
    ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
    : missing
      ? 'text-red-300 bg-red-500/10 border-red-500/20'
      : 'text-zinc-400 bg-white/[0.04] border-white/10';
  return (
    <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-400' : missing ? 'bg-red-400' : 'bg-zinc-500'}`} />
      {on ? tr("an") : tr("aus")}
      {missing && <span className="text-red-300/80">· {tr("nicht gefunden")}</span>}
    </span>
  );
}

// In the browser (FancyCode Web) the bridge answers over a socket that may never come up; a slow or
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
  extra,
}: {
  server: McpServerInfo;
  session?: McpSessionInfo;
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
            <InfoRow label={tr("Transport")} value={TRANSPORT_LABEL[server.transport]} />
            <InfoRow label={tr("Befehl")} value={[server.command, ...(server.args || [])].filter(Boolean).join(' ')} />
            <InfoRow label="URL" value={server.url} />
            <InfoRow label={tr("Konfig")} value={server.sourcePath} />
            {session?.pid && <InfoRow label={tr("Prozess")} value={`PID ${session.pid}`} />}
            {session?.serverVersion && (
              <InfoRow label={tr("Server")} value={[session.serverName, session.serverVersion].filter(Boolean).join(' ')} />
            )}
            {session?.protocolVersion && <InfoRow label={tr("Protokoll")} value={session.protocolVersion} />}
          </div>
        </div>
      </div>

      {session && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <div className="flex items-center gap-2 section-label">
            <Wrench className="w-3.5 h-3.5" />
            {tools.length} {tr("Werkzeug")}{tools.length === 1 ? '' : 'e'} {tr("verfügbar")}
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
            <p className="mt-1 text-[11px] text-zinc-500">{tr("Der Server hat geantwortet, aber keine Werkzeuge gemeldet.")}</p>
          )}
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
  const [command, setCommand] = useState('');
  const [copied, setCopied] = useState(false);
  const [registerBusy, setRegisterBusy] = useState<'' | 'claude' | 'agy' | 'fancycode' | 'opencode'>('');
  const [registerResult, setRegisterResult] = useState<{ ok: boolean; text: string } | null>(null);

  const api = window.agentWorkspace;
  const canSeeState = Boolean(api?.getMcpSessions);

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

  const register = async (target: 'claude' | 'agy' | 'fancycode' | 'opencode') => {
    if (!api?.registerMcp) return;
    setRegisterBusy(target);
    setRegisterResult(null);
    try {
      const answer = await api.registerMcp({ target, accountIds: agyAccounts.map((account) => account.id) });
      const name =
        target === 'claude'
          ? 'Claude Code'
          : target === 'fancycode'
            ? 'FancyCode'
            : target === 'opencode'
              ? 'OpenCode'
              : tr("Antigravity (Hauptlogin + {count} Account(s) auf diesem PC)", { count: agyAccounts.length });
      setRegisterResult({
        ok: answer.ok,
        text: answer.ok ? tr('In {name} eingetragen. Dort neu starten, dann ist "fancycode" verfügbar.', { name }) : answer.output,
      });
    } catch (error) {
      setRegisterResult({ ok: false, text: error instanceof Error ? error.message : tr("Eintragen fehlgeschlagen.") });
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
          {tr("MCP-Server verbinden Agenten mit FancyCode Desktop und anderen Werkzeugen. Der eigene Server laeuft immer; die anderen startet das jeweilige Tool selbst, hier steht nur, ob sie gerade an sind.")}
        </p>
        <button onClick={() => void refresh()} disabled={loading} className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.08] disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {tr("Neu laden")}
        </button>
      </div>

      {!canSeeState && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          {tr("Ob ein Server gerade laeuft, zeigt nur die Desktop-App. Die Infos unten kommen aus deinen Konfigurationsdateien.")}
        </div>
      )}

      <section>
        {api?.getOwnMcpServer && <div className="section-label">{tr("FancyCode Desktop MCP-Server")}</div>}
        {!api?.getOwnMcpServer ? (
          <p className="mt-2 text-[11px] leading-4 text-zinc-500">
            {tr("Den eigenen MCP-Server von FancyCode Desktop zeigt nur die Desktop-App; hier steht nur, was in deinen Konfigurationsdateien steht.")}
          </p>
        ) : own ? (
          <div className="mt-2">
            <ServerCard
              server={own}
              session={ownSession}
              extra={
                <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
                  {api?.registerMcp && (
                    <>
                      <p className="text-[11px] leading-4 text-zinc-500">
                        {tr("Ein Agent wie Claude Code kann damit alle Terminals sehen, Aufgaben schicken, auf Ergebnisse warten und Sessions starten oder fortsetzen. Lesen und Senden geht auch, wenn FancyCode Desktop zu ist. Außerdem kann er dir Popups, Fragen mit Buttons und Formulare schicken (fancycode_notify, fancycode_ask, fancycode_form) und erkennt selbst, ob er in einem Terminal von FancyCode Desktop läuft. FancyCode bekommt den Server automatisch.")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => void register('claude')} disabled={Boolean(registerBusy)} className={registerButton}>
                          {registerBusy === 'claude' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                          {tr("In Claude Code eintragen")}
                        </button>
                        <button onClick={() => void register('agy')} disabled={Boolean(registerBusy)} className={registerButton}>
                          {registerBusy === 'agy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                          {tr("In Antigravity eintragen")}
                        </button>
                        <button onClick={() => void register('opencode')} disabled={Boolean(registerBusy)} className={registerButton}>
                          {registerBusy === 'opencode' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                          {tr("In OpenCode eintragen")}
                        </button>
                        <button onClick={() => void register('fancycode')} disabled={Boolean(registerBusy)} className={registerButton}>
                          {registerBusy === 'fancycode' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                          {tr("In FancyCode eintragen")}
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
                      <div className="text-[11px] text-zinc-500">{tr("Für andere Tools (stdio-Befehl):")}</div>
                      <div className="mt-1 flex items-start gap-2">
                        <code className="min-w-0 flex-1 break-all rounded-lg border border-white/5 bg-black/30 px-2 py-1.5 text-[10px] text-zinc-400">{command}</code>
                        <button
                          onClick={() => {
                            void navigator.clipboard.writeText(command);
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1500);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-zinc-200"
                          title={tr("Kopieren")}
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
          <p className="mt-2 text-[11px] text-zinc-500">{tr("Dieser Rechner hat noch keinen FancyCode Desktop-MCP-Server.")}</p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div className="section-label">{tr("Gefundene Server (")}{servers.length})</div>
          <div className="text-[10px] text-zinc-600">{servers.filter((server) => sessionFor(server.id)).length} {tr("an")}</div>
        </div>
        {servers.length === 0 ? (
          <p className="mt-2 text-[11px] leading-4 text-zinc-500">
            {tr("In den Konfigurationen von Claude Desktop, Cursor und Codex steht kein MCP-Server. Trage dort einen ein, dann erscheint er hier.")}
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {servers.map((server) => {
              const session = sessionFor(server.id);
              return (
                <ServerCard key={server.id} server={server} session={session} />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
