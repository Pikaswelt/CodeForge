import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Link2, Loader2, ShieldCheck, Unlink, X } from 'lucide-react';
import type { FancyAccount } from '../electron.d';

type Provider = 'discord' | 'github';
const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'discord', label: 'Discord' },
  { id: 'github', label: 'GitHub' },
];

const cleanError = (error: unknown) =>
  error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : tr('Unbekannter Fehler');

// Wer „Später“ gewählt hat, sieht das Fenster „Konto absichern“ nicht noch einmal (nur den Hinweis in den Einstellungen).
const askedKey = (id: string) => `fancy:link-asked:${id}`;
export const markLinkAsked = (id: string) => localStorage.setItem(askedKey(id), String(Date.now()));

// Zugangscode + verknüpfte Konten (Einstellungen → Konto und Fenster „Konto absichern“).
export function FancyLoginMethods({ compact = false }: { compact?: boolean }) {
  const api = window.agentWorkspace?.fancyAccount;
  const [me, setMe] = useState<FancyAccount | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [newCode, setNewCode] = useState('');

  useEffect(() => {
    void api?.me().then(setMe).catch((e) => setError(cleanError(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!api) return null;
  if (!me) return error ? <p className="text-xs text-red-300">{error}</p> : <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />;
  if (!me.identities) return <p className="text-xs text-zinc-500">{tr('Der Konto-Server unterstützt das noch nicht.')}</p>;

  const run = async (key: string, fn: () => Promise<FancyAccount | null | void>) => {
    setError('');
    setBusy(key);
    try {
      const next = await fn();
      if (next) setMe(next);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy('');
    }
  };

  const rotate = () =>
    run('code', async () => {
      if (me.accessCode?.set && !confirm(tr('Neuen Zugangscode erzeugen? Der alte gilt dann nicht mehr (bestehende Anmeldungen bleiben).'))) return;
      setNewCode(await api.newAccessCode());
      return api.me();
    });

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <KeyRound className="h-4 w-4 shrink-0 text-orange-300" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-zinc-200">{tr('Zugangscode')}</div>
            <div className="font-mono text-xs text-zinc-500">
              {me.accessCode?.set ? `FS-••••-••••-••••-${me.accessCode.hint}` : tr('Noch keiner – erzeuge einen, um dich per Code anzumelden.')}
            </div>
          </div>
          <button disabled={!!busy} onClick={() => void rotate()} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40">
            {busy === 'code' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : me.accessCode?.set ? tr('Neu erzeugen') : tr('Erzeugen')}
          </button>
        </div>
      )}
      {PROVIDERS.map((p) => {
        const id = me.identities!.find((i) => i.provider === p.id);
        return (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            {id?.avatar ? <img src={id.avatar} alt="" className="h-6 w-6 rounded-full" /> : <Link2 className="h-4 w-4 shrink-0 text-zinc-500" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-200">{p.label}</div>
              <div className="truncate text-xs text-zinc-500">{id ? tr('Verknüpft als {name}', { name: id.name }) : tr('Nicht verknüpft')}</div>
            </div>
            {id ? (
              <button
                disabled={!!busy}
                onClick={() => void run(p.id, async () => (confirm(tr('{name} trennen?', { name: p.label })) ? api.unlink(p.id) : null))}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-40"
              >
                {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Unlink className="h-3.5 w-3.5" /> {tr('Trennen')}</>}
              </button>
            ) : (
              <button
                disabled={!!busy}
                onClick={() => void run(p.id, () => api.link(p.id))}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40 ${p.id === 'discord' ? 'bg-[#5865f2]' : 'bg-zinc-700'}`}
              >
                {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tr('Verbinden')}
              </button>
            )}
          </div>
        );
      })}
      {(busy === 'discord' || busy === 'github') && (
        <p className="text-xs text-zinc-400">
          {tr('Der Browser öffnet sich – bestätige dort und kehre dann zurück.')}{' '}
          <button className="text-orange-300 hover:underline" onClick={() => void api.cancel()}>{tr('Abbrechen')}</button>
        </p>
      )}
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      {newCode && <AccessCodeDialog code={newCode} onClose={() => setNewCode('')} />}
    </div>
  );
}

// Zeigt einen frischen Zugangscode genau einmal. first = gerade neues Konto angelegt.
export function AccessCodeDialog({ code, first = false, onClose }: { code: string; first?: boolean; onClose(): void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Overlay onClose={onClose} sticky>
      <h2 className="text-lg font-semibold">{first ? tr('Willkommen! Dein Zugangscode') : tr('Dein neuer Zugangscode')}</h2>
      <p className="mt-1 text-sm text-zinc-400">{tr('Damit meldest du dich in allen FancyServers-Apps an. Er wird nur jetzt angezeigt – speichere ihn gut.')}</p>
      <div className="mt-4 select-all rounded-xl border border-dashed border-orange-400/60 bg-black/30 px-3 py-3 text-center font-mono text-lg tracking-wider text-orange-100">{code}</div>
      <button
        onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true))}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-zinc-800 text-sm font-medium hover:bg-zinc-700"
      >
        {copied ? <><Check className="h-4 w-4 text-emerald-400" /> {tr('Kopiert')}</> : <><Copy className="h-4 w-4" /> {tr('Kopieren')}</>}
      </button>
      {first && (
        <div className="mt-4 rounded-xl border border-orange-400/30 bg-orange-500/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-orange-100"><ShieldCheck className="h-4 w-4" /> {tr('Konto absichern (empfohlen)')}</div>
          <p className="mb-3 text-xs text-zinc-300">{tr('Verknüpfe Discord oder GitHub. Dann kommst du auch ohne Zugangscode wieder in dein Konto.')}</p>
          <FancyLoginMethods compact />
        </div>
      )}
      <button onClick={onClose} className="mt-4 w-full rounded-xl bg-orange-500 py-2 text-sm font-semibold text-black hover:brightness-110">
        {first ? tr('Code gespeichert – weiter') : tr('Fertig')}
      </button>
    </Overlay>
  );
}

// Nach dem Login: einmal pro Konto „Konto absichern“ anbieten, solange nichts verknüpft ist.
export function SecureAccountPrompt() {
  const api = window.agentWorkspace?.fancyAccount;
  const [me, setMe] = useState<FancyAccount | null>(null);
  useEffect(() => {
    void api
      ?.me()
      .then((u) => {
        if (u?.suggestLink && !localStorage.getItem(askedKey(u.id))) setMe(u);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  const close = () => {
    markLinkAsked(me.id);
    setMe(null);
  };
  return (
    <Overlay onClose={close}>
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-orange-300" /><h2 className="text-lg font-semibold">{tr('Konto absichern')}</h2></div>
      <p className="mt-1 mb-4 text-sm text-zinc-400">{tr('Verknüpfe Discord oder GitHub. Dann kommst du auch ohne Zugangscode wieder in dein Konto – auf jedem Gerät und in jeder App.')}</p>
      <FancyLoginMethods compact />
      <p className="mt-3 text-[11px] text-zinc-500">{tr('Du findest das jederzeit unter Einstellungen → Konto.')}</p>
      <button onClick={close} className="mt-4 w-full rounded-xl border border-white/15 py-2 text-sm text-zinc-300 hover:bg-white/10">{tr('Später')}</button>
    </Overlay>
  );
}

// sticky: Klick daneben schließt nicht (Zugangscode soll nicht versehentlich verschwinden).
function Overlay({ children, onClose, sticky = false }: { children: React.ReactNode; onClose(): void; sticky?: boolean }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4 text-zinc-100" onMouseDown={(e) => !sticky && e.target === e.currentTarget && onClose()}>
      <div className="relative w-[min(460px,100%)] rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"><X className="h-4 w-4" /></button>
        {children}
      </div>
    </div>
  );
}
