import { tr } from '../i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, KeyRound, Loader2 } from 'lucide-react';
import { startTeam, stopTeam } from '../collab/team';
import { AccessCodeDialog, SecureAccountPrompt, markLinkAsked } from './FancyLoginMethods';

type FreshAccount = { id: string; code: string };

// Rechtstexte liegen zentral beim FancyServers-Konto.
export const LEGAL_BASE = 'https://account.crazymine.de';

const cleanError = (error: unknown) =>
  error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : tr("Unbekannter Fehler");

// Login: Hauptweg Discord/GitHub (verknüpfte Konten). Klein darunter der Code-Login: Zugangscode (FS-…) für
// bestehende Konten, Einladungscode (FG-…) legt ein neues Konto an. Offline reicht ein früher
// bestätigter Zugang. Nach dem Login wird einmal empfohlen, Discord oder GitHub zu verknüpfen.
export function FancyAccessGate({ children }: { children: ReactNode }) {
  const api = window.agentWorkspace?.fancyAccount;
  const [state, setState] = useState<'checking' | 'locked' | 'open'>(api ? 'checking' : 'open');
  const [fresh, setFresh] = useState<FreshAccount | null>(null);

  const check = async () => {
    if (!api) return setState('open');
    try {
      if (!(await api.available())) return setState('open');
      setState((await api.me()) ? 'open' : 'locked');
    } catch {
      setState((await api.wasGranted().catch(() => false)) ? 'open' : 'locked');
    }
  };

  useEffect(() => {
    void check();
    // Abmelden im Kontomenü führt zurück zum Zugang.
    const onLogout = () => {
      stopTeam();
      setState('locked');
    };
    window.addEventListener('fancy:logged-out', onLogout);
    return () => window.removeEventListener('fancy:logged-out', onLogout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Angemeldet: Team-Verbindung (FancyAgent) starten, damit Einladungen und Anfragen als Popup ankommen.
  useEffect(() => {
    if (state === 'open' && api) startTeam().catch((e) => console.warn('[team]', e));
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'checking') return <div className="fixed inset-0 bg-black" />;
  if (state === 'locked') return <AccessScreen onDone={(f) => { setFresh(f || null); void check(); }} />;
  return (
    <>
      {children}
      {fresh ? (
        <AccessCodeDialog code={fresh.code} first onClose={() => { markLinkAsked(fresh.id); setFresh(null); }} />
      ) : (
        api && <SecureAccountPrompt />
      )}
    </>
  );
}

function AccessScreen({ onDone }: { onDone(fresh?: FreshAccount): void }) {
  const api = window.agentWorkspace!.fancyAccount!;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showCode, setShowCode] = useState(false);

  const ready = code.replace(/[^A-Za-z0-9]/g, '').length >= 12 && !busy;

  const submit = async () => {
    if (!ready) return;
    setError('');
    setBusy('code');
    try {
      const r = await api.codeLogin(code);
      onDone(r.created && r.accessCode ? { id: r.user.id, code: r.accessCode } : undefined);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy('');
    }
  };

  // Nur für bereits verknüpfte Konten: neue Konten entstehen ausschließlich per Einladungscode.
  const oauth = async (provider: 'discord' | 'github') => {
    setError('');
    setBusy(provider);
    try {
      await api.login(provider, '');
      onDone();
    } catch (err) {
      setError(cleanError(err));
      setShowCode(true);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.12),transparent_60%)] bg-zinc-950 text-zinc-100" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="w-[min(460px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-2xl" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="mb-5 text-center">
          <img src="./fancycode.png" alt="" className="mx-auto h-14 w-14" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <h1 className="mt-3 text-xl font-semibold">{tr("Willkommen bei FancyCode Desktop")}</h1>
          <p className="mt-1 text-sm text-zinc-400">{tr("Melde dich mit deinem FancyServers-Konto an.")}</p>
        </div>

        <div className="flex gap-2">
          <button disabled={!!busy} onClick={() => void oauth('discord')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#5865f2] font-medium text-white hover:brightness-110 disabled:opacity-40">
            {busy === 'discord' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowRight className="h-4 w-4" /> {tr("Mit Discord")}</>}
          </button>
          <button disabled={!!busy} onClick={() => void oauth('github')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-zinc-800 font-medium hover:bg-zinc-700 disabled:opacity-40">
            {busy === 'github' ? <Loader2 className="h-4 w-4 animate-spin" /> : tr("Mit GitHub")}
          </button>
        </div>

        {(busy === 'discord' || busy === 'github') && (
          <p className="mt-3 text-xs text-zinc-400">
            {tr("Der Browser öffnet sich – melde dich dort an und kehre dann zurück.")}{' '}
            <button className="text-orange-300 hover:underline" onClick={() => void api.cancel()}>{tr("Abbrechen")}</button>
          </p>
        )}
        {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        {/* Klein darunter: Login per Zugangscode, neue Konten per Einladungscode. */}
        <div className="mt-5 border-t border-white/10 pt-3 text-xs text-zinc-400">
          {!showCode ? (
            <div className="text-center">
              {tr("Neu hier oder ohne Discord/GitHub?")}{' '}
              <button disabled={!!busy} className="text-orange-300 hover:underline" onClick={() => setShowCode(true)}>{tr("Mit Code anmelden")}</button>
            </div>
          ) : (
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <input
                autoFocus
                value={code}
                onChange={(event) => { setCode(event.target.value.toUpperCase().slice(0, 30)); setError(''); }}
                placeholder={tr("Zugangs- oder Einladungscode")}
                className="input h-8 flex-1 font-mono text-xs tracking-wider"
                autoComplete="off"
              />
              <button type="submit" disabled={!ready} className="h-8 rounded-lg bg-orange-500 px-3 text-xs font-semibold text-black hover:brightness-110 disabled:opacity-40">
                {busy === 'code' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tr("Anmelden")}
              </button>
            </form>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-500">
          {tr("Mit der Anmeldung akzeptierst du die")}{' '}
          <a href={`${LEGAL_BASE}/nutzungsbedingungen`} target="_blank" rel="noreferrer" className="underline hover:text-zinc-300">{tr("Nutzungsbedingungen")}</a>
          {' '}{tr("und hast die")}{' '}
          <a href={`${LEGAL_BASE}/datenschutz`} target="_blank" rel="noreferrer" className="underline hover:text-zinc-300">{tr("Datenschutzerklärung")}</a>
          {' '}{tr("gelesen.")}{' · '}
          <a href={`${LEGAL_BASE}/impressum`} target="_blank" rel="noreferrer" className="underline hover:text-zinc-300">{tr("Impressum")}</a>
        </p>
      </div>
    </div>
  );
}
