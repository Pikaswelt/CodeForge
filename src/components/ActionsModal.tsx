import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Play,
  Trash2,
  FolderOpen,
  Plus,
  RefreshCw,
  X,
  Loader2,
  Activity,
  Sparkles,
} from 'lucide-react';

interface ActionItem {
  name: string;
  events: number;
  path: string;
}

const listContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    },
  },
} as const;

const listItemVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 350, damping: 25 } },
} as const;

export default function ActionsModal({ onClose }: { onClose: () => void }) {
  const [dirPath, setDirPath] = useState(() => {
    return localStorage.getItem('codeforge.actionsDir') || 'C:\\Users\\Chris\\OneDrive\\Dokumente\\Way';
  });
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [newActionName, setNewActionName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  useEffect(() => {
    localStorage.setItem('codeforge.actionsDir', dirPath);
    void loadActions();
  }, [dirPath]);

  const loadActions = async () => {
    if (!window.agentWorkspace) return;
    setLoading(true);
    setErrorNotice('');
    try {
      const list = await window.agentWorkspace.getActions(dirPath);
      setActions(list || []);
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : 'Fehler beim Laden der Aktionen');
      setActions([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (name: string) => {
    if (!window.agentWorkspace) return;
    setRunningAction(name);
    setErrorNotice('');
    setSuccessNotice('');
    try {
      await window.agentWorkspace.playAction(dirPath, name);
      setSuccessNotice(`Action "${name}" erfolgreich ausgefuehrt.`);
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : `Fehler beim Ausfuehren von "${name}"`);
    } finally {
      setRunningAction(null);
    }
  };

  const handleRemove = async (name: string) => {
    if (!window.agentWorkspace) return;
    if (!window.confirm(`Moechtest du die Action "${name}" wirklich unwiderruflich loeschen?`)) return;
    setErrorNotice('');
    setSuccessNotice('');
    try {
      await window.agentWorkspace.removeAction(dirPath, name);
      setSuccessNotice(`Action "${name}" geloescht.`);
      void loadActions();
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : `Fehler beim Loeschen von "${name}"`);
    }
  };

  const handleRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!window.agentWorkspace || !newActionName.trim()) return;
    const name = newActionName.trim();
    setErrorNotice('');
    setSuccessNotice('');
    setIsRecording(true);
    try {
      await window.agentWorkspace.recordAction(dirPath, name);
      setSuccessNotice(`Aufnahme fuer "${name}" gestartet! Bitte benutze das geoeffnete Terminal-Fenster. Druecke dort ESC um die Aufnahme zu beenden.`);
      setNewActionName('');
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : 'Fehler beim Starten der Aufnahme');
      setIsRecording(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!window.agentWorkspace) return;
    try {
      await window.agentWorkspace.openPath(dirPath);
    } catch (error) {
      setErrorNotice('Ordner konnte nicht geoeffnet werden.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="w-full max-w-xl bg-[#181518] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <div>
            <h2 className="text-lg text-white font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-400" />
              Actions
            </h2>
            <p className="text-xs text-zinc-600 mt-0.5">Desktop-Makros aufnehmen, verwalten und abspielen</p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Speicherort der Actions
              <button
                onClick={() => { void handleOpenFolder(); }}
                className="flex items-center gap-1 normal-case tracking-normal hover:text-white transition-colors cursor-pointer"
                title="Ordner im Explorer oeffnen"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Im Explorer oeffnen
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={dirPath}
                onChange={(e) => setDirPath(e.target.value)}
                className="input flex-1"
                placeholder="z.B. C:\Users\Chris\OneDrive\Dokumente\Way"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { void loadActions(); }}
                disabled={loading}
                className="secondary-button cursor-pointer"
                title="Liste aktualisieren"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </motion.button>
            </div>
          </section>

          {errorNotice && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400"
            >
              {errorNotice}
            </motion.div>
          )}

          {successNotice && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400"
            >
              {successNotice}
            </motion.div>
          )}

          <section className="space-y-3">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Registrierte Actions
            </div>
            
            {actions.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-white/5 rounded-xl text-zinc-600 text-sm">
                Keine Actions im angegebenen Ordner gefunden.
              </div>
            ) : (
              <motion.div
                variants={listContainerVariants}
                initial="hidden"
                animate="show"
                className="grid gap-2"
              >
                {actions.map((act) => (
                  <motion.div
                    key={act.name}
                    variants={listItemVariants}
                    className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200 truncate">{act.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {act.events} Events • {act.name}.json
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { void handlePlay(act.name); }}
                        disabled={runningAction !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                      >
                        {runningAction === act.name ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Spielt...
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            Play
                          </>
                        )}
                      </motion.button>
                      <button
                        onClick={() => { void handleRemove(act.name); }}
                        disabled={runningAction !== null}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/5 rounded-lg transition-colors cursor-pointer"
                        title="Action loeschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </section>

          <section className="border-t border-white/5 pt-5 space-y-3">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Neue Action aufzeichnen
            </div>
            
            <form onSubmit={(e) => { void handleRecord(e); }} className="flex gap-2">
              <input
                value={newActionName}
                onChange={(e) => setNewActionName(e.target.value)}
                className="input flex-1"
                placeholder="Name der neuen Action, z.B. unity"
                disabled={isRecording}
                required
              />
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isRecording || !newActionName.trim()}
                className="primary-button cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Record
              </motion.button>
            </form>
            {isRecording && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[11px] leading-4 text-amber-400/80 bg-amber-400/5 border border-amber-400/10 rounded-lg p-3 flex items-start gap-2"
              >
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  Ein separates Konsolenfenster wurde geoeffnet. Nach dem 3-Sekunden-Countdown kannst du deine Aktionen aufzeichnen. Druecke <strong>ESC</strong> im Konsolenfenster, um die Aufnahme zu beenden. Klicke anschliessend oben auf <strong>Aktualisieren</strong>, um die Action in der Liste zu sehen.
                </div>
              </motion.div>
            )}
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}
