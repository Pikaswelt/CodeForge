import { Check, CheckCircle2, Download, FolderOpen, KeyRound, Loader2, Sparkles, Terminal, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { RECOMMENDED_SYSTEM_PROMPT, useAppContext } from '../AppContext';
import type { ProviderId } from '../types';
import AppLogo from './AppLogo';

const PROVIDERS: { id: ProviderId; name: string; command: string; description: string }[] = [
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    command: 'agy',
    description: 'Gemini, Claude und GPT-OSS ueber die Antigravity CLI.',
  },
  {
    id: 'openai',
    name: 'OpenAI Codex',
    command: 'codex',
    description: 'Codex arbeitet nicht-interaktiv direkt im Projektordner.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    command: 'claude',
    description: 'Claude Code mit konfigurierbarem Modell und Zugriffsmodus.',
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    command: 'agent / cursor-agent',
    description: 'Cursor CLI direkt im Projektordner starten.',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    description: 'OpenCode im nicht-interaktiven Run-Modus verwenden.',
  },
  {
    id: 'freebuff',
    name: 'FreeBuff',
    command: 'freebuff',
    description: 'Kostenloser AI Coding Agent via npm.',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.15,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 25 } },
} as const;

export default function SetupModal() {
  const {
    provider,
    setProvider,
    cliStatus,
    refreshCliStatus,
    installCli,
    selectedProject,
    addProject,
    createNewProject,
    setHasSetupCompleted,
    apiKeys,
    setApiKey,
    systemPrompt,
    setSystemPrompt,
    useRecommendedSystemPrompt,
    generateSystemPrompt,
  } = useAppContext();
  const [checking, setChecking] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [promptError, setPromptError] = useState('');
  const [installing, setInstalling] = useState<ProviderId | null>(null);
  const [installNotice, setInstallNotice] = useState('');

  useEffect(() => {
    setChecking(true);
    refreshCliStatus().finally(() => setChecking(false));
  }, [refreshCliStatus]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 bg-black/85 backdrop-blur-xl z-[120] flex items-center justify-center p-5"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="w-full max-w-3xl bg-[#141214] border border-white/10 rounded-2xl p-8 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar"
      >
        <div className="text-center">
          <motion.div
            initial={{ scale: 0.8, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-14 h-14 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer"
          >
            <AppLogo className="w-9 h-9" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-2xl text-white font-semibold mt-5"
          >
            CodeForge einrichten
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-zinc-500 mt-2"
          >
            Waehle eine lokale Agent-CLI. Ein Projekt kannst du erstellen, oeffnen oder spaeter nachholen.
          </motion.p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-8"
        >
          {PROVIDERS.map((item) => {
            const status = cliStatus[item.id];
            return (
              <motion.button
                key={item.id}
                variants={itemVariants}
                onClick={() => setProvider(item.id)}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className={`relative text-left p-4 rounded-xl border transition-colors ${
                  provider === item.id ? 'border-white/30 bg-white/[0.06]' : 'border-white/5 hover:border-white/15'
                }`}
              >
                {provider === item.id && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                    className="absolute top-2 right-2 bg-white text-black rounded-full p-0.5"
                  >
                    <Check className="w-3 h-3" />
                  </motion.div>
                )}
                <div className="text-sm text-white font-medium">{item.name}</div>
                <div className="text-[10px] text-zinc-600 font-mono mt-1">{item.command}</div>
                <p className="text-[11px] leading-4 text-zinc-500 mt-3">{item.description}</p>
                <div className={`flex items-center gap-1.5 text-[10px] mt-4 ${status.installed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {checking ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : status.installed ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <XCircle className="w-3 h-3" />
                  )}
                  {checking ? 'Pruefe...' : status.installed ? status.version || 'Installiert' : 'Nicht gefunden'}
                </div>
                {!status.installed && (
                  <span
                    onClick={async (event) => {
                      event.stopPropagation();
                      setInstalling(item.id);
                      setInstallNotice('');
                      try {
                        setInstallNotice(await installCli(item.id));
                      } catch (error) {
                        setInstallNotice(error instanceof Error ? error.message : 'Installation konnte nicht gestartet werden.');
                      } finally {
                        setInstalling(null);
                      }
                    }}
                    className="mt-3 inline-flex items-center gap-1 rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-400/15 transition-colors"
                  >
                    {installing === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    Installieren
                  </span>
                )}
              </motion.button>
            );
          })}
        </motion.div>

        {installNotice && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 text-xs text-zinc-300 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2"
          >
            {installNotice}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 200 }}
          className="mt-5 grid gap-3 sm:grid-cols-2"
        >
          <motion.button
            whileHover={{ scale: 1.015, borderColor: 'rgba(52,211,153,0.3)' }}
            whileTap={{ scale: 0.985 }}
            onClick={createNewProject}
            className="panel !p-4 flex items-center gap-3 text-left hover:border-emerald-300/25 cursor-pointer transition-colors duration-200"
          >
            <FolderOpen className="w-5 h-5 text-emerald-300/80" />
            <div className="min-w-0">
              <div className="text-sm text-white">Neues Projekt erstellen</div>
              <div className="text-[11px] text-zinc-600 truncate">
                Legt einen neuen Ordner an und nutzt ihn sofort.
              </div>
            </div>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.015, borderColor: 'rgba(255,255,255,0.2)' }}
            whileTap={{ scale: 0.985 }}
            onClick={addProject}
            className="panel !p-4 flex items-center gap-3 text-left hover:border-white/20 cursor-pointer transition-colors duration-200"
          >
            <FolderOpen className="w-5 h-5 text-amber-400/70" />
            <div className="min-w-0">
              <div className="text-sm text-white">{selectedProject?.title || 'Projektordner oeffnen'}</div>
              <div className="text-[11px] text-zinc-600 truncate">
                {selectedProject?.path || 'Vorhandenen Ordner als Arbeitsverzeichnis verwenden.'}
              </div>
            </div>
          </motion.button>
        </motion.div>

        {!cliStatus[provider].installed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-xs text-amber-300/80 bg-amber-500/[0.06] border border-amber-500/10 rounded-lg px-3 py-2"
          >
            Die gewaehlte CLI fehlt noch. Du kannst die App einrichten, aber Agent-Aufrufe funktionieren erst nach der Installation.
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, type: 'spring', stiffness: 200 }}
          className="grid grid-cols-[0.8fr_1.2fr] gap-4 mt-5"
        >
          <div className="panel !p-4">
            <div className="flex items-center gap-2 section-label">
              <KeyRound className="w-3.5 h-3.5" />
              API-Key
            </div>
            <input
              type="password"
              value={apiKeys[provider] || ''}
              onChange={(event) => setApiKey(provider, event.target.value)}
              className="input w-full mt-3"
              placeholder={`${PROVIDERS.find((item) => item.id === provider)?.name} API-Key`}
              autoComplete="off"
            />
            <p className="text-[11px] leading-4 text-zinc-600 mt-2">
              Wird nur fuer den gewaehlten CLI-Prozess als Umgebungsvariable gesetzt.
            </p>
          </div>

          <div className="panel !p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="section-label">System-Prompt</div>
              <div className="flex gap-2">
                <button
                  onClick={useRecommendedSystemPrompt}
                  className="text-[11px] text-amber-300 hover:text-amber-200 transition-colors"
                  title={RECOMMENDED_SYSTEM_PROMPT}
                >
                  Empfohlen
                </button>
                <button
                  onClick={async () => {
                    setPromptError('');
                    setGeneratingPrompt(true);
                    try {
                      await generateSystemPrompt();
                    } catch (error) {
                      setPromptError(error instanceof Error ? error.message : 'Generierung fehlgeschlagen.');
                    } finally {
                      setGeneratingPrompt(false);
                    }
                  }}
                  disabled={!selectedProject || generatingPrompt}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white disabled:text-zinc-700 transition-colors"
                >
                  {generatingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI generieren
                </button>
              </div>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              className="input w-full mt-3 min-h-24 resize-none"
              placeholder="Lege fest, wie der Agent grundsaetzlich arbeiten soll."
            />
            {promptError && <div className="text-[11px] text-red-400 mt-2">{promptError}</div>}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="flex justify-end mt-6"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setHasSetupCompleted(true)}
            className="primary-button !px-6 !py-2.5 cursor-pointer"
          >
            {selectedProject ? 'Einrichtung abschliessen' : 'Ohne Projekt starten'}
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
