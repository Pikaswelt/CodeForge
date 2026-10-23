import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, BellRing, BookOpen, Bot, Check, ChevronLeft, CircleUserRound, Pickaxe, Sparkles, Volume2, VolumeX } from 'lucide-react';
import AppLogo from './AppLogo';
import { setLanguage, tr, useLanguage, type Language } from '../i18n';
import { updateVoiceSettings } from '../voice';

// Kleine Einführung beim allerersten Start, noch vor Login und Setup: was sich seit CodeForge geändert hat.
// Deutsch oder Englisch; jede Seite hat eine Sprachaufnahme (public/welcome/<de|en>/NN.mp3, erzeugt mit
// scripts/welcome_voice.py). Fehlt sie, läuft die Seite einfach ohne Ton.
const SEEN_KEY = 'fancyWelcomeTourSeen';
const MUTE_KEY = 'fancyWelcomeTourMuted';

type Lang = Language;
type Slide = { icon: typeof Sparkles; tone: string; title: Record<Lang, string>; text: Record<Lang, string> };

const SLIDES: Slide[] = [
  {
    icon: Sparkles,
    tone: 'from-violet-500/30 to-fuchsia-500/10 text-violet-200',
    title: { de: 'Willkommen bei FancyCode Desktop', en: 'Welcome to FancyCode Desktop' },
    text: {
      de: 'Aus CodeForge ist FancyCode geworden: neuer Name, neues Logo und jede Menge Neues. Hier kurz, was sich geändert hat.',
      en: 'CodeForge is now FancyCode: a new name, a new logo and lots of new things. Here is what has changed.',
    },
  },
  {
    icon: CircleUserRound,
    tone: 'from-sky-500/30 to-cyan-500/10 text-sky-200',
    title: { de: 'Ein Konto für alles', en: 'One account for everything' },
    text: {
      de: 'Du brauchst nur noch ein FancyServers-Konto. Ein Login und ein Abo gelten für alle unsere Apps.',
      en: 'All you need is one FancyServers account. One login and one plan work for all of our apps.',
    },
  },
  {
    icon: Bot,
    tone: 'from-fuchsia-500/30 to-pink-500/10 text-fuchsia-200',
    title: { de: 'FancyCode, die eingebaute KI', en: 'FancyCode, the built-in AI' },
    text: {
      de: 'Unser eigener Coding-Agent liest deinen Code, ändert Dateien und führt Befehle aus, ganz ohne eigenen API-Schlüssel.',
      en: 'Our own coding agent reads your code, edits files and runs commands, without an API key of your own.',
    },
  },
  {
    icon: Pickaxe,
    tone: 'from-emerald-500/30 to-lime-500/10 text-emerald-200',
    title: { de: 'Plugins und Minecraft Hub', en: 'Plugins and Minecraft Hub' },
    text: {
      de: 'Unter Einstellungen → Plugins findest du Erweiterungen. Schalte den Minecraft Hub ein, und jede KI hilft dir bei Minecraft-Servern und Plugins, auf deinem Server oder hier auf dem PC.',
      en: 'Settings → Plugins has extensions. Turn on the Minecraft Hub, and any AI helps you with Minecraft servers and plugins, on your server or right here on your PC.',
    },
  },
  {
    icon: BookOpen,
    tone: 'from-amber-500/30 to-orange-500/10 text-amber-200',
    title: { de: 'Skills für alle Agenten', en: 'Skills for every agent' },
    text: {
      de: 'Fertige Anleitungen für Fehlersuche, Code-Review, Git und Server. FancyCode Desktop gibt sie automatisch an FancyCode, Claude Code, OpenCode und Co. weiter.',
      en: 'Ready-made guides for debugging, code review, Git and servers. FancyCode Desktop hands them to FancyCode, Claude Code, OpenCode and more, automatically.',
    },
  },
  {
    icon: BellRing,
    tone: 'from-indigo-500/30 to-violet-500/10 text-indigo-200',
    title: { de: 'Deine Agenten melden sich', en: 'Your agents check in' },
    text: {
      de: 'Unten rechts siehst du, wenn ein Agent verbunden ist, wenn er fertig ist oder eine Frage für dich hat. Ein Klick bringt dich direkt zur Arbeit.',
      en: 'In the bottom right you see when an agent connects, when it is done or when it has a question for you. One click takes you straight to the work.',
    },
  },
  {
    icon: Sparkles,
    tone: 'from-violet-500/30 to-fuchsia-500/10 text-violet-200',
    title: { de: 'Das war’s schon!', en: 'That’s it!' },
    text: {
      de: 'Jetzt richten wir alles für dich ein. Viel Spaß mit FancyCode Desktop!',
      en: 'Now let’s get everything set up for you. Have fun with FancyCode Desktop!',
    },
  },
];

const UI: Record<Lang, { skip: string; back: string; next: string; go: string; soundOn: string; soundOff: string }> = {
  de: { skip: 'Überspringen', back: 'Zurück', next: 'Weiter', go: 'Los geht’s', soundOn: 'Ton an', soundOff: 'Ton aus' },
  en: { skip: 'Skip', back: 'Back', next: 'Next', go: 'Let’s go', soundOn: 'Sound on', soundOff: 'Sound off' },
};


const audioFor = (lang: Lang, index: number) => `./welcome/${lang}/${String(index + 1).padStart(2, '0')}.mp3`;

// First screen of the very first start: one language decision for the whole app.
// It comes before the tour so the narration and every following screen already use it.
const GATE: Record<Lang, { eyebrow: string; title: string; subtitle: string; sample: string; hint: string; next: string }> = {
  de: {
    eyebrow: 'FancyCode Desktop',
    title: 'Willkommen bei FancyCode Desktop',
    subtitle: 'Wähle die Sprache für die gesamte App – Oberfläche, Antworten und Spracheingabe.',
    sample: 'Deine Projekte, dein Agent.',
    hint: 'Du kannst die Sprache jederzeit in den Einstellungen ändern.',
    next: 'Weiter',
  },
  en: {
    eyebrow: 'FancyCode Desktop',
    title: 'Welcome to FancyCode Desktop',
    subtitle: 'Choose the language for the whole app – interface, answers and voice input.',
    sample: 'Your projects, your agent.',
    hint: 'You can change the language anytime in the settings.',
    next: 'Continue',
  },
};

function LanguageGate({ lang, onChoose, onDone }: { lang: Lang; onChoose: (value: Lang) => void; onDone: () => void }) {
  const text = GATE[lang];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') onDone();
      if (event.key === '1') onChoose('de');
      if (event.key === '2') onChoose('en');
      if (event.key === 'ArrowLeft') onChoose('de');
      if (event.key === 'ArrowRight') onChoose('en');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChoose, onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-[#0b0a0c] p-6"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-violet-500/25 via-fuchsia-500/10 to-transparent blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-[300px] w-[700px] -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />
      </div>

      <div className="absolute left-6 top-5 flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <AppLogo className="h-6 w-6" /> {text.eyebrow}
      </div>

      <div className="relative w-full max-w-2xl text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/10 shadow-2xl">
          <AppLogo className="h-11 w-11" />
        </div>
        <h1 className="mt-7 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">{text.title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-6 text-zinc-400">{text.subtitle}</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={text.title}>
          {(['de', 'en'] as Lang[]).map((value) => {
            const active = lang === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChoose(value)}
                className={`group flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all ${
                  active
                    ? 'border-violet-400/70 bg-violet-500/15 shadow-lg shadow-violet-500/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                }`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-[13px] font-bold uppercase tracking-wider ${active ? 'border-violet-300/40 bg-violet-400/20 text-violet-100' : 'border-white/10 bg-white/5 text-zinc-400'}`}>
                  {value}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-zinc-50">{value === 'de' ? 'Deutsch' : 'English'}</span>
                  <span className="block truncate text-[12px] text-zinc-500">{value === 'de' ? GATE.de.sample : GATE.en.sample}</span>
                </span>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${active ? 'border-violet-300 bg-violet-400 text-[#140f1c]' : 'border-white/20 text-transparent'}`}>
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onDone}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:bg-violet-400"
        >
          {text.next} <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-4 text-[11px] text-zinc-600">{text.hint}</p>
      </div>
    </motion.div>
  );
}

export function welcomeTourSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export default function WelcomeTour({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<'language' | 'tour'>('language');
  const [index, setIndex] = useState(0);
  const lang = useLanguage();
  const t = UI[lang];
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [spoken, setSpoken] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    setSpoken(false);
    audio.current?.pause();
    // The language is chosen before the narration starts.
    if (muted || stage !== 'tour') {
      setSpoken(true);
      return;
    }
    const player = new Audio(audioFor(lang, index));
    audio.current = player;
    player.onended = () => setSpoken(true);
    player.onerror = () => setSpoken(true);
    player.play().catch(() => setSpoken(true));
    return () => player.pause();
  }, [index, muted, lang, stage]);

  const finish = () => {
    audio.current?.pause();
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {}
    onDone();
  };

  // One choice for the whole app: tour narration and every screen follow it.
  const chooseLang = (value: Lang) => {
    setLanguage(value);
    updateVoiceSettings({ language: value });
  };

  const toggleMute = () => {
    setMuted((value) => {
      try {
        localStorage.setItem(MUTE_KEY, value ? '0' : '1');
      } catch {}
      return !value;
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'Enter') last ? finish() : setIndex((value) => value + 1);
      if (event.key === 'ArrowLeft' && index > 0) setIndex((value) => value - 1);
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (stage === 'language') {
    return <LanguageGate lang={lang} onChoose={chooseLang} onDone={() => setStage('tour')} />;
  }

  const Icon = slide.icon;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0b0a0c] p-6"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br blur-3xl transition-all duration-700 ${slide.tone}`} />
      </div>

      <div className="absolute left-6 top-5 flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <AppLogo className="h-6 w-6" /> FancyCode Desktop
      </div>
      <div className="absolute right-5 top-4 flex items-center gap-1">
        <div className="mr-1 flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1" title={tr("Gilt für die gesamte App – Oberfläche und Spracheingabe.")}>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{tr("Sprache")}</span>
          <div className="flex rounded-md bg-black/20 p-0.5 text-[11px] font-semibold">
            {(['de', 'en'] as Lang[]).map((value) => (
              <button
                key={value}
                onClick={() => chooseLang(value)}
                aria-pressed={lang === value}
                className={`rounded px-2 py-0.5 transition-colors ${lang === value ? 'bg-white/15 text-zinc-50' : 'text-zinc-500 hover:text-zinc-200'}`}
              >
                {value === 'de' ? 'Deutsch' : 'English'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={toggleMute} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100" aria-label={muted ? t.soundOn : t.soundOff}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        {!last && (
          <button onClick={finish} className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100">
            {t.skip}
          </button>
        )}
      </div>

      <div className="relative w-full max-w-xl text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${lang}-${index}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
          >
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br shadow-2xl ${slide.tone}`}>
              {index === 0 ? <AppLogo className="h-11 w-11" /> : <Icon className="h-9 w-9" />}
            </div>
            <h1 className="mt-7 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">{slide.title[lang]}</h1>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-6 text-zinc-400">{slide.text[lang]}</p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex items-center justify-center gap-1.5">
          {SLIDES.map((_, dot) => (
            <button
              key={dot}
              onClick={() => setIndex(dot)}
              aria-label={tr("Seite {n}", { n: dot + 1 })}
              className={`h-1.5 rounded-full transition-all ${dot === index ? 'w-6 bg-violet-400' : 'w-1.5 bg-white/20 hover:bg-white/40'}`}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          {index > 0 && (
            <button onClick={() => setIndex(index - 1)} className="flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100">
              <ChevronLeft className="h-4 w-4" /> {t.back}
            </button>
          )}
          <button
            onClick={() => (last ? finish() : setIndex(index + 1))}
            className={`flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:bg-violet-400 ${spoken ? 'ring-2 ring-violet-300/60 ring-offset-2 ring-offset-[#0b0a0c]' : ''}`}
          >
            {last ? t.go : t.next} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
