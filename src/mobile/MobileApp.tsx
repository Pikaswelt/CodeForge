import { useEffect, useMemo, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { FolderOpen, Home, MessageSquare, Settings, SquareTerminal } from 'lucide-react';
import { StoreProvider, useStore, type Tab } from './store';
import { Native, isNativeApp, mediaUrl } from './native';
import { configureTerminals, applyToAll } from './terminalController';
import { resolveTheme, terminalFontCss, terminalTheme, themeStyle, type ResolvedTheme } from './theme';
import { Dialogs, Toasts, cx, handleBack } from './ui';
import HomeScreen from './screens/HomeScreen';
import TerminalScreen from './screens/TerminalScreen';
import FilesScreen from './screens/FilesScreen';
import ChatScreen from './screens/ChatScreen';
import SettingsScreen from './screens/SettingsScreen';

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'terminal', label: 'Terminals', icon: SquareTerminal },
  { id: 'files', label: 'Dateien', icon: FolderOpen },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'settings', label: 'Einstellungen', icon: Settings },
];

export default function MobileApp() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const store = useStore();
  const { tab, setTab, settings, customThemes, terminals } = store;
  const theme = useMemo(() => resolveTheme(settings.themeId, customThemes), [settings.themeId, customThemes]);
  const storeRef = useRef(store);
  storeRef.current = store;

  useAppHeight();

  // Terminal controllers read servers and login handling through the latest store.
  useEffect(() => {
    let lastNotice = 0;
    configureTerminals({
      getServer: (id) => storeRef.current.servers.find((server) => server.id === id),
      withServer: (server, task) => storeRef.current.withServer(server, task),
      onOutput: (session, text) => {
        const current = storeRef.current;
        const words = current.settings.triggerWords.split(',').map((word) => word.trim()).filter(Boolean);
        if (!words.length || Date.now() - lastNotice < 6000) return;
        const lower = text.toLowerCase();
        const word = words.find((item) => lower.includes(item.toLowerCase()));
        if (!word) return;
        lastNotice = Date.now();
        const watching = document.visibilityState === 'visible' && current.tab === 'terminal' && current.activeTerminalId === session.id;
        if (watching) return;
        if (current.settings.notifications && document.visibilityState !== 'visible') {
          void Native.notify({ title: session.title, body: `"${word}" im Terminal gefunden.` });
        } else {
          current.toast(`${session.title}: "${word}" gefunden`, 'info');
        }
      },
    });
  }, []);

  // Sheets and dialogs are portaled to <body>, so the theme variables also go on the root element.
  const style = useMemo(() => themeStyle(theme, settings), [theme, settings]);
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(style)) if (key.startsWith('--')) root.style.setProperty(key, String(value));
    root.style.colorScheme = theme.light ? 'light' : 'dark';
    document.body.style.background = theme.bg;
  }, [style, theme.light, theme.bg]);

  useEffect(() => {
    applyToAll({ theme: terminalTheme(theme), fontFamily: terminalFontCss(settings.terminalFont) });
  }, [theme, settings.terminalFont]);

  // Android back gesture: close sheets first, then go back to Home, then leave the app.
  useEffect(() => {
    if (!isNativeApp) return;
    const handle = CapacitorApp.addListener('backButton', () => {
      if (handleBack()) return;
      if (storeRef.current.tab !== 'home') storeRef.current.setTab('home');
      else void CapacitorApp.minimizeApp();
    });
    return () => {
      void handle.then((listener) => listener.remove());
    };
  }, []);

  useEffect(() => {
    if (isNativeApp && settings.notifications) void Native.requestNotifications().catch(() => {});
  }, [settings.notifications]);

  return (
    <div className="cf-app" style={style}>
      <Backdrop theme={theme} />
      <div className="relative z-10 flex h-full flex-col" style={{ paddingLeft: 'var(--sal)', paddingRight: 'var(--sar)' }}>
        <main className="relative min-h-0 flex-1">
          {/* Terminals stay mounted so their views keep size and scroll position. */}
          <div className={cx('absolute inset-0 flex flex-col', tab !== 'terminal' && 'invisible pointer-events-none')}>
            <TerminalScreen visible={tab === 'terminal'} />
          </div>
          {tab === 'home' && <div className="absolute inset-0 flex flex-col"><HomeScreen /></div>}
          {tab === 'files' && <div className="absolute inset-0 flex flex-col"><FilesScreen /></div>}
          {tab === 'chat' && <div className="absolute inset-0 flex flex-col"><ChatScreen /></div>}
          {tab === 'settings' && <div className="absolute inset-0 flex flex-col"><SettingsScreen /></div>}
        </main>
        <nav className={cx('cf-glass relative z-20 flex shrink-0 border-x-0 border-b-0', tab === 'terminal' && 'cf-hide-with-keyboard')} style={{ paddingBottom: 'var(--cf-nav-pad, var(--sab))' }}>
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cx('cf-press relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[0.68rem] font-medium', active ? 'cf-accent-text' : 'cf-muted')}
              >
                <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-cf-hover')}>
                  <Icon className="h-[1.2rem] w-[1.2rem]" strokeWidth={active ? 2.4 : 2} />
                </span>
                {item.label}
                {item.id === 'terminal' && terminals.length > 0 && (
                  <span className="cf-accent-bg absolute right-[calc(50%-1.55rem)] top-1.5 min-w-[1.1rem] rounded-full px-1 text-[0.62rem] font-bold leading-[1.1rem]">
                    {terminals.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      <Dialogs />
      <Toasts />
    </div>
  );
}

function Backdrop({ theme }: { theme: ResolvedTheme }) {
  const url = mediaUrl(theme.media);
  const video = theme.mediaKind === 'video' || /\.(mp4|webm|mov|m4v|mkv|3gp)$/i.test(theme.media || '');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Android pauses media when the app goes to the background; resume on return.
  useEffect(() => {
    if (!video) return;
    const play = () => {
      if (document.visibilityState === 'visible') void videoRef.current?.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', play);
    play();
    return () => document.removeEventListener('visibilitychange', play);
  }, [video, url]);

  return (
    <div className="cf-backdrop" aria-hidden="true">
      <div className={cx('cf-backdrop-gradient', theme.animated && 'animated')} style={{ backgroundImage: theme.gradient, backgroundSize: '220% 220%' }} />
      {url && video && (
        <video
          ref={videoRef}
          key={url}
          className="cf-backdrop-media"
          src={url}
          autoPlay
          muted
          loop
          playsInline
          style={{ filter: theme.mediaBlur ? `blur(${theme.mediaBlur}px)` : undefined, transform: theme.mediaBlur ? 'scale(1.06)' : undefined }}
        />
      )}
      {url && !video && (
        <img
          className="cf-backdrop-media"
          src={url}
          alt=""
          style={{ filter: theme.mediaBlur ? `blur(${theme.mediaBlur}px)` : undefined, transform: theme.mediaBlur ? 'scale(1.06)' : undefined }}
        />
      )}
      {url && <div className="absolute inset-0" style={{ background: `rgb(0 0 0 / ${theme.mediaDim / 100})` }} />}
    </div>
  );
}

// Keeps the layout exactly above the on-screen keyboard (visualViewport shrinks when it opens).
function useAppHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const height = viewport ? viewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--cf-app-height', `${Math.round(height)}px`);
      const keyboard = Math.max(0, window.innerHeight - height);
      document.documentElement.style.setProperty('--cf-keyboard', `${Math.round(keyboard)}px`);
      // With the keyboard open the navigation bar inset is covered by the keyboard.
      document.documentElement.style.setProperty('--cf-nav-pad', keyboard > 80 ? '0px' : 'var(--sab)');
      document.documentElement.dataset.keyboard = keyboard > 80 ? 'open' : 'closed';
      if (window.scrollY) window.scrollTo(0, 0);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
}
