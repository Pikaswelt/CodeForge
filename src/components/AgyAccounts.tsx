import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LogOut, Play, RefreshCw, Rocket, Trash2 } from 'lucide-react';
import { MAX_AGY_ACCOUNTS, useAppContext } from '../AppContext';

type AccountStatus = { profileExists: boolean; email: string };

// Saved Antigravity accounts: each one keeps its own agy login in a separate profile folder.
export function AgyAccountsSettings({ onClose }: { onClose(): void }) {
  const { agyAccounts, setAgyAccounts, startAgyAccounts } = useAppContext();
  const [status, setStatus] = useState<Record<string, AccountStatus>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refreshStatus = useCallback(async () => {
    if (!window.agentWorkspace?.getAgyAccountsStatus || agyAccounts.length === 0) return;
    const result = await window.agentWorkspace.getAgyAccountsStatus(agyAccounts.map((account) => account.id));
    setStatus(Object.fromEntries(result.map((item) => [item.id, { profileExists: item.profileExists, email: item.email }])));
  }, [agyAccounts]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const removeProfile = async (accountId: string) => {
    setBusyId(accountId);
    setError('');
    try {
      await window.agentWorkspace?.removeAgyAccountProfile(accountId);
      await refreshStatus();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil konnte nicht entfernt werden.');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const startSingle = async (accountId: string) => {
    setError('');
    try {
      await startAgyAccounts([accountId]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Antigravity konnte nicht gestartet werden.');
    }
  };

  return (
    <section>
      <div className="section-label flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Rocket className="w-3.5 h-3.5" />
          Antigravity Accounts
        </span>
        <button onClick={() => void refreshStatus()} className="flex items-center gap-1 normal-case tracking-normal hover:text-white">
          <RefreshCw className="w-3 h-3" />
          Status
        </button>
      </div>
      <div className="space-y-2 mt-3">
        {agyAccounts.map((account) => {
          const info = status[account.id];
          return (
            <div key={account.id} className="flex items-center gap-2">
              <input
                type="text"
                value={account.name}
                onChange={(event) =>
                  setAgyAccounts((current) => current.map((item) => (item.id === account.id ? { ...item, name: event.target.value } : item)))
                }
                className="input !w-[140px] shrink-0"
                placeholder="Name"
                autoComplete="off"
              />
              <span className="flex-1 min-w-0 truncate text-[11px]" title={info?.email || ''}>
                {info?.email ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    {info.email}
                  </span>
                ) : (
                  <span className="text-zinc-500">Nicht angemeldet</span>
                )}
              </span>
              <button
                onClick={() => void startSingle(account.id)}
                className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5"
                title={info?.email ? 'Nur diesen Account starten' : 'Starten und anmelden'}
              >
                <Play className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Login von "${account.name}" auf diesem PC loeschen? Laufende Terminals dieses Accounts werden beendet.`)) {
                    void removeProfile(account.id);
                  }
                }}
                disabled={!info?.profileExists || busyId === account.id}
                className="p-2 rounded-lg text-zinc-500 hover:text-amber-300 hover:bg-amber-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Abmelden (Login-Daten dieses Accounts loeschen)"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (!window.confirm(`Account "${account.name}" entfernen? Sein Login auf diesem PC wird geloescht.`)) return;
                  // Keep the entry if deleting the login failed, otherwise its token folder would be orphaned.
                  void removeProfile(account.id).then((removed) => {
                    if (removed) setAgyAccounts((current) => current.filter((item) => item.id !== account.id));
                  });
                }}
                disabled={busyId === account.id}
                className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                title="Account entfernen"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        {agyAccounts.length < MAX_AGY_ACCOUNTS && (
          <button
            onClick={() =>
              setAgyAccounts((current) => [...current, { id: crypto.randomUUID(), name: `Account ${current.length + 1}` }])
            }
            className="text-xs text-orange-300 hover:text-orange-200"
          >
            + Account hinzufuegen
          </button>
        )}
      </div>
      {error && <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{error}</div>}
      <p className="text-[11px] leading-4 text-zinc-600 mt-2">
        "Antigravity starten" auf Home oeffnet fuer jeden Account ein eigenes agy-Terminal (bis zu {MAX_AGY_ACCOUNTS}). Jeder Account hat einen
        eigenen Login-Ordner auf diesem PC; beim ersten Start fragt agy einmal nach dem Google-Login, danach bleibt er gespeichert.
      </p>
    </section>
  );
}
