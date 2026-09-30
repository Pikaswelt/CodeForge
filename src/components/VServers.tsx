import { useState, useSyncExternalStore } from 'react';
import { FolderOpen, KeyRound, Loader2, Monitor, Pencil, Plug, Plus, Server, SquareTerminal, Trash2, Upload, X } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { harnessIcon } from '../harnessIcons';
import type { CliHarness, VServer, VServerConnection } from '../types';
import { SftpBrowser } from './SftpBrowser';

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

export function useVServers() {
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
  const list = useVServers();
  const { startVServerSessions } = useAppContext();
  const [editing, setEditing] = useState<VServer | 'new' | null>(list.length ? null : 'new');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState(false);
  const [sftpServer, setSftpServer] = useState<VServer | null>(null);
  const [error, setError] = useState('');

  const connect = async (targets: VServer[]) => {
    if (targets.length === 0) return;
    setConnecting(true);
    setError('');
    try {
      const ids = new Set(targets.map((item) => item.id));
      saveServers(servers.map((item) => (ids.has(item.id) ? { ...item, lastConnectedAt: Date.now() } : item)));
      await startVServerSessions(targets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verbindung konnte nicht gestartet werden.');
      setConnecting(false);
    }
  };

  const remove = (server: VServer) => {
    if (!window.confirm(`V-Server "${server.name}" entfernen?`)) return;
    if (server.keyPath && !servers.some((item) => item.id !== server.id && item.keyPath === server.keyPath)) {
      void window.agentWorkspace?.removeSshKey(server.keyPath);
    }
    void window.agentWorkspace?.sftpDisconnect(server.id);
    setSelected((current) => {
      const next = new Set(current);
      next.delete(server.id);
      return next;
    });
    saveServers(servers.filter((item) => item.id !== server.id));
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
  const chosen = sorted.filter((server) => selected.has(server.id));
  const allSelected = sorted.length > 0 && chosen.length === sorted.length;

  return (
    <section className="panel w-full mt-8 p-6 border border-white/10 bg-black/20 backdrop-blur-md rounded-2xl shadow-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="section-label">V-Server ({list.length})</div>
        <div className="flex items-center gap-2">
          {sorted.length > 1 && (
            <button
              onClick={() => setSelected(allSelected ? new Set() : new Set(sorted.map((server) => server.id)))}
              className="text-xs text-zinc-400 hover:text-white"
            >
              {allSelected ? 'Keine auswaehlen' : 'Alle auswaehlen'}
            </button>
          )}
          <button onClick={() => setEditing('new')} className="primary-button !py-1.5 !px-3 text-xs flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Server hinzufuegen
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((server) => (
          <div
            key={server.id}
            className={`group flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${selected.has(server.id) ? 'border-sky-400/40 bg-sky-500/[0.07]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
          >
            <input
              type="checkbox"
              checked={selected.has(server.id)}
              onChange={() => toggle(server.id)}
              className="h-4 w-4 shrink-0 accent-sky-500"
              title="Fuer die Mehrfach-Verbindung auswaehlen"
            />
            <button onClick={() => void connect([server])} disabled={connecting} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-sky-400/20 bg-sky-500/10">
                <Server className="w-4 h-4 text-sky-300" />
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
              onClick={() => setSftpServer(server)}
              className="secondary-button !py-1.5 !px-3 text-xs flex items-center gap-1.5"
              title="Dateien per SFTP durchsuchen, hoch- und herunterladen"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              SFTP
            </button>
            <button
              onClick={() => void connect([server])}
              disabled={connecting}
              className="primary-button !py-1.5 !px-3 text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plug className="w-3.5 h-3.5" />
              Verbinden
            </button>
          </div>
        ))}
      </div>

      {sorted.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void connect(chosen)}
            disabled={connecting || chosen.length === 0}
            className="primary-button flex-1 !py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            Auswahl verbinden ({chosen.length})
          </button>
          <button
            onClick={() => void connect(sorted)}
            disabled={connecting}
            className="secondary-button flex-1 !py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            Mit allen verbinden ({sorted.length})
          </button>
        </div>
      )}
      {sorted.length > 4 && (
        <p className="text-[11px] text-zinc-600">Ab fuenf Servern oeffnen sich die Terminals als Tabs statt im Grid.</p>
      )}

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{error}</div>}

      <button onClick={onCancel} className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05]">
        Zurueck
      </button>

      {sftpServer && <SftpBrowser server={sftpServer} onClose={() => setSftpServer(null)} />}
    </section>
  );
}

// Modal form used from the terminal "+" menu to add another server on the fly.
export function AddVServerDialog({ onCancel, onSaved }: { onCancel(): void; onSaved(server: VServer): void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm" onMouseDown={onCancel}>
      <div className="relative w-full max-w-[520px]" onMouseDown={(event) => event.stopPropagation()}>
        <button onClick={onCancel} className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white" title="Schliessen">
          <X className="w-4 h-4" />
        </button>
        <VServerForm
          modal
          onCancel={onCancel}
          onSave={(server) => {
            saveServers([...servers, server]);
            onSaved(server);
          }}
        />
      </div>
    </div>
  );
}

function VServerForm({ initial, modal, onCancel, onSave }: { initial?: VServer; modal?: boolean; onCancel(): void; onSave(server: VServer): void }) {
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
    <section className={`panel w-full p-6 border border-white/10 backdrop-blur-md rounded-2xl shadow-xl space-y-4 ${modal ? 'bg-[#18161a]' : 'mt-8 bg-black/20'}`}>
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
              {keyName || 'Kein Key (Passwort-Login)'}
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

type TabTarget = 'local' | VServerConnection;

// Menu of the "+" button in a terminal. In an SSH chat it first asks where the new
// tab runs (this PC or one of the V-Servers), then whether it is empty or starts a harness.
export function NewTabMenu({
  harnesses,
  servers: savedServers,
  sshChat,
  onBlank,
  onHarness,
  onServer,
  onAddServer,
  onSftp,
}: {
  harnesses: CliHarness[];
  servers: VServer[];
  sshChat: boolean;
  onBlank(target?: TabTarget): void;
  onHarness(harness: CliHarness, target?: TabTarget): void;
  onServer(server: VServer): void;
  onAddServer(): void;
  onSftp(server: VServer): void;
}) {
  const [target, setTarget] = useState<TabTarget | null>(null);
  const box = 'absolute left-0 top-full z-50 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-white/10 bg-[#18161a]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl custom-scrollbar';
  const row = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.07]';
  const chosen = sshChat ? target : undefined;

  if (sshChat && !target) {
    return (
      <div className={box}>
        <div className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-wider text-zinc-600">Wo soll das Tab laufen?</div>
        <button onClick={() => setTarget('local')} className={row}>
          <Monitor className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>
            <span className="block font-medium">Auf diesem PC</span>
            <span className="block text-[10px] text-zinc-500">Lokales Terminal</span>
          </span>
        </button>
        {savedServers.map((server) => (
          <div key={server.id} className="flex items-center rounded-lg hover:bg-white/[0.07]">
            <button
              onClick={() => setTarget({ id: server.id, name: server.name, host: server.host, port: server.port, user: server.user, keyPath: server.keyPath })}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-xs text-zinc-200"
            >
              <Server className="w-4 h-4 shrink-0 text-sky-300" />
              <span className="min-w-0">
                <span className="block truncate font-medium">Auf {server.name}</span>
                <span className="block truncate font-mono text-[10px] text-zinc-500">{server.user ? `${server.user}@` : ''}{server.host}</span>
              </span>
            </button>
            <button onClick={() => onSftp(server)} className="mr-1 rounded-md p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white" title="SFTP-Dateien">
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button onClick={onAddServer} className={`${row} !text-sky-300`}>
          <Plus className="w-4 h-4" />
          <span className="font-medium">Neuen Server hinzufuegen</span>
        </button>
      </div>
    );
  }

  return (
    <div className={box}>
      {chosen && (
        <button onClick={() => setTarget(null)} className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300">
          {chosen === 'local' ? <Monitor className="w-3 h-3 text-emerald-400" /> : <Server className="w-3 h-3 text-sky-400" />}
          <span className="truncate">{chosen === 'local' ? 'Dieser PC' : chosen.name}</span>
          <span className="ml-auto shrink-0">aendern</span>
        </button>
      )}
      <button onClick={() => onBlank(chosen ?? undefined)} className={row}>
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
            <button key={harness.id} onClick={() => onHarness(harness, chosen ?? undefined)} className={row}>
              <Icon className="w-4 h-4 shrink-0 text-orange-300" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{harness.name}</span>
                <span className="block truncate font-mono text-[10px] text-zinc-500">{harness.command || 'kein Befehl'}</span>
              </span>
            </button>
          );
        })
      )}
      {!sshChat && (
        <>
          <div className="my-1 border-t border-white/5" />
          <div className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-wider text-zinc-600">V-Server</div>
          {savedServers.map((server) => (
            <div key={server.id} className="flex items-center rounded-lg hover:bg-white/[0.07]">
              <button onClick={() => onServer(server)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-xs text-zinc-200">
                <Server className="w-4 h-4 shrink-0 text-sky-300" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{server.name}</span>
                  <span className="block truncate font-mono text-[10px] text-zinc-500">{server.user ? `${server.user}@` : ''}{server.host}</span>
                </span>
              </button>
              <button onClick={() => onSftp(server)} className="mr-1 rounded-md p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white" title="SFTP-Dateien">
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button onClick={onAddServer} className={`${row} !text-sky-300`}>
            <Plus className="w-4 h-4" />
            <span className="font-medium">Neuen Server hinzufuegen</span>
          </button>
        </>
      )}
    </div>
  );
}

function cleanIpcError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
