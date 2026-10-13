import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, LogIn, Monitor, RefreshCw, Rocket, Server, Square } from 'lucide-react';
import { useAppContext } from '../AppContext';
import type { Chat, TerminalTab, VServerConnection } from '../types';
import { useVServers } from './VServers';

// Terminals keep running in the background (session host on this PC, tmux on V-Servers)
// while CodeForge is closed. This view lists them and re-joins the workspace they belong to.

type Listing = Awaited<ReturnType<NonNullable<typeof window.agentWorkspace>['listRunningSessions']>>;

const tabServer = (chat: Chat, tab: TerminalTab) => (tab.location === 'local' ? undefined : tab.vserver ?? chat.vserver);
const tmuxNameFor = (tab: TerminalTab) => (tab.agyAccountId ? `cf-agy-${tab.agyAccountId}` : `cf-t-${tab.id}`);
const workspaceTabs = (chat: Chat): TerminalTab[] => (chat.terminalTabs?.length ? chat.terminalTabs : [{ id: chat.id, title: chat.title }]);

export function RunningSessionsPanel({ onCancel }: { onCancel(): void }) {
  const { savedTerminalWorkspaces, rejoinTerminalWorkspace, endTerminalWorkspace, agyAccounts, startAgyAccounts } = useAppContext();
  const savedServers = useVServers();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // Every server that saved workspaces or the server list point to.
  const servers = useMemo(() => {
    const byId = new Map<string, VServerConnection>();
    for (const server of savedServers) {
      byId.set(server.id, { id: server.id, name: server.name, host: server.host, port: server.port, user: server.user, keyPath: server.keyPath });
    }
    for (const chat of savedTerminalWorkspaces) {
      for (const tab of workspaceTabs(chat)) {
        const server = tabServer(chat, tab);
        if (server && !byId.has(server.id)) byId.set(server.id, server);
      }
    }
    return [...byId.values()];
  }, [savedServers, savedTerminalWorkspaces]);

  const refresh = useCallback(async () => {
    if (!window.agentWorkspace?.listRunningSessions) {
      setError('Laufende Sessions gibt es nur in der Desktop-App.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setListing(await window.agentWorkspace.listRunningSessions({ vservers: servers }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sessions konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [servers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const localIds = useMemo(() => new Set(listing?.local.map((item) => item.id) || []), [listing]);
  const remoteByServer = useMemo(() => new Map((listing?.remote || []).map((item) => [item.id, new Set(item.sessions)])), [listing]);

  const isRunning = useCallback(
    (chat: Chat, tab: TerminalTab) => {
      if (localIds.has(tab.id)) return true;
      const server = tabServer(chat, tab);
      return Boolean(server && remoteByServer.get(server.id)?.has(tmuxNameFor(tab)));
    },
    [localIds, remoteByServer],
  );

  const workspaces = useMemo(
    () =>
      savedTerminalWorkspaces
        .map((chat) => {
          const tabs = workspaceTabs(chat);
          return { chat, total: tabs.length, running: tabs.filter((tab) => isRunning(chat, tab)).length };
        })
        .filter((item) => item.running > 0)
        .sort((a, b) => b.chat.updatedAt - a.chat.updatedAt),
    [savedTerminalWorkspaces, isRunning],
  );

  // Antigravity account sessions on a server that no saved workspace shows (e.g. rescued ones).
  const looseAgy = useMemo(() => {
    const covered = new Set<string>();
    for (const { chat } of workspaces) {
      for (const tab of workspaceTabs(chat)) {
        const server = tabServer(chat, tab);
        if (server && tab.agyAccountId) covered.add(`${server.id}:${tab.agyAccountId}`);
      }
    }
    return servers
      .map((server) => {
        const names = remoteByServer.get(server.id) || new Set<string>();
        const accounts = agyAccounts.filter((account) => names.has(`cf-agy-${account.id}`) && !covered.has(`${server.id}:${account.id}`));
        return { server, accounts };
      })
      .filter((item) => item.accounts.length > 0);
  }, [servers, remoteByServer, agyAccounts, workspaces]);

  const unreachable = (listing?.remote || []).filter((item) => !item.reachable).map((item) => servers.find((server) => server.id === item.id)?.name || item.id);
  const empty = listing && workspaces.length === 0 && looseAgy.length === 0;

  const run = async (key: string, action: () => Promise<void> | void) => {
    setBusy(key);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy('');
    }
  };

  const rowClass = 'flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3';
  const buttonClass = 'flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs disabled:opacity-50';

  return (
    <section className="panel w-full mt-8 p-6 border border-white/10 bg-black/20 backdrop-blur-md rounded-2xl shadow-xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-label">Laufende Sessions</div>
          <p className="text-xs text-zinc-500 mt-2">
            Terminals laufen weiter, auch wenn CodeForge geschlossen oder aktualisiert wird. Beitreten oeffnet den Workspace genau so wie vorher.
          </p>
        </div>
        <button onClick={() => void refresh()} disabled={loading} className="text-zinc-400 hover:text-zinc-200 disabled:opacity-50" title="Neu laden">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!listing && loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Suche laufende Sessions...
        </div>
      )}

      {empty && <p className="text-xs text-zinc-500">Gerade laeuft keine Session.</p>}

      <div className="space-y-2">
        {workspaces.map(({ chat, total, running }) => {
          const onServer = workspaceTabs(chat).some((tab) => tabServer(chat, tab));
          return (
            <div key={chat.id} className={rowClass}>
              {onServer ? <Server className="w-4 h-4 shrink-0 text-sky-400" /> : <Monitor className="w-4 h-4 shrink-0 text-emerald-400" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-200">{chat.title}</div>
                <div className="text-[11px] text-zinc-500">
                  {running} von {total} Terminal{total === 1 ? '' : 's'} laufen
                </div>
              </div>
              <button
                onClick={() => void run(chat.id, () => rejoinTerminalWorkspace(chat.id))}
                disabled={Boolean(busy)}
                className={`${buttonClass} text-zinc-100 bg-white/[0.06] hover:bg-white/[0.1]`}
              >
                <LogIn className="w-3.5 h-3.5" /> Beitreten
              </button>
              <button
                onClick={() => {
                  if (!window.confirm(`"${chat.title}" beenden? Alle Terminals darin werden geschlossen.`)) return;
                  void run(`end-${chat.id}`, async () => {
                    endTerminalWorkspace(chat.id);
                    await refresh();
                  });
                }}
                disabled={Boolean(busy)}
                className={`${buttonClass} text-red-300 hover:bg-red-500/10`}
              >
                <Square className="w-3.5 h-3.5" /> Beenden
              </button>
            </div>
          );
        })}

        {looseAgy.map(({ server, accounts }) => (
          <div key={`agy-${server.id}`} className={rowClass}>
            <Rocket className="w-4 h-4 shrink-0 text-sky-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-zinc-200">Antigravity Accounts · {server.name}</div>
              <div className="truncate text-[11px] text-zinc-500">
                {accounts.length} Account{accounts.length === 1 ? '' : 's'} laufen: {accounts.map((account) => account.name).join(', ')}
              </div>
            </div>
            <button
              onClick={() => void run(`agy-${server.id}`, async () => {
                await startAgyAccounts(accounts.map((account) => account.id), server);
              })}
              disabled={Boolean(busy)}
              className={`${buttonClass} text-zinc-100 bg-white/[0.06] hover:bg-white/[0.1]`}
            >
              <LogIn className="w-3.5 h-3.5" /> Beitreten
            </button>
            <button
              onClick={() => {
                if (!window.confirm(`Antigravity auf "${server.name}" beenden? Die laufenden agy-Sessions werden geschlossen.`)) return;
                void run(`end-agy-${server.id}`, async () => {
                  await Promise.all(accounts.map((account) => window.agentWorkspace?.killRemoteSession({ vserver: server, tmuxName: `cf-agy-${account.id}` })));
                  await refresh();
                });
              }}
              disabled={Boolean(busy)}
              className={`${buttonClass} text-red-300 hover:bg-red-500/10`}
            >
              <Square className="w-3.5 h-3.5" /> Beenden
            </button>
          </div>
        ))}
      </div>

      {unreachable.length > 0 && (
        <p className="text-[11px] text-amber-300/80">Nicht erreichbar (oder nur mit Passwort): {unreachable.join(', ')}</p>
      )}
      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{error}</div>}

      <div className="flex justify-end">
        <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-200">
          Zurueck
        </button>
      </div>
    </section>
  );
}
