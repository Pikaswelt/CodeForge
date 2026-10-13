import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronLeft, Copy, FolderGit2, MessageSquare, Plus, SendHorizontal, Settings2, Trash2 } from 'lucide-react';
import { listModels, sendChat } from '../apiChat';
import { Native, errorMessage } from '../native';
import { gitBranch, projectFiles } from '../remote';
import { newId, useStore } from '../store';
import type { ApiChat, ChatMessage } from '../types';
import { Button, Card, EmptyState, Field, IconButton, ScreenHeader, Section, Sheet, Spinner, Toggle, cx, timeAgo } from '../ui';

export default function ChatScreen() {
  const { chats, setChats, apiProviders, setTab } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const chat = chats.find((item) => item.id === openId);

  if (chat) return <ChatView chat={chat} onBack={() => setOpenId(null)} />;

  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Chat"
        subtitle="Direkt mit Claude, GPT & Co. über deine API-Keys"
        actions={apiProviders.length > 0 && (
          <IconButton label="Neuer Chat" className="cf-glass" onClick={() => setCreating(true)}>
            <Plus className="h-5 w-5" />
          </IconButton>
        )}
      />
      <div className="cf-scroll min-h-0 flex-1 px-4 pb-6">
        {apiProviders.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Bot className="h-8 w-8" />}
              title="Noch kein KI-Provider"
              text="Lege in den Einstellungen einen Provider an (Anthropic, OpenAI oder OpenAI-kompatibel wie OpenRouter oder Ollama auf deinem Server)."
              action={<Button variant="primary" icon={<Settings2 className="h-4 w-4" />} onClick={() => setTab('settings')}>Zu den Einstellungen</Button>}
            />
          </Card>
        ) : sorted.length === 0 ? (
          <Card>
            <EmptyState
              icon={<MessageSquare className="h-8 w-8" />}
              title="Noch keine Chats"
              text="Starte einen Chat. Du kannst einen Projektordner auf dem V-Server anhängen, dann kennt das Modell die Dateiliste."
              action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Neuer Chat</Button>}
            />
          </Card>
        ) : (
          <div className="cf-glass cf-card overflow-hidden">
            {sorted.map((item, index) => (
              <div key={item.id} className={cx('flex items-center', index > 0 && 'border-t border-cf-line')}>
                <button className="cf-press flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left active:bg-cf-hover" onClick={() => setOpenId(item.id)}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cf-hover cf-accent-text">
                    {item.project ? <FolderGit2 className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.93rem] font-medium">{item.title}</span>
                    <span className="cf-muted block truncate text-[0.76rem]">{item.model} · {timeAgo(item.updatedAt)}</span>
                  </span>
                </button>
                <IconButton label="Löschen" className="mr-1" onClick={() => setChats((current) => current.filter((entry) => entry.id !== item.id))}>
                  <Trash2 className="cf-muted h-4 w-4" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
      {creating && <NewChatSheet onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
    </div>
  );
}

function NewChatSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { apiProviders, servers, setChats, toast } = useStore();
  const [providerId, setProviderId] = useState(apiProviders[0]?.id || '');
  const provider = apiProviders.find((item) => item.id === providerId);
  const [model, setModel] = useState(provider?.model || '');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [serverId, setServerId] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [includeFiles, setIncludeFiles] = useState(true);

  useEffect(() => {
    setModel(provider?.model || '');
    setModels([]);
  }, [provider?.id, provider?.model]);

  const loadModels = async () => {
    if (!provider) return;
    setLoadingModels(true);
    try {
      setModels(await listModels(provider));
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setLoadingModels(false);
    }
  };

  const create = () => {
    if (!provider || !model.trim()) return;
    const server = servers.find((item) => item.id === serverId);
    const chat: ApiChat = {
      id: newId(),
      title: server && projectPath.trim() ? projectPath.trim().split('/').filter(Boolean).pop() || 'Neuer Chat' : 'Neuer Chat',
      providerId: provider.id,
      model: model.trim(),
      systemPrompt,
      project: server && projectPath.trim() ? { serverId: server.id, path: projectPath.trim() } : undefined,
      includeFiles,
      messages: [],
      updatedAt: Date.now(),
    };
    setChats((current) => [chat, ...current]);
    onCreated(chat.id);
  };

  return (
    <Sheet title="Neuer Chat" full onClose={onClose} footer={<Button variant="primary" className="flex-1" disabled={!provider || !model.trim()} onClick={create}>Chat starten</Button>}>
      <Field label="Provider">
        <select className="cf-input" value={providerId} onChange={(event) => setProviderId(event.target.value)}>
          {apiProviders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </Field>
      <Field label="Modell">
        <div className="flex gap-2">
          {models.length ? (
            <select className="cf-input flex-1" value={model} onChange={(event) => setModel(event.target.value)}>
              {!models.includes(model) && model && <option value={model}>{model}</option>}
              {models.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          ) : (
            <input className="cf-input flex-1" value={model} onChange={(event) => setModel(event.target.value)} placeholder="z.B. claude-sonnet-4-5" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          )}
          <Button onClick={() => void loadModels()} busy={loadingModels}>Laden</Button>
        </div>
      </Field>
      <Field label="System-Prompt (optional)">
        <textarea className="cf-input h-24 resize-none" value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} placeholder="Du bist ein hilfreicher Senior-Entwickler …" />
      </Field>
      {servers.length > 0 && (
        <Section title="Projekt auf dem V-Server (optional)">
          <Field label="V-Server">
            <select className="cf-input" value={serverId} onChange={(event) => {
              setServerId(event.target.value);
              const server = servers.find((item) => item.id === event.target.value);
              if (server?.defaultPath && !projectPath) setProjectPath(server.defaultPath);
            }}>
              <option value="">Kein Projekt</option>
              {servers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
          {serverId && (
            <>
              <Field label="Projektordner">
                <input className="cf-input" value={projectPath} onChange={(event) => setProjectPath(event.target.value)} placeholder="/root/mein-projekt" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              </Field>
              <div className="cf-glass cf-card overflow-hidden">
                <Toggle checked={includeFiles} onChange={setIncludeFiles} label="Dateiliste mitsenden" description="Name, Pfad, Git-Branch und bis zu 400 Dateien als Kontext" />
              </div>
            </>
          )}
        </Section>
      )}
    </Sheet>
  );
}

function ChatView({ chat, onBack }: { chat: ApiChat; onBack: () => void }) {
  const { apiProviders, servers, setChats, withServer, toast } = useStore();
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const context = useRef<string | null>(null);
  const provider = apiProviders.find((item) => item.id === chat.providerId);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [chat.messages.length, pending]);

  const update = (patch: (current: ApiChat) => ApiChat) => setChats((current) => current.map((item) => (item.id === chat.id ? patch(item) : item)));

  const projectContext = async () => {
    if (context.current !== null || !chat.project) return context.current || '';
    const server = servers.find((item) => item.id === chat.project!.serverId);
    if (!server) return '';
    try {
      const [files, branch] = await withServer(server, () => Promise.all([chat.includeFiles ? projectFiles(server, chat.project!.path) : Promise.resolve([]), gitBranch(server, chat.project!.path)]));
      context.current = [
        `Projekt: ${chat.project.path.split('/').filter(Boolean).pop()} (auf dem V-Server ${server.name})`,
        `Pfad: ${chat.project.path}`,
        branch ? `Git-Branch: ${branch}` : '',
        files.length ? `Dateien:\n${files.join('\n')}` : '',
      ].filter(Boolean).join('\n');
    } catch {
      context.current = `Projekt: ${chat.project.path}`;
    }
    return context.current;
  };

  const send = async () => {
    const content = text.trim();
    if (!content || pending || !provider) return;
    setText('');
    const message: ChatMessage = { id: newId(), role: 'user', content, at: Date.now() };
    const history = [...chat.messages.filter((item) => !item.error), message];
    update((current) => ({ ...current, messages: [...current.messages, message], updatedAt: Date.now(), title: current.messages.length === 0 && !current.project ? content.slice(0, 48) : current.title }));
    setPending(true);
    try {
      const project = await projectContext();
      const system = [chat.systemPrompt, project].filter(Boolean).join('\n\n');
      const result = await sendChat(provider, chat.model, system, history.map((item) => ({ role: item.role, content: item.content })));
      update((current) => ({ ...current, messages: [...current.messages, { id: newId(), role: 'assistant', content: result.text || '(leere Antwort)', at: Date.now(), tokens: result.tokens }], updatedAt: Date.now() }));
    } catch (error) {
      update((current) => ({ ...current, messages: [...current.messages, { id: newId(), role: 'assistant', content: errorMessage(error), at: Date.now(), error: true }], updatedAt: Date.now() }));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="cf-glass cf-safe-top flex shrink-0 items-center gap-1 border-x-0 border-t-0 px-2 pb-2">
        <IconButton label="Zurück" onClick={onBack}>
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[1rem] font-semibold">{chat.title}</div>
          <div className="cf-muted truncate text-[0.74rem]">{provider?.name || 'Provider fehlt'} · {chat.model}{chat.project ? ` · ${chat.project.path}` : ''}</div>
        </div>
      </div>
      <div ref={list} className="cf-scroll min-h-0 flex-1 space-y-3 px-3 py-3">
        {chat.messages.length === 0 && <p className="cf-muted py-10 text-center text-[0.88rem]">Schreib die erste Nachricht.</p>}
        {chat.messages.map((message) => (
          <Bubble key={message.id} message={message} onCopy={() => void Native.copyText({ text: message.content }).then(() => toast('Kopiert.', 'success'))} />
        ))}
        {pending && (
          <div className="cf-glass flex w-fit items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3">
            <Spinner className="h-4 w-4" />
            <span className="cf-muted text-[0.85rem]">Denkt nach …</span>
          </div>
        )}
      </div>
      <div className="cf-glass flex shrink-0 items-end gap-2 border-x-0 border-b-0 px-2 py-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={Math.min(6, Math.max(1, text.split('\n').length))}
          placeholder={provider ? 'Nachricht …' : 'Provider fehlt'}
          disabled={!provider}
          className="cf-input min-h-[2.75rem] flex-1 resize-none py-2.5 leading-snug"
        />
        <button onClick={() => void send()} disabled={!text.trim() || pending || !provider} className="cf-press cf-accent-bg flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-lg" aria-label="Senden">
          <SendHorizontal className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function Bubble({ message, onCopy }: { message: ChatMessage; onCopy: () => void }) {
  const mine = message.role === 'user';
  const parts = useMemo(() => splitCode(message.content), [message.content]);
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'cf-selectable cf-markdown max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[0.92rem] leading-relaxed',
          mine ? 'cf-accent-bg rounded-br-md' : 'cf-glass rounded-bl-md',
          message.error && 'border-red-500/40 text-red-300',
        )}
      >
        {parts.map((part, index) =>
          part.code ? (
            <pre key={index}><code>{part.text}</code></pre>
          ) : (
            <p key={index} className="whitespace-pre-wrap break-words">{renderInline(part.text)}</p>
          ),
        )}
        {!mine && !message.error && (
          <button onClick={onCopy} className="cf-muted mt-1 flex items-center gap-1 text-[0.72rem]">
            <Copy className="h-3 w-3" /> Kopieren{message.tokens ? ` · ${message.tokens} Tokens` : ''}
          </button>
        )}
      </div>
    </div>
  );
}

function splitCode(text: string) {
  const parts: { code: boolean; text: string }[] = [];
  const pattern = /```[^\n]*\n([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push({ code: false, text: text.slice(last, match.index).trim() });
    parts.push({ code: true, text: match[1].replace(/\n$/, '') });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ code: false, text: text.slice(last).trim() });
  return parts.filter((part) => part.text);
}

function renderInline(text: string) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((piece, index) => {
    if (piece.startsWith('`') && piece.endsWith('`') && piece.length > 2) return <code key={index} className="rounded bg-black/25 px-1">{piece.slice(1, -1)}</code>;
    if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) return <strong key={index}>{piece.slice(2, -2)}</strong>;
    return piece;
  });
}
