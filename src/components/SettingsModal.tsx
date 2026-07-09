import { CheckCircle2, Download, Edit2, FolderOpen, Gauge, Image, KeyRound, Loader2, MessageSquare, Music2, Network, Palette, RefreshCw, Settings, Smartphone, Sparkles, Terminal, Trash2, Video, X, XCircle, BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RECOMMENDED_SYSTEM_PROMPT, useAppContext, type Theme } from '../AppContext';
import TutorialModal from './TutorialModal';
import type { McpServerInfo, ProviderId, ReasoningEffort, ResponseDisplayMode, WorkDisplayMode } from '../types';

const PROVIDERS: { id: ProviderId; label: string; command: string }[] = [
  { id: 'antigravity', label: 'Google Antigravity', command: 'agy' },
  { id: 'openai', label: 'OpenAI Codex', command: 'codex' },
  { id: 'anthropic', label: 'Anthropic Claude', command: 'claude' },
  { id: 'cursor', label: 'Cursor Agent', command: 'agent / cursor-agent' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode' },
  { id: 'freebuff', label: 'FreeBuff', command: 'freebuff' },
];

const THEMES: { id: Theme; label: string; mood: string; colors: string[] }[] = [
  { id: 'modern-dark', label: 'Modern Dark', mood: 'Ruhig und kompakt', colors: ['#1c181a', '#111111', '#f2c96d'] },
  { id: 'classic-light', label: 'Classic Light', mood: 'Hell und sachlich', colors: ['#f5f2ed', '#d1ccc0', '#18181b'] },
  { id: 'glass-apple-dark', label: 'Apple Glass (Dunkel)', mood: 'Mac-Stil Milchglas Dunkel', colors: ['#0f0717', '#191923', '#a855f7'] },
  { id: 'glass-apple-light', label: 'Apple Glass (Hell)', mood: 'Mac-Stil Milchglas Hell', colors: ['#f3f4f6', '#ffffff', '#0ea5e9'] },
  { id: 'deep-galactic', label: 'Deep Galactic', mood: 'Tief, blau, fokussiert', colors: ['#0e121d', '#05060a', '#64d2ff'] },
  { id: 'muted-earth', label: 'Muted Earth', mood: 'Warm und weich', colors: ['#e5e1d8', '#c4c0b4', '#6f5f46'] },
  { id: 'neon-cyber', label: 'Neon Cyber', mood: 'Kontrastreich', colors: ['#1a1a1a', '#00e5ff', '#ff3df2'] },
  { id: 'midnight-ocean', label: 'Midnight Ocean', mood: 'Dunkelblau', colors: ['#071826', '#0b2a3f', '#67e8f9'] },
  { id: 'forest-terminal', label: 'Forest Terminal', mood: 'Gruen und ruhig', colors: ['#07130d', '#143322', '#7ddc9f'] },
  { id: 'solarized-dawn', label: 'Solarized Dawn', mood: 'Sanfter Morgen', colors: ['#fdf6e3', '#eee8d5', '#268bd2'] },
  { id: 'rose-quartz', label: 'Rose Quartz', mood: 'Hell, warm, freundlich', colors: ['#fff1f2', '#fbcfe8', '#be185d'] },
  { id: 'mono-slate', label: 'Mono Slate', mood: 'Neutral und dicht', colors: ['#0f172a', '#334155', '#e2e8f0'] },
  { id: 'amber-console', label: 'Amber Console', mood: 'Terminal-Waerme', colors: ['#160f06', '#3b2608', '#f59e0b'] },
  { id: 'arctic-blue', label: 'Arctic Blue', mood: 'Klar und hell', colors: ['#eff6ff', '#dbeafe', '#2563eb'] },
  { id: 'violet-noir', label: 'Violet Noir', mood: 'Elegant dunkel', colors: ['#10051b', '#24113f', '#c084fc'] },
  { id: 'high-contrast', label: 'High Contrast', mood: 'Maximal lesbar', colors: ['#000000', '#ffffff', '#22c55e'] },
  { id: 'aurora-flow', label: 'Aurora Flow', mood: 'Animierter Verlauf', colors: ['#052e2b', '#115e59', '#a7f3d0'] },
  { id: 'neon-flow', label: 'Neon Flow', mood: 'Animierter Verlauf', colors: ['#09090b', '#7c3aed', '#22d3ee'] },
];

const REASONING_OPTIONS: { id: ReasoningEffort; label: string; description: string }[] = [
  { id: 'low', label: 'Niedrig', description: 'Schneller fuer kleine Aenderungen' },
  { id: 'medium', label: 'Mittel', description: 'Ausgewogen fuer normale Coding-Aufgaben' },
  { id: 'high', label: 'Hoch', description: 'Gruendlicher fuer komplexe Aufgaben' },
];

const WORK_DISPLAY_OPTIONS: { id: WorkDisplayMode; label: string; description: string }[] = [
  { id: 'codeforge', label: 'Aktuell', description: 'Die bisherige CodeForge-Laufspur mit kurzen Statusmeldungen.' },
  { id: 'raw-terminal', label: 'Raw Terminal', description: 'Live-Ausgabe fast unverarbeitet als Terminal-Stream.' },
  { id: 'compact', label: 'Kompakt', description: 'Kleine Statuszeile mit Phase, Zeit und Aktivitaet.' },
  { id: 'timeline', label: 'Timeline', description: 'Schritte, Befehle und erkannte Dateien als Verlauf.' },
  { id: 'focus', label: 'Fokus', description: 'Grosse Arbeitskarte mit Phase, Modell und Kennzahlen.' },
];

const RESPONSE_DISPLAY_OPTIONS: { id: ResponseDisplayMode; label: string; description: string }[] = [
  { id: 'bullets', label: 'Punktuell', description: 'Aktuelle kompakte Antwort mit Abschnitten und Stichpunkten.' },
  { id: 'plain', label: 'Fliesstext', description: 'Kurze natuerliche Antwort mit weniger Listen.' },
  { id: 'detailed', label: 'Ausfuehrlich', description: 'Mehr Kontext, Aenderungen und Pruefung in getrennten Bloecken.' },
  { id: 'checklist', label: 'Checkliste', description: 'Antwort als abhakbare Schritte und Ergebnisse.' },
  { id: 'technical', label: 'Technisch', description: 'Praezise mit Pfaden, Befehlen und Implementierungsdetails.' },
];

type UpdateStatus = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  availableVersion: string;
  downloaded: boolean;
  percent: number;
  message: string;
  error: string;
  feedUrl: string;
};

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    provider,
    setProvider,
    reasoningEffort,
    setReasoningEffort,
    apiKeys,
    setApiKey,
    externalServer,
    setExternalServer,
    testExternalServer,
    systemPrompt,
    setSystemPrompt,
    useRecommendedSystemPrompt,
    generateSystemPrompt,
    theme,
    setTheme,
    themeByProvider,
    customThemes,
    themeBackgroundBehindComposer,
    libraryBannerBackgroundEnabled,
    mobileMode,
    setMobileMode,
    workDisplayMode,
    responseDisplayMode,
    spotifyWidgetEnabled,
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
    setWorkDisplayMode,
    setResponseDisplayMode,
    setSpotifyWidgetEnabled,
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
    setTokenLimit,
    resetUsage,
    refreshProviderUsage,
    setHasSetupCompleted,
    terminalStartPath,
    setTerminalStartPath,
    terminalStartCommand,
    setTerminalStartCommand,
    terminalPrefix,
    setTerminalPrefix,
    terminalSuffix,
    setTerminalSuffix,
    terminalTriggerWords,
    setTerminalTriggerWords,
    agyStartCommand,
    setAgyStartCommand,
    agyWaitTimeMs,
    setAgyWaitTimeMs,
    agyPrefix,
    setAgyPrefix,
    agySuffix,
    setAgySuffix,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'appearance' | 'network'>('general');
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [promptError, setPromptError] = useState('');
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);
  const [statusNotice, setStatusNotice] = useState('');
  const [customName, setCustomName] = useState('Mein Theme');
  const [customBackground, setCustomBackground] = useState('#101010');
  const [customSurface, setCustomSurface] = useState('#18181b');
  const [customText, setCustomText] = useState('#f4f4f5');
  const [customAccent, setCustomAccent] = useState('#f59e0b');
  const [customMedia, setCustomMedia] = useState('');
  const [customAnimatedGradient, setCustomAnimatedGradient] = useState(true);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpNotice, setMcpNotice] = useState('');
  const [externalTesting, setExternalTesting] = useState(false);
  const [externalNotice, setExternalNotice] = useState('');
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

  const refreshMcpServers = async () => {
    setMcpLoading(true);
    setMcpNotice('');
    try {
      const servers = (await window.agentWorkspace?.getMcpServers()) || [];
      setMcpServers(servers);
      setMcpNotice(servers.length ? `${servers.length} MCP-Server gefunden.` : 'Keine MCP-Server-Konfiguration gefunden.');
    } catch (error) {
      setMcpNotice(error instanceof Error ? error.message : 'MCP-Server konnten nicht abgerufen werden.');
    } finally {
      setMcpLoading(false);
    }
  };

  const updateExternalServer = (patch: Partial<typeof externalServer>) => {
    setExternalServer({ ...externalServer, ...patch });
  };

  const runExternalServerTest = async () => {
    setExternalTesting(true);
    setExternalNotice('');
    try {
      setExternalNotice(await testExternalServer());
    } catch (error) {
      setExternalNotice(error instanceof Error ? error.message : 'Externer Server konnte nicht getestet werden.');
    } finally {
      setExternalTesting(false);
    }
  };

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
  };

  const saveCustomTheme = () => {
    if (!customName.trim()) return;
    const input = {
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
            { id: 'ai', label: 'KI-Optionen', icon: Sparkles },
            { id: 'appearance', label: 'Aussehen', icon: Palette },
            { id: 'network', label: 'Verbindung', icon: Network }
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
                  Terminal-Startbefehl
                </div>
                <input
                  type="text"
                  value={terminalStartCommand}
                  onChange={(event) => setTerminalStartCommand(event.target.value)}
                  className="input w-full mt-3"
                  placeholder="z. B. npm run dev"
                  autoComplete="off"
                />
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  Dieser Befehl wird beim Starten eines Terminals automatisch eingegeben, wenn die Option im Terminal-Tab aktiv ist.
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
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                  <div>
                    <div className="text-sm text-zinc-200">Mobile Modus aktivieren</div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      Optimiert die Oberflaeche fuer Smartphones. Verbinde dich mit einem PC oder VPS als KI-Server. CLI-Status und Terminal werden ausgeblendet.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={mobileMode}
                    onChange={(event) => setMobileMode(event.target.checked)}
                    className="h-4 w-4 accent-amber-300"
                  />
                </label>
                {mobileMode && (
                  <button
                    onClick={() => setShowTutorial(true)}
                    className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5 text-sm text-amber-200 hover:bg-amber-400/10 transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    Verbindungsanleitung oeffnen
                  </button>
                )}
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Music2 className="w-3.5 h-3.5" />
                  Spotify-Widget
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                  <div>
                    <div className="text-sm text-zinc-200">Mini-Widget anzeigen</div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      Zeigt aktuellen Windows/Spotify-Song als frei platzierbares Widget.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={spotifyWidgetEnabled}
                    onChange={(event) => setSpotifyWidgetEnabled(event.target.checked)}
                    className="h-4 w-4 accent-amber-300"
                  />
                </label>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Discord-Status
                </div>
                <input
                  value={discordIdleMessage}
                  onChange={(event) => setDiscordIdleMessage(event.target.value)}
                  className="input mt-3 w-full"
                  maxLength={128}
                  placeholder="Bereit"
                />
                <p className="mt-2 text-[11px] leading-4 text-zinc-600">
                  Dieser Text ersetzt Bereit, solange kein Agent laeuft.
                </p>
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

          {activeTab === 'ai' && (
            <motion.div
              key="ai"
              variants={tabContentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-7"
            >
              <section>
                <div className="section-label flex items-center justify-between">
                  System-Prompt
                  <div className="flex gap-3">
                    <button
                      onClick={useRecommendedSystemPrompt}
                      className="text-[11px] text-amber-300 hover:text-amber-200 normal-case tracking-normal"
                      title={RECOMMENDED_SYSTEM_PROMPT}
                    >
                      Empfohlen nutzen
                    </button>
                    <button
                      onClick={async () => {
                        setPromptError('');
                        setGeneratingPrompt(true);
                        try {
                          await generateSystemPrompt();
                        } catch (error) {
                          setPromptError(error instanceof Error ? error.message : 'Generierung fehlgeschlagen.');
                        } finally {
                          setGeneratingPrompt(false);
                        }
                      }}
                      disabled={!selectedProject || generatingPrompt}
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white disabled:text-zinc-700 normal-case tracking-normal"
                    >
                      {generatingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Mit AI generieren
                    </button>
                  </div>
                </div>
                <textarea
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  className="input w-full mt-3 min-h-32 resize-none"
                  placeholder="Lege fest, wie der Agent grundsaetzlich arbeiten soll."
                />
                {promptError && <div className="text-[11px] text-red-400 mt-2">{promptError}</div>}
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5" />
                  API-Key
                </div>
                <input
                  type="password"
                  value={apiKeys[provider] || ''}
                  onChange={(event) => setApiKey(provider, event.target.value)}
                  className="input w-full mt-3"
                  placeholder={`${PROVIDERS.find((item) => item.id === provider)?.label} API-Key`}
                  autoComplete="off"
                />
                <p className="text-[11px] leading-4 text-zinc-600 mt-2">
                  Wird lokal auf deinem PC gespeichert. Falls du ein externes Server-Gateway nutzt, kannst du den Key leer lassen.
                </p>
              </section>

              <section>
                <div className="section-label">Intelligenz</div>
                <div className="mt-3 grid gap-2">
                  {REASONING_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setReasoningEffort(option.id)}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        reasoningEffort === option.id
                          ? 'border-white/25 bg-white/10 text-white'
                          : 'border-white/5 bg-white/[0.02] text-zinc-500 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{option.label}</span>
                        {reasoningEffort === option.id && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      </div>
                      <div className="mt-1 text-[10px] leading-4 text-zinc-600">{option.description}</div>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" />
                  Arbeitskarte (Laufspur)
                </div>
                <div className="mt-3 grid gap-2">
                  {WORK_DISPLAY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setWorkDisplayMode(option.id)}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        workDisplayMode === option.id
                          ? 'border-white/25 bg-white/10 text-white'
                          : 'border-white/5 bg-white/[0.02] text-zinc-500 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{option.label}</span>
                        {workDisplayMode === option.id && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      </div>
                      <div className="mt-1 text-[10px] leading-4 text-zinc-600">{option.description}</div>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Antwort-Art
                </div>
                <div className="mt-3 grid gap-2">
                  {RESPONSE_DISPLAY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setResponseDisplayMode(option.id)}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        responseDisplayMode === option.id
                          ? 'border-white/25 bg-white/10 text-white'
                          : 'border-white/5 bg-white/[0.02] text-zinc-500 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{option.label}</span>
                        {responseDisplayMode === option.id && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      </div>
                      <div className="mt-1 text-[10px] leading-4 text-zinc-600">{option.description}</div>
                    </button>
                  ))}
                </div>
              </section>
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
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {[...THEMES, ...customThemes.map((item) => ({
                    id: item.id,
                    label: item.name,
                    mood: item.backgroundMedia || item.backgroundImage
                      ? isVideoPath(item.backgroundMedia || item.backgroundImage || '')
                        ? 'Eigenes Video'
                        : 'Eigenes Bild'
                      : item.animatedGradient
                        ? 'Animierter Verlauf'
                        : 'Eigenes Theme',
                    colors: [item.background, item.surface, item.accent],
                    custom: true,
                  }))].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setTheme(item.id)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        theme === item.id ? 'bg-white/10 border-white/25 text-white' : 'border-white/5 text-zinc-500 hover:bg-white/5'
                      }`}
                    >
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
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <input
                      value={customName}
                      onChange={(event) => setCustomName(event.target.value)}
                      className="input col-span-2 w-full"
                      placeholder="Theme-Name"
                    />
                    <ThemeColor label="Hintergrund" value={customBackground} onChange={setCustomBackground} />
                    <ThemeColor label="Flaechen" value={customSurface} onChange={setCustomSurface} />
                    <ThemeColor label="Text" value={customText} onChange={setCustomText} />
                    <ThemeColor label="Akzent" value={customAccent} onChange={setCustomAccent} />
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
                  <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                    <span className="text-xs text-zinc-300">Animierten Farbverlauf aktivieren</span>
                    <input
                      type="checkbox"
                      checked={customAnimatedGradient}
                      onChange={(event) => setCustomAnimatedGradient(event.target.checked)}
                      className="h-4 w-4 accent-amber-300"
                    />
                  </label>
                  <button
                    onClick={saveCustomTheme}
                    className="primary-button mt-4 w-full"
                  >
                    {editingThemeId ? 'Theme speichern und fuer Anbieter nutzen' : 'Theme erstellen und fuer Anbieter nutzen'}
                  </button>
                </div>
              </section>

              <section>
                <div className="section-label flex items-center gap-2">
                  <Image className="w-3.5 h-3.5" />
                  Library-Banner
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
              </section>
            </motion.div>
          )}

          {activeTab === 'network' && (
            <motion.div
              key="network"
              variants={tabContentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-7"
            >
              <section>
                <div className="section-label flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Network className="w-3.5 h-3.5" />
                    Externer Coding-Server (SSH)
                  </span>
                  <button
                    onClick={runExternalServerTest}
                    disabled={externalTesting}
                    className="flex items-center gap-1 normal-case tracking-normal hover:text-white disabled:text-zinc-700"
                  >
                    {externalTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Verbindung testen
                  </button>
                </div>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 space-y-4">
                  <label className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-zinc-200">Gateway-Verbindung verwenden</div>
                      <div className="text-[10px] text-zinc-600">Leitet alle Agent-Befehle ueber SSH auf einen Remote-Host um.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={externalServer.enabled}
                      onChange={(event) => updateExternalServer({ enabled: event.target.checked })}
                      className="h-4 w-4 accent-amber-300"
                    />
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <div className="text-[10px] uppercase text-zinc-600">SSH Host</div>
                      <input
                        value={externalServer.host}
                        onChange={(event) => updateExternalServer({ host: event.target.value })}
                        className="input mt-1 w-full"
                        placeholder="z.B. my-server.com"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-zinc-600">Port</div>
                      <input
                        type="number"
                        value={externalServer.port || 22}
                        onChange={(event) => updateExternalServer({ port: Number(event.target.value) })}
                        className="input mt-1 w-full"
                        placeholder="22"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase text-zinc-600">Benutzername</div>
                      <input
                        value={externalServer.user}
                        onChange={(event) => updateExternalServer({ user: event.target.value })}
                        className="input mt-1 w-full"
                        placeholder="root"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-zinc-600">Projektpfad auf Server</div>
                      <input
                        value={externalServer.remoteProjectPath}
                        onChange={(event) => updateExternalServer({ remoteProjectPath: event.target.value })}
                        className="input mt-1 w-full"
                        placeholder="~/my-project"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-600">Identitaetsdatei (Key, optional)</div>
                    <div className="flex gap-2 mt-1">
                      <input
                        value={externalServer.identityFile || ''}
                        onChange={(event) => updateExternalServer({ identityFile: event.target.value })}
                        className="input flex-1 min-w-0"
                        placeholder="z.B. C:\Users\name\.ssh\id_rsa"
                      />
                      <button
                        onClick={async () => {
                          const path = await window.agentWorkspace?.selectLocalFile({ title: 'SSH-Key auswaehlen' });
                          if (path) updateExternalServer({ identityFile: path });
                        }}
                        className="px-3 rounded-lg border border-white/10 text-xs text-zinc-300 hover:bg-white/5"
                      >
                        Waehlen
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(externalServer.acceptNewHostKey)}
                      onChange={(event) => updateExternalServer({ acceptNewHostKey: event.target.checked })}
                      className="h-4 w-4 accent-amber-300"
                    />
                    <span className="text-xs text-zinc-300">Unbekannte Hostkeys automatisch akzeptieren</span>
                  </label>
                  {externalNotice && <div className="text-[11px] leading-4 text-zinc-400 font-mono bg-black/30 p-2.5 rounded-lg border border-white/5">{externalNotice}</div>}
                </div>
              </section>

              {!mobileMode && (
              <section>
                <div className="section-label flex items-center gap-2">
                   <Gauge className="w-3.5 h-3.5" />
                   Antigravity Terminal-Nutzung
                 </div>
                 <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                   <div className="text-sm text-zinc-200">Token-Limit (lokaler Zaehler)</div>
                   <div className="grid grid-cols-[1fr_auto] gap-3 mt-3">
                     <input
                       type="number"
                       min={0}
                       value={usage.tokenLimit || ''}
                       onChange={(event) => setTokenLimit(Number(event.target.value))}
                       className="input w-full"
                       placeholder="Token-Limit, z.B. 200000"
                     />
                     <button onClick={resetUsage} className="px-3 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-red-300 hover:bg-white/5">
                       Reset
                     </button>
                   </div>
                   <div className="mt-2 text-[11px] text-zinc-600">
                     Verbraucht: {usage.totalTokens.toLocaleString('de-DE')} Tokens
                     {usage.tokenLimit ? ` - Verbleibend: ${Math.max(0, usage.tokenLimit - usage.totalTokens).toLocaleString('de-DE')}` : ''}
                   </div>
                 </div>
               </section>
               )}

               {!mobileMode && (
               <section>
                 <div className="section-label flex items-center gap-2">
                   <Terminal className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                   Google Antigravity (agy) Einstellungen
                 </div>
                 <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 space-y-4">
                   <div>
                     <label className="text-xs text-zinc-300 block mb-1.5">Start Command für agy</label>
                     <input
                       type="text"
                       value={agyStartCommand}
                       onChange={(event) => setAgyStartCommand(event.target.value)}
                       className="input w-full"
                       placeholder="z. B. agy"
                       autoComplete="off"
                     />
                     <p className="text-[10px] text-zinc-600 mt-1">
                       Der Befehl, um die Antigravity CLI im Hintergrund-Terminal zu starten (Standard: agy).
                     </p>
                   </div>
                   
                   <div>
                     <label className="text-xs text-zinc-300 block mb-1.5">Wartezeit bis prompt Eingabe (ms)</label>
                     <input
                       type="number"
                       min={0}
                       value={agyWaitTimeMs}
                       onChange={(event) => setAgyWaitTimeMs(Number(event.target.value))}
                       className="input w-full"
                       placeholder="z. B. 3000"
                     />
                     <p className="text-[10px] text-zinc-600 mt-1">
                       Wartezeit in Millisekunden, bis sich die CLI angemeldet hat und bereit für die Prompt-Eingabe ist (Standard: 3000).
                     </p>
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                     <div>
                       <label className="text-xs text-zinc-300 block mb-1.5">Präfix (Davor schreiben)</label>
                       <input
                         type="text"
                         value={agyPrefix}
                         onChange={(event) => setAgyPrefix(event.target.value)}
                         className="input w-full"
                         placeholder="z. B. /fix "
                         autoComplete="off"
                       />
                       <p className="text-[10px] text-zinc-600 mt-1">
                         Text, der automatisch vor deinen Prompt gesetzt wird.
                       </p>
                     </div>

                     <div>
                       <label className="text-xs text-zinc-300 block mb-1.5">Suffix (Danach schreiben)</label>
                       <input
                         type="text"
                         value={agySuffix}
                         onChange={(event) => setAgySuffix(event.target.value)}
                         className="input w-full"
                         placeholder="z. B. \n"
                         autoComplete="off"
                       />
                       <p className="text-[10px] text-zinc-600 mt-1">
                         Text, der automatisch nach deinen Prompt gesetzt wird.
                       </p>
                     </div>
                   </div>
                 </div>
               </section>
               )}

              <section>
                <div className="section-label flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Network className="w-3.5 h-3.5" />
                    Verbundene MCP-Server
                  </span>
                  <button
                    onClick={refreshMcpServers}
                    disabled={mcpLoading}
                    className="flex items-center gap-1 normal-case tracking-normal hover:text-white disabled:text-zinc-700"
                  >
                    {mcpLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Abrufen
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {mcpServers.map((server) => (
                    <div key={server.id} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-medium text-zinc-200">{server.name}</div>
                            <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500">
                              {server.transport}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-[10px] text-zinc-600" title={server.sourcePath}>
                            {server.source} - {server.sourcePath}
                          </div>
                          <div className="mt-2 truncate font-mono text-[10px] text-zinc-500" title={[server.command, ...(server.args || [])].filter(Boolean).join(' ') || server.url || ''}>
                            {[server.command, ...(server.args || [])].filter(Boolean).join(' ') || server.url || 'Keine Startdetails'}
                          </div>
                        </div>
                        <div className={`shrink-0 text-[10px] ${
                          server.status === 'configured'
                            ? 'text-emerald-400'
                            : server.status === 'missing-command'
                              ? 'text-red-400'
                              : 'text-zinc-500'
                        }`}>
                          {server.status === 'configured' ? 'Konfiguriert' : server.status === 'missing-command' ? 'Fehlt' : 'Unbekannt'}
                        </div>
                      </div>
                      {server.details && (
                        <div className="mt-2 text-[10px] text-zinc-600">{server.details}</div>
                      )}
                    </div>
                  ))}
                  {mcpServers.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-zinc-600">
                      {mcpLoading ? 'MCP-Konfiguration wird abgefragt...' : 'Keine MCP-Server-Verbindung konfiguriert.'}
                    </div>
                  )}
                </div>
                {mcpNotice && <div className="mt-3 text-xs text-zinc-400">{mcpNotice}</div>}
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

function isVideoPath(filePath: string) {
  return /\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv)$/i.test(filePath);
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
