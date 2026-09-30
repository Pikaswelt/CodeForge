import { useCallback, useEffect, useState } from 'react';
import { ArrowUp, Download, File, Folder, FolderPlus, Home, KeyRound, Loader2, Pencil, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import type { SftpEntry, VServerConnection } from '../types';

// SFTP file browser for one saved V-Server. Passwords and key passphrases are only
// kept in this component's state and are never stored.

const NEED_SECRET = 'NEED_SECRET: ';

function cleanError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

const joinPath = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir.replace(/\/+$/, '')}/${name}`);

function parentPath(dir: string) {
  const trimmed = dir.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  return index <= 0 ? '/' : trimmed.slice(0, index);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function SftpBrowser({ server, onClose }: { server: VServerConnection; onClose(): void }) {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [home, setHome] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needSecret, setNeedSecret] = useState(false);
  const [secret, setSecret] = useState('');
  const [connected, setConnected] = useState(false);

  const load = useCallback(
    async (target: string) => {
      setBusy('list');
      setError('');
      try {
        const result = await window.agentWorkspace.sftpList({ vserver: server, path: target });
        setPath(result.path);
        setEntries(result.entries);
      } catch (err) {
        const message = cleanError(err);
        if (message.startsWith(NEED_SECRET)) {
          // Cached connection expired and the login needs the password again.
          setConnected(false);
          setNeedSecret(true);
          setError(message.slice(NEED_SECRET.length));
        } else {
          setError(message);
        }
      } finally {
        setBusy('');
      }
    },
    [server],
  );

  const connect = useCallback(
    async (password?: string) => {
      setBusy('connect');
      setError('');
      setNeedSecret(false);
      try {
        const result = await window.agentWorkspace.sftpConnect({ vserver: server, secret: password });
        setHome(result.home);
        setConnected(true);
        setSecret('');
        await load(result.home);
      } catch (err) {
        const message = cleanError(err);
        if (message.startsWith(NEED_SECRET)) {
          setNeedSecret(true);
          setError(message.slice(NEED_SECRET.length));
        } else {
          setError(message);
        }
        setBusy('');
      }
    },
    [server, load],
  );

  useEffect(() => {
    void connect();
    // Only once per opened browser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (label: string, action: () => Promise<string | void>) => {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      const message = await action();
      if (message) setNotice(message);
      await load(path);
    } catch (err) {
      setError(cleanError(err));
      setBusy('');
    }
  };

  const download = (entry: SftpEntry) =>
    run('download', async () => {
      const result = await window.agentWorkspace.sftpDownload({ vserver: server, path: joinPath(path, entry.name) });
      return result.canceled ? undefined : `Gespeichert: ${result.localPath}`;
    });

  const upload = () =>
    run('upload', async () => {
      const result = await window.agentWorkspace.sftpUpload({ vserver: server, path });
      return result.canceled ? undefined : `${result.uploaded.length} Datei(en) hochgeladen.`;
    });

  // Electron has no window.prompt, so names are entered in an inline bar.
  const [nameDialog, setNameDialog] = useState<{ kind: 'mkdir' | 'rename'; entry?: SftpEntry; value: string } | null>(null);

  const submitName = () => {
    if (!nameDialog) return;
    const name = nameDialog.value.trim();
    if (!name) return;
    if (/[\/]/.test(name)) return setError('Name darf keine Schraegstriche enthalten.');
    const { kind, entry } = nameDialog;
    setNameDialog(null);
    if (kind === 'mkdir') {
      void run('mkdir', () => window.agentWorkspace.sftpMkdir({ vserver: server, path: joinPath(path, name) }));
    } else if (entry && name !== entry.name) {
      void run('rename', () =>
        window.agentWorkspace.sftpRename({ vserver: server, from: joinPath(path, entry.name), to: joinPath(path, name) }),
      );
    }
  };

  const remove = (entry: SftpEntry) => {
    const what = entry.type === 'dir' ? `Ordner "${entry.name}" mit allem Inhalt` : `"${entry.name}"`;
    if (!window.confirm(`${what} auf ${server.name} endgueltig loeschen?`)) return;
    void run('delete', () => window.agentWorkspace.sftpDelete({ vserver: server, path: joinPath(path, entry.name) }));
  };

  const close = () => {
    void window.agentWorkspace.sftpDisconnect(server.id);
    onClose();
  };

  const iconButton = 'rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onMouseDown={close}>
      <div
        className="flex h-[80vh] w-full max-w-[860px] flex-col rounded-2xl border border-white/10 bg-[#18161a] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">SFTP · {server.name}</div>
            <div className="truncate font-mono text-[11px] text-zinc-500">
              {server.user ? `${server.user}@` : ''}{server.host}:{server.port}
            </div>
          </div>
          <button onClick={close} className={iconButton} title="Schliessen">
            <X className="w-4 h-4" />
          </button>
        </div>

        {connected && (
          <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-2">
            <button onClick={() => void load(parentPath(path))} disabled={Boolean(busy) || path === '/'} className={iconButton} title="Ordner hoch">
              <ArrowUp className="w-4 h-4" />
            </button>
            <button onClick={() => void load(home)} disabled={Boolean(busy)} className={iconButton} title="Home-Verzeichnis">
              <Home className="w-4 h-4" />
            </button>
            <button onClick={() => void load(path)} disabled={Boolean(busy)} className={iconButton} title="Neu laden">
              <RefreshCw className={`w-4 h-4 ${busy === 'list' ? 'animate-spin' : ''}`} />
            </button>
            <div className="mx-1 min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs text-zinc-300">{path}</div>
            <button onClick={() => setNameDialog({ kind: 'mkdir', value: '' })} disabled={Boolean(busy)} className={iconButton} title="Neuer Ordner">
              <FolderPlus className="w-4 h-4" />
            </button>
            <button onClick={() => void upload()} disabled={Boolean(busy)} className="primary-button !py-1.5 !px-3 text-xs flex items-center gap-1.5 disabled:opacity-50">
              {busy === 'upload' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Hochladen
            </button>
          </div>
        )}

        {connected && nameDialog && (
          <form
            className="flex items-center gap-2 border-b border-white/5 bg-white/[0.03] px-4 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitName();
            }}
          >
            <span className="shrink-0 text-xs text-zinc-400">{nameDialog.kind === 'mkdir' ? 'Neuer Ordner:' : `Umbenennen "${nameDialog.entry?.name}":`}</span>
            <input
              autoFocus
              value={nameDialog.value}
              onChange={(event) => setNameDialog({ ...nameDialog, value: event.target.value })}
              onKeyDown={(event) => event.key === 'Escape' && setNameDialog(null)}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-orange-400/60"
            />
            <button type="submit" className="primary-button !py-1.5 !px-3 text-xs">OK</button>
            <button type="button" onClick={() => setNameDialog(null)} className="text-xs text-zinc-500 hover:text-white">Abbrechen</button>
          </form>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          {!connected && busy === 'connect' && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Verbinde...
            </div>
          )}

          {!connected && needSecret && (
            <form
              className="mx-auto mt-10 flex w-full max-w-sm flex-col gap-3 px-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (secret) void connect(secret);
              }}
            >
              <label className="block">
                <span className="mb-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <KeyRound className="w-3.5 h-3.5" />
                  {server.keyPath ? 'Passphrase des SSH-Keys' : `Passwort fuer ${server.user || 'den Benutzer'}`}
                </span>
                <input
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-orange-400/60"
                />
              </label>
              <button type="submit" disabled={!secret || Boolean(busy)} className="primary-button !py-2.5 disabled:opacity-50">
                Verbinden
              </button>
              <p className="text-[11px] text-zinc-600">Wird nur fuer diese Sitzung verwendet und nicht gespeichert.</p>
            </form>
          )}

          {connected && (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#18161a] text-[10px] uppercase tracking-wider text-zinc-600">
                <tr>
                  <th className="px-5 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Groesse</th>
                  <th className="px-2 py-2 font-medium">Geaendert</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.name} className="group border-t border-white/5 hover:bg-white/[0.04]">
                    <td className="px-5 py-2">
                      <button
                        onClick={() => (entry.type === 'dir' ? void load(joinPath(path, entry.name)) : undefined)}
                        className={`flex min-w-0 items-center gap-2 text-left ${entry.type === 'dir' ? 'cursor-pointer text-zinc-100' : 'cursor-default text-zinc-300'}`}
                      >
                        {entry.type === 'dir' ? <Folder className="w-4 h-4 shrink-0 text-sky-300" /> : <File className="w-4 h-4 shrink-0 text-zinc-500" />}
                        <span className="truncate">{entry.name}</span>
                      </button>
                    </td>
                    <td className="px-2 py-2 font-mono text-zinc-500">{entry.type === 'dir' ? '' : formatSize(entry.size)}</td>
                    <td className="px-2 py-2 font-mono text-zinc-500">{entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : ''}</td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100">
                        {entry.type !== 'dir' && (
                          <button onClick={() => void download(entry)} disabled={Boolean(busy)} className={iconButton} title="Herunterladen">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => setNameDialog({ kind: 'rename', entry, value: entry.name })} disabled={Boolean(busy)} className={iconButton} title="Umbenennen">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => remove(entry)} disabled={Boolean(busy)} className={`${iconButton} hover:!bg-red-500/15 hover:!text-red-300`} title="Loeschen">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && busy !== 'list' && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-zinc-600">
                      Ordner ist leer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {(error || notice || (busy && busy !== 'list' && busy !== 'connect')) && (
          <div className="border-t border-white/10 px-5 py-2.5 text-xs">
            {error ? (
              <span className="text-red-400">{error}</span>
            ) : notice ? (
              <span className="text-emerald-400">{notice}</span>
            ) : (
              <span className="flex items-center gap-2 text-zinc-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Uebertragung laeuft...
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
