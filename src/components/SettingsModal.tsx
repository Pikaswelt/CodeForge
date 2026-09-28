import type { UpdateStatus } from '../electron.d';
import { VoiceSettingsSection } from './VoiceSettings';
import { openUpdateWindow } from './UpdateModal';
import { CheckCircle2, Download, Mic, Edit2, FolderOpen, Image, KeyRound, Loader2, MessageSquare, Music2, Palette, RefreshCw, Settings, Smartphone, Terminal, Trash2, Video, X, XCircle, BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DEFAULT_LIBRARY_STYLE, useAppContext } from '../AppContext';
import TutorialModal from './TutorialModal';
import { HARNESS_ICONS, harnessIcon } from '../harnessIcons';
import { isVideoPath, toFileUrl } from '../media';
import { ApiProvidersSettings } from './ApiChat';
import type { CliHarness, ProviderId } from '../types';

const PROVIDERS: { id: ProviderId; label: string; command: string }[] = [
  { id: 'antigravity', label: 'Google Antigravity', command: 'agy' },
  { id: 'openai', label: 'OpenAI Codex', command: 'codex' },
  { id: 'anthropic', label: 'Anthropic Claude', command: 'claude' },
  { id: 'cursor', label: 'Cursor Agent', command: 'agent / cursor-agent' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode' },
  { id: 'freebuff', label: 'FreeBuff', command: 'freebuff' },
];


export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    provider,
    setProvider,
    theme,
    setTheme,
    themeByProvider,
    customThemes,
    themeBackgroundBehindComposer,
    libraryBannerBackgroundEnabled,
    libraryStyle,
    chats,
    clearAllChats,
    setLibraryStyle,
    mobileMode,
    setMobileMode,
    spotifyWidgetEnabled,
    discordRpcEnabled,
    discordIdleMessage,
    sidebarTransparency,
    surfaceTransparency,
    terminalTransparency,
    glassBlurStrength,
    glassSaturation,
    appBorderRadius,
    glassThemeGlow,
    createCustomTheme,
    updateCustomTheme,
    deleteCustomTheme,
    selectThemeBackground,
    setThemeBackgroundBehindComposer,
    setLibraryBannerBackgroundEnabled,
    setSpotifyWidgetEnabled,
    setDiscordRpcEnabled,
    setDiscordIdleMessage,
    setSidebarTransparency,
    setSurfaceTransparency,
    setTerminalTransparency,
    setGlassBlurStrength,
    setGlassSaturation,
    setAppBorderRadius,
    setGlassThemeGlow,
    cliStatus,
    refreshCliStatus,
    installCli,
    selectedProject,
    addProject,
    usage,
    refreshProviderUsage,
    setHasSetupCompleted,
    terminalStartPath,
    setTerminalStartPath,
    cliHarnesses,
    setCliHarnesses,
    terminalPrefix,
    setTerminalPrefix,
    terminalSuffix,
    setTerminalSuffix,
    terminalTriggerWords,
    setTerminalTriggerWords,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<'general' | 'voice' | 'appearance'>('general');
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);
  const [statusNotice, setStatusNotice] = useState('');
  const [customName, setCustomName] = useState('Mein Theme');
  const [customBackground, setCustomBackground] = useState('#101010');
  const [customSurface, setCustomSurface] = useState('#18181b');
  const [customText, setCustomText] = useState('#f4f4f5');
  const [customAccent, setCustomAccent] = useState('#f59e0b');
  const [customMedia, setCustomMedia] = useState('');
  const [customAnimatedGradient, setCustomAnimatedGradient] = useState(true);
  const [customMediaOnly, setCustomMediaOnly] = useState(false);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    status: 'idle',
    currentVersion: '',
    availableVersion: '',
    downloaded: false,
    percent: 0,
    message: 'Bereit',
    error: '',
    feedUrl: '',
  });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    let mounted = true;
    void window.agentWorkspace?.getUpdateStatus().then((status) => {
      if (mounted) setUpdateStatus(status);
    });
    const unsubscribe = window.agentWorkspace?.onUpdateStatus((status) => {
      setUpdateStatus(status);
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const runUpdateCheck = async () => {
    setUpdateBusy(true);
    try {
      const status = await window.agentWorkspace?.checkForUpdates({ manual: true });
      if (status) setUpdateStatus(status);
    } finally {
      setUpdateBusy(false);
    }
  };

  const installUpdate = async () => {
    openUpdateWindow(false);
    setUpdateBusy(true);
    try {
      await window.agentWorkspace?.installUpdate();
    } finally {
      setUpdateBusy(false);
    }
  };

  const editCustomTheme = (id: string) => {
    const selected = customThemes.find((item) => item.id === id);
    if (!selected) return;
    setEditingThemeId(id);
    setCustomName(selected.name);
    setCustomBackground(selected.background);
    setCustomSurface(selected.surface);
    setCustomText(selected.text);
    setCustomAccent(selected.accent);
    setCustomMedia(selected.backgroundMedia || selected.backgroundImage || '');
    setCustomAnimatedGradient(Boolean(selected.animatedGradient));
    setCustomMediaOnly(Boolean(selected.mediaOnly));
  };

  const saveCustomTheme = () => {
    if (!customName.trim()) return;
    if (customMediaOnly && !customMedia) return;
    const activeCustom = customThemes.find((item) => item.id === theme);
    const currentBase = activeCustom?.mediaOnly ? activeCustom.baseTheme || 'modern-dark' : theme;
    const editing = editingThemeId ? customThemes.find((item) => item.id === editingThemeId) : undefined;
    const input = {
      mediaOnly: customMediaOnly || undefined,
      baseTheme: customMediaOnly ? (editing?.mediaOnly && editing.baseTheme) || currentBase : undefined,
      name: customName.trim(),
      background: customBackground,
      surface: customSurface,
      text: customText,
      accent: customAccent,
      backgroundImage: customMedia && !isVideoPath(customMedia) ? customMedia : undefined,
      backgroundMedia: customMedia || undefined,
      animatedGradient: customAnimatedGradient,
    };
    if (editingThemeId) updateCustomTheme(editingThemeId, input);
    else createCustomTheme(input);
    setEditingThemeId(null);
  };

  const tabContentVariants = {
    initial: { opacity: 0, x: 8 },
    animate: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } },
    exit: { opacity: 0, x: -8, transition: { duration: 0.12 } }
  } as const;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="w-full max-w-xl bg-[#181518] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-lg text-white font-semibold">Einstellungen</h2>
            <p className="text-xs text-zinc-600 mt-0.5">Provider, CLI-Status, Projekt und Darstellung</p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab-Navigation */}
        <div className="flex border-b border-white/5 bg-[#120f12] px-6 gap-4 shrink-0 overflow-x-auto custom-scrollbar">
          {[
            { id: 'general', label: 'Allgemein', icon: Settings },
            { id: 'voice', label: 'Sprache', icon: Mic },
            { id: 'appearance', label: 'Aussehen', icon: Palette },
          ].map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`relative flex items-center gap-2 py-3 px-1 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {active && (
                  <motion.div
                    layoutId="activeSettingsTabLine"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 relative bg-[#181518]/50">
          <AnimatePresence mode="wait">
          {activeTab === 'general' && (
            <motion.div
              key="general"
              variants={tabContentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-7"
            >
              <section>
                <div className="section-label flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5" />
                  AI-Anbieter
                </div>
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  Hier hinterlegte Anbieter kannst du auf Home unter "Chat starten" auswaehlen. API-Keys werden lokal auf diesem PC gespeichert.
                </p>
                <ApiProvidersSettings />
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" />
                  Chats
                </div>
                <button
                  onClick={() => {
                    if (!chats.length) return;
                    if (window.confirm(`Alle ${chats.length} Chats und Workspaces loeschen? Das kann nicht rueckgaengig gemacht werden.`)) {
                      clearAllChats();
                    }
                  }}
                  disabled={!chats.length}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" />
                  Alle Chats loeschen ({chats.length})
                </button>
              </section>

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center justify-between">
                  CLI-Anbieter
                  <button onClick={refreshCliStatus} className="flex items-center gap-1 normal-case tracking-normal hover:text-white">
                    <RefreshCw className="w-3 h-3" />
                    Neu pruefen
                  </button>
                </div>
                <div className="space-y-2 mt-3">
                  {PROVIDERS.map((item) => {
                    const status = cliStatus[item.id];
                    const providerUsage = usage.providerLimits?.[item.id];
                    return (
                      <div key={item.id} className={`rounded-xl border ${
                        provider === item.id ? 'border-white/20 bg-white/[0.06]' : 'border-white/5 bg-white/[0.02]'
                      }`}>
                        <button
                          onClick={() => setProvider(item.id)}
                          className="w-full flex items-center gap-3 p-3 text-left"
                        >
                          <Terminal className="w-4 h-4 text-zinc-500" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-zinc-200">{item.label}</div>
                            <div className="text-[10px] text-zinc-600 font-mono truncate">
                              {status.executable || item.command}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`flex items-center gap-1 text-[11px] ${status.installed ? 'text-emerald-400' : 'text-red-400'}`}>
                              {status.installed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                              {status.installed ? 'Bereit' : 'Fehlt'}
                            </div>
                            <div className="text-[9px] text-zinc-700 mt-0.5">{status.version}</div>
                          </div>
                        </button>
                        <div className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
                          <div className="min-w-0 text-[10px] text-zinc-600 truncate">
                            {providerUsage?.available
                              ? `${providerUsage.remainingTokens?.toLocaleString('de-DE') || '?'} Tokens uebrig`
                              : providerUsage?.label || 'Limit noch nicht abgefragt'}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {!status.installed && (
                              <button
                                onClick={async () => {
                                  setBusyProvider(item.id);
                                  setStatusNotice('');
                                  try {
                                    setStatusNotice(await installCli(item.id));
                                  } catch (error) {
                                    setStatusNotice(error instanceof Error ? error.message : 'Installation konnte nicht gestartet werden.');
                                  } finally {
                                    setBusyProvider(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-400/20 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-400/10"
                              >
                                {busyProvider === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                Installieren
                              </button>
                            )}
                            {status.installed && (
                              <button
                                onClick={async () => {
                                  setBusyProvider(item.id);
                                  setStatusNotice('');
                                  try {
                                    const info = await refreshProviderUsage(item.id);
                                    window.alert(info?.raw || info?.error || info?.label || 'Keine Terminalausgabe erhalten.');
                                    setStatusNotice(info?.label || 'Limit-Abfrage beendet.');
                                  } catch (error) {
                                    setStatusNotice(error instanceof Error ? error.message : 'Limit konnte nicht abgerufen werden.');
                                  } finally {
                                    setBusyProvider(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/5"
                              >
                                {busyProvider === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                Limit abrufen
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {statusNotice && <div className="mt-3 text-xs text-zinc-400">{statusNotice}</div>}
              </section>
              )}

              <section>
                <div className="section-label">Aktives Projekt</div>
                <button onClick={addProject} className="panel !p-3 w-full mt-3 flex items-center gap-3 text-left hover:border-white/15">
                  <FolderOpen className="w-4 h-4 text-amber-400/70" />
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200">{selectedProject?.title || 'Projektordner auswaehlen'}</div>
                    <div className="text-[10px] text-zinc-600 truncate">{selectedProject?.path || 'Noch kein Ordner gewaehlt'}</div>
                  </div>
                </button>
              </section>

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" />
                  Terminal-Startpfad
                </div>
                <input
                  type="text"
                  value={terminalStartPath}
                  onChange={(event) => setTerminalStartPath(event.target.value)}
                  className="input w-full mt-3"
                  placeholder="z. B. C:\Workspace (Leerlassen für Standard-Projektpfad)"
                  autoComplete="off"
                />
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  Bestimmt den Standardordner beim Start einer neuen Terminal-Sitzung. Ohne Pfad wird das aktive Projekt oder der Benutzerordner verwendet.
                </p>
              </section>
              )}

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" />
                  CLI-Harnesses
                </div>
                <div className="space-y-2 mt-3">
                  {cliHarnesses.map((harness) => {
                    const update = (patch: Partial<CliHarness>) =>
                      setCliHarnesses((current) => current.map((item) => (item.id === harness.id ? { ...item, ...patch } : item)));
                    return (
                      <div key={harness.id} className="flex items-center gap-2">
                        <select
                          value={harness.icon}
                          onChange={(event) => update({ icon: event.target.value })}
                          className="input !w-[110px] shrink-0"
                          title="Icon"
                        >
                          {Object.keys(HARNESS_ICONS).map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        {(() => {
                          const Icon = harnessIcon(harness.icon);
                          return <Icon className="w-4 h-4 shrink-0 text-zinc-400" />;
                        })()}
                        <input
                          type="text"
                          value={harness.name}
                          onChange={(event) => update({ name: event.target.value })}
                          className="input flex-1 min-w-0"
                          placeholder="Name"
                          autoComplete="off"
                        />
                        <input
                          type="text"
                          value={harness.command}
                          onChange={(event) => update({ command: event.target.value })}
                          className="input flex-1 min-w-0 font-mono"
                          placeholder="Start-Command, z. B. claude"
                          autoComplete="off"
                        />
                        <button
                          onClick={() => setCliHarnesses((current) => current.filter((item) => item.id !== harness.id))}
                          className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                          title="Entfernen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    onClick={() =>
                      setCliHarnesses((current) => [
                        ...current,
                        { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: 'Neuer Harness', command: '', icon: 'Terminal' },
                      ])
                    }
                    className="text-xs text-orange-300 hover:text-orange-200"
                  >
                    + Harness hinzufuegen
                  </button>
                </div>
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  Diese Harnesses kannst du auf Home unter "Workspace starten" auswaehlen. Der Start-Command wird in jedem Terminal automatisch ausgefuehrt.
                </p>
              </section>
              )}

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" />
                  Terminal-Präfix & Suffix
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-[11px] text-zinc-400">Präfix (Davor schreiben)</label>
                    <input
                      type="text"
                      value={terminalPrefix}
                      onChange={(event) => setTerminalPrefix(event.target.value)}
                      className="input w-full mt-1.5"
                      placeholder="z. B. echo '"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400">Suffix (Danach schreiben)</label>
                    <input
                      type="text"
                      value={terminalSuffix}
                      onChange={(event) => setTerminalSuffix(event.target.value)}
                      className="input w-full mt-1.5"
                      placeholder="z. B. ' && ls"
                      autoComplete="off"
                    />
                  </div>
                </div>
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  Fügt vor und nach jeder eingegebenen Nachricht automatisch diesen Text ein, wenn die Option im Terminal-Tab aktiv ist.
                </p>
              </section>
              )}

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" />
                  Terminal-Triggerwörter
                </div>
                <input
                  type="text"
                  value={terminalTriggerWords}
                  onChange={(event) => setTerminalTriggerWords(event.target.value)}
                  className="input w-full mt-3"
                  placeholder="z. B. error, failed, warning (Kommagetrennt)"
                  autoComplete="off"
                />
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  Wenn eines dieser Wörter (kommagetrennt) im Terminal ausgegeben wird, wird eine Desktop-Benachrichtigung gesendet.
                </p>
              </section>
              )}

              <section>
                <div className="section-label flex items-center justify-between">
                  Updates
                  <span className="normal-case tracking-normal text-zinc-600">
                    {updateStatus.currentVersion ? `v${updateStatus.currentVersion}` : 'Version unbekannt'}
                  </span>
                </div>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm text-zinc-200">
                        {updateStatus.status === 'downloaded' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : updateStatus.status === 'error' ? (
                          <XCircle className="h-4 w-4 text-red-400" />
                        ) : updateStatus.status === 'checking' || updateStatus.status === 'downloading' ? (
                          <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                        ) : (
                          <RefreshCw className="h-4 w-4 text-zinc-500" />
                        )}
                        {updateStatus.message || 'Bereit'}
                      </div>
                      <div className="mt-1 truncate text-[10px] text-zinc-600">
                        {updateStatus.availableVersion
                          ? `Update-Version: ${updateStatus.availableVersion}`
                          : updateStatus.feedUrl || 'GitHub Releases'}
                      </div>
                    </div>
                    <button
                      onClick={runUpdateCheck}
                      disabled={updateBusy || updateStatus.status === 'checking' || updateStatus.status === 'downloading'}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/5 disabled:text-zinc-700"
                    >
                      {updateBusy || updateStatus.status === 'checking' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Auf Update suchen
                    </button>
                  </div>
                  {updateStatus.status === 'downloading' && (
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-amber-300 transition-all"
                        style={{ width: `${Math.max(2, updateStatus.percent)}%` }}
                      />
                    </div>
                  )}
                  {updateStatus.error && <div className="mt-2 text-[11px] leading-4 text-red-300">{updateStatus.error}</div>}
                  {updateStatus.downloaded && (
                    <button
                      onClick={installUpdate}
                      disabled={updateBusy}
                      className="primary-button mt-3 w-full"
                    >
                      {updateBusy ? 'Starte Installation...' : 'Jetzt neu starten und installieren'}
                    </button>
                  )}
                </div>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Smartphone className="w-3.5 h-3.5" />
                  Mobile Modus
                </div>
                <div className="mt-3 space-y-3">
                  <SettingToggle
                    label="Mobile Modus aktivieren"
                    description="Optimiert die Oberflaeche fuer Smartphones. Verbinde dich mit einem PC oder VPS als KI-Server. CLI-Status und Terminal werden ausgeblendet."
                    checked={mobileMode}
                    onChange={setMobileMode}
                  />
                  {mobileMode && (
                    <button
                      onClick={() => setShowTutorial(true)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-sm text-amber-200 hover:bg-amber-400/10 transition-colors"
                    >
                      <BookOpen className="w-4 h-4" />
                      Verbindungsanleitung oeffnen
                    </button>
                  )}
                </div>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Music2 className="w-3.5 h-3.5" />
                  Spotify-Widget
                </div>
                <div className="mt-3">
                  <SettingToggle
                    label="Mini-Widget anzeigen"
                    description="Zeigt aktuellen Windows/Spotify-Song als frei platzierbares Widget."
                    checked={spotifyWidgetEnabled}
                    onChange={setSpotifyWidgetEnabled}
                  />
                </div>
              </section>

              <section>
                <div className="section-label flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Discord Rich Presence
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                      discordRpcEnabled
                        ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30'
                        : 'bg-white/5 text-zinc-500 border border-white/10'
                    }`}
                  >
                    {discordRpcEnabled ? 'Aktiviert' : 'Deaktiviert'}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  <SettingToggle
                    label="Discord-Status aktivieren"
                    description="Zeigt deinen aktuellen CodeForge-Status, gewähltes KI-Modell und aktiven Agenten in Discord an."
                    checked={discordRpcEnabled}
                    onChange={setDiscordRpcEnabled}
                  />
                  {discordRpcEnabled && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                      <div className="text-xs text-zinc-300 font-medium">Benutzerdefinierter Status-Text (Bereit)</div>
                      <input
                        value={discordIdleMessage}
                        onChange={(event) => setDiscordIdleMessage(event.target.value)}
                        className="input w-full"
                        maxLength={128}
                        placeholder="Bereit"
                      />
                      <p className="text-[11px] leading-4 text-zinc-500">
                        Dieser Text ersetzt &quot;Bereit&quot;, solange kein Agent laeuft.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <div className="pt-4 border-t border-white/5">
                <button
                  onClick={() => {
                    setHasSetupCompleted(false);
                    onClose();
                  }}
                  className="text-[11px] text-zinc-600 hover:text-white"
                >
                  Einrichtungsassistent erneut oeffnen
                </button>
              </div>
            </motion.div>
          )}


          {activeTab === 'voice' && (
            <motion.div key="voice" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
              <VoiceSettingsSection />
            </motion.div>
          )}

          {activeTab === 'appearance' && (
            <motion.div
              key="appearance"
              variants={tabContentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-7"
            >
              <section>
                <div className="section-label flex items-center gap-2">
                  <Palette className="w-3.5 h-3.5" />
                  Theme Gallery fuer {PROVIDERS.find((item) => item.id === provider)?.label}
                </div>
                <div className="mt-2 text-[11px] text-zinc-600">
                  Jeder Anbieter speichert sein eigenes Theme. Aktiv: {themeByProvider[provider] || theme}
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                  <div>
                    <div className="text-sm text-zinc-200">Hintergrund hinter Chat-Leiste anzeigen</div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      Entfernt das dunkle Verlauf-Band unter der Eingabe, damit Theme oder Bild bis nach unten sichtbar bleiben.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={themeBackgroundBehindComposer}
                    onChange={(event) => setThemeBackgroundBehindComposer(event.target.checked)}
                    className="h-4 w-4 accent-amber-300"
                  />
                </label>
                <div className="mt-3 grid gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                  <ThemeSlider
                    label="Seitenleiste transparent"
                    value={sidebarTransparency}
                    onChange={setSidebarTransparency}
                    description="Macht die linke Chat-/Projektleiste durchsichtig, damit Theme, Bild oder Video dahinter sichtbar bleibt."
                  />
                  <ThemeSlider
                    label="Flaechen transparent"
                    value={surfaceTransparency}
                    onChange={setSurfaceTransparency}
                    description="Reduziert die Deckkraft von Panels, Eingaben und Karten im Programm."
                  />
                  <ThemeSlider
                    label="Terminal transparent"
                    value={terminalTransparency}
                    onChange={setTerminalTransparency}
                    description="Reduziert die Deckkraft des Hintergrunds im Terminal-Modus."
                  />
                  <ThemeSlider
                    label="Glassmorphism Weichzeichner"
                    value={glassBlurStrength}
                    onChange={setGlassBlurStrength}
                    min={0}
                    max={40}
                    step={1}
                    unit="px"
                    description="Bestimmt die Blur-Stärke der Apple-Glas-Themes und transparenten Flächen."
                  />
                  <ThemeSlider
                    label="Glassmorphism Sättigung"
                    value={glassSaturation}
                    onChange={setGlassSaturation}
                    min={50}
                    max={200}
                    step={5}
                    unit="%"
                    description="Steuert die Farbsättigung des Milchglas-Hintergrunds."
                  />
                  <ThemeSlider
                    label="Eckenabrundung (Border Radius)"
                    value={appBorderRadius}
                    onChange={setAppBorderRadius}
                    min={0}
                    max={24}
                    step={1}
                    unit="px"
                    description="Passt die Rundung aller Panels, Buttons und Eingabefelder im Programm an."
                  />
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                  <div>
                    <div className="text-sm text-zinc-200">Apple Glass-Glow Rand & Schatten</div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      Fügt einen feinen, hellen Außenrand und weichen Schlagschatten für den echten Apple-Design-Look hinzu.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={glassThemeGlow}
                    onChange={(event) => setGlassThemeGlow(event.target.checked)}
                    className="h-4 w-4 accent-amber-300"
                  />
                </label>
                {customThemes.length === 0 && (
                  <p className="mt-3 text-[11px] text-zinc-600">Noch keine Themes. Erstelle unten dein erstes Theme.</p>
                )}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {[...customThemes.map((item) => ({
                    id: item.id,
                    label: item.name,
                    mood: item.backgroundMedia || item.backgroundImage
                      ? `${isVideoPath(item.backgroundMedia || item.backgroundImage || '') ? 'Video' : 'Bild'}${item.mediaOnly ? ' (nur Hintergrund)' : ''}`
                      : item.animatedGradient
                        ? 'Animierter Verlauf'
                        : 'Eigenes Theme',
                    colors: item.mediaOnly ? [] : [item.background, item.surface, item.accent],
                    media: item.backgroundMedia || item.backgroundImage || '',
                    custom: true,
                  }))].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setTheme(item.id)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        theme === item.id ? 'bg-white/10 border-white/25 text-white' : 'border-white/5 text-zinc-500 hover:bg-white/5'
                      }`}
                    >
                      {'media' in item && item.media && <ThemeCover media={String(item.media)} />}
                      <div className="flex items-center gap-1.5">
                        {item.colors.map((color) => (
                          <span
                            key={color}
                            className="h-5 w-5 rounded-full border border-white/10"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <div className="mt-3 text-xs font-medium">{item.label}</div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-zinc-600">
                        <span>{item.mood}</span>
                        {'custom' in item && (
                          <span className="inline-flex gap-1">
                            <span
                              onClick={(event) => {
                                event.stopPropagation();
                                editCustomTheme(item.id);
                              }}
                              className="inline-flex rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                              title="Theme bearbeiten"
                            >
                              <Edit2 className="w-3 h-3" />
                            </span>
                            <span
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteCustomTheme(item.id);
                                if (editingThemeId === item.id) setEditingThemeId(null);
                              }}
                              className="inline-flex rounded-md p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-300"
                              title="Theme loeschen"
                            >
                              <Trash2 className="w-3 h-3" />
                            </span>
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white">
                      {editingThemeId ? 'Eigenes Theme bearbeiten' : 'Eigenes Theme erstellen'}
                    </div>
                    {editingThemeId && (
                      <button
                        onClick={() => setEditingThemeId(null)}
                        className="text-[11px] text-zinc-500 hover:text-white"
                      >
                        Bearbeitung abbrechen
                      </button>
                    )}
                  </div>
                  <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                    <span>
                      <span className="block text-xs text-zinc-300">Nur Hintergrund (Bild/Video)</span>
                      <span className="block text-[10px] text-zinc-600">Aendert nichts ausser dem Hintergrund. Farben bleiben vom aktuellen Theme.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={customMediaOnly}
                      onChange={(event) => setCustomMediaOnly(event.target.checked)}
                      className="h-4 w-4 accent-amber-300"
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <input
                      value={customName}
                      onChange={(event) => setCustomName(event.target.value)}
                      className="input col-span-2 w-full"
                      placeholder="Theme-Name"
                    />
                    {!customMediaOnly && (
                      <>
                        <ThemeColor label="Hintergrund" value={customBackground} onChange={setCustomBackground} />
                        <ThemeColor label="Flaechen" value={customSurface} onChange={setCustomSurface} />
                        <ThemeColor label="Text" value={customText} onChange={setCustomText} />
                        <ThemeColor label="Akzent" value={customAccent} onChange={setCustomAccent} />
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const mediaPath = await selectThemeBackground();
                        if (mediaPath) setCustomMedia(mediaPath);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
                    >
                      {isVideoPath(customMedia) ? <Video className="w-4 h-4" /> : <Image className="w-4 h-4" />}
                      Hintergrundbild/-video waehlen
                    </button>
                    {customMedia && (
                      <button
                        onClick={() => setCustomMedia('')}
                        className="min-w-0 truncate text-xs text-zinc-500 hover:text-red-300"
                        title={customMedia}
                      >
                        {customMedia.split(/[\\/]/).at(-1)} entfernen
                      </button>
                    )}
                  </div>
                  {customMedia && <ThemeCover media={customMedia} />}
                  {!customMediaOnly && (
                  <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                    <span className="text-xs text-zinc-300">Animierten Farbverlauf aktivieren</span>
                    <input
                      type="checkbox"
                      checked={customAnimatedGradient}
                      onChange={(event) => setCustomAnimatedGradient(event.target.checked)}
                      className="h-4 w-4 accent-amber-300"
                    />
                  </label>
                  )}
                  <button
                    onClick={saveCustomTheme}
                    disabled={customMediaOnly && !customMedia}
                    className="primary-button mt-4 w-full disabled:opacity-50"
                  >
                    {editingThemeId ? 'Theme speichern und fuer Anbieter nutzen' : 'Theme erstellen und fuer Anbieter nutzen'}
                  </button>
                </div>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Image className="w-3.5 h-3.5" />
                  Library anpassen
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                  <div>
                    <div className="text-sm text-zinc-200">Banner-Hintergrund anzeigen</div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      Schaltet das Bild im Library-Banner mit dem Projekt-hinzufuegen-Button ein oder aus.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={libraryBannerBackgroundEnabled}
                    onChange={(event) => setLibraryBannerBackgroundEnabled(event.target.checked)}
                    className="h-4 w-4 accent-amber-300"
                  />
                </label>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const mediaPath = await selectThemeBackground();
                        if (mediaPath) setLibraryStyle((current) => ({ ...current, bannerMedia: mediaPath }));
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
                    >
                      {isVideoPath(libraryStyle.bannerMedia) ? <Video className="w-4 h-4" /> : <Image className="w-4 h-4" />}
                      Banner-Bild/-Video waehlen
                    </button>
                    {libraryStyle.bannerMedia && (
                      <button
                        onClick={() => setLibraryStyle((current) => ({ ...current, bannerMedia: '' }))}
                        className="min-w-0 truncate text-xs text-zinc-500 hover:text-red-300"
                        title={libraryStyle.bannerMedia}
                      >
                        {libraryStyle.bannerMedia.split(/[\\/]/).at(-1)} entfernen
                      </button>
                    )}
                  </div>
                  {libraryStyle.bannerMedia && <ThemeCover media={libraryStyle.bannerMedia} />}
                  <ThemeSlider
                    label="Banner-Aufhellung"
                    value={libraryStyle.bannerOverlay}
                    onChange={(value) => setLibraryStyle((current) => ({ ...current, bannerOverlay: value }))}
                    max={100}
                    unit="%"
                    description="Wie stark das Banner hinter dem Text aufgehellt wird. 0 = Bild/Video voll sichtbar."
                  />
                  <input
                    value={libraryStyle.bannerTitle}
                    onChange={(event) => setLibraryStyle((current) => ({ ...current, bannerTitle: event.target.value }))}
                    className="input w-full"
                    placeholder="Banner-Titel (leer = Standard)"
                  />
                  <input
                    value={libraryStyle.bannerText}
                    onChange={(event) => setLibraryStyle((current) => ({ ...current, bannerText: event.target.value }))}
                    className="input w-full"
                    placeholder="Banner-Text (leer = Standard)"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <ThemeColor
                      label="Seiten-Hintergrund"
                      value={libraryStyle.pageBackground || '#f7f8fb'}
                      onChange={(value) => setLibraryStyle((current) => ({ ...current, pageBackground: value }))}
                    />
                    <ThemeColor
                      label="Karten & Banner"
                      value={libraryStyle.cardBackground || '#ffffff'}
                      onChange={(value) => setLibraryStyle((current) => ({ ...current, cardBackground: value }))}
                    />
                    <ThemeColor
                      label="Text"
                      value={libraryStyle.textColor || '#111827'}
                      onChange={(value) => setLibraryStyle((current) => ({ ...current, textColor: value }))}
                    />
                    <ThemeColor
                      label="Akzent & Buttons"
                      value={libraryStyle.accentColor || '#111827'}
                      onChange={(value) => setLibraryStyle((current) => ({ ...current, accentColor: value }))}
                    />
                  </div>
                  <button
                    onClick={() => setLibraryStyle(DEFAULT_LIBRARY_STYLE)}
                    className="text-[11px] text-zinc-500 hover:text-white"
                  >
                    Library auf Standard zuruecksetzen
                  </button>
                </div>
              </section>
            </motion.div>
          )}

          </AnimatePresence>
        </div>
      </motion.div>
      <AnimatePresence>
        {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}

// Still cover for a theme: images as-is, videos show their first frame (never autoplay).
function ThemeCover({ media }: { media: string }) {
  const url = toFileUrl(media);
  return (
    <div className="mb-3 aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black/40">
      {isVideoPath(media) ? (
        <video
          src={url}
          muted
          playsInline
          preload="auto"
          onLoadedData={(event) => {
            // Seek a little so Chromium decodes and paints a real frame.
            const video = event.currentTarget;
            video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
          }}
          className="h-full w-full object-cover"
        />
      ) : (
        <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      )}
    </div>
  );
}

function ThemeSlider({
  label,
  value,
  onChange,
  description,
  min = 0,
  max = 90,
  step = 5,
  unit = '%',
}: {
  label: string;
  value: number;
  onChange(value: number): void;
  description: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-200">{label}</span>
        <span className="font-mono text-[11px] text-zinc-500">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-amber-300"
      />
      <span className="text-[10px] leading-4 text-zinc-600">{description}</span>
    </label>
  );
}

function ThemeColor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <label className="grid gap-1 text-[10px] uppercase tracking-wide text-zinc-600">
      {label}
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-8 border-0 bg-transparent p-0"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-zinc-300 outline-none"
        />
      </div>
    </label>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-3 cursor-pointer select-none transition-all hover:bg-white/[0.05] hover:border-white/20"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-200">{label}</div>
        {description && <div className="mt-0.5 text-[10px] text-zinc-500 leading-snug">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? 'bg-amber-400' : 'bg-white/15'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
