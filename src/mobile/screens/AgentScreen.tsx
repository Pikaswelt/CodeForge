import { useEffect, useMemo, useState } from 'react';
import { Bot, FolderOpen, Home, Play, Sparkles } from 'lucide-react';
import { tr } from '../../i18n';
import { FancyCodePanel } from '../../fancycode/FancyCodePanel';
import { useStore } from '../store';
import { errorMessage as mobileFancyCodeError } from '../native';
import { MobileFancyCodeBridge } from '../fancycode';
import { Button, Card, EmptyState, Field } from '../ui';

// The built-in FancyCode agent on the phone. Like on the PC it runs in the project folder,
// but here that folder (and the agent process) live on the V-Server.
export default function AgentScreen() {
  const { servers, connect, toast, setTab } = useStore();
  const [serverId, setServerId] = useState(servers[0]?.id || '');
  const [cwd, setCwd] = useState(servers[0]?.defaultPath || '~');
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const server = servers.find((item) => item.id === serverId) || servers[0];
  const bridge = useMemo(() => (server ? new MobileFancyCodeBridge(server) : null), [server?.id]);
  useEffect(() => () => bridge?.dispose(), [bridge]);

  useEffect(() => {
    if (!server) return;
    setCwd(server.defaultPath || '~');
  }, [server?.id]);

  if (!server) {
    return (
      <div className="flex h-full flex-col">
        <header className="cf-safe-top flex shrink-0 items-center gap-3 px-4 pb-3">
          <Sparkles className="cf-accent-text h-6 w-6" />
          <h1 className="text-[1.35rem] font-bold leading-tight">FancyCode</h1>
        </header>
        <div className="px-4">
          <Card className="mt-2">
            <EmptyState
              icon={<Bot className="h-8 w-8" />}
              title={tr('Noch kein V-Server')}
              text={tr('Der FancyCode-Agent läuft auf deinem V-Server. Füge unter Home zuerst einen Server hinzu.')}
              action={<Button variant="primary" icon={<Home className="h-4 w-4" />} onClick={() => setTab('home')}>{tr('Zu Home')}</Button>}
            />
          </Card>
        </div>
      </div>
    );
  }

  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const online = await connect(server);
      if (!online) throw new Error(tr('Verbindung zum V-Server fehlgeschlagen.'));
      setActive(true);
    } catch (err) {
      setError(mobileFancyCodeError(err));
      toast(mobileFancyCodeError(err), 'error');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="cf-safe-top flex shrink-0 items-center gap-3 px-4 pb-2">
        <Sparkles className="cf-accent-text h-6 w-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.35rem] font-bold leading-tight">FancyCode</h1>
          <p className="cf-muted truncate text-[0.76rem]">{server.name} · {cwd}</p>
        </div>
        {active && (
          <button
            onClick={() => setActive(false)}
            className="cf-press cf-glass rounded-full px-3 py-1.5 text-[0.72rem] font-medium"
          >
            {tr('Wechseln')}
          </button>
        )}
      </header>

      {!active ? (
        <div className="cf-scroll min-h-0 flex-1 px-4 pb-6">
          <Card className="mt-2 space-y-4 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cf-hover cf-accent-text">
                <Bot className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-[0.95rem] font-semibold">{tr('Agent auf dem V-Server')}</div>
                <div className="cf-muted text-[0.76rem]">{tr('Läuft dort wie auf dem PC: mit Dateien, Terminal und Rückfragen.')}</div>
              </div>
            </div>
            <Field label={tr('V-Server')}>
              <select className="cf-input" value={server.id} onChange={(event) => setServerId(event.target.value)}>
                {servers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label={tr('Projektordner')} hint={tr('Absoluter Pfad oder ~/projekt auf dem Server')}>
              <input
                className="cf-input font-mono text-[0.9rem]"
                value={cwd}
                onChange={(event) => setCwd(event.target.value)}
                placeholder="~/mein-projekt"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            {error && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[0.78rem] text-red-300">{error}</div>}
            <Button variant="primary" className="w-full" busy={starting} icon={<Play className="h-4 w-4 fill-current" />} onClick={() => void start()}>
              {tr('Agent starten')}
            </Button>
            <p className="cf-muted flex items-start gap-2 text-[0.74rem] leading-relaxed">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0" />
              {tr('Der Agent wird beim ersten Start automatisch auf dem Server eingerichtet. Node.js muss dort installiert sein.')}
            </p>
          </Card>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <FancyCodePanel
            key={`${server.id}:${cwd}`}
            bridge={bridge!}
            cwd={cwd}
            emptyHint={tr('Der Agent startet auf dem V-Server. Der erste Start kann einen Moment dauern.')}
          />
        </div>
      )}
    </div>
  );
}
