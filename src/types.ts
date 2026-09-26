export type ProviderId = 'antigravity' | 'openai' | 'anthropic' | 'cursor' | 'opencode' | 'freebuff';
export type AccessMode = 'read-only' | 'workspace-write' | 'full';
export type ReasoningEffort = 'low' | 'medium' | 'high';
export type WorkDisplayMode = 'codeforge' | 'raw-terminal' | 'compact' | 'timeline' | 'focus';
export type ResponseDisplayMode = 'bullets' | 'plain' | 'detailed' | 'checklist' | 'technical';
export type ApiKeys = Partial<Record<ProviderId, string>>;

export type ExternalServerConfig = {
  enabled: boolean;
  host: string;
  user: string;
  port: number;
  remoteProjectPath: string;
  identityFile?: string;
  acceptNewHostKey?: boolean;
};

export type UsageRecord = {
  id: string;
  provider: ProviderId;
  model: string;
  tokens: number;
  timestamp: number;
  chatId: string;
  title: string;
};

export type UsageState = {
  tokenLimit: number;
  totalTokens: number;
  records: UsageRecord[];
  providerLimits?: Partial<Record<ProviderId, ProviderUsageInfo>>;
};

export type ProviderUsageInfo = {
  provider: ProviderId;
  available: boolean;
  label: string;
  usedTokens?: number;
  limitTokens?: number;
  remainingTokens?: number;
  resetsAt?: string;
  quotaGroups?: ProviderQuotaGroup[];
  sourceCommand?: string;
  raw?: string;
  error?: string;
  checkedAt: number;
};

export type ImportedAntigravityChat = {
  conversationId: string;
  title: string;
  updatedAt: number;
  messages: {
    text: string;
    sender: 'user' | 'ai';
    timestamp: number;
  }[];
};

export type ProviderQuotaGroup = {
  name: string;
  models: string[];
  limits: ProviderQuotaLimit[];
};

export type ProviderQuotaLimit = {
  name: string;
  percent?: number;
  remainingPercent?: number;
  refreshesIn?: string;
  status?: string;
};

export type Message = {
  id: string;
  text: string;
  sender: 'user' | 'ai' | 'system';
  timestamp: number;
  isError?: boolean;
  runDurationMs?: number;
  tokenUsage?: number;
};

export type Chat = {
  id: string;
  title: string;
  updatedAt: number;
  folderId: string;
  messages: Message[];
  mode?: 'standard' | 'lyz-dev' | 'terminal' | 'api';
  pluginName?: string;
  requiredMcpServer?: {
    id: string;
    name: string;
    source: string;
  };
  terminalTabs?: { id: string; title: string; shellType?: 'powershell' | 'cmd' }[];
  activeTerminalTabId?: string;
  terminalLayout?: 'single' | 'grid';
  terminalGridSize?: number;
  harness?: { name: string; command: string; icon: string };
  api?: { providerId?: string; provider: ApiChatProvider; baseUrl: string; model: string };
};

export type CliHarness = {
  id: string;
  name: string;
  command: string;
  icon: string;
};

export type ProjectFolder = {
  id: string;
  title: string;
  path: string;
  icon?: string;
  isScratch?: boolean;
};

export type Automation = {
  id: string;
  title: string;
  prompt: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRun?: number;
};

export type HomeApp = {
  id: string;
  name: string;
  path: string;
  description?: string;
  folderPath?: string;
  executablePath?: string;
  latestReleasePath?: string;
  installerPath?: string;
  programPath?: string;
  runTarget?: 'latest' | 'installer' | 'program';
  tags?: string[];
  kind?: 'native' | 'web';
  url?: string;
};

export type HomeAppTab = {
  id: string;
  appId: string;
  name: string;
  path: string;
  kind: 'native' | 'web';
  url?: string;
  currentUrl?: string;
  reloadKey: number;
  openedAt: number;
};

export type WallpaperMode = 'codeforge' | 'external';

export type SpotifySettings = {
  startUri: string;
  autoStartOnDeviceConnect: boolean;
};

export type SpotifyTrack = {
  available: boolean;
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  appId: string;
  artworkUrl?: string;
  error?: string;
};

export type DeviceConnectionEvent = {
  id: string;
  name: string;
  kind: 'bluetooth' | 'controller';
  connectedAt: number;
};

export type AgentRunStats = {
  runId: string;
  provider: ProviderId;
  model: string;
  startedAt: number;
  outputLines: number;
  outputBytes: number;
  codeSignals: number;
  testSignals: number;
  files: string[];
  lastOutput: string;
  liveOutput: string;
  phase: string;
};

export type CliStatus = Record<
  ProviderId,
  { installed: boolean; executable: string; version: string; installCommand?: string; installUrl?: string }
>;

export type GitInfo = {
  isRepository: boolean;
  branch: string;
  root: string;
};

export type AgentRequest = {
  runId: string;
  provider: ProviderId;
  model: string;
  reasoningEffort: ReasoningEffort;
  access: AccessMode;
  apiKeys: ApiKeys;
  systemPrompt: string;
  prompt: string;
  projectPath: string;
  attachments: string[];
  externalServer?: ExternalServerConfig;
  originalPluginEnabled?: boolean;
};

export type SystemPromptRequest = {
  provider: ProviderId;
  model: string;
  reasoningEffort?: ReasoningEffort;
  access: AccessMode;
  apiKeys: ApiKeys;
  projectPath: string;
  externalServer?: ExternalServerConfig;
};

export type ExternalServerTestRequest = {
  provider: ProviderId;
  externalServer: ExternalServerConfig;
};

export type AgentResult = {
  ok: boolean;
  output: string;
  error: string;
  exitCode: number;
};

export type ProjectTestRequest = {
  runId: string;
  projectPath: string;
};

export type McpServerInfo = {
  id: string;
  name: string;
  source: string;
  sourcePath: string;
  command?: string;
  args?: string[];
  url?: string;
  transport: 'stdio' | 'http' | 'sse' | 'unknown';
  status: 'configured' | 'missing-command' | 'unknown';
  details?: string;
};

export type MobileConnectionType = 'vps' | 'ssh';

export type MobileConnectionConfig = {
  type: MobileConnectionType;
  // Debian VPS (HTTP API)
  vpsUrl?: string;
  vpsToken?: string;
  vpsProjectPath?: string;
  // Windows PC (SSH)
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshKey?: string;
  sshProjectPath?: string;
  // Status
  connected: boolean;
  connectedAt?: number;
  lastTestedAt?: number;
};

export type CodexPluginInfo = {
  id: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  source: 'bundled' | 'curated' | 'remote' | 'runtime' | 'personal' | 'project' | 'unknown';
  category?: string;
  capabilities?: string[];
  path: string;
  manifestPath: string;
  removable: boolean;
};

export type ApiChatProvider = 'anthropic' | 'openai' | 'openai-compatible';

export type ApiProviderConfig = {
  id: string;
  name: string;
  provider: ApiChatProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
};

// Per-chat start options; connection details live in ApiProviderConfig.
export type ApiChatConfig = {
  providerId: string;
  model: string;
  systemPrompt: string;
  includeProjectFiles: boolean;
};
