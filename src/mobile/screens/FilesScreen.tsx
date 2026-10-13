import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  File,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  MoreVertical,
  Pencil,
  RefreshCw,
  Save,
  Server,
  SquareTerminal,
  Trash2,
  Upload,
} from 'lucide-react';
import { Native, errorCode, errorMessage, type NativeEntry, type TransferEvent } from '../native';
import { nativeServer } from '../remote';
import { newId, useStore } from '../store';
import type { MobileServer } from '../types';
import { Button, EmptyState, IconButton, Row, Sheet, Spinner, cx, formatBytes } from '../ui';
import NewTerminalSheet from './NewTerminalSheet';

const TEXT_FILE = /\.(txt|md|markdown|json|jsonc|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|bash|zsh|fish|yml|yaml|toml|ini|conf|cfg|env|properties|css|scss|less|html|htm|xml|svg|csv|sql|log|lock|gitignore|dockerignore|editorconfig|service|vue|svelte|lua|r|swift|dart|gradle)$/i;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i;
const CODE_FILE = /\.(js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|vue|svelte|lua|swift|dart)$/i;

function isText(name: string) {
  return TEXT_FILE.test(name) || /^(Dockerfile|Makefile|README|LICENSE|\.env.*|\.bashrc|\.profile|\.zshrc|CLAUDE\.md|AGENTS\.md)$/i.test(name);
}

function parentOf(path: string) {
  if (path === '/' || !path) return '/';
  const trimmed = path.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  return index <= 0 ? '/' : trimmed.slice(0, index);
}

function join(dir: string, name: string) {
  return dir === '/' ? `/${name}` : `${dir.replace(/\/+$/, '')}/${name}`;
}

export default function FilesScreen() {
  const { servers, status, filesTarget, setFilesTarget, withServer, connect, toast, confirm, prompt } = useStore();
  const [serverId, setServerId] = useState(filesTarget?.serverId || servers[0]?.id || '');
  const server = servers.find((item) => item.id === serverId);
  const [path, setPath] = useState<string>(filesTarget?.path || '');
  const [entries, setEntries] = useState<NativeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<NativeEntry | null>(null);
  const [editing, setEditing] = useState<{ path: string; content: string } | null>(null);
  const [terminalAt, setTerminalAt] = useState<string | null>(null);
  const [pickServer, setPickServer] = useState(false);
  const [transfer, setTransfer] = useState<TransferEvent | null>(null);
  const transferId = useRef('');
  const homes = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!filesTarget) return;
    setServerId(filesTarget.serverId);
    setPath(filesTarget.path || '');
    setFilesTarget(null);
  }, [filesTarget, setFilesTarget]);

  useEffect(() => {
    const handle = Native.addListener('transfer', (event) => {
      if (event.transferId === transferId.current) setTransfer(event);
    });
    return () => {
      void handle.then((listener) => listener.remove());
    };
  }, []);

  const load = useCallback(async (target: MobileServer, dir: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await withServer(target, () => Native.sftpList({ server: nativeServer(target), path: dir || target.defaultPath || '.' }));
      if (!dir && !homes.current[target.id]) homes.current[target.id] = result.path;
      setPath(result.path);
      setEntries(result.entries);
    } catch (failure) {
      if (errorCode(failure) !== 'CANCELED') setError(errorMessage(failure));
      setEntries(null);
    } finally {
      setLoading(false);
    }
  }, [withServer]);

  useEffect(() => {
    if (server) void load(server, path);
    // Only when the server changes; navigation calls load itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id]);

  const visible = useMemo(() => (entries || []).filter((entry) => showHidden || !entry.name.startsWith('.')), [entries, showHidden]);

  const open = (dir: string) => server && void load(server, dir);

  const runTransfer = async (task: (id: string) => Promise<unknown>, done: string) => {
    const id = newId();
    transferId.current = id;
    setTransfer({ transferId: id, name: '', done: 0, total: 0 });
    try {
      const result = (await task(id)) as { canceled?: boolean } | undefined;
      if (!result?.canceled) toast(done, 'success');
    } catch (failure) {
      toast(errorMessage(failure), 'error');
    } finally {
      transferId.current = '';
      setTransfer(null);
    }
  };

  const upload = () =>
    server &&
    runTransfer(async (id) => {
      const result = await withServer(server, () => Native.sftpUpload({ server: nativeServer(server), remoteDir: path, transferId: id }));
      if (!result.canceled) await load(server, path);
      return result;
    }, 'Hochgeladen.');

  const mkdir = async () => {
    if (!server) return;
    const name = await prompt({ title: 'Neuer Ordner', label: 'Name', value: '', confirmLabel: 'Anlegen' });
    if (!name?.trim()) return;
    try {
      await withServer(server, () => Native.sftpMkdir({ server: nativeServer(server), path: join(path, name.trim()) }));
      await load(server, path);
    } catch (failure) {
      toast(errorMessage(failure), 'error');
    }
  };

  const act = async (action: string, entry: NativeEntry) => {
    if (!server) return;
    const target = join(path, entry.name);
    setSelected(null);
    const native = nativeServer(server);
    try {
      if (action === 'open') {
        await runTransfer((id) => withServer(server, () => Native.sftpOpen({ server: native, path: target, transferId: id })), 'Geöffnet.');
      } else if (action === 'download') {
        await runTransfer((id) => withServer(server, () => Native.sftpDownload({ server: native, path: target, transferId: id })), `${entry.name} gespeichert.`);
      } else if (action === 'edit') {
        const { content } = await withServer(server, () => Native.sftpReadText({ server: native, path: target, maxBytes: 1_500_000 }));
        setEditing({ path: target, content });
      } else if (action === 'rename') {
        const name = await prompt({ title: 'Umbenennen', label: 'Neuer Name', value: entry.name, confirmLabel: 'Umbenennen' });
        if (!name?.trim() || name.trim() === entry.name) return;
        await withServer(server, () => Native.sftpRename({ server: native, from: target, to: join(path, name.trim()) }));
        await load(server, path);
      } else if (action === 'delete') {
        const ok = await confirm({
          title: `${entry.type === 'dir' ? 'Ordner' : 'Datei'} löschen?`,
          message: `${target}${entry.type === 'dir' ? '\nund alles darin' : ''} wird auf dem Server endgültig gelöscht.`,
          confirmLabel: 'Löschen',
          danger: true,
        });
        if (!ok) return;
        await withServer(server, () => Native.sftpDelete({ server: native, path: target }));
        await load(server, path);
        toast('Gelöscht.', 'success');
      } else if (action === 'copy') {
        await Native.copyText({ text: target });
        toast('Pfad kopiert.', 'success');
      } else if (action === 'terminal') {
        setTerminalAt(entry.type === 'dir' ? target : path);
      }
    } catch (failure) {
      toast(errorMessage(failure), 'error');
    }
  };

  if (!servers.length) {
    return (
      <div className="cf-safe-top flex h-full items-center justify-center">
        <EmptyState icon={<FolderOpen className="h-8 w-8" />} title="Kein V-Server" text="Füge auf dem Home-Tab deinen V-Server hinzu, um seine Dateien zu sehen." />
      </div>
    );
  }

  const crumbs = path.split('/').filter(Boolean);
  const online = server && status[server.id]?.state !== 'error';

  return (
    <div className="flex h-full flex-col">
      <div className="cf-glass cf-safe-top shrink-0 border-x-0 border-t-0 pb-2">
        <div className="flex items-center gap-1 px-2">
          <IconButton label="Zurück" disabled={path === '/' || !path} onClick={() => open(parentOf(path))}>
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <button onClick={() => servers.length > 1 && setPickServer(true)} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-1.5 truncate text-[1.05rem] font-semibold">
              <Server className="cf-accent-text h-4 w-4 shrink-0" />
              <span className="truncate">{server?.name}</span>
            </div>
            <div className="cf-muted truncate font-mono text-[0.72rem]">{path || '…'}</div>
          </button>
          <IconButton label={showHidden ? 'Versteckte ausblenden' : 'Versteckte zeigen'} onClick={() => setShowHidden((value) => !value)}>
            {showHidden ? <Eye className="h-[1.1rem] w-[1.1rem]" /> : <EyeOff className="h-[1.1rem] w-[1.1rem]" />}
          </IconButton>
          <IconButton label="Aktualisieren" onClick={() => server && void load(server, path)}>
            {loading ? <Spinner className="h-[1.1rem] w-[1.1rem]" /> : <RefreshCw className="h-[1.1rem] w-[1.1rem]" />}
          </IconButton>
        </div>
        <div className="cf-scroll mt-1 flex gap-1 overflow-x-auto px-3">
          <button className="cf-chip shrink-0 bg-cf-hover px-2.5 py-1 text-[0.75rem]" onClick={() => server && open(homes.current[server.id] || '.')}>
            <Home className="h-3.5 w-3.5" />
          </button>
          <button className="cf-chip shrink-0 bg-cf-hover px-2.5 py-1 font-mono text-[0.75rem]" onClick={() => open('/')}>/</button>
          {crumbs.map((part, index) => (
            <button key={index} className="cf-chip shrink-0 bg-cf-hover px-2.5 py-1 font-mono text-[0.75rem]" onClick={() => open(`/${crumbs.slice(0, index + 1).join('/')}`)}>
              {part}
            </button>
          ))}
        </div>
      </div>

      {transfer && (
        <div className="shrink-0 px-4 pt-2">
          <div className="cf-glass cf-card px-3.5 py-2.5">
            <div className="mb-1.5 flex justify-between text-[0.78rem]">
              <span className="truncate">{transfer.name || 'Übertragung …'}</span>
              <span className="cf-muted tabular-nums">{transfer.total > 0 ? `${Math.round((transfer.done / transfer.total) * 100)}%` : formatBytes(transfer.done)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-cf-hover">
              <div className="cf-accent-bg h-full transition-all" style={{ width: transfer.total > 0 ? `${(transfer.done / transfer.total) * 100}%` : '30%' }} />
            </div>
          </div>
        </div>
      )}

      <div className="cf-scroll min-h-0 flex-1 px-3 pb-24 pt-2">
        {error && (
          <div className="cf-glass cf-card mx-1 mt-2 p-4">
            <p className="mb-3 text-[0.88rem] text-red-400">{error}</p>
            <Button className="w-full" onClick={() => server && (online ? void load(server, path) : void connect(server).then((ok) => ok && load(server, path)))}>Erneut versuchen</Button>
          </div>
        )}
        {!error && entries && visible.length === 0 && <p className="cf-muted py-10 text-center text-[0.88rem]">Dieser Ordner ist leer.</p>}
        {!error && !entries && loading && <div className="flex justify-center py-10"><Spinner /></div>}
        {visible.length > 0 && (
          <div className="cf-glass cf-card overflow-hidden">
            {visible.map((entry, index) => (
              <div key={entry.name} className={cx('flex items-center', index > 0 && 'border-t border-cf-line')}>
                <button
                  className="cf-press flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3.5 text-left active:bg-cf-hover"
                  onClick={() => (entry.type === 'dir' ? open(join(path, entry.name)) : setSelected(entry))}
                >
                  <EntryIcon entry={entry} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.92rem]">{entry.name}</span>
                    <span className="cf-muted block text-[0.72rem]">
                      {entry.type === 'dir' ? 'Ordner' : formatBytes(entry.size)}
                      {entry.modifiedAt ? ` · ${new Date(entry.modifiedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}` : ''}
                    </span>
                  </span>
                </button>
                <IconButton label="Aktionen" className="mr-1" onClick={() => setSelected(entry)}>
                  <MoreVertical className="cf-muted h-4 w-4" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-end gap-2 px-4">
        <button onClick={() => void mkdir()} className="cf-glass cf-press pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full shadow-xl" aria-label="Neuer Ordner">
          <FolderPlus className="h-5 w-5" />
        </button>
        <button onClick={() => setTerminalAt(path)} className="cf-glass cf-press pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full shadow-xl" aria-label="Terminal hier">
          <SquareTerminal className="h-5 w-5" />
        </button>
        <button onClick={() => void upload()} className="cf-accent-bg cf-press pointer-events-auto flex h-12 items-center gap-2 rounded-full px-5 font-semibold shadow-xl" aria-label="Hochladen">
          <Upload className="h-5 w-5" /> Hochladen
        </button>
      </div>

      {selected && (
        <Sheet title={selected.name} onClose={() => setSelected(null)}>
          <div className="cf-glass cf-card overflow-hidden">
            {selected.type === 'dir' ? (
              <>
                <Row icon={<FolderOpen className="h-4 w-4" />} title="Öffnen" onClick={() => { setSelected(null); open(join(path, selected.name)); }} />
                <Row icon={<SquareTerminal className="h-4 w-4" />} title="Terminal hier öffnen" onClick={() => void act('terminal', selected)} />
              </>
            ) : (
              <>
                {isText(selected.name) && <Row icon={<Pencil className="h-4 w-4" />} title="Bearbeiten" subtitle="Im Texteditor der App" onClick={() => void act('edit', selected)} />}
                <Row icon={<FileImage className="h-4 w-4" />} title="Auf dem Handy öffnen" subtitle="Mit einer passenden App" onClick={() => void act('open', selected)} />
                <Row icon={<Download className="h-4 w-4" />} title="Aufs Handy speichern" subtitle={formatBytes(selected.size)} onClick={() => void act('download', selected)} />
              </>
            )}
            <Row icon={<Pencil className="h-4 w-4" />} title="Umbenennen" onClick={() => void act('rename', selected)} />
            <Row icon={<Copy className="h-4 w-4" />} title="Pfad kopieren" onClick={() => void act('copy', selected)} />
            <Row icon={<Trash2 className="h-4 w-4" />} title="Löschen" danger onClick={() => void act('delete', selected)} />
          </div>
        </Sheet>
      )}

      {editing && server && <Editor server={server} file={editing} onClose={() => setEditing(null)} />}
      {terminalAt !== null && server && <NewTerminalSheet serverId={server.id} cwd={terminalAt} onClose={() => setTerminalAt(null)} />}
      {pickServer && (
        <Sheet title="V-Server wählen" onClose={() => setPickServer(false)}>
          <div className="cf-glass cf-card overflow-hidden">
            {servers.map((item) => (
              <Row
                key={item.id}
                icon={<Server className="h-4 w-4" />}
                title={item.name}
                subtitle={`${item.user}@${item.host}`}
                onClick={() => {
                  setPickServer(false);
                  setPath('');
                  setEntries(null);
                  setServerId(item.id);
                }}
              />
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function EntryIcon({ entry }: { entry: NativeEntry }) {
  const className = 'h-5 w-5 shrink-0';
  if (entry.type === 'dir') return <Folder className={cx(className, 'cf-accent-text')} fill="currentColor" fillOpacity={0.18} />;
  if (IMAGE_FILE.test(entry.name)) return <FileImage className={cx(className, 'text-pink-400')} />;
  if (CODE_FILE.test(entry.name)) return <FileCode2 className={cx(className, 'text-sky-400')} />;
  if (isText(entry.name)) return <FileText className={cx(className, 'cf-muted')} />;
  return <File className={cx(className, 'cf-muted')} />;
}

function Editor({ server, file, onClose }: { server: MobileServer; file: { path: string; content: string }; onClose: () => void }) {
  const { withServer, toast, confirm } = useStore();
  const [content, setContent] = useState(file.content);
  const [saving, setSaving] = useState(false);
  const dirty = content !== file.content;

  const save = async () => {
    setSaving(true);
    try {
      await withServer(server, () => Native.sftpWriteText({ server: nativeServer(server), path: file.path, content }));
      file.content = content;
      toast('Gespeichert.', 'success');
      onClose();
    } catch (failure) {
      toast(errorMessage(failure), 'error');
    } finally {
      setSaving(false);
    }
  };

  const close = async () => {
    if (dirty && !(await confirm({ title: 'Änderungen verwerfen?', message: 'Die Datei wurde geändert und noch nicht gespeichert.', confirmLabel: 'Verwerfen', danger: true }))) return;
    onClose();
  };

  return (
    <Sheet
      title={file.path.split('/').pop() || file.path}
      full
      onClose={() => void close()}
      footer={<Button variant="primary" className="flex-1" icon={<Save className="h-4 w-4" />} disabled={!dirty} busy={saving} onClick={() => void save()}>Speichern</Button>}
    >
      <div className="cf-muted mb-2 truncate font-mono text-[0.7rem]">{file.path}</div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className="cf-input h-[calc(100%-1.5rem)] min-h-[50vh] resize-none font-mono text-[13px] leading-relaxed"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        wrap="off"
      />
    </Sheet>
  );
}
