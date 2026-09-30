import { useState, useSyncExternalStore } from 'react';
import { KeyRound, Loader2, Monitor, Pencil, Plug, Plus, Server, SquareTerminal, Trash2, Upload } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { harnessIcon } from '../harnessIcons';
import type { CliHarness, VServer } from '../types';

// Saved V-Servers (SSH hosts). Stored locally; the private key is copied into
// CodeForge's data folder when uploaded, so the original file may be moved.

const STORAGE_KEY = 'agentWorkspace.vservers';
const listeners = new Set<() => void>();

function readServers(): VServer[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let servers = readServers();

function saveServers(next: VServer[]) {
  servers = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

function useServers() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => servers,
  );
}

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function VServerPanel({ onCancel }: { onCancel(): void }) {
  const list = useServers();
  const { startVServerSession } = useAppContext();
  const [editing, setEditing] = useState<VServer | 'new' | null>(list.length ? null : 'new');
  const [connecting, setConnecting] = useState('');
  const [error, setError] = useState('');

  const connect = async (server: VServer) => {
    setConnecting(server.id);
    setError('');
    try {
      saveServers(servers.map((item) => (item.id === server.id ? { ...item, lastConnectedAt: Date.now() } : item)));
      await startVServerSession(server);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verbindung konnte nicht gestartet werden.');
      setConnecting('');
    }
  };

  const remove = (server: VServer) => {
    if (!window.confirm(`V-Server "${server.name}" entfernen?`)) return;
    if (server.keyPath && !servers.some((item) => item.id !== server.id && item.keyPath === server.keyPath)) {
      void window.agentWorkspace?.removeSshKey(server.keyPath);
    }
    saveServers(servers.filter((item) => item.id !== server.id));
  };

  if (editing) {
    return (
      <VServerForm
        initial={editing === 'new' ? undefined : editing}
        onCancel={() => (list.length ? setEditing(null) : onCancel())}
        onSave={(server) => {
          const exists = servers.some((item) => item.id === server.id);
          saveServers(exists ? servers.map((item) => (item.id === server.id ? server : item)) : [...servers, server]);
          setEditing(null);
        }}
      />
    );
  }

  const sorted = [...list].sort((a, b) => (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0));

  return (
    <section className="panel w-full mt-8 p-6 border border-white/10 bg-black/20 backdrop-blur-md rounded-2xl shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="section-label">V-Server</div>
        <button onClick={() => setEditing('new')} className="secondary-button !py-1.5 !px-3 text-xs flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Hinzufuegen
        </button>
      </div>

      <div className="space-y-2">
        {sorted.map((server) => (
          <div
            key={server.id}
            className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 hover:bg-white/[0.06] transition-colors"
          >
            <button onClick={() => void connect(server)} disabled={Boolean(connecting)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-sky-400/20 bg-sky-500/10">
                {connecting === server.id ? <Loader2 className="w-4 h-4 animate-spin text-sky-300" /> : <Server className="w-4 h-4 text-sky-300" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">{server.name}</span>
                <span className="block truncate font-mono text-[11px] text-zinc-500">
                  {server.user ? `${server.user}@` : ''}{server.host}:{server.port}
                  {server.keyName ? ` · ${server.keyName}` : ' · Passwort'}
                </span>
              </span>
            </button>
            <button onClick={() => setEditing(server)} className="rounded-lg p-2 text-zinc-500 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100" title="Bearbeiten">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => remove(server)} className="rounded-lg p-2 text-zinc-500 opacity-0 transition hover:bg-red-500/15 hover:text-red-300 group-hover:opacity-100" title="Entfernen">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => void connect(server)}
              disabled={Boolean(connecting)}
              className="primary-button !py-1.5 !px-3 text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plug className="w-3.5 h-3.5" />
              Verbinden
            </button>
          </div>
        ))}
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{error}</div>}

      <button onClick={onCancel} className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05]">
        Zurueck
      </button>
    </section>
  );
}

function VServerForm({ initial, onCancel, onSave }: { initial?: VServer; onCancel(): void; onSave(server: VServer): void }) {
  const [name, setName] = useState(initial?.name || '');
  const [host, setHost] = useState(initial?.host || '');
  const [port, setPort] = useState(String(initial?.port || 22));
  const [user, setUser] = useState(initial?.user || 'root');
  const [keyPath, setKeyPath] = useState(initial?.keyPath || '');
  const [keyName, setKeyName] = useState(initial?.keyName || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const uploadKey = async () => {
    setError('');
    const source = await window.agentWorkspace?.selectLocalFile({ title: 'Privaten SSH-Key auswaehlen (z.B. id_ed25519)' });
    if (!source) return;
    setBusy(true);
    try {
      const result = await window.agentWorkspace!.importSshKey({ sourcePath: source });
      if (keyPath && keyPath !== initial?.keyPath) void window.agentWorkspace?.removeSshKey(keyPath);
      setKeyPath(result.keyPath);
      setKeyName(result.keyName);
    } catch (err) {
      setError(cleanIpcError(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const portNumber = Number(port);
    const cleanHost = host.trim().replace(/^ssh:\/\//i, '');
    if (!cleanHost) return setError('Adresse fehlt.');
    if (!/^[a-z0-9._:\[\]-]+$/i.test(cleanHost)) return setError('Adresse ist ungueltig (nur IP oder Hostname).');
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) return setError('Port muss zwischen 1 und 65535 liegen.');
    if (user.trim() && !/^[a-z0-9._~@-]+$/i.test(user.trim())) return setError('Benutzername ist ungueltig.');
    onSave({
      id: initial?.id || newId(),
      name: name.trim() || cleanHost,
      host: cleanHost,
      port: portNumber,
      user: user.trim(),
      keyPath,
      keyName,
      lastConnectedAt: initial?.lastConnectedAt,
    });
  };

  const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-orange-400/60';

  return (
    <section className="panel w-full mt-8 p-6 border border-white/10 bg-black/20 backdrop-blur-md rounded-2xl shadow-xl space-y-4">
      <div className="section-label">{initial ? 'V-Server bearbeiten' : 'V-Server hinzufuegen'}</div>
      <label className="block">
        <span className="mb-1 block text-[11px] text-zinc-500">Name (optional)</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="z.B. Hetzner VPS" className={field} />
      </label>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] text-zinc-500">Adresse</span>
          <input value={host} onChange={(event) => setHost(event.target.value)} placeholder="123.45.67.89 oder server.de" className={`${field} font-mono`} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-zinc-500">Port</span>
          <input value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, ''))} className={`${field} font-mono`} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-[11px] text-zinc-500">Benutzername</span>
        <input value={user} onChange={(event) => setUser(event.target.value)} placeholder="root" className={`${field} font-mono`} />
      </label>
      <div>
        <span className="mb-1 block text-[11px] text-zinc-500">SSH-Key</span>
        <div className="flex items-center gap-2">
          <div className={`${field} flex min-w-0 items-center gap-2 !py-2`}>
            <KeyRound className={`w-4 h-4 shrink-0 ${keyPath ? 'text-emerald-400' : 'text-zinc-600'}`} />
            <span className={`truncate font-mono text-xs ${keyPath ? 'text-zinc-200' : 'text-zinc-600'}`}>
              {keyName || 'Kein Key (Passwort-Login im Terminal)'}
            </span>
          </div>
          <button onClick={() => void uploadKey()} disabled={busy} className="secondary-button !py-2 !px-3 text-xs flex shrink-0 items-center gap-1.5 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Key hochladen
          </button>
          {keyPath && (
            <button
              onClick={() => {
                setKeyPath('');
                setKeyName('');
              }}
              className="rounded-lg p-2 text-zinc-500 hover:bg-white/10 hover:text-white"
              title="Key entfernen"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-600">Privaten Key waehlen (z.B. id_ed25519), nicht die .pub-Datei. Der Key wird in CodeForge gespeichert.</p>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{error}</div>}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05]">
          Abbrechen
        </button>
        <button onClick={submit} className="primary-button flex-[2] !py-2.5">
          Speichern
        </button>
      </div>
    </section>
  );
}

// Menu of the "+" button in a terminal: empty terminal or start a harness.
// In an SSH chat it first asks where the new tab runs (this PC or the V-Server).
export function NewTabMenu({
  harnesses,
  vserverName,
  onBlank,
  onHarness,
}: {
  harnesses: CliHarness[];
  vserverName?: string;
  onBlank(location: 'local' | 'vserver'): void;
  onHarness(harness: CliHarness, location: 'local' | 'vserver'): void;
}) {
  const [location, setLocation] = useState<'local' | 'vserver' | null>(vserverName ? null : 'local');
  const box = 'absolute left-0 top-full z-50 mt-2 w-60 rounded-xl border border-white/10 bg-[#18161a]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl';

  if (!location) {
    return (
      <div className={box}>
        <div className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-wider text-zinc-600">Wo soll das Tab laufen?</div>
        <button onClick={() => setLocation('local')} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.07]">
          <Monitor className="w-4 h-4 text-emerald-400" />
          <span>
            <span className="block font-medium">Auf diesem PC</span>
            <span className="block text-[10px] text-zinc-500">Lokales Terminal</span>
          </span>
        </button>
        <button onClick={() => setLocation('vserver')} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.07]">
          <Server className="w-4 h-4 text-sky-400" />
          <span className="min-w-0">
            <span className="block truncate font-medium">Auf dem V-Server</span>
            <span className="block truncate text-[10px] text-zinc-500">{vserverName}</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={box}>
      {vserverName && (
        <button onClick={() => setLocation(null)} className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300">
          {location === 'vserver' ? <Server className="w-3 h-3 text-sky-400" /> : <Monitor className="w-3 h-3 text-emerald-400" />}
          {location === 'vserver' ? vserverName : 'Dieser PC'} · aendern
        </button>
      )}
      <button onClick={() => onBlank(location)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.07]">
        <SquareTerminal className="w-4 h-4 text-zinc-400" />
        <span>
          <span className="block font-medium">Leer</span>
          <span className="block text-[10px] text-zinc-500">Terminal ohne Start-Befehl</span>
        </span>
      </button>
      <div className="my-1 border-t border-white/5" />
      <div className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-wider text-zinc-600">Harness starten</div>
      {harnesses.length === 0 ? (
        <p className="px-2.5 py-2 text-[11px] text-zinc-500">Keine Harnesses angelegt (Einstellungen).</p>
      ) : (
        harnesses.map((harness) => {
          const Icon = harnessIcon(harness.icon);
          return (
            <button
              key={harness.id}
              onClick={() => onHarness(harness, location)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.07]"
            >
              <Icon className="w-4 h-4 shrink-0 text-orange-300" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{harness.name}</span>
                <span className="block truncate font-mono text-[10px] text-zinc-500">{harness.command || 'kein Befehl'}</span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

function cleanIpcError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
