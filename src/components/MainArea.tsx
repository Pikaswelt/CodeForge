import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AppWindow,
  Blocks,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Code2,
  ExternalLink,
  FileCode2,
  FileText,
  FolderOpen,
  Gamepad2,
  Home,
  Rocket,
  Server,
  MessageSquare,
  LayoutGrid,
  GitPullRequest,
  Loader2,
  Play,
  Plus,
  RotateCw,
  Search,
  Smartphone,
  Terminal,
  Trash2,
  X,
  Maximize2,
  Minimize2,
  Clipboard,
  Mic,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import InputArea from './InputArea';
import { harnessIcon } from '../harnessIcons';
import { ApiChatSetup, ApiChatView } from './ApiChat';
import { useDictation } from '../useDictation';
import { useVoiceSettings } from '../voice';
import { useCompactLayout } from '../useCompactLayout';
import { AddVServerDialog, NewTabMenu, VServerPanel, useVServers } from './VServers';
import { SftpBrowser } from './SftpBrowser';
import { isVideoPath, toFileUrl } from '../media';
import type { Chat, CliHarness, HomeAppTab, Message, ResponseDisplayMode, TerminalTab, VServerConnection } from '../types';
import type { HomeApp } from '../types';
import libraryBannerUrl from '../../assets/library-banner.png';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const libraryGridVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05
    }
  }
} as const;

const libraryItemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 25 } }
} as const;

type LibraryItem =
  | {
      id: string;
      title: string;
      subtitle: string;
      kind: string;
      type: 'Mobile App' | 'Projekt';
      action: () => void;
      cta: string;
      active: boolean;
    }
  | {
      id: string;
      title: string;
      subtitle: string;
      executable: string;
      kind: string;
      type: 'Programm';
      tags: string[];
      app: HomeApp;
      action: () => void;
      cta: string;
      active: boolean;
    };

export default function MainArea() {
  const { mainView, activeHomeTab } = useAppContext();
  const viewKey = activeHomeTab ? `tab-${activeHomeTab.id}` : `view-${mainView}`;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={viewKey}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: 'easeInOut' }}
        className="flex-1 min-w-0 h-full flex flex-col relative overflow-hidden"
      >
        {activeHomeTab ? (
          <HomeTabsView />
        ) : mainView === 'library' ? (
          <LibraryView />
        ) : mainView === 'workspace' ? (
          <WorkspaceView />
        ) : (
          <ChatView />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function LibraryView() {
  const {
    libraryProjects,
    libraryApps,
    addLibraryProject,
    createLibraryNewProject,
    addLibraryApp,
    updateLibraryApp,
    removeLibraryApp,
    launchLibraryApp,
    libraryTags,
    libraryBannerBackgroundEnabled,
    libraryStyle,
    createLibraryTag,
    deleteLibraryTag,
  } = useAppContext();
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ app: HomeApp; x: number; y: number } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingApp, setEditingApp] = useState<HomeApp | null>(null);
  const apps = libraryApps.filter((app) => app.kind !== 'web' && !app.url);
  const allItems: LibraryItem[] = [
    ...libraryProjects.map((folder) => ({
      id: folder.id,
      title: folder.title,
      subtitle: folder.path,
      kind: classifyProject(folder.title, folder.path),
      type: isMobileProject(folder.path) ? ('Mobile App' as const) : ('Projekt' as const),
      action: () => {
        void window.agentWorkspace?.openPath(folder.path);
      },
      cta: 'Oeffnen',
      active: false,
    })),
    ...apps.map((app) => ({
      id: app.id,
      title: app.name,
      subtitle: app.folderPath || app.path,
      executable: describeRunTarget(app),
      kind: classifyProject(app.name, app.path),
      type: 'Programm' as const,
      tags: app.tags || [],
      app,
      action: () => void launchLibraryApp(app),
      cta: 'Ausfuehren',
      active: false,
    })),
  ].filter((item) => {
    const haystack = `${item.title} ${item.subtitle} ${item.kind} ${item.type}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const mobileCount = libraryProjects.filter((folder) => isMobileProject(folder.path)).length;
  const bannerMedia = libraryStyle.bannerMedia;
  const bannerIsVideo = Boolean(bannerMedia) && isVideoPath(bannerMedia);
  const bannerImageUrl = bannerMedia ? (bannerIsVideo ? '' : toFileUrl(bannerMedia)) : libraryBannerUrl;
  const libraryVars = {
    ...(libraryStyle.pageBackground ? { '--lib-bg': libraryStyle.pageBackground } : {}),
    ...(libraryStyle.cardBackground ? { '--lib-card': libraryStyle.cardBackground } : {}),
    ...(libraryStyle.textColor ? { '--lib-text': libraryStyle.textColor } : {}),
    ...(libraryStyle.accentColor ? { '--lib-accent': libraryStyle.accentColor } : {}),
    '--lib-overlay': String(libraryStyle.bannerOverlay / 100),
  } as React.CSSProperties;
  return (
    <main className="library-shell flex-1 overflow-y-auto custom-scrollbar px-8 py-8" style={libraryVars}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section
          className={`library-hero ${libraryBannerBackgroundEnabled ? 'with-banner-image' : ''}`}
          style={libraryBannerBackgroundEnabled && bannerImageUrl ? { backgroundImage: `url("${bannerImageUrl}")` } : undefined}
        >
          {libraryBannerBackgroundEnabled && bannerIsVideo && (
            <video className="library-hero-media" src={toFileUrl(bannerMedia)} autoPlay muted loop playsInline />
          )}
          <div className="min-w-0">
            <div className="library-kicker">
              <LayoutGrid className="h-4 w-4" />
              Projekt Library
            </div>
            <h1>{libraryStyle.bannerTitle || 'Alle Projekte, Apps und Handy Apps an einem Ort.'}</h1>
            <p>
              {libraryStyle.bannerText || 'Sammle lokale Projekte, Programme und mobile Apps in einer cleanen Uebersicht und starte sie direkt.'}
            </p>
          </div>
          <div className="library-actions relative">
            <button onClick={() => setAddMenuOpen((value) => !value)} className="library-button primary">
              <Plus className="h-4 w-4" />
              Projekt hinzufuegen
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {addMenuOpen && (
              <div className="library-add-menu">
                <button onClick={() => { setAddMenuOpen(false); void addLibraryProject(); }}>
                  <FileCode2 className="h-4 w-4" />
                  Projektordner oeffnen
                </button>
                <button onClick={() => { setAddMenuOpen(false); void createLibraryNewProject(); }}>
                  <FolderIcon />
                  Neues Projekt erstellen
                </button>
                <button onClick={() => { setAddMenuOpen(false); setShowProjectForm(true); }}>
                  <AppWindow className="h-4 w-4" />
                  Projekt mit Release anlegen
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="library-toolbar">
          <div className="library-search">
            <Search className="h-4 w-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Projekte, Apps oder Quellen suchen..."
            />
          </div>
          <div className="library-stats">
            <LibraryStat label="Projekte" value={libraryProjects.length} />
            <LibraryStat label="Programme" value={apps.length} />
            <LibraryStat label="Handy Apps" value={mobileCount} />
          </div>
        </section>

        <section className="library-tags">
          <div className="library-tags-header">
            <div>
              <h2>Tags</h2>
              <p>Tags fuer deine lokalen Programme erstellen und loeschen.</p>
            </div>
            <button
              onClick={() => {
                const tag = window.prompt('Neuer Tag:')?.trim();
                if (tag) createLibraryTag(tag);
              }}
              className="library-button"
            >
              <Plus className="h-4 w-4" />
              Tag erstellen
            </button>
          </div>
          <div className="library-tag-list">
            {libraryTags.map((tag) => (
              <span key={tag}>
                {tag}
                <button onClick={() => deleteLibraryTag(tag)} title="Tag loeschen">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {libraryTags.length === 0 && <small>Noch keine Tags.</small>}
          </div>
        </section>

        <motion.section
          variants={libraryGridVariants}
          initial="hidden"
          animate="show"
          className="library-grid"
        >
          {allItems.map((item) => (
            <motion.article
              variants={libraryItemVariants}
              whileHover={{ scale: 1.015, y: -2 }}
              key={`${item.type}-${item.id}`}
              className={`library-card ${item.active ? 'active' : ''}`}
              onContextMenu={(event) => {
                if (!('app' in item)) return;
                event.preventDefault();
                setMenu({ app: item.app, x: event.clientX, y: event.clientY });
              }}
            >
              <div className="library-card-top">
                <div className="library-card-icon">
                  {item.type === 'Mobile App' ? <Smartphone className="h-5 w-5" /> : item.type.includes('App') ? <AppWindow className="h-5 w-5" /> : <Code2 className="h-5 w-5" />}
                </div>
                <span>{item.kind}</span>
              </div>
              <h2>{item.title}</h2>
              {'app' in item && item.app.description && <p title={item.app.description}>{item.app.description}</p>}
              <p title={item.subtitle}>{item.subtitle}</p>
              {'executable' in item && <p title={item.executable}>Ausfuehrung: {item.executable}</p>}
              {'tags' in item && item.tags.length > 0 && (
                <div className="library-card-tags">
                  {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              )}
              <div className="library-card-footer">
                <span>{item.type}</span>
                <button onClick={item.action}>
                  {item.cta}
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.article>
          ))}
          {allItems.length === 0 && (
            <div className="library-empty">
              <LayoutGrid className="h-8 w-8" />
              <h2>Noch keine Eintraege gefunden</h2>
              <p>Fuege Projektordner oder Apps hinzu, dann erscheint deine gesamte Arbeitswelt hier.</p>
              <button onClick={() => setShowProjectForm(true)} className="library-button primary">
                <Plus className="h-4 w-4" />
                Erstes Projekt anlegen
              </button>
            </div>
          )}
        </motion.section>

        {menu && (
          <LibraryContextMenu
            app={menu.app}
            x={menu.x}
            y={menu.y}
            tags={libraryTags}
            onClose={() => setMenu(null)}
            onLaunch={() => void launchLibraryApp(menu.app)}
            onEdit={() => {
              setEditingApp(menu.app);
              setMenu(null);
            }}
            onUpdate={(patch) => updateLibraryApp(menu.app.id, patch)}
            onRemove={() => removeLibraryApp(menu.app.id)}
            onCreateTag={createLibraryTag}
          />
        )}

        {showProjectForm && (
          <LibraryProjectForm
            onClose={() => setShowProjectForm(false)}
            onSubmit={async (input) => {
              await addLibraryApp(input);
              setShowProjectForm(false);
            }}
          />
        )}

        {editingApp && (
          <LibraryProjectForm
            initialApp={editingApp}
            onClose={() => setEditingApp(null)}
            onSubmit={async (input) => {
              updateLibraryApp(editingApp.id, input);
              setEditingApp(null);
            }}
            onDelete={() => {
              if (window.confirm(`Programm "${editingApp.name}" entfernen?`)) {
                removeLibraryApp(editingApp.id);
                setEditingApp(null);
              }
            }}
          />
        )}
      </div>
    </main>
  );
}

function LibraryContextMenu({
  app,
  x,
  y,
  tags,
  onClose,
  onLaunch,
  onEdit,
  onUpdate,
  onRemove,
  onCreateTag,
}: {
  app: HomeApp;
  x: number;
  y: number;
  tags: string[];
  onClose(): void;
  onLaunch(): void;
  onEdit(): void;
  onUpdate(patch: Partial<HomeApp>): void;
  onRemove(): void;
  onCreateTag(name: string): void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);

  const addNewTag = () => {
    const tag = window.prompt('Tag erstellen und zuweisen:')?.trim();
    if (!tag) return;
    onCreateTag(tag);
    onUpdate({ tags: [...new Set([...(app.tags || []), tag])] });
    onClose();
  };

  const toggleTag = (tag: string) => {
    const current = new Set(app.tags || []);
    current.has(tag) ? current.delete(tag) : current.add(tag);
    onUpdate({ tags: [...current] });
  };

  return (
    <div className="library-context-menu" style={{ left: x, top: y }} onClick={(event) => event.stopPropagation()}>
      <button onClick={() => { onLaunch(); onClose(); }}>
        <Play className="h-3.5 w-3.5" />
        Ausfuehren
      </button>
      <button onClick={onEdit}>
        <FileText className="h-3.5 w-3.5" />
        Bearbeiten
      </button>
      <div className="library-context-divider" />
      {[
        ['latest', 'Latest Release ausfuehren'],
        ['installer', 'Installer ausfuehren'],
        ['program', 'Programm ausfuehren'],
      ].map(([id, label]) => (
        <button key={id} onClick={() => onUpdate({ runTarget: id as HomeApp['runTarget'] })}>
          <Check className={`h-3.5 w-3.5 ${(app.runTarget || 'latest') === id ? 'opacity-100' : 'opacity-0'}`} />
          {label}
        </button>
      ))}
      <div className="library-context-divider" />
      <button onClick={addNewTag}>
        <Plus className="h-3.5 w-3.5" />
        Tag erstellen
      </button>
      {tags.map((tag) => (
        <button key={tag} onClick={() => toggleTag(tag)}>
          <Check className={`h-3.5 w-3.5 ${app.tags?.includes(tag) ? 'opacity-100' : 'opacity-0'}`} />
          {tag}
        </button>
      ))}
      <div className="library-context-divider" />
      <button
        className="danger"
        onClick={() => {
          if (window.confirm(`Programm "${app.name}" entfernen?`)) onRemove();
          onClose();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Entfernen
      </button>
    </div>
  );
}

function describeRunTarget(app: HomeApp) {
  const target = app.runTarget || 'latest';
  const filePath =
    target === 'installer'
      ? app.installerPath
      : target === 'program'
        ? app.programPath
        : app.latestReleasePath;
  const label = target === 'installer' ? 'Installer' : target === 'program' ? 'Programm' : 'Latest Release';
  return `${label}: ${filePath || app.executablePath || app.path}`;
}

function LibraryProjectForm({
  initialApp,
  onClose,
  onSubmit,
  onDelete,
}: {
  initialApp?: HomeApp;
  onClose(): void;
  onSubmit(input: Partial<HomeApp>): Promise<void>;
  onDelete?(): void;
}) {
  const [name, setName] = useState(initialApp?.name || '');
  const [description, setDescription] = useState(initialApp?.description || '');
  const [folderPath, setFolderPath] = useState(initialApp?.folderPath || '');
  const [latestReleasePath, setLatestReleasePath] = useState(initialApp?.latestReleasePath || '');
  const [installerPath, setInstallerPath] = useState(initialApp?.installerPath || '');
  const [programPath, setProgramPath] = useState(initialApp?.programPath || '');
  const [runTarget, setRunTarget] = useState<HomeApp['runTarget']>(initialApp?.runTarget || 'latest');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canSave = Boolean(name.trim() && folderPath);

  const pickFolder = async () => {
    const nextPath = await window.agentWorkspace?.selectProjectFolder();
    if (!nextPath) return;
    setFolderPath(nextPath);
    if (!name.trim()) setName(nextPath.split(/[\\/]/).filter(Boolean).at(-1) || 'Projekt');
  };
  const pickFile = async (setter: (value: string) => void, title: string, application = false) => {
    const nextPath = application
      ? await window.agentWorkspace?.selectApplication()
      : await window.agentWorkspace?.selectLocalFile?.({ title });
    if (nextPath) setter(nextPath);
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-[260] grid place-items-center bg-black/45 px-4">
      <div className="modal-card library-project-form">
        <div className="library-project-form-header">
          <div>
            <h2>{initialApp ? 'Projekt bearbeiten' : 'Projekt zur Library hinzufuegen'}</h2>
            <p>Ordner reicht aus. Dateien kannst du jetzt oder spaeter in dieser Maske hinterlegen.</p>
          </div>
          <button onClick={onClose} title="Schliessen">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="library-project-form-body">
          <label>
            Projektname
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="z.B. Meine App" />
          </label>
          <label>
            Beschreibung
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Kurzbeschreibung fuer die Library..." />
          </label>
          <FilePickRow label="Projektordner" value={folderPath} onPick={pickFolder} />
          <FilePickRow label="Latest Release Datei" value={latestReleasePath} onPick={() => pickFile(setLatestReleasePath, 'Latest-Release-Datei auswaehlen')} />
          <FilePickRow label="Installer Datei" value={installerPath} onPick={() => pickFile(setInstallerPath, 'Installer-Datei auswaehlen', true)} />
          <FilePickRow label="Programm Datei" value={programPath} onPick={() => pickFile(setProgramPath, 'Programm-Datei auswaehlen', true)} />
          <div className="library-run-targets">
            <span>Beim Ausfuehren starten</span>
            {[
              ['latest', 'Latest Release'],
              ['installer', 'Installer'],
              ['program', 'Programm'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRunTarget(id as HomeApp['runTarget'])}
                className={runTarget === id ? 'active' : ''}
              >
                {label}
              </button>
            ))}
          </div>
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
                await onSubmit({ name, description, folderPath, latestReleasePath, installerPath, programPath, runTarget });
              } catch (submitError) {
                setError(submitError instanceof Error ? submitError.message : 'Projekt konnte nicht gespeichert werden.');
              } finally {
                setSaving(false);
              }
            }}
            className="library-button primary"
          >
            {saving ? 'Speichern...' : initialApp ? 'Speichern' : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilePickRow({ label, value, onPick }: { label: string; value: string; onPick(): void }) {
  return (
    <div className="library-file-row">
      <div>
        <span>{label}</span>
        <small title={value}>{value || 'Noch nicht ausgewaehlt'}</small>
      </div>
      <button type="button" onClick={onPick}>Auswaehlen</button>
    </div>
  );
}

function LibraryStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function FolderIcon() {
  return <FileCode2 className="h-4 w-4" />;
}

function classifyProject(title: string, path: string) {
  const value = `${title} ${path}`.toLowerCase();
  if (value.includes('antigravity')) return 'Antigravity';
  if (value.includes('codex')) return 'Codex';
  if (value.includes('codeforge') || value.includes('name\\name') || value.includes('name/name')) return 'CodeForge';
  return 'CodeForge';
}

function isMobileProject(path: string) {
  const value = path.toLowerCase();
  return value.includes('android') || value.includes('ios') || value.includes('mobile') || value.includes('handy') || value.includes('app\\src\\main');
}

function HomeTabsView() {
  const {
    homeTabs,
    activeHomeTab,
    activeHomeTabId,
    selectHomeTab,
    closeHomeTab,
    reloadHomeTab,
    updateHomeTabUrl,
  } = useAppContext();
  if (!activeHomeTab) return null;
  const activeUrl = activeHomeTab.currentUrl || activeHomeTab.url || activeHomeTab.path;

  return (
    <main className="flex-1 min-w-0 flex flex-col bg-black/10">
      <div className="flex min-h-10 items-center gap-1 border-b border-white/10 bg-black/20 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto custom-scrollbar py-1">
          {homeTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => selectHomeTab(tab.id)}
              className={`group flex h-8 max-w-48 shrink-0 items-center gap-2 rounded-md border px-2 text-left text-xs transition-colors ${
                tab.id === activeHomeTabId
                  ? 'border-white/15 bg-white/10 text-white'
                  : 'border-transparent text-zinc-500 hover:bg-white/5 hover:text-zinc-200'
              }`}
              title={tab.currentUrl || tab.path}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-white/[0.06] text-[9px] font-semibold">
                {tab.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate">{tab.name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  closeHomeTab(tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.stopPropagation();
                  closeHomeTab(tab.id);
                }}
                className="rounded p-0.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-300"
                title="Tab schliessen"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/15 px-4 py-2">
        <div className="flex flex-1 min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-semibold text-zinc-300">
            {activeHomeTab.name.slice(0, 2).toUpperCase()}
          </div>
          {activeHomeTab.kind === 'web' ? (
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="truncate text-xs font-medium text-white">{activeHomeTab.name}</div>
              <input
                type="text"
                key={activeHomeTab.id + '-' + activeUrl}
                defaultValue={activeUrl}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value.trim();
                    let url = val;
                    if (val && !/^https?:\/\//i.test(val)) {
                      url = 'https://' + val;
                    }
                    if (url) {
                      updateHomeTabUrl(activeHomeTab.id, url);
                    }
                  }
                }}
                className="bg-black/45 border border-white/10 rounded px-2 py-0.5 text-xs text-zinc-300 focus:text-white outline-none w-full max-w-xl focus:border-amber-500/50"
              />
            </div>
          ) : (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{activeHomeTab.name}</div>
              <div className="truncate text-[10px] text-zinc-600">{activeUrl}</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => reloadHomeTab(activeHomeTab.id)}
            className="rounded-md p-2 text-zinc-500 hover:bg-white/5 hover:text-white"
            title="Tab neu laden"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            onClick={() =>
              activeHomeTab.kind === 'web'
                ? window.agentWorkspace?.openExternal(activeUrl)
                : reloadHomeTab(activeHomeTab.id)
            }
            className="rounded-md p-2 text-zinc-500 hover:bg-white/5 hover:text-white"
            title={activeHomeTab.kind === 'web' ? 'Extern oeffnen' : 'App einbetten'}
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            onClick={() => closeHomeTab(activeHomeTab.id)}
            className="rounded-md p-2 text-zinc-500 hover:bg-white/5 hover:text-white"
            title="Tab schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        {homeTabs.map((tab) =>
          tab.kind === 'web' ? (
            <WebHomeTab key={tab.id} tab={tab} active={tab.id === activeHomeTabId} />
          ) : (
            <NativeHomeTab key={tab.id} tab={tab} active={tab.id === activeHomeTabId} />
          ),
        )}
      </div>
    </main>
  );
}

type WebviewElement = HTMLElement & {
  loadURL?: (url: string) => void;
  reload?: () => void;
  getURL?: () => string;
};

function WebHomeTab({ tab, active }: { tab: HomeAppTab; active: boolean }) {
  const { updateHomeTabUrl } = useAppContext();
  const webviewRef = useRef<WebviewElement | null>(null);
  const src = tab.currentUrl || tab.url || tab.path;

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const openInSameTab = (event: Event) => {
      const url = (event as Event & { url?: string }).url;
      if (!url || !/^https?:\/\//i.test(url)) return;
      event.preventDefault();
      updateHomeTabUrl(tab.id, url);
      webview.loadURL?.(url);
    };
    const rememberUrl = (event: Event) => {
      const url = (event as Event & { url?: string }).url || webview.getURL?.() || '';
      if (/^https?:\/\//i.test(url)) updateHomeTabUrl(tab.id, url);
    };

    webview.addEventListener('new-window', openInSameTab);
    webview.addEventListener('did-navigate', rememberUrl);
    webview.addEventListener('did-navigate-in-page', rememberUrl);
    return () => {
      webview.removeEventListener('new-window', openInSameTab);
      webview.removeEventListener('did-navigate', rememberUrl);
      webview.removeEventListener('did-navigate-in-page', rememberUrl);
    };
  }, [tab.id, updateHomeTabUrl]);

  useEffect(() => {
    if (tab.reloadKey > 0) webviewRef.current?.reload?.();
  }, [tab.reloadKey]);

  useEffect(() => {
    if (webviewRef.current && src) {
      const currentWebviewSrc = webviewRef.current.getURL?.() || '';
      if (currentWebviewSrc !== src && webviewRef.current.loadURL) {
        webviewRef.current.loadURL(src);
      }
    }
  }, [src]);

  return (
    <webview
      ref={webviewRef}
      src={src}
      className={`absolute inset-0 h-full w-full bg-white ${active ? 'block' : 'hidden'}`}
    />
  );
}

function NativeHomeTab({ tab, active }: { tab: HomeAppTab; active: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'embedded' | 'failed'>('idle');
  const [message, setMessage] = useState('App wird in den Tab eingebettet...');

  const readBounds = () => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return { x: -32000, y: -32000, width: 100, height: 100 };
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  };

  const attach = async () => {
    setStatus('starting');
    setMessage('App wird gestartet und eingebettet...');
    try {
      const result = await window.agentWorkspace?.attachNativeTab({
        tabId: tab.id,
        path: tab.path,
        bounds: readBounds(),
        dpr: window.devicePixelRatio || 1,
      });
      if (!result?.ok) {
        setStatus('failed');
        setMessage(result?.message || 'Die App konnte nicht in den Tab eingebettet werden.');
        return;
      }
      setStatus('embedded');
      setMessage('App ist in diesem Tab eingebettet.');
    } catch (error) {
      setStatus('failed');
      setMessage(error instanceof Error ? error.message : 'Die App konnte nicht in den Tab eingebettet werden.');
    }
  };

  const move = async (visible: boolean) => {
    try {
      await window.agentWorkspace?.moveNativeTab({
        tabId: tab.id,
        bounds: visible ? readBounds() : { x: -32000, y: -32000, width: 100, height: 100 },
        dpr: window.devicePixelRatio || 1,
      });
    } catch {
      // Moving is best-effort; attach/detach report visible errors.
    }
  };

  useEffect(() => {
    if (!active) {
      void move(false);
      return;
    }

    let cancelled = false;
    let resizeTimer = 0;
    const sync = () => {
      if (cancelled) return;
      void move(true);
    };

    void attach();
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(sync, 40);
    });
    if (hostRef.current) observer.observe(hostRef.current);
    window.addEventListener('resize', sync);

    return () => {
      cancelled = true;
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      window.removeEventListener('resize', sync);
      void move(false);
    };
  }, [active, tab.id, tab.path, tab.reloadKey]);

  useEffect(() => {
    return () => {
      void window.agentWorkspace?.detachNativeTab(tab.id);
    };
  }, [tab.id]);

  return (
    <div ref={hostRef} className={`absolute inset-0 ${active ? 'block' : 'hidden'} bg-black/20`}>
      {status !== 'embedded' && (
        <div className="grid h-full place-items-center px-8">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.035] p-5 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-sm font-semibold text-zinc-300">
              {status === 'starting' ? <Loader2 className="h-5 w-5 animate-spin" /> : tab.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="mt-4 text-sm font-medium text-white">{tab.name}</div>
            <div className="mt-2 text-xs leading-5 text-zinc-500">{message}</div>
            <div className="mt-3 break-all font-mono text-[11px] leading-5 text-zinc-600">{tab.path}</div>
            {status === 'failed' && (
              <div className="mt-5 flex justify-center gap-2">
                <button onClick={() => void attach()} className="secondary-button">
                  <RotateCw className="h-4 w-4" />
                  Erneut versuchen
                </button>
                <button
                  onClick={() => window.agentWorkspace?.launchApplication(tab.path)}
                  className="secondary-button"
                >
                  <ExternalLink className="h-4 w-4" />
                  Extern starten
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {status === 'embedded' && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-black/20 bg-black/45 px-2 py-1 text-[10px] text-zinc-400 opacity-0 transition-opacity hover:opacity-100">
          {tab.name}
        </div>
      )}
    </div>
  );
}

const startedTerminalTabs = new Set<string>();

const getAgentCommand = (provider: string) => {
  if (provider === 'antigravity') return 'agy';
  if (provider === 'anthropic') return 'claude';
  if (provider === 'openai') return 'codex';
  if (provider === 'cursor') return 'cursor';
  if (provider === 'freebuff') return 'freebuff';
  return provider;
};

const getThemeColors = (themeId: string, customThemes: any[]) => {
  const custom = customThemes.find(t => t.id === themeId);
  if (custom) {
    return {
      background: custom.background || '#111111',
      foreground: custom.text || '#d4d4d4',
      cursor: custom.accent || '#f2c96d'
    };
  }

  const defaultThemes: Record<string, { bg: string; fg: string; accent: string }> = {
    'modern-dark': { bg: '#111111', fg: '#d4d4d4', accent: '#f2c96d' },
    'classic-light': { bg: '#f5f2ed', fg: '#18181b', accent: '#18181b' },
    'deep-galactic': { bg: '#05060a', fg: '#d4d4d4', accent: '#64d2ff' },
    'muted-earth': { bg: '#e5e1d8', fg: '#6f5f46', accent: '#6f5f46' },
    'neon-cyber': { bg: '#1a1a1a', fg: '#00e5ff', accent: '#ff3df2' },
    'midnight-ocean': { bg: '#071826', fg: '#d4d4d4', accent: '#67e8f9' },
    'forest-terminal': { bg: '#07130d', fg: '#d4d4d4', accent: '#7ddc9f' },
    'solarized-dawn': { bg: '#fdf6e3', fg: '#268bd2', accent: '#268bd2' },
    'rose-quartz': { bg: '#fff1f2', fg: '#be185d', accent: '#be185d' },
    'mono-slate': { bg: '#0f172a', fg: '#e2e8f0', accent: '#e2e8f0' },
    'amber-console': { bg: '#160f06', fg: '#f59e0b', accent: '#f59e0b' },
    'arctic-blue': { bg: '#eff6ff', fg: '#2563eb', accent: '#2563eb' },
    'violet-noir': { bg: '#10051b', fg: '#c084fc', accent: '#c084fc' },
    'high-contrast': { bg: '#000000', fg: '#ffffff', accent: '#22c55e' },
    'aurora-flow': { bg: '#052e2b', fg: '#a7f3d0', accent: '#a7f3d0' },
    'neon-flow': { bg: '#09090b', fg: '#22d3ee', accent: '#22d3ee' }
  };

  const colors = defaultThemes[themeId] || { bg: '#111111', fg: '#d4d4d4', accent: '#f2c96d' };
  return {
    background: colors.bg,
    foreground: colors.fg,
    cursor: colors.accent
  };
};

function TerminalInstance({
  tabId,
  startPath,
  active,
  shellType,
  chat,
  tab,
}: {
  tabId: string;
  startPath: string | undefined;
  active: boolean;
  shellType?: 'powershell' | 'cmd';
  chat: Chat;
  tab?: TerminalTab;
}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastNotificationTimeRef = useRef<number>(0);
  // A tab may target its own V-Server; otherwise the whole chat does. 'local' tabs of an SSH chat run on this PC.
  const sshServer = tab?.location === 'local' ? undefined : tab?.vserver ?? chat.vserver;

  const {
    terminalStartCommandEnabled,
    terminalStartCommand,
    terminalPrefixSuffixEnabled,
    terminalPrefix,
    terminalSuffix,
    terminalTriggerWords,
    provider,
    theme,
    customThemes,
    externalServer,
    platformStartCommands,
    platformWaitTimes
  } = useAppContext();

  const settingsRef = useRef({
    terminalPrefixSuffixEnabled,
    terminalPrefix,
    terminalSuffix,
    terminalTriggerWords,
  });

  useEffect(() => {
    settingsRef.current = {
      terminalPrefixSuffixEnabled,
      terminalPrefix,
      terminalSuffix,
      terminalTriggerWords,
    };
  }, [terminalPrefixSuffixEnabled, terminalPrefix, terminalSuffix, terminalTriggerWords]);

  useEffect(() => {
    if (!terminalRef.current) return;

    let bg = 'rgba(0, 0, 0, 0)';
    let fg = '#d4d4d4';
    let cursor = '#fff';

    if (chat.mode === 'standard') {
      const colors = getThemeColors(theme, customThemes);
      bg = colors.background;
      fg = colors.foreground;
      cursor = colors.cursor;
    }

    // Initialize XTerm
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'Consolas, Courier New, monospace',
      theme: {
        background: bg,
        foreground: fg,
        cursor: cursor,
      },
      convertEol: true,
      // Links in the terminal (e.g. the agy Google login) open in Chrome, not in an app window.
      linkHandler: {
        activate: (_event, uri) => {
          if (/^https?:\/\//i.test(uri)) void window.agentWorkspace?.openInChrome(uri);
        },
        allowNonHttpProtocols: false,
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    if (active) {
      term.focus();
    }

    // Start PTY session in backend
    const shellCreated = window.agentWorkspace.createShellSession({
      chatId: tabId,
      cwd: startPath,
      shellType,
      externalServer: !chat.vserver && !sshServer && !tab?.agyAccountId && externalServer.enabled ? externalServer : undefined,
      vserver: sshServer,
      agyAccountId: tab?.agyAccountId,
    });

    const runStartCommands = () => {
      // SSH login takes longer than a local shell before a command can be typed.
      const commandDelay = sshServer ? 3500 : 1000;
      if (tab?.command || tab?.blank) {
        if (tab.command && !startedTerminalTabs.has(tabId)) {
          startedTerminalTabs.add(tabId);
          const tabCommand = tab.command;
          setTimeout(() => {
            window.agentWorkspace.writeToShellSession({ chatId: tabId, text: tabCommand + '\r' });
          }, commandDelay);
        }
      } else if (sshServer) {
        // Plain SSH session: no local start command.
      } else if (chat.mode === 'standard') {
        const agentCmd = platformStartCommands[provider] || getAgentCommand(provider);
        const waitTime = platformWaitTimes[provider] || 5000;
        if (!startedTerminalTabs.has(tabId)) {
          startedTerminalTabs.add(tabId);
          setTimeout(() => {
            window.agentWorkspace.writeToShellSession({ chatId: tabId, text: agentCmd + '\r' });
          
            const initialPrompt = chat.messages.find(m => m.sender === 'user')?.text;
            if (initialPrompt) {
              setTimeout(() => {
                window.agentWorkspace.writeToShellSession({ chatId: tabId, text: initialPrompt + '\r' });
              }, waitTime);
            }
          }, 1000);
        }
      } else if (chat.harness) {
        if (chat.harness.command && !startedTerminalTabs.has(tabId)) {
          startedTerminalTabs.add(tabId);
          const harnessCommand = chat.harness.command;
          setTimeout(() => {
            window.agentWorkspace.writeToShellSession({ chatId: tabId, text: harnessCommand + '\r' });
          }, 1000);
        }
      } else {
        if (terminalStartCommandEnabled && terminalStartCommand && !startedTerminalTabs.has(tabId)) {
          startedTerminalTabs.add(tabId);
          setTimeout(() => {
            window.agentWorkspace.writeToShellSession({ chatId: tabId, text: terminalStartCommand + '\r' });
          }, 1000);
        }
      }

    };
    // CodeForge Web re-attaches running sessions; their program must not be started a second time.
    Promise.resolve(shellCreated)
      .then((result) => {
        if (result && result.skipStartCommand) {
          startedTerminalTabs.add(tabId);
          return;
        }
        runStartCommands();
      })
      .catch(() => runStartCommands());

    // Handle incoming output from backend PTY
    const unsubscribe = window.agentWorkspace.onShellOutput(tabId, (payload: any) => {
      if (payload.type === 'stdout' || payload.type === 'stderr') {
        term.write(payload.text);

        // Scan output for trigger words
        const currentTriggerWords = settingsRef.current.terminalTriggerWords;
        if (currentTriggerWords && payload.text) {
          const now = Date.now();
          if (now - lastNotificationTimeRef.current >= 6000) {
            const words = currentTriggerWords.split(',').map((w: string) => w.trim()).filter(Boolean);
            let matched = false;
            for (const word of words) {
              if (payload.text.toLowerCase().includes(word.toLowerCase())) {
                new Notification('Terminal Trigger', {
                  body: `Trigger-Wort "${word}" im Terminal gefunden!`,
                  silent: false
                });
                matched = true;
                break;
              }
            }
            if (matched) {
              lastNotificationTimeRef.current = now;
            }
          }
        }
      }
    });

    // Handle user keystrokes in xterm and send them directly to PTY stdin!
    let inputBuffer = '';
    let lastWasCR = false;
    const onDataDisposable = term.onData((data) => {
      const { terminalPrefixSuffixEnabled: pfxEnabled, terminalPrefix: pfx, terminalSuffix: sfx } = settingsRef.current;
      if (pfxEnabled) {
        if (data.startsWith('\x1b')) {
          window.agentWorkspace.writeToShellSession({ chatId: tabId, text: data });
          lastWasCR = false;
          return;
        }
        if (data.length === 1 && data.charCodeAt(0) < 32 && data !== '\t' && data !== '\r' && data !== '\n' && data !== '\x08') {
          window.agentWorkspace.writeToShellSession({ chatId: tabId, text: data });
          if (data === '\x03') {
            inputBuffer = '';
          }
          lastWasCR = false;
          return;
        }

        for (let i = 0; i < data.length; i++) {
          const char = data[i];
          if (char === '\r' || char === '\n') {
            if (char === '\n' && lastWasCR) {
              lastWasCR = false;
              continue;
            }
            lastWasCR = char === '\r';
            const finalCommand = (pfx || '') + inputBuffer + (sfx || '');
            const eraseSeq = '\b \b'.repeat(inputBuffer.length);
            term.write(eraseSeq);
            window.agentWorkspace.writeToShellSession({ chatId: tabId, text: finalCommand + '\r' });
            inputBuffer = '';
          } else if (char === '\x7f' || char === '\x08') {
            lastWasCR = false;
            if (inputBuffer.length > 0) {
              inputBuffer = inputBuffer.slice(0, -1);
              term.write('\b \b');
            }
          } else if (char.charCodeAt(0) < 32 && char !== '\t') {
            window.agentWorkspace.writeToShellSession({ chatId: tabId, text: char });
            if (char === '\x03') {
              inputBuffer = '';
            }
            lastWasCR = false;
          } else {
            lastWasCR = false;
            inputBuffer += char;
            term.write(char);
          }
        }
      } else {
        window.agentWorkspace.writeToShellSession({ chatId: tabId, text: data });
      }
    });

    // Handle window resize to adjust PTY rows/cols
    const handleResize = () => {
      try {
        fitAddon.fit();
        window.agentWorkspace.resizeShellSession({
          chatId: tabId,
          cols: term.cols,
          rows: term.rows,
        });
      } catch (e) {
        // ignore
      }
    };
    window.addEventListener('resize', handleResize);

    const timer = setTimeout(handleResize, 100);

    return () => {
      clearTimeout(timer);
      onDataDisposable.dispose();
      unsubscribe();
      term.dispose();
      window.removeEventListener('resize', handleResize);
    };
  }, [tabId, startPath]);

  // Keep terminal focused and resize when this tab becomes active
  useEffect(() => {
    if (active && xtermRef.current) {
      xtermRef.current.focus();
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          window.agentWorkspace.resizeShellSession({
            chatId: tabId,
            cols: xtermRef.current!.cols,
            rows: xtermRef.current!.rows,
          });
        } catch (e) {
          // ignore
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [active, tabId]);

  return (
    <div 
      className={`w-full h-full ${active ? '' : 'hidden'}`} 
      ref={terminalRef} 
      onClick={() => xtermRef.current?.focus()}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files);
        if (!files.length) return;
        event.preventDefault();
        const paths = files
          .map((file) => window.agentWorkspace?.getPathForFile?.(file) || '')
          .filter(Boolean)
          .map((filePath) => (/s/.test(filePath) ? `"${filePath}"` : filePath));
        if (!paths.length) return;
        window.agentWorkspace.writeToShellSession({ chatId: tabId, text: paths.join(' ') + ' ' });
        xtermRef.current?.focus();
      }}
    />
  );
}

function TerminalChatView({ chat }: { chat: Chat }) {
  const {
    selectedProject,
    terminalStartPath,
    chats,
    setChats,
    theme,
    terminalTransparency,
    terminalStartCommandEnabled,
    setTerminalStartCommandEnabled,
    terminalPrefixSuffixEnabled,
    setTerminalPrefixSuffixEnabled,
    openBrowserTab,
    cliHarnesses,
    mobileMode,
  } = useAppContext();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const currentChat = chats.find((c) => c.id === chat.id) || chat;
  const tabs = currentChat.terminalTabs || [{ id: chat.id, title: 'Terminal 1' }];
  const activeTabId = currentChat.activeTerminalTabId || chat.id;
  const terminalLayout = currentChat.terminalLayout || 'single';
  // Phones and tablets stack grid terminals in one scrollable column.
  const stacked = useCompactLayout() || mobileMode;
  const gridSize = Math.max(1, Math.min(6, currentChat.terminalGridSize || 4));

  const startPath = terminalStartPath || selectedProject?.path || undefined;
  const activeServer = tabs.find((tab) => tab.id === activeTabId)?.vserver ?? currentChat.vserver;

  // Dictation writes recognized text into the active terminal tab.
  const activeTabRef = useRef(activeTabId);
  activeTabRef.current = activeTabId;
  const voice = useVoiceSettings();
  const dictation = useDictation(
    (spoken) => {
      if (activeTabRef.current) window.agentWorkspace?.writeToShellSession({ chatId: activeTabRef.current, text: spoken });
    },
    () => {
      if (activeTabRef.current) window.agentWorkspace?.writeToShellSession({ chatId: activeTabRef.current, text: '\r' });
    },
  );
  const listening = dictation.listening;
  const toggleDictation = dictation.toggle;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!voice.enabled) return;
      if (
        (event.altKey && event.key.toLowerCase() === 's') ||
        (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's')
      ) {
        event.preventDefault();
        toggleDictation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDictation, voice.enabled]);

  const handleSelectTab = (tabId: string) => {
    setChats((current) =>
      current.map((c) =>
        c.id === chat.id ? { ...c, activeTerminalTabId: tabId } : c
      )
    );
  };

  const plusButtonTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const lastClickTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!addMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) setAddMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [addMenuOpen]);

  const [addServerOpen, setAddServerOpen] = useState(false);
  const [sftpServer, setSftpServer] = useState<VServerConnection | null>(null);
  const savedServers = useVServers();

  const handleAddTab = (
    shellType?: 'powershell' | 'cmd',
    harness?: CliHarness | 'blank',
    target?: VServerConnection | 'local',
  ) => {
    const newTabId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const server = target && target !== 'local' ? target : undefined;
    const local = target === 'local' || (target === undefined && !chat.vserver);
    const label = harness && harness !== 'blank'
      ? harness.name
      : server
        ? server.name
        : !local && chat.vserver
          ? chat.vserver.name
          : shellType === 'powershell' ? 'PowerShell' : 'Terminal';
    const newTab: TerminalTab = {
      id: newTabId,
      title: server ? label : `${label} ${tabs.length + 1}`,
      shellType: shellType || 'cmd',
      ...(target === 'local' && chat.vserver ? { location: 'local' as const } : {}),
      ...(server ? { vserver: { id: server.id, name: server.name, host: server.host, port: server.port, user: server.user, keyPath: server.keyPath } } : {}),
      ...(harness === 'blank' || (server && !harness) ? { blank: true } : harness ? { command: harness.command } : {}),
    };
    setAddMenuOpen(false);
    setChats((current) =>
      current.map((c) => {
        if (c.id === chat.id) {
          const oldTabs = c.terminalTabs || [{ id: chat.id, title: 'Terminal 1' }];
          return {
            ...c,
            terminalTabs: [...oldTabs, newTab],
            activeTerminalTabId: newTabId,
          };
        }
        return c;
      })
    );
  };

  const handlePlusMouseDown = () => {
    isLongPressRef.current = false;
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    plusButtonTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      handleAddTab('powershell', undefined, 'local');
    }, 600); // 600ms hold
  };

  const handlePlusMouseUp = () => {
    if (plusButtonTimerRef.current) {
      clearTimeout(plusButtonTimerRef.current);
      plusButtonTimerRef.current = null;
    }
    if (!isLongPressRef.current) {
      const now = Date.now();
      const diff = now - lastClickTimeRef.current;
      if (diff < 280) {
        lastClickTimeRef.current = 0;
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        openBrowserTab('https://www.google.com', 'Google Chrome');
      } else {
        lastClickTimeRef.current = now;
        clickTimeoutRef.current = setTimeout(() => {
          setAddMenuOpen((open) => !open);
          clickTimeoutRef.current = null;
        }, 280);
      }
    }
  };

  const handlePlusMouseLeave = () => {
    if (plusButtonTimerRef.current) {
      clearTimeout(plusButtonTimerRef.current);
      plusButtonTimerRef.current = null;
    }
  };

  const handlePlusTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    handlePlusMouseDown();
  };

  const handlePlusTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    handlePlusMouseUp();
  };

  const handleCloseTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;

    await window.agentWorkspace.killShellSession(tabId);

    const newTabs = tabs.filter((t) => t.id !== tabId);
    let newActiveId = activeTabId;
    if (activeTabId === tabId) {
      const idx = tabs.findIndex((t) => t.id === tabId);
      newActiveId = idx > 0 ? tabs[idx - 1].id : newTabs[0].id;
    }

    setChats((current) =>
      current.map((c) =>
        c.id === chat.id
          ? { ...c, terminalTabs: newTabs, activeTerminalTabId: newActiveId }
          : c
      )
    );
  };

  const startEditing = (tabId: string, currentTitle: string) => {
    setEditingTabId(tabId);
    setEditingTitle(currentTitle);
  };

  const saveTitle = () => {
    if (!editingTabId || !editingTitle.trim()) {
      setEditingTabId(null);
      return;
    }
    setChats((current) =>
      current.map((c) => {
        if (c.id === chat.id) {
          const oldTabs = c.terminalTabs || [{ id: chat.id, title: 'Terminal 1' }];
          return {
            ...c,
            terminalTabs: oldTabs.map((t) =>
              t.id === editingTabId ? { ...t, title: editingTitle.trim() } : t
            ),
          };
        }
        return c;
      })
    );
    setEditingTabId(null);
  };

  const handleRestart = async () => {
    const newTabId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    await window.agentWorkspace.killShellSession(activeTabId);
    setChats((current) =>
      current.map((c) => {
        if (c.id === chat.id) {
          const oldTabs = c.terminalTabs || [{ id: chat.id, title: 'Terminal 1' }];
          return {
            ...c,
            terminalTabs: oldTabs.map((t) =>
              t.id === activeTabId ? { ...t, id: newTabId } : t
            ),
            activeTerminalTabId: newTabId,
          };
        }
        return c;
      })
    );
  };

  return (
    <main
      className={`min-w-0 flex flex-col backdrop-blur-[2px] transition-all duration-300 ${
        isFullscreen
          ? `fixed inset-0 z-[200] p-6 ${
              theme === 'classic-light' || theme === 'solarized-dawn' || theme === 'rose-quartz' || theme === 'arctic-blue'
                ? 'bg-[#f4f4f7] text-zinc-900'
                : 'bg-[#0a0809] text-zinc-300'
            }`
          : 'flex-1 p-6'
      }`}
      style={isFullscreen ? {} : { backgroundColor: `rgba(0, 0, 0, ${terminalTransparency / 100})` }}
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4 shrink-0">
        <div className="flex items-center gap-4 overflow-x-auto max-w-[70%] custom-scrollbar">
          <div className="flex items-center gap-1.5 shrink-0 pr-3 border-r border-white/10">
            {chat.vserver ? <Server className="w-4 h-4 text-sky-400" /> : <Terminal className="w-4 h-4 text-emerald-400" />}
            <span className="text-sm font-semibold text-white">{chat.title}</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            {tabs.map((tab) => {
              const active = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  onClick={() => handleSelectTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all duration-150 shrink-0 ${
                    active
                      ? 'bg-zinc-800 text-white border-white/20 shadow-md shadow-black/30'
                      : 'bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border-transparent'
                  }`}
                >
                  {editingTabId === tab.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={saveTitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveTitle();
                        if (e.key === 'Escape') setEditingTabId(null);
                      }}
                      className="bg-black/50 text-white text-xs border border-amber-500/50 rounded px-1.5 py-0.5 outline-none w-24 font-normal"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="flex items-center gap-1.5 truncate max-w-[120px]"
                      onDoubleClick={() => startEditing(tab.id, tab.title)}
                      title="Doppelklick zum Umbenennen"
                    >
                      {tab.location !== 'local' && (tab.vserver || chat.vserver) && <Server className="w-3 h-3 shrink-0 text-sky-400" />}
                      <span className="truncate">{tab.title}</span>
                    </span>
                  )}
                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => void handleCloseTab(e, tab.id)}
                      className="p-0.5 rounded-full hover:bg-white/10 text-zinc-500 hover:text-zinc-200 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
            <div ref={addMenuRef} className="relative">
            <button
              onMouseDown={handlePlusMouseDown}
              onMouseUp={handlePlusMouseUp}
              onMouseLeave={handlePlusMouseLeave}
              onTouchStart={handlePlusTouchStart}
              onTouchEnd={handlePlusTouchEnd}
              className="p-1.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-white/5 hover:border-white/10 transition-all duration-150 shadow-sm select-none"
              title="Neues Terminal-Tab (gedrückt halten für PowerShell)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {addMenuOpen && (
              <NewTabMenu
                harnesses={cliHarnesses}
                servers={savedServers}
                sshChat={Boolean(chat.vserver)}
                onBlank={(target) => handleAddTab('cmd', 'blank', target)}
                onHarness={(harness, target) => handleAddTab('cmd', harness, target)}
                onServer={(server) => handleAddTab('cmd', undefined, server)}
                onAddServer={() => {
                  setAddMenuOpen(false);
                  setAddServerOpen(true);
                }}
                onSftp={(server) => {
                  setAddMenuOpen(false);
                  setSftpServer(server);
                }}
              />
            )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {voice.showStartCommandButton && <label className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition-all duration-150 ${
            terminalStartCommandEnabled
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-medium'
              : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-300 hover:bg-white/5'
          }`}>
            <input
              type="checkbox"
              checked={terminalStartCommandEnabled}
              onChange={(e) => setTerminalStartCommandEnabled(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-2 h-2 rounded-full transition-colors duration-150 ${terminalStartCommandEnabled ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span>Start-Befehl</span>
          </label>}

          {voice.showPrefixSuffixButton && <label className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition-all duration-150 ${
            terminalPrefixSuffixEnabled
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-medium'
              : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-300 hover:bg-white/5'
          }`}>
            <input
              type="checkbox"
              checked={terminalPrefixSuffixEnabled}
              onChange={(e) => setTerminalPrefixSuffixEnabled(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-2 h-2 rounded-full transition-colors duration-150 ${terminalPrefixSuffixEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span>Präfix/Suffix</span>
          </label>}

          {activeServer && (
            <button
              onClick={() => setSftpServer(activeServer)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sky-400/20 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-xs cursor-pointer select-none transition-colors duration-150"
              title={`SFTP-Dateien von ${activeServer.name}`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>SFTP</span>
            </button>
          )}

          <button
            onClick={async () => {
              try {
                const clipboardText = await navigator.clipboard.readText();
                if (clipboardText) {
                  window.agentWorkspace.writeToShellSession({ chatId: activeTabId, text: clipboardText });
                }
              } catch (err) {
                console.error('Failed to read clipboard', err);
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-300 hover:bg-white/5 text-xs cursor-pointer select-none transition-colors duration-150"
            title="Zwischenablage einfügen"
          >
            <Clipboard className="w-3.5 h-3.5" />
            <span>Einfügen</span>
          </button>

          {voice.enabled && voice.showMicButton && <button
            onClick={toggleDictation}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition-colors duration-150 ${
              listening
                ? 'bg-red-500/10 border-red-500/30 text-red-400 font-medium animate-pulse'
                : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-300 hover:bg-white/5'
            }`}
            title="Spracheingabe aktivieren (Alt+S oder Ctrl+Shift+S)"
          >
            {listening ? (
              <span className="relative flex h-2 w-2 mr-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
            <span>{listening ? (dictation.busy ? 'Erkenne...' : 'Aufnahme...') : 'Spracheingabe'}</span>
          </button>}

          <div className="h-4 w-px bg-white/10" />

          <button
            onClick={() => setChats((current) =>
              current.map((c) => (c.id === chat.id ? { ...c, terminalLayout: terminalLayout === 'grid' ? 'single' : 'grid' } : c))
            )}
            className={`p-1.5 rounded border transition-colors flex items-center gap-1 ${
              terminalLayout === 'grid'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-medium'
                : 'bg-zinc-800 border-white/10 text-zinc-300 hover:bg-zinc-700 hover:text-white'
            }`}
            title={terminalLayout === 'grid' ? 'Grid-Layout deaktivieren' : '4-Spalten Grid-Layout aktivieren'}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Grid</span>
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded bg-zinc-800 border border-white/10 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
            title={isFullscreen ? 'Fullscreen beenden' : 'Fullscreen aktivieren'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 border border-white/10 text-zinc-300 hover:bg-zinc-700 hover:text-white text-[10px] uppercase font-bold tracking-wider transition-colors"
          >
            Neustarten
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full relative">
        {terminalLayout === 'grid' ? (
          <div className={stacked ? 'flex h-full w-full flex-col gap-3 overflow-y-auto' : `grid gap-3 h-full w-full ${gridSize <= 2 ? `${gridSize === 2 ? 'grid-cols-2' : 'grid-cols-1'} grid-rows-1` : gridSize <= 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-3 grid-rows-2'}`}>
            {tabs.slice(0, gridSize).map((tab) => (
              <div key={tab.id} className={`border border-white/10 rounded-lg p-3 bg-black/45 relative flex flex-col min-h-0 ${stacked ? 'h-[60vh] min-h-[280px] shrink-0' : 'h-full'}`}>
                <div className="flex items-center justify-between text-[10px] text-zinc-400 pb-1.5 border-b border-white/5 mb-1.5">
                  <span className="font-semibold text-zinc-300">{tab.title}</span>
                  <span className="uppercase text-[8px] bg-white/5 px-1.5 py-0.5 rounded font-mono border border-white/5">{tab.shellType || 'cmd'}</span>
                </div>
                <div className="flex-1 min-h-0 relative">
                  <TerminalInstance
                    tabId={tab.id}
                    startPath={startPath}
                    active={true}
                    shellType={tab.shellType}
                    chat={chat}
                    tab={tab}
                  />
                </div>
              </div>
            ))}
            {!stacked && tabs.length < gridSize && Array.from({ length: gridSize - tabs.length }).map((_, i) => (
              <div key={`empty-${i}`} className="border border-dashed border-white/5 rounded-lg flex flex-col items-center justify-center bg-black/10">
                <span className="text-[10px] text-zinc-600 uppercase font-mono">Kein Tab</span>
                <button
                  onClick={() => handleAddTab('cmd')}
                  className="mt-2 text-[10px] text-amber-500/80 hover:text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Hinzufügen
                </button>
              </div>
            ))}
          </div>
        ) : (
          tabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              tabId={tab.id}
              startPath={startPath}
              active={tab.id === activeTabId}
              shellType={tab.shellType}
              chat={chat}
              tab={tab}
            />
          ))
        )}
      </div>

      {addServerOpen && (
        <AddVServerDialog
          onCancel={() => setAddServerOpen(false)}
          onSaved={(server) => {
            setAddServerOpen(false);
            handleAddTab('cmd', undefined, server);
          }}
        />
      )}
      {sftpServer && <SftpBrowser server={sftpServer} onClose={() => setSftpServer(null)} />}
    </main>
  );
}

function HomeView() {
  const { cliHarnesses, startWorkspace, selectedProject, agyAccounts, startAgyAccounts } = useAppContext();
  const [picking, setPicking] = useState<false | 'workspace' | 'chat' | 'vserver'>(false);
  const [harnessId, setHarnessId] = useState(() => cliHarnesses[0]?.id || '');
  const [grid, setGrid] = useState(true);
  const [count, setCount] = useState(1);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [agyStarting, setAgyStarting] = useState(false);
  const [agyError, setAgyError] = useState('');

  const handleStartAgy = async () => {
    if (agyAccounts.length === 0) {
      setAgyError('Noch keine Antigravity-Accounts angelegt. Fuege sie in den Einstellungen unter "Antigravity Accounts" hinzu.');
      return;
    }
    setAgyStarting(true);
    setAgyError('');
    try {
      await startAgyAccounts();
    } catch (err) {
      setAgyError(err instanceof Error ? err.message : 'Antigravity konnte nicht gestartet werden.');
      setAgyStarting(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    setError('');
    try {
      await startWorkspace({ harnessId, grid, count });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workspace konnte nicht gestartet werden.');
      setStarting(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-8 overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-[640px] flex flex-col items-center">
        <div className="empty-orbit w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-6">
          <Home className="w-6 h-6 text-zinc-400" />
        </div>
        <h1 className="text-3xl text-white font-medium text-center tracking-tight">Home</h1>
        <p className="text-sm text-zinc-600 mt-3 text-center max-w-lg">
          {selectedProject ? `Workspace startet in ${selectedProject.path}` : 'Ohne Projekt nutzt CodeForge einen eigenen Arbeitsordner.'}
        </p>

        {!picking ? (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setPicking('workspace')}
              className="primary-button !py-3 !px-8 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200"
            >
              <Play className="w-4 h-4 fill-current text-white" />
              <span>Workspace starten</span>
            </button>
            <button
              onClick={() => setPicking('chat')}
              className="primary-button !py-3 !px-8 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200"
            >
              <MessageSquare className="w-4 h-4 text-white" />
              <span>Chat starten</span>
            </button>
            <button
              onClick={() => setPicking('vserver')}
              className="primary-button !py-3 !px-8 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200"
            >
              <Server className="w-4 h-4 text-white" />
              <span>V-Server</span>
            </button>
            <button
              onClick={handleStartAgy}
              disabled={agyStarting}
              title={agyAccounts.length ? `${agyAccounts.length} Antigravity-Accounts nebeneinander starten` : 'Accounts in den Einstellungen anlegen'}
              className="primary-button !py-3 !px-8 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200 disabled:opacity-50"
            >
              {agyStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4 text-white" />}
              <span>Antigravity starten{agyAccounts.length ? ` (${agyAccounts.length})` : ''}</span>
            </button>
            {agyError && (
              <div className="w-full text-center text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                {agyError}{' '}
                {agyAccounts.length === 0 && (
                  <button onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true }))} className="text-orange-300 hover:underline">
                    Einstellungen oeffnen
                  </button>
                )}
              </div>
            )}
          </div>
        ) : picking === 'chat' ? (
          <ApiChatSetup onCancel={() => setPicking(false)} />
        ) : picking === 'vserver' ? (
          <VServerPanel onCancel={() => setPicking(false)} />
        ) : (
          <section className="panel w-full mt-8 p-6 border border-white/10 bg-black/20 backdrop-blur-md rounded-2xl shadow-xl space-y-6">
            <div>
              <div className="section-label">CLI-Harness</div>
              {cliHarnesses.length === 0 ? (
                <p className="text-xs text-zinc-500 mt-3">
                  Keine Harnesses angelegt.{' '}
                  <button onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true }))} className="text-orange-300 hover:underline">In den Einstellungen hinzufuegen</button>
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {cliHarnesses.map((harness) => {
                    const Icon = harnessIcon(harness.icon);
                    const selected = harness.id === harnessId;
                    return (
                      <button
                        key={harness.id}
                        onClick={() => setHarnessId(harness.id)}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${selected ? 'border-orange-400/60 bg-orange-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
                      >
                        <Icon className={`w-5 h-5 shrink-0 ${selected ? 'text-orange-300' : 'text-zinc-400'}`} />
                        <span className="min-w-0">
                          <span className="block text-sm text-white truncate">{harness.name}</span>
                          <span className="block text-[11px] font-mono text-zinc-500 truncate">{harness.command || 'kein Befehl'}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="section-label">Grid</div>
                <p className="text-[11px] text-zinc-600 mt-1">Terminals nebeneinander statt als Tabs anzeigen.</p>
              </div>
              <button
                onClick={() => setGrid((value) => !value)}
                className={`relative w-11 h-6 rounded-full transition-colors ${grid ? 'bg-orange-500' : 'bg-white/10'}`}
                aria-pressed={grid}
                title={grid ? 'Grid aus' : 'Grid an'}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${grid ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>

            <div>
              <div className="section-label">Anzahl Terminals</div>
              <div className="grid grid-cols-4 gap-2 mt-3">
                {[1, 2, 3, 4].map((value) => (
                  <button
                    key={value}
                    onClick={() => setCount(value)}
                    className={`rounded-lg border py-2 text-sm transition-colors ${count === value ? 'border-orange-400/60 bg-orange-500/10 text-white' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]'}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{error}</div>}

            <div className="flex gap-2">
              <button onClick={() => setPicking(false)} className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05]">
                Abbrechen
              </button>
              <button
                onClick={handleStart}
                disabled={starting || !cliHarnesses.some((item) => item.id === harnessId)}
                className="primary-button flex-[2] !py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                <span>Starten</span>
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function ChatView() {
  const { chats, selectedChatId, selectedProject, isSending, provider, runStats, themeBackgroundBehindComposer } = useAppContext();
  const endRef = useRef<HTMLDivElement>(null);
  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId),
    [chats, selectedChatId],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedChat?.messages.length, isSending]);

  if (!selectedChat) {
    return <HomeView />;
  }

  if (selectedChat.mode === 'api') {
    return (
      <ApiChatView
        chat={selectedChat}
        renderMessage={(message) => <MessageBubble key={message.id} message={message} />}
      />
    );
  }

  if (selectedChat.mode === 'terminal' || (selectedChat.mode === 'standard' && provider !== 'antigravity')) {
    return <TerminalChatView chat={selectedChat} />;
  }

  return (
    <main className="flex-1 min-w-0 flex flex-col">
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-8">
        <div className="max-w-[760px] mx-auto flex flex-col gap-6">
          <div className="pb-4 border-b border-white/5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg text-white font-medium">{selectedChat.title}</h2>
              {selectedChat.mode === 'lyz-dev' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-300">
                  <Gamepad2 className="h-3 w-3" />
                  Lyz Dev
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-600 mt-1">{selectedProject?.path}</p>
            {selectedChat.requiredMcpServer && (
              <p className="mt-1 text-[11px] text-zinc-600">
                Unity-MCP: {selectedChat.requiredMcpServer.name} ({selectedChat.requiredMcpServer.source})
              </p>
            )}
          </div>
          {selectedChat.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isSending && <RunStatus provider={runStats?.provider || provider} />}
          <div ref={endRef} />
        </div>
      </div>
      <div
        className={`shrink-0 px-8 pb-5 pt-2 ${
          themeBackgroundBehindComposer
            ? 'bg-transparent'
            : 'bg-gradient-to-t from-[#111] via-[#111] to-transparent'
        }`}
      >
        <div className="mx-auto max-w-[760px]">
          <InputArea />
        </div>
      </div>
    </main>
  );
}

const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`text-[14px] leading-6 ${
          message.sender === 'user'
            ? 'max-w-[88%] whitespace-pre-wrap bg-[#292629] border border-white/5 text-white px-4 py-3 rounded-2xl'
            : message.isError
              ? 'w-full bg-red-500/5 border border-red-500/15 text-red-300 px-4 py-3 rounded-xl'
              : 'w-full text-zinc-300'
        }`}
      >
        {message.sender !== 'user' && (
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-600 mb-2">
            <Bot className="w-3 h-3" />
            {message.sender === 'system' ? 'System' : 'Agent'}
          </div>
        )}
        <MessageContent message={message} />
      </div>
    </motion.div>
  );
});

function MessageContent({ message }: { message: Message }) {
  if (message.sender !== 'user') return <CodexMessage message={message} />;
  return <InlineMarkdown text={message.text} />;
}

function CodexMessage({ message }: { message: Message }) {
  const { responseDisplayMode } = useAppContext();
  const [showAnswer, setShowAnswer] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const parsed = parseCodexOutput(message.text);
  const hasCodexBlocks = parsed.diffs.length > 0 || parsed.tokensUsed || message.runDurationMs || parsed.terminalBlocks.length > 0;
  const hasVisibleAnswer = Boolean(parsed.before || parsed.after || parsed.diffs.length || parsed.tokensUsed || parsed.files.length);

  return (
    <div className="codex-message">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35 shadow-2xl">
        <button
          type="button"
          onClick={() => setShowAnswer((value) => !value)}
          className="flex w-full items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-left text-[13px] text-zinc-300 hover:bg-white/[0.035]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-emerald-300" />
            <span className="truncate">Antwort</span>
            {message.runDurationMs && (
              <span className="text-[11px] text-zinc-600">{formatDuration(message.runDurationMs)}</span>
            )}
          </span>
          {showAnswer ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {showAnswer && (
          <div className="space-y-4 px-4 py-4">
            {(parsed.before || parsed.terminalBlocks.length > 0) && (
              <AgentFormattedOutput
                text={parsed.before.trim()}
                terminalBlocks={parsed.terminalBlocks}
                mode={responseDisplayMode}
              />
            )}

            {parsed.diffs.map((diff, index) => (
              <DiffBlock key={`${diff.file}-${index}`} diff={diff} />
            ))}

            {parsed.after && <ResponseStyledOutput text={parsed.after.trim()} mode={responseDisplayMode} />}

            {parsed.tokensUsed && (
              <div className="border-t border-white/5 pt-3 text-[12px] text-zinc-500">
                <div className="uppercase tracking-wide text-zinc-700">tokens used</div>
                <div className="mt-1 font-mono text-zinc-300">{parsed.tokensUsed}</div>
              </div>
            )}

            {parsed.files.length > 0 && <ChangedFilesCard files={parsed.files} />}

            {!hasVisibleAnswer && <ResponseStyledOutput text={message.text} mode={responseDisplayMode} />}
          </div>
        )}
      </div>

      {hasCodexBlocks && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowRaw((value) => !value)}
            className="flex items-center gap-2 text-[12px] text-zinc-600 hover:text-zinc-300"
          >
            Raw-Ausgabe
            {showRaw ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {showRaw && (
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-white/10 bg-black/45 p-3 text-[11px] leading-5 text-zinc-400 custom-scrollbar whitespace-pre-wrap">
              {message.text}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="message-content whitespace-pre-wrap">
      {parts.map((part, index) => {
        const fence = part.match(/^```(\w+)?\n?([\s\S]*?)```$/);
        if (fence) {
          return (
            <pre key={index} className="my-3 overflow-x-auto rounded-lg border border-white/10 bg-black/35 p-3 text-[12px] leading-5 text-zinc-300">
              <code>{fence[2]}</code>
            </pre>
          );
        }
        return <span key={index}>{renderInline(part)}</span>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const [, label, target] = match;
    nodes.push(<SmartLink key={`${target}-${match.index}`} label={label} target={target} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function SmartLink({ label, target }: { label: string; target: string }) {
  const isWebUrl = /^https?:\/\//i.test(target);
  const open = async () => {
    if (isWebUrl) await window.agentWorkspace?.openExternal(target);
    else await window.agentWorkspace?.openPath(stripFileLineSuffix(target));
  };

  return (
    <button
      type="button"
      onClick={open}
      title={target}
      className="inline-flex items-center gap-1 align-baseline text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200"
    >
      {isWebUrl ? <ExternalLink className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
      {label}
    </button>
  );
}

function stripFileLineSuffix(target: string) {
  return target.replace(/:\d+(?::\d+)?$/, '');
}

type ParsedDiff = {
  file: string;
  text: string;
  additions: number;
  deletions: number;
};

function parseCodexOutput(text: string) {
  const normalized = sanitizeAgentDisplayText(text.replace(/\r\n/g, '\n'));
  const tokenMatch =
    normalized.match(/^tokens used\s*\n\s*([0-9][0-9.,]*)/im) ||
    normalized.match(/tokens used\s+([0-9][0-9.,]*)/i);
  const withoutTokens = normalized
    .replace(/^tokens used\s*\n\s*[0-9][0-9.,]*\s*$/im, '')
    .replace(/\btokens used\s+[0-9][0-9.,]*/i, '')
    .trim();
  const firstDiffIndex = withoutTokens.search(/^diff --git /m);
  const rawBefore = firstDiffIndex >= 0 ? withoutTokens.slice(0, firstDiffIndex).trim() : withoutTokens;
  const before = formatTerminalNarrative(rawBefore);
  const { diffText, afterText } = firstDiffIndex >= 0
    ? splitDiffsFromTrailingText(withoutTokens.slice(firstDiffIndex).trim())
    : { diffText: '', afterText: '' };
  const diffChunks = diffText
    ? diffText.split(/(?=^diff --git )/m).map((chunk) => chunk.trim()).filter(Boolean)
    : [];
  const diffs = diffChunks.map(parseDiffChunk);

  return {
    before,
    after: formatTerminalNarrative(afterText),
    diffs,
    terminalBlocks: extractTerminalBlocks(rawBefore),
    files: diffs.map((diff) => ({
      path: diff.file,
      additions: diff.additions,
      deletions: diff.deletions,
    })),
    tokensUsed: tokenMatch?.[1] || '',
  };
}

function splitDiffsFromTrailingText(text: string) {
  const lines = text.split('\n');
  let seenHunk = false;
  let trailingIndex = -1;
  let previousWasBlank = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('@@')) seenHunk = true;
    if (!seenHunk) continue;
    if (!line.trim()) {
      previousWasBlank = true;
      continue;
    }
    const isDiffLine = /^(diff --git |index |--- |\+\+\+ |@@|[ +\-\\])/.test(line);
    const looksLikeAnswerAfterDiff =
      previousWasBlank &&
      (/^(?:#{1,6}\s|[-*]\s+[A-Za-zAeOeUeaeoeuessÄÖÜäöüß]|\d+\.\s+[A-Za-zAeOeUeaeoeuessÄÖÜäöüß])/.test(line) ||
        /^[A-ZÄÖÜ][^{};=<>]*[.!?:]?$/.test(line));
    if (looksLikeAnswerAfterDiff) {
      trailingIndex = index;
      break;
    }
    if (!isDiffLine) {
      trailingIndex = index;
      break;
    }
    previousWasBlank = false;
  }

  if (trailingIndex < 0) return { diffText: text, afterText: '' };
  return {
    diffText: lines.slice(0, trailingIndex).join('\n').trim(),
    afterText: lines.slice(trailingIndex).join('\n').trim(),
  };
}

function sanitizeAgentDisplayText(text: string) {
  return text
    .split('\n')
    .filter((line) => !isRawToolTraceLine(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isRawToolTraceLine(line: string) {
  if (!line) return false;
  return (
    /^mcp:\s+/i.test(line) ||
    /^\d{4}-\d{2}-\d{2}T\S+Z\s+(?:ERROR|WARN|INFO)\s+codex_/i.test(line) ||
    /^-\s*\d{4}-\d{2}-\d{2}T\S+Z\s+(?:ERROR|WARN|INFO)\s+codex_/i.test(line) ||
    /^-\s*"[^"]*(?:powershell|pwsh|cmd|bash|sh|python|node|npm|git)[^"]*"\s+/i.test(line) ||
    /^"[^"]*(?:powershell|pwsh|cmd|bash|sh|python|node|npm|git)[^"]*"\s+/i.test(line) ||
    /^\[[^\]]+\]\s*(?:ERROR|WARN|INFO)\s+codex_/i.test(line)
  );
}

function AgentFormattedOutput({
  text,
  terminalBlocks,
  mode,
}: {
  text: string;
  terminalBlocks: { command: string; status: string }[];
  mode: ResponseDisplayMode;
}) {
  return (
    <div className="space-y-3">
      <ResponseStyledOutput text={text} mode={mode} />
      {terminalBlocks.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
          <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-600">
            Terminal
          </div>
          <div className="divide-y divide-white/5">
            {terminalBlocks.slice(0, 8).map((block, index) => (
              <div key={`${block.command}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-[12px]">
                <code className="truncate text-zinc-300">{block.command}</code>
                <span className={block.status === 'ok' ? 'text-emerald-400' : block.status === 'failed' ? 'text-red-400' : 'text-zinc-500'}>
                  {block.status === 'ok' ? 'ok' : block.status === 'failed' ? 'fehler' : 'ausgefuehrt'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResponseStyledOutput({ text, mode }: { text: string; mode: ResponseDisplayMode }) {
  if (!text.trim()) return null;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (mode === 'plain') {
    return (
      <div className="space-y-3 text-[14px] leading-6 text-zinc-200">
        {paragraphs.map((paragraph, index) => (
          <InlineMarkdown key={`${paragraph}-${index}`} text={paragraph.replace(/^[-*]\s+/gm, '')} />
        ))}
      </div>
    );
  }

  if (mode === 'detailed') {
    return (
      <div className="space-y-4">
        {paragraphs.map((paragraph, index) => (
          <div key={`${paragraph}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2">
            <InlineMarkdown text={paragraph} />
          </div>
        ))}
      </div>
    );
  }

  if (mode === 'checklist') {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    return (
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={`${line}-${index}`} className="flex gap-2 text-[14px] leading-6 text-zinc-200">
            <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <InlineMarkdown text={line.replace(/^[-*]\s+/, '')} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (mode === 'technical') {
    return (
      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
        <InlineMarkdown text={text} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {paragraphs.map((paragraph, index) => (
        <InlineMarkdown key={`${paragraph}-${index}`} text={paragraph} />
      ))}
    </div>
  );
}

function formatTerminalNarrative(text: string) {
  if (/windows sandbox:\s*spawn setup refresh/i.test(text)) {
    return 'Der Agent konnte keine lokalen Befehle starten: `windows sandbox: spawn setup refresh`. Das Projekt wurde nicht veraendert.';
  }
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const ignored = /^(sandbox:|session id:|reasoning|mcp:|--------|user$|codex$|>|\$|PS |npm |pnpm |yarn |npx |git |node |python |tsc |vite |dir |ls |cd )/i;
  const useful = lines
    .filter((line) => !isRawToolTraceLine(line))
    .filter((line) => !ignored.test(line))
    .filter((line) => !isThoughtOrReasoningLine(line))
    .filter((line) => !isCodeLikeNarrativeLine(line))
    .filter((line) => !/^[-+]{3}|^@@|^index |^diff --git/.test(line))
    .filter((line) => /[a-zA-ZAeOeUeaeoeuess]/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter((line, index, list) => list.indexOf(line) === index)
    .slice(-8);

  if (useful.length === 0) return '';
  if (useful.length <= 4) return useful.join('\n\n');
  const intro =
    [...useful].reverse().find((line) =>
      /fertig|done|changed|updated|erstellt|geaendert|geändert|fixed|implemented|completed|erledigt/i.test(line),
    ) || useful.at(-1) || useful[0];
  const bullets = useful.filter((line) => line !== intro).slice(-5).map((line) => `- ${line}`);
  return [intro, bullets.join('\n')].filter(Boolean).join('\n\n');
}

function isThoughtOrReasoningLine(line: string) {
  return /^(?:thinking|thoughts?|reasoning|analysis|gedanken?|ueberlegung|überlegung|plan)\b[:\s-]*/i.test(line) ||
    /^(?:ich|i|we)\s+(?:muss|need|should|sollte|werde jetzt|denke|vermute|brauche|will need)\b/i.test(line) ||
    /^(?:let's|lets)\s+/i.test(line) ||
    /\b(?:need to inspect|need inspect|muss .*anschauen|muss .*prüfen|muss .*pruefen)\b/i.test(line);
}

function isCodeLikeNarrativeLine(line: string) {
  return /^(?:import|export|const|let|var|function|return|class|interface|type)\s/i.test(line) ||
    /(?:=>|[{};]{2,}|className=|<\/?[A-Za-z])/.test(line) ||
    /^[\w./\\-]+\.(?:ts|tsx|js|jsx|json|css|html|md|cjs|mjs|py|yml|yaml)(?::\d+)?$/.test(line);
}

function extractTerminalBlocks(text: string) {
  const commands = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(?:>|\$|PS\s+[^>]+>|npm|pnpm|yarn|npx|git|node|python|tsc|vite)\b/i.test(line))
    .map((line) => line.replace(/^(?:>|\$|PS\s+[^>]+>)\s*/, '').trim())
    .filter(Boolean);
  const failed = /(?:error|failed|exit code [1-9]|fehler|fehlgeschlagen)/i.test(text);
  const passed = /(?:passed|success|done|built|compiled|ok|erfolgreich)/i.test(text);
  return commands.map((command) => ({
    command,
    status: failed ? 'failed' : passed ? 'ok' : 'ran',
  }));
}

function parseDiffChunk(text: string): ParsedDiff {
  const lines = text.split('\n');
  const header = lines[0] || '';
  const file =
    header.match(/^diff --git a\/.+ b\/(.+)$/)?.[1] ||
    lines.find((line) => line.startsWith('+++ b/'))?.replace('+++ b/', '') ||
    lines.find((line) => line.startsWith('--- a/'))?.replace('--- a/', '') ||
    'diff';
  const additions = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
  const deletions = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length;
  return { file, text, additions, deletions };
}

function DiffBlock({ diff }: { diff: ParsedDiff }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(diff.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-white/10 bg-[#1d1d1f]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 className="w-4 h-4 text-sky-300" />
          <span className="truncate font-mono text-[12px] text-sky-300">{diff.file}</span>
          <span className="font-mono text-[11px] text-emerald-400">+{diff.additions}</span>
          <span className="font-mono text-[11px] text-red-400">-{diff.deletions}</span>
        </div>
        <button onClick={copy} className="p-1.5 text-zinc-500 hover:text-zinc-200" title="Diff kopieren">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre className="max-h-[460px] overflow-auto text-[12px] leading-5 custom-scrollbar">
        {diff.text.split('\n').map((line, index) => (
          <div key={index} className={diffLineClass(line)}>
            <span className="mr-3 inline-block w-8 select-none text-right text-zinc-600">{index + 1}</span>
            <span>{line || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

function diffLineClass(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return 'min-w-max bg-emerald-500/10 px-3 font-mono text-emerald-200';
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return 'min-w-max bg-red-500/10 px-3 font-mono text-red-200';
  }
  if (line.startsWith('@@')) return 'min-w-max bg-sky-500/10 px-3 font-mono text-sky-300';
  if (/^(diff --git|index |new file mode|deleted file mode|--- |\+\+\+ )/.test(line)) {
    return 'min-w-max bg-black/20 px-3 font-mono text-zinc-400';
  }
  return 'min-w-max px-3 font-mono text-zinc-300';
}

function ChangedFilesCard({
  files,
}: {
  files: { path: string; additions: number; deletions: number }[];
}) {
  const { selectedProject } = useAppContext();
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const openFile = async (filePath: string) => {
    const target = toProjectFilePath(selectedProject?.path || '', filePath);
    if (target) await window.agentWorkspace?.openPath(target);
  };

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-lg border border-white/10 bg-black/25 p-2">
            <GitPullRequest className="w-4 h-4 text-zinc-300" />
          </div>
          <div>
            <div className="text-sm font-medium text-white">
              {files.length} {files.length === 1 ? 'Datei' : 'Dateien'} bearbeitet
            </div>
            <div className="font-mono text-[12px]">
              <span className="text-emerald-400">+{totalAdditions}</span>
              <span className="mx-1 text-zinc-600"> </span>
              <span className="text-red-400">-{totalDeletions}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => openFile(files[0]?.path || '')}
          disabled={!selectedProject || files.length === 0}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
        >
          Oeffnen
        </button>
      </div>
      <div className="divide-y divide-white/5">
        {files.slice(0, 4).map((file) => (
          <button
            key={file.path}
            onClick={() => openFile(file.path)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-white/[0.035]"
          >
            <span className="truncate font-mono text-zinc-300">{file.path}</span>
            <span className="shrink-0 font-mono text-[12px]">
              <span className="text-emerald-400">+{file.additions}</span>
              <span className="mx-1 text-zinc-600"> </span>
              <span className="text-red-400">-{file.deletions}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function toProjectFilePath(projectPath: string, filePath: string) {
  const clean = stripFileLineSuffix(filePath || '').replace(/^["']|["']$/g, '');
  if (!clean) return '';
  if (/^[a-z]:[\\/]/i.test(clean) || clean.startsWith('\\\\') || clean.startsWith('/')) return clean;
  if (!projectPath) return clean;
  return `${projectPath.replace(/[\\/]+$/, '')}\\${clean.replace(/\//g, '\\')}`;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function RunStatus({ provider }: { provider: ReturnType<typeof useAppContext>['provider'] }) {
  const { runStats, workDisplayMode, originalPluginEnabled } = useAppContext();
  const [elapsed, setElapsed] = useState(0);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const startedAt = runStats?.startedAt;
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [runStats?.startedAt]);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [runStats?.liveOutput]);

  const providerName = providerLabel(provider);
  const progressItems = buildProgressItems(runStats, providerName, elapsed);

  if (workDisplayMode === 'raw-terminal' || originalPluginEnabled) {
    const isOriginal = originalPluginEnabled;
    return (
      <div className="run-raw-terminal">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-wide text-zinc-500">
          <span className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-emerald-300" />
            {isOriginal ? 'Original Terminal' : 'Raw Terminal'}
          </span>
          <span>{elapsed}s</span>
        </div>
        <pre ref={preRef} className={`overflow-auto whitespace-pre-wrap break-words rounded-lg border border-emerald-400/15 bg-black/55 p-3 font-mono text-[11px] leading-5 text-emerald-100 custom-scrollbar ${isOriginal ? 'max-h-[60vh]' : 'max-h-72'}`}>
          {tailTerminalOutput(runStats?.liveOutput || `${providerName} startet... Warte auf Terminal-Ausgabe.`)}
          <span className="terminal-cursor"> </span>
        </pre>
      </div>
    );
  }

  if (workDisplayMode === 'compact') {
    const commandCount = estimateCommandCount(runStats?.liveOutput || '', runStats?.testSignals || 0);
    return (
      <div className="run-card rounded-xl border border-white/10 bg-white/[0.025] p-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/5">
            <span className="run-pulse absolute inset-1 rounded-lg" />
            <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-100">{runStats?.phase || 'Startet Agent'}</div>
            <div className="mt-0.5 truncate text-[11px] text-zinc-600">
              {providerName} - {runStats?.model || 'Modell'} - {elapsed}s - {commandCount} Befehle
            </div>
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/35">
          <div className="run-progress h-full w-2/3 rounded-full" />
        </div>
      </div>
    );
  }

  if (workDisplayMode === 'timeline') {
    return (
      <div className="run-feed-visible run-timeline rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3 text-[12px] font-medium uppercase tracking-wide text-zinc-500">
          <span className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-sky-300" />
            Timeline
          </span>
          <span>{formatDuration(elapsed * 1000)}</span>
        </div>
        {progressItems.map((item, index) => (
          <RunProgressRow key={`${item.text}-${index}`} item={item} />
        ))}
        {(runStats?.files.length || 0) > 0 && (
          <div className="grid gap-1.5 rounded-lg border border-white/10 bg-white/[0.025] p-2">
            {runStats?.files.slice(0, 5).map((file) => (
              <div key={file} className="truncate font-mono text-[11px] text-zinc-500">{file}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (workDisplayMode === 'focus') {
    const commandCount = estimateCommandCount(runStats?.liveOutput || '', runStats?.testSignals || 0);
    return (
      <div className="run-card overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.065] to-white/[0.015] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-zinc-600">{providerName} arbeitet</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-white">{runStats?.phase || 'Startet Agent'}</div>
            <div className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">
              {extractReadableProgress(runStats?.liveOutput || '')[0] || 'Der Agent sammelt Kontext und bereitet die naechsten Schritte vor.'}
            </div>
          </div>
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-emerald-300" />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <RunMetric label="Zeit" value={formatDuration(elapsed * 1000)} />
          <RunMetric label="Befehle" value={String(commandCount)} />
          <RunMetric label="Dateien" value={String(runStats?.files.length || 0)} />
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/35">
          <div className="run-progress h-full w-3/4 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="forge-feed">
      <div className="run-feed-visible forge-feed-visible run-timeline">
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-zinc-500">
          <span className="forge-feed-dot" />
          CodeForge Laufspur
        </div>
        {progressItems.map((item, index) => (
          <RunProgressRow key={`${item.text}-${index}`} item={item} />
        ))}
        <div className="flex items-center gap-2 text-[13px] text-zinc-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
          <span>{providerName} arbeitet in CodeForge...</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-[11px] text-zinc-600 truncate">
              {runStats?.phase || 'Startet Agent'} - {elapsed}s - {runStats?.model || ''}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function RunProgressRow({ item }: { item: ProgressItem }) {
  if (item.kind === 'text') {
    return <p className="text-[14px] leading-6 text-zinc-100">{item.text}</p>;
  }

  return (
    <div className="flex items-center gap-2 text-[13px] text-zinc-500">
      {item.icon === 'files' ? (
        <FileCode2 className="w-3.5 h-3.5 text-sky-300" />
      ) : item.icon === 'done' ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Terminal className="w-3.5 h-3.5 text-amber-300" />
      )}
      <span>{item.text}</span>
    </div>
  );
}

function RunMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
      <div className="mt-1 font-mono text-sm text-zinc-100">{value}</div>
    </div>
  );
}

function cleanTerminalOutput(output: string): string {
  if (!output) return '';
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  let cleaned = output.replace(ansiRegex, '');
  cleaned = cleaned
    .split('\n')
    .map(line => {
      const parts = line.split('\r');
      if (parts.length > 1 && parts[parts.length - 1] === '') {
        return parts[parts.length - 2];
      }
      return parts[parts.length - 1];
    })
    .join('\n');
  return cleaned;
}

function tailTerminalOutput(output: string) {
  const cleaned = cleanTerminalOutput(output);
  const normalized = cleaned.replace(/\r\n/g, '\n').trimEnd();
  if (normalized.length <= 12_000) return normalized;
  return `... vorherige Ausgabe gekuerzt ...\n${normalized.slice(-12_000)}`;
}

function providerLabel(provider: ReturnType<typeof useAppContext>['provider']) {
  if (provider === 'antigravity') return 'Antigravity';
  if (provider === 'openai') return 'Codex';
  if (provider === 'anthropic') return 'Claude';
  if (provider === 'cursor') return 'Cursor';
  if (provider === 'freebuff') return 'FreeBuff';
  return 'OpenCode';
}

type ProgressItem =
  | { kind: 'text'; text: string }
  | { kind: 'meta'; text: string; icon: 'terminal' | 'files' | 'done' };

function buildProgressItems(
  runStats: ReturnType<typeof useAppContext>['runStats'],
  providerName: string,
  elapsed: number,
): ProgressItem[] {
  const lines = extractReadableProgress(runStats?.liveOutput || '');
  const items: ProgressItem[] = [];
  const intro =
    runStats?.outputLines && lines[0]
      ? lines[0]
      : `${providerName} ist gestartet und sammelt Kontext im Projekt.`;

  items.push({ kind: 'text', text: intro });

  const commandCount = estimateCommandCount(runStats?.liveOutput || '', runStats?.testSignals || 0);
  if (commandCount > 0) {
    items.push({
      kind: 'meta',
      text: `${commandCount} ${commandCount === 1 ? 'Befehl' : 'Befehle'} ausgefuehrt`,
      icon: 'terminal',
    });
  }

  for (const line of lines.slice(1, 4)) {
    items.push({ kind: 'text', text: line });
  }

  if (runStats?.files.length) {
    const fileCount = runStats.files.length;
    items.push({
      kind: 'meta',
      text: `${fileCount} ${fileCount === 1 ? 'Datei' : 'Dateien'} erkannt`,
      icon: 'files',
    });
  }

  items.push({
    kind: 'meta',
    text: `${runStats?.phase || 'Startet Agent'}, ${formatDuration(elapsed * 1000)} aktiv`,
    icon: 'done',
  });

  return items.slice(-7);
}

function extractReadableProgress(output: string) {
  const cleaned = cleanTerminalOutput(output);
  const ignored = /^(sandbox:|reasoning|reasoning summaries|mcp:|session id:|--------|user$|codex$|npm |ps |dir |ls |cd |git |>|\+|-|@@|diff --git|index |--- |\+\+\+ |[{\]}]|import |export |const |let |var |function |return |className=|<\/?)/i;
  const codeLike = /(?:[{};]{2,}|=>|^\s*[),.]+$|^[\w./\\-]+\.(?:ts|tsx|js|jsx|json|css|html|md|cjs|mjs|py|yml|yaml)(?::\d+)?$|^\s*(?:["'][\w-]+["']|\w+):\s*[{[(])/i;
  const lines = cleaned
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !isRawToolTraceLine(line))
    .filter((line) => line.length >= 12 && line.length <= 220)
    .filter((line) => !ignored.test(line))
    .filter((line) => !codeLike.test(line))
    .filter((line) => /[a-zA-ZAeOeUeaeoeuess]/.test(line))
    .filter((line, index, list) => list.indexOf(line) === index);
  const prose = lines.filter((line) =>
    /(?:ich|wir|fertig|erledigt|gebaut|geändert|geaendert|erstellt|pruef|prüf|test|build|agent|status|done|updated|created|fixed|implemented)/i.test(line),
  );
  return (prose.length ? prose : lines).slice(-5);
}

function estimateCommandCount(output: string, testSignals: number) {
  const cleaned = cleanTerminalOutput(output);
  const shellPrompts = (
    cleaned.match(/(?:^|\n)(?:npm|pnpm|yarn|npx|git|node|powershell|cmd|python|tsc|vite)\b/gi) || []
  ).length;
  const executedMentions = cleaned.match(/(\d+)\s+Befehle?\s+ausgef/i)?.[1];
  return Math.max(Number(executedMentions || 0), shellPrompts, Math.floor(testSignals / 2));
}

function WorkspaceView() {
  const {
    startTerminalChat,
    terminalStartCommandEnabled,
    setTerminalStartCommandEnabled,
    terminalPrefixSuffixEnabled,
    setTerminalPrefixSuffixEnabled,
  } = useAppContext();
  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar px-8 py-10">
      <div className="max-w-md mx-auto space-y-6">
        <Header
          icon={Terminal}
          title="Workspace"
          subtitle="Terminals und Agents direkt in der App."
        />

        <section className="panel flex flex-col items-center justify-center p-8 text-center border border-white/10 bg-black/20 backdrop-blur-md rounded-2xl shadow-xl">
          <div className="w-full py-6 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-6">
              <Terminal className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Terminal</h3>
            <p className="text-xs text-zinc-500 max-w-sm mb-6 leading-relaxed">
              Öffne ein Terminal direkt in der App. Du kannst Befehle eingeben und der Agent führt sie aus.
            </p>

            <div className="flex items-center gap-3 mb-6">
              <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer select-none transition-all duration-150 ${
                terminalStartCommandEnabled
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-medium'
                  : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-300 hover:bg-white/5'
              }`}>
                <input
                  type="checkbox"
                  checked={terminalStartCommandEnabled}
                  onChange={(e) => setTerminalStartCommandEnabled(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-2 h-2 rounded-full transition-colors duration-150 ${terminalStartCommandEnabled ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'}`} />
                <span>Start-Befehl</span>
              </label>

              <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer select-none transition-all duration-150 ${
                terminalPrefixSuffixEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-medium'
                  : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-300 hover:bg-white/5'
              }`}>
                <input
                  type="checkbox"
                  checked={terminalPrefixSuffixEnabled}
                  onChange={(e) => setTerminalPrefixSuffixEnabled(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-2 h-2 rounded-full transition-colors duration-150 ${terminalPrefixSuffixEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                <span>Präfix/Suffix</span>
              </label>
            </div>

            <button
              onClick={startTerminalChat}
              className="primary-button !py-3 !px-6 w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200"
            >
              <Terminal className="w-4 h-4 text-white" />
              <span>Terminal öffnen</span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
function Header({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Blocks;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 pb-6 border-b border-white/5">
      <div className="p-2.5 bg-white/5 rounded-xl">
        <Icon className="w-5 h-5 text-zinc-300" />
      </div>
      <div>
        <h2 className="text-xl text-white font-semibold">{title}</h2>
        <p className="text-sm text-zinc-600 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}
