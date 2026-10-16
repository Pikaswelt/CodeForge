import { motion } from 'motion/react';
import { Megaphone, Sparkles, X, Zap, Smartphone, Terminal, Wifi } from 'lucide-react';
import AppLogo from './AppLogo';

const CURRENT_VERSION = '2.1.0';

const NEWS_ITEMS = [
  {
    icon: Megaphone,
    title: `CodeForge v${CURRENT_VERSION} – Kopplungsmodus & News`,
    description: 'Neue Version mit vielen Verbesserungen für Mobile-Nutzer und einer komplett neuen CLI.',
    highlights: [
      'Update/News Popup beim Start (dieses Fenster!)',
      'Neue CLI-Version: codeforge-cli für Terminal-Nutzer',
      'Kopplungsmodus für einfaches Verbinden',
      'FreeBuff als neuer Provider verfügbar',
    ],
  },
  {
    icon: Terminal,
    title: 'CodeForge CLI – Jetzt im Terminal nutzbar',
    description: 'Installiere die CLI mit npm und nutze CodeForge direkt von der Kommandozeile. Perfekt für Server, SSH-Sessions und schnelle Prompts.',
    highlights: [
      'npm install -g codeforge-cli',
      'Verbinde dich mit deinem CodeForge Server',
      'Sende Prompts direkt vom Terminal',
      'Streaming-Ausgabe in Echtzeit',
    ],
  },
  {
    icon: Wifi,
    title: 'Kopplungsmodus – Einfacher verbinden',
    description: 'PC und Handy finden sich jetzt automatisch. Kein manuelles IP-Scannen mehr nötig!',
    highlights: [
      '4-stelligen Code auf dem PC ablesen',
      'In der App eingeben – fertig!',
      'UDP-Broadcast für lokales Netzwerk',
      'QR-Code-Support für VPS-Server',
    ],
  },
  {
    icon: Smartphone,
    title: 'Mobile Modus – Optimiert',
    description: 'Der Mobile-Modus wurde komplett überarbeitet. Keine CLI-Statusanzeigen mehr, klarere Verbindungsinfos und ein Tutorial im Menü.',
    highlights: [
      'Nur "Live"-Anzeige wenn wirklich verbunden',
      'CLI-Elemente komplett ausgeblendet',
      'Verbindungsanleitung im Menü',
      'Themes: Bilder/Videos direkt vom Handy',
    ],
  },
  {
    icon: Zap,
    title: 'FreeBuff – Neuer KI-Provider',
    description: 'FreeBuff ist jetzt als Provider in CodeForge integriert. Kostenloser AI Coding Agent direkt im Terminal.',
    highlights: [
      'npm install -g freebuff',
      'Kein API-Key nötig',
      'DeepSeek v4 & Kimi K2.6 Modelle',
      'Komplett kostenlos via Text-Werbung',
    ],
  },
];

export default function NewsPopup({ onClose }: { onClose: () => void }) {
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
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#141214] p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto custom-scrollbar"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
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
              <h2 className="mt-0.5 text-lg font-semibold text-white">CodeForge v{CURRENT_VERSION}</h2>
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

        {/* News Cards */}
        <div className="space-y-3">
          {NEWS_ITEMS.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06, type: 'spring', stiffness: 300, damping: 25 }}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 border border-sky-400/20">
                  <item.icon className="h-4 w-4 text-sky-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-white">{item.title}</h3>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-5">{item.description}</p>
                  {item.highlights.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {item.highlights.map((h, j) => (
                        <li key={j} className="flex items-start gap-2 text-[11px] text-zinc-400">
                          <Sparkles className="h-3 w-3 shrink-0 text-amber-300/60 mt-0.5" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          onClick={onClose}
          className="primary-button mt-6 w-full !py-2.5 flex items-center justify-center gap-2"
        >
          <Zap className="h-4 w-4" />
          Verstanden, los geht's!
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

