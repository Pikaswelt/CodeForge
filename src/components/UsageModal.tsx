import { tr, locale } from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Gauge, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import type { FancyUsage, FancyUsageWindow } from '../electron';
import type { UsagePopupSeed } from '../AppContext';

const percent = (window: FancyUsageWindow) => Math.max(0, Math.min(100, Math.ceil((window.used / window.limit) * 100)));

const barColor = (pct: number) => (pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-orange-500' : 'bg-amber-400');

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

// Verbrauch der eingebauten KI: zwei Fenster, nur Prozent und Balken, direkt vom Server.
// `initial` sind Werte, die die FancyCode-Ansicht schon kennt; das Popup zeigt sie sofort und
// aktualisiert im Hintergrund.
export default function UsageModal({ onClose, initial }: { onClose(): void; initial?: UsagePopupSeed | null }) {
  const [usage, setUsage] = useState<FancyUsage | null>(() => (initial ? (initial as FancyUsage) : null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');
  const hasData = useRef(Boolean(initial));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const api = window.agentWorkspace?.fancyAccount;
      if (!api) throw new Error(tr('Die Nutzung zeigt nur die Desktop-App.'));
      setUsage(await api.usage());
      hasData.current = true;
    } catch (err) {
      // Mit Werten aus der FancyCode-Ansicht bleibt das Popup gefuellt, statt einen Fehler zu zeigen.
      if (!hasData.current) {
        setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : tr("Die Nutzung konnte nicht geladen werden."));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = async () => {
    const api = window.agentWorkspace?.fancyAccount;
    if (!api || !usage || usage.resets <= 0) return;
    const ok = window.confirm(
      tr("Gesamtes Limit zurücksetzen? Danach sind noch {left} von {total} Resets übrig.", { left: usage.resets - 1, total: usage.resets }),
    );
    if (!ok) return;
    setResetting(true);
    setError('');
    setMessage('');
    try {
      const next = await api.resetUsage();
      setUsage({ fiveHour: next.fiveHour, weekly: next.weekly, resets: next.resets });
      setMessage(tr("Limit zurückgesetzt."));
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : tr("Das Limit konnte nicht zurückgesetzt werden."));
    } finally {
      setResetting(false);
    }
  };

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
                {tr("FancyCode AI")}{usage?.plan ? ` · ${usage.plan === 'max' ? 'Max' : usage.plan === 'pro' ? 'Pro' : 'Free'}` : ''}
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

        {loading && !usage && (
          <div className="flex items-center gap-2 py-10 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> {tr("Limit wird geladen …")}
          </div>
        )}

        {!usage && error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
            <button onClick={() => void load()} className="mt-3 flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100">
              <RefreshCw className="h-3.5 w-3.5" /> {tr("Erneut versuchen")}
            </button>
          </div>
        )}

        {usage && (
          <div className="space-y-5">
            <UsageBar label={tr("5-Stunden-Limit")} window={usage.fiveHour} />
            <UsageBar label={tr("Wochenlimit (7 Tage)")} window={usage.weekly} />

            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="min-w-0">
                <div className="text-[13px] text-zinc-300">{tr("Limit-Resets")}</div>
                <div className="text-[11px] text-zinc-600">
                  {usage.resets > 0 ? tr("{count} verfügbar – setzt beide Fenster zurück", { count: usage.resets }) : tr("Keine Resets verfügbar")}
                </div>
              </div>
              <button
                onClick={() => void reset()}
                disabled={usage.resets <= 0 || resetting}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {tr("Zurücksetzen")}
              </button>
            </div>
            {message && <div className="text-[11px] text-emerald-300">{message}</div>}
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

function UsageBar({ label, window }: { label: string; window: FancyUsageWindow }) {
  const pct = percent(window);
  const reset = resetLabel(window);
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
      <div className="mt-1 text-[11px] text-zinc-600">
        {window.used >= window.limit ? tr("Limit erreicht") : reset ? `Reset: ${reset}` : tr("Noch nichts verbraucht")}
      </div>
    </div>
  );
}
