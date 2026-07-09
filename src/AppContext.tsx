import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AccessMode,
  AgentRunStats,
  ApiKeys,
  Automation,
  Chat,
  CliStatus,
  CodexPluginInfo,
  ExternalServerConfig,
  GitInfo,
  HomeApp,
  HomeAppTab,
  ImportedAntigravityChat,
  Message,
  McpServerInfo,
  MobileConnectionConfig,
  ProjectFolder,
  ProviderId,
  ResponseDisplayMode,
  ReasoningEffort,
  UsageRecord,
  UsageState,
  ProviderUsageInfo,
  WallpaperMode,
  WorkDisplayMode,
} from './types';

export type Theme = string;
export type CustomTheme = {
  id: string;
  name: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
  backgroundImage?: string;
  backgroundMedia?: string;
  animatedGradient?: boolean;
};
export type MainView = 'library' | 'chat' | 'plugins' | 'workspace' | 'usage';

export type ProviderModel = {
  id: string;
  name: string;
  intelligence?: ReasoningEffort;
};

export const PROVIDER_MODELS: Record<ProviderId, ProviderModel[]> = {
  antigravity: [
    { id: 'Gemini 3.5 Flash (Medium)', name: 'Gemini 3.5 Flash', intelligence: 'medium' },
    { id: 'Gemini 3.5 Flash (High)', name: 'Gemini 3.5 Flash', intelligence: 'high' },
    { id: 'Gemini 3.5 Flash (Low)', name: 'Gemini 3.5 Flash', intelligence: 'low' },
    { id: 'Gemini 3.1 Pro (High)', name: 'Gemini 3.1 Pro', intelligence: 'high' },
    { id: 'Gemini 3.1 Pro (Low)', name: 'Gemini 3.1 Pro', intelligence: 'low' },
    { id: 'Claude Sonnet 4.6 (Thinking)', name: 'Claude Sonnet 4.6 Thinking', intelligence: 'high' },
    { id: 'Claude Opus 4.6 (Thinking)', name: 'Claude Opus 4.6 Thinking', intelligence: 'high' },
    { id: 'GPT-OSS 120B (Medium)', name: 'GPT-OSS 120B', intelligence: 'medium' },
  ],
  openai: [
    { id: 'gpt-5.5', name: 'GPT-5.5' },
    { id: 'gpt-5.4', name: 'GPT-5.4' },
  ],
  anthropic: [
    { id: 'sonnet', name: 'Claude Sonnet' },
    { id: 'opus', name: 'Claude Opus' },
    { id: 'haiku', name: 'Claude Haiku' },
    { id: 'fable', name: 'Claude Fable' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
  ],
  cursor: [
    { id: 'default', name: 'Cursor Standard' },
    { id: 'gpt-5.5', name: 'GPT-5.5' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  ],
  opencode: [
    { id: 'default', name: 'OpenCode Standard' },
    { id: 'openai/gpt-5.5', name: 'OpenAI GPT-5.5' },
    { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
  ],
};

const DEFAULT_MODEL: Record<ProviderId, string> = {
  antigravity: PROVIDER_MODELS.antigravity[0].id,
  openai: PROVIDER_MODELS.openai[0].id,
  anthropic: PROVIDER_MODELS.anthropic[0].id,
  cursor: PROVIDER_MODELS.cursor[0].id,
  opencode: PROVIDER_MODELS.opencode[0].id,
};

const EMPTY_STATUS: CliStatus = {
  antigravity: { installed: false, executable: '', version: '' },
  openai: { installed: false, executable: '', version: '' },
  anthropic: { installed: false, executable: '', version: '' },
  cursor: { installed: false, executable: '', version: '' },
  opencode: { installed: false, executable: '', version: '' },
};

const EMPTY_USAGE: UsageState = {
  tokenLimit: 0,
  totalTokens: 0,
  records: [],
  providerLimits: {},
};

const DEFAULT_EXTERNAL_SERVER: ExternalServerConfig = {
  enabled: false,
  host: '',
  user: 'root',
  port: 22,
  remoteProjectPath: '~/codeforge-project',
  identityFile: '',
  acceptNewHostKey: true,
};

export const BUILT_IN_HOME_APPS: HomeApp[] = [
];

const STORAGE_PREFIX = 'agentWorkspace';
const MAX_AGENT_PROMPT_CHARS = 80_000;
const MAX_HISTORY_MESSAGE_CHARS = 8_000;
const SCRATCH_PROJECT_ID = 'scratch-project';

const RESPONSE_STYLE_PROMPTS: Record<ResponseDisplayMode, string> = {
  bullets: 'Antworte kompakt mit kurzen Abschnitten und wenigen Stichpunkten. Nenne das Ergebnis zuerst.',
  plain: 'Antworte als klare, natuerliche Kurzantwort ohne viele Listen. Nenne das Ergebnis zuerst.',
  detailed: 'Antworte etwas ausfuehrlicher mit kurzer Einordnung, konkreten Aenderungen und Pruefung.',
  checklist: 'Antworte als abhakbare Checkliste mit erledigten Punkten, offenen Punkten und Pruefung.',
  technical: 'Antworte technisch praezise mit Dateipfaden, Befehlen und relevanten Implementierungsdetails.',
};

export const RECOMMENDED_SYSTEM_PROMPT =
  'Du bist ein sorgfaeltiger Coding-Agent im lokalen Projekt. Arbeite in kleinen, nachvollziehbaren Schritten, lies vorhandene Patterns zuerst, veraendere nur relevante Dateien, schuetze bestehende Nutzerarbeit und pruefe deine Aenderungen mit passenden Tests oder Builds. Antworte knapp, ehrlich und mit konkreten Ergebnissen.';

export const LYZ_DEV_PLUGIN_NAME = 'Lyz Dev - Gaming Development';
const LYZ_DEV_CHAT_TITLE = 'Lyz Dev Chat';
const LYZ_DEV_SYSTEM_PROMPT =
  'Lyz Dev ist aktiv. Arbeite als Gaming-Development-Agent fuer Unity-Projekte. Pruefe vor Unity-bezogenen Aktionen die verfuegbare Unity-MCP-Verbindung und nutze sie fuer Szenen-, GameObject-, Asset- und Editor-Kontext. Wenn keine Unity-MCP-Verbindung verfuegbar ist, stoppe und erklaere knapp, welche Unity-MCP-Verbindung fehlt.';

interface AppContextType {
  folders: ProjectFolder[];
  libraryProjects: ProjectFolder[];
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  automations: Automation[];
  homeApps: HomeApp[];
  libraryApps: HomeApp[];
  libraryTags: string[];
  libraryBannerBackgroundEnabled: boolean;
  homeTabs: HomeAppTab[];
  activeHomeTabId: string | null;
  activeHomeTab: HomeAppTab | null;
  plugins: string[];
  codexPlugins: CodexPluginInfo[];
  lyzDevPluginEnabled: boolean;
  usage: UsageState;
  selectedChatId: string | null;
  selectedFolderId: string | null;
  selectedProject: ProjectFolder | null;
  provider: ProviderId;
  aiModel: string;
  reasoningEffort: ReasoningEffort;
  accessMode: AccessMode;
  apiKeys: ApiKeys;
  externalServer: ExternalServerConfig;
  systemPrompt: string;
  theme: Theme;
  themeByProvider: Record<ProviderId, Theme>;
  customThemes: CustomTheme[];
  themeBackgroundBehindComposer: boolean;
  sidebarTransparency: number;
  surfaceTransparency: number;
  terminalTransparency: number;
  glassBlurStrength: number;
  glassSaturation: number;
  appBorderRadius: number;
  glassThemeGlow: boolean;
  wallpaperMode: WallpaperMode;
  workDisplayMode: WorkDisplayMode;
  responseDisplayMode: ResponseDisplayMode;
  mobileMode: boolean;
  mobileConnectionConfig: MobileConnectionConfig;
  setMobileConnectionConfig(config: MobileConnectionConfig): void;
  devicePopupEnabled: boolean;
  spotifyStartUri: string;
  spotifyWidgetEnabled: boolean;
  discordIdleMessage: string;
  terminalStartPath: string;
  setTerminalStartPath: React.Dispatch<React.SetStateAction<string>>;
  terminalStartCommandEnabled: boolean;
  setTerminalStartCommandEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  terminalStartCommand: string;
  setTerminalStartCommand: React.Dispatch<React.SetStateAction<string>>;
  terminalPrefixSuffixEnabled: boolean;
  setTerminalPrefixSuffixEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  terminalPrefix: string;
  setTerminalPrefix: React.Dispatch<React.SetStateAction<string>>;
  terminalSuffix: string;
  setTerminalSuffix: React.Dispatch<React.SetStateAction<string>>;
  terminalTriggerWords: string;
  setTerminalTriggerWords: React.Dispatch<React.SetStateAction<string>>;
  agyStartCommand: string;
  setAgyStartCommand: React.Dispatch<React.SetStateAction<string>>;
  agyWaitTimeMs: number;
  setAgyWaitTimeMs: React.Dispatch<React.SetStateAction<number>>;
  agyPrefix: string;
  setAgyPrefix: React.Dispatch<React.SetStateAction<string>>;
  agySuffix: string;
  setAgySuffix: React.Dispatch<React.SetStateAction<string>>;
  mainView: MainView;
  hasSetupCompleted: boolean;
  isSending: boolean;
  isAnySending: boolean;
  activeRunId: string | null;
  runStats: AgentRunStats | null;
  activeRuns: Record<string, AgentRunStats>;
  attachments: string[];
  cliStatus: CliStatus;
  gitInfo: GitInfo;
  branches: string[];
  canGoBack: boolean;
  canGoForward: boolean;
  syncServerUrl: string | null;
  startSyncServer(): Promise<{ url: string; ip: string; port: number }>;
  setProvider(provider: ProviderId): void;
  setAiModel(model: string): void;
  setReasoningEffort(effort: ReasoningEffort): void;
  setAccessMode(mode: AccessMode): void;
  setTokenLimit(limit: number): void;
  resetUsage(): void;
  setApiKey(provider: ProviderId, key: string): void;
  setExternalServer(config: ExternalServerConfig): void;
  testExternalServer(): Promise<string>;
  setSystemPrompt(prompt: string): void;
  useRecommendedSystemPrompt(): void;
  generateSystemPrompt(): Promise<string>;
  setTheme(theme: Theme): void;
  createCustomTheme(theme: Omit<CustomTheme, 'id'>): void;
  updateCustomTheme(id: string, theme: Omit<CustomTheme, 'id'>): void;
  deleteCustomTheme(id: string): void;
  sendEscKey(): void;
  selectThemeBackground(): Promise<string | null>;
  setThemeBackgroundBehindComposer(value: boolean): void;
  setSidebarTransparency(value: number): void;
  setSurfaceTransparency(value: number): void;
  setTerminalTransparency(value: number): void;
  setGlassBlurStrength(value: number): void;
  setGlassSaturation(value: number): void;
  setAppBorderRadius(value: number): void;
  setGlassThemeGlow(value: boolean): void;
  openBrowserTab(url: string, title?: string): void;
  setWallpaperMode(value: WallpaperMode): void;
  setWorkDisplayMode(value: WorkDisplayMode): void;
  setResponseDisplayMode(value: ResponseDisplayMode): void;
  setMobileMode(value: boolean): void;
  setDevicePopupEnabled(value: boolean): void;
  setSpotifyStartUri(value: string): void;
  setSpotifyWidgetEnabled(value: boolean): void;
  setDiscordIdleMessage(value: string): void;
  addHomeApp(input?: Partial<HomeApp>): Promise<void>;
  updateHomeApp(id: string, patch: Partial<HomeApp>): void;
  removeHomeApp(id: string): void;
  addLibraryProject(): Promise<void>;
  createLibraryNewProject(): Promise<void>;
  saveLibraryProject(input: Partial<ProjectFolder> & { title: string }): Promise<ProjectFolder | null>;
  deleteLibraryProject(id: string): void;
  addLibraryApp(input?: Partial<HomeApp>): Promise<void>;
  updateLibraryApp(id: string, patch: Partial<HomeApp>): void;
  removeLibraryApp(id: string): void;
  createLibraryTag(name: string): void;
  deleteLibraryTag(name: string): void;
  setLibraryBannerBackgroundEnabled(value: boolean): void;
  launchHomeApp(app: HomeApp): Promise<void>;
  launchLibraryApp(app: HomeApp): Promise<void>;
  selectHomeTab(id: string): void;
  closeHomeTab(id?: string): void;
  updateHomeTabUrl(id: string, url: string): void;
  reloadHomeTab(id?: string): void;
  launchSpotifyStart(): Promise<void>;
  setMainView(view: MainView): void;
  setHasSetupCompleted(value: boolean): void;
  selectChat(id: string | null): void;
  selectFolder(id: string): void;
  addProject(): Promise<void>;
  saveProject(input: Partial<ProjectFolder> & { title: string }): Promise<ProjectFolder | null>;
  createNewProject(): Promise<void>;
  renameProject(id: string, title: string): void;
  updateProjectIcon(id: string, icon: string): void;
  deleteProject(id: string): void;
  sendMessage(
    text: string,
    forceNewChat?: boolean,
    onTargetId?: (chatId: string) => void,
    overrides?: { provider?: ProviderId; model?: string },
  ): Promise<void>;
  cancelRun(): Promise<void>;
  addAttachments(): Promise<void>;
  removeAttachment(path: string): void;
  refreshCliStatus(): Promise<void>;
  installCli(provider: ProviderId): Promise<string>;
  refreshProviderUsage(provider?: ProviderId): Promise<ProviderUsageInfo | null>;
  refreshAntigravityTerminalUsage(): Promise<ProviderUsageInfo | null>;
  startAntigravityLimit(model: string): Promise<boolean>;
  importAntigravityChats(): Promise<number>;
  refreshGit(): Promise<void>;
  switchBranch(branch: string): Promise<void>;
  installPlugin(name: string): Promise<void>;
  removePlugin(name: string): Promise<void>;
  setLyzDevPluginEnabled(value: boolean): void;
  startLyzDevChat(): Promise<void>;
  startTerminalChat(): Promise<void>;
  startUnrealTerminalChat(): Promise<void>;
  originalPluginEnabled: boolean;
  setOriginalPluginEnabled(value: boolean): void;
  sendAgentInput(text: string): Promise<boolean>;
  refreshCodexPlugins(): Promise<void>;
  installCodexPlugin(target: 'personal' | 'project'): Promise<void>;
  removeCodexPlugin(plugin: CodexPluginInfo): Promise<void>;
  addAutomation(input: Omit<Automation, 'id' | 'lastRun'>): void;
  toggleAutomation(id: string): void;
  deleteAutomation(id: string): void;
  runAutomation(id: string): Promise<void>;
  navigateBack(): void;
  navigateForward(): void;
  clearChat(): void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function readStorage<T>(key: string, fallback: T): T {
  try {
    const currentKey = `${STORAGE_PREFIX}.${key}`;
    const value = localStorage.getItem(currentKey);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  localStorage.setItem(`${STORAGE_PREFIX}.${key}`, JSON.stringify(value));
}

function projectName(projectPath: string) {
  return projectPath.split(/[\\/]/).filter(Boolean).at(-1) || projectPath;
}

function resolveHomeAppRunPath(app: HomeApp) {
  if (app.runTarget === 'installer') return app.installerPath || app.latestReleasePath || app.programPath || app.executablePath || app.path;
  if (app.runTarget === 'program') return app.programPath || app.latestReleasePath || app.installerPath || app.executablePath || app.path;
  return app.latestReleasePath || app.executablePath || app.programPath || app.installerPath || app.path;
}

function hasHomeAppRunFile(app: HomeApp) {
  return Boolean(
    app.latestReleasePath ||
      app.installerPath ||
      app.programPath ||
      (app.executablePath && app.executablePath !== app.folderPath),
  );
}

function newId() {
  return crypto.randomUUID();
}

function parseTokenUsage(output: string) {
  const match =
    output.match(/^tokens used\s*\n\s*([0-9][0-9.,]*)/im) ||
    output.match(/\btokens used\s+([0-9][0-9.,]*)/i);
  if (!match) return 0;
  const raw = match[1].trim();
  if (/,\d{1,2}$/.test(raw)) return Math.round(Number(raw.replace(/\./g, '').replace(',', '.')));
  return Number(raw.replace(/[.,]/g, '')) || 0;
}

function formatDurationForNotification(ms: number) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function buildLocalFormattingTestOutput(projectPath: string) {
  return [
    'Lokaler Testmodus: Diese Antwort wurde ohne KI- oder CLI-Aufruf erzeugt und verbraucht keine Tokens.',
    '',
    'Die Chat-Formatierung sollte jetzt normalen Text, Listen, Codebloecke und Diffs sauber anzeigen.',
    '',
    '- Statusmeldungen bleiben lesbar.',
    '- Code wird als Codeblock formatiert.',
    '- Diffs werden als Datei-Aenderung erkannt.',
    '',
    '```ts',
    'type FormatCheck = {',
    '  ok: boolean;',
    '  message: string;',
    '};',
    '',
    'const result: FormatCheck = {',
    '  ok: true,',
    "  message: 'CodeForge formatiert diese Testantwort lokal.',",
    '};',
    '```',
    '',
    `Projektpfad fuer diesen lokalen Test: ${projectPath}`,
    '',
    'diff --git a/src/format-test.ts b/src/format-test.ts',
    'new file mode 100644',
    'index 0000000..1111111',
    '--- /dev/null',
    '+++ b/src/format-test.ts',
    '@@ -0,0 +1,5 @@',
    '+export function localFormattingTest() {',
    "+  return 'Keine Tokens verbraucht.';",
    '+}',
    '+',
    '+console.log(localFormattingTest());',
    '',
    'Fertig: Der lokale Test ist abgeschlossen.',
  ].join('\n');
}

function trimForAgentHistory(text: string, limit = MAX_HISTORY_MESSAGE_CHARS) {
  if (text.length <= limit) return text;
  const head = text.slice(0, Math.floor(limit * 0.65));
  const tail = text.slice(-Math.floor(limit * 0.25));
  return `${head}\n\n[... gekuerzt fuer Folgeanfrage ...]\n\n${tail}`;
}

function buildAgentPrompt(chat: Chat, latestText: string) {
  if (chat.messages.length <= 1) return latestText;
  const latestUser = latestText.trim();
  const priorMessages = chat.messages.slice(0, -1).slice(-8);
  const context = priorMessages
    .map((message) => {
      const speaker = message.sender === 'user' ? 'Nutzer' : 'Assistent';
      return `${speaker}: ${trimForAgentHistory(message.text)}`;
    })
    .join('\n\n');
  const prompt = [
    'Setze diese Unterhaltung fort.',
    context ? `Bisheriger Kontext, gekuerzt:\n\n${context}` : '',
    `Letzte Nutzeranfrage:\n\n${latestUser}`,
    'Bearbeite die letzte Nutzeranfrage im Projektordner.',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (prompt.length <= MAX_AGENT_PROMPT_CHARS) return prompt;
  return [
    'Setze diese Unterhaltung fort. Der bisherige Kontext wurde gekuerzt, weil er sehr lang ist.',
    `Letzte Nutzeranfrage:\n\n${latestUser}`,
    'Bearbeite die letzte Nutzeranfrage im Projektordner.',
  ].join('\n\n');
}

function withResponseStylePrompt(prompt: string, mode: ResponseDisplayMode) {
  const finalOnly =
    'Wichtig: Sende keine Zwischenmeldungen als finale Antwort. Arbeite die Aufgabe vollstaendig ab und antworte erst danach mit konkretem Ergebnis, geaenderten Dateien und geprueften Tests/Builds. Saetze wie "Ich starte jetzt", "Ich muss noch" oder "Jetzt werde ich" sind nur interne Fortschrittsnotizen und duerfen nicht die finale Antwort sein.';
  return `${prompt}\n\n${finalOnly}\n\nAntwortstil fuer die sichtbare Abschlussantwort:\n${RESPONSE_STYLE_PROMPTS[mode]}`;
}

function cleanAgentFinalOutput(text: string, provider: ProviderId) {
  const transient = /^(?:starte(?:\s+jetzt)?|ich\s+(?:starte|muss|werde|verwende|nutze|pruefe|prüfe|schaue|analysiere|lese|ersetze)|jetzt\s+(?:muss|werde)|now\s+(?:i|we)\s+(?:need|will)|i\s+(?:need|will|am going)\b|let'?s\s+)/i;
  const kept = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (provider === 'antigravity' && /^starte\s+jetzt\s+die\s+umsetzung\b/i.test(trimmed)) return false;
      if (!transient.test(trimmed)) return true;
      return /(?:fertig|erledigt|completed|done|implemented|fixed|gefixt|geändert|geaendert|erstellt|created|updated|tests?|build|datei|files?)/i.test(trimmed);
    });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isUnityMcpServer(server: McpServerInfo) {
  const haystack = [
    server.name,
    server.id,
    server.command,
    server.url,
    server.details,
    ...(server.args || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (
    server.status !== 'missing-command' &&
    (haystack.includes('unity') || haystack.includes('mcpforunity') || haystack.includes('mcp-for-unity'))
  );
}

async function requireUnityMcpConnection() {
  if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
  const servers = await window.agentWorkspace.getMcpServers();
  const unityServer = servers.find(isUnityMcpServer);
  if (!unityServer) {
    throw new Error(
      'Lyz Dev braucht eine aktive Unity-MCP-Verbindung. In den MCP-Konfigurationen wurde kein nutzbarer Unity-MCP-Server gefunden.',
    );
  }
  return unityServer;
}

async function callMobileVpsApi(
  config: MobileConnectionConfig,
  params: {
    provider: ProviderId;
    model: string;
    reasoningEffort: ReasoningEffort;
    access: AccessMode;
    systemPrompt: string;
    prompt: string;
    projectPath: string;
  },
): Promise<{ ok: boolean; output: string; error: string; exitCode: number }> {
  const url = `${config.vpsUrl || ''}/run`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.vpsToken ? { Authorization: `Bearer ${config.vpsToken}` } : {}),
    },
    body: JSON.stringify({
      provider: params.provider,
      model: params.model,
      prompt: params.prompt,
      projectPath: params.projectPath,
      access: params.access,
      systemPrompt: params.systemPrompt,
      reasoningEffort: params.reasoningEffort,
      outputLimit: 50_000,
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, output: '', error: `Server-Fehler (${res.status}): ${text}`, exitCode: res.status };
  }
  const data = await res.json();
  return {
    ok: data.ok,
    output: data.output || '',
    error: data.error || '',
    exitCode: data.exitCode ?? (data.ok ? 0 : 1),
  };
}

function buildLyzDevPrompt(prompt: string, server: McpServerInfo) {
  return [
    LYZ_DEV_SYSTEM_PROMPT,
    '',
    `Verifizierte Unity-MCP-Verbindung: ${server.name} (${server.source}).`,
    `MCP-Server-ID: ${server.id}`,
    '',
    prompt,
  ].join('\n');
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [folders, setFolders] = useState<ProjectFolder[]>(() => readStorage('folders', []));
  const [libraryProjects, setLibraryProjects] = useState<ProjectFolder[]>(() => readStorage('libraryProjects', []));
  const [chats, setChats] = useState<Chat[]>(() => readStorage('chats', []));
  const [automations, setAutomations] = useState<Automation[]>(() =>
    readStorage('automations', []),
  );
  const [homeApps, setHomeApps] = useState<HomeApp[]>(() =>
    readStorage<HomeApp[]>('homeApps', []).filter((app) => app.kind !== 'web' && !app.url),
  );
  const [libraryApps, setLibraryApps] = useState<HomeApp[]>(() =>
    readStorage<HomeApp[]>('libraryApps', []).filter((app) => app.kind !== 'web' && !app.url),
  );
  const [libraryTags, setLibraryTags] = useState<string[]>(() => readStorage('libraryTags', []));
  const [libraryBannerBackgroundEnabled, setLibraryBannerBackgroundEnabledState] = useState(() =>
    readStorage('libraryBannerBackgroundEnabled', true),
  );
  const [homeTabs, setHomeTabs] = useState<HomeAppTab[]>([]);
  const [activeHomeTabId, setActiveHomeTabId] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<string[]>(() => readStorage('plugins', []));
  const [codexPlugins, setCodexPlugins] = useState<CodexPluginInfo[]>([]);
  const [lyzDevPluginEnabled, setLyzDevPluginEnabledState] = useState(() =>
    readStorage('lyzDevPluginEnabled', false),
  );
  const [originalPluginEnabled, setOriginalPluginEnabledState] = useState(() =>
    readStorage('originalPluginEnabled', false),
  );
  const [usage, setUsage] = useState<UsageState>(() =>
    readStorage<UsageState>('usage', EMPTY_USAGE),
  );
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(() =>
    readStorage<string | null>('selectedFolder', null),
  );
  const [provider, setProviderState] = useState<ProviderId>(() =>
    readStorage<ProviderId>('provider', 'antigravity'),
  );
  const [aiModel, setAiModelState] = useState(() =>
    readStorage('model', DEFAULT_MODEL.antigravity),
  );
  const [reasoningEffort, setReasoningEffortState] = useState<ReasoningEffort>(() =>
    readStorage<ReasoningEffort>('reasoningEffort', 'medium'),
  );
  const [accessMode, setAccessModeState] = useState<AccessMode>(() =>
    readStorage<AccessMode>('access', 'full'),
  );
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => readStorage<ApiKeys>('apiKeys', {}));
  const [externalServer, setExternalServerState] = useState<ExternalServerConfig>(() => ({
    ...DEFAULT_EXTERNAL_SERVER,
    ...readStorage<Partial<ExternalServerConfig>>('externalServer', {}),
  }));
  const [systemPrompt, setSystemPromptState] = useState(() =>
    readStorage('systemPrompt', RECOMMENDED_SYSTEM_PROMPT),
  );
  const [theme, setThemeState] = useState<Theme>(() =>
    readStorage<Theme>('theme', 'modern-dark'),
  );
  const [themeByProvider, setThemeByProvider] = useState<Record<ProviderId, Theme>>(() =>
    readStorage<Record<ProviderId, Theme>>('themeByProvider', {
      antigravity: readStorage<Theme>('theme', 'modern-dark'),
      openai: 'modern-dark',
      anthropic: 'modern-dark',
      cursor: 'modern-dark',
      opencode: 'modern-dark',
    }),
  );
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(() =>
    readStorage<CustomTheme[]>('customThemes', []),
  );
  const [themeBackgroundBehindComposer, setThemeBackgroundBehindComposerState] = useState(() =>
    readStorage('themeBackgroundBehindComposer', false),
  );
  const [sidebarTransparency, setSidebarTransparencyState] = useState(() =>
    readStorage('sidebarTransparency', 0),
  );
  const [surfaceTransparency, setSurfaceTransparencyState] = useState(() =>
    readStorage('surfaceTransparency', 0),
  );
  const [terminalTransparency, setTerminalTransparencyState] = useState(() =>
    readStorage('terminalTransparency', 45),
  );
  const [glassBlurStrength, setGlassBlurStrengthState] = useState(() =>
    readStorage('glassBlurStrength', 20),
  );
  const [glassSaturation, setGlassSaturationState] = useState(() =>
    readStorage('glassSaturation', 125),
  );
  const [appBorderRadius, setAppBorderRadiusState] = useState(() =>
    readStorage('appBorderRadius', 12),
  );
  const [glassThemeGlow, setGlassThemeGlowState] = useState(() =>
    readStorage('glassThemeGlow', true),
  );
  const [hasReceivedInitialSync, setHasReceivedInitialSync] = useState(false);
  const isBrowser = useMemo(() => Boolean((window as any).agentWorkspace?.isWeb), []);
  const [wallpaperMode, setWallpaperModeState] = useState<WallpaperMode>(() =>
    readStorage<WallpaperMode>('wallpaperMode', 'codeforge'),
  );
  const [workDisplayMode, setWorkDisplayModeState] = useState<WorkDisplayMode>(() =>
    readStorage<WorkDisplayMode>('workDisplayMode', 'codeforge'),
  );
  const [responseDisplayMode, setResponseDisplayModeState] = useState<ResponseDisplayMode>(() =>
    readStorage<ResponseDisplayMode>('responseDisplayMode', 'bullets'),
  );
  const [mobileMode, setMobileModeState] = useState(() =>
    readStorage('mobileMode', false),
  );
  const [mobileConnectionConfig, setMobileConnectionConfigState] = useState<MobileConnectionConfig>(() =>
    readStorage<MobileConnectionConfig>('mobileConnectionConfig', { type: 'vps', connected: false }),
  );
  const [devicePopupEnabled, setDevicePopupEnabledState] = useState(() =>
    readStorage('devicePopupEnabled', true),
  );
  const [spotifyStartUri, setSpotifyStartUriState] = useState(() =>
    readStorage('spotifyStartUri', ''),
  );
  const [spotifyWidgetEnabled, setSpotifyWidgetEnabledState] = useState(() =>
    readStorage('spotifyWidgetEnabled', false),
  );
  const [discordIdleMessage, setDiscordIdleMessageState] = useState(() =>
    readStorage('discordIdleMessage', 'Bereit'),
  );
  const [terminalStartPath, setTerminalStartPath] = useState(() =>
    readStorage('terminalStartPath', ''),
  );
  const [terminalStartCommandEnabled, setTerminalStartCommandEnabled] = useState(() =>
    readStorage('terminalStartCommandEnabled', false),
  );
  const [terminalStartCommand, setTerminalStartCommand] = useState(() =>
    readStorage('terminalStartCommand', ''),
  );
  const [terminalPrefixSuffixEnabled, setTerminalPrefixSuffixEnabled] = useState(() =>
    readStorage('terminalPrefixSuffixEnabled', false),
  );
  const [terminalPrefix, setTerminalPrefix] = useState(() =>
    readStorage('terminalPrefix', ''),
  );
  const [terminalSuffix, setTerminalSuffix] = useState(() =>
    readStorage('terminalSuffix', ''),
  );
  const [terminalTriggerWords, setTerminalTriggerWords] = useState(() =>
    readStorage('terminalTriggerWords', ''),
  );
  const [agyStartCommand, setAgyStartCommand] = useState(() =>
    readStorage('agyStartCommand', 'agy'),
  );
  const [agyWaitTimeMs, setAgyWaitTimeMs] = useState(() =>
    readStorage('agyWaitTimeMs', 3000),
  );
  const [agyPrefix, setAgyPrefix] = useState(() =>
    readStorage('agyPrefix', ''),
  );
  const [agySuffix, setAgySuffix] = useState(() =>
    readStorage('agySuffix', ''),
  );
  const [mainView, setMainView] = useState<MainView>('chat');
  const [hasSetupCompleted, setHasSetupCompletedState] = useState(
    () => isBrowser || readStorage('setup', false),
  );
  const [activeRuns, setActiveRuns] = useState<Record<string, AgentRunStats>>({});
  const [attachments, setAttachments] = useState<string[]>([]);
  const [cliStatus, setCliStatus] = useState<CliStatus>(EMPTY_STATUS);
  const [gitInfo, setGitInfo] = useState<GitInfo>({
    isRepository: false,
    branch: '',
    root: '',
  });
  const [branches, setBranches] = useState<string[]>([]);
  const [history, setHistory] = useState<(string | null)[]>([null]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyNavigation = useRef(false);

  const selectedProject =
    folders.find((folder) => folder.id === selectedFolderId) || folders[0] || null;
  const activeHomeTab = homeTabs.find((tab) => tab.id === activeHomeTabId) || null;
  const runStats = selectedChatId ? activeRuns[selectedChatId] || null : null;
  const isSending = Boolean(runStats);
  const isAnySending = Object.keys(activeRuns).length > 0;
  const activeRunId = runStats?.runId || null;

  useEffect(() => writeStorage('folders', folders), [folders]);
  useEffect(() => writeStorage('libraryProjects', libraryProjects), [libraryProjects]);
  useEffect(() => writeStorage('chats', chats), [chats]);
  useEffect(
    () => writeStorage('automations', automations),
    [automations],
  );
  useEffect(() => writeStorage('homeApps', homeApps), [homeApps]);
  useEffect(() => writeStorage('libraryApps', libraryApps), [libraryApps]);
  useEffect(() => writeStorage('libraryTags', libraryTags), [libraryTags]);
  useEffect(
    () => writeStorage('libraryBannerBackgroundEnabled', libraryBannerBackgroundEnabled),
    [libraryBannerBackgroundEnabled],
  );
  useEffect(() => writeStorage('plugins', plugins), [plugins]);
  useEffect(() => writeStorage('lyzDevPluginEnabled', lyzDevPluginEnabled), [lyzDevPluginEnabled]);
  useEffect(() => writeStorage('originalPluginEnabled', originalPluginEnabled), [originalPluginEnabled]);
  useEffect(() => writeStorage('usage', usage), [usage]);
  useEffect(() => writeStorage('externalServer', externalServer), [externalServer]);
  useEffect(() => writeStorage('themeByProvider', themeByProvider), [themeByProvider]);
  useEffect(() => writeStorage('customThemes', customThemes), [customThemes]);
  useEffect(
    () => writeStorage('themeBackgroundBehindComposer', themeBackgroundBehindComposer),
    [themeBackgroundBehindComposer],
  );
  useEffect(() => writeStorage('sidebarTransparency', sidebarTransparency), [sidebarTransparency]);
  useEffect(() => writeStorage('surfaceTransparency', surfaceTransparency), [surfaceTransparency]);
  useEffect(() => writeStorage('terminalTransparency', terminalTransparency), [terminalTransparency]);
  useEffect(() => writeStorage('glassBlurStrength', glassBlurStrength), [glassBlurStrength]);
  useEffect(() => writeStorage('glassSaturation', glassSaturation), [glassSaturation]);
  useEffect(() => writeStorage('appBorderRadius', appBorderRadius), [appBorderRadius]);
  useEffect(() => writeStorage('glassThemeGlow', glassThemeGlow), [glassThemeGlow]);
  useEffect(() => writeStorage('wallpaperMode', wallpaperMode), [wallpaperMode]);
  useEffect(() => writeStorage('workDisplayMode', workDisplayMode), [workDisplayMode]);
  useEffect(() => writeStorage('responseDisplayMode', responseDisplayMode), [responseDisplayMode]);
  useEffect(() => writeStorage('mobileMode', mobileMode), [mobileMode]);
  useEffect(() => writeStorage('mobileConnectionConfig', mobileConnectionConfig), [mobileConnectionConfig]);
  useEffect(() => writeStorage('devicePopupEnabled', devicePopupEnabled), [devicePopupEnabled]);
  useEffect(() => writeStorage('spotifyStartUri', spotifyStartUri), [spotifyStartUri]);
  useEffect(() => writeStorage('spotifyWidgetEnabled', spotifyWidgetEnabled), [spotifyWidgetEnabled]);
  useEffect(() => writeStorage('discordIdleMessage', discordIdleMessage), [discordIdleMessage]);
  useEffect(() => writeStorage('terminalStartPath', terminalStartPath), [terminalStartPath]);
  useEffect(() => writeStorage('terminalStartCommandEnabled', terminalStartCommandEnabled), [terminalStartCommandEnabled]);
  useEffect(() => writeStorage('terminalStartCommand', terminalStartCommand), [terminalStartCommand]);
  useEffect(() => writeStorage('terminalPrefixSuffixEnabled', terminalPrefixSuffixEnabled), [terminalPrefixSuffixEnabled]);
  useEffect(() => writeStorage('terminalPrefix', terminalPrefix), [terminalPrefix]);
  useEffect(() => writeStorage('terminalSuffix', terminalSuffix), [terminalSuffix]);
  useEffect(() => writeStorage('terminalTriggerWords', terminalTriggerWords), [terminalTriggerWords]);
  useEffect(() => writeStorage('agyStartCommand', agyStartCommand), [agyStartCommand]);
  useEffect(() => writeStorage('agyWaitTimeMs', agyWaitTimeMs), [agyWaitTimeMs]);
  useEffect(() => writeStorage('agyPrefix', agyPrefix), [agyPrefix]);
  useEffect(() => writeStorage('agySuffix', agySuffix), [agySuffix]);
  useEffect(
    () => writeStorage('selectedFolder', selectedFolderId),
    [selectedFolderId],
  );

  useEffect(() => {
    if (!selectedFolderId && folders[0]) setSelectedFolderId(folders[0].id);
  }, [folders, selectedFolderId]);

  const [syncServerUrl, setSyncServerUrl] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const isSyncingRef = useRef(false);
  const activeShellSessions = useRef<Record<string, {
    unsubscribe: () => void;
    accumulatedOutput: string;
    lastPrompt: string;
    promptWritten: boolean;
  }>>({});

  useEffect(() => {
    window.agentWorkspace?.getSyncServerStatus().then((status) => {
      if (status && status.running) {
        setSyncServerUrl(status.url);
      }
    });
  }, []);

  const applyBulkUpdate = useCallback((state: Record<string, any>) => {
    isSyncingRef.current = true;
    
    if (state.folders !== undefined) { setFolders(state.folders); }
    if (state.libraryProjects !== undefined) { setLibraryProjects(state.libraryProjects); }
    if (state.chats !== undefined) { setChats(state.chats); }
    if (state.theme !== undefined) { setThemeState(state.theme); }
    if (state.selectedChatId !== undefined) { setSelectedChatId(state.selectedChatId); }
    if (state.selectedFolderId !== undefined) { setSelectedFolderId(state.selectedFolderId); }
    if (state.mainView !== undefined) { setMainView(state.mainView); }
    if (state.provider !== undefined) { setProvider(state.provider); }
    if (state.aiModel !== undefined) { setAiModel(state.aiModel); }
    if (state.reasoningEffort !== undefined) { setReasoningEffort(state.reasoningEffort); }
    if (state.hasSetupCompleted !== undefined) { setHasSetupCompletedState(state.hasSetupCompleted); }
    if (state.accessMode !== undefined) { setAccessMode(state.accessMode); }
    if (state.systemPrompt !== undefined) { setSystemPrompt(state.systemPrompt); }
    if (state.sidebarTransparency !== undefined) { setSidebarTransparency(state.sidebarTransparency); }
    if (state.surfaceTransparency !== undefined) { setSurfaceTransparency(state.surfaceTransparency); }
    if (state.terminalTransparency !== undefined) { setTerminalTransparency(state.terminalTransparency); }
    if (state.glassBlurStrength !== undefined) { setGlassBlurStrength(state.glassBlurStrength); }
    if (state.glassSaturation !== undefined) { setGlassSaturation(state.glassSaturation); }
    if (state.appBorderRadius !== undefined) { setAppBorderRadius(state.appBorderRadius); }
    if (state.glassThemeGlow !== undefined) { setGlassThemeGlow(state.glassThemeGlow); }
    if (state.wallpaperMode !== undefined) { setWallpaperMode(state.wallpaperMode); }
    if (state.workDisplayMode !== undefined) { setWorkDisplayMode(state.workDisplayMode); }
    if (state.responseDisplayMode !== undefined) { setResponseDisplayMode(state.responseDisplayMode); }
    if (state.customThemes !== undefined) { setCustomThemes(state.customThemes); }
    if (state.activeRuns !== undefined) { setActiveRuns(state.activeRuns); }
    if (state.agyStartCommand !== undefined) { setAgyStartCommand(state.agyStartCommand); }
    if (state.agyWaitTimeMs !== undefined) { setAgyWaitTimeMs(state.agyWaitTimeMs); }
    if (state.agyPrefix !== undefined) { setAgyPrefix(state.agyPrefix); }
    if (state.agySuffix !== undefined) { setAgySuffix(state.agySuffix); }
    
    setTimeout(() => {
      isSyncingRef.current = false;
    }, 100);
  }, []);

  useEffect(() => {
    if (!isBrowser && !syncServerUrl) {
      return;
    }
    
    const host = isBrowser ? window.location.host : new URL(syncServerUrl!).host;
    if (!host) {
      return;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${host}`;
    
    let active = true;
    let ws: WebSocket;
    
    const connectSync = () => {
      if (!active) return;
      console.log('Connecting to State Sync WebSocket at', wsUrl);
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        if (!active) return;
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'init', isPc: !isBrowser }));
      };
      
      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'sync-state' || msg.type === 'state-update') {
            applyBulkUpdate(msg.state);
            setHasReceivedInitialSync(true);
          }
        } catch (e) {
          console.error('Error parsing sync message:', e);
        }
      };
      
      ws.onclose = () => {
        if (!active) return;
        setWsConnected(false);
        setTimeout(connectSync, 2000);
      };
    };
    
    connectSync();
    
    return () => {
      active = false;
      wsRef.current?.close();
    };
  }, [syncServerUrl, applyBulkUpdate]);

  useEffect(() => {
    if (isSyncingRef.current) return;
    if (!wsConnected) return;
    if (isBrowser && !hasReceivedInitialSync) return;
    
    const stateToSync = {
      folders,
      libraryProjects,
      chats,
      theme,
      selectedChatId,
      selectedFolderId,
      mainView,
      provider,
      aiModel,
      reasoningEffort,
      accessMode,
      systemPrompt,
      sidebarTransparency,
      surfaceTransparency,
      terminalTransparency,
      wallpaperMode,
      workDisplayMode,
      responseDisplayMode,
      customThemes,
      activeRuns,
      hasSetupCompleted,
      agyStartCommand,
      agyWaitTimeMs,
      agyPrefix,
      agySuffix,
    };
    
    wsRef.current?.send(JSON.stringify({
      type: 'state-update',
      state: stateToSync
    }));
  }, [
    folders,
    libraryProjects,
    chats,
    theme,
    selectedChatId,
    selectedFolderId,
    mainView,
    provider,
    aiModel,
    reasoningEffort,
    accessMode,
    systemPrompt,
    sidebarTransparency,
    surfaceTransparency,
    terminalTransparency,
    wallpaperMode,
    workDisplayMode,
    responseDisplayMode,
    customThemes,
    activeRuns,
    wsConnected,
    hasSetupCompleted,
    agyStartCommand,
    agyWaitTimeMs,
    agyPrefix,
    agySuffix
  ]);

  const startSyncServer = async () => {
    if (!window.agentWorkspace?.startSyncServer) {
      throw new Error('Sync server is only supported in Desktop app.');
    }
    const result = await window.agentWorkspace.startSyncServer();
    setSyncServerUrl(result.url);
    return result;
  };

  useEffect(() => {
    const providerTheme = themeByProvider[provider] || 'modern-dark';
    if (theme !== providerTheme) setThemeState(providerTheme);
  }, [provider, theme, themeByProvider]);

  const refreshCliStatus = useCallback(async () => {
    if (!window.agentWorkspace) return;
    setCliStatus(await window.agentWorkspace.getSystemStatus());
  }, []);

  const installCli = useCallback(async (installProvider: ProviderId) => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    const result = await window.agentWorkspace.installCli(installProvider);
    await refreshCliStatus();
    return result.message;
  }, [refreshCliStatus]);

  const refreshProviderUsage = useCallback(async (usageProvider: ProviderId = provider) => {
    if (!window.agentWorkspace) return null;
    const info = await window.agentWorkspace.getProviderUsage(usageProvider);
    setUsage((current) => ({
      ...current,
      providerLimits: {
        ...(current.providerLimits || {}),
        [usageProvider]: info,
      },
      tokenLimit: info.limitTokens || current.tokenLimit,
      totalTokens: info.usedTokens || current.totalTokens,
    }));
    return info;
  }, [provider]);

  const refreshAntigravityTerminalUsage = useCallback(async () => {
    if (!window.agentWorkspace) return null;
    
    const chatId = `bg-usage-${Date.now()}`;
    let allOutput = '';
    
    const unsubscribe = window.agentWorkspace.onShellOutput(chatId, (payload: any) => {
      if (payload.type === 'stdout' || payload.type === 'stderr') {
        if (payload.text) {
          allOutput += payload.text;
        }
      }
    });

    try {
      await window.agentWorkspace.createShellSession({ chatId, shellType: 'cmd' });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await window.agentWorkspace.writeToShellSession({ chatId, text: 'agy\r' });
      await new Promise((resolve) => setTimeout(resolve, 3500));
      // In case it prompts: "Do you trust the contents of this project?"
      await window.agentWorkspace.writeToShellSession({ chatId, text: '\r' });
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await window.agentWorkspace.writeToShellSession({ chatId, text: '/usage\r' });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (err) {
      console.error('Error running background terminal for usage:', err);
    } finally {
      unsubscribe();
      try {
        await window.agentWorkspace.killShellSession(chatId);
      } catch (err) {
        console.error('Error killing background shell:', err);
      }
    }

    const stripAnsi = (str: string) => {
      // eslint-disable-next-line no-control-regex
      return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    };
    
    const cleanOutput = stripAnsi(allOutput);

    const parseAntigravityQuotaGroups = (text: string) => {
      if (!/Models\s*&\s*Quota|GEMINI MODELS|CLAUDE AND GPT MODELS/i.test(text)) {
        return [];
      }

      const toTitleCase = (val: string) => {
        return val.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
      };

      const lines = text
        .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .split('\n')
        .map((line) => line.replace(/[│└]/g, '').trim())
        .filter(Boolean);
      const groups: any[] = [];
      let current: any = null;
      let pendingLimit: any = null;

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (/^[A-Z][A-Z0-9 &-]+MODELS$/.test(line)) {
          current = { name: toTitleCase(line), models: [], limits: [] };
          groups.push(current);
          pendingLimit = null;
          continue;
        }
        if (!current) continue;

        const models = line.match(/^Models within this group:\s*(.+)$/i)?.[1];
        if (models) {
          current.models = models.split(/\s*,\s*/).filter(Boolean);
          continue;
        }

        const limitName = line.match(/^(Weekly|Five Hour|5 Hour|Daily|Monthly)\s+Limit$/i)?.[0];
        if (limitName) {
          pendingLimit = { name: limitName.replace(/^5 Hour/i, 'Five Hour') };
          current.limits.push(pendingLimit);
          continue;
        }

        if (!pendingLimit) continue;
        const percent = line.match(/([0-9]+(?:[.,][0-9]+)?)%/)?.[1];
        if (percent && pendingLimit.percent === undefined) {
          pendingLimit.percent = Number(percent.replace(',', '.'));
          continue;
        }
        const remaining = line.match(/([0-9]+(?:[.,][0-9]+)?)%\s+remaining/i)?.[1];
        if (remaining) pendingLimit.remainingPercent = Number(remaining.replace(',', '.'));
        if (/quota available/i.test(line)) pendingLimit.status = 'Quota available';
        const refreshesIn = line.match(/Refreshes in\s+(.+)$/i)?.[1]?.trim();
        if (refreshesIn) pendingLimit.refreshesIn = refreshesIn;
      }

      return groups.filter((group) => group.limits.length > 0);
    };
    
    let extracted = cleanOutput;
    const usageIndex = cleanOutput.lastIndexOf('/usage');
    if (usageIndex !== -1) {
      extracted = cleanOutput.substring(usageIndex + 6).trim();
    } else {
      const usageLowerIndex = cleanOutput.toLowerCase().lastIndexOf('/usage');
      if (usageLowerIndex !== -1) {
        extracted = cleanOutput.substring(usageLowerIndex + 6).trim();
      }
    }

    let usedTokens = 0;
    let limitTokens = 0;
    
    const slashMatch = extracted.match(/([\d,.]+)\s*\/\s*([\d,.]+)/);
    if (slashMatch) {
      usedTokens = parseInt(slashMatch[1].replace(/[,.]/g, ''), 10) || 0;
      limitTokens = parseInt(slashMatch[2].replace(/[,.]/g, ''), 10) || 0;
    } else {
      const usedMatch = extracted.match(/(?:used|verbraucht):\s*([\d,.]+)/i);
      if (usedMatch) {
        usedTokens = parseInt(usedMatch[1].replace(/[,.]/g, ''), 10) || 0;
      }
      const limitMatch = extracted.match(/(?:limit|maximum):\s*([\d,.]+)/i);
      if (limitMatch) {
        limitTokens = parseInt(limitMatch[1].replace(/[,.]/g, ''), 10) || 0;
      }
    }

    const info: ProviderUsageInfo = {
      provider: 'antigravity',
      available: true,
      label: 'Antigravity Terminal Nutzung',
      usedTokens: usedTokens || undefined,
      limitTokens: limitTokens || undefined,
      quotaGroups: parseAntigravityQuotaGroups(cleanOutput),
      raw: extracted || cleanOutput || 'Keine Terminalausgabe erhalten.',
      checkedAt: Date.now(),
    };

    setUsage((current) => ({
      ...current,
      providerLimits: {
        ...(current.providerLimits || {}),
        antigravity: info,
      },
      tokenLimit: info.limitTokens || current.tokenLimit,
      totalTokens: info.usedTokens || current.totalTokens,
    }));

    return info;
  }, []);

  const refreshGit = useCallback(async () => {
    if (!window.agentWorkspace || !selectedProject) {
      setGitInfo({ isRepository: false, branch: '', root: '' });
      setBranches([]);
      return;
    }
    const [info, branchList] = await Promise.all([
      window.agentWorkspace.getGitInfo(selectedProject.path),
      window.agentWorkspace.getBranches(selectedProject.path),
    ]);
    setGitInfo(info);
    setBranches(branchList);
  }, [selectedProject?.path]);

  const refreshCodexPlugins = useCallback(async () => {
    if (!window.agentWorkspace) {
      setCodexPlugins([]);
      return;
    }
    setCodexPlugins(await window.agentWorkspace.listCodexPlugins(selectedProject?.path));
  }, [selectedProject?.path]);

  useEffect(() => {
    refreshCliStatus();
  }, [refreshCliStatus]);

  useEffect(() => {
    refreshGit();
  }, [refreshGit]);

  useEffect(() => {
    refreshCodexPlugins();
  }, [refreshCodexPlugins]);

  useEffect(() => {
    void window.agentWorkspace?.updateDiscordPresence({
      details: isAnySending ? 'Agent arbeitet' : discordIdleMessage.trim() || 'Bereit',
      projectName: selectedProject?.title || 'Ohne Projekt',
      provider,
      model: aiModel,
      isRunning: isAnySending,
    });
  }, [selectedProject?.title, provider, aiModel, isAnySending, discordIdleMessage]);

  useEffect(() => {
    if (!window.agentWorkspace?.onAgentOutput) return;
    return window.agentWorkspace.onAgentOutput(({ runId, chunk }) => {
      setActiveRuns((current) => {
        const entry = Object.entries(current).find(([, run]) => run.runId === runId);
        if (!entry) return current;
        const [chatId, run] = entry;
        const lines = chunk.split(/\r?\n/).filter(Boolean);
        const fileMatches =
          chunk.match(/[\w./\\-]+\.(?:ts|tsx|js|jsx|json|css|html|md|cjs|mjs|py|yml|yaml)/gi) || [];
        const codeSignals =
          (chunk.match(/\b(edit|patch|write|update|modify|create|build|compile|lint|diff|file)\b/gi) || [])
            .length;
        const testSignals =
          (chunk.match(/\b(test|spec|lint|tsc|vite|passed|failed|build)\b/gi) || []).length;
        const lastOutput = lines.at(-1)?.trim() || chunk.trim() || run.lastOutput;
        const phase =
          testSignals > 0
            ? 'Prueft Ergebnis'
            : codeSignals > 0
              ? 'Codet im Projekt'
              : run.outputLines === 0
                ? 'Startet Agent'
                : 'Analysiert Kontext';

        return {
          ...current,
          [chatId]: {
            ...run,
            outputLines: run.outputLines + lines.length,
            outputBytes: run.outputBytes + chunk.length,
            codeSignals: run.codeSignals + codeSignals,
            testSignals: run.testSignals + testSignals,
            files: [...new Set([...run.files, ...fileMatches])].slice(0, 12),
            lastOutput,
            liveOutput: `${run.liveOutput}${chunk}`,
            phase,
          },
        };
      });
    });
  }, []);

  const setProvider = (nextProvider: ProviderId) => {
    setProviderState(nextProvider);
    setAiModelState(DEFAULT_MODEL[nextProvider]);
    setThemeState(themeByProvider[nextProvider] || 'modern-dark');
    writeStorage('provider', nextProvider);
    writeStorage('model', DEFAULT_MODEL[nextProvider]);
  };

  const setAiModel = (model: string) => {
    setAiModelState(model);
    writeStorage('model', model);
  };

  const setReasoningEffort = (effort: ReasoningEffort) => {
    setReasoningEffortState(effort);
    writeStorage('reasoningEffort', effort);
  };

  const setAccessMode = (mode: AccessMode) => {
    setAccessModeState(mode);
    writeStorage('access', mode);
  };

  const setTokenLimit = (limit: number) => {
    setUsage((current) => ({
      ...current,
      tokenLimit: Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0,
    }));
  };

  const resetUsage = () => {
    setUsage((current) => ({ ...current, totalTokens: 0, records: [], providerLimits: current.providerLimits || {} }));
  };

  const setApiKey = (keyProvider: ProviderId, key: string) => {
    setApiKeys((current) => {
      const next = { ...current, [keyProvider]: key };
      writeStorage('apiKeys', next);
      return next;
    });
  };

  const setExternalServer = (config: ExternalServerConfig) => {
    const next = {
      ...DEFAULT_EXTERNAL_SERVER,
      ...config,
      port: Number.isFinite(Number(config.port)) ? Number(config.port) : 22,
    };
    setExternalServerState(next);
    writeStorage('externalServer', next);
  };

  const testExternalServer = async () => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    const result = await window.agentWorkspace.testExternalServer({
      provider,
      externalServer: { ...externalServer, enabled: true },
    });
    if (!result.ok) {
      throw new Error(result.error || result.output || 'Externer Server konnte nicht erreicht werden.');
    }
    return result.output || 'Externer Server ist erreichbar.';
  };

  const setSystemPrompt = (prompt: string) => {
    setSystemPromptState(prompt);
    writeStorage('systemPrompt', prompt);
  };

  const useRecommendedSystemPrompt = () => {
    setSystemPrompt(RECOMMENDED_SYSTEM_PROMPT);
  };

  const generateSystemPrompt = async () => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    if (!selectedProject) throw new Error('Waehle zuerst einen Projektordner.');
    const result = await window.agentWorkspace.generateSystemPrompt({
      provider,
      model: aiModel,
      reasoningEffort,
      access: accessMode,
      apiKeys,
      projectPath: selectedProject.path,
      externalServer: externalServer.enabled ? externalServer : undefined,
    });
    if (!result.ok) {
      throw new Error(result.error || result.output || 'System-Prompt konnte nicht generiert werden.');
    }
    const generatedPrompt = result.output.trim();
    setSystemPrompt(generatedPrompt);
    return generatedPrompt;
  };

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    writeStorage('theme', nextTheme);
    setThemeByProvider((current) => {
      const next = { ...current, [provider]: nextTheme };
      writeStorage('themeByProvider', next);
      return next;
    });
  };

  const createCustomTheme = (input: Omit<CustomTheme, 'id'>) => {
    const customTheme: CustomTheme = { ...input, id: `custom-${newId()}` };
    setCustomThemes((current) => {
      const next = [customTheme, ...current].slice(0, 50);
      writeStorage('customThemes', next);
      return next;
    });
    setTheme(customTheme.id);
  };

  const updateCustomTheme = (id: string, input: Omit<CustomTheme, 'id'>) => {
    setCustomThemes((current) => {
      const next = current.map((item) => (item.id === id ? { ...input, id } : item));
      writeStorage('customThemes', next);
      return next;
    });
    setTheme(id);
  };

  const deleteCustomTheme = (id: string) => {
    setCustomThemes((current) => current.filter((item) => item.id !== id));
    setThemeByProvider((current) => {
      const next = Object.fromEntries(
        Object.entries(current).map(([key, value]) => [key, value === id ? 'modern-dark' : value]),
      ) as Record<ProviderId, Theme>;
      writeStorage('themeByProvider', next);
      return next;
    });
    if (theme === id) setTheme('modern-dark');
  };

  const selectThemeBackground = async () => {
    return (await window.agentWorkspace?.selectThemeBackground()) || null;
  };

  const setThemeBackgroundBehindComposer = (value: boolean) => {
    setThemeBackgroundBehindComposerState(value);
    writeStorage('themeBackgroundBehindComposer', value);
  };

  const normalizeTransparency = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(90, Math.max(0, Math.round(value)));
  };

  const setSidebarTransparency = (value: number) => {
    const next = normalizeTransparency(value);
    setSidebarTransparencyState(next);
    writeStorage('sidebarTransparency', next);
  };

  const setSurfaceTransparency = (value: number) => {
    const next = normalizeTransparency(value);
    setSurfaceTransparencyState(next);
    writeStorage('surfaceTransparency', next);
  };

  const setTerminalTransparency = (value: number) => {
    const next = normalizeTransparency(value);
    setTerminalTransparencyState(next);
    writeStorage('terminalTransparency', next);
  };

  const setGlassBlurStrength = (value: number) => {
    const val = Math.min(40, Math.max(0, Math.round(value)));
    setGlassBlurStrengthState(val);
    writeStorage('glassBlurStrength', val);
  };

  const setGlassSaturation = (value: number) => {
    const val = Math.min(200, Math.max(50, Math.round(value)));
    setGlassSaturationState(val);
    writeStorage('glassSaturation', val);
  };

  const setAppBorderRadius = (value: number) => {
    const val = Math.min(24, Math.max(0, Math.round(value)));
    setAppBorderRadiusState(val);
    writeStorage('appBorderRadius', val);
  };

  const setGlassThemeGlow = (value: boolean) => {
    setGlassThemeGlowState(value);
    writeStorage('glassThemeGlow', value);
  };

  const openBrowserTab = (url: string, title?: string) => {
    const tab: HomeAppTab = {
      id: newId(),
      appId: 'browser-' + newId(),
      name: title || 'Browser',
      path: url,
      kind: 'web',
      url: url,
      reloadKey: 0,
      openedAt: Date.now(),
    };
    setHomeTabs((current) => [...current, tab]);
    setActiveHomeTabId(tab.id);
    setMainView('chat');
    setSelectedChatId(null);
  };

  const setWallpaperMode = (value: WallpaperMode) => {
    setWallpaperModeState(value);
    writeStorage('wallpaperMode', value);
  };

  const setWorkDisplayMode = (value: WorkDisplayMode) => {
    setWorkDisplayModeState(value);
    writeStorage('workDisplayMode', value);
  };

  const setResponseDisplayMode = (value: ResponseDisplayMode) => {
    setResponseDisplayModeState(value);
    writeStorage('responseDisplayMode', value);
  };

  const setMobileMode = (value: boolean) => {
    setMobileModeState(value);
    writeStorage('mobileMode', value);
  };

  const setMobileConnectionConfig = (config: MobileConnectionConfig) => {
    setMobileConnectionConfigState(config);
    writeStorage('mobileConnectionConfig', config);
  };

  const setDevicePopupEnabled = (value: boolean) => {
    setDevicePopupEnabledState(value);
    writeStorage('devicePopupEnabled', value);
  };

  const setSpotifyStartUri = (value: string) => {
    setSpotifyStartUriState(value);
    writeStorage('spotifyStartUri', value);
  };

  const setSpotifyWidgetEnabled = (value: boolean) => {
    setSpotifyWidgetEnabledState(value);
    writeStorage('spotifyWidgetEnabled', value);
  };

  const setDiscordIdleMessage = (value: string) => {
    const next = value.slice(0, 128);
    setDiscordIdleMessageState(next);
    writeStorage('discordIdleMessage', next);
  };

  const addHomeApp = async (input: Partial<HomeApp> = {}) => {
    const folderPath = input.folderPath || await window.agentWorkspace?.selectProjectFolder();
    if (!folderPath) return;
    const latestReleasePath = input.latestReleasePath || '';
    const installerPath = input.installerPath || '';
    const programPath = input.programPath || '';
    const fallbackName =
      folderPath.split(/[\\/]/).filter(Boolean).at(-1) ||
      'Projekt';
    const promptedName = input.name?.trim() || window.prompt('Projektname:', fallbackName)?.trim();
    if (!promptedName) return;
    const promptedDescription = input.description?.trim() || window.prompt('Beschreibung:', '')?.trim() || '';
    const runTarget = input.runTarget || 'latest';
    const hasRunFile = Boolean(latestReleasePath || installerPath || programPath);
    const executablePath = hasRunFile
      ? resolveHomeAppRunPath({ latestReleasePath, installerPath, programPath, runTarget, path: folderPath, name: input.name || '' } as HomeApp)
      : '';
    const homeApp: HomeApp = {
      id: newId(),
      name: promptedName,
      description: promptedDescription,
      path: executablePath || folderPath,
      executablePath,
      folderPath,
      latestReleasePath,
      installerPath,
      programPath,
      runTarget,
      tags: [],
      kind: 'native',
    };
    setHomeApps((current) => {
      if (current.some((item) => item.folderPath === folderPath && item.name === promptedName)) return current;
      return [homeApp, ...current].slice(0, 40);
    });
  };

  const updateHomeApp = (id: string, patch: Partial<HomeApp>) => {
    setHomeApps((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch, id, kind: 'native' as const, url: undefined };
        const hasRunFile = Boolean(
          next.latestReleasePath ||
            next.installerPath ||
            next.programPath ||
            (next.executablePath && next.executablePath !== next.folderPath),
        );
        const runPath = hasRunFile ? resolveHomeAppRunPath(next) : '';
        return {
          ...next,
          path: runPath || next.folderPath || next.path,
          executablePath: runPath,
          tags: [...new Set((patch.tags || item.tags || []).map((tag) => tag.trim()).filter(Boolean))],
        };
      }),
    );
  };

  const removeHomeApp = (id: string) => {
    setHomeApps((current) => current.filter((item) => item.id !== id));
    setHomeTabs((current) => current.filter((tab) => tab.appId !== id));
    if (activeHomeTab?.appId === id) {
      const next = homeTabs.find((tab) => tab.appId !== id);
      setActiveHomeTabId(next?.id || null);
    }
  };

  const launchHomeApp = async (app: HomeApp) => {
    const kind = 'native';
    const runPath = resolveHomeAppRunPath(app);
    if (!hasHomeAppRunFile(app)) {
      window.alert('Dieses Projekt hat noch keine ausfuehrbare Datei. Fuege per Rechtsklick eine Latest Release, einen Installer oder ein Programm hinzu.');
      return;
    }
    const existing = homeTabs.find((tab) => tab.appId === app.id);
    if (existing) {
      const updatedTab = { ...existing, path: runPath, reloadKey: existing.reloadKey + 1 };
      setHomeTabs((current) => current.map((tab) => (tab.id === existing.id ? updatedTab : tab)));
      setActiveHomeTabId(existing.id);
    } else {
      const tab: HomeAppTab = {
        id: newId(),
        appId: app.id,
        name: app.name,
        path: runPath,
        kind,
        reloadKey: 0,
        openedAt: Date.now(),
      };
      setHomeTabs((current) => [...current, tab]);
      setActiveHomeTabId(tab.id);
    }
    setMainView('chat');
    setSelectedChatId(null);
  };

  const addLibraryProject = async () => {
    const selectedPath = await window.agentWorkspace?.selectProjectFolder();
    if (!selectedPath) return;
    const existing = libraryProjects.find((folder) => folder.path === selectedPath);
    if (existing) return;
    const folder = { id: newId(), title: projectName(selectedPath), path: selectedPath };
    setLibraryProjects((current) => [...current, folder]);
  };

  const createLibraryNewProject = async () => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    const name = window.prompt('Name fuer das neue Projekt:', 'Neues Projekt')?.trim();
    if (!name) return;
    const selectedPath = await window.agentWorkspace.createProjectFolder(name);
    if (!selectedPath) return;
    const existing = libraryProjects.find((folder) => folder.path === selectedPath);
    if (existing) return;
    const folder = { id: newId(), title: projectName(selectedPath), path: selectedPath };
    setLibraryProjects((current) => [...current, folder]);
  };

  const saveLibraryProject = async (input: Partial<ProjectFolder> & { title: string }) => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    const title = input.title.trim();
    if (!title) return null;
    const selectedPath = input.path || await window.agentWorkspace.createProjectFolder(title);
    if (!selectedPath) return null;
    const icon = input.icon?.trim().slice(0, 8) || undefined;

    if (input.id) {
      const updated = { id: input.id, title, path: selectedPath, icon };
      setLibraryProjects((current) => current.map((folder) => (folder.id === input.id ? updated : folder)));
      return updated;
    }

    const existing = libraryProjects.find((folder) => folder.path === selectedPath);
    if (existing) {
      const updated = { ...existing, title, icon };
      setLibraryProjects((current) => current.map((folder) => (folder.id === existing.id ? updated : folder)));
      return updated;
    }

    const folder = { id: newId(), title, path: selectedPath, icon };
    setLibraryProjects((current) => [...current, folder]);
    return folder;
  };

  const deleteLibraryProject = (id: string) => {
    setLibraryProjects((current) => current.filter((folder) => folder.id !== id));
  };

  const addLibraryApp = async (input: Partial<HomeApp> = {}) => {
    const folderPath = input.folderPath || await window.agentWorkspace?.selectProjectFolder();
    if (!folderPath) return;
    const latestReleasePath = input.latestReleasePath || '';
    const installerPath = input.installerPath || '';
    const programPath = input.programPath || '';
    const fallbackName =
      folderPath.split(/[\\/]/).filter(Boolean).at(-1) ||
      'Projekt';
    const promptedName = input.name?.trim() || window.prompt('Projektname:', fallbackName)?.trim();
    if (!promptedName) return;
    const promptedDescription = input.description?.trim() || window.prompt('Beschreibung:', '')?.trim() || '';
    const runTarget = input.runTarget || 'latest';
    const hasRunFile = Boolean(latestReleasePath || installerPath || programPath);
    const executablePath = hasRunFile
      ? resolveHomeAppRunPath({ latestReleasePath, installerPath, programPath, runTarget, path: folderPath, name: input.name || '' } as HomeApp)
      : '';
    const homeApp: HomeApp = {
      id: newId(),
      name: promptedName,
      description: promptedDescription,
      path: executablePath || folderPath,
      executablePath,
      folderPath,
      latestReleasePath,
      installerPath,
      programPath,
      runTarget,
      tags: [],
      kind: 'native',
    };
    setLibraryApps((current) => {
      if (current.some((item) => item.folderPath === folderPath && item.name === promptedName)) return current;
      return [homeApp, ...current].slice(0, 40);
    });
  };

  const updateLibraryApp = (id: string, patch: Partial<HomeApp>) => {
    setLibraryApps((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch, id, kind: 'native' as const, url: undefined };
        const hasRunFile = Boolean(
          next.latestReleasePath ||
            next.installerPath ||
            next.programPath ||
            (next.executablePath && next.executablePath !== next.folderPath),
        );
        const runPath = hasRunFile ? resolveHomeAppRunPath(next) : '';
        return {
          ...next,
          path: runPath || next.folderPath || next.path,
          executablePath: runPath,
          tags: [...new Set((patch.tags || item.tags || []).map((tag) => tag.trim()).filter(Boolean))],
        };
      }),
    );
  };

  const removeLibraryApp = (id: string) => {
    setLibraryApps((current) => current.filter((item) => item.id !== id));
  };

  const launchLibraryApp = async (app: HomeApp) => {
    const runPath = resolveHomeAppRunPath(app);
    if (!hasHomeAppRunFile(app)) {
      window.alert('Dieses Projekt hat noch keine ausfuehrbare Datei. Fuege per Rechtsklick eine Latest Release, einen Installer oder ein Programm hinzu.');
      return;
    }
    await window.agentWorkspace?.launchApplication(runPath);
  };

  const createLibraryTag = (name: string) => {
    const tag = name.trim();
    if (!tag) return;
    setLibraryTags((current) => [...new Set([tag, ...current])].slice(0, 80));
  };

  const deleteLibraryTag = (name: string) => {
    const tag = name.trim();
    setLibraryTags((current) => current.filter((item) => item !== tag));
    setHomeApps((current) =>
      current.map((app) => ({ ...app, tags: (app.tags || []).filter((item) => item !== tag) })),
    );
    setLibraryApps((current) =>
      current.map((app) => ({ ...app, tags: (app.tags || []).filter((item) => item !== tag) })),
    );
  };

  const setLibraryBannerBackgroundEnabled = (value: boolean) => {
    setLibraryBannerBackgroundEnabledState(value);
    writeStorage('libraryBannerBackgroundEnabled', value);
  };

  const selectHomeTab = (id: string) => {
    setActiveHomeTabId(id);
    setMainView('chat');
    setSelectedChatId(null);
  };

  const closeHomeTab = (id = activeHomeTabId || '') => {
    if (!id) return;
    setHomeTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      const next = current.filter((tab) => tab.id !== id);
      if (activeHomeTabId === id) {
        const nextActive = next[Math.max(0, index - 1)] || next[0] || null;
        setActiveHomeTabId(nextActive?.id || null);
      }
      return next;
    });
  };

  const updateHomeTabUrl = (id: string, url: string) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    setHomeTabs((current) =>
      current.map((tab) => (tab.id === id ? { ...tab, currentUrl: url } : tab)),
    );
  };

  const reloadHomeTab = (id = activeHomeTabId || '') => {
    if (!id) return;
    setHomeTabs((current) =>
      current.map((tab) => (tab.id === id ? { ...tab, reloadKey: tab.reloadKey + 1 } : tab)),
    );
  };

  const launchSpotifyStart = async () => {
    await window.agentWorkspace?.launchSpotify(spotifyStartUri.trim() || 'spotify:');
  };

  const setHasSetupCompleted = (value: boolean) => {
    setHasSetupCompletedState(value);
    writeStorage('setup', value);
  };

  const selectChat = (id: string | null) => {
    setSelectedChatId(id);
    setActiveHomeTabId(null);
    setMainView('chat');
    if (!historyNavigation.current) {
      setHistory((current) => [...current.slice(0, historyIndex + 1), id]);
      setHistoryIndex((index) => index + 1);
    }
    historyNavigation.current = false;
    const chat = chats.find((item) => item.id === id);
    if (chat) setSelectedFolderId(chat.folderId);
  };

  const selectFolder = (id: string) => {
    setSelectedFolderId(id);
    setSelectedChatId(null);
    setActiveHomeTabId(null);
    setMainView('chat');
  };

  const addProject = async () => {
    const selectedPath = await window.agentWorkspace?.selectProjectFolder();
    if (!selectedPath) return;
    const existing = folders.find((folder) => folder.path === selectedPath);
    if (existing) {
      selectFolder(existing.id);
      return;
    }
    const folder = { id: newId(), title: projectName(selectedPath), path: selectedPath };
    setFolders((current) => [...current, folder]);
    setSelectedFolderId(folder.id);
    setSelectedChatId(null);
  };

  const saveProject = async (input: Partial<ProjectFolder> & { title: string }) => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    const title = input.title.trim();
    if (!title) return null;
    const selectedPath = input.path || await window.agentWorkspace.createProjectFolder(title);
    if (!selectedPath) return null;
    const icon = input.icon?.trim().slice(0, 8) || undefined;

    if (input.id) {
      const updated = { id: input.id, title, path: selectedPath, icon, isScratch: input.isScratch };
      setFolders((current) => current.map((folder) => (folder.id === input.id ? updated : folder)));
      setSelectedFolderId(input.id);
      setSelectedChatId(null);
      return updated;
    }

    const existing = folders.find((folder) => folder.path === selectedPath);
    if (existing) {
      const updated = { ...existing, title, icon };
      setFolders((current) => current.map((folder) => (folder.id === existing.id ? updated : folder)));
      setSelectedFolderId(existing.id);
      setSelectedChatId(null);
      return updated;
    }

    const folder = { id: newId(), title, path: selectedPath, icon };
    setFolders((current) => [...current.filter((item) => item.id !== SCRATCH_PROJECT_ID), folder]);
    setSelectedFolderId(folder.id);
    setSelectedChatId(null);
    return folder;
  };

  const createNewProject = async () => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    const name = window.prompt('Name fuer das neue Projekt:', 'Neues Projekt')?.trim();
    if (!name) return;
    const selectedPath = await window.agentWorkspace.createProjectFolder(name);
    if (!selectedPath) return;
    const existing = folders.find((folder) => folder.path === selectedPath);
    if (existing) {
      selectFolder(existing.id);
      return;
    }
    const folder = { id: newId(), title: projectName(selectedPath), path: selectedPath };
    setFolders((current) => [...current.filter((item) => item.id !== SCRATCH_PROJECT_ID), folder]);
    setSelectedFolderId(folder.id);
    setSelectedChatId(null);
  };

  const ensureRunnableProject = async (): Promise<ProjectFolder> => {
    if (selectedProject) return selectedProject;
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    const scratchPath = await window.agentWorkspace.getScratchProjectFolder();
    const scratch = {
      id: SCRATCH_PROJECT_ID,
      title: 'Ohne Projekt',
      path: scratchPath,
      isScratch: true,
    };
    setFolders((current) => {
      const existing = current.find((item) => item.id === SCRATCH_PROJECT_ID);
      if (existing) return current.map((item) => (item.id === SCRATCH_PROJECT_ID ? { ...existing, path: scratchPath } : item));
      return [scratch, ...current];
    });
    setSelectedFolderId(SCRATCH_PROJECT_ID);
    return scratch;
  };

  const renameProject = (id: string, title: string) => {
    setFolders((current) =>
      current.map((folder) => (folder.id === id ? { ...folder, title } : folder)),
    );
  };

  const updateProjectIcon = (id: string, icon: string) => {
    setFolders((current) =>
      current.map((folder) => (folder.id === id ? { ...folder, icon: icon.trim().slice(0, 8) } : folder)),
    );
  };

  const deleteProject = (id: string) => {
    setFolders((current) => current.filter((folder) => folder.id !== id));
    setChats((current) => current.filter((chat) => chat.folderId !== id));
    if (selectedFolderId === id) {
      const next = folders.find((folder) => folder.id !== id);
      setSelectedFolderId(next?.id || null);
      setSelectedChatId(null);
    }
  };

  const setLyzDevPluginEnabled = (value: boolean) => {
    setLyzDevPluginEnabledState(value);
    writeStorage('lyzDevPluginEnabled', value);
  };

  const startLyzDevChat = async () => {
    const projectForRun = await ensureRunnableProject();
    const unityServer = await requireUnityMcpConnection();
    const chat: Chat = {
      id: newId(),
      title: LYZ_DEV_CHAT_TITLE,
      updatedAt: Date.now(),
      folderId: projectForRun.id,
      mode: 'lyz-dev',
      pluginName: LYZ_DEV_PLUGIN_NAME,
      requiredMcpServer: {
        id: unityServer.id,
        name: unityServer.name,
        source: unityServer.source,
      },
      messages: [
        {
          id: newId(),
          text: `Lyz Dev ist bereit. Unity-MCP erkannt: ${unityServer.name} (${unityServer.source}).`,
          sender: 'system',
          timestamp: Date.now(),
        },
      ],
    };
    setLyzDevPluginEnabled(true);
    setChats((current) => [chat, ...current]);
    selectChat(chat.id);
  };

  const startTerminalChat = async () => {
    const projectForRun = await ensureRunnableProject();
    const chat: Chat = {
      id: newId(),
      title: 'Terminal Chat',
      updatedAt: Date.now(),
      folderId: projectForRun.id,
      mode: 'terminal',
      messages: [
        {
          id: newId(),
          text: 'Terminal-Sitzung gestartet. Gib Befehle oder Prompts ein, die vom Agenten ausgeführt werden sollen.',
          sender: 'system',
          timestamp: Date.now(),
        },
      ],
    };
    setChats((current) => [chat, ...current]);
    selectChat(chat.id);
  };

  const startUnrealTerminalChat = async () => {
    const projectForRun = await ensureRunnableProject();
    const chat: Chat = {
      id: newId(),
      title: 'Unreal MCP Terminal',
      updatedAt: Date.now(),
      folderId: projectForRun.id,
      mode: 'terminal',
      isUnreal: true,
      messages: [
        {
          id: newId(),
          text: 'Unreal Engine MCP Terminal-Sitzung gestartet. Gib deine Prompts ein.',
          sender: 'system',
          timestamp: Date.now(),
        },
      ],
    };
    setChats((current) => [chat, ...current]);
    selectChat(chat.id);
  };

  const sendMessage = async (
    text: string,
    forceNewChat = false,
    onTargetId?: (chatId: string) => void,
    overrides?: { provider?: ProviderId; model?: string },
  ) => {
    const isMobile = mobileMode && mobileConnectionConfig?.connected;
    if (!window.agentWorkspace && !isMobile) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    const projectForRun = await ensureRunnableProject();
    const tokenFreeTest = text.trim().toLowerCase() === 'test';
    const runProvider = overrides?.provider || provider;
    const runModel = overrides?.model || (overrides?.provider ? DEFAULT_MODEL[overrides.provider] : aiModel);

    const targetId = !forceNewChat && selectedChatId ? selectedChatId : newId();
    if (activeRuns[targetId]) return;
    onTargetId?.(targetId);
    const existingChat = chats.find((chat) => chat.id === targetId);
    const shouldUseLyzDev = existingChat?.mode === 'lyz-dev' || (!existingChat && lyzDevPluginEnabled);
    const unityServer = shouldUseLyzDev ? await requireUnityMcpConnection() : null;
    const userMessage: Message = {
      id: newId(),
      text,
      sender: 'user',
      timestamp: Date.now(),
    };
    const nextChat: Chat =
      existingChat || {
        id: targetId,
        title: shouldUseLyzDev ? LYZ_DEV_CHAT_TITLE : text.length > 42 ? `${text.slice(0, 42)}...` : text,
        updatedAt: Date.now(),
        folderId: projectForRun.id,
        mode: shouldUseLyzDev ? 'lyz-dev' : 'standard',
        pluginName: shouldUseLyzDev ? LYZ_DEV_PLUGIN_NAME : undefined,
        requiredMcpServer: unityServer
          ? {
              id: unityServer.id,
              name: unityServer.name,
              source: unityServer.source,
            }
          : undefined,
        messages: [],
      };
    const updatedChat = {
      ...nextChat,
      updatedAt: Date.now(),
      messages: [...nextChat.messages, userMessage],
    };

    setChats((current) => [
      updatedChat,
      ...current.filter((chat) => chat.id !== targetId),
    ]);
    if (forceNewChat || !selectedChatId) selectChat(targetId);

    // Standard chats run via terminal principle (interactively), so skip background run
    if (!shouldUseLyzDev && !tokenFreeTest) {
      if (runProvider === 'antigravity') {
        const runId = newId();
        const runStartedAt = Date.now();
        setActiveRuns((current) => ({
          ...current,
          [targetId]: {
            runId,
            provider: 'antigravity',
            model: runModel,
            startedAt: runStartedAt,
            outputLines: 0,
            outputBytes: 0,
            codeSignals: 0,
            testSignals: 0,
            files: [],
            lastOutput: 'Hintergrund-Terminal wird gestartet...',
            liveOutput: '',
            phase: 'Startet Antigravity',
          },
        }));

        const cleanShellOutput = (raw: string, userPrompt: string) => {
          let text = raw.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
          text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          const lines = text.split('\n');
          if (lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            if (/(?:[A-Za-z]:\\[^>]*>|PS\s+[A-Za-z]:\\[^>]*>|[\w.-]+@[\w.-]+:.*\$\s*|[\w.-]+@[\w.-]+:.*#\s*|agy\s*>|antigravity\s*>)\s*$/.test(lastLine)) {
              lines.pop();
            }
          }
          const cleanedText = lines.join('\n').trim();
          const promptIndex = cleanedText.indexOf(userPrompt);
          if (promptIndex !== -1) {
            return cleanedText.substring(promptIndex + userPrompt.length).trim();
          }
          return cleanedText;
        };

        const handleCompletion = (chatId: string) => {
          const session = activeShellSessions.current[chatId];
          if (!session) return;
          
          setActiveRuns((current) => {
            const run = current[chatId];
            if (!run) return current;
            
            const rawText = session.accumulatedOutput;
            const cleanText = cleanShellOutput(rawText, session.lastPrompt);
            
            const reply: Message = {
              id: newId(),
              text: cleanText || 'Aufgabe beendet.',
              sender: 'ai',
              timestamp: Date.now(),
            };
            
            setChats((prevChats) =>
              prevChats.map((chat) =>
                chat.id === chatId
                  ? { ...chat, updatedAt: Date.now(), messages: [...chat.messages, reply] }
                  : chat,
              ),
            );
            
            const { [chatId]: _done, ...rest } = current;
            return rest;
          });
          
          session.promptWritten = false;
        };

        const existingSession = activeShellSessions.current[targetId];
        if (existingSession) {
          existingSession.accumulatedOutput = '';
          existingSession.lastPrompt = text;
          existingSession.promptWritten = true;
          
          const finalPrompt = (agyPrefix || '') + text + (agySuffix || '') + '\r';
          window.agentWorkspace.writeToShellSession({ chatId: targetId, text: finalPrompt });
        } else {
          const unsubscribe = window.agentWorkspace.onShellOutput(targetId, (payload: any) => {
            const session = activeShellSessions.current[targetId];
            if (!session) return;
            
            if (payload.type === 'stdout' || payload.type === 'stderr') {
              session.accumulatedOutput += payload.text;
              
              setActiveRuns((current) => {
                const run = current[targetId];
                if (!run) return current;
                return {
                  ...current,
                  [targetId]: {
                    ...run,
                    liveOutput: `${run.liveOutput}${payload.text}`,
                    lastOutput: payload.text.trim() || run.lastOutput,
                  },
                };
              });
              
              if (session.promptWritten) {
                const cleaned = payload.text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
                const isSessionDone = /(?:[A-Za-z]:\\[^>]*>|PS\s+[A-Za-z]:\\[^>]*>|[\w.-]+@[\w.-]+:.*\$\s*|[\w.-]+@[\w.-]+:.*#\s*|agy\s*>|antigravity\s*>)\s*$/.test(cleaned.trim());
                if (isSessionDone) {
                  handleCompletion(targetId);
                }
              }
            } else if (payload.type === 'exit') {
              handleCompletion(targetId);
            }
          });
          
          activeShellSessions.current[targetId] = {
            unsubscribe,
            accumulatedOutput: '',
            lastPrompt: text,
            promptWritten: false,
          };
          
          window.agentWorkspace.createShellSession({ chatId: targetId, cwd: projectForRun.path, shellType: 'cmd' }).then(() => {
            setTimeout(() => {
              const startCmd = nextChat.isUnreal ? 'start /B npx -y @runreal/unreal-mcp & agy' : agyStartCommand;
              window.agentWorkspace.writeToShellSession({ chatId: targetId, text: startCmd + '\r' });
              setTimeout(() => {
                const session = activeShellSessions.current[targetId];
                if (session) {
                  session.promptWritten = true;
                }
                const finalPrompt = (agyPrefix || '') + text + (agySuffix || '') + '\r';
                window.agentWorkspace.writeToShellSession({ chatId: targetId, text: finalPrompt });
              }, agyWaitTimeMs);
            }, 1000);
          });
        }
        return;
      }
      return;
    }

    const runId = newId();
    const runStartedAt = Date.now();
    setActiveRuns((current) => ({
      ...current,
      [targetId]: {
        runId,
        provider: runProvider,
        model: tokenFreeTest ? 'lokaler Test' : runModel,
        startedAt: runStartedAt,
        outputLines: 0,
        outputBytes: 0,
        codeSignals: 0,
        testSignals: 0,
        files: [],
        lastOutput: tokenFreeTest
          ? 'Lokaler Test wird gestartet...'
          : shouldUseLyzDev
            ? 'Lyz Dev prueft Unity-MCP und startet...'
            : 'Agent wird gestartet...',
        liveOutput: '',
        phase: tokenFreeTest ? 'Fuehrt lokalen Test aus' : shouldUseLyzDev ? 'Startet Lyz Dev' : 'Startet Agent',
      },
    }));

    const agentPrompt = buildAgentPrompt(updatedChat, text);
    const prompt = withResponseStylePrompt(
      shouldUseLyzDev && unityServer ? buildLyzDevPrompt(agentPrompt, unityServer) : agentPrompt,
      responseDisplayMode,
    );

    try {
      const result = tokenFreeTest
        ? {
            ok: true,
            output: buildLocalFormattingTestOutput(projectForRun.path),
            error: '',
            exitCode: 0,
          }
        : isMobile && mobileConnectionConfig?.type === 'vps'
        ? await callMobileVpsApi(mobileConnectionConfig, {
            provider: runProvider,
            model: runModel,
            reasoningEffort,
            access: accessMode,
            systemPrompt: shouldUseLyzDev ? `${systemPrompt}\n\n${LYZ_DEV_SYSTEM_PROMPT}` : systemPrompt,
            prompt,
            projectPath: mobileConnectionConfig.vpsProjectPath || projectForRun.path,
          })
        : await window.agentWorkspace.runAgent({
            runId,
            provider: runProvider,
            model: runModel,
            reasoningEffort,
            access: accessMode,
            apiKeys,
            systemPrompt: shouldUseLyzDev ? `${systemPrompt}\n\n${LYZ_DEV_SYSTEM_PROMPT}` : systemPrompt,
            prompt,
            projectPath: projectForRun.path,
            attachments,
            externalServer: externalServer.enabled ? externalServer : isMobile && mobileConnectionConfig?.type === 'ssh'
              ? {
                  enabled: true,
                  host: mobileConnectionConfig.sshHost || '',
                  user: mobileConnectionConfig.sshUser || 'root',
                  port: mobileConnectionConfig.sshPort || 22,
                  remoteProjectPath: mobileConnectionConfig.sshProjectPath || '~/codeforge-project',
                  identityFile: mobileConnectionConfig.sshKey || undefined,
                  acceptNewHostKey: true,
                }
              : undefined,
            originalPluginEnabled,
          });
      const tokenUsage = parseTokenUsage(result.output || result.error || '');
      const durationMs = Date.now() - runStartedAt;
      const cleanedOutput = cleanAgentFinalOutput(result.output || '', runProvider);
      const cleanedError = cleanAgentFinalOutput(result.error || '', runProvider);
      const reply: Message = {
        id: newId(),
        text: result.ok
          ? cleanedOutput || 'Der Agent wurde beendet, hat aber keine verwertbare finale Antwort geliefert. Bitte pruefe die Raw-Terminal-Ausgabe.'
          : cleanedError || cleanedOutput || 'Der Agent-Aufruf ist fehlgeschlagen.',
        sender: 'ai',
        timestamp: Date.now(),
        runDurationMs: durationMs,
        tokenUsage: tokenUsage || undefined,
        isError: !result.ok,
      };
      void window.agentWorkspace.notifyAgentComplete({
        title: result.ok ? 'CodeForge: Aufgabe erledigt' : 'CodeForge: Aufgabe fehlgeschlagen',
        body: `${updatedChat.title} - ${formatDurationForNotification(durationMs)}`,
      });
      if (tokenUsage > 0) {
        const record: UsageRecord = {
          id: newId(),
          provider: runProvider,
          model: runModel,
          tokens: tokenUsage,
          timestamp: Date.now(),
          chatId: targetId,
          title: updatedChat.title,
        };
        setUsage((current) => ({
          ...current,
          totalTokens: current.totalTokens + tokenUsage,
          records: [record, ...current.records].slice(0, 250),
        }));
      }
      if (!tokenFreeTest) void refreshProviderUsage(runProvider);
      setChats((current) =>
        current.map((chat) =>
          chat.id === targetId
            ? { ...chat, updatedAt: Date.now(), messages: [...chat.messages, reply] }
            : chat,
        ),
      );
      setAttachments([]);
    } catch (error) {
      const reply: Message = {
        id: newId(),
        text: error instanceof Error ? error.message : 'Unbekannter Fehler beim Agent-Aufruf.',
        sender: 'system',
        timestamp: Date.now(),
        isError: true,
      };
      void window.agentWorkspace.notifyAgentComplete({
        title: 'CodeForge: Aufgabe fehlgeschlagen',
        body: error instanceof Error ? error.message : 'Unbekannter Fehler beim Agent-Aufruf.',
      });
      setChats((current) =>
        current.map((chat) =>
          chat.id === targetId ? { ...chat, messages: [...chat.messages, reply] } : chat,
        ),
      );
    } finally {
      setActiveRuns((current) => {
        const { [targetId]: _done, ...rest } = current;
        return rest;
      });
    }
  };

  const startAntigravityLimit = async (model: string) => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    const targetModel = PROVIDER_MODELS.antigravity.some((item) => item.id === model) ? model : DEFAULT_MODEL.antigravity;
    const projectForRun = await ensureRunnableProject();
    const prompt = 'Sag nur "OK".';
    const targetId = newId();
    const runId = newId();
    const runStartedAt = Date.now();
    const userMessage: Message = {
      id: newId(),
      text: prompt,
      sender: 'user',
      timestamp: Date.now(),
    };
    const chat: Chat = {
      id: targetId,
      title: 'Limit starten',
      updatedAt: Date.now(),
      folderId: projectForRun.id,
      mode: 'standard',
      messages: [userMessage],
    };

    setProviderState('antigravity');
    setAiModelState(targetModel);
    writeStorage('provider', 'antigravity');
    writeStorage('model', targetModel);
    setChats((current) => [chat, ...current.filter((item) => item.id !== targetId)]);
    selectChat(targetId);
    setActiveRuns((current) => ({
      ...current,
      [targetId]: {
        runId,
        provider: 'antigravity',
        model: targetModel,
        startedAt: runStartedAt,
        outputLines: 0,
        outputBytes: 0,
        codeSignals: 0,
        testSignals: 0,
        files: [],
        lastOutput: 'Limit-Start wird geprueft...',
        liveOutput: '',
        phase: 'Startet Antigravity',
      },
    }));

    try {
      const result = await window.agentWorkspace.runAgent({
        runId,
        provider: 'antigravity',
        model: targetModel,
        reasoningEffort,
        access: 'read-only',
        apiKeys,
        systemPrompt: '',
        prompt,
        projectPath: projectForRun.path,
        attachments: [],
        externalServer: externalServer.enabled ? externalServer : undefined,
      });
      const durationMs = Date.now() - runStartedAt;
      const text = result.ok ? result.output || 'OK' : result.error || result.output || 'Antigravity-Aufruf fehlgeschlagen.';
      const ok = /^"?OK"?[.!]?$/i.test(text.trim());
      const reply: Message = {
        id: newId(),
        text,
        sender: 'ai',
        timestamp: Date.now(),
        runDurationMs: durationMs,
        isError: !result.ok,
      };
      setChats((current) =>
        current.map((item) =>
          item.id === targetId
            ? { ...item, updatedAt: Date.now(), messages: [...item.messages, reply] }
            : item,
        ),
      );
      void refreshAntigravityTerminalUsage();
      return ok;
    } finally {
      setActiveRuns((current) => {
        const { [targetId]: _done, ...rest } = current;
        return rest;
      });
    }
  };

  const importAntigravityChats = async () => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    const projectForImport = await ensureRunnableProject();
    const imported = await window.agentWorkspace.importAntigravityChats(projectForImport.path);
    if (imported.length === 0) return 0;
    const mappedChats: Chat[] = imported.map((item: ImportedAntigravityChat) => ({
      id: `antigravity-${item.conversationId}`,
      title: item.title || 'Antigravity Chat',
      updatedAt: item.updatedAt || Date.now(),
      folderId: projectForImport.id,
      mode: 'standard',
      messages: item.messages.map((message) => ({
        id: newId(),
        text: message.text,
        sender: message.sender,
        timestamp: message.timestamp || Date.now(),
      })),
    }));
    setChats((current) => {
      const importedIds = new Set(mappedChats.map((chat) => chat.id));
      return [...mappedChats, ...current.filter((chat) => !importedIds.has(chat.id))].slice(0, 250);
    });
    selectChat(mappedChats[0].id);
    return mappedChats.length;
  };

  const cancelRun = async () => {
    if (!selectedChatId) return;
    const session = activeShellSessions.current[selectedChatId];
    if (session) {
      session.unsubscribe();
      await window.agentWorkspace?.killShellSession(selectedChatId);
      delete activeShellSessions.current[selectedChatId];
      setActiveRuns((current) => {
        const { [selectedChatId]: _done, ...rest } = current;
        return rest;
      });
      return;
    }
    if (!activeRunId) return;
    await window.agentWorkspace?.cancelAgent(activeRunId);
  };

  const sendEscKey = async () => {
    if (!selectedChatId) return;
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat) return;

    if (chat.mode === 'terminal') {
      const tabId = chat.activeTerminalTabId || chat.id;
      if (window.agentWorkspace?.writeToShellSession) {
        await window.agentWorkspace.writeToShellSession({ chatId: tabId, text: '\x1b' });
      }
    } else {
      const run = activeRuns[selectedChatId];
      const runId = run?.runId;
      if (runId && window.agentWorkspace?.writeAgentInput) {
        await window.agentWorkspace.writeAgentInput(runId, '\x1b');
      }
    }
  };

  const addAttachments = async () => {
    const files = (await window.agentWorkspace?.selectAttachments()) || [];
    setAttachments((current) => [...new Set([...current, ...files])]);
  };

  const switchBranch = async (branch: string) => {
    if (!selectedProject || !window.agentWorkspace) return;
    const result = await window.agentWorkspace.switchBranch(selectedProject.path, branch);
    if (!result.ok) throw new Error(result.error);
    await refreshGit();
  };

  const installPlugin = async (name: string) => {
    if (!selectedProject || !window.agentWorkspace) throw new Error('Waehle zuerst ein Projekt.');
    await window.agentWorkspace.installPlugin(selectedProject.path, name);
    setPlugins((current) => [...new Set([...current, name])]);
  };

  const setOriginalPluginEnabled = (value: boolean) => {
    setOriginalPluginEnabledState(value);
    writeStorage('originalPluginEnabled', value);
  };

  const sendAgentInput = async (text: string) => {
    if (!activeRunId || !window.agentWorkspace?.writeAgentInput) return false;
    const ok = await window.agentWorkspace.writeAgentInput(activeRunId, text);
    if (ok) {
      setActiveRuns((current) => {
        if (!selectedChatId) return current;
        const run = current[selectedChatId];
        if (!run) return current;
        return {
          ...current,
          [selectedChatId]: {
            ...run,
            liveOutput: `${run.liveOutput}${text}\n`,
          },
        };
      });
      return true;
    }
    return false;
  };

  const removePlugin = async (name: string) => {
    if (!selectedProject || !window.agentWorkspace) return;
    await window.agentWorkspace.removePlugin(selectedProject.path, name);
    setPlugins((current) => current.filter((plugin) => plugin !== name));
  };

  const installCodexPlugin = async (target: 'personal' | 'project') => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    if (target === 'project' && !selectedProject) throw new Error('Waehle zuerst ein Projekt.');
    const sourcePath = await window.agentWorkspace.selectCodexPluginFolder();
    if (!sourcePath) return;
    await window.agentWorkspace.installCodexPluginFromFolder({
      sourcePath,
      target,
      projectPath: selectedProject?.path,
    });
    await refreshCodexPlugins();
  };

  const removeCodexPlugin = async (plugin: CodexPluginInfo) => {
    if (!window.agentWorkspace) throw new Error('Diese Funktion ist nur in der Desktop-App verfuegbar.');
    await window.agentWorkspace.removeCodexPlugin(plugin.path, selectedProject?.path);
    await refreshCodexPlugins();
  };

  const addAutomation = (input: Omit<Automation, 'id' | 'lastRun'>) => {
    setAutomations((current) => [...current, { ...input, id: newId() }]);
  };
  const toggleAutomation = (id: string) => {
    setAutomations((current) =>
      current.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)),
    );
  };
  const deleteAutomation = (id: string) => {
    setAutomations((current) => current.filter((item) => item.id !== id));
  };
  const runAutomation = async (id: string) => {
    const automation = automations.find((item) => item.id === id);
    if (!automation) return;
    setMainView('chat');
    await sendMessage(`[Automatisierung: ${automation.title}]\n${automation.prompt}`, true);
    setAutomations((current) =>
      current.map((item) => (item.id === id ? { ...item, lastRun: Date.now() } : item)),
    );
  };

  const navigateBack = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    historyNavigation.current = true;
    setHistoryIndex(nextIndex);
    setSelectedChatId(history[nextIndex]);
  };
  const navigateForward = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    historyNavigation.current = true;
    setHistoryIndex(nextIndex);
    setSelectedChatId(history[nextIndex]);
  };

  const clearChat = () => {
    if (!selectedChatId) return;
    const session = activeShellSessions.current[selectedChatId];
    if (session) {
      session.unsubscribe();
      window.agentWorkspace?.killShellSession(selectedChatId);
      delete activeShellSessions.current[selectedChatId];
    }
    setChats((current) => current.filter((chat) => chat.id !== selectedChatId));
    selectChat(null);
  };

  const value = useMemo<AppContextType>(
    () => ({
      folders,
      libraryProjects,
      chats,
      setChats,
      automations,
      homeApps,
      libraryApps,
      libraryTags,
      libraryBannerBackgroundEnabled,
      homeTabs,
      activeHomeTabId,
      activeHomeTab,
      plugins,
      codexPlugins,
      lyzDevPluginEnabled,
      originalPluginEnabled,
      usage,
      selectedChatId,
      selectedFolderId,
      selectedProject,
      provider,
      aiModel,
      reasoningEffort,
      accessMode,
      apiKeys,
      externalServer,
      systemPrompt,
      theme,
      themeByProvider,
      customThemes,
      themeBackgroundBehindComposer,
      sidebarTransparency,
      surfaceTransparency,
      terminalTransparency,
      wallpaperMode,
      workDisplayMode,
      responseDisplayMode,
      mobileMode,
      mobileConnectionConfig,
      setMobileConnectionConfig,
      devicePopupEnabled,
      spotifyStartUri,
      spotifyWidgetEnabled,
      discordIdleMessage,
      terminalStartPath,
      setTerminalStartPath,
      terminalStartCommandEnabled,
      setTerminalStartCommandEnabled,
      terminalStartCommand,
      setTerminalStartCommand,
      terminalPrefixSuffixEnabled,
      setTerminalPrefixSuffixEnabled,
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
      mainView,
      hasSetupCompleted,
      isSending,
      isAnySending,
      activeRunId,
      runStats,
      activeRuns,
      attachments,
      cliStatus,
      gitInfo,
      branches,
      canGoBack: historyIndex > 0,
      canGoForward: historyIndex < history.length - 1,
      syncServerUrl,
      startSyncServer,
      setProvider,
      setAiModel,
      setReasoningEffort,
      setAccessMode,
      setTokenLimit,
      resetUsage,
      setApiKey,
      setExternalServer,
      testExternalServer,
      setSystemPrompt,
      useRecommendedSystemPrompt,
      generateSystemPrompt,
      setTheme,
      createCustomTheme,
      updateCustomTheme,
      deleteCustomTheme,
      glassBlurStrength,
      glassSaturation,
      appBorderRadius,
      glassThemeGlow,
      setGlassBlurStrength,
      setGlassSaturation,
      setAppBorderRadius,
      setGlassThemeGlow,
      openBrowserTab,
      selectThemeBackground,
      setThemeBackgroundBehindComposer,
      setSidebarTransparency,
      setSurfaceTransparency,
      setTerminalTransparency,
      setWallpaperMode,
      setWorkDisplayMode,
      setResponseDisplayMode,
      setMobileMode,
      setDevicePopupEnabled,
      setSpotifyStartUri,
      setSpotifyWidgetEnabled,
      setDiscordIdleMessage,
      addHomeApp,
      updateHomeApp,
      removeHomeApp,
      addLibraryProject,
      createLibraryNewProject,
      saveLibraryProject,
      deleteLibraryProject,
      addLibraryApp,
      updateLibraryApp,
      removeLibraryApp,
      createLibraryTag,
      deleteLibraryTag,
      setLibraryBannerBackgroundEnabled,
      launchHomeApp,
      launchLibraryApp,
      selectHomeTab,
      closeHomeTab,
      updateHomeTabUrl,
      reloadHomeTab,
      launchSpotifyStart,
      setMainView,
      setHasSetupCompleted,
      selectChat,
      selectFolder,
      addProject,
      saveProject,
      createNewProject,
      renameProject,
      updateProjectIcon,
      deleteProject,
      sendMessage,
      cancelRun,
      sendEscKey,
      addAttachments,
      removeAttachment: (file) =>
        setAttachments((current) => current.filter((item) => item !== file)),
      refreshCliStatus,
      installCli,
      refreshProviderUsage,
      refreshAntigravityTerminalUsage,
      startAntigravityLimit,
      importAntigravityChats,
      refreshGit,
      switchBranch,
      installPlugin,
      removePlugin,
      setLyzDevPluginEnabled,
      startLyzDevChat,
      startTerminalChat,
      startUnrealTerminalChat,
      setOriginalPluginEnabled,
      sendAgentInput,
      refreshCodexPlugins,
      installCodexPlugin,
      removeCodexPlugin,
      addAutomation,
      toggleAutomation,
      deleteAutomation,
      runAutomation,
      navigateBack,
      navigateForward,
      clearChat,
    }),
    [
      folders,
      libraryProjects,
      chats,
      setChats,
      automations,
      homeApps,
      libraryApps,
      libraryTags,
      libraryBannerBackgroundEnabled,
      homeTabs,
      activeHomeTabId,
      activeHomeTab,
      plugins,
      codexPlugins,
      lyzDevPluginEnabled,
      originalPluginEnabled,
      usage,
      selectedChatId,
      selectedFolderId,
      selectedProject,
      provider,
      aiModel,
      reasoningEffort,
      accessMode,
      apiKeys,
      externalServer,
      systemPrompt,
      theme,
      themeByProvider,
      customThemes,
      themeBackgroundBehindComposer,
      sidebarTransparency,
      surfaceTransparency,
      glassBlurStrength,
      glassSaturation,
      appBorderRadius,
      glassThemeGlow,
      wallpaperMode,
      workDisplayMode,
      responseDisplayMode,
      devicePopupEnabled,
      spotifyStartUri,
      spotifyWidgetEnabled,
      discordIdleMessage,
      terminalStartPath,
      terminalStartCommandEnabled,
      terminalStartCommand,
      terminalPrefixSuffixEnabled,
      terminalPrefix,
      terminalSuffix,
      terminalTriggerWords,
      agyStartCommand,
      agyWaitTimeMs,
      agyPrefix,
      agySuffix,
      mainView,
      hasSetupCompleted,
      isSending,
      isAnySending,
      activeRunId,
      runStats,
      activeRuns,
      attachments,
      cliStatus,
      gitInfo,
      branches,
      history,
      historyIndex,
      refreshCliStatus,
      installCli,
      refreshProviderUsage,
      refreshAntigravityTerminalUsage,
      refreshGit,
      refreshCodexPlugins,
      syncServerUrl,
      startLyzDevChat,
      startTerminalChat,
      startUnrealTerminalChat,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
