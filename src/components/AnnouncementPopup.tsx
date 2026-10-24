import { tr } from '../i18n';
import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Gift, Sparkles, X } from 'lucide-react';
import type { FancyAnnouncement } from '../electron';

// Popup vom Server: freier Text mit Bild – oder ein Geschenk, das schon im Konto liegt.
// Der Betreiber legt beides im Admin an; geschlossen wird es über AnnouncementGate gemeldet.
export default function AnnouncementPopup({ item, onClose }: { item: FancyAnnouncement; onClose(): void }) {
  const [imageBroken, setImageBroken] = useState(false);
  const gift = item.kind === 'gift';
  const name = item.title || (item.plan === 'max' ? 'Max' : item.plan === 'pro' ? 'Pro' : tr('Geschenk'));
  const days = Math.max(0, item.days);
  const resets = Math.max(0, item.resets);

  const lines: string[] = [];
  if (gift && item.plan && days > 0) {
    lines.push(tr('Du hast {name} für {days} Tage erhalten!', { name, days }));
  } else if (gift && resets > 0) {
    lines.push(tr('Du hast {count} Limit-Resets erhalten!', { count: resets }));
  }
  if (gift && item.plan && days > 0 && resets > 0) {
    lines.push(tr('Dazu {count} Limit-Resets.', { count: resets }));
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-5 backdrop-blur-lg" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141214] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${gift ? 'border-amber-400/25 bg-amber-400/10' : 'border-sky-400/20 bg-sky-400/10'}`}>
              {gift ? <Gift className="h-5 w-5 text-amber-300" /> : <Sparkles className="h-5 w-5 text-sky-300" />}
            </div>
            <div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider ${gift ? 'text-amber-300/80' : 'text-sky-300/80'}`}>
                {gift ? tr('Geschenk') : tr('Nachricht von FancyCode')}
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">{item.title || (gift ? name : tr('Hinweis'))}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
            aria-label={tr('Schließen')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {item.image && !imageBroken && (
          <img
            src={item.image}
            alt=""
            onError={() => setImageBroken(true)}
            className="mb-4 max-h-60 w-full rounded-xl border border-white/10 object-cover"
          />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1">
          {lines.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4">
              {lines.map((line, index) => (
                <p key={line} className={index === 0 ? 'text-sm font-medium text-amber-100' : 'mt-1 text-xs text-amber-200/80'}>
                  {line}
                </p>
              ))}
            </div>
          )}

          {item.message && (
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{item.message}</p>
          )}
        </div>

        <button onClick={onClose} className="primary-button mt-5 flex w-full items-center justify-center gap-2 !py-2.5">
          <Check className="h-4 w-4" />
          {gift ? tr('Nice, danke!') : tr('Verstanden')}
        </button>
      </motion.div>
    </div>
  );
}
