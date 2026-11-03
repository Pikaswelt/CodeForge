import { useEffect } from 'react';
import type { UsagePopupSeed } from '../AppContext';
import { openPlans, type PlanUsage } from '../vendor/fancyservers-collab/collab.js';
import '../vendor/fancyservers-collab/collab.css';
import { readPlan, writePlan } from '../plans';

// „Pläne & Nutzung“ aus dem gemeinsamen FancyServers-Modul (gleiches Fenster in allen Apps).
// Agent und eingebaute Chats teilen sich ein globales Token-Limit; gezählt wird über die Agent-App.
// `initial` sind die Agent-Werte, die die FancyCode-Ansicht schon kennt.
export default function UsageModal({ onClose, initial }: { onClose(): void; initial?: UsagePopupSeed | null }) {
  useEffect(() => {
    const api = window.agentWorkspace?.fancyAccount;
    const remember = (u: PlanUsage | null) => {
      if (u?.plan === 'free' || u?.plan === 'mini' || u?.plan === 'pro' || u?.plan === 'max') writePlan(u.plan);
      return u;
    };
    const view = openPlans(
      {
        app: 'fancycode',
        plan: () => initial?.plan || readPlan(),
        fetchUsage: api ? async () => remember((await api.usage('fancycode-cli')) as PlanUsage) : initial ? async () => initial as PlanUsage : undefined,
        resetUsage: api
          ? async () => {
              if (!window.confirm('Limit jetzt zurücksetzen? Das verbraucht einen Reset.')) return null;
              return (await api.resetUsage('fancycode-cli')) as PlanUsage;
            }
          : undefined,
        openExternal: (url) => void window.agentWorkspace?.openExternal?.(url),
        onClose,
      },
      initial?.tab || 'usage',
    );
    return () => view.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
