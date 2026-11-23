import { LANGUAGES, setLanguage, tr, useLanguage, type Language, locale } from '../i18n';
import { updateVoiceSettings } from '../voice';
import type { UpdateStatus } from '../electron.d';
import { VoiceSettingsSection } from './VoiceSettings';
import { openUpdateWindow } from './UpdateModal';
import { CheckCircle2, Download, Mic, Edit2, FolderOpen, Image, KeyRound, Languages, Loader2, MessageSquare, Music2, Palette, Plug, Puzzle, RefreshCw, Settings, SlidersHorizontal, Smartphone, Sparkles, Terminal, Trash2, Video, X, XCircle, BookOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DEFAULT_LIBRARY_STYLE, useAppContext } from '../AppContext';
import TutorialModal from './TutorialModal';
import { HARNESS_ICONS, harnessIcon } from '../harnessIcons';
import { isVideoPath, toFileUrl } from '../media';
import { ApiProvidersSettings } from './ApiChat';
import { AgyAccountsSettings } from './AgyAccounts';
import { PluginsSettings } from './PluginsSettings';
import { McpSettings } from './McpSettings';
import { FancyLoginMethods } from './FancyLoginMethods';
import { animatedEffectsAllowed, featureFree, requirePlanFeature } from '../plans';
import { MultiLaunchPanel } from './MultiLaunchPanel';
import type { CliHarness, GuiEngineConfig, ProviderId } from '../types';

const providers = (): { id: ProviderId; label: string; command: string }[] => [
  { id: 'antigravity', label: tr("Google Antigravity"), command: 'agy' },
  { id: 'openai', label: tr("OpenAI Codex"), command: 'codex' },
  { id: 'anthropic', label: 'Anthropic Claude', command: 'claude' },
  { id: 'hermes', label: 'Hermes Agent', command: 'hermes' },
  { id: 'cursor', label: 'Cursor Agent', command: 'agent / cursor-agent' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode' },
  { id: 'freebuff', label: 'FreeBuff', command: 'freebuff' },
];


export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const lang = useLanguage();
  // One language for every screen; voice recognition follows along.
  const chooseLanguage = (next: Language) => {
    setLanguage(next);
    updateVoiceSettings({ language: next });
  };
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
    guiEngines,
    setGuiEngines,
    terminalPrefixSuffixEnabled,
    setTerminalPrefixSuffixEnabled,
    terminalPrefix,
    setTerminalPrefix,
    terminalSuffix,
    setTerminalSuffix,
    terminalTriggerWords,
    setTerminalTriggerWords,
    agentNotificationsEnabled,
    setAgentNotificationsEnabled,
    multiLaunchConfig,
    agyAccounts,
  } = useAppContext();
  const [showMultiLaunch, setShowMultiLaunch] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'account' | 'voice' | 'appearance' | 'mcp' | 'plugins'>('general');
  // Some building blocks only exist on one machine; the main process decides that locally.
  const [ownerPc, setOwnerPc] = useState(false);

  useEffect(() => {
    void window.agentWorkspace?.isOwnerPc?.().then((value) => setOwnerPc(Boolean(value)));
  }, []);
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);
  const [statusNotice, setStatusNotice] = useState('');
  const [customName, setCustomName] = useState(tr("Mein Theme"));
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
    message: tr("Bereit"),
    error: '',
    feedUrl: '',
  });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const libraryFileInputRef = useRef<HTMLInputElement>(null);

  const handlePickLibraryBanner = async () => {
    if (window.agentWorkspace && !(window.agentWorkspace as any).isWeb && window.agentWorkspace.selectThemeBackground) {
      const mediaPath = await selectThemeBackground();
      if (mediaPath) {
        setLibraryStyle((current) => ({ ...current, bannerMedia: mediaPath }));
      }
      return;
    }
    libraryFileInputRef.current?.click();
  };

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
    if (!requirePlanFeature('fancycode.themes')) return;
    if (!customName.trim()) return;
    if (customMediaOnly && !customMedia) return;
    if (!animatedEffectsAllowed() && customMedia && isVideoPath(customMedia)) {
      window.alert(tr("Video-Hintergründe gibt es ab dem Pro-Plan."));
      return;
    }
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
      animatedGradient: customAnimatedGradient && animatedEffectsAllowed(),
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
            <h2 className="text-lg text-white font-semibold">{tr("Einstellungen")}</h2>
            <p className="text-xs text-zinc-600 mt-0.5">{tr("Provider, CLI-Status, Projekt und Darstellung")}</p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab-Navigation */}
        <div className="flex border-b border-white/5 bg-[#120f12] px-6 gap-4 shrink-0 overflow-x-auto custom-scrollbar">
          {[
            { id: 'general', label: tr("Allgemein"), icon: Settings },
            ...(window.agentWorkspace?.fancyAccount ? [{ id: 'account', label: tr("Konto"), icon: KeyRound }] : []),
            { id: 'voice', label: tr("Spracheingabe"), icon: Mic },
            { id: 'appearance', label: tr("Aussehen"), icon: Palette },
            { id: 'mcp', label: 'MCP', icon: Plug },
            { id: 'plugins', label: tr("Plugins"), icon: Puzzle },
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
                  <Languages className="w-3.5 h-3.5" />
                  {tr("Sprache")}
                </div>
                <p className="mt-2 text-[11px] leading-4 text-zinc-600">
                  {tr("Gilt für die gesamte App – Oberfläche und Spracheingabe.")}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {LANGUAGES.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => chooseLanguage(item.id)}
                      aria-pressed={lang === item.id}
                      className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                        lang === item.id
                          ? 'border-orange-400/60 bg-orange-400/10 text-zinc-100'
                          : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{item.id}</span>
                        {item.id === 'de' ? 'Deutsch' : 'English'}
                      </span>
                      {lang === item.id && <CheckCircle2 className="h-4 w-4 text-orange-300" />}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5" />
                  {tr("AI-Anbieter")}
                </div>
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  {tr("Hier hinterlegte Anbieter kannst du im API-Chat auswaehlen. API-Keys werden lokal auf diesem PC gespeichert.")}
                </p>
                <ApiProvidersSettings />
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" />
                  {tr("Chats")}
                </div>
                <button
                  onClick={() => {
                    if (!chats.length) return;
                    if (window.confirm(tr("Alle {count} Chats und Workspaces loeschen? Das kann nicht rueckgaengig gemacht werden.", { count: chats.length }))) {
                      clearAllChats();
                    }
                  }}
                  disabled={!chats.length}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" />
                  {tr("Alle Chats loeschen (")}{chats.length})
                </button>
              </section>

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center justify-between">
                  {tr("CLI-Anbieter")}
                  <button onClick={refreshCliStatus} className="flex items-center gap-1 normal-case tracking-normal hover:text-white">
                    <RefreshCw className="w-3 h-3" />
                    {tr("Neu pruefen")}
                  </button>
                </div>
                <div className="space-y-2 mt-3">
                  {providers().map((item) => {
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
                              {status.installed ? tr("Bereit") : tr("Fehlt")}
                            </div>
                            <div className="text-[9px] text-zinc-700 mt-0.5">{status.version}</div>
                          </div>
                        </button>
                        <div className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
                          <div className="min-w-0 text-[10px] text-zinc-600 truncate">
                            {providerUsage?.available
                              ? tr('{count} Tokens uebrig', { count: providerUsage.remainingTokens?.toLocaleString(locale()) || '?' })
                              : providerUsage?.label || tr("Limit noch nicht abgefragt")}
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
                                    setStatusNotice(error instanceof Error ? error.message : tr("Installation konnte nicht gestartet werden."));
                                  } finally {
                                    setBusyProvider(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-400/20 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-400/10"
                              >
                                {busyProvider === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                {tr("Installieren")}
                              </button>
                            )}
                            {status.installed && (
                              <button
                                onClick={async () => {
                                  setBusyProvider(item.id);
                                  setStatusNotice('');
                                  try {
                                    const info = await refreshProviderUsage(item.id);
                                    window.alert(info?.raw || info?.error || info?.label || tr("Keine Terminalausgabe erhalten."));
                                    setStatusNotice(info?.label || tr("Limit-Abfrage beendet."));
                                  } catch (error) {
                                    setStatusNotice(error instanceof Error ? error.message : tr("Limit konnte nicht abgerufen werden."));
                                  } finally {
                                    setBusyProvider(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/5"
                              >
                                {busyProvider === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                {tr("Limit abrufen")}
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
                <div className="section-label">{tr("Aktives Projekt")}</div>
                <button onClick={addProject} className="panel !p-3 w-full mt-3 flex items-center gap-3 text-left hover:border-white/15">
                  <FolderOpen className="w-4 h-4 text-amber-400/70" />
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200">{selectedProject?.title || tr("Projektordner auswaehlen")}</div>
                    <div className="text-[10px] text-zinc-600 truncate">{selectedProject?.path || tr("Noch kein Ordner gewaehlt")}</div>
                  </div>
                </button>
              </section>

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" />
                  {tr("Terminal-Startpfad")}
                </div>
                <input
                  type="text"
                  value={terminalStartPath}
                  onChange={(event) => setTerminalStartPath(event.target.value)}
                  className="input w-full mt-3"
                  placeholder={tr("z. B. C:\\Workspace (Leerlassen für Standard-Projektpfad)")}
                  autoComplete="off"
                />
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  {tr("Bestimmt den Standardordner beim Start einer neuen Terminal-Sitzung. Ohne Pfad wird das aktive Projekt oder der Benutzerordner verwendet.")}
                </p>
              </section>
              )}

              {!mobileMode && (
                <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-400">
                        <SlidersHorizontal className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-white block">{tr("Multi-Start Button")}</span>
                        <span className="text-xs text-zinc-400">
                          {multiLaunchConfig.mode === 'custom'
                            ? `Individuell: "${multiLaunchConfig.buttonLabel || tr("Antigravity starten")}" (${multiLaunchConfig.slots.length} Terminals)`
                            : `Standard: "${multiLaunchConfig.buttonLabel || tr("Antigravity starten")}" (${agyAccounts.length} Accounts)`}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMultiLaunch(true)}
                      className="px-3.5 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/15 text-orange-200 hover:bg-orange-500/25 text-xs font-medium transition-colors"
                    >
                      {tr("Button anpassen")}
                    </button>
                  </div>
                </section>
              )}

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    {tr("GUI-Agenten (FancyCode-Ansicht)")}
                  </div>
                  <span className="normal-case tracking-normal text-[10px] text-zinc-500">
                    {guiEngines.filter((e) => e.enabled).length} {tr("aktiv")}
                  </span>
                </div>
                <p className="text-[11px] leading-4 text-zinc-500 mt-1.5">
                  {tr("Wähle aus, welche Agenten in der grafischen FancyCode-Ansicht oben als Tab erscheinen (z. B. FancyCode, Claude Code, Antigravity CLI oder eigene CLI-Agenten).")}
                </p>
                <div className="space-y-2 mt-3">
                  {guiEngines.map((eng) => {
                    const updateGuiEngine = (patch: Partial<GuiEngineConfig>) =>
                      setGuiEngines((current) =>
                        current.map((item) => (item.id === eng.id ? { ...item, ...patch } : item)),
                      );
                    const Icon = harnessIcon(eng.icon || 'Terminal');
                    return (
                      <div
                        key={eng.id}
                        className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors ${
                          eng.enabled
                            ? 'border-white/15 bg-white/[0.04]'
                            : 'border-white/5 bg-white/[0.015] opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={eng.enabled}
                          onChange={(event) => updateGuiEngine({ enabled: event.target.checked })}
                          className="h-4 w-4 accent-amber-400 shrink-0 cursor-pointer"
                          title={tr("In GUI anzeigen")}
                        />
                        {eng.builtin ? (
                          <>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-amber-300">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-zinc-100">{eng.name}</span>
                                <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-mono text-zinc-400">
                                  {eng.command}
                                </span>
                                {eng.id === 'agy' && (
                                  <span className="rounded-md border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                                    Antigravity CLI Support
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-zinc-500 truncate">
                                {eng.id === 'fancycode'
                                  ? tr("Eingebauter FancyCode-Agent über dein FancyServers-Konto")
                                  : eng.id === 'claude'
                                    ? tr("Offizielle Claude Code CLI in der grafischen Ansicht")
                                    : tr("Google Antigravity CLI (agy) direkt in der grafischen Ansicht")}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <select
                              value={eng.icon || 'Terminal'}
                              onChange={(event) => updateGuiEngine({ icon: event.target.value })}
                              className="input !w-[100px] !py-1.5 text-xs shrink-0"
                              title={tr("Icon")}
                            >
                              {Object.keys(HARNESS_ICONS).map((name) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={eng.name}
                              onChange={(event) => updateGuiEngine({ name: event.target.value })}
                              className="input flex-1 min-w-0 !py-1.5 text-xs"
                              placeholder={tr("Name (z. B. Codex CLI)")}
                              autoComplete="off"
                            />
                            <input
                              type="text"
                              value={eng.command}
                              onChange={(event) => updateGuiEngine({ command: event.target.value })}
                              className="input flex-1 min-w-0 !py-1.5 text-xs font-mono"
                              placeholder={tr("CLI-Befehl (z. B. codex)")}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              onClick={() => setGuiEngines((current) => current.filter((item) => item.id !== eng.id))}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 shrink-0"
                              title={tr("Entfernen")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setGuiEngines((current) => [
                          ...current,
                          {
                            id: `gui-${Date.now().toString(36)}`,
                            name: tr("Eigener Agent"),
                            command: '',
                            icon: 'Terminal',
                            enabled: true,
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/20 transition-colors"
                    >
                      {tr("+ Eigenen GUI-Agent hinzufügen")}
                    </button>
                    {cliHarnesses
                      .filter(
                        (h) =>
                          h.command.trim() &&
                          !guiEngines.some(
                            (g) => g.command.trim().toLowerCase() === h.command.trim().toLowerCase(),
                          ),
                      )
                      .map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() =>
                            setGuiEngines((current) => [
                              ...current,
                              {
                                id: `gui-${h.id}-${Date.now().toString(36)}`,
                                name: h.name,
                                command: h.command,
                                icon: h.icon || 'Terminal',
                                enabled: true,
                              },
                            ])
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.07] hover:text-white transition-colors"
                        >
                          + {h.name} ({h.command})
                        </button>
                      ))}
                  </div>
                </div>
              </section>
              )}

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" />
                  {tr("CLI-Harnesses")}
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
                          title={tr("Icon")}
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
                          disabled={!featureFree('fancycode.harness')}
                          onChange={(event) => update({ name: event.target.value })}
                          className="input flex-1 min-w-0"
                          placeholder="Name"
                          autoComplete="off"
                        />
                        <input
                          type="text"
                          value={harness.command}
                          disabled={!featureFree('fancycode.harness')}
                          onChange={(event) => update({ command: event.target.value })}
                          className="input flex-1 min-w-0 font-mono"
                          placeholder={tr("Start-Command, z. B. claude")}
                          autoComplete="off"
                        />
                        <button
                          onClick={() => setCliHarnesses((current) => current.filter((item) => item.id !== harness.id))}
                          className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                          title={tr("Entfernen")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                  {!featureFree('fancycode.harness') && (
                    <p className="text-[11px] leading-4 text-amber-300">
                      {tr("Eigene CLI-Harnesses gibt es ab Spark. Der FancyCode-Agent bleibt frei.")}
                    </p>
                  )}
                  <button
                    disabled={!featureFree('fancycode.harness')}
                    onClick={() => {
                      if (!featureFree('fancycode.harness')) {
                        requirePlanFeature('fancycode.harness');
                        return;
                      }
                      setCliHarnesses((current) => [
                        ...current,
                        { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: tr("Neuer Harness"), command: '', icon: tr("Terminal") },
                      ]);
                    }}
                    className="text-xs text-orange-300 hover:text-orange-200 disabled:opacity-40"
                  >
                    {tr("+ Harness hinzufuegen")}
                  </button>
                </div>
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  {tr("Diese Harnesses kannst du auf Home unter \"Workspace starten\" auswaehlen. Der Start-Command wird in jedem Terminal automatisch ausgefuehrt.")}
                </p>
              </section>
              )}

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5" />
                    {tr("Terminal-Präfix & Suffix")}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={terminalPrefixSuffixEnabled}
                      onChange={(event) => setTerminalPrefixSuffixEnabled(event.target.checked)}
                      className="rounded bg-white/5 border-white/10 text-orange-500 focus:ring-0"
                    />
                    <span>{tr("Aktivieren")}</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-[11px] text-zinc-400">{tr("Präfix (Davor schreiben)")}</label>
                    <input
                      type="text"
                      value={terminalPrefix}
                      onChange={(event) => setTerminalPrefix(event.target.value)}
                      className="input w-full mt-1.5"
                      placeholder={tr("z. B. echo '")}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400">{tr("Suffix (Danach schreiben)")}</label>
                    <input
                      type="text"
                      value={terminalSuffix}
                      onChange={(event) => setTerminalSuffix(event.target.value)}
                      className="input w-full mt-1.5"
                      placeholder={tr("z. B. ' && ls")}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  {tr("Fügt vor und nach jeder eingegebenen Nachricht automatisch diesen Text ein, wenn aktiviert.")}
                </p>
              </section>
              )}

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5" />
                    {tr("Desktop-Benachrichtigungen (Windows & Linux)")}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void window.agentWorkspace?.notifyAgentComplete?.({
                        title: 'FancyCode Desktop · Agent fertig',
                        body: tr('System-Benachrichtigungen für Claude Code, Antigravity CLI & FancyCode sind aktiv.'),
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] normal-case tracking-normal text-zinc-300 hover:bg-white/5"
                  >
                    {tr("Testen")}
                  </button>
                </div>
                <div className="mt-3">
                  <SettingToggle
                    label={tr("Benachrichtigen wenn Agenten fertig sind")}
                    description={tr("Sendet eine native Windows- oder Linux-Systembenachrichtigung (inkl. Taskleisten-Blinken), sobald Claude Code, Antigravity CLI (agy), FancyCode oder Codex ihre Aufgabe beendet haben oder eine Bestätigung brauchen.")}
                    checked={agentNotificationsEnabled}
                    onChange={setAgentNotificationsEnabled}
                  />
                </div>
                <div className="mt-3">
                  <label className="text-[11px] text-zinc-400">{tr("Zusätzliche Terminal-Triggerwörter")}</label>
                  <input
                    type="text"
                    value={terminalTriggerWords}
                    onChange={(event) => setTerminalTriggerWords(event.target.value)}
                    className="input w-full mt-1.5"
                    placeholder={tr("z. B. error, failed, warning (Kommagetrennt)")}
                    autoComplete="off"
                  />
                  <p className="text-[11px] leading-4 text-zinc-600 mt-1.5">
                    {tr("Wenn eines dieser Wörter (kommagetrennt) im Terminal ausgegeben wird, wird ebenfalls eine System-Benachrichtigung gesendet.")}
                  </p>
                </div>
              </section>
              )}

              <section>
                <div className="section-label flex items-center justify-between">
                  {tr("Updates")}
                  <span className="normal-case tracking-normal text-zinc-600">
                    {updateStatus.currentVersion ? `v${updateStatus.currentVersion}` : tr("Version unbekannt")}
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
                        {updateStatus.message || tr("Bereit")}
                      </div>
                      <div className="mt-1 truncate text-[10px] text-zinc-600">
                        {updateStatus.availableVersion
                          ? `Update-Version: ${updateStatus.availableVersion}`
                          : updateStatus.feedUrl || tr("GitHub Releases")}
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
                      {tr("Auf Update suchen")}
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
                      {updateBusy ? tr("Starte Installation...") : tr("Jetzt neu starten und installieren")}
                    </button>
                  )}
                </div>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Smartphone className="w-3.5 h-3.5" />
                  {tr("Mobile Modus")}
                </div>
                <div className="mt-3 space-y-3">
                  <SettingToggle
                    label={tr("Mobile Modus aktivieren")}
                    description={tr("Optimiert die Oberflaeche fuer Smartphones. Verbinde dich mit einem PC oder VPS als KI-Server. CLI-Status und Terminal werden ausgeblendet.")}
                    checked={mobileMode}
                    onChange={setMobileMode}
                  />
                  {mobileMode && (
                    <button
                      onClick={() => setShowTutorial(true)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-sm text-amber-200 hover:bg-amber-400/10 transition-colors"
                    >
                      <BookOpen className="w-4 h-4" />
                      {tr("Verbindungsanleitung oeffnen")}
                    </button>
                  )}
                </div>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Music2 className="w-3.5 h-3.5" />
                  {tr("Spotify-Widget")}
                </div>
                <div className="mt-3">
                  <SettingToggle
                    label={tr("Mini-Widget anzeigen")}
                    description={tr("Zeigt aktuellen Windows/Spotify-Song als frei platzierbares Widget.")}
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
                    {discordRpcEnabled ? tr("Aktiviert") : tr("Deaktiviert")}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  <SettingToggle
                    label={tr("Discord-Status aktivieren")}
                    description={tr("Zeigt deinen aktuellen FancyCode Desktop-Status, gewähltes KI-Modell und aktiven Agenten in Discord an.")}
                    checked={discordRpcEnabled}
                    onChange={setDiscordRpcEnabled}
                  />
                  {discordRpcEnabled && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                      <div className="text-xs text-zinc-300 font-medium">{tr("Benutzerdefinierter Status-Text (Bereit)")}</div>
                      <input
                        value={discordIdleMessage}
                        onChange={(event) => setDiscordIdleMessage(event.target.value)}
                        className="input w-full"
                        maxLength={128}
                        placeholder={tr("Bereit")}
                      />
                      <p className="text-[11px] leading-4 text-zinc-500">
                        {tr("Dieser Text ersetzt &quot;Bereit&quot;, solange kein Agent laeuft.")}
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
                  {tr("Einrichtungsassistent erneut oeffnen")}
                </button>
              </div>
            </motion.div>
          )}


          {activeTab === 'account' && (
            <motion.div key="account" variants={tabContentVariants} initial="initial" animate="animate" exit="exit" className="space-y-4">
              <section>
                <h3 className="mb-1 text-sm font-semibold text-zinc-200">{tr("Anmeldung")}</h3>
                <p className="mb-3 text-xs text-zinc-500">{tr("Dein FancyServers-Konto gilt in allen Apps. Verknüpfe Discord oder GitHub, damit du dich auch ohne Zugangscode anmelden kannst.")}</p>
                <FancyLoginMethods />
              </section>
            </motion.div>
          )}

          {activeTab === 'mcp' && (
            <motion.div key="mcp" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
              <McpSettings />
            </motion.div>
          )}

          {activeTab === 'plugins' && (
            <motion.div key="plugins" variants={tabContentVariants} initial="initial" animate="animate" exit="exit" className="space-y-7">
              <PluginsSettings />
              {ownerPc && !mobileMode && (
                <section className="border-t border-white/5 pt-4">
                  <h3 className="mb-3 text-sm font-semibold text-zinc-200">{tr("Nur dieser Rechner")}</h3>
                  <AgyAccountsSettings onClose={onClose} />
                </section>
              )}
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
                  {tr("Theme Gallery fuer")} {providers().find((item) => item.id === provider)?.label}
                </div>
                <div className="mt-2 text-[11px] text-zinc-600">
                  {tr("Jeder Anbieter speichert sein eigenes Theme. Aktiv:")} {themeByProvider[provider] || theme}
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                  <div>
                    <div className="text-sm text-zinc-200">{tr("Hintergrund hinter Chat-Leiste anzeigen")}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      {tr("Entfernt das dunkle Verlauf-Band unter der Eingabe, damit Theme oder Bild bis nach unten sichtbar bleiben.")}
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
                    label={tr("Seitenleiste transparent")}
                    value={sidebarTransparency}
                    onChange={setSidebarTransparency}
                    description={tr("Macht die linke Chat-/Projektleiste durchsichtig, damit Theme, Bild oder Video dahinter sichtbar bleibt.")}
                  />
                  <ThemeSlider
                    label={tr("Flaechen transparent")}
                    value={surfaceTransparency}
                    onChange={setSurfaceTransparency}
                    description={tr("Reduziert die Deckkraft von Panels, Eingaben und Karten im Programm.")}
                  />
                  <ThemeSlider
                    label={tr("Terminal transparent")}
                    value={terminalTransparency}
                    onChange={setTerminalTransparency}
                    description={tr("Reduziert die Deckkraft des Hintergrunds im Terminal-Modus.")}
                  />
                  <ThemeSlider
                    label={tr("Glassmorphism Weichzeichner")}
                    value={glassBlurStrength}
                    onChange={setGlassBlurStrength}
                    min={0}
                    max={40}
                    step={1}
                    unit="px"
                    description={tr("Bestimmt die Blur-Stärke der Apple-Glas-Themes und transparenten Flächen.")}
                  />
                  <ThemeSlider
                    label={tr("Glassmorphism Sättigung")}
                    value={glassSaturation}
                    onChange={setGlassSaturation}
                    min={50}
                    max={200}
                    step={5}
                    unit="%"
                    description={tr("Steuert die Farbsättigung des Milchglas-Hintergrunds.")}
                  />
                  <ThemeSlider
                    label={tr("Eckenabrundung (Border Radius)")}
                    value={appBorderRadius}
                    onChange={setAppBorderRadius}
                    min={0}
                    max={24}
                    step={1}
                    unit="px"
                    description={tr("Passt die Rundung aller Panels, Buttons und Eingabefelder im Programm an.")}
                  />
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                  <div>
                    <div className="text-sm text-zinc-200">{tr("Apple Glass-Glow Rand & Schatten")}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      {tr("Fügt einen feinen, hellen Außenrand und weichen Schlagschatten für den echten Apple-Design-Look hinzu.")}
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
                  <p className="mt-3 text-[11px] text-zinc-600">{tr("Noch keine Themes. Erstelle unten dein erstes Theme.")}</p>
                )}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {[...customThemes.map((item) => ({
                    id: item.id,
                    label: item.name,
                    mood: item.backgroundMedia || item.backgroundImage
                      ? `${isVideoPath(item.backgroundMedia || item.backgroundImage || '') ? tr("Video") : tr("Bild")}${item.mediaOnly ? tr("(nur Hintergrund)") : ''}`
                      : item.animatedGradient
                        ? tr("Animierter Verlauf")
                        : tr("Eigenes Theme"),
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
                              title={tr("Theme bearbeiten")}
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
                              title={tr("Theme loeschen")}
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
                      {editingThemeId ? tr("Eigenes Theme bearbeiten") : tr("Eigenes Theme erstellen")}
                    </div>
                    {editingThemeId && (
                      <button
                        onClick={() => setEditingThemeId(null)}
                        className="text-[11px] text-zinc-500 hover:text-white"
                      >
                        {tr("Bearbeitung abbrechen")}
                      </button>
                    )}
                  </div>
                  <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                    <span>
                      <span className="block text-xs text-zinc-300">{tr("Nur Hintergrund (Bild/Video)")}</span>
                      <span className="block text-[10px] text-zinc-600">{tr("Aendert nichts ausser dem Hintergrund. Farben bleiben vom aktuellen Theme.")}</span>
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
                      placeholder={tr("Theme-Name")}
                    />
                    {!customMediaOnly && (
                      <>
                        <ThemeColor label={tr("Hintergrund")} value={customBackground} onChange={setCustomBackground} />
                        <ThemeColor label={tr("Flaechen")} value={customSurface} onChange={setCustomSurface} />
                        <ThemeColor label={tr("Text")} value={customText} onChange={setCustomText} />
                        <ThemeColor label={tr("Akzent")} value={customAccent} onChange={setCustomAccent} />
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
                      {tr("Hintergrundbild/-video waehlen")}
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
                  <label className={`mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2 ${animatedEffectsAllowed() ? '' : 'opacity-60'}`}>
                    <span className="text-xs text-zinc-300">
                      {tr("Animierten Farbverlauf aktivieren")}
                      {!animatedEffectsAllowed() && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{tr("ab Spark")}</span>}
                    </span>
                    <input
                      type="checkbox"
                      checked={customAnimatedGradient && animatedEffectsAllowed()}
                      disabled={!animatedEffectsAllowed()}
                      onChange={(event) => setCustomAnimatedGradient(event.target.checked)}
                      className="h-4 w-4 accent-amber-300 disabled:cursor-not-allowed"
                    />
                  </label>
                  )}
                  <button
                    onClick={saveCustomTheme}
                    disabled={customMediaOnly && !customMedia}
                    className="primary-button mt-4 w-full disabled:opacity-50"
                  >
                    {editingThemeId ? tr("Theme speichern und fuer Anbieter nutzen") : tr("Theme erstellen und fuer Anbieter nutzen")}
                  </button>
                </div>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Image className="w-3.5 h-3.5" />
                  {tr("Library anpassen")}
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                  <div>
                    <div className="text-sm text-zinc-200">{tr("Banner-Hintergrund anzeigen")}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      {tr("Schaltet das Bild im Library-Banner mit dem Projekt-hinzufuegen-Button ein oder aus.")}
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
                  <div className="text-xs font-medium text-zinc-300">{tr("Banner-Design")}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLibraryStyle((current) => ({ ...current, bannerMedia: '' }))}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                        !libraryStyle.bannerMedia || libraryStyle.bannerMedia === 'anime'
                          ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
                          : 'border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                      }`}
                    >
                      {tr("Kein Banner (Clean)")}
                    </button>
                    <button
                      type="button"
                      onClick={handlePickLibraryBanner}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                        libraryStyle.bannerMedia && libraryStyle.bannerMedia !== 'anime'
                          ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
                          : 'border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                      }`}
                    >
                      {isVideoPath(libraryStyle.bannerMedia) ? <Video className="w-3.5 h-3.5" /> : <Image className="w-3.5 h-3.5" />}
                      {tr("Eigenes Bild/Video waehlen")}
                    </button>
                    {libraryStyle.bannerMedia && (
                      <button
                        type="button"
                        onClick={() => setLibraryStyle((current) => ({ ...current, bannerMedia: '' }))}
                        className="text-xs text-zinc-500 hover:text-red-300"
                        title={tr("Banner entfernen")}
                      >
                        {tr("Entfernen")}
                      </button>
                    )}
                  </div>

                  <input
                    type="file"
                    ref={libraryFileInputRef}
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          setLibraryStyle((current) => ({ ...current, bannerMedia: reader.result as string }));
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />

                  {libraryStyle.bannerMedia && libraryStyle.bannerMedia !== 'anime' && (
                    <input
                      value={libraryStyle.bannerMedia.startsWith('data:') ? tr("Lokale Datei geladen") : libraryStyle.bannerMedia}
                      disabled={libraryStyle.bannerMedia.startsWith('data:')}
                      onChange={(event) => setLibraryStyle((current) => ({ ...current, bannerMedia: event.target.value }))}
                      className="input w-full text-xs font-mono"
                      placeholder={tr("Pfad oder Bild-URL (z.B. https://...)")}
                    />
                  )}

                  {libraryStyle.bannerMedia && libraryStyle.bannerMedia !== 'anime' && <ThemeCover media={libraryStyle.bannerMedia} />}
                  <ThemeSlider
                    label={tr("Banner-Aufhellung")}
                    value={libraryStyle.bannerOverlay}
                    onChange={(value) => setLibraryStyle((current) => ({ ...current, bannerOverlay: value }))}
                    max={100}
                    unit="%"
                    description={tr("Wie stark das Banner hinter dem Text abgedunkelt wird. 0 = Bild/Video voll sichtbar.")}
                  />
                  <input
                    value={libraryStyle.bannerTitle}
                    onChange={(event) => setLibraryStyle((current) => ({ ...current, bannerTitle: event.target.value }))}
                    className="input w-full"
                    placeholder={tr("Banner-Titel (leer = Standard)")}
                  />
                  <input
                    value={libraryStyle.bannerText}
                    onChange={(event) => setLibraryStyle((current) => ({ ...current, bannerText: event.target.value }))}
                    className="input w-full"
                    placeholder={tr("Banner-Text (leer = Standard)")}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <ThemeColor
                      label={tr("Seiten-Hintergrund")}
                      value={libraryStyle.pageBackground || '#111113'}
                      onChange={(value) => setLibraryStyle((current) => ({ ...current, pageBackground: value }))}
                    />
                    <ThemeColor
                      label={tr("Karten & Banner")}
                      value={libraryStyle.cardBackground || '#18161a'}
                      onChange={(value) => setLibraryStyle((current) => ({ ...current, cardBackground: value }))}
                    />
                    <ThemeColor
                      label={tr("Text")}
                      value={libraryStyle.textColor || '#f4f4f5'}
                      onChange={(value) => setLibraryStyle((current) => ({ ...current, textColor: value }))}
                    />
                    <ThemeColor
                      label={tr("Akzent & Buttons")}
                      value={libraryStyle.accentColor || '#f59e0b'}
                      onChange={(value) => setLibraryStyle((current) => ({ ...current, accentColor: value }))}
                    />
                  </div>
                  <button
                    onClick={() => setLibraryStyle(DEFAULT_LIBRARY_STYLE)}
                    className="text-[11px] text-zinc-500 hover:text-white"
                  >
                    {tr("Library auf Standard zuruecksetzen")}
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
        {showMultiLaunch && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <MultiLaunchPanel onCancel={() => setShowMultiLaunch(false)} />
          </div>
        )}
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
