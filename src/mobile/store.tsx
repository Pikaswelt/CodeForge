import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Native, errorCode, errorMessage } from './native';
import { nativeServer, setSecret } from './remote';
import {
  DEFAULT_HARNESSES,
  DEFAULT_SETTINGS,
  type AgyAccount,
  type ApiChat,
  type ApiProviderConfig,
  type CliHarness,
  type MobileServer,
  type MobileSettings,
  type MobileTheme,
  type TerminalSession,
} from './types';

const PREFIX = 'codeforge.mobile.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function usePersistent<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable: keep the in-memory value.
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function newId() {
  return crypto.randomUUID();
}

export type Tab = 'home' | 'terminal' | 'files' | 'chat' | 'settings';
export type ServerStatus = { state: 'idle' | 'connecting' | 'online' | 'error'; message?: string; home?: string };
export type Toast = { id: string; text: string; tone: 'info' | 'error' | 'success' };

type SecretRequest = { server: MobileServer; message: string; resolve: (secret: string | null) => void };
type ConfirmRequest = { title: string; message: string; confirmLabel: string; danger?: boolean; resolve: (ok: boolean) => void };
type PromptRequest = { title: string; label: string; value: string; confirmLabel: string; secret?: boolean; resolve: (value: string | null) => void };

type Store = {
  tab: Tab;
  setTab: (tab: Tab) => void;
  servers: MobileServer[];
  saveServer: (server: MobileServer) => void;
  removeServer: (id: string) => Promise<void>;
  status: Record<string, ServerStatus>;
  connect: (server: MobileServer) => Promise<boolean>;
  withServer: <T>(server: MobileServer, task: () => Promise<T>) => Promise<T>;
  harnesses: CliHarness[];
  setHarnesses: (value: CliHarness[]) => void;
  agyAccounts: AgyAccount[];
  setAgyAccounts: (value: AgyAccount[]) => void;
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  setActiveTerminalId: (id: string | null) => void;
  openTerminal: (input: Omit<TerminalSession, 'id' | 'tmuxName' | 'createdAt'> & { id?: string; tmuxName?: string }) => TerminalSession;
  closeTerminal: (id: string, options?: { keepRemote?: boolean }) => void;
  renameTerminal: (id: string, title: string) => void;
  customThemes: MobileTheme[];
  setCustomThemes: (value: MobileTheme[] | ((current: MobileTheme[]) => MobileTheme[])) => void;
  settings: MobileSettings;
  updateSettings: (patch: Partial<MobileSettings>) => void;
  apiProviders: ApiProviderConfig[];
  setApiProviders: (value: ApiProviderConfig[]) => void;
  chats: ApiChat[];
  setChats: (value: ApiChat[] | ((current: ApiChat[]) => ApiChat[])) => void;
  filesTarget: { serverId: string; path?: string } | null;
  setFilesTarget: (value: { serverId: string; path?: string } | null) => void;
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone']) => void;
  secretRequest: SecretRequest | null;
  confirmRequest: ConfirmRequest | null;
  promptRequest: PromptRequest | null;
  confirm: (input: Omit<ConfirmRequest, 'resolve' | 'confirmLabel'> & { confirmLabel?: string }) => Promise<boolean>;
  prompt: (input: Omit<PromptRequest, 'resolve' | 'confirmLabel'> & { confirmLabel?: string }) => Promise<string | null>;
  closeDialogs: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('home');
  const [servers, setServers] = usePersistent<MobileServer[]>('servers', []);
  const [harnesses, setHarnesses] = usePersistent<CliHarness[]>('harnesses', DEFAULT_HARNESSES);
  const [agyAccounts, setAgyAccounts] = usePersistent<AgyAccount[]>('agyAccounts', []);
  const [terminals, setTerminals] = usePersistent<TerminalSession[]>('terminals', []);
  const [activeTerminalId, setActiveTerminalId] = usePersistent<string | null>('activeTerminal', null);
  const [customThemes, setCustomThemes] = usePersistent<MobileTheme[]>('customThemes', []);
  const [storedSettings, setSettings] = usePersistent<MobileSettings>('settings', DEFAULT_SETTINGS);
  const [apiProviders, setApiProviders] = usePersistent<ApiProviderConfig[]>('apiProviders', []);
  const [chats, setChats] = usePersistent<ApiChat[]>('chats', []);
  const [status, setStatus] = useState<Record<string, ServerStatus>>({});
  const [filesTarget, setFilesTarget] = useState<{ serverId: string; path?: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [secretRequest, setSecretRequest] = useState<SecretRequest | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const terminalsRef = useRef(terminals);
  terminalsRef.current = terminals;

  // New settings keys get their defaults when an older version stored the object.
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...storedSettings }), [storedSettings]);
  const updateSettings = useCallback((patch: Partial<MobileSettings>) => setSettings((current) => ({ ...DEFAULT_SETTINGS, ...current, ...patch })), [setSettings]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = newId();
    setToasts((current) => [...current.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), tone === 'error' ? 5200 : 3200);
  }, []);

  const askSecret = useCallback((server: MobileServer, message: string) => new Promise<string | null>((resolve) => setSecretRequest({ server, message, resolve })), []);

  const confirm = useCallback<Store['confirm']>((input) => new Promise((resolve) => setConfirmRequest({ confirmLabel: 'OK', ...input, resolve })), []);
  const prompt = useCallback<Store['prompt']>((input) => new Promise((resolve) => setPromptRequest({ confirmLabel: 'Speichern', ...input, resolve })), []);
  const closeDialogs = useCallback(() => {
    setSecretRequest(null);
    setConfirmRequest(null);
    setPromptRequest(null);
  }, []);

  // Runs a server task; asks for the password or passphrase when the server needs one and retries.
  const withServer = useCallback(async <T,>(server: MobileServer, task: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await task();
      } catch (error) {
        if (errorCode(error) !== 'NEED_SECRET') throw error;
        const secret = await askSecret(server, errorMessage(error));
        setSecretRequest(null);
        if (!secret) throw Object.assign(new Error('Abgebrochen.'), { code: 'CANCELED' });
        setSecret(server.id, secret);
      }
    }
    throw new Error('Anmeldung fehlgeschlagen.');
  }, [askSecret]);

  const connect = useCallback(async (server: MobileServer) => {
    setStatus((current) => ({ ...current, [server.id]: { state: 'connecting' } }));
    try {
      const result = await withServer(server, () => Native.connect({ server: nativeServer(server) }));
      setStatus((current) => ({ ...current, [server.id]: { state: 'online', home: result.home } }));
      setServers((current) => current.map((item) => (item.id === server.id ? { ...item, lastConnectedAt: Date.now(), fingerprint: result.fingerprint } : item)));
      return true;
    } catch (error) {
      const canceled = errorCode(error) === 'CANCELED';
      setStatus((current) => ({ ...current, [server.id]: { state: canceled ? 'idle' : 'error', message: canceled ? undefined : errorMessage(error) } }));
      if (!canceled) toast(errorMessage(error), 'error');
      return false;
    }
  }, [setServers, toast, withServer]);

  const saveServer = useCallback((server: MobileServer) => {
    setServers((current) => (current.some((item) => item.id === server.id) ? current.map((item) => (item.id === server.id ? server : item)) : [...current, server]));
    // A changed address or login needs a fresh connection.
    void Native.disconnect({ id: server.id }).catch(() => {});
    setStatus((current) => ({ ...current, [server.id]: { state: 'idle' } }));
  }, [setServers]);

  const removeServer = useCallback(async (id: string) => {
    const server = serversRef.current.find((item) => item.id === id);
    await Native.disconnect({ id }).catch(() => {});
    if (server?.keyId) await Native.deleteKey({ keyId: server.keyId }).catch(() => {});
    setSecret(id, '');
    setServers((current) => current.filter((item) => item.id !== id));
    setTerminals((current) => current.filter((item) => item.serverId !== id));
  }, [setServers, setTerminals]);

  const openTerminal = useCallback<Store['openTerminal']>((input) => {
    const id = input.id || newId();
    const tmuxName = input.tmuxName || (input.agyAccountId ? `cf-agy-${input.agyAccountId}` : `cf-t-${id}`);
    // Attaching to a tmux session that already has a tab just shows that tab.
    const existing = terminalsRef.current.find((item) => item.serverId === input.serverId && item.tmuxName === tmuxName);
    const session: TerminalSession = existing || { ...input, id, tmuxName, createdAt: Date.now() };
    if (!existing) {
      terminalsRef.current = [...terminalsRef.current, session];
      setTerminals((current) => [...current, session]);
    }
    setActiveTerminalId(session.id);
    setTab('terminal');
    return session;
  }, [setActiveTerminalId, setTerminals]);

  const closeTerminal = useCallback<Store['closeTerminal']>((id) => {
    setTerminals((current) => {
      const index = current.findIndex((item) => item.id === id);
      const next = current.filter((item) => item.id !== id);
      setActiveTerminalId((active) => (active === id ? next[Math.max(0, index - 1)]?.id ?? null : active));
      return next;
    });
  }, [setActiveTerminalId, setTerminals]);

  const renameTerminal = useCallback((id: string, title: string) => {
    setTerminals((current) => current.map((item) => (item.id === id ? { ...item, title } : item)));
  }, [setTerminals]);

  const value: Store = {
    tab,
    setTab,
    servers,
    saveServer,
    removeServer,
    status,
    connect,
    withServer,
    harnesses,
    setHarnesses,
    agyAccounts,
    setAgyAccounts,
    terminals,
    activeTerminalId,
    setActiveTerminalId,
    openTerminal,
    closeTerminal,
    renameTerminal,
    customThemes,
    setCustomThemes,
    settings,
    updateSettings,
    apiProviders,
    setApiProviders,
    chats,
    setChats,
    filesTarget,
    setFilesTarget,
    toasts,
    toast,
    secretRequest,
    confirmRequest,
    promptRequest,
    confirm,
    prompt,
    closeDialogs,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore outside StoreProvider');
  return store;
}
