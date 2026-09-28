const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('agentWorkspace', {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  selectProjectFolder: () => ipcRenderer.invoke('dialog:select-project'),
  createProjectFolder: (name) => ipcRenderer.invoke('dialog:create-project', name),
  getScratchProjectFolder: () => ipcRenderer.invoke('dialog:scratch-project'),
  selectAttachments: () => ipcRenderer.invoke('dialog:select-attachments'),
  selectThemeBackground: () => ipcRenderer.invoke('dialog:select-theme-background'),
  selectApplication: () => ipcRenderer.invoke('dialog:select-application'),
  selectLocalFile: (input) => ipcRenderer.invoke('dialog:select-local-file', input),
  selectCodexPluginFolder: () => ipcRenderer.invoke('dialog:select-codex-plugin'),
  getSystemStatus: () => ipcRenderer.invoke('system:status'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:status'),
  checkForUpdates: (input) => ipcRenderer.invoke('updates:check', input),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  getMcpServers: () => ipcRenderer.invoke('system:mcp-servers'),
  installCli: (provider) => ipcRenderer.invoke('system:install-cli', provider),
  getProviderUsage: (provider) => ipcRenderer.invoke('usage:provider', provider),
  getAntigravityTerminalUsage: () => ipcRenderer.invoke('usage:antigravity-terminal'),
  importAntigravityChats: (projectPath) => ipcRenderer.invoke('antigravity:import-chats', projectPath),
  testExternalServer: (request) => ipcRenderer.invoke('external-server:test', request),
  runAgent: (request) => ipcRenderer.invoke('agent:run', request),
  launchWorkspaceTerminals: (request) => ipcRenderer.invoke('workspace:launch-terminals', request),
  runProjectTest: (request) => ipcRenderer.invoke('agent:test', request),
  generateSystemPrompt: (request) => ipcRenderer.invoke('agent:generate-system-prompt', request),
  notifyAgentComplete: (input) => ipcRenderer.invoke('agent:notify-complete', input),
  updateDiscordPresence: (input) => ipcRenderer.invoke('discord:presence', input),
  cancelAgent: (runId) => ipcRenderer.invoke('agent:cancel', runId),
  writeAgentInput: (runId, text) => ipcRenderer.invoke('agent:write-input', { runId, text }),
  onAgentOutput: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('agent:output', listener);
    return () => ipcRenderer.removeListener('agent:output', listener);
  },
  getGitInfo: (projectPath) => ipcRenderer.invoke('git:info', projectPath),
  getBranches: (projectPath) => ipcRenderer.invoke('git:branches', projectPath),
  switchBranch: (projectPath, branch) => ipcRenderer.invoke('git:switch', projectPath, branch),
  installPlugin: (projectPath, packageName) =>
    ipcRenderer.invoke('plugins:install', projectPath, packageName),
  removePlugin: (projectPath, packageName) =>
    ipcRenderer.invoke('plugins:remove', projectPath, packageName),
  listCodexPlugins: (projectPath) => ipcRenderer.invoke('codex-plugins:list', projectPath),
  installCodexPluginFromFolder: (input) => ipcRenderer.invoke('codex-plugins:install-folder', input),
  removeCodexPlugin: (pluginPath, projectPath) =>
    ipcRenderer.invoke('codex-plugins:remove', pluginPath, projectPath),
  launchApplication: (targetPath) => ipcRenderer.invoke('launcher:open-app', targetPath),
  attachNativeTab: (input) => ipcRenderer.invoke('native-tabs:attach', input),
  moveNativeTab: (input) => ipcRenderer.invoke('native-tabs:move', input),
  detachNativeTab: (tabId) => ipcRenderer.invoke('native-tabs:detach', tabId),
  launchSpotify: (uri) => ipcRenderer.invoke('launcher:spotify', uri),
  getSpotifyTrack: () => ipcRenderer.invoke('spotify:track'),
  onDeviceConnected: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('device:connected', listener);
    return () => ipcRenderer.removeListener('device:connected', listener);
  },
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
  getActions: (dirPath) => ipcRenderer.invoke('actions:list', dirPath),
  playAction: (dirPath, name) => ipcRenderer.invoke('actions:play', dirPath, name),
  recordAction: (dirPath, name) => ipcRenderer.invoke('actions:record', dirPath, name),
  removeAction: (dirPath, name) => ipcRenderer.invoke('actions:remove', dirPath, name),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  startSyncServer: () => ipcRenderer.invoke('sync:start-server'),
  getSyncServerStatus: () => ipcRenderer.invoke('sync:get-server-status'),
  runTerminalCommand: (request) => ipcRenderer.invoke('terminal:run', request),
  cancelTerminalCommand: (id) => ipcRenderer.invoke('terminal:cancel', id),
  onTerminalOutput: (id, callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(`terminal:output:${id}`, listener);
    return () => ipcRenderer.removeListener(`terminal:output:${id}`, listener);
  },
  apiChatSend: (input) => ipcRenderer.invoke('apichat:send', input),
  apiChatModels: (input) => ipcRenderer.invoke('apichat:models', input),
  apiChatProjectFiles: (root) => ipcRenderer.invoke('apichat:project-files', root),
  createShellSession: (request) => ipcRenderer.invoke('shell:create', request),
  writeToShellSession: (request) => ipcRenderer.invoke('shell:write', request),
  killShellSession: (chatId) => ipcRenderer.invoke('shell:kill', chatId),
  resizeShellSession: (request) => ipcRenderer.invoke('shell:resize', request),
  onShellOutput: (chatId, callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(`shell:output:${chatId}`, listener);
    return () => ipcRenderer.removeListener(`shell:output:${chatId}`, listener);
  },
  whisperStatus: () => ipcRenderer.invoke('whisper:status'),
  whisperInstall: (input) => ipcRenderer.invoke('whisper:install', input),
  whisperRemove: () => ipcRenderer.invoke('whisper:remove'),
  whisperTranscribe: (input) => ipcRenderer.invoke('whisper:transcribe', input),
  whisperWarmUp: (model) => ipcRenderer.invoke('whisper:warm-up', model),
  onWhisperProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('whisper:progress', listener);
    return () => ipcRenderer.removeListener('whisper:progress', listener);
  },
  importSshKey: (input) => ipcRenderer.invoke('ssh:import-key', input),
  removeSshKey: (keyPath) => ipcRenderer.invoke('ssh:remove-key', keyPath),
});
