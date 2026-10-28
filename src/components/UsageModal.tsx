import { tr, locale } from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Gauge, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import type { FancyUsage, FancyUsageUnit, FancyUsageWindow } from '../electron';
import type { UsagePopupSeed } from '../AppContext';

type Kind = 'agent' | 'chat';
type UsageMap = Record<Kind, FancyUsage | null>;

const APPS: Record<Kind, 'fancycode-cli' | 'fancycode'> = {
  agent: 'fancycode-cli',
  chat: 'fancycode',
};

const TITLES: Record<Kind, string> = {
  agent: 'Globales KI-Limit',
  chat: 'Chat',
};

const percent = (window: FancyUsageWindow) => Math.max(0, Math.min(100, Math.ceil((window.used / window.limit) * 100)));

const barColor = (pct: number) => (pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-orange-500' : 'bg-amber-400');

const cleanError = (error: unknown) =>
  error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : tr("Die Nutzung konnte nicht geladen werden.");

function formatAmount(value: number, unit: FancyUsageUnit) {
  if (unit === 'messages') return value.toLocaleString(locale());
  return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function resetLabel(window: FancyUsageWindow) {
  if (!window.used || !window.resetAt) return '';
  const date = new Date(window.resetAt);
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(locale(), {
    ...(sameDay ? {} : { day: '2-digit', month: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Agent und eingebaute Chats teilen sich ein globales Token-Limit.
// `initial` sind die Agent-Werte, die die FancyCode-Ansicht schon kennt; das Popup zeigt sie
// sofort und aktualisiert im Hintergrund.
export default function UsageModal({ onClose, initial }: { onClose(): void; initial?: UsagePopupSeed | null }) {
  const [usage, setUsage] = useState<UsageMap>(() => ({ agent: initial ? (initial as FancyUsage) : null, chat: null }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState<Kind | null>(null);
  const [message, setMessage] = useState('');
  const hasData = useRef(Boolean(initial));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const api = window.agentWorkspace?.fancyAccount;
      if (!api) throw new Error(tr('Die Nutzung zeigt nur die Desktop-App.'));
      const [agent, chat] = await Promise.all([api.usage(APPS.agent), api.usage(APPS.chat)]);
      setUsage({ agent, chat });
      hasData.current = true;
    } catch (err) {
      // Mit Werten aus der FancyCode-Ansicht bleibt das Popup gefuellt, statt einen Fehler zu zeigen.
      if (!hasData.current) setError(cleanError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = async (kind: Kind) => {
    const api = window.agentWorkspace?.fancyAccount;
    const group = usage[kind];
    if (!api || !group || group.resets <= 0) return;
    const ok = window.confirm(
      tr("Limit für {name} zurücksetzen? Danach sind noch {left} von {total} Resets übrig.", {
        name: kind === 'chat' ? tr('globales KI-Limit mit Chat-Guthaben') : TITLES[kind],
        left: group.resets - 1,
        total: group.resets,
      }),
    );
    if (!ok) return;
    setResetting(kind);
    setError('');
    setMessage('');
    try {
      const next = await api.resetUsage(APPS[kind]);
      setUsage((current) => ({
        agent: current.agent ? { ...current.agent, fiveHour: next.fiveHour, weekly: next.weekly, resets: kind === 'agent' ? next.resets : current.agent.resets, unit: next.unit || current.agent.unit, plan: next.plan || current.agent.plan } : null,
        chat: current.chat ? { ...current.chat, fiveHour: next.fiveHour, weekly: next.weekly, resets: kind === 'chat' ? next.resets : current.chat.resets } : null,
      }));
      setMessage(tr("Limit zurückgesetzt."));
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setResetting(null);
    }
  };

  const sections: Kind[] = (['agent'] as Kind[]).filter((kind) => usage[kind]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-5 backdrop-blur-lg" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141214] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <Gauge className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
                {tr("FancyCode AI")}{usage.agent?.plan || usage.chat?.plan ? ` · ${(usage.agent?.plan || usage.chat?.plan) === 'max' ? 'Max' : (usage.agent?.plan || usage.chat?.plan) === 'pro' ? 'Pro' : 'Free'}` : ''}
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">{tr("Nutzung")}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
            aria-label={tr("Schließen")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && !sections.length && (
          <div className="flex items-center gap-2 py-10 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> {tr("Limit wird geladen …")}
          </div>
        )}

        {!sections.length && error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
            <button onClick={() => void load()} className="mt-3 flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100">
              <RefreshCw className="h-3.5 w-3.5" /> {tr("Erneut versuchen")}
            </button>
          </div>
        )}

        {sections.length > 0 && (
          <div className="max-h-[68vh] space-y-5 overflow-y-auto pr-1">
            {sections.map((kind, index) => (
              <div key={kind} className={index > 0 ? 'border-t border-white/10 pt-5' : undefined}>
                <UsageSection
                  kind={kind}
                  group={usage[kind]!}
                  resetting={resetting === kind}
                  disabled={resetting !== null}
                  onReset={() => void reset(kind)}
                  chatResets={usage.chat?.resets}
                  onChatReset={() => void reset('chat')}
                />
              </div>
            ))}
            {message && <div className="text-[11px] text-emerald-300">{message}</div>}
            {error && <div className="text-[11px] text-red-300">{error}</div>}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between text-[11px] text-zinc-600">
          <span>{tr("Direkt vom Server")}</span>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> {tr("Aktualisieren")}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsageSection({
  kind,
  group,
  resetting,
  disabled,
  onReset,
  chatResets,
  onChatReset,
}: {
  kind: Kind;
  group: FancyUsage;
  resetting: boolean;
  disabled: boolean;
  onReset(): void;
  chatResets?: number;
  onChatReset(): void;
}) {
  const unit: FancyUsageUnit = group.unit || (kind === 'agent' ? 'tokens' : 'messages');
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-zinc-100">{tr(TITLES[kind])}</h3>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{unit === 'tokens' ? tr('Tokens') : tr('Nachrichten')}</span>
      </div>
      <div className="space-y-4">
        <UsageBar label={tr("5-Stunden-Limit")} window={group.fiveHour} unit={unit} />
        <UsageBar label={tr("Wochenlimit (7 Tage)")} window={group.weekly} unit={unit} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-zinc-300">{tr("Limit-Resets")}</div>
          <div className="text-[11px] text-zinc-600">
            {group.resets > 0 ? tr("{count} verfügbar – setzt beide Fenster zurück", { count: group.resets }) : tr("Keine Resets verfügbar")}
          </div>
        </div>
        <button
          onClick={onReset}
          disabled={group.resets <= 0 || disabled}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {tr("Zurücksetzen")}
        </button>
      </div>
      {chatResets !== undefined && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[11px] text-zinc-500">{tr('Chat-Reset-Guthaben')}: {chatResets}</div>
          <button onClick={onChatReset} disabled={chatResets <= 0 || disabled} className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-40">
            <RotateCcw className="h-3.5 w-3.5" /> {tr('Globales Limit zurücksetzen')}
          </button>
        </div>
      )}
    </section>
  );
}

function UsageBar({ label, window, unit }: { label: string; window: FancyUsageWindow; unit: FancyUsageUnit }) {
  const pct = percent(window);
  const reset = resetLabel(window);
  const unitLabel = unit === 'tokens' ? tr('Tokens') : tr('Nachrichten');
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-zinc-300">{label}</span>
        <span className="text-lg font-semibold tabular-nums text-zinc-100">{pct} %</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-zinc-600">
        <span className="tabular-nums">
          {formatAmount(window.used, unit)} / {formatAmount(window.limit, unit)} {unitLabel}
        </span>
        <span>{window.used >= window.limit ? tr("Limit erreicht") : reset ? `Reset: ${reset}` : tr("Noch nichts verbraucht")}</span>
      </div>
    </div>
  );
}
