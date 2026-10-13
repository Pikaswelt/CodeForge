import type { AgyAccount, ApiProviderConfig, CliHarness } from '../types';

export type { AgyAccount, ApiProviderConfig, CliHarness };

// A saved V-Server on the phone. The private key lives in native app storage (keyId).
export type MobileServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: 'key' | 'password';
  keyId?: string;
  keyName?: string;
  keyEncrypted?: boolean;
  publicKey?: string;
  // Folder new terminals and the file browser start in (empty = home).
  defaultPath?: string;
  lastConnectedAt?: number;
  fingerprint?: string;
};

// One open terminal tab; its shell lives in tmux on the server (tmuxName).
export type TerminalSession = {
  id: string;
  serverId: string;
  title: string;
  icon?: string;
  command?: string;
  agyAccountId?: string;
  tmuxName: string;
  cwd?: string;
  createdAt: number;
};

export type MobileTheme = {
  id: string;
  name: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
  // Image or video from the phone, stored in app storage.
  backgroundMedia?: string;
  backgroundMediaKind?: 'image' | 'video';
  animatedGradient?: boolean;
  // Only swaps the wallpaper and keeps the look of baseTheme.
  mediaOnly?: boolean;
  baseTheme?: string;
  // 0-90: how much the wallpaper is darkened for readability.
  mediaDim?: number;
  mediaBlur?: number;
};

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; at: number; error?: boolean; tokens?: number };

export type ApiChat = {
  id: string;
  title: string;
  providerId: string;
  model: string;
  systemPrompt: string;
  project?: { serverId: string; path: string };
  includeFiles: boolean;
  messages: ChatMessage[];
  updatedAt: number;
};

export type MobileSettings = {
  themeId: string;
  surfaceOpacity: number;
  blur: number;
  radius: number;
  terminalFontSize: number;
  terminalOpacity: number;
  terminalFont: string;
  extraKeys: boolean;
  composerOpen: boolean;
  haptics: boolean;
  prefixSuffixEnabled: boolean;
  prefix: string;
  suffix: string;
  triggerWords: string;
  notifications: boolean;
  confirmClose: boolean;
};

export const DEFAULT_SETTINGS: MobileSettings = {
  themeId: 'modern-dark',
  surfaceOpacity: 78,
  blur: 18,
  radius: 18,
  terminalFontSize: 13,
  terminalOpacity: 88,
  terminalFont: 'mono',
  extraKeys: true,
  composerOpen: false,
  haptics: true,
  prefixSuffixEnabled: false,
  prefix: '',
  suffix: '',
  triggerWords: '',
  notifications: true,
  confirmClose: true,
};

export const DEFAULT_HARNESSES: CliHarness[] = [
  { id: 'claude', name: 'Claude Code', command: 'claude', icon: 'Sparkles' },
  { id: 'codex', name: 'Codex CLI', command: 'codex', icon: 'Code2' },
  { id: 'antigravity', name: 'Antigravity CLI', command: 'agy', icon: 'Rocket' },
  { id: 'shell', name: 'Leeres Terminal', command: '', icon: 'Terminal' },
];

export const MAX_AGY_ACCOUNTS = 6;
