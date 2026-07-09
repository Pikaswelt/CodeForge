import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { AgentRequest, AgentResult, CliStatus, CodexPluginInfo, ExternalServerTestRequest, GitInfo, ImportedAntigravityChat, McpServerInfo, ProjectTestRequest, ProviderId, ProviderUsageInfo, SpotifyTrack, SystemPromptRequest } from './types';

type NativeTabBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NativeTabResult = {
  ok: boolean;
  pid: number;
  hwnd: string;
  message: string;
};

type UpdateStatus = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  availableVersion: string;
  downloaded: boolean;
  percent: number;
  message: string;
  error: string;
  feedUrl: string;
  installerPath?: string;
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
      checkForUpdates(input?: { manual?: boolean }): Promise<UpdateStatus>;
      installUpdate(): Promise<boolean>;
      onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
      getMcpServers(): Promise<McpServerInfo[]>;
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
      openPath(path: string): Promise<string>;
      getActions(dirPath?: string): Promise<{ name: string; events: number; path: string }[]>;
      playAction(dirPath: string, name: string): Promise<{ success: boolean }>;
      recordAction(dirPath: string, name: string): Promise<{ success: boolean }>;
      removeAction(dirPath: string, name: string): Promise<{ success: boolean }>;
      minimizeWindow(): void;
      maximizeWindow(): void;
      closeWindow(): void;
      startSyncServer(): Promise<{ url: string; ip: string; port: number }>;
      getSyncServerStatus(): Promise<{ running: boolean; url?: string; ip?: string; port?: number }>;
      runTerminalCommand(request: { id: string; command: string; cwd?: string }): Promise<{ exitCode?: number; error?: string }>;
      cancelTerminalCommand(id: string): Promise<boolean>;
      onTerminalOutput(id: string, callback: (payload: { type: 'stdout' | 'stderr' | 'exit'; text?: string; code?: number }) => void): () => void;
      createShellSession(request: { chatId: string; cwd?: string; shellType?: 'powershell' | 'cmd'; externalServer?: any }): Promise<void>;
      writeToShellSession(request: { chatId: string; text: string }): Promise<boolean>;
      killShellSession(chatId: string): Promise<boolean>;
      resizeShellSession(request: { chatId: string; cols: number; rows: number }): Promise<boolean>;
      onShellOutput(chatId: string, callback: (payload: { type: 'stdout' | 'stderr' | 'exit'; text?: string; code?: number }) => void): () => void;
    };
  }
}

export {};
