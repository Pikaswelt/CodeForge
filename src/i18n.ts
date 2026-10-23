import { useSyncExternalStore } from 'react';
import EN from './i18n/en';

// App language: one choice for the whole app (desktop and mobile UI).
// The German text is the key; English lives in ./i18n/en.ts. A missing entry
// simply falls back to German, so a single forgotten string never breaks a view.
export type Language = 'de' | 'en';

const STORAGE_KEY = 'fancyLanguage';
// The first-run tour used to store its own language; keep it as the initial value.
const LEGACY_TOUR_KEY = 'fancyWelcomeTourLang';

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'de', label: tr("Deutsch") },
  { id: 'en', label: 'English' },
];

function detect(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'de' || saved === 'en') return saved;
    const legacy = localStorage.getItem(LEGACY_TOUR_KEY);
    if (legacy === 'de' || legacy === 'en') return legacy;
  } catch {
    // storage unavailable
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() || '' : '';
  return browser.startsWith('de') ? 'de' : 'en';
}

let current: Language = detect();
const listeners = new Set<() => void>();

function applyDocumentLanguage() {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
applyDocumentLanguage();
// Tell the main process on start too, so its native dialogs use the saved choice.
if (typeof window !== 'undefined') {
  try {
    window.agentWorkspace?.setLanguage?.(current);
  } catch {
    // browser build without the desktop bridge
  }
}

export function language(): Language {
  return current;
}

// Locale for dates and numbers, so formats follow the chosen language too.
export function locale(): string {
  return current === 'en' ? 'en-GB' : 'de-DE';
}

export function setLanguage(next: Language) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
    localStorage.removeItem(LEGACY_TOUR_KEY);
  } catch {
    // storage unavailable
  }
  applyDocumentLanguage();
  // Native dialogs and main-process errors follow the same choice.
  try {
    window.agentWorkspace?.setLanguage?.(next);
  } catch {
    // browser build without the desktop bridge
  }
  listeners.forEach((listener) => listener());
}

export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Re-renders the calling component when the language changes.
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, language, language);
}

// Translates a German source text. Placeholders like {count} are filled from vars.
export function tr(key: string, vars?: Record<string, string | number>): string {
  const text = current === 'en' ? EN[key] ?? key : key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] === undefined ? match : String(vars[name]),
  );
}
