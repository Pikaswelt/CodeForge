import { ExternalLink, GripHorizontal, Music2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { SpotifyTrack } from '../types';

const STORAGE_KEY = 'agentWorkspace.spotifyWidget';
const DEFAULT_WIDGET = { x: 960, y: 86, width: 260, height: 92, xRatio: 0.72, yRatio: 0.12 };

type WidgetState = typeof DEFAULT_WIDGET;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWidgetState(input: Partial<WidgetState>): WidgetState {
  const width = clamp(Math.round(input.width || DEFAULT_WIDGET.width), 190, 520);
  const height = clamp(Math.round(input.height || DEFAULT_WIDGET.height), 70, 240);
  const maxX = Math.max(8, window.innerWidth - width - 8);
  const maxY = Math.max(42, window.innerHeight - height - 8);
  const hasRatio = Number.isFinite(input.xRatio) && Number.isFinite(input.yRatio);
  const x = hasRatio
    ? clamp(Math.round((input.xRatio || 0) * (window.innerWidth - width)), 8, maxX)
    : clamp(Math.round(input.x || DEFAULT_WIDGET.x), 8, maxX);
  const y = hasRatio
    ? clamp(Math.round((input.yRatio || 0) * (window.innerHeight - height)), 42, maxY)
    : clamp(Math.round(input.y || DEFAULT_WIDGET.y), 42, maxY);
  return {
    x,
    y,
    width,
    height,
    xRatio: clamp(x / Math.max(1, window.innerWidth - width), 0, 1),
    yRatio: clamp(y / Math.max(1, window.innerHeight - height), 0, 1),
  };
}

function readWidgetState(): WidgetState {
  try {
    return normalizeWidgetState({ ...DEFAULT_WIDGET, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') });
  } catch {
    return normalizeWidgetState(DEFAULT_WIDGET);
  }
}

function saveWidgetState(value: WidgetState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function FloatingNotes() {
  const notes = ['♫', '♪', '♩', '♬'];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[...Array(3)].map((_, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 15, x: 10 + i * 8, scale: 0.7 }}
          animate={{
            opacity: [0, 0.8, 0],
            y: [15, -25],
            x: [10 + i * 8, 4 + i * 12 + Math.sin(i) * 8],
            scale: [0.7, 1.1, 0.8],
          }}
          transition={{
            duration: 2.8,
            repeat: Infinity,
            delay: i * 0.9,
            ease: "easeOut"
          }}
          className="absolute text-emerald-400 text-[10px] font-semibold"
        >
          {notes[i % notes.length]}
        </motion.span>
      ))}
    </div>
  );
}

export default function SpotifyWidget() {
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [widget, setWidget] = useState<WidgetState>(readWidgetState);
  const [loading, setLoading] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const widgetRef = useRef(widget);

  useEffect(() => {
    widgetRef.current = widget;
  }, [widget]);

  const refresh = useCallback(async () => {
    if (!window.agentWorkspace?.getSpotifyTrack) return;
    setLoading(true);
    try {
      setTrack(await window.agentWorkspace.getSpotifyTrack());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragRef.current) return;
      const width = widgetRef.current.width;
      const height = widgetRef.current.height;
      const x = clamp(event.clientX - dragRef.current.dx, 8, Math.max(8, window.innerWidth - width - 8));
      const y = clamp(event.clientY - dragRef.current.dy, 42, Math.max(42, window.innerHeight - height - 8));
      const next = {
        ...widget,
        x,
        y,
        xRatio: clamp(x / Math.max(1, window.innerWidth - width), 0, 1),
        yRatio: clamp(y / Math.max(1, window.innerHeight - height), 0, 1),
      };
      setWidget(next);
      saveWidgetState(next);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [widget]);

  useEffect(() => {
    const onResize = () => {
      const next = normalizeWidgetState(widgetRef.current);
      setWidget(next);
      saveWidgetState(next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onResizeEnd = () => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.round(Math.max(190, rect.width));
    const height = Math.round(Math.max(70, rect.height));
    const x = clamp(widget.x, 8, Math.max(8, window.innerWidth - width - 8));
    const y = clamp(widget.y, 42, Math.max(42, window.innerHeight - height - 8));
    const next = normalizeWidgetState({
      ...widget,
      x,
      y,
      width: Math.round(Math.max(190, rect.width)),
      height: Math.round(Math.max(70, rect.height)),
      xRatio: x / Math.max(1, window.innerWidth - width),
      yRatio: y / Math.max(1, window.innerHeight - height),
    });
    setWidget(next);
    saveWidgetState(next);
  };

  const title = track?.title || (track?.available ? 'Spotify' : 'Kein Song');
  const subtitle = [track?.artist, track?.album].filter(Boolean).join(' - ') || 'Spotify starten oder Musik abspielen';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 8 }}
      transition={{ type: 'spring', stiffness: 350, damping: 26 }}
      ref={frameRef}
      className="spotify-widget app-no-drag fixed z-40 min-h-[70px] min-w-[190px] overflow-hidden rounded-xl border border-white/10 bg-black/45 shadow-2xl backdrop-blur-xl"
      style={{ left: widget.x, top: widget.y, width: widget.width, height: widget.height, resize: 'both' }}
      onMouseUp={onResizeEnd}
    >
      <div
        className="flex h-7 cursor-move items-center justify-between gap-2 border-b border-white/10 px-2 text-zinc-500"
        onMouseDown={(event) => {
          const rect = frameRef.current?.getBoundingClientRect();
          if (!rect) return;
          dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
        }}
      >
        <GripHorizontal className="h-4 w-4" />
        <span className="truncate text-[10px] uppercase tracking-wide">Spotify</span>
        <button onClick={refresh} className="rounded-md p-1 hover:bg-white/10 hover:text-white transition-colors" title="Aktualisieren">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex h-[calc(100%-1.75rem)] items-center gap-3 px-3 py-2">
        <div className="relative h-11 w-11 shrink-0">
          {track?.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt=""
              className="h-full w-full rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-[#1db954] text-black">
              <Music2 className="h-6 w-6" />
            </div>
          )}
          {track?.isPlaying && <FloatingNotes />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{title}</div>
          <div className="mt-0.5 truncate text-xs text-zinc-400">{subtitle}</div>
          <div className="mt-1 text-[10px] text-zinc-600">{track?.isPlaying ? 'Laeuft' : 'Pausiert'}</div>
        </div>
        <button
          onClick={() => window.agentWorkspace?.launchSpotify('spotify:')}
          className="shrink-0 rounded-md p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white transition-colors"
          title="Spotify oeffnen"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
