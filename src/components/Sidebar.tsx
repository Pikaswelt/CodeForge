import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AppWindow,
  Blocks,
  LayoutGrid,
  ExternalLink,
  Gauge,
  ChevronDown,
  ChevronRight,
  Edit2,
  Folder,
  Loader2,
  Plus,
  Search,
  Settings,
  SquarePen,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import AccountMenu from './AccountMenu';
import type { HomeApp, ProjectFolder } from '../types';

export default function Sidebar({
  onSettingsClick,
  onActionsClick,
}: {
  onSettingsClick: () => void;
  onActionsClick: () => void;
}) {
  const {
    folders,
    chats,
    selectedChatId,
    selectedFolderId,
    mainView,
    selectChat,
    selectFolder,
    setMainView,
    addProject,
    saveProject,
    renameProject,
    updateProjectIcon,
    deleteProject,
    homeApps,
    addHomeApp,
    removeHomeApp,
    launchHomeApp,
  } = useAppContext();
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [projectEditor, setProjectEditor] = useState<ProjectFolder | null | 'new'>(null);

  const visibleFolders = useMemo(
    () =>
      folders.filter((folder) => {
        if (!search) return true;
        return (
          folder.title.toLowerCase().includes(search.toLowerCase()) ||
          chats.some(
            (chat) =>
              chat.folderId === folder.id &&
              chat.title.toLowerCase().includes(search.toLowerCase()),
          )
        );
      }),
    [folders, chats, search],
  );

  const navClass = (active: boolean) =>
    `relative flex items-center gap-2.5 w-full px-4 py-2 text-[13px] transition-colors cursor-pointer ${
      active ? 'text-white font-medium' : 'text-zinc-400 hover:text-white'
    }`;

  const renderActiveBg = (active: boolean) =>
    active && (
      <motion.div
        layoutId="activeSidebarNav"
        className="absolute inset-0 bg-white/10 border-l-2 border-amber-400 -z-10"
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      />
    );

  return (
    <aside className="app-sidebar w-[270px] h-full bg-gradient-to-b from-[#251f21] to-[#0a0a0a] flex flex-col shrink-0 border-r border-white/[0.03]">
      <div className="py-3">
        <motion.button
          onClick={() => setMainView('library')}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className={navClass(mainView === 'library')}
        >
          {renderActiveBg(mainView === 'library')}
          <LayoutGrid className="w-4 h-4" />
          Library
        </motion.button>
        <motion.button
          onClick={() => selectChat(null)}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className={navClass(mainView === 'chat' && !selectedChatId)}
        >
          {renderActiveBg(mainView === 'chat' && !selectedChatId)}
          <SquarePen className="w-4 h-4" />
          Neuer Chat
        </motion.button>
        <motion.button
          onClick={() => setSearchOpen((value) => !value)}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className={navClass(searchOpen)}
        >
          {renderActiveBg(searchOpen)}
          <Search className="w-4 h-4" />
          Suche
        </motion.button>
        <AnimatePresence initial={false}>
          {searchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="px-3 py-1.5 overflow-hidden"
            >
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Projekte und Chats filtern..."
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-white/25"
              />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          onClick={() => setMainView('plugins')}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className={navClass(mainView === 'plugins')}
        >
          {renderActiveBg(mainView === 'plugins')}
          <Blocks className="w-4 h-4" />
          Plugins
        </motion.button>
        <motion.button
          onClick={() => setMainView('workspace')}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className={navClass(mainView === 'workspace')}
        >
          {renderActiveBg(mainView === 'workspace')}
          <Terminal className="w-4 h-4" />
          Workspace
        </motion.button>
        <motion.button
          onClick={() => setMainView('usage')}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className={navClass(mainView === 'usage')}
        >
          {renderActiveBg(mainView === 'usage')}
          <Gauge className="w-4 h-4" />
          Nutzung
        </motion.button>
      </div>

      <AppTabs
        apps={homeApps.filter((app) => app.kind !== 'web' && !app.url)}
        onAdd={addHomeApp}
        onLaunch={launchHomeApp}
        onRemove={removeHomeApp}
      />

      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Projekte
        </span>
        <button onClick={() => setProjectEditor('new')} className="p-1 text-zinc-500 hover:text-white" title="Projekt erstellen">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-4">
        {visibleFolders.length === 0 ? (
          <div className="mx-3 mt-2 grid gap-2">
            <button
              onClick={() => setProjectEditor('new')}
              className="p-4 w-full rounded-xl border border-dashed border-emerald-300/20 text-left hover:bg-white/[0.03]"
            >
              <div className="text-sm text-zinc-300">Neues Projekt erstellen</div>
              <div className="text-xs text-zinc-600 mt-1">Ordner anlegen und direkt darin starten.</div>
            </button>
            <button
              onClick={addProject}
              className="p-4 w-full rounded-xl border border-dashed border-white/10 text-left hover:bg-white/[0.03]"
            >
              <div className="text-sm text-zinc-300">Projektordner hinzufuegen</div>
              <div className="text-xs text-zinc-600 mt-1">Vorhandenen Ordner als Projekt oeffnen.</div>
            </button>
          </div>
        ) : (
          visibleFolders.map((folder) => (
            <ProjectSection
              key={folder.id}
              folder={folder}
              chats={chats.filter(
                (chat) =>
                  chat.folderId === folder.id &&
                  (!search || chat.title.toLowerCase().includes(search.toLowerCase())),
              )}
              active={selectedFolderId === folder.id}
              selectedChatId={selectedChatId}
              onSelectFolder={() => selectFolder(folder.id)}
              onSelectChat={selectChat}
              onRename={(title) => renameProject(folder.id, title)}
              onIconChange={(icon) => updateProjectIcon(folder.id, icon)}
              onEdit={() => setProjectEditor(folder)}
              onDelete={() => {
                if (window.confirm(`Projekt "${folder.title}" aus CodeForge entfernen? Zugehoerige Chats werden ebenfalls geloescht.`)) {
                  deleteProject(folder.id);
                }
              }}
            />
          ))
        )}
      </div>

      <AnimatePresence>
        {projectEditor && (
          <ProjectEditorModal
            folder={projectEditor === 'new' ? null : projectEditor}
            onClose={() => setProjectEditor(null)}
            onSave={async (input) => {
              await saveProject(input);
              setProjectEditor(null);
            }}
            onDelete={
              projectEditor === 'new'
                ? undefined
                : () => {
                    if (window.confirm(`Projekt "${projectEditor.title}" aus CodeForge entfernen? Zugehoerige Chats werden ebenfalls geloescht.`)) {
                      deleteProject(projectEditor.id);
                      setProjectEditor(null);
                    }
                  }
            }
          />
        )}
      </AnimatePresence>

      <div className="relative">
        <motion.button
          onClick={() => setSettingsMenuOpen((value) => !value)}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className={navClass(settingsMenuOpen)}
        >
          <Settings className="w-4 h-4" />
          Einstellungen
        </motion.button>
        {settingsMenuOpen && (
          <AccountMenu
            onSettingsClick={onSettingsClick}
            onActionsClick={onActionsClick}
            onClose={() => setSettingsMenuOpen(false)}
            className="bottom-10 left-3"
          />
        )}
      </div>
    </aside>
  );
}

function ProjectEditorModal({
  folder,
  onClose,
  onSave,
  onDelete,
}: {
  folder: ProjectFolder | null;
  onClose(): void;
  onSave(input: Partial<ProjectFolder> & { title: string }): Promise<void>;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(folder?.title || '');
  const [icon, setIcon] = useState(folder?.icon || '');
  const [path, setPath] = useState(folder?.path || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canSave = Boolean(title.trim());

  const pickFolder = async () => {
    const nextPath = await window.agentWorkspace?.selectProjectFolder();
    if (!nextPath) return;
    setPath(nextPath);
    if (!title.trim()) setTitle(nextPath.split(/[\\/]/).filter(Boolean).at(-1) || 'Projekt');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[260] grid place-items-center bg-black/45 px-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="library-project-form"
      >
        <div className="library-project-form-header">
          <div>
            <h2>{folder ? 'Projekt bearbeiten' : 'Projekt erstellen'}</h2>
            <p>Name reicht aus. Ohne Ordner legt CodeForge einen neuen Projektordner an.</p>
          </div>
          <button onClick={onClose} title="Schliessen">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="library-project-form-body">
          <label>
            Projektname
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="z.B. Meine App" />
          </label>
          <label>
            Icon
            <input value={icon} onChange={(event) => setIcon(event.target.value.slice(0, 8))} placeholder="Optional, z.B. CF" />
          </label>
          <ProjectPathRow value={path} onPick={pickFolder} />
          {error && <div className="library-form-error">{error}</div>}
        </div>

        <div className="library-project-form-footer">
          {onDelete && (
            <button onClick={onDelete} className="library-button danger mr-auto">
              <Trash2 className="h-3.5 w-3.5" />
              Loeschen
            </button>
          )}
          <button onClick={onClose} className="library-button">Abbrechen</button>
          <button
            disabled={!canSave || saving}
            onClick={async () => {
              if (!canSave || saving) return;
              setSaving(true);
              setError('');
              try {
                await onSave({
                  id: folder?.id,
                  title,
                  icon,
                  path,
                  isScratch: folder?.isScratch,
                });
              } catch (saveError) {
                setError(saveError instanceof Error ? saveError.message : 'Projekt konnte nicht gespeichert werden.');
              } finally {
                setSaving(false);
              }
            }}
            className="library-button primary"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {folder ? 'Speichern' : 'Erstellen'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ProjectPathRow({ value, onPick }: { value: string; onPick(): void }) {
  return (
    <div className="library-file-row">
      <div>
        <span>Projektordner</span>
        <small title={value}>{value || 'Noch nicht ausgewaehlt - wird neu erstellt'}</small>
      </div>
      <button type="button" onClick={onPick}>Auswaehlen</button>
    </div>
  );
}

function AppTabs({
  apps,
  onAdd,
  onLaunch,
  onRemove,
}: {
  apps: HomeApp[];
  onAdd(): Promise<void>;
  onLaunch(app: HomeApp): Promise<void>;
  onRemove(id: string): void;
}) {
  return (
    <div className="border-y border-white/[0.04] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <AppWindow className="h-3.5 w-3.5" />
          App-Tabs
        </div>
        <button
          onClick={() => void onAdd()}
          className="rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
          title="Projekt mit Release, Installer und Programmdatei hinzufuegen"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {apps.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {apps.map((app) => (
            <div
              key={app.id}
              className="group flex max-w-[150px] shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.035] px-2 py-1.5"
              title={app.path}
            >
              <button
                onClick={() => void onLaunch(app).catch((error) => window.alert(error instanceof Error ? error.message : 'App konnte nicht geoeffnet werden.'))}
                className="flex min-w-0 items-center gap-1.5 text-left text-[11px] text-zinc-300 hover:text-white"
              >
                <ExternalLink className="h-3 w-3 shrink-0 text-zinc-500" />
                <span className="truncate">{app.name}</span>
              </button>
              {!app.id.startsWith('builtin-') && (
                <button
                  onClick={() => onRemove(app.id)}
                  className="hidden rounded p-0.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-300 group-hover:block"
                  title="App-Tab entfernen"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <button
          onClick={() => void onAdd()}
          className="w-full rounded-lg border border-dashed border-white/10 px-3 py-2 text-left text-[11px] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
        >
          Projekt mit Release, Installer und Programmdatei hinzufuegen
        </button>
      )}
    </div>
  );
}

function ProjectSection({
  folder,
  chats,
  active,
  selectedChatId,
  onSelectFolder,
  onSelectChat,
  onRename,
  onIconChange,
  onEdit,
  onDelete,
}: {
  folder: ProjectFolder;
  chats: ReturnType<typeof useAppContext>['chats'];
  active: boolean;
  selectedChatId: string | null;
  onSelectFolder(): void;
  onSelectChat(id: string): void;
  onRename(title: string): void;
  onIconChange(icon: string): void;
  onEdit(): void;
  onDelete(): void;
}) {
  const [open, setOpen] = useState(true);
  void onRename;
  void onIconChange;

  return (
    <div className="mt-2">
      <div
        className={`group flex items-center px-3 py-2 text-[13px] ${
          active ? 'text-white' : 'text-zinc-400'
        }`}
      >
        <button
          onClick={() => {
            onSelectFolder();
            setOpen(true);
          }}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          title={folder.path}
        >
          {folder.icon ? (
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-white/10 text-sm" title="Projekt-Icon">
              {folder.icon}
            </span>
          ) : (
            <Folder className="w-4 h-4 text-amber-400/70 shrink-0" />
          )}
          <span className="truncate">{folder.title}</span>
        </button>
        <div className="hidden group-hover:flex items-center">
          <button onClick={onEdit} className="p-1 hover:text-white" title="Bearbeiten">
            <Edit2 className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="p-1 hover:text-red-400" title="Entfernen">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        <button onClick={() => setOpen((value) => !value)} className="p-1">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {chats.map((chat) => (
              <motion.button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                whileHover={{ x: 3 }}
                whileTap={{ scale: 0.99 }}
                className={`w-full pl-9 pr-3 py-1.5 text-left text-[12.5px] truncate flex items-center gap-1.5 ${
                  selectedChatId === chat.id
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                }`}
              >
                {chat.mode === 'terminal' && <Terminal className="w-3.5 h-3.5 shrink-0 text-emerald-400" />}
                <span className="truncate">{chat.title}</span>
              </motion.button>
            ))}
            {chats.length === 0 && <div className="pl-9 py-1 text-xs text-zinc-700">Keine Chats</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
