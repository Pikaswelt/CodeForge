import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, History, Loader2, Sparkles, X, Zap } from 'lucide-react';
import AppLogo from './AppLogo';
import { ReleaseBody, formatReleaseDate, useReleaseNotes } from './ReleaseNotes';

// What's new: the notes of the running version (after an update) or of the newest release, taken
// from the GitHub release. Earlier releases are one click away.
export default function NewsPopup({ onClose, version }: { onClose: () => void; version?: string }) {
  const { releases, current, loading, error } = useReleaseNotes(version, 8);
  const [showOlder, setShowOlder] = useState(false);

  const head = current || releases[0] || null;
  const older = releases.filter((item) => item.version !== head?.version);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[115] flex items-center justify-center bg-black/75 p-5 backdrop-blur-lg"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141214] p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0.7, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5"
            >
              <AppLogo className="h-7 w-7" />
            </motion.div>
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-sky-300/80">
                <Sparkles className="h-3.5 w-3.5" />
                Was ist neu
              </div>
              <h2 className="mt-0.5 text-lg font-semibold text-white">
                {head ? `CodeForge v${head.version}` : 'CodeForge Changelog'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="News-Popup schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1">
          {loading && (
            <div className="flex items-center gap-2 py-8 text-xs text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aenderungen werden geladen ...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-200">{error}</div>
          )}

          {!loading && !error && head && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 25 }}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/10">
                  <Sparkles className="h-4 w-4 text-sky-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-white">{head.title}</h3>
                  {head.publishedAt && (
                    <p className="mt-1 text-[10px] text-zinc-600">
                      Veroeffentlicht am {formatReleaseDate(head.publishedAt)}
                      {head.prerelease ? ' · Vorabversion' : ''}
                    </p>
                  )}
                  <div className="mt-3">
                    <ReleaseBody body={head.body} />
                  </div>
                  {head.url && (
                    <a
                      href={head.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-sky-300 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Auf GitHub ansehen
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {!loading && !error && older.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowOlder((open) => !open)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[11px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                <History className="h-3.5 w-3.5" />
                {showOlder ? 'Fruehere Versionen ausblenden' : `Fruehere Versionen anzeigen (${older.length})`}
              </button>
              <AnimatePresence initial={false}>
                {showOlder && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pt-2">
                      {older.map((release) => (
                        <div key={release.version} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-zinc-200">v{release.version}</span>
                            <span className="text-[10px] text-zinc-600">{formatReleaseDate(release.publishedAt)}</span>
                          </div>
                          <div className="mt-2">
                            <ReleaseBody body={release.body} compact />
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          onClick={onClose}
          className="primary-button mt-5 w-full !py-2.5 flex items-center justify-center gap-2 shrink-0"
        >
          <Zap className="h-4 w-4" />
          Verstanden, los geht's!
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
