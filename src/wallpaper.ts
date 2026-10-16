import { useEffect, useState } from 'react';

// Anime 4K wallpapers served by CodeForge Web (/api/wallpaper, fetched from wallhaven.cc).
// Each page load gets a new one; the top bar button asks for the next.

const NEXT_EVENT = 'codeforge:next-wallpaper';

// Checked at render time: the browser bridge in main.tsx is installed after modules load.
export function isWebBuild() {
  return Boolean(window.agentWorkspace?.isWeb);
}

export function requestNextWallpaper() {
  window.dispatchEvent(new Event(NEXT_EVENT));
}

export function useWallpaper(enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/wallpaper/next', { cache: 'no-store' });
        if (!response.ok) return;
        const { url: next } = await response.json();
        // Swap only after the image is decoded so the background never flashes empty.
        const image = new Image();
        image.src = next;
        await image.decode();
        if (!cancelled) setUrl(next);
      } catch {
        // Keep the current background when the server has no wallpaper.
      }
    };
    void load();
    window.addEventListener(NEXT_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(NEXT_EVENT, load);
    };
  }, [enabled]);
  return enabled ? url : null;
}
