import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleUserRound,
  Download,
  Lock,
  Puzzle,
  Server,
  Sparkles,
  SquareTerminal,
  Wand2,
} from 'lucide-react';
import type { FancyAccount } from '../electron';
import { PLAN_INFO } from '../plans';

// Erstes Setup nach dem Login: Willkommen, was neu ist, was der Agent kann, Terminals nach Plan,
// Updates und zum Schluss die Planwahl. Pro Konto nur einmal, der Abschluss wird lokal gemerkt.
const SEEN_KEY = (id: string) => `fancyOnboardingSeen:${id}`;
const STEPS = 5;

function seenFor(id: string) {
  try {
    return localStorage.getItem(SEEN_KEY(id)) === '1';
  } catch {
    return false;
  }
}

export default function Onboarding() {
  const api = window.agentWorkspace?.fancyAccount;
  const [account, setAccount] = useState<FancyAccount | null>(null);
  const [checked, setChecked] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!api) {
      setChecked(true);
      return;
    }
    let active = true;
    api
      .me()
      .then((value) => {
        if (active) setAccount(value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    // Nach dem Abmelden darf das Setup für das nächste Konto wieder kommen.
    const reset = () => {
      setAccount(null);
      setStep(0);
    };
    window.addEventListener('fancy:logged-out', reset);
    return () => window.removeEventListener('fancy:logged-out', reset);
  }, []);

  if (!checked || !account || seenFor(account.id)) return null;

  const finish = () => {
    try {
      localStorage.setItem(SEEN_KEY(account.id), '1');
    } catch {}
    setAccount(null);
  };

  const plan = account.plan || 'free';
  const info = PLAN_INFO[plan];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-5 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141214] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            <Sparkles className="h-3.5 w-3.5 text-amber-300/80" /> {tr("Setup")}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: STEPS }, (_, index) => (
                <span
                  key={index}
                  className={`h-1.5 rounded-full transition-all ${
                    index === step ? 'w-6 bg-orange-400' : index < step ? 'w-1.5 bg-zinc-500' : 'w-1.5 bg-white/15'
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] tabular-nums text-zinc-500">{step + 1} / {STEPS}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-7 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              {step === 0 && (
                <div className="flex flex-col items-center py-6 text-center">
                  <div className="h-24 w-24 overflow-hidden rounded-full border border-white/15 bg-white/5 shadow-xl">
                    {account.avatar ? (
                      <img
                        src={account.avatar}
                        alt={account.name}
                        draggable={false}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <CircleUserRound className="h-12 w-12 text-zinc-500" />
                      </div>
                    )}
                  </div>
                  <h1 className="mt-5 text-2xl font-semibold text-white">{tr("Willkommen,")} {account.name}</h1>
                  <p className="mt-1 text-sm text-zinc-400">
                    {account.provider === 'discord' ? tr("Angemeldet mit Discord") : account.provider === 'github' ? tr("Angemeldet mit GitHub") : tr("Angemeldet")}
                    {' · '}{tr("Tarif")} {info.label}
                  </p>
                  <p className="mt-5 max-w-md text-sm leading-relaxed text-zinc-300">
                    {tr("Schön, dass du da bist. In den nächsten Minuten zeigen wir dir, was FancyCode Desktop kann – vom Agenten, der selbst loslegt, bis zu den Terminals nach Plan.")}
                  </p>
                </div>
              )}

              {step === 1 && (
                <Section icon={<Wand2 className="h-4 w-4" />} title={tr("Das ist neu")} subtitle={tr("Alles, was in den letzten Updates dazugekommen ist.")}>
                  <div className="space-y-2.5">
                    <Feature icon={<Sparkles className="h-4 w-4" />} title={tr("Kontomenü mit echtem Login")} text={tr("Name, Profilbild und Anbieter direkt oben im Menü – Abmelden führt zurück zum Zugang.")} />
                    <Feature icon={<Wand2 className="h-4 w-4" />} title={tr("Eingebaute KI mit Tarif")} text={tr("Eigener Assistent ohne API-Key: Free, Pro und Max mit unterschiedlichen Grenzen – plus Resets, wenn es mal klemmt.")} />
                    <Feature icon={<Puzzle className="h-4 w-4" />} title={tr("Plugins")} text={tr("Erweiterungen aus dem Katalog mit SHA-256-Prüfung, eigener Einstellungsseite und Start über das Kontomenü.")} />
                    <Feature icon={<Server className="h-4 w-4" />} title={tr("V-Server per SSH")} text={tr("Auf dem Server arbeiten wie lokal: Terminal, Dateien per SFTP und mehrere Server im Raster.")} />
                  </div>
                </Section>
              )}

              {step === 2 && (
                <Section icon={<Wand2 className="h-4 w-4" />} title={tr("Der Agent arbeitet für dich")} subtitle={tr("Kein Zuschauen: er führt Schritte wirklich aus – im Rahmen der Rechte, die du ihm gibst.")}>
                  <div className="space-y-2.5">
                    <Feature icon={<Wand2 className="h-4 w-4" />} title={tr("Aktionen im Projekt")} text={tr("Dateien lesen und schreiben, Befehle ausführen, Tests starten, Git bedienen – je nach Zugriffsmodus „Nur lesen“, „Projekt“ oder „Voll“.")} />
                    <Feature icon={<SquareTerminal className="h-4 w-4" />} title={tr("Terminals starten")} text={tr("Er öffnet deine CLI-Harnesses und mehrere Terminals gleichzeitig, als Tabs oder im Raster.")} />
                    <Feature icon={<Server className="h-4 w-4" />} title={tr("Auch auf dem Server")} text={tr("Mit einem verbundenen V-Server laufen seine Befehle per SSH dort, wo das Projekt liegt.")} />
                    <Feature icon={<Download className="h-4 w-4" />} title={tr("Installieren und aufräumen")} text={tr("Abhängigkeiten, CLI-Tools, Builds und Updates einspielen – der Agent kümmert sich um die Kommandozeile.")} />
                  </div>
                  <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[12px] text-amber-200/90">
                    {tr("Alles, was er ausführt, siehst du im Verlauf. Kritische Schritte bestätigst du selbst.")}
                  </p>
                </Section>
              )}

              {step === 3 && (
                <Section icon={<Download className="h-4 w-4" />} title={tr("Updates kommen von selbst")} subtitle={tr("FancyCode Desktop prüft beim Start und lässt sich direkt aktualisieren.")}>
                  <div className="space-y-2.5">
                    <Feature icon={<Download className="h-4 w-4" />} title={tr("Update installieren")} text={tr("Über „Nach Updates suchen“ im Kontomenü – installiert und startet neu, ohne dass du etwas herunterladen musst.")} />
                    <Feature icon={<Sparkles className="h-4 w-4" />} title={tr("Was ist neu")} text={tr("Nach dem Update zeigt die App die Änderungen der neuen Version.")} />
                    <Feature icon={<SquareTerminal className="h-4 w-4" />} title={tr("Remote dabei")} text={tr("Die Web-Version unter workspace.crazymine.de wird beim Update mitgebaut und liefert denselben Stand.")} />
                  </div>
                  <p className="mt-3 text-[12px] text-zinc-500">
                    {tr("Auf Wunsch kann der Agent die Updates ebenfalls für dich anstoßen.")}
                  </p>
                </Section>
              )}

              {step === 4 && (
                <Section icon={<Check className="h-4 w-4" />} title={tr("Dein Plan")} subtitle={tr("Der Zugang bleibt an eine Einladung gebunden.")}>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <PlanCard
                      name={PLAN_INFO.free.label}
                      lines={[tr("2 Terminals"), tr("1 V-Server"), tr("KI: niedrig")]}
                      note={tr("Kostenlos, Zugang per Einladung")}
                      active={plan === 'free'}
                      selected={plan === 'free'}
                    />
                    <PlanCard
                      name={PLAN_INFO.pro.label}
                      lines={[tr("8 Terminals"), tr("5 V-Server"), tr("KI: normal"), tr("Animierte Hintergründe")]}
                      note={tr("Wird später freigeschaltet")}
                      locked
                    />
                    <PlanCard
                      name={PLAN_INFO.max.label}
                      lines={[tr("8 Terminals"), tr("20 V-Server"), tr("KI: großzügig"), tr("Animierte Hintergründe")]}
                      note={tr("Wird später freigeschaltet")}
                      locked
                    />
                  </div>
                  <p className="mt-3 text-[12px] text-zinc-500">
                    {tr("Free ist aktuell der einzige Plan, den du selbst wählst. Pro und Max sind noch nicht verfügbar – sie werden später freigeschaltet.")}
                  </p>
                </Section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
          <button
            onClick={finish}
            className="text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            {tr("Überspringen")}
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((value) => value - 1)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5"
              >
                <ChevronLeft className="h-4 w-4" /> {tr("Zurück")}
              </button>
            )}
            <button
              onClick={() => (step === STEPS - 1 ? finish() : setStep((value) => value + 1))}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-400"
            >
              {step === STEPS - 1 ? tr("Los geht’s") : tr("Weiter")} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">
        {icon} FancyCode Desktop
      </div>
      <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-zinc-100">{title}</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">{text}</div>
      </div>
    </div>
  );
}

function PlanCard({ name, lines, note, active, selected, locked }: { name: string; lines: string[]; note: string; active?: boolean; selected?: boolean; locked?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${
        selected ? 'border-orange-400/50 bg-orange-500/10' : 'border-white/10 bg-white/[0.03]'
      } ${locked ? 'opacity-55' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-100">{name}</span>
        {active ? (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-300">
            <Check className="h-3 w-3" /> aktiv
          </span>
        ) : locked ? (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
            <Lock className="h-3 w-3" /> {tr("nicht verfügbar")}
          </span>        ) : null}
      </div>
      <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-400">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">{note}</p>
    </div>
  );
}
