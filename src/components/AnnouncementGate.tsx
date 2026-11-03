import { useEffect, useState } from 'react';
import type { FancyBan } from '../electron';
import { startAppPopups, type AccountPopup } from '../vendor/fancyservers-collab/collab.js';
import '../vendor/fancyservers-collab/collab.css';
import BanScreen from './BanScreen';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Popups des Betreibers (Geschenke, Hinweise, Vollbild), Wartung und Pflicht-Updates kommen vom Konto-Server;
// dargestellt werden sie vom gemeinsamen Modul (fancyservers-collab/apppopups) im FancyCode-Stil, hell oder dunkel
// passend zum Theme. Ein Ban hat Vorrang und legt die ganze App lahm, bis die Sperre aufgehoben oder abgelaufen ist.
export default function AnnouncementGate() {
  const api = window.agentWorkspace?.fancyAccount;
  const [ban, setBan] = useState<FancyBan | null>(null);

  useEffect(() => {
    if (!api?.appInfo) return;
    let popups: ReturnType<typeof startAppPopups> | null = null;
    let alive = true;
    void api.appInfo().then((info) => {
      if (!alive || !info.apiBase) return;
      popups = startAppPopups({
        app: 'fancycode',
        apiBase: info.apiBase,
        version: info.version,
        fetchPopups: async () => {
          const data = await api.announcements();
          setBan(data.ban || null);
          return (data.items || []) as unknown as AccountPopup[];
        },
        markSeen: (ids) => api.seenAnnouncements(ids),
        // Pflicht-Update: mit dem eingebauten Updater laden und gleich installieren.
        onUpdate: async () => {
          const ws = window.agentWorkspace;
          if (!ws?.checkForUpdates) return;
          let st = await ws.checkForUpdates({ manual: true });
          for (let i = 0; i < 600 && ['checking', 'downloading'].includes(st.status); i++) {
            await sleep(1000);
            st = await ws.checkForUpdates({ manual: true });
          }
          if (st.status === 'downloaded') await ws.installUpdate();
        },
        openExternal: (url) => void window.agentWorkspace?.openExternal?.(url),
      });
    });
    // Theme-Wechsel: Popups hell/dunkel neu zeichnen.
    const mo = new MutationObserver(() => popups?.refresh());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    return () => {
      alive = false;
      mo.disconnect();
      popups?.stop();
    };
  }, [api]);

  return ban ? <BanScreen ban={ban} /> : null;
}
