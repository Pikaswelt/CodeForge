import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, MessageSquare, Mic, MicOff, Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { useDictation } from '../useDictation';
import { appendSpoken, useVoiceSettings } from '../voice';
import type { ApiChatProvider, ApiProviderConfig, Chat } from '../types';

export const API_PROVIDER_TYPES: { id: ApiChatProvider; label: string; baseUrl: string; model: string }[] = [
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: '' },
  { id: 'openai-compatible', label: 'OpenAI-kompatibel', baseUrl: 'http://localhost:11434/v1', model: '' },
];

const cleanIpcError = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : fallback;

async function fetchModels(provider: ApiProviderConfig) {
  return window.agentWorkspace.apiChatModels({
    provider: provider.provider,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  });
}

// Settings editor: saved AI providers (type, URL, key, default model).
export function ApiProvidersSettings() {
  const { apiProviders, setApiProviders } = useAppContext();
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Record<string, string>>({});

  const update = (id: string, patch: Partial<ApiProviderConfig>) =>
    setApiProviders((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const loadModels = async (provider: ApiProviderConfig) => {
    setBusyId(provider.id);
    setNotice((current) => ({ ...current, [provider.id]: '' }));
    try {
      const list = await fetchModels(provider);
      setModels((current) => ({ ...current, [provider.id]: list }));
      setNotice((current) => ({ ...current, [provider.id]: list.length ? `${list.length} Modelle gefunden. Verbindung ok.` : 'Keine Modelle gefunden.' }));
    } catch (err) {
      setNotice((current) => ({ ...current, [provider.id]: cleanIpcError(err, 'Modelle konnten nicht geladen werden.') }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3 mt-3">
      {apiProviders.map((provider) => {
        const typeInfo = API_PROVIDER_TYPES.find((item) => item.id === provider.provider) || API_PROVIDER_TYPES[0];
        return (
          <div key={provider.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-2">
            <div className="flex gap-2">
              <input
                value={provider.name}
                onChange={(event) => update(provider.id, { name: event.target.value })}
                className="input flex-1 min-w-0"
                placeholder="Name"
                autoComplete="off"
              />
              <select
                value={provider.provider}
                onChange={(event) => {
                  const next = API_PROVIDER_TYPES.find((item) => item.id === event.target.value) || API_PROVIDER_TYPES[0];
                  update(provider.id, { provider: next.id, baseUrl: '', model: next.model || provider.model });
                }}
                className="input !w-[170px] shrink-0"
              >
                {API_PROVIDER_TYPES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setApiProviders((current) => current.filter((item) => item.id !== provider.id))}
                className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                title="Anbieter entfernen"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input
              value={provider.baseUrl}
              onChange={(event) => update(provider.id, { baseUrl: event.target.value })}
              className="input w-full font-mono"
              placeholder={`API-URL (leer = ${typeInfo.baseUrl})`}
              autoComplete="off"
            />
            <input
              type="password"
              value={provider.apiKey}
              onChange={(event) => update(provider.id, { apiKey: event.target.value })}
              className="input w-full font-mono"
              placeholder={provider.provider === 'openai-compatible' ? 'API-Key (optional)' : 'API-Key'}
              autoComplete="off"
            />
            <div className="flex gap-2">
              <input
                value={provider.model}
                onChange={(event) => update(provider.id, { model: event.target.value })}
                className="input flex-1 min-w-0 font-mono"
                placeholder="Standard-Modell"
                list={`models-${provider.id}`}
                autoComplete="off"
              />
              <datalist id={`models-${provider.id}`}>
                {(models[provider.id] || []).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <button
                onClick={() => void loadModels(provider)}
                disabled={busyId === provider.id}
                className="shrink-0 rounded-lg border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/[0.06] disabled:opacity-50"
              >
                {busyId === provider.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Modelle laden'}
              </button>
            </div>
            {notice[provider.id] && <p className="text-[11px] text-zinc-500 break-words">{notice[provider.id]}</p>}
          </div>
        );
      })}
      <button
        onClick={() =>
          setApiProviders((current) => [
            ...current,
            {
              id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              name: 'Anthropic',
              provider: 'anthropic',
              baseUrl: '',
              apiKey: '',
              model: 'claude-sonnet-5',
            },
          ])
        }
        className="inline-flex items-center gap-1 text-xs text-orange-300 hover:text-orange-200"
      >
        <Plus className="w-3.5 h-3.5" />
        AI-Anbieter hinzufuegen
      </button>
    </div>
  );
}

export function ApiChatSetup({ onCancel }: { onCancel(): void }) {
  const { apiProviders, apiChatConfig, setApiChatConfig, startApiChat, folders, selectedProject, addProject } = useAppContext();
  const [projectId, setProjectId] = useState(() => (selectedProject && !selectedProject.isScratch ? selectedProject.id : ''));
  const knownFolderIds = useRef(new Set(folders.map((folder) => folder.id)));
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const update = (patch: Partial<typeof apiChatConfig>) => setApiChatConfig((current) => ({ ...current, ...patch }));
  const projects = folders.filter((folder) => !folder.isScratch);
  const activeProvider = apiProviders.find((item) => item.id === apiChatConfig.providerId);

  // After "Ordner oeffnen..." pick the newly added project automatically.
  useEffect(() => {
    const added = folders.find((folder) => !knownFolderIds.current.has(folder.id) && !folder.isScratch);
    knownFolderIds.current = new Set(folders.map((folder) => folder.id));
    if (added) setProjectId(added.id);
  }, [folders]);

  // Preselect the first saved provider.
  useEffect(() => {
    if (!activeProvider && apiProviders[0]) update({ providerId: apiProviders[0].id, model: apiProviders[0].model });
  }, [activeProvider, apiProviders]);

  const openSettings = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true }));

  const loadModels = async () => {
    if (!activeProvider) return;
    setLoadingModels(true);
    setError('');
    try {
      const list = await fetchModels(activeProvider);
      setModels(list);
      if (!list.length) setError('Keine Modelle gefunden.');
    } catch (err) {
      setError(cleanIpcError(err, 'Modelle konnten nicht geladen werden.'));
    } finally {
      setLoadingModels(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    setError('');
    try {
      await startApiChat(projectId || null);
    } catch (err) {
      setError(cleanIpcError(err, 'Chat konnte nicht gestartet werden.'));
      setStarting(false);
    }
  };

  return (
    <section className="panel w-full mt-8 p-6 border border-white/10 bg-black/20 backdrop-blur-md rounded-2xl shadow-xl space-y-5">
      <div>
        <div className="section-label">AI-Anbieter</div>
        {apiProviders.length === 0 ? (
          <p className="text-xs text-zinc-500 mt-3">
            Noch keine AI-Anbieter hinterlegt.{' '}
            <button onClick={openSettings} className="text-orange-300 hover:underline">
              In den Einstellungen anlegen
            </button>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {apiProviders.map((item) => {
              const selected = item.id === apiChatConfig.providerId;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    update({ providerId: item.id, model: item.model });
                    setModels([]);
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    selected ? 'border-orange-400/60 bg-orange-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="block text-sm text-white truncate">{item.name || 'Ohne Namen'}</span>
                  <span className="block text-[11px] font-mono text-zinc-500 truncate">{item.model || 'kein Standard-Modell'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {activeProvider && (
        <div className="grid gap-3">
          <label className="grid gap-1 text-[11px] text-zinc-500">
            Modell
            <div className="flex gap-2">
              <input
                value={apiChatConfig.model}
                onChange={(event) => update({ model: event.target.value })}
                className="input flex-1 min-w-0 font-mono"
                placeholder={activeProvider.model || 'z. B. claude-sonnet-5'}
                list="api-chat-models"
                autoComplete="off"
              />
              <datalist id="api-chat-models">
                {models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <button
                onClick={loadModels}
                disabled={loadingModels}
                className="shrink-0 rounded-lg border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/[0.06] disabled:opacity-50"
              >
                {loadingModels ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Modelle laden'}
              </button>
            </div>
          </label>
          <label className="grid gap-1 text-[11px] text-zinc-500">
            System-Prompt (optional)
            <textarea
              value={apiChatConfig.systemPrompt}
              onChange={(event) => update({ systemPrompt: event.target.value })}
              className="input w-full min-h-[64px] resize-y"
              placeholder="z. B. Antworte kurz und auf Deutsch."
            />
          </label>
        </div>
      )}

      <div>
        <div className="section-label">Projekt</div>
        <div className="flex gap-2 mt-3">
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="input flex-1 min-w-0">
            <option value="">Ohne Projekt</option>
            {projects.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.title}
              </option>
            ))}
          </select>
          <button
            onClick={() => void addProject()}
            className="shrink-0 rounded-lg border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            Ordner oeffnen...
          </button>
        </div>
        <label className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-400">
          <span>Dateiliste des Projekts als Kontext mitschicken</span>
          <input
            type="checkbox"
            checked={apiChatConfig.includeProjectFiles}
            onChange={(event) => update({ includeProjectFiles: event.target.checked })}
            className="h-4 w-4 accent-amber-300"
          />
        </label>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg break-words">{error}</div>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05]">
          Abbrechen
        </button>
        <button
          onClick={handleStart}
          disabled={starting || !activeProvider}
          className="primary-button flex-[2] !py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
          <span>Chat starten</span>
        </button>
      </div>
    </section>
  );
}

export function ApiChatView({ chat, renderMessage }: { chat: Chat; renderMessage(message: Chat['messages'][number]): React.ReactNode }) {
  const { sendApiMessage, apiPending, folders, themeBackgroundBehindComposer } = useAppContext();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const pending = Boolean(apiPending[chat.id]);
  const project = folders.find((folder) => folder.id === chat.folderId);
  const voice = useVoiceSettings();
  const textRef = useRef(text);
  textRef.current = text;
  const dictation = useDictation(
    (spoken) => setText((current) => appendSpoken(current, spoken)),
    () => window.setTimeout(() => send(true), 60),
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages.length, pending]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!voice.enabled) return;
      if ((event.altKey && event.key.toLowerCase() === 's') || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's')) {
        event.preventDefault();
        dictation.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dictation.toggle, voice.enabled]);

  const send = (fromVoice = false) => {
    const value = textRef.current.trim();
    if (!value || pending) return;
    if (!fromVoice && dictation.listening) dictation.stop();
    setText('');
    void sendApiMessage(chat.id, value);
  };

  return (
    <main className="flex-1 min-w-0 flex flex-col">
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-8">
        <div className="max-w-[760px] mx-auto flex flex-col gap-6">
          <div className="pb-4 border-b border-white/5">
            <h2 className="text-lg text-white font-medium">{chat.title}</h2>
            <p className="text-[11px] text-zinc-600 mt-1">
              {chat.api?.model} · {project && !project.isScratch ? project.path : 'Ohne Projekt'}
            </p>
          </div>
          {chat.messages.length === 0 && !pending && (
            <p className="text-sm text-zinc-600 text-center py-10">Schreib die erste Nachricht.</p>
          )}
          {chat.messages.map((message) => renderMessage(message))}
          {pending && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Antwort wird geladen...
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div
        className={`shrink-0 px-8 pb-5 pt-2 ${
          themeBackgroundBehindComposer ? 'bg-transparent' : 'bg-gradient-to-t from-[#111] via-[#111] to-transparent'
        }`}
      >
        <div className="mx-auto max-w-[760px] flex items-end gap-2 rounded-2xl border border-white/10 bg-[#1b181b] p-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Nachricht schreiben... (Enter senden, Shift+Enter neue Zeile)"
            className="flex-1 min-w-0 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none max-h-48"
          />
          {voice.enabled && voice.showMicButton && <button
            onClick={dictation.toggle}
            className={`rounded-lg p-2 transition-colors ${
              dictation.listening ? 'bg-red-500/20 text-red-300 animate-pulse' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'
            }`}
            title={dictation.listening ? 'Spracheingabe stoppen (Alt+S)' : 'Spracheingabe (Alt+S)'}
          >
            {dictation.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>}
          <button onClick={() => send()} disabled={pending || !text.trim()} className="primary-button !px-4 !py-2 disabled:opacity-40" title="Senden">
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
        {dictation.error && <p className="mx-auto mt-2 max-w-[760px] text-xs text-red-400">{dictation.error}</p>}
      </div>
    </main>
  );
}
