const canUseSyncSocket = window.location.protocol !== 'file:' && Boolean(window.location.host);
// Browser-Polyfill fuer window.agentWorkspace
if (typeof (window as any).agentWorkspace === 'undefined' && canUseSyncSocket) {
  const pendingRequests = new Map();
  const eventListeners = new Map();
  let ws: WebSocket | null = null;
  let connectPromise: Promise<WebSocket> | null = null;

  const connect = (): Promise<WebSocket> => {
    if (connectPromise) return connectPromise;
    connectPromise = new Promise((resolve) => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}`;
      console.log('Connecting to sync WebSocket at', wsUrl);
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ipc-response') {
            const pending = pendingRequests.get(msg.id);
            if (pending) {
              pendingRequests.delete(msg.id);
              if (msg.error) pending.reject(new Error(msg.error));
              else pending.resolve(msg.result);
            }
          } else if (msg.type === 'ipc-event') {
            const list = eventListeners.get(msg.channel);
            if (list) {
              for (const cb of list) {
                cb(msg.data);
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onopen = () => {
        console.log('WebSocket connected');
        resolve(ws!);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        connectPromise = null;
        setTimeout(connect, 2000);
      };
    });
    return connectPromise;
  };

  const invoke = async (method: string, ...args: any[]): Promise<any> => {
    const activeWs = await connect();
    const id = Math.random().toString(36).substring(2);
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      activeWs.send(JSON.stringify({ type: 'ipc-call', id, method, args }));
    });
  };

  (window as any).agentWorkspace = {
    selectProjectFolder: () => invoke('selectProjectFolder'),
    createProjectFolder: (name: string) => invoke('createProjectFolder', name),
    getScratchProjectFolder: () => invoke('getScratchProjectFolder'),
    selectAttachments: () => invoke('selectAttachments'),
    selectThemeBackground: () => invoke('selectThemeBackground'),
    selectApplication: () => invoke('selectApplication'),
    selectLocalFile: (input: any) => invoke('selectLocalFile', input),
    selectCodexPluginFolder: () => invoke('selectCodexPluginFolder'),
    getSystemStatus: () => invoke('system:status'),
    getUpdateStatus: () => invoke('updates:status'),
    checkForUpdates: (input: any) => invoke('updates:check', input),
    installUpdate: () => invoke('updates:install'),
    onUpdateStatus: (callback: any) => {
      const channel = 'update:status';
      if (!eventListeners.has(channel)) eventListeners.set(channel, []);
      eventListeners.get(channel).push(callback);
      return () => {
        const list = eventListeners.get(channel);
        eventListeners.set(channel, list.filter((cb: any) => cb !== callback));
      };
    },
    getMcpServers: () => invoke('system:mcp-servers'),
    installCli: (provider: any) => invoke('system:install-cli', provider),
    getProviderUsage: (provider: any) => invoke('usage:provider', provider),
    testExternalServer: (request: any) => invoke('external-server:test', request),
    runAgent: (request: any) => invoke('agent:run', request),
    launchWorkspaceTerminals: (request: any) => invoke('workspace:launch-terminals', request),
    runProjectTest: (request: any) => invoke('agent:test', request),
    generateSystemPrompt: (request: any) => invoke('agent:generate-system-prompt', request),
    notifyAgentComplete: (input: any) => invoke('agent:notify-complete', input),
    updateDiscordPresence: (input: any) => invoke('discord:presence', input),
    cancelAgent: (runId: string) => invoke('agent:cancel', runId),
    onAgentOutput: (callback: any) => {
      const channel = 'agent:output';
      if (!eventListeners.has(channel)) eventListeners.set(channel, []);
      eventListeners.get(channel).push(callback);
      return () => {
        const list = eventListeners.get(channel);
        eventListeners.set(channel, list.filter((cb: any) => cb !== callback));
      };
    },
    getGitInfo: (projectPath: string) => invoke('git:info', projectPath),
    getBranches: (projectPath: string) => invoke('git:branches', projectPath),
    switchBranch: (projectPath: string, branch: string) => invoke('git:switch', projectPath, branch),
    installPlugin: (projectPath: string, packageName: string) => invoke('plugins:install', projectPath, packageName),
    removePlugin: (projectPath: string, packageName: string) => invoke('plugins:remove', projectPath, packageName),
    listCodexPlugins: (projectPath: string) => invoke('codex-plugins:list', projectPath),
    installCodexPluginFromFolder: (input: any) => invoke('codex-plugins:install-folder', input),
    removeCodexPlugin: (pluginPath: string, projectPath: string) => invoke('codex-plugins:remove', pluginPath, projectPath),
    launchApplication: (targetPath: string) => invoke('launcher:open-app', targetPath),
    attachNativeTab: (input: any) => invoke('native-tabs:attach', input),
    moveNativeTab: (input: any) => invoke('native-tabs:move', input),
    detachNativeTab: (tabId: string) => invoke('native-tabs:detach', tabId),
    launchSpotify: (uri: string) => invoke('launcher:spotify', uri),
    getSpotifyTrack: () => invoke('spotify:track'),
    onDeviceConnected: (callback: any) => {
      const channel = 'device:connected';
      if (!eventListeners.has(channel)) eventListeners.set(channel, []);
      eventListeners.get(channel).push(callback);
      return () => {
        const list = eventListeners.get(channel);
        eventListeners.set(channel, list.filter((cb: any) => cb !== callback));
      };
    },
    openExternal: (url: string) => invoke('shell:open-external', url),
    openPath: (targetPath: string) => invoke('shell:open-path', targetPath),
    getActions: (dirPath: string) => invoke('actions:list', dirPath),
    playAction: (dirPath: string, name: string) => invoke('actions:play', dirPath, name),
    recordAction: (dirPath: string, name: string) => invoke('actions:record', dirPath, name),
    removeAction: (dirPath: string, name: string) => invoke('actions:remove', dirPath, name),
    minimizeWindow: () => {},
    maximizeWindow: () => {},
    closeWindow: () => {},
    startSyncServer: () => invoke('sync:start-server'),
    getSyncServerStatus: () => invoke('sync:get-server-status'),
    runTerminalCommand: (request: any) => invoke('terminal:run', request),
    cancelTerminalCommand: (id: string) => invoke('terminal:cancel', id),
    onTerminalOutput: (id: string, callback: any) => {
      const channel = `terminal:output:${id}`;
      if (!eventListeners.has(channel)) eventListeners.set(channel, []);
      eventListeners.get(channel).push(callback);
      return () => {
        const list = eventListeners.get(channel);
        eventListeners.set(channel, list.filter((cb: any) => cb !== callback));
      };
    },
    createShellSession: (request: any) => invoke('shell:create', request),
    writeToShellSession: (request: any) => invoke('shell:write', request),
    killShellSession: (chatId: string) => invoke('shell:kill', chatId),
    resizeShellSession: (request: any) => invoke('shell:resize', request),
    onShellOutput: (chatId: string, callback: any) => {
      const channel = `shell:output:${chatId}`;
      if (!eventListeners.has(channel)) eventListeners.set(channel, []);
      eventListeners.get(channel).push(callback);
      return () => {
        const list = eventListeners.get(channel);
        eventListeners.set(channel, list.filter((cb: any) => cb !== callback));
      };
    },
    isWeb: true,
  };

  connect();
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
