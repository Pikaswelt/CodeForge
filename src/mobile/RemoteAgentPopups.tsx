import { useEffect, useMemo, useState } from 'react';
import { HelpCircle, Send } from 'lucide-react';
import { tr } from '../i18n';
import { Native, errorMessage } from './native';
import { answerRemoteAgent, ensureAgentWatch, type RemoteAgentEvent } from './remote';
import { useStore } from './store';
import type { MobileServer } from './types';
import { Button, Field, Sheet } from './ui';

type Pending = { server: MobileServer; event: RemoteAgentEvent };

// Agent questions arrive through the same SSH connection as the terminals: the server-side MCP
// server appends them to ~/.fancycode/ui/events.jsonl, the app tails that file and answers by
// writing the response next to it.
export default function RemoteAgentPopups() {
  const { servers, status, settings, toast } = useStore();
  const [queue, setQueue] = useState<Pending[]>([]);
  const [text, setText] = useState('');
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  const online = useMemo(
    () => servers.filter((server) => status[server.id]?.state === 'online'),
    [servers, status],
  );

  useEffect(() => {
    const offs = online.map((server) =>
      ensureAgentWatch(server, (event) => {
        setQueue((current) => (current.some((item) => item.event.id === event.id) ? current : [...current, { server, event }]));
      }),
    );
    return () => offs.forEach((off) => off());
    // Watch every connected server for as long as the app runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online.map((server) => server.id).join(',')]);

  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    if (current.event.type !== 'notify') {
      setText('');
      setForm({});
      // The sheet only shows while the app is in front; notify while it is in the background.
      if (settings.notifications && document.visibilityState !== 'visible') {
        const { event } = current;
        void Native.notify({
          title: event.title || tr('Frage vom Agenten'),
          body: event.question || event.message || '',
        }).catch(() => {});
      }
      return;
    }
    const { event } = current;
    const title = event.title || 'FancyCode';
    const body = event.message || '';
    toast(body ? `${title}: ${body}` : title, event.kind === 'error' ? 'error' : event.kind === 'success' ? 'success' : 'info');
    if (settings.notifications) void Native.notify({ title, body }).catch(() => {});
    setQueue((items) => items.slice(1));
  }, [current?.event.id]);

  if (!current || current.event.type === 'notify') return null;
  const { server, event } = current;

  const finish = async (value: unknown) => {
    setBusy(true);
    try {
      await answerRemoteAgent(server, event.id, { answer: value });
      setQueue((items) => items.slice(1));
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (event.type === 'ask') {
    return (
      <Sheet
        title={event.title || tr('Frage vom Agenten')}
        onClose={() => void finish({ dismissed: true })}
        footer={
          event.allowText ? (
            <Button
              className="w-full"
              variant="primary"
              busy={busy}
              icon={<Send className="h-4 w-4" />}
              disabled={!text.trim()}
              onClick={() => void finish(text.trim())}
            >
              {tr('Antwort senden')}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-[0.95rem] font-medium">
            <HelpCircle className="cf-accent-text mt-0.5 h-5 w-5 shrink-0" />
            <span>{event.question}</span>
          </div>
          {event.message && <p className="cf-muted whitespace-pre-line text-[0.85rem] leading-relaxed">{event.message}</p>}
          {(event.options?.length || 0) > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              {event.options!.map((option) => (
                <Button key={option} className="w-full justify-start" busy={busy} onClick={() => void finish(option)}>
                  {option}
                </Button>
              ))}
            </div>
          )}
          {event.allowText && (
            <Field label={tr('Eigene Antwort')}>
              <textarea className="cf-input min-h-24" value={text} onChange={(change) => setText(change.target.value)} />
            </Field>
          )}
          <div className="cf-muted text-[0.7rem]">{server.name}</div>
        </div>
      </Sheet>
    );
  }

  const fields = event.fields || [];
  return (
    <Sheet
      title={event.title || tr('Eingabe vom Agenten')}
      onClose={() => void finish({ dismissed: true })}
      footer={
        <Button className="w-full" variant="primary" busy={busy} icon={<Send className="h-4 w-4" />} onClick={() => void finish(form)}>
          {event.submitLabel || tr('Senden')}
        </Button>
      }
    >
      <div className="space-y-3">
        {event.message && <p className="cf-muted whitespace-pre-line text-[0.85rem] leading-relaxed">{event.message}</p>}
        {fields.map((field) => (
          <Field key={field.name} label={field.label + (field.required ? ' *' : '')} hint={field.help}>
            {field.type === 'textarea' ? (
              <textarea
                className="cf-input min-h-24"
                value={String(form[field.name] ?? '')}
                onChange={(change) => setForm((current) => ({ ...current, [field.name]: change.target.value }))}
              />
            ) : field.type === 'select' ? (
              <select
                className="cf-input"
                value={String(form[field.name] ?? '')}
                onChange={(change) => setForm((current) => ({ ...current, [field.name]: change.target.value }))}
              >
                <option value="">–</option>
                {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : field.type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={Boolean(form[field.name])}
                onChange={(change) => setForm((current) => ({ ...current, [field.name]: change.target.checked }))}
              />
            ) : (
              <input
                className="cf-input"
                type={field.type === 'number' ? 'number' : 'text'}
                value={String(form[field.name] ?? '')}
                placeholder={field.placeholder}
                onChange={(change) => setForm((current) => ({ ...current, [field.name]: change.target.value }))}
              />
            )}
          </Field>
        ))}
        <div className="cf-muted text-[0.7rem]">{server.name}</div>
      </div>
    </Sheet>
  );
}
