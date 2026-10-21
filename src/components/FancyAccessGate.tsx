import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, KeyRound, Loader2, UserRound } from 'lucide-react';

const cleanError = (error: unknown) =>
  error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Unbekannter Fehler';

// FancyCode ist nur mit Einladung nutzbar: neue Nutzer brauchen einen Code, bestehende
// Discord-/GitHub-Konten melden sich ohne Code an. Offline reicht ein früher bestätigter Zugang.
export function FancyAccessGate({ children }: { children: ReactNode }) {
  const api = window.agentWorkspace?.fancyAccount;
  const [state, setState] = useState<'checking' | 'locked' | 'open'>(api ? 'checking' : 'open');

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'checking') return <div className="fixed inset-0 bg-black" />;
  if (state === 'locked') return <AccessScreen onDone={() => void check()} />;
  return <>{children}</>;
}

function AccessScreen({ onDone }: { onDone(): void }) {
  const api = window.agentWorkspace!.fancyAccount!;
  const [invite, setInvite] = useState('');
  const [valid, setValid] = useState<boolean | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const check = async (code: string) => {
    setInvite(code);
    setValid(null);
    setError('');
    if (code.replace(/[^A-Za-z0-9]/g, '').length < 12) return;
    try {
      setValid(await api.checkInvite(code));
    } catch (err) {
      setError(cleanError(err));
    }
  };

  const run = async (kind: 'guest' | 'discord' | 'github', withCode: boolean) => {
    setError('');
    setBusy(kind);
    try {
      if (kind === 'guest') await api.guest(invite);
      else await api.login(kind, withCode ? invite : '');
      onDone();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy('');
    }
  };

  const ready = valid === true && !busy;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.12),transparent_60%)] bg-zinc-950 text-zinc-100" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="w-[min(460px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-2xl" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="mb-5 text-center">
          <img src="./fancycode.png" alt="" className="mx-auto h-14 w-14" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <h1 className="mt-3 text-xl font-semibold">Willkommen bei FancyCode</h1>
          <p className="mt-1 text-sm text-zinc-400">Der Zugang ist aktuell nur mit Einladungscode möglich.</p>
        </div>

        <label className="text-xs font-medium text-zinc-400">Einladungscode</label>
        <div className="mt-1.5 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-zinc-500" />
          <input
            autoFocus
            value={invite}
            onChange={(event) => void check(event.target.value.toUpperCase().slice(0, 24))}
            placeholder="FG-XXXX-XXXX-XXXX"
            className="input flex-1 font-mono tracking-wider"
            autoComplete="off"
          />
        </div>
        {valid === true && <p className="mt-1 text-xs text-emerald-400">Code gültig ✓</p>}
        {valid === false && <p className="mt-1 text-xs text-red-400">Code ungültig oder bereits verwendet.</p>}

        <div className="mt-4 space-y-2">
          <button
            disabled={!ready}
            onClick={() => void run('guest', true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 font-medium text-white hover:bg-orange-400 disabled:opacity-40"
          >
            {busy === 'guest' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />} Als Gast fortfahren <ArrowRight className="h-4 w-4" />
          </button>
          <div className="flex gap-2">
            <button disabled={!ready} onClick={() => void run('discord', true)} className="h-10 flex-1 rounded-xl bg-[#5865f2] text-sm font-medium hover:brightness-110 disabled:opacity-40">
              {busy === 'discord' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Mit Discord'}
            </button>
            <button disabled={!ready} onClick={() => void run('github', true)} className="h-10 flex-1 rounded-xl border border-white/15 bg-zinc-800 text-sm font-medium hover:bg-zinc-700 disabled:opacity-40">
              {busy === 'github' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Mit GitHub'}
            </button>
          </div>
        </div>

        {busy && busy !== 'guest' && (
          <p className="mt-3 text-xs text-zinc-400">
            Der Browser öffnet sich – melde dich dort an und kehre dann zurück.{' '}
            <button className="text-orange-300 hover:underline" onClick={() => void api.cancel()}>Abbrechen</button>
          </p>
        )}
        {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        <div className="mt-5 border-t border-white/10 pt-3 text-center text-xs text-zinc-400">
          Schon ein Konto?{' '}
          <button disabled={!!busy} className="text-orange-300 hover:underline" onClick={() => void run('discord', false)}>Mit Discord anmelden</button>
          {' · '}
          <button disabled={!!busy} className="text-orange-300 hover:underline" onClick={() => void run('github', false)}>Mit GitHub anmelden</button>
        </div>
      </div>
    </div>
  );
}
