import { useCallback, useEffect, useRef, useState } from 'react';
import type { FancyAnnouncement, FancyBan } from '../electron';
import AnnouncementPopup from './AnnouncementPopup';
import BanScreen from './BanScreen';

// Fünf Minuten reichen: Popups sind Ankündigungen, kein Chat. Beim Start, beim Zurückkehren
// ins Fenster und nach dem Anmelden wird zusätzlich sofort gefragt.
const POLL_MS = 5 * 60_000;

// Holt die Popups des Betreibers vom Konto-Server und zeigt sie nacheinander. Ein Ban hat
// Vorrang und legt die ganze App lahm, bis die Sperre aufgehoben oder abgelaufen ist.
export default function AnnouncementGate() {
  const api = window.agentWorkspace?.fancyAccount;
  const [queue, setQueue] = useState<FancyAnnouncement[]>([]);
  const [ban, setBan] = useState<FancyBan | null>(null);
  // Bereits geschlossene Popups bleiben in dieser Sitzung weg, auch wenn das Melden scheitert.
  const handled = useRef(new Set<string>());

  const check = useCallback(async () => {
    if (!api) return;
    try {
      const data = await api.announcements();
      setBan(data.ban || null);
      const fresh = (data.items || []).filter((item) => !handled.current.has(item.id));
      if (fresh.length) {
        setQueue((current) => [...current, ...fresh.filter((item) => !current.some((open) => open.id === item.id))]);
      }
    } catch {
      // Ohne Verbindung bleibt der letzte Stand; der nächste Durchlauf versucht es erneut.
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    void check();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, POLL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [api, check]);

  const close = () => {
    const item = queue[0];
    if (!item) return;
    handled.current.add(item.id);
    setQueue((current) => current.slice(1));
    void api?.seenAnnouncements([item.id]).catch(() => {});
  };

  if (ban) return <BanScreen ban={ban} />;
  return queue.length > 0 ? <AnnouncementPopup item={queue[0]} onClose={close} /> : null;
}
