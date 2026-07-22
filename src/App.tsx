/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X as XIcon, Wifi } from 'lucide-react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import MainArea from './components/MainArea';
import SettingsModal from './components/SettingsModal';
import WelcomePopup from './components/WelcomePopup';
import NewsPopup, { shouldShowNewsPopup, dismissNewsPopup } from './components/NewsPopup';
import SpotifyWidget from './components/SpotifyWidget';
import ActionsModal from './components/ActionsModal';
import SetupModal from './components/SetupModal';
import MobileConnectModal from './components/MobileConnectModal';
import { AppProvider, useAppContext } from './AppContext';

const WELCOME_POPUP_STORAGE_KEY = 'agentWorkspace.welcomePopupDismissed';

function AppLayout() {
  const {
    theme,
    customThemes,
    hasSetupCompleted,
    sidebarTransparency,
    surfaceTransparency,
    spotifyWidgetEnabled,
    glassBlurStrength,
    glassSaturation,
    appBorderRadius,
    glassThemeGlow,
    mobileMode,
    mobileConnectionConfig,
    setMobileConnectionConfig,
    setMobileMode,
  } = useAppContext();
  const [showSettings, setShowSettings] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showMobileConnect, setShowMobileConnect] = useState(false);
  const [showWelcomePopup, setShowWelcomePopup] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_POPUP_STORAGE_KEY) !== 'true';
    } catch {
      return true;
    }
  });
  const [showNewsPopup, setShowNewsPopup] = useState(shouldShowNewsPopup);

  const closeNewsPopup = () => {
    setShowNewsPopup(false);
    dismissNewsPopup();
  };

  // Re-check news popup when setup completes later in the session
  useEffect(() => {
    if (hasSetupCompleted && shouldShowNewsPopup()) {
      setShowNewsPopup(true);
    }
  }, [hasSetupCompleted]);
  const customTheme = customThemes.find((item) => item.id === theme);
  const cssTheme = customTheme ? 'custom' : theme;

  const closeWelcomePopup = () => {
    setShowWelcomePopup(false);
    try {
      localStorage.setItem(WELCOME_POPUP_STORAGE_KEY, 'true');
    } catch {
      // localStorage may be unavailable in restricted render contexts.
    }
  };
  
  const bgClass = {
    'modern-dark': 'bg-gradient-to-br from-[#1c181a] via-[#111111] to-[#0a0a0a]',
    'classic-light': 'bg-gradient-to-br from-[#f5f2ed] via-[#e5e1d8] to-[#d1ccc0]',
    'deep-galactic': 'bg-gradient-to-br from-[#0e121d] via-[#05060a] to-[#020202]',
    'muted-earth': 'bg-gradient-to-br from-[#e5e1d8] via-[#d1ccc0] to-[#c4c0b4]',
    'neon-cyber': 'bg-gradient-to-br from-[#1a1a1a] via-[#0a0a0a] to-[#050505]',
    'midnight-ocean': 'bg-gradient-to-br from-[#071826] via-[#06111b] to-[#02080d]',
    'forest-terminal': 'bg-gradient-to-br from-[#07130d] via-[#0a1f14] to-[#030704]',
    'solarized-dawn': 'bg-gradient-to-br from-[#fdf6e3] via-[#eee8d5] to-[#d6ceb2]',
    'rose-quartz': 'bg-gradient-to-br from-[#fff1f2] via-[#fce7f3] to-[#fbcfe8]',
    'mono-slate': 'bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#020617]',
    'amber-console': 'bg-gradient-to-br from-[#160f06] via-[#241505] to-[#050301]',
    'arctic-blue': 'bg-gradient-to-br from-[#eff6ff] via-[#dbeafe] to-[#bfdbfe]',
    'violet-noir': 'bg-gradient-to-br from-[#10051b] via-[#1b0b2d] to-[#05010a]',
    'high-contrast': 'bg-black',
    'aurora-flow': 'bg-aurora-flow',
    'neon-flow': 'bg-neon-flow',
    'glass-apple-dark': 'bg-glass-apple-dark',
    'glass-apple-light': 'bg-glass-apple-light'
  }[theme] || 'bg-gradient-to-br from-[#1c181a] via-[#111111] to-[#0a0a0a]';

  const textClass = {
    'modern-dark': 'text-zinc-300',
    'classic-light': 'text-zinc-800',
    'deep-galactic': 'text-zinc-300',
    'muted-earth': 'text-zinc-800',
    'neon-cyber': 'text-zinc-300',
    'midnight-ocean': 'text-cyan-100',
    'forest-terminal': 'text-emerald-100',
    'solarized-dawn': 'text-slate-800',
    'rose-quartz': 'text-rose-950',
    'mono-slate': 'text-slate-200',
    'amber-console': 'text-amber-100',
    'arctic-blue': 'text-slate-800',
    'violet-noir': 'text-violet-100',
    'high-contrast': 'text-white',
    'aurora-flow': 'text-emerald-50',
    'neon-flow': 'text-fuchsia-50',
    'glass-apple-dark': 'text-zinc-200',
    'glass-apple-light': 'text-zinc-800'
  }[theme] || 'text-zinc-300';

  const isGlassTheme = theme.startsWith('glass-apple-');
  const hasTransparency = sidebarTransparency > 0 || surfaceTransparency > 0 || isGlassTheme;

  const shellStyle = {
    '--theme-sidebar-alpha': String(1 - (isGlassTheme && sidebarTransparency === 0 ? 35 : sidebarTransparency) / 100),
    '--theme-surface-alpha': String(1 - (isGlassTheme && surfaceTransparency === 0 ? 45 : surfaceTransparency) / 100),
    '--glass-blur': `${glassBlurStrength}px`,
    '--glass-saturation': `${glassSaturation}%`,
    '--app-radius': `${appBorderRadius}px`,
    '--glass-glow-border': glassThemeGlow ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid transparent',
    '--glass-glow-shadow': glassThemeGlow ? '0 8px 32px 0 rgba(0, 0, 0, 0.37), 0 0 0 1px rgba(255, 255, 255, 0.05)' : 'none',
    ...(customTheme
      ? {
        '--theme-bg': customTheme.background,
        '--theme-surface': customTheme.surface,
        '--theme-text': customTheme.text,
        '--theme-accent': customTheme.accent,
        backgroundColor: customTheme.background,
      }
      : {}),
  } as React.CSSProperties;

  const isMobileMode = mobileMode;

  // Live health polling for mobile VPS connection
  const [connectionAlive, setConnectionAlive] = useState(true);
  useEffect(() => {
    if (!mobileMode || !mobileConnectionConfig?.connected || mobileConnectionConfig.type !== 'vps' || !mobileConnectionConfig.vpsUrl) {
      return;
    }
    const checkHealth = async () => {
      try {
        const url = `${mobileConnectionConfig.vpsUrl}/discover`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          setConnectionAlive(true);
          setMobileConnectionConfig({ ...mobileConnectionConfig, lastTestedAt: Date.now() });
        } else {
          setConnectionAlive(false);
        }
      } catch {
        setConnectionAlive(false);
      }
    };
    // Check immediately
    checkHealth();
    // Then every 10 seconds
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [mobileMode, mobileConnectionConfig?.connected, mobileConnectionConfig?.vpsUrl]);

  return (
    <div
      data-theme={cssTheme}
      data-transparency={hasTransparency ? 'on' : 'off'}
      className={`relative h-screen w-screen ${customTheme ? '' : bgClass} ${textClass} font-sans overflow-hidden transition-colors duration-300`}
      style={shellStyle}
    >
      {customTheme && <ThemeBackdrop theme={customTheme} />}
      <div className="relative z-10 flex h-full w-full flex-col">
        <TopBar onSettingsClick={() => setShowSettings(true)} onActionsClick={() => setShowActions(true)} />
        <div className="flex flex-1 overflow-hidden relative">
          {/* Mobile Mode: Overlay sidebar toggle button */}
          {mobileMode && (
            <button
              onClick={() => setMobileSidebarOpen((v) => !v)}
              className="fixed left-3 top-14 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#1c181a]/90 backdrop-blur-md text-white shadow-2xl hover:bg-white/10 transition-all duration-200"
              title={mobileSidebarOpen ? 'Seitenleiste schliessen' : 'Seitenleiste oeffnen'}
            >
              {mobileSidebarOpen ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
          {/* Sidebar: hidden when mobile mode is on and sidebar is collapsed */}
          <div
            className={`${
              isMobileMode
                ? mobileSidebarOpen
                  ? 'fixed inset-0 z-40 w-full lg:static lg:w-[270px]'
                  : 'hidden lg:block lg:w-[270px]'
                : 'lg:w-[270px]'
            } shrink-0`}
          >
            {isMobileMode && mobileSidebarOpen && (
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
                onClick={() => setMobileSidebarOpen(false)}
              />
            )}
            <div className={`relative z-40 h-full ${isMobileMode ? 'max-w-[300px] shadow-2xl' : ''}`}>
              <Sidebar onSettingsClick={() => setShowSettings(true)} onActionsClick={() => setShowActions(true)} />
            </div>
          </div>
          <MainArea />
        </div>
        <AnimatePresence>
          {hasSetupCompleted && showNewsPopup && (
            <NewsPopup onClose={closeNewsPopup} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {hasSetupCompleted && !showNewsPopup && showWelcomePopup && (
            <WelcomePopup onClose={closeWelcomePopup} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {spotifyWidgetEnabled && <SpotifyWidget />}
        </AnimatePresence>
        <AnimatePresence>
          {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </AnimatePresence>
        <AnimatePresence>
          {showActions && <ActionsModal onClose={() => setShowActions(false)} />}
        </AnimatePresence>
        <AnimatePresence>
          {!hasSetupCompleted && <SetupModal />}
        </AnimatePresence>

        {/* Mobile Mode: Connect modal */}
        <AnimatePresence>
          {showMobileConnect && <MobileConnectModal onClose={() => setShowMobileConnect(false)} />}
        </AnimatePresence>

        {/* Mobile Mode: Show connect button when not connected */}
        {mobileMode && !mobileConnectionConfig?.connected && (
          <button
            onClick={() => setShowMobileConnect(true)}
            className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-md text-xs shadow-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition-all"
            title="Mit Server verbinden"
          >
            <Wifi className="w-3.5 h-3.5" />
            Verbinden
          </button>
        )}

        {/* Mobile Mode: Connection status indicator - only when connected */}
        {mobileMode && mobileConnectionConfig?.connected && connectionAlive && (
          <button
            onClick={() => setMobileConnectionConfig({ ...mobileConnectionConfig, connected: false })}
            className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-md text-xs shadow-2xl transition-all border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
            title={mobileConnectionConfig.type === 'vps' ? mobileConnectionConfig.vpsUrl : `${mobileConnectionConfig.sshUser}@${mobileConnectionConfig.sshHost}`}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <Wifi className="w-3.5 h-3.5" /> Live
          </button>
        )}
      </div>
    </div>
  );
}

function ThemeBackdrop({ theme }: { theme: NonNullable<ReturnType<typeof useAppContext>['customThemes'][number]> }) {
  const mediaPath = theme.backgroundMedia || theme.backgroundImage || '';
  const isVideo = isVideoPath(mediaPath);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (!isVideo) return;
    const playVideo = () => {
      if (videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
    };

    playVideo();

    const interval = setInterval(() => {
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
    }, 1000);

    window.addEventListener('focus', playVideo);
    window.addEventListener('click', playVideo);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', playVideo);
      window.removeEventListener('click', playVideo);
    };
  }, [isVideo, mediaPath]);

  return (
    <div className="theme-backdrop" aria-hidden="true">
      <div className={`theme-custom-gradient ${theme.animatedGradient ? 'theme-custom-gradient-animated' : ''}`} />
      {mediaPath && isVideo && (
        <video
          ref={videoRef}
          key={toFileUrl(mediaPath)}
          className="theme-media-backdrop"
          src={toFileUrl(mediaPath)}
          autoPlay
          muted
          loop
          playsInline
          onPause={(e) => {
            e.currentTarget.play().catch(() => {});
          }}
          onCanPlay={(e) => {
            e.currentTarget.play().catch(() => {});
          }}
        />
      )}
      {mediaPath && !isVideo && (
        <div
          className="theme-media-backdrop"
          style={{ backgroundImage: `url("${toFileUrl(mediaPath)}")` }}
        />
      )}
      {mediaPath && <div className="theme-media-scrim" />}
    </div>
  );
}

function isVideoPath(filePath: string) {
  if (!filePath) return false;
  if (filePath.startsWith('data:video/')) return true;
  if (filePath.startsWith('blob:')) return true;
  return /\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv)$/i.test(filePath);
}

function toFileUrl(filePath: string) {
  // Handle data: URLs (images read as data URL on mobile)
  if (filePath.startsWith('data:')) {
    return filePath;
  }
  // Handle blob: URLs (videos created via URL.createObjectURL)
  if (filePath.startsWith('blob:')) {
    return filePath;
  }
  if ((window as any).agentWorkspace?.isWeb) {
    let baseUrl = '';
    try {
      const storedConfig = localStorage.getItem('mobileConnectionConfig');
      if (storedConfig) {
        const config = JSON.parse(storedConfig);
        if (config.connected && config.type === 'vps' && config.vpsUrl) {
          baseUrl = config.vpsUrl;
        }
      }
    } catch (e) {}
    return `${baseUrl}/media?path=${encodeURIComponent(filePath)}`;
  }
  // In Capacitor Android, file:// URLs with content:// or file:/// work
  if (typeof (window as any).Capacitor !== 'undefined' || filePath.startsWith('content://')) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, '/');
  return `codeforge-media:///${normalized}`;
}

function IntroScreen({ onComplete }: { onComplete: () => void }) {
  React.useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white selection:bg-white/10"
    >
      <div className="text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl sm:text-6xl font-extrabold tracking-widest uppercase mb-2 font-mono text-zinc-100"
          style={{ textShadow: '0 0 40px rgba(255,255,255,0.15)' }}
        >
          Fancy Servers
        </motion.h1>
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: '80px', opacity: 0.5 }}
          transition={{ delay: 0.5, duration: 1, ease: 'easeInOut' }}
          className="h-[1px] bg-white mx-auto my-4"
        />
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="text-xs uppercase tracking-[0.3em] text-zinc-400 font-medium"
        >
          Loading CodeForge
        </motion.p>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <AppProvider>
      <AnimatePresence mode="wait">
        {showIntro ? (
          <IntroScreen key="intro" onComplete={() => setShowIntro(false)} />
        ) : (
          <AppLayout key="layout" />
        )}
      </AnimatePresence>
    </AppProvider>
  );
}
