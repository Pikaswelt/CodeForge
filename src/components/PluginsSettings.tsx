import { tr } from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2, Puzzle, RefreshCw, Trash2 } from 'lucide-react';
import { usePlugins } from '../plugins/PluginProvider';
import { BuiltinSkills } from './BuiltinSkills';
import type { FancyPluginCatalog, FancyPluginInstalled } from '../electron';
import { requirePlanFeature } from '../plans';

const cleanError = (error: unknown) =>
  error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : tr("Unbekannter Fehler");

// Plugins werden aus dem Katalog des FancyGames-Servers geladen, mit Prüfsumme geprüft und
// im Benutzerordner abgelegt. Ohne Installation tauchen sie nirgends in der App auf.
export function PluginsSettings() {
  const { installed, refresh, loading: runtimeLoading, error: runtimeError } = usePlugins();
  const [catalog, setCatalog] = useState<FancyPluginCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');

  const loadCatalog = useCallback(async () => {
    const api = window.agentWorkspace?.plugins;
    if (!api) {
      setLoading(false);
      setError(tr("Plugins gibt es nur in der Desktop-App."));
      return;
    }
    setLoading(true);
    setError('');
    try {
      setCatalog(await api.catalog());
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const findInstalled = (id: string): FancyPluginInstalled | undefined => installed.find((plugin) => plugin.id === id);

  const install = async (id: string) => {
    if (!requirePlanFeature('fancycode.plugins')) return;
    const api = window.agentWorkspace?.plugins;
    if (!api) return;
    setBusy(id);
    setError('');
    setStatus('');
    try {
      const result = await api.install(id);
      setStatus(result ? `${result.name} installiert.` : tr("Installiert."));
      await refresh();
      await loadCatalog();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy('');
    }
  };

  const remove = async (id: string, name: string) => {
    const api = window.agentWorkspace?.plugins;
    if (!api) return;
    setBusy(id);
    setError('');
    setStatus('');
    try {
      await api.remove(id);
      setStatus(tr("{name} entfernt.", { name }));
      await refresh();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-[11px] leading-4 text-zinc-500">
        {tr("Plugins erweitern FancyCode Desktop, sind aber nicht Teil der App. Sie werden heruntergeladen, gegen eine Prüfsumme geprüft und laufen abgeschottet in einem eigenen Worker – ohne Zugriff auf Dateien oder Terminals.")}
      </p>

      <BuiltinSkills />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">{tr("Plugins aus dem Katalog")}</h3>
          <button
            onClick={() => void loadCatalog()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> {tr("Katalog aktualisieren")}
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> {tr("Katalog wird geladen …")}
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-xs text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && catalog && catalog.plugins.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
            <Puzzle className="mx-auto h-5 w-5 text-zinc-600" />
            <div className="mt-2 text-sm text-zinc-300">{tr("Noch keine Plugins im Katalog")}</div>
          </div>
        )}

        {!loading && !error && catalog && catalog.plugins.length > 0 && (
          <div className="space-y-2">
            {catalog.plugins.map((entry) => {
              const current = findInstalled(entry.id);
              const update = current && current.version !== entry.version;
              const isBusy = busy === entry.id;
              return (
                <div key={entry.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">{entry.name}</span>
                        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">v{entry.version}</span>
                        {current && !update && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> installiert
                          </span>
                        )}
                        {update && <span className="text-[10px] text-amber-300">{tr("Update auf v")}{entry.version}</span>}
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-zinc-500">{entry.description}</p>
                      {entry.author && <p className="mt-1 text-[10px] text-zinc-600">{tr("von")} {entry.author}</p>}
                    </div>
                    <button
                      onClick={() => void install(entry.id)}
                      disabled={isBusy || (Boolean(current) && !update) || runtimeLoading}
                      className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-40"
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {update ? tr("Aktualisieren") : current ? tr("Installiert") : tr("Installieren")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">{tr("Installiert")}</h3>
        {installed.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
            <Puzzle className="mx-auto h-5 w-5 text-zinc-600" />
            <div className="mt-2 text-sm text-zinc-300">{tr("Keine Plugins installiert")}</div>
            <p className="mt-1 text-[11px] leading-4 text-zinc-500">{tr("Installiere ein Plugin oben – es erscheint danach im Kontomenü.")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {installed.map((plugin) => (
              <div key={plugin.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] text-zinc-200">{plugin.name}</span>
                    <span className="font-mono text-[10px] text-zinc-500">v{plugin.version}</span>
                  </div>
                  {plugin.description && <p className="mt-0.5 truncate text-[11px] text-zinc-500">{plugin.description}</p>}
                </div>
                <button
                  onClick={() => void remove(plugin.id, plugin.name)}
                  disabled={busy === plugin.id}
                  className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                >
                  {busy === plugin.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {tr("Entfernen")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {(status || runtimeError) && (
        <div className={`rounded-lg border p-3 text-[11px] ${runtimeError ? 'border-amber-500/25 bg-amber-500/10 text-amber-200' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'}`}>
          {runtimeError || status}
        </div>
      )}
    </div>
  );
}
