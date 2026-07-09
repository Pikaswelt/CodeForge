import { Sparkles, X } from 'lucide-react';
import { motion } from 'motion/react';
import AppLogo from './AppLogo';

type WelcomePopupProps = {
  onClose(): void;
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  }
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } }
} as const;

export default function WelcomePopup({ onClose }: WelcomePopupProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-5 backdrop-blur-lg"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141214] p-6 shadow-2xl relative"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5"
            >
              <AppLogo className="h-8 w-8" />
            </motion.div>
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
                <Sparkles className="h-3.5 w-3.5" />
                Willkommen
              </div>
              <h2 className="mt-1 text-xl font-semibold text-white">Willkommen bei CodeForge</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Willkommens-Popup schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-5 text-sm leading-6 text-zinc-400">
          Starte einen Agent-Chat, waehle dein Projekt und lasse lokale Coding-Aufgaben direkt
          in deinem Workspace bearbeiten.
        </p>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="mt-6 grid grid-cols-3 gap-2 text-center text-[11px] text-zinc-500"
        >
          <motion.div
            variants={itemVariants}
            whileHover={{ scale: 1.03, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' }}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-3 transition-colors duration-200 cursor-default"
          >
            Projekte
          </motion.div>
          <motion.div
            variants={itemVariants}
            whileHover={{ scale: 1.03, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' }}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-3 transition-colors duration-200 cursor-default"
          >
            Agenten
          </motion.div>
          <motion.div
            variants={itemVariants}
            whileHover={{ scale: 1.03, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' }}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-3 transition-colors duration-200 cursor-default"
          >
            Workspace
          </motion.div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 200 }}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          onClick={onClose}
          className="primary-button mt-6 w-full !py-2.5"
        >
          Loslegen
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

