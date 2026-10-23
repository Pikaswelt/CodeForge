// Popups, Fragen und Formulare, die Agenten über den MCP-Server schicken (fancycode_notify/_ask/_form).
// AppContext nimmt die Anfragen vom Hauptprozess an, AgentPopups zeigt sie; Antworten gehen über resolve zurück.

export type PopupKind = 'info' | 'success' | 'warning' | 'error';

export type FormField = {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'radio';
  options: string[];
  placeholder: string;
  default?: unknown;
  required: boolean;
  help: string;
};

type Base = { id: number; title: string; message: string; kind: PopupKind; sessionId: string; source: string; createdAt: number };

export type AgentPopup =
  | (Base & { type: 'notify'; buttonLabel: string; connect: boolean })
  | (Base & { type: 'ask'; question: string; options: string[]; allowText: boolean; expiresAt: number; resolve: (value: unknown) => void })
  | (Base & { type: 'form'; fields: FormField[]; submitLabel: string; expiresAt: number; resolve: (value: unknown) => void });

let popups: AgentPopup[] = [];
let seq = 0;
const listeners = new Set<(items: AgentPopup[]) => void>();
let focusHandler: ((sessionId: string) => void) | null = null;

const emit = () => listeners.forEach((listener) => listener(popups));

export function subscribePopups(listener: (items: AgentPopup[]) => void) {
  listeners.add(listener);
  listener(popups);
  return () => {
    listeners.delete(listener);
  };
}

export function setPopupFocusHandler(handler: (sessionId: string) => void) {
  focusHandler = handler;
}

export function focusPopupSession(sessionId: string) {
  if (sessionId) focusHandler?.(sessionId);
}

export function dismissPopup(id: number, answer?: unknown) {
  const popup = popups.find((item) => item.id === id);
  if (!popup) return;
  popups = popups.filter((item) => item.id !== id);
  if (popup.type !== 'notify') popup.resolve(answer ?? { dismissed: true });
  emit();
}

function base(args: any): Omit<Base, 'id'> {
  return {
    title: String(args?.title || ''),
    message: String(args?.message || ''),
    kind: (['info', 'success', 'warning', 'error'].includes(args?.kind) ? args.kind : 'info') as PopupKind,
    sessionId: String(args?.sessionId || ''),
    source: String(args?.source || ''),
    createdAt: Date.now(),
  };
}

export function pushNotify(args: any) {
  const connect = Boolean(args?.connect);
  // The same agent restarting its MCP server within a minute shows only one "connected" popup.
  if (connect && popups.some((item) => item.type === 'notify' && item.connect && item.sessionId === String(args?.sessionId || '') && Date.now() - item.createdAt < 60_000)) return;
  // A popup that only reports something keeps at most the five newest.
  const others = popups.filter((item) => item.type !== 'notify');
  const notes = popups.filter((item) => item.type === 'notify').slice(-4);
  popups = [...others, ...notes, { ...base(args), id: ++seq, type: 'notify', buttonLabel: String(args?.buttonLabel || ''), connect }];
  emit();
}

function waitFor(args: any, make: (resolve: (value: unknown) => void, expiresAt: number) => AgentPopup) {
  return new Promise((resolve) => {
    const timeoutMs = Math.max(15_000, Number(args?.timeoutMs) || 600_000);
    const popup = make(resolve, Date.now() + timeoutMs);
    popups = [...popups, popup];
    emit();
    // Gone from the window once the agent stops waiting.
    setTimeout(() => {
      if (popups.some((item) => item.id === popup.id)) dismissPopup(popup.id, { timedOut: true });
    }, timeoutMs);
  });
}

export function pushAsk(args: any) {
  return waitFor(args, (resolve, expiresAt) => ({
    ...base(args),
    id: ++seq,
    type: 'ask',
    question: String(args?.question || args?.title || ''),
    options: Array.isArray(args?.options) ? args.options.map(String) : [],
    allowText: Boolean(args?.allowText),
    expiresAt,
    resolve,
  }));
}

export function pushForm(args: any) {
  return waitFor(args, (resolve, expiresAt) => ({
    ...base(args),
    id: ++seq,
    type: 'form',
    fields: Array.isArray(args?.fields) ? args.fields : [],
    submitLabel: String(args?.submitLabel || ''),
    expiresAt,
    resolve,
  }));
}
