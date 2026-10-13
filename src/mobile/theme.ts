import type { CSSProperties } from 'react';
import type { MobileSettings, MobileTheme } from './types';

// The desktop's built-in themes (same ids and colours), expressed as the tokens the mobile UI uses.
export type BuiltInTheme = {
  id: string;
  name: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  light?: boolean;
  gradient: string;
  animated?: boolean;
};

export const BUILT_IN_THEMES: BuiltInTheme[] = [
  { id: 'modern-dark', name: 'Modern Dark', bg: '#111111', surface: '#1c1a1b', text: '#e4e4e7', muted: '#a1a1aa', accent: '#f2c96d', gradient: 'linear-gradient(135deg,#1c181a,#111111 55%,#0a0a0a)' },
  { id: 'classic-light', name: 'Classic Light', bg: '#f5f2ed', surface: '#ffffff', text: '#18181b', muted: '#57534e', accent: '#b45309', light: true, gradient: 'linear-gradient(135deg,#f5f2ed,#e5e1d8 55%,#d1ccc0)' },
  { id: 'deep-galactic', name: 'Deep Galactic', bg: '#05060a', surface: '#0e121d', text: '#e2e8f0', muted: '#94a3b8', accent: '#64d2ff', gradient: 'radial-gradient(circle at 20% 10%,#1b2440,transparent 45%),linear-gradient(135deg,#0e121d,#05060a 55%,#020202)' },
  { id: 'muted-earth', name: 'Muted Earth', bg: '#e5e1d8', surface: '#f2efe8', text: '#3f3a30', muted: '#6f5f46', accent: '#6f5f46', light: true, gradient: 'linear-gradient(135deg,#e5e1d8,#d1ccc0 55%,#c4c0b4)' },
  { id: 'neon-cyber', name: 'Neon Cyber', bg: '#0a0a0a', surface: '#1a1a1a', text: '#e0faff', muted: '#7dd3fc', accent: '#ff3df2', gradient: 'radial-gradient(circle at 85% 0%,#3b0a3a,transparent 45%),linear-gradient(135deg,#1a1a1a,#0a0a0a 55%,#050505)' },
  { id: 'midnight-ocean', name: 'Midnight Ocean', bg: '#06111b', surface: '#0b2235', text: '#cffafe', muted: '#7dd3fc', accent: '#67e8f9', gradient: 'linear-gradient(135deg,#071826,#06111b 55%,#02080d)' },
  { id: 'forest-terminal', name: 'Forest Terminal', bg: '#07130d', surface: '#0d2418', text: '#d1fae5', muted: '#86efac', accent: '#7ddc9f', gradient: 'linear-gradient(135deg,#07130d,#0a1f14 55%,#030704)' },
  { id: 'solarized-dawn', name: 'Solarized Dawn', bg: '#fdf6e3', surface: '#fffbef', text: '#073642', muted: '#586e75', accent: '#268bd2', light: true, gradient: 'linear-gradient(135deg,#fdf6e3,#eee8d5 55%,#d6ceb2)' },
  { id: 'rose-quartz', name: 'Rose Quartz', bg: '#fff1f2', surface: '#ffffff', text: '#4c0519', muted: '#9f1239', accent: '#be185d', light: true, gradient: 'linear-gradient(135deg,#fff1f2,#fce7f3 55%,#fbcfe8)' },
  { id: 'mono-slate', name: 'Mono Slate', bg: '#0f172a', surface: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', accent: '#e2e8f0', gradient: 'linear-gradient(135deg,#0f172a,#111827 55%,#020617)' },
  { id: 'amber-console', name: 'Amber Console', bg: '#160f06', surface: '#2a1a07', text: '#fef3c7', muted: '#fbbf24', accent: '#f59e0b', gradient: 'linear-gradient(135deg,#160f06,#241505 55%,#050301)' },
  { id: 'arctic-blue', name: 'Arctic Blue', bg: '#eff6ff', surface: '#ffffff', text: '#0f172a', muted: '#475569', accent: '#2563eb', light: true, gradient: 'linear-gradient(135deg,#eff6ff,#dbeafe 55%,#bfdbfe)' },
  { id: 'violet-noir', name: 'Violet Noir', bg: '#10051b', surface: '#1b0b2d', text: '#ede9fe', muted: '#c4b5fd', accent: '#c084fc', gradient: 'linear-gradient(135deg,#10051b,#1b0b2d 55%,#05010a)' },
  { id: 'high-contrast', name: 'High Contrast', bg: '#000000', surface: '#0a0a0a', text: '#ffffff', muted: '#d4d4d4', accent: '#22c55e', gradient: 'linear-gradient(#000,#000)' },
  { id: 'aurora-flow', name: 'Aurora Flow', bg: '#052e2b', surface: '#0b3b37', text: '#ecfdf5', muted: '#a7f3d0', accent: '#a7f3d0', animated: true, gradient: 'linear-gradient(120deg,#052e2b,#0e7490,#4c1d95,#065f46,#052e2b)' },
  { id: 'neon-flow', name: 'Neon Flow', bg: '#09090b', surface: '#18181b', text: '#fdf4ff', muted: '#f0abfc', accent: '#22d3ee', animated: true, gradient: 'linear-gradient(120deg,#09090b,#701a75,#0e7490,#1e1b4b,#09090b)' },
  { id: 'glass-apple-dark', name: 'Glass Dark', bg: '#0b0b0f', surface: '#1f1f27', text: '#f4f4f5', muted: '#a1a1aa', accent: '#0a84ff', gradient: 'radial-gradient(circle at 15% 15%,#3a1c71,transparent 45%),radial-gradient(circle at 85% 30%,#0f4c75,transparent 45%),linear-gradient(135deg,#0b0b0f,#14141c)' },
  { id: 'glass-apple-light', name: 'Glass Light', bg: '#eef1f6', surface: '#ffffff', text: '#18181b', muted: '#52525b', accent: '#007aff', light: true, gradient: 'radial-gradient(circle at 15% 15%,#ffd1dc,transparent 45%),radial-gradient(circle at 85% 30%,#c7e3ff,transparent 45%),linear-gradient(135deg,#eef1f6,#f8fafc)' },
];

export function findBuiltIn(id: string | undefined) {
  return BUILT_IN_THEMES.find((theme) => theme.id === id) || BUILT_IN_THEMES[0];
}

function hexToRgb(hex: string) {
  const value = hex.replace('#', '').trim();
  const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value.slice(0, 6);
  const number = Number.parseInt(full, 16);
  if (Number.isNaN(number)) return { r: 17, g: 17, b: 17 };
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

export function isLightColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

export function rgbTriplet(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

export type ResolvedTheme = {
  id: string;
  name: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  light: boolean;
  gradient: string;
  animated: boolean;
  media?: string;
  mediaKind?: 'image' | 'video';
  mediaDim: number;
  mediaBlur: number;
};

// Turns the selected theme (built-in, custom or wallpaper-only) into the values the UI renders.
export function resolveTheme(themeId: string, customThemes: MobileTheme[]): ResolvedTheme {
  const custom = customThemes.find((theme) => theme.id === themeId);
  const base = custom?.mediaOnly ? customThemes.find((theme) => theme.id === custom.baseTheme && !theme.mediaOnly) : undefined;
  const look = custom?.mediaOnly ? base : custom;
  if (look) {
    const light = isLightColor(look.background);
    return {
      id: themeId,
      name: custom?.name || look.name,
      bg: look.background,
      surface: look.surface,
      text: look.text,
      muted: `color-mix(in srgb, ${look.text} 62%, ${look.background})`,
      accent: look.accent,
      light,
      gradient: `radial-gradient(circle at 18% 18%, color-mix(in srgb, ${look.accent} 34%, transparent), transparent 32%), radial-gradient(circle at 82% 20%, color-mix(in srgb, ${look.surface} 78%, transparent), transparent 34%), linear-gradient(135deg, ${look.background}, ${look.surface}, color-mix(in srgb, ${look.accent} 24%, ${look.background}))`,
      animated: Boolean(look.animatedGradient),
      media: custom?.backgroundMedia,
      mediaKind: custom?.backgroundMediaKind,
      mediaDim: custom?.mediaDim ?? 40,
      mediaBlur: custom?.mediaBlur ?? 0,
    };
  }
  const builtIn = findBuiltIn(custom?.mediaOnly ? custom.baseTheme : themeId);
  return {
    id: themeId,
    name: custom?.name || builtIn.name,
    bg: builtIn.bg,
    surface: builtIn.surface,
    text: builtIn.text,
    muted: builtIn.muted,
    accent: builtIn.accent,
    light: Boolean(builtIn.light),
    gradient: builtIn.gradient,
    animated: Boolean(builtIn.animated),
    media: custom?.backgroundMedia,
    mediaKind: custom?.backgroundMediaKind,
    mediaDim: custom?.mediaDim ?? 40,
    mediaBlur: custom?.mediaBlur ?? 0,
  };
}

export function themeStyle(theme: ResolvedTheme, settings: MobileSettings): CSSProperties {
  return {
    '--cf-bg': theme.bg,
    '--cf-surface': theme.surface,
    '--cf-text': theme.text,
    '--cf-muted': theme.muted,
    '--cf-accent': theme.accent,
    '--cf-accent-contrast': isLightColor(theme.accent) ? '#111111' : '#ffffff',
    '--cf-surface-alpha': `${settings.surfaceOpacity}%`,
    '--cf-blur': `${settings.blur}px`,
    '--cf-radius': `${settings.radius}px`,
    '--cf-line': theme.light ? 'rgb(0 0 0 / 0.09)' : 'rgb(255 255 255 / 0.09)',
    '--cf-hover': theme.light ? 'rgb(0 0 0 / 0.05)' : 'rgb(255 255 255 / 0.06)',
    '--cf-terminal-alpha': `${settings.terminalOpacity}%`,
    colorScheme: theme.light ? 'light' : 'dark',
  } as CSSProperties;
}

// xterm colours that match the theme; the background stays transparent so wallpapers show through.
export function terminalTheme(theme: ResolvedTheme) {
  const light = theme.light;
  return {
    background: '#00000000',
    foreground: light ? '#1f2937' : '#e5e7eb',
    cursor: theme.accent,
    cursorAccent: theme.bg,
    selectionBackground: light ? '#93c5fd88' : '#ffffff40',
    black: light ? '#374151' : '#1f2937',
    red: '#ef4444',
    green: light ? '#15803d' : '#22c55e',
    yellow: light ? '#a16207' : '#eab308',
    blue: light ? '#1d4ed8' : '#60a5fa',
    magenta: light ? '#a21caf' : '#e879f9',
    cyan: light ? '#0e7490' : '#22d3ee',
    white: light ? '#6b7280' : '#e5e7eb',
    brightBlack: light ? '#4b5563' : '#6b7280',
    brightRed: '#f87171',
    brightGreen: light ? '#16a34a' : '#4ade80',
    brightYellow: light ? '#ca8a04' : '#facc15',
    brightBlue: light ? '#2563eb' : '#93c5fd',
    brightMagenta: light ? '#c026d3' : '#f0abfc',
    brightCyan: light ? '#0891b2' : '#67e8f9',
    brightWhite: light ? '#111827' : '#ffffff',
  };
}

export const TERMINAL_FONTS: { id: string; name: string; css: string }[] = [
  { id: 'mono', name: 'System Mono', css: 'ui-monospace, "Roboto Mono", "Droid Sans Mono", "DejaVu Sans Mono", monospace' },
  { id: 'jetbrains', name: 'JetBrains Mono', css: '"JetBrains Mono", ui-monospace, monospace' },
  { id: 'fira', name: 'Fira Code', css: '"Fira Code", ui-monospace, monospace' },
  { id: 'source', name: 'Source Code Pro', css: '"Source Code Pro", ui-monospace, monospace' },
];

export function terminalFontCss(id: string) {
  return (TERMINAL_FONTS.find((font) => font.id === id) || TERMINAL_FONTS[0]).css;
}
