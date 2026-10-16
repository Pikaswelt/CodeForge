import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Download, Loader2, RefreshCw, X, XCircle } from 'lucide-react';
import type { UpdateStatus } from '../electron.d';

// Update window: opens only when the user starts a check with openUpdateWindow
// and shows every step until install.

const OPEN_EVENT = 'codeforge:open-update-window';

export function openUpdateWindow(check = true) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { check } }));
}

function formatBytes(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const STEPS = [
  { id: 'checking', label: 'Suchen' },
  { id: 'downloading', label: 'Herunterladen' },
  { id: 'downloaded', label: 'Bereit' },
  { id: 'installing', label: 'Installieren' },
];

export default function UpdateModal() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [installClicked, setInstallClicked] = useState(false);

  useEffect(() => {
    void window.agentWorkspace?.getUpdateStatus().then((value) => value && setStatus(value));
    const unsubscribe = window.agentWorkspace?.onUpdateStatus(setStatus);
    const onOpen = (event: Event) => {
      setOpen(true);
      if ((event as CustomEvent).detail?.check) {
        void window.agentWorkspace?.checkForUpdates({ manual: true }).then((value) => value && setStatus(value));
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      unsubscribe?.();
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  if (!open || !status) return null;

  const current = status.status;
  const activeIndex = STEPS.findIndex((step) => step.id === current);
  const upToDate = current === 'idle' && status.message?.includes('aktuell');
  const installing = current === 'installing' || installClicked;
  const busy = current === 'checking' || current === 'downloading' || installing;

  const install = async () => {
    setInstallClicked(true);
    const ok = await window.agentWorkspace?.installUpdate();
    if (!ok) setInstallClicked(false);
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[450] grid place-items-center bg-black/60 backdrop-blur-sm">
        <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} className="w-[460px] rounded-2xl border border-white/10 bg-[#161316] p-6 shadow-2xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10">
                {current === 'error' ? (
                  <XCircle className="h-5 w-5 text-red-400" />
                ) : upToDate ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : busy ? (
                  <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
                ) : (
                  <Download className="h-5 w-5 text-amber-300" />
                )}
              </span>
              <div>
                <div className="text-base font-medium text-white">
                  {upToDate ? 'CodeForge ist aktuell' : status.availableVersion ? `Update ${status.availableVersion}` : 'Update'}
                </div>
                <div className="text-xs text-zinc-500">Installiert: v{status.currentVersion}</div>
              </div>
            </div>
            {!installing && (
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {!upToDate && current !== 'error' && (
            <div className="mt-5 flex items-center gap-1.5">
              {STEPS.map((step, index) => {
                const done = activeIndex > index || (installing && index < 3);
                const active = activeIndex === index || (installing && index === 3);
                return (
                  <div key={step.id} className="flex-1">
                    <div className={`h-1 rounded-full ${done ? 'bg-emerald-400' : active ? 'bg-amber-400' : 'bg-white/10'}`} />
                    <div className={`mt-1.5 text-[10px] ${active ? 'text-amber-300' : done ? 'text-emerald-400' : 'text-zinc-600'}`}>{step.label}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 text-sm text-zinc-300">{installing ? 'CodeForge wird beendet und installiert...' : status.message}</div>

          {current === 'downloading' && (
            <div className="mt-3">
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${Math.max(2, status.percent)}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
                <span>
                  {formatBytes(status.receivedBytes)} {status.totalBytes ? `von ${formatBytes(status.totalBytes)}` : ''}
                </span>
                <span>
                  {status.bytesPerSecond ? `${formatBytes(status.bytesPerSecond)}/s · ` : ''}
                  {status.percent}%
                </span>
              </div>
            </div>
          )}

          {installing && (
            <p className="mt-3 text-[11px] leading-5 text-zinc-500">
              Ein kleines Fenster zeigt den Installationsfortschritt. CodeForge startet danach automatisch neu.
            </p>
          )}

          {current === 'error' && status.error && (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{status.error}</div>
          )}

          <div className="mt-6 flex gap-2">
            {current === 'downloaded' && !installing ? (
              <>
                <button onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05]">
                  Spaeter
                </button>
                <button onClick={() => void install()} className="primary-button flex flex-[2] items-center justify-center gap-2 !py-2.5">
                  <RefreshCw className="h-4 w-4" />
                  Jetzt installieren und neu starten
                </button>
              </>
            ) : current === 'error' || upToDate ? (
              <>
                <button onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05]">
                  Schliessen
                </button>
                {current === 'error' && (
                  <button
                    onClick={() => void window.agentWorkspace?.checkForUpdates({ manual: true }).then((value) => value && setStatus(value))}
                    className="primary-button flex flex-[2] items-center justify-center gap-2 !py-2.5"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Erneut versuchen
                  </button>
                )}
              </>
            ) : !installing ? (
              <button onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05]">
                Im Hintergrund weiter
              </button>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
