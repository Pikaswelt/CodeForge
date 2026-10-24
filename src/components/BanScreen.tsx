import { locale, tr } from '../i18n';
import { LogOut, ShieldAlert } from 'lucide-react';
import type { FancyBan } from '../electron';

// Vollbild-Sperre: Deckt die App ab, solange das Konto gesperrt ist. Chat und Agent sind
// zusätzlich serverseitig gesperrt; hier gibt es nur den Grund und den Weg zurück zum Login.
export default function BanScreen({ ban }: { ban: FancyBan }) {
  const api = window.agentWorkspace?.fancyAccount;
  const until = ban.until
    ? new Date(ban.until).toLocaleString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  const logout = async () => {
    await api?.logout().catch(() => {});
    window.dispatchEvent(new Event('fancy:logged-out'));
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-red-500/25 bg-[#170d10] p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
          <ShieldAlert className="h-7 w-7 text-red-400" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{tr('Konto gesperrt')}</h1>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
          {ban.reason || tr('Dieses Konto wurde gesperrt.')}
        </p>
        <p className="mt-2 text-xs text-red-300/90">
          {until ? tr('Die Sperre gilt bis {date}.', { date: until }) : tr('Die Sperre gilt dauerhaft.')}
        </p>
        <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-zinc-500">
          {tr('Wenn du das für einen Fehler hältst, wende dich an den Support von CrazyMine.de.')}
        </p>
        <button
          onClick={() => void logout()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" />
          {tr('Abmelden')}
        </button>
      </div>
    </div>
  );
}
