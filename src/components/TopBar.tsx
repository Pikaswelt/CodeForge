import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Folder,
  HelpCircle,
  Minus,
  Settings,
  Square,
  X,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import AccountMenu from './AccountMenu';
import AppLogo from './AppLogo';

export default function TopBar({
  onSettingsClick,
  onActionsClick,
}: {
  onSettingsClick: () => void;
  onActionsClick: () => void;
}) {
  const {
    selectedProject,
    addProject,
    navigateBack,
    navigateForward,
    canGoBack,
    canGoForward,
    selectChat,
    clearChat,
  } = useAppContext();
  const [menu, setMenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [updateStatus, setUpdateStatus] = useState<any>({
    status: 'idle',
    percent: 0,
    message: '',
    error: '',
  });

  useEffect(() => {
    window.agentWorkspace?.getUpdateStatus().then((status: any) => {
      if (status) setUpdateStatus(status);
    });

    const unsubscribe = window.agentWorkspace?.onUpdateStatus((status: any) => {
      if (status) setUpdateStatus(status);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleUpdateClick = () => {
    if (updateStatus.status === 'downloaded') {
      window.agentWorkspace?.installUpdate();
    } else if (updateStatus.status === 'idle' || updateStatus.status === 'error' || updateStatus.status === 'available') {
      window.agentWorkspace?.checkForUpdates({ manual: true });
    }
  };

  const getUpdateLabel = () => {
    switch (updateStatus.status) {
      case 'checking':
        return 'Prüfe...';
      case 'downloading':
        return `Lade Update (${updateStatus.percent}%)`;
      case 'downloaded':
        return 'Update installieren';
      case 'available':
        return 'Update laden...';
      case 'error':
        return 'Update-Fehler';
      default:
        return 'Update';
    }
  };

  const getUpdateDot = () => {
    if (updateStatus.status === 'downloaded') {
      return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />;
    }
    if (updateStatus.status === 'available') {
      return <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />;
    }
    if (updateStatus.status === 'downloading') {
      return <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />;
    }
    if (updateStatus.status === 'error') {
      return <span className="w-1.5 h-1.5 rounded-full bg-red-500" />;
    }
    return null;
  };

  const confirmClearChat = () => {
    if (!window.confirm('Aktuellen Chat wirklich loeschen?')) return;
    clearChat();
  };

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    const openSettings = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        onSettingsClick();
        setMenu(null);
      }
    };
    window.addEventListener('keydown', openSettings);
    return () => window.removeEventListener('keydown', openSettings);
  }, [onSettingsClick]);

  const menuButton = (label: string, items: { label: string; action: () => void; keepMenu?: boolean }[]) => (
    <div className="relative">
      <button
        onClick={() => setMenu(menu === label ? null : label)}
        className="px-1.5 py-1 hover:bg-white/5 hover:text-white rounded transition-colors"
      >
        {label}
      </button>
      <AnimatePresence>
        {menu === label && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="theme-popover absolute top-8 left-0 z-[140] w-52 rounded-lg border border-white/10 bg-[#242124]/95 py-1.5 shadow-2xl backdrop-blur-xl"
          >
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  item.action();
                  if (!item.keepMenu) setMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="app-topbar app-drag flex items-center justify-between h-10 px-3 bg-black/10 text-zinc-400 select-none shrink-0"
    >
      <div className="app-no-drag flex items-center gap-3">
        <div className="flex items-center gap-2 pr-2 text-zinc-200">
          <AppLogo className="w-5 h-5" />
          <span className="text-[12px] font-semibold tracking-wide">CodeForge</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={navigateBack}
            disabled={!canGoBack}
            className="p-1.5 hover:bg-white/5 rounded disabled:opacity-25"
            title="Zurueck"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={navigateForward}
            disabled={!canGoForward}
            className="p-1.5 hover:bg-white/5 rounded disabled:opacity-25"
            title="Vor"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-1 text-[13px]">
          {menuButton('Datei', [
            { label: 'Neuer Chat', action: () => selectChat(null) },
            { label: 'Projektordner oeffnen...', action: addProject },
            { label: 'App schliessen', action: () => window.agentWorkspace?.closeWindow() },
          ])}
          {menuButton('Bearbeiten', [
            { label: 'Aktuellen Chat loeschen', action: confirmClearChat },
            { label: 'Einstellungen', action: () => setMenu('account'), keepMenu: true },
          ])}
          {menuButton('Ansicht', [
            {
              label: 'Fenster maximieren / wiederherstellen',
              action: () => window.agentWorkspace?.maximizeWindow(),
            },
          ])}
          {menuButton('Hilfe', [
            {
              label: 'Antigravity Dokumentation',
              action: () => window.agentWorkspace?.openExternal('https://antigravity.google/docs/cli-overview'),
            },
            {
              label: 'Codex Dokumentation',
              action: () => window.agentWorkspace?.openExternal('https://developers.openai.com/codex/cli'),
            },
            {
              label: 'Claude Code Dokumentation',
              action: () => window.agentWorkspace?.openExternal('https://code.claude.com/docs'),
            },
            {
              label: 'Cursor CLI Dokumentation',
              action: () => window.agentWorkspace?.openExternal('https://cursor.com/docs/cli/overview'),
            },
            {
              label: 'OpenCode Dokumentation',
              action: () => window.agentWorkspace?.openExternal('https://opencode.ai/docs/'),
            },
          ])}
          <button
            onClick={handleUpdateClick}
            disabled={updateStatus.status === 'checking' || updateStatus.status === 'downloading'}
            className={`px-1.5 py-1 hover:bg-white/5 hover:text-white rounded transition-colors flex items-center gap-1.5 cursor-pointer select-none text-[13px] ${
              updateStatus.status === 'downloaded' ? 'text-emerald-400 font-medium' : ''
            }`}
            title={updateStatus.message || 'Nach Updates suchen'}
          >
            {getUpdateDot()}
            {getUpdateLabel()}
          </button>
        </div>
      </div>

      <div className="app-no-drag flex items-center gap-2">
        <button
          onClick={addProject}
          className="flex items-center gap-2 max-w-72 px-2.5 py-1 hover:bg-white/5 rounded text-xs transition-colors"
          title={selectedProject?.path || 'Projektordner auswaehlen'}
        >
          <Folder className="w-3.5 h-3.5 fill-[#dcb85d] text-[#dcb85d] shrink-0" />
          <span className="truncate">{selectedProject?.title || 'Projekt oeffnen'}</span>
          {selectedProject && <Check className="w-3 h-3 text-emerald-400" />}
        </button>
        <div className="relative">
          <button
            onClick={() => setMenu(menu === 'account' ? null : 'account')}
            className="p-1.5 hover:bg-white/5 rounded"
            title="Einstellungen"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          {menu === 'account' && (
            <AccountMenu
              onSettingsClick={onSettingsClick}
              onActionsClick={onActionsClick}
              onClose={() => setMenu(null)}
            />
          )}
        </div>
        <div className="flex items-center ml-1">
          <button onClick={() => window.agentWorkspace?.minimizeWindow()} className="window-control">
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={() => window.agentWorkspace?.maximizeWindow()} className="window-control">
            <Square className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => window.agentWorkspace?.closeWindow()} className="window-control hover:!bg-red-500 hover:!text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
