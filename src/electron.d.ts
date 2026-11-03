import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { VServer, VServerConnection, SftpEntry, AgentRequest, AgentResult, CliStatus, CodexPluginInfo, ExternalServerTestRequest, GitInfo, ImportedAntigravityChat, McpServerInfo, McpSessionInfo, McpStartResult, ProjectTestRequest, ProviderId, ProviderUsageInfo, ReleaseNotesAnswer, SpotifyTrack, SystemPromptRequest, UpdateSpotlight } from './types';

export type FancyPlan = 'free' | 'mini' | 'pro' | 'max';

export type FancyAccount = {
  id: string;
  name: string;
  avatar: string;
  provider: 'discord' | 'github' | 'guest' | 'code';
  quota: { used: number; limit: number };
  // Anmeldewege (ab Konto-Server mit Zugangscodes; ältere Server liefern sie nicht).
  accessCode?: { set: boolean; hint: string };
  identities?: FancyIdentity[];
  suggestLink?: boolean;
  plan?: FancyPlan;
  banned?: boolean;
  banReason?: string;
  banUntil?: number;
};

export type FancyIdentity = { provider: 'discord' | 'github'; name: string; avatar: string; linked: number };
export type FancyCodeLogin = { user: FancyAccount; accessCode: string; created: boolean };

// Popup vom Server: Hinweis oder Geschenk (Plan-Zeit und/oder Reset-Guthaben).
export type FancyAnnouncement = {
  id: string;
  kind: 'notice' | 'gift';
  title: string;
  message: string;
  image: string;
  createdAt: number;
  plan: FancyPlan | null;
  days: number;
  resets: number;
};

export type FancyBan = { reason: string; until: number };

export type FancyUsageWindow = { used: number; limit: number; resetAt: number };
// FancyCode zählt pro App: der Agent in Tokens (fancycode-cli), der einfache Chat in Nachrichten.
export type FancyUsageUnit = 'tokens' | 'messages';
export type FancyUsage = {
  fiveHour: FancyUsageWindow;
  weekly: FancyUsageWindow;
  resets: number;
  unit?: FancyUsageUnit;
  plan?: FancyPlan;
};
export type FancyUsageApp = 'fancycode' | 'fancycode-cli';

export type FancyPluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  minAppVersion?: string;
  main?: string;
};

export type FancyPluginCatalogEntry = FancyPluginManifest & {
  manifest: string;
  main: string;
  sha256: string;
};

export type FancyPluginCatalog = { base: string; updated: string; plugins: FancyPluginCatalogEntry[] };

export type BundledSkill = { id: string; title: string; description: string; plugin: boolean; defaultOn: boolean; enabled: boolean };
export type SkillTarget = { id: string; label: string; detected: boolean; enabled: boolean };
export type SkillsState = { skills: BundledSkill[]; targets: SkillTarget[]; conflicts: string[] };

export type FancyPluginInstalled = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  minAppVersion: string;
  installedAt: number;
};

type NativeTabBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NativeTabResult = {
  launched?: boolean;
  ok: boolean;
  pid: number;
  hwnd: string;
  message: string;
};

export type WhisperStatus = {
  supported: boolean;
  binaryInstalled: boolean;
  models: Record<string, boolean>;
  installed: boolean;
  installing: boolean;
  modelOptions: { id: string; label: string; size: number }[];
};

export type UpdateStatus = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';
  currentVersion: string;
  availableVersion: string;
  downloaded: boolean;
  percent: number;
  message: string;
  error: string;
  feedUrl: string;
  installerPath?: string;
  receivedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  installing?: boolean;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        allowpopups?: boolean | string;
      };
    }
  }

  interface Window {
    agentWorkspace?: {
      selectProjectFolder(): Promise<string | null>;
      createProjectFolder(name: string): Promise<string | null>;
      getScratchProjectFolder(): Promise<string>;
      selectAttachments(): Promise<string[]>;
      selectThemeBackground(): Promise<string | null>;
      selectApplication(): Promise<string | null>;
      selectLocalFile(input?: { title?: string }): Promise<string | null>;
      selectCodexPluginFolder(): Promise<string | null>;
      getSystemStatus(): Promise<CliStatus>;
      getUpdateStatus(): Promise<UpdateStatus>;
      getReleaseNotes?(request?: { version?: string; limit?: number }): Promise<ReleaseNotesAnswer>;
      getUpdateSpotlight?(): Promise<UpdateSpotlight>;
      markUpdateSeen?(version?: string): Promise<string>;
      checkForUpdates(input?: { manual?: boolean }): Promise<UpdateStatus>;
      installUpdate(): Promise<boolean>;
      onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
      getMcpServers(): Promise<McpServerInfo[]>;
      isOwnerPc?(): Promise<boolean>;
      installCli(provider: ProviderId): Promise<{ ok: boolean; message: string }>;
      getProviderUsage(provider: ProviderId): Promise<ProviderUsageInfo>;
      getAntigravityTerminalUsage(): Promise<ProviderUsageInfo>;
      importAntigravityChats(projectPath?: string): Promise<ImportedAntigravityChat[]>;
      testExternalServer(request: ExternalServerTestRequest): Promise<AgentResult>;
      runAgent(request: AgentRequest): Promise<AgentResult>;
      launchWorkspaceTerminals(request: {
        projectPath: string;
        terminals: {
          provider: ProviderId;
          title: string;
          prompt?: string;
        }[];
      }): Promise<{ ok: boolean; count: number }>;
      runProjectTest(request: ProjectTestRequest): Promise<AgentResult>;
      generateSystemPrompt(request: SystemPromptRequest): Promise<AgentResult>;
      notifyAgentComplete(input: { title: string; body: string }): Promise<boolean>;
      updateDiscordPresence(input: {
        enabled?: boolean;
        state?: string;
        details?: string;
        projectName?: string;
        provider?: ProviderId;
        model?: string;
        isRunning?: boolean;
      }): Promise<boolean>;
      cancelAgent(runId: string): Promise<boolean>;
      writeAgentInput(runId: string, text: string): Promise<boolean>;
      onAgentOutput(
        callback: (payload: { runId: string; chunk: string; stream: 'stdout' | 'stderr' }) => void,
      ): () => void;
      getGitInfo(projectPath: string): Promise<GitInfo>;
      getBranches(projectPath: string): Promise<string[]>;
      switchBranch(
        projectPath: string,
        branch: string,
      ): Promise<{ ok: boolean; output: string; error: string }>;
      installPlugin(projectPath: string, packageName: string): Promise<string>;
      removePlugin(projectPath: string, packageName: string): Promise<string>;
      listCodexPlugins(projectPath?: string): Promise<CodexPluginInfo[]>;
      installCodexPluginFromFolder(input: {
        sourcePath: string;
        target: 'personal' | 'project';
        projectPath?: string;
      }): Promise<CodexPluginInfo>;
      removeCodexPlugin(pluginPath: string, projectPath?: string): Promise<boolean>;
      launchApplication(path: string): Promise<string>;
      attachNativeTab(input: {
        tabId: string;
        path: string;
        bounds: NativeTabBounds;
        dpr: number;
      }): Promise<NativeTabResult>;
      moveNativeTab(input: {
        tabId: string;
        bounds: NativeTabBounds;
        dpr: number;
      }): Promise<NativeTabResult>;
      detachNativeTab(tabId: string): Promise<NativeTabResult>;
      launchSpotify(uri: string): Promise<void>;
      getSpotifyTrack(): Promise<SpotifyTrack>;
      onDeviceConnected(callback: (payload: { id: string; name: string; kind: string }) => void): () => void;
      openExternal(url: string): Promise<void>;
      openInChrome(url: string): Promise<'chrome' | 'default'>;
      openPath(path: string): Promise<string>;
      getActions(dirPath?: string): Promise<{ name: string; events: number; path: string }[]>;
      playAction(dirPath: string, name: string): Promise<{ success: boolean }>;
      recordAction(dirPath: string, name: string): Promise<{ success: boolean }>;
      removeAction(dirPath: string, name: string): Promise<{ success: boolean }>;
      minimizeWindow(): void;
      maximizeWindow(): void;
      closeWindow(): void;
      setLanguage(language: 'de' | 'en'): void;
      startSyncServer(): Promise<{ url: string; ip: string; port: number }>;
      getPathForFile?(file: File): string;
      apiChatSend(input: {
        provider: string;
        baseUrl: string;
        apiKey: string;
        model: string;
        system: string;
        messages: { role: 'user' | 'assistant'; content: string }[];
      }): Promise<{ text: string; tokens: number }>;
      apiChatModels(input: { provider: string; baseUrl: string; apiKey: string }): Promise<string[]>;
      fancyAccount?: {
        available(): Promise<boolean>;
        me(): Promise<FancyAccount | null>;
        wasGranted(): Promise<boolean>;
        login(provider: 'discord' | 'github', invite?: string): Promise<FancyAccount>;
        guest(invite: string): Promise<FancyAccount>;
        codeLogin(code: string, name?: string): Promise<FancyCodeLogin>;
        link(provider: 'discord' | 'github'): Promise<FancyAccount | null>;
        unlink(provider: 'discord' | 'github'): Promise<FancyAccount | null>;
        newAccessCode(): Promise<string>;
        checkInvite(invite: string): Promise<boolean>;
        cancel(): Promise<void>;
        usage(app?: FancyUsageApp): Promise<FancyUsage>;
        resetUsage(app?: FancyUsageApp): Promise<FancyUsage & { ok: true }>;
        announcements(): Promise<{ items: FancyAnnouncement[]; ban: FancyBan | null; plan?: FancyPlan }>;
        appInfo(): Promise<{ version: string; apiBase: string }>;
        seenAnnouncements(ids: string[]): Promise<boolean>;
        logout(): Promise<boolean>;
        collabToken(opts?: { reset?: boolean }): Promise<{ hub: string; token: string; error?: string }>;
        openLiveFile(): Promise<{ path: string; name: string; content: string } | null>;
        saveLiveFile(input: { path?: string; name?: string; content: string }): Promise<{ path: string } | null>;
      };
      plugins?: {
        catalog(): Promise<FancyPluginCatalog>;
        list(): Promise<FancyPluginInstalled[]>;
        install(id: string): Promise<FancyPluginInstalled | null>;
        remove(id: string): Promise<boolean>;
        source(id: string): Promise<string>;
      };
      skills?: {
        state(): Promise<SkillsState>;
        setSkill(id: string, enabled: boolean): Promise<SkillsState>;
        setTarget(id: string, enabled: boolean): Promise<SkillsState>;
        installRemote(vserver: VServerConnection): Promise<{ ok: boolean; failed: string[] }>;
      };
      apiChatProjectFiles(root: string): Promise<string[]>;
      getSyncServerStatus(): Promise<{ running: boolean; url?: string; ip?: string; port?: number }>;
      runTerminalCommand(request: { id: string; command: string; cwd?: string }): Promise<{ exitCode?: number; error?: string }>;
      cancelTerminalCommand(id: string): Promise<boolean>;
      onTerminalOutput(id: string, callback: (payload: { type: 'stdout' | 'stderr' | 'exit'; text?: string; code?: number }) => void): () => void;
      // FancyCode Web re-attaches running sessions and reports that with skipStartCommand.
      createShellSession(request: { chatId: string; cwd?: string; shellType?: 'powershell' | 'cmd'; externalServer?: any; vserver?: VServerConnection; agyAccountId?: string; cols?: number; rows?: number; startCommand?: string }): Promise<{ resumed?: boolean; reattached?: boolean; skipStartCommand?: boolean } | void>;
      listRunningSessions(request: { vservers: VServerConnection[] }): Promise<{
        local: { id: string; meta: { vserverId?: string; agyAccountId?: string; tmuxName?: string } }[];
        remote: { id: string; reachable: boolean; sessions: string[] }[];
      }>;
      killRemoteSession(request: { vserver: VServerConnection; tmuxName: string }): Promise<boolean>;
      onControlRequest?(handler: (request: { op: string; args: any }) => Promise<unknown>): () => void;
      publishControlState?(state: unknown): Promise<boolean>;
      startRemoteAgentWatch?(server: VServerConnection): Promise<boolean>;
      onRemoteAgentEvent?(callback: (payload: { server: VServerConnection; event: any }) => void): () => void;
      answerRemoteAgent?(request: { server: VServerConnection; id: string; answer: unknown }): Promise<boolean>;
      getMcpInfo?(): Promise<{ command: string; args: string[]; env: Record<string, string> }>;
      registerMcp?(request: { target: 'claude' | 'agy' | 'fancycode' | 'opencode'; accountIds?: string[] }): Promise<{ ok: boolean; output: string }>;
      getOwnMcpServer?(): Promise<McpServerInfo>;
      getMcpSessions?(): Promise<McpSessionInfo[]>;
      startMcpServer?(request: { id: string }): Promise<McpStartResult>;
      stopMcpServer?(request: { id: string }): Promise<{ ok: boolean; error?: string }>;
      onMcpSessionEnded?(callback: (id: string) => void): () => void;
      listAgyAccounts?(): Promise<{ id: string; name: string }[]>;
      saveAgyAccounts?(accounts: { id: string; name: string }[]): Promise<{ id: string; name: string }[]>;
      isWeb?: boolean;
      getAgyAccountsStatus(accountIds: string[]): Promise<{ id: string; profileExists: boolean; email: string }[]>;
      removeAgyAccountProfile(accountId: string): Promise<boolean>;
      writeToShellSession(request: { chatId: string; text: string }): Promise<boolean>;
      killShellSession(chatId: string): Promise<boolean>;
      resizeShellSession(request: { chatId: string; cols: number; rows: number }): Promise<boolean>;
      onShellOutput(chatId: string, callback: (payload: { type: 'stdout' | 'stderr' | 'exit'; text?: string; code?: number }) => void): () => void;
      whisperStatus(): Promise<WhisperStatus>;
      whisperInstall(input: { model: string }): Promise<{ ok: boolean; error?: string; status: WhisperStatus }>;
      whisperRemove(): Promise<WhisperStatus>;
      whisperTranscribe(input: { audio: ArrayBuffer; language: string; model: string; prompt?: string }): Promise<{ ok: boolean; text?: string; error?: string }>;
      whisperWarmUp(model: string): Promise<boolean>;
      onWhisperProgress(callback: (payload: { type: 'progress' | 'done' | 'error'; label?: string; percent?: number; received?: number; total?: number; error?: string }) => void): () => void;
      importSshKey(input: { sourcePath: string; name?: string }): Promise<{ keyPath: string; keyName: string }>;
      removeSshKey(keyPath: string): Promise<boolean>;
      exportForAndroid?(payload: { servers: VServer[]; includeKeys: boolean; settings: Record<string, unknown> }): Promise<{ saved: boolean; path?: string; keys?: number }>;
      sftpConnect(input: { vserver: VServerConnection; secret?: string }): Promise<{ home: string }>;
      sftpList(input: { vserver: VServerConnection; path: string }): Promise<{ path: string; entries: SftpEntry[] }>;
      sftpDisconnect(id: string): Promise<boolean>;
      sftpMkdir(input: { vserver: VServerConnection; path: string }): Promise<void>;
      sftpRename(input: { vserver: VServerConnection; from: string; to: string }): Promise<void>;
      sftpDelete(input: { vserver: VServerConnection; path: string }): Promise<void>;
      sftpDownload(input: { vserver: VServerConnection; path: string }): Promise<{ canceled: boolean; localPath?: string }>;
      sftpUpload(input: { vserver: VServerConnection; path: string }): Promise<{ canceled: boolean; uploaded: string[] }>;
    };
  }
}

export {};
