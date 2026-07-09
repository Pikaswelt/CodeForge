import { motion } from 'motion/react';
import { BookOpen, Monitor, Server, Terminal, Wifi, X, CheckCircle2, Download, ArrowRight } from 'lucide-react';

const LINUX_GUIDE = {
  title: 'Linux PC / Debian VPS einrichten',
  icon: Server,
  steps: [
    {
      title: 'Skript ausführen',
      code: 'bash codeforge-connect.sh',
      desc: 'Lade die CodeForge-Dateien herunter oder klone das Repository. Führe dann das Skript im Ordner aus.',
    },
    {
      title: 'Token kopieren',
      desc: 'Das Skript zeigt eine Server-URL (z.B. http://192.168.1.100:8787) und einen Token an. Merke dir beides.',
    },
    {
      title: 'In der App verbinden',
      desc: 'Öffne die CodeForge-App → Mobile Modus aktivieren → "Netzwerk durchsuchen" oder "Server-URL manuell eingeben".',
    },
    {
      title: 'Fertig!',
      desc: 'Sobald verbunden, leuchtet unten rechts ein grüner Punkt. Du kannst jetzt Terminals und KI-Chat nutzen.',
    },
  ],
};

const DEBIAN_GUIDE = {
  title: 'Debian VPS (Server) einrichten',
  icon: Server,
  steps: [
    {
      title: 'Skript als root ausführen',
      code: 'sudo bash codeforge-connect-debian.sh',
      desc: 'Installiert Node.js, agy/codex CLIs und richtet einen systemd-Dienst ein, der automatisch startet.',
    },
    {
      title: 'Server läuft dauerhaft',
      desc: 'Der Dienst läuft auch nach Neustart. Überprüfen mit: systemctl status codeforge-remote',
    },
    {
      title: 'IP + Token notieren',
      desc: 'Das Skript zeigt die öffentliche IP und den Token an. In der App unter "Server-URL manuell eingeben" eintragen.',
    },
    {
      title: 'Fertig!',
      desc: 'Der VPS ist bereit. Die App verbindet sich remote – auch von unterwegs.',
    },
  ],
};

const WINDOWS_GUIDE = {
  title: 'Windows PC einrichten',
  icon: Monitor,
  steps: [
    {
      title: 'PowerShell öffnen (als Administrator)',
      code: 'powershell -ExecutionPolicy Bypass -File codeforge-connect-windows.ps1',
      desc: 'Rechtsklick auf Start → "Windows PowerShell (Administrator)" auswählen. Zum Skript-Ordner navigieren.',
    },
    {
      title: 'Node.js wird geprüft',
      desc: 'Das Skript prüft, ob Node.js installiert ist. Falls nicht, öffnet es die Download-Seite. Installiere Node.js und führe das Skript erneut aus.',
    },
    {
      title: 'Firewall-Freigabe',
      desc: 'Das Skript öffnet Port 8787 in der Windows-Firewall. Bestätige die Sicherheitsabfrage.',
    },
    {
      title: 'In der App verbinden',
      desc: 'Die App zeigt IP und Token an. In der App → "Netzwerk durchsuchen" findet den PC automatisch im selben Netzwerk!',
    },
    {
      title: 'Fertig!',
      desc: 'Grüner Punkt = verbunden. PC und Handy müssen im selben WLAN sein.',
    },
  ],
};

const MOBILE_NOTE = {
  title: 'Wichtig für Mobile-Nutzer',
  icon: Wifi,
  steps: [
    {
      title: 'Kopplungsmodus (einfachste Methode!)',
      desc: 'Starte auf dem PC/Server den Kopplungsmodus (POST /pair/start oder automatisch beim Serverstart). Du erhältst einen 4-stelligen Code. In der App: "Verbinden" → "Kopplungsmodus starten" → Code eingeben → Fertig!',
    },
    {
      title: 'Kein CLI nötig!',
      desc: 'Im Mobile-Modus verbindest du dich mit einem entfernten PC/Server. Du brauchst keine CLI (agy, codex etc.) auf deinem Handy zu installieren. Alles läuft auf dem verbundenen Rechner.',
    },
    {
      title: 'VPS / Remote-Server',
      desc: 'Für Server ausserhalb deines Netzwerks: Nutze "Server-URL manuell eingeben" mit der IP des Servers und dem Token. Der Server zeigt beim Start die Verbindungsdaten an.',
    },
    {
      title: 'Themen: Bilder & Videos hochladen',
      desc: 'In den Einstellungen → Aussehen → "Eigenes Theme erstellen" kannst du mit "Hintergrundbild/-video wählen" Dateien von deinem Gerät auswählen. Bilder werden dauerhaft gespeichert, Videos temporär für die Sitzung.',
    },
    {
      title: 'Verbindungsstatus',
      desc: 'Ein grüner "Live"-Punkt unten rechts zeigt an: Du bist verbunden. Kein Punkt = nicht verbunden. Tippe auf "Verbinden" um die Einrichtung zu starten.',
    },
  ],
};

const TROUBLESHOOTING = [
  {
    title: 'LAN-Suche findet keinen Server',
    desc: 'Stelle sicher, dass PC und Handy im selben Netzwerk (WLAN) sind. Prüfe die Firewall: Port 8787 muss offen sein.',
  },
  {
    title: 'Verbindung bricht ab',
    desc: 'Das Skript auf dem PC läuft nur, solange das Terminal offen ist (Strg+C beendet es). Für Dauerbetrieb: Debain VPS Skript verwenden.',
  },
  {
    title: 'Hintergrund (Video/Foto) laden nicht',
    desc: 'Auf dem Handy: Wähle eine Datei aus der Galerie aus. Kleine Bilder (<5MB) werden als data: URL gespeichert, Videos als temporäre Blob-URL.',
  },
];

export default function TutorialModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[130] flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="w-full max-w-2xl bg-[#141214] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg text-white font-semibold">Einrichtung</h2>
              <p className="text-xs text-zinc-600 mt-0.5">Schritt-für-Schritt Anleitung</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-8">
          {/* Mobile Note */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-violet-400/10 border border-violet-400/20 flex items-center justify-center">
                <Wifi className="w-4 h-4 text-violet-300" />
              </div>
              <div>
                <h3 className="text-sm text-white font-medium">{MOBILE_NOTE.title}</h3>
                <p className="text-[10px] text-zinc-600">Das musst du wissen</p>
              </div>
            </div>
            <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4 space-y-3">
              {MOBILE_NOTE.steps.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-violet-400/15 border border-violet-400/25 flex items-center justify-center shrink-0">
                      <span className="text-[10px] text-violet-300 font-bold">{i + 1}</span>
                    </div>
                    {i < MOBILE_NOTE.steps.length - 1 && <div className="w-px flex-1 bg-white/5 mt-1" />}
                  </div>
                  <div className="pb-3 min-w-0 flex-1">
                    <div className="text-xs text-zinc-200 font-medium">{step.title}</div>
                    <div className="text-[11px] text-zinc-500 mt-1 leading-5">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Linux Guide */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
                <Terminal className="w-4 h-4 text-emerald-300" />
              </div>
              <div>
                <h3 className="text-sm text-white font-medium">Linux PC</h3>
                <p className="text-[10px] text-zinc-600">Schnellste Methode für lokale PCs</p>
              </div>
            </div>
            <div className="space-y-3">
              {LINUX_GUIDE.steps.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
                      <span className="text-[10px] text-amber-300 font-bold">{i + 1}</span>
                    </div>
                    {i < LINUX_GUIDE.steps.length - 1 && <div className="w-px flex-1 bg-white/5 mt-1" />}
                  </div>
                  <div className="pb-3 min-w-0 flex-1">
                    <div className="text-xs text-zinc-200 font-medium">{step.title}</div>
                    <div className="text-[11px] text-zinc-500 mt-1 leading-5">{step.desc}</div>
                    {step.code && (
                      <pre className="text-[11px] font-mono text-zinc-300 bg-black/30 p-2 rounded-lg border border-white/5 mt-1.5 overflow-x-auto">
                        {step.code}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Debian VPS Guide */}
          <div className="border-t border-white/5 pt-6">
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-sky-400/10 border border-sky-400/20 flex items-center justify-center">
                  <Download className="w-4 h-4 text-sky-300" />
                </div>
                <div>
                  <h3 className="text-sm text-white font-medium">Debian VPS (Server)</h3>
                  <p className="text-[10px] text-zinc-600">Für dauerhaften Betrieb – auch von unterwegs</p>
                </div>
              </div>
              <div className="space-y-3">
                {DEBIAN_GUIDE.steps.map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full bg-sky-400/10 border border-sky-400/20 flex items-center justify-center shrink-0">
                        <span className="text-[10px] text-sky-300 font-bold">{i + 1}</span>
                      </div>
                      {i < DEBIAN_GUIDE.steps.length - 1 && <div className="w-px flex-1 bg-white/5 mt-1" />}
                    </div>
                    <div className="pb-3 min-w-0 flex-1">
                      <div className="text-xs text-zinc-200 font-medium">{step.title}</div>
                      <div className="text-[11px] text-zinc-500 mt-1 leading-5">{step.desc}</div>
                      {step.code && (
                        <pre className="text-[11px] font-mono text-zinc-300 bg-black/30 p-2 rounded-lg border border-white/5 mt-1.5 overflow-x-auto">
                          {step.code}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Windows Guide */}
          <div className="border-t border-white/5 pt-6">
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-400/10 border border-blue-400/20 flex items-center justify-center">
                  <Monitor className="w-4 h-4 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-sm text-white font-medium">Windows PC</h3>
                  <p className="text-[10px] text-zinc-600">PowerShell-Skript – Firewall wird automatisch konfiguriert</p>
                </div>
              </div>
              <div className="space-y-3">
                {WINDOWS_GUIDE.steps.map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full bg-blue-400/10 border border-blue-400/20 flex items-center justify-center shrink-0">
                        <span className="text-[10px] text-blue-300 font-bold">{i + 1}</span>
                      </div>
                      {i < WINDOWS_GUIDE.steps.length - 1 && <div className="w-px flex-1 bg-white/5 mt-1" />}
                    </div>
                    <div className="pb-3 min-w-0 flex-1">
                      <div className="text-xs text-zinc-200 font-medium">{step.title}</div>
                      <div className="text-[11px] text-zinc-500 mt-1 leading-5">{step.desc}</div>
                      {step.code && (
                        <pre className="text-[11px] font-mono text-zinc-300 bg-black/30 p-2 rounded-lg border border-white/5 mt-1.5 overflow-x-auto">
                          {step.code}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Troubleshooting */}
          <div className="border-t border-white/5 pt-6">
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-red-400/10 border border-red-400/20 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-red-300" />
                </div>
                <div>
                  <h3 className="text-sm text-white font-medium">Hilfe / Probleme</h3>
                  <p className="text-[10px] text-zinc-600">Häufige Fragen und Lösungen</p>
                </div>
              </div>
              <div className="space-y-3">
                {TROUBLESHOOTING.map((item, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="text-xs text-zinc-200 font-medium">{item.title}</div>
                    <div className="text-[11px] text-zinc-500 mt-1 leading-5">{item.desc}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* All scripts reference */}
          <div className="border-t border-white/5 pt-6">
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <div className="text-xs text-amber-200 font-medium mb-2">Alle Setup-Skripte</div>
              <div className="space-y-2 text-[11px] font-mono text-zinc-400">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3 h-3 text-emerald-400" />
                  <span>Linux PC:</span>
                  <span className="text-zinc-300">bash codeforge-connect.sh</span>
                </div>
                <div className="flex items-center gap-2">
                  <Download className="w-3 h-3 text-sky-400" />
                  <span>Debian VPS:</span>
                  <span className="text-zinc-300">sudo bash codeforge-connect-debian.sh</span>
                </div>
                <div className="flex items-center gap-2">
                  <Monitor className="w-3 h-3 text-blue-400" />
                  <span>Windows:</span>
                  <span className="text-zinc-300">powershell -File codeforge-connect-windows.ps1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
