import { tr } from '../i18n';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { PROVIDER_MODELS, useAppContext } from '../AppContext';
import type { FancyPluginInstalled } from '../electron';

export type PluginMenuItem = { label: string; icon?: string; id?: string; children?: PluginMenuItem[] };
export type PluginMenuEntry = PluginMenuItem & { pluginId: string; pluginName: string };

type ToastKind = 'info' | 'error';
type ToastItem = { id: number; text: string; kind: ToastKind };

type PluginContextValue = {
  items: PluginMenuEntry[];
  installed: FancyPluginInstalled[];
  loading: boolean;
  error: string;
  refresh(): Promise<void>;
  run(pluginId: string, itemId: string): void;
  toast(text: string, kind?: ToastKind): void;
};

const PluginContext = createContext<PluginContextValue | null>(null);

// Läuft im Worker: reicht Aufrufe an die App weiter und hält Klick-Handler lokal,
// weil Funktionen nicht per postMessage übertragen werden können.
const BOOTSTRAP = String.raw`
const __handlers = new Map();
let __seq = 0;
const __pending = new Map();
function __call(method, args) {
  return new Promise((resolve, reject) => {
    const id = ++__seq;
    __pending.set(id, { resolve, reject });
    self.postMessage({ type: 'rpc', id, method, args });
  });
}
function __serialize(item) {
  if (!item || typeof item !== 'object') return null;
  const out = { label: String(item.label || '') };
  if (item.icon) out.icon = String(item.icon);
  if (typeof item.run === 'function') {
    const id = 'run-' + (++__seq);
    __handlers.set(id, item.run);
    out.id = id;
  }
  if (Array.isArray(item.children)) out.children = item.children.map(__serialize).filter(Boolean);
  return out;
}
const api = {
  menu: {
    add: (item) => __call('menu.add', [__serialize(item)]),
    clear: () => __call('menu.clear', []),
  },
  toast: (text) => __call('toast', [String(text)]),
  log: (...args) => __call('log', [args.map((value) => String(value)).join(' ')]),
  storage: {
    get: (key) => __call('storage.get', [String(key)]),
    set: (key, value) => __call('storage.set', [String(key), value]),
  },
  app: {
    antigravityModels: () => __call('app.antigravityModels', []),
    startAntigravityLimit: (model) => __call('app.startAntigravityLimit', [String(model)]),
  },
};
self.onmessage = async (event) => {
  const message = event.data;
  if (message?.type === 'rpc-result') {
    const entry = __pending.get(message.id);
    if (!entry) return;
    __pending.delete(message.id);
    if (message.error) entry.reject(new Error(String(message.error)));
    else entry.resolve(message.value);
    return;
  }
  if (message?.type === 'run') {
    const handler = __handlers.get(message.id);
    if (!handler) return;
    try {
      await handler();
    } catch (error) {
      __call('toast', [String(error?.message || error)]);
    }
  }
};
try {
  if (typeof activate === 'function') await activate(api);
  self.postMessage({ type: 'ready' });
} catch (error) {
  self.postMessage({ type: 'error', message: String(error?.message || error) });
}
`;

type Runtime = {
  id: string;
  items: PluginMenuItem[];
  run(itemId: string): void;
  dispose(): void;
};

function startPlugin(
  installed: FancyPluginInstalled,
  handlers: {
    toast: (text: string, kind?: ToastKind) => void;
    antigravityModels: () => { id: string; name: string; intelligence?: string }[];
    startAntigravityLimit: (model: string) => Promise<boolean>;
    storageGet: (key: string) => unknown;
    storageSet: (key: string, value: unknown) => void;
  },
  source: string,
  onMenu: (items: PluginMenuItem[]) => void,
): Promise<Runtime> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([source, '\n', BOOTSTRAP], { type: 'text/javascript' }));
    const worker = new Worker(url, { type: 'module' });
    const runtime: Runtime = {
      id: installed.id,
      items: [],
      run(itemId: string) {
        worker.postMessage({ type: 'run', id: itemId });
      },
      dispose() {
        worker.terminate();
        URL.revokeObjectURL(url);
      },
    };
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      runtime.dispose();
      reject(new Error(tr('Das Plugin hat sich nicht gemeldet.')));
    }, 8000);

    worker.onmessage = async (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'rpc') {
        let value: unknown;
        let error = '';
        try {
          switch (message.method) {
            case 'menu.add':
              runtime.items = [...runtime.items, message.args[0] as PluginMenuItem];
              onMenu(runtime.items);
              value = true;
              break;
            case 'menu.clear':
              runtime.items = [];
              onMenu(runtime.items);
              value = true;
              break;
            case 'toast':
              handlers.toast(String(message.args[0] || ''));
              value = true;
              break;
            case 'log':
              console.log(`[Plugin ${installed.id}] ${message.args[0]}`);
              value = true;
              break;
            case 'storage.get':
              value = handlers.storageGet(String(message.args[0]));
              break;
            case 'storage.set':
              handlers.storageSet(String(message.args[0]), message.args[1]);
              value = true;
              break;
            case 'app.antigravityModels':
              value = handlers.antigravityModels();
              break;
            case 'app.startAntigravityLimit':
              value = await handlers.startAntigravityLimit(String(message.args[0]));
              break;
            default:
              error = `Unbekannter Aufruf: ${message.method}`;
          }
        } catch (err) {
          error = err instanceof Error ? err.message : tr("Aufruf fehlgeschlagen.");
        }
        worker.postMessage({ type: 'rpc-result', id: message.id, value, error });
        return;
      }
      if (message?.type === 'ready' && !settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(runtime);
        return;
      }
      if (message?.type === 'error' && !settled) {
        settled = true;
        window.clearTimeout(timer);
        runtime.dispose();
        reject(new Error(String(message.message || tr("Das Plugin konnte nicht starten."))));
      }
    };
    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      runtime.dispose();
      reject(new Error(event.message || tr("Das Plugin konnte nicht geladen werden.")));
    };
  });
}

export function PluginProvider({ children }: { children: ReactNode }) {
  const { startAntigravityLimit } = useAppContext();
  const [items, setItems] = useState<PluginMenuEntry[]>([]);
  const [installed, setInstalled] = useState<FancyPluginInstalled[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const runtimes = useRef<Runtime[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    if (!text) return;
    const id = ++toastId.current;
    setToasts((current) => [...current.slice(-2), { id, text, kind }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 5000);
  }, []);

  const stopAll = useCallback(() => {
    for (const runtime of runtimes.current) runtime.dispose();
    runtimes.current = [];
  }, []);

  const refresh = useCallback(async () => {
    const api = window.agentWorkspace?.plugins;
    if (!api) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    stopAll();
    setItems([]);
    try {
      const list = await api.list();
      setInstalled(list);
      for (const plugin of list) {
        try {
          const source = await api.source(plugin.id);
          const runtime = await startPlugin(
            plugin,
            {
              toast,
              antigravityModels: () =>
                PROVIDER_MODELS.antigravity.map((model) => ({ id: model.id, name: model.name, intelligence: model.intelligence })),
              startAntigravityLimit: (model) => startAntigravityLimit(model),
              storageGet: (key) => {
                try {
                  return JSON.parse(localStorage.getItem(`fancyPlugin:${plugin.id}:${key}`) || 'null');
                } catch {
                  return null;
                }
              },
              storageSet: (key, value) => localStorage.setItem(`fancyPlugin:${plugin.id}:${key}`, JSON.stringify(value ?? null)),
            },
            source,
            (menuItems) => {
              setItems((current) => [
                ...current.filter((entry) => entry.pluginId !== plugin.id),
                ...menuItems.map((entry) => ({ ...entry, pluginId: plugin.id, pluginName: plugin.name })),
              ]);
            },
          );
          runtimes.current.push(runtime);
        } catch (err) {
          setError(`${plugin.name}: ${err instanceof Error ? err.message : tr("konnte nicht starten.")}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Plugins konnten nicht geladen werden."));
    } finally {
      setLoading(false);
    }
  }, [startAntigravityLimit, stopAll, toast]);

  useEffect(() => {
    void refresh();
    return stopAll;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback((pluginId: string, itemId: string) => {
    runtimes.current.find((runtime) => runtime.id === pluginId)?.run(itemId);
  }, []);

  return (
    <PluginContext.Provider value={{ items, installed, loading, error, refresh, run, toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-80 flex-col gap-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-lg border px-3 py-2 text-xs shadow-2xl backdrop-blur-md ${
              item.kind === 'error'
                ? 'border-red-500/30 bg-red-500/15 text-red-100'
                : 'border-white/10 bg-[#1b1719]/95 text-zinc-200'
            }`}
          >
            {item.text}
          </div>
        ))}
      </div>
    </PluginContext.Provider>
  );
}

export function usePlugins() {
  const value = useContext(PluginContext);
  if (!value) throw new Error(tr('usePlugins muss innerhalb von PluginProvider verwendet werden.'));
  return value;
}
