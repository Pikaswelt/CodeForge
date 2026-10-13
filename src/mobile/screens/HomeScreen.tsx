import { useCallback, useEffect, useState } from 'react';
import { Activity, ChevronRight, Cpu, FolderOpen, HardDrive, MemoryStick, Pencil, Plus, RefreshCw, Rocket, Server, SquareTerminal, Upload, Users, X } from 'lucide-react';
import AppLogo from '../../components/AppLogo';
import { harnessIcon } from '../../harnessIcons';
import { errorCode, errorMessage } from '../native';
import { killTmuxSession, listTmuxSessions, serverStats, type ServerStats } from '../remote';
import { useStore } from '../store';
import type { MobileServer } from '../types';
import { Button, Card, EmptyState, IconButton, Section, Spinner, StatusDot, cx, timeAgo } from '../ui';
import ServerEditor from './ServerEditor';
import ImportSheet from './ImportSheet';

export default function HomeScreen() {
  const { servers, terminals, setActiveTerminalId, setTab } = useStore();
  const [editing, setEditing] = useState<MobileServer | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <header className="cf-safe-top flex shrink-0 items-center gap-3 px-4 pb-3">
        <AppLogo className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.45rem] font-bold leading-tight tracking-tight">CodeForge</h1>
          <p className="cf-muted text-[0.8rem]">Unterwegs auf deinem V-Server</p>
        </div>
        <IconButton label="V-Server hinzufügen" onClick={() => setEditing('new')} className="cf-glass">
          <Plus className="h-5 w-5" />
        </IconButton>
      </header>

      <div className="cf-scroll min-h-0 flex-1 px-4 pb-6">
        {servers.length === 0 ? (
          <Card className="mt-2 overflow-hidden">
            <EmptyState
              icon={<Server className="h-8 w-8" />}
              title="Verbinde deinen V-Server"
              text="CodeForge Mobile arbeitet direkt auf deinem V-Server: Claude Code, Codex, Antigravity und Terminals laufen dort in tmux und überleben Funklöcher. Auf dem Handy selbst läuft nichts lokal."
              action={
                <div className="flex w-full flex-col gap-2">
                  <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
                    V-Server hinzufügen
                  </Button>
                  <Button icon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>
                    Vom PC übernehmen
                  </Button>
                </div>
              }
            />
          </Card>
        ) : (
          <Section title="V-Server">
            <div className="flex flex-col gap-3">
              {servers.map((server) => (
                <ServerCard key={server.id} server={server} onEdit={() => setEditing(server)} />
              ))}
            </div>
          </Section>
        )}

        {terminals.length > 0 && (
          <Section title="Offene Terminals">
            <Card className="overflow-hidden">
              {terminals.map((session, index) => {
                const Icon = harnessIcon(session.icon);
                const server = servers.find((item) => item.id === session.serverId);
                return (
                  <button
                    key={session.id}
                    onClick={() => {
                      setActiveTerminalId(session.id);
                      setTab('terminal');
                    }}
                    className={cx('cf-press flex w-full items-center gap-3 px-4 py-3 text-left active:bg-cf-hover', index > 0 && 'border-t border-cf-line')}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cf-hover cf-accent-text">
                      <Icon className="h-[1.1rem] w-[1.1rem]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.93rem] font-medium">{session.title}</span>
                      <span className="cf-muted block truncate text-[0.78rem]">{server?.name || 'Server fehlt'}</span>
                    </span>
                    <ChevronRight className="cf-muted h-4 w-4" />
                  </button>
                );
              })}
            </Card>
          </Section>
        )}
      </div>

      {editing && <ServerEditor server={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
    </div>
  );
}

type TmuxSession = { name: string; lastActivity: number; attached: number };

function ServerCard({ server, onEdit }: { server: MobileServer; onEdit: () => void }) {
  const { status, connect, withServer, harnesses, agyAccounts, terminals, openTerminal, setFilesTarget, setTab, toast, confirm } = useStore();
  const state = status[server.id]?.state || 'idle';
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [sessions, setSessions] = useState<TmuxSession[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStats, nextSessions] = await withServer(server, () => Promise.all([serverStats(server), listTmuxSessions(server)]));
      setStats(nextStats);
      setSessions(nextSessions);
    } catch (error) {
      if (errorCode(error) !== 'CANCELED') toast(errorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [server, toast, withServer]);

  useEffect(() => {
    if (state === 'online' && !stats) void refresh();
  }, [state, stats, refresh]);

  const start = (harnessId: string) => {
    const harness = harnesses.find((item) => item.id === harnessId);
    if (!harness) return;
    openTerminal({ serverId: server.id, title: harness.name, icon: harness.icon, command: harness.command || undefined });
  };

  const startAgyAccounts = () => {
    for (const account of agyAccounts) {
      openTerminal({ serverId: server.id, title: `Antigravity · ${account.name}`, icon: 'Rocket', command: 'agy', agyAccountId: account.id });
    }
  };

  const attach = (name: string) => {
    const agyId = name.startsWith('cf-agy-') ? name.slice('cf-agy-'.length) : '';
    const account = agyAccounts.find((item) => item.id === agyId);
    openTerminal({
      serverId: server.id,
      title: agyId ? `Antigravity · ${account?.name || agyId.slice(0, 12)}` : `Terminal · ${name.slice(5, 11)}`,
      icon: agyId ? 'Rocket' : 'Terminal',
      agyAccountId: agyId || undefined,
      tmuxName: name,
    });
  };

  const kill = async (name: string) => {
    const ok = await confirm({ title: 'Session beenden?', message: `Die tmux-Session ${name} wird auf dem Server beendet. Laufende Programme darin werden gestoppt.`, confirmLabel: 'Beenden', danger: true });
    if (!ok) return;
    try {
      await withServer(server, () => killTmuxSession(server, name));
      setSessions((current) => current?.filter((item) => item.name !== name) || null);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  const quick = harnesses.slice(0, 4);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 pb-2 pt-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cf-hover cf-accent-text">
          <Server className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusDot state={state} />
            <span className="truncate text-[1.02rem] font-semibold">{server.name}</span>
          </div>
          <div className="cf-muted truncate text-[0.78rem]">
            {server.user}@{server.host}{server.port !== 22 ? `:${server.port}` : ''}
            {server.lastConnectedAt ? ` · ${timeAgo(server.lastConnectedAt)}` : ''}
          </div>
        </div>
        <IconButton label="Bearbeiten" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </IconButton>
      </div>

      {state !== 'online' ? (
        <div className="px-4 pb-4 pt-1">
          {status[server.id]?.message && <p className="mb-3 text-[0.8rem] leading-snug text-red-400">{status[server.id]?.message}</p>}
          <Button variant="primary" className="w-full" busy={state === 'connecting'} onClick={() => void connect(server)}>
            {state === 'connecting' ? 'Verbinde …' : 'Verbinden'}
          </Button>
        </div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-3 gap-2 px-4 pb-1 pt-1">
              <Stat icon={<Cpu className="h-3.5 w-3.5" />} label="Last" value={stats.load.split(' ')[0] || '–'} />
              <Stat icon={<MemoryStick className="h-3.5 w-3.5" />} label="RAM" value={stats.memory || '–'} />
              <Stat icon={<HardDrive className="h-3.5 w-3.5" />} label="Disk" value={stats.disk.split(' ')[0] || '–'} />
            </div>
          )}
          {stats && !stats.tools.tmux && (
            <p className="mx-4 mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[0.78rem] leading-snug text-amber-300">
              tmux fehlt auf dem Server. Terminals funktionieren, überleben aber keinen Verbindungsabbruch. Installieren: <code>apt install tmux</code>
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 px-4 pb-3 pt-3">
            {quick.map((harness) => {
              const Icon = harnessIcon(harness.icon);
              const missing = stats && harness.command && stats.tools[harness.command] === false;
              return (
                <button
                  key={harness.id}
                  onClick={() => start(harness.id)}
                  className="cf-press flex items-center gap-2.5 rounded-2xl border border-cf-line bg-cf-hover px-3 py-3 text-left"
                >
                  <Icon className="cf-accent-text h-5 w-5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-[0.86rem] font-semibold">{harness.name}</span>
                    {missing ? <span className="block truncate text-[0.68rem] text-amber-400">nicht gefunden</span> : <span className="cf-muted block truncate text-[0.68rem]">{harness.command || 'bash'}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 px-4 pb-3">
            <Button className="flex-1" icon={<FolderOpen className="h-4 w-4" />} onClick={() => { setFilesTarget({ serverId: server.id }); setTab('files'); }}>
              Dateien
            </Button>
            {agyAccounts.length > 0 && (
              <Button className="flex-1" icon={<Users className="h-4 w-4" />} onClick={startAgyAccounts}>
                {agyAccounts.length} agy-Accounts
              </Button>
            )}
          </div>

          <div className="border-t border-cf-line">
            <div className="flex items-center px-4 pb-1 pt-2.5">
              <Activity className="cf-muted mr-2 h-3.5 w-3.5" />
              <span className="cf-muted flex-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em]">Laufende Sessions</span>
              <IconButton label="Aktualisieren" onClick={() => void refresh()} className="h-8 w-8">
                {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              </IconButton>
            </div>
            {sessions && sessions.length === 0 && <p className="cf-muted px-4 pb-3 text-[0.82rem]">Keine CodeForge-Sessions auf dem Server.</p>}
            {sessions?.map((item) => {
              const openTab = terminals.find((tab) => tab.serverId === server.id && tab.tmuxName === item.name);
              const open = Boolean(openTab);
              const agy = item.name.startsWith('cf-agy-');
              const account = agy ? agyAccounts.find((entry) => `cf-agy-${entry.id}` === item.name) : undefined;
              const label = account ? `Antigravity · ${account.name}` : agy ? `Antigravity · ${item.name.slice(7, 19)}` : openTab?.title || `Terminal · ${item.name.slice(5, 11)}`;
              return (
                <div key={item.name} className="flex items-center gap-3 px-4 py-2">
                  {agy ? <Rocket className="cf-accent-text h-4 w-4 shrink-0" /> : <SquareTerminal className="cf-accent-text h-4 w-4 shrink-0" />}
                  <button className="min-w-0 flex-1 text-left" onClick={() => attach(item.name)}>
                    <span className="block truncate text-[0.86rem] font-medium">{label}</span>
                    <span className="cf-muted block text-[0.72rem]">
                      {open ? 'In der App geöffnet' : item.attached ? 'Woanders verbunden (z.B. PC)' : 'Im Hintergrund'} · aktiv {timeAgo(item.lastActivity)}
                    </span>
                  </button>
                  <Button className="px-3 py-1.5 text-[0.78rem]" onClick={() => attach(item.name)}>Öffnen</Button>
                  <IconButton label="Session beenden" className="h-8 w-8 text-red-400" onClick={() => void kill(item.name)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
              );
            })}
            <div className="h-2" />
          </div>
        </>
      )}
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cf-hover px-2.5 py-2">
      <div className="cf-muted mb-0.5 flex items-center gap-1 text-[0.66rem] font-semibold uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="truncate text-[0.8rem] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
