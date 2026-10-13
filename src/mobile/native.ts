import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// Server data the native SSH side needs. The private key stays in app storage on the phone
// and is referenced by keyId; secret is a password or key passphrase kept in memory only.
export type NativeServer = {
  id: string;
  host: string;
  port: number;
  user: string;
  keyId?: string;
  secret?: string;
};

export type NativeEntry = {
  name: string;
  type: 'dir' | 'file' | 'link';
  size: number;
  modifiedAt: number;
  mode?: number;
};

export type TransferEvent = { transferId: string; name: string; done: number; total: number };

export interface CodeForgeNativePlugin {
  saveKey(input: { keyId: string; privateKey: string }): Promise<{ encrypted: boolean; publicKey: string | null }>;
  generateKey(input: { keyId: string; comment?: string }): Promise<{ publicKey: string }>;
  getPublicKey(input: { keyId: string; passphrase?: string }): Promise<{ publicKey: string }>;
  deleteKey(input: { keyId: string }): Promise<{ deleted: boolean }>;
  forgetHost(input: { host: string; port: number }): Promise<void>;

  connect(input: { server: NativeServer }): Promise<{ home: string; fingerprint: string }>;
  disconnect(input: { id: string }): Promise<void>;
  isConnected(input: { id: string }): Promise<{ connected: boolean }>;
  exec(input: { server: NativeServer; command: string; stdin?: string; timeoutMs?: number; outputLimit?: number }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
  openShell(input: { server: NativeServer; channelId: string; command: string; cols: number; rows: number }): Promise<void>;
  write(input: { channelId: string; data: string }): Promise<{ ok: boolean }>;
  resize(input: { channelId: string; cols: number; rows: number }): Promise<{ ok: boolean }>;
  closeShell(input: { channelId: string }): Promise<void>;

  sftpList(input: { server: NativeServer; path: string }): Promise<{ path: string; entries: NativeEntry[] }>;
  sftpMkdir(input: { server: NativeServer; path: string }): Promise<void>;
  sftpRename(input: { server: NativeServer; from: string; to: string }): Promise<void>;
  sftpDelete(input: { server: NativeServer; path: string }): Promise<void>;
  sftpReadText(input: { server: NativeServer; path: string; maxBytes?: number }): Promise<{ content: string }>;
  sftpWriteText(input: { server: NativeServer; path: string; content: string }): Promise<void>;
  sftpUpload(input: { server: NativeServer; remoteDir: string; transferId?: string }): Promise<{ canceled: boolean; uploaded: string[] }>;
  sftpDownload(input: { server: NativeServer; path: string; transferId?: string }): Promise<{ canceled: boolean; uri?: string }>;
  sftpOpen(input: { server: NativeServer; path: string; transferId?: string }): Promise<void>;

  importMedia(input: { kind: 'image' | 'video' | 'any' }): Promise<{ canceled: boolean; path?: string; name?: string; mime?: string; size?: number }>;
  deleteMedia(input: { path: string }): Promise<{ deleted: boolean }>;

  openUrl(input: { url: string }): Promise<void>;
  copyText(input: { text: string }): Promise<void>;
  readClipboard(): Promise<{ text: string }>;
  requestNotifications(): Promise<{ granted: boolean }>;
  notify(input: { title: string; body: string }): Promise<{ shown: boolean }>;

  addListener(event: 'shellData', handler: (event: { channelId: string; data: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'shellExit', handler: (event: { channelId: string; code: number; lost: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'transfer', handler: (event: TransferEvent) => void): Promise<PluginListenerHandle>;
}

// In a desktop browser (development) the same API is served by scripts/mobile-dev-bridge.mjs.
export const Native = registerPlugin<CodeForgeNativePlugin>('CodeForgeNative', {
  web: () => import('./webBridge').then((module) => new module.WebBridge()),
});

export const isNativeApp = Capacitor.isNativePlatform();

// URL the web view can load for a file in app storage (theme images and videos).
export function mediaUrl(path: string | undefined) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return Capacitor.convertFileSrc(path.startsWith('file://') ? path : `file://${path}`);
}

export type NativeError = Error & { code?: string };

export function errorCode(error: unknown) {
  return (error as NativeError)?.code || '';
}

export function errorMessage(error: unknown) {
  const message = (error as Error)?.message || String(error || 'Unbekannter Fehler');
  return message.replace(/^Error:\s*/, '');
}
