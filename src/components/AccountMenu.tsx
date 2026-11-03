import { tr } from '../i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, CircleUserRound, Crown, Gauge, LogOut, Megaphone, MessageSquare, Puzzle, Scale, Settings } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { PLAN_INFO } from '../plans';
import type { FancyAccount } from '../electron';
import { usePlugins } from '../plugins/PluginProvider';
import TutorialModal from './TutorialModal';
import NewsPopup from './NewsPopup';

export default function AccountMenu({
  onSettingsClick,
  className = 'right-0 top-8',
  onClose,
}: {
  onSettingsClick(): void;
  className?: string;
  onClose(): void;
}) {
  const {
    provider,
    apiKeys,
    setApiKey,
    mobileMode,
    discordRpcEnabled,
    setDiscordRpcEnabled,
    openUsagePopup,
  } = useAppContext();
  const { items: pluginItems, run: runPlugin } = usePlugins();
  const [account, setAccount] = useState<FancyAccount | null>(null);
  const [openPlugin, setOpenPlugin] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const providerInfo = PROVIDER_INFO[provider];

  useEffect(() => {
    const api = window.agentWorkspace?.fancyAccount;
    if (!api) return;
    let active = true;
    api
      .me()
      .then((value) => {
        if (active) setAccount(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const logout = () => {
    setApiKey(provider, '');
    const api = window.agentWorkspace?.fancyAccount;
    if (api) {
      void api
        .logout()
        .catch(() => {})
        .finally(() => window.dispatchEvent(new Event('fancy:logged-out')));
    }
    onClose();
  };

  // Portal in den Overlay-Root: Das Menue liegt damit ueber der FancyCode-Ansicht und wird nicht von
  // der Seitenleiste beschnitten; Theme-Farben und Popups bleiben trotzdem intakt.
  return createPortal(
    <>
      <div
        className={`theme-popover fixed z-[140] w-72 overflow-hidden rounded-xl border border-white/10 bg-[#242124]/95 py-1.5 text-sm text-zinc-200 shadow-2xl backdrop-blur-xl ${className}`}
      >
        <div className="px-3 pb-2 pt-1">
          <div className="flex items-center gap-2 rounded-lg px-1 py-1.5">
            {account?.avatar ? (
              <img src={account.avatar} alt="" className="h-7 w-7 shrink-0 rounded-full border border-white/10 object-cover" />
            ) : (
              <CircleUserRound className="h-5 w-5 shrink-0 text-zinc-500" />
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[13px] text-zinc-200">
                  {account ? account.name : `${providerInfo.label} Konto`}
                </span>
                {account?.plan && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                      account.plan === 'max'
                        ? 'bg-gradient-to-r from-cyan-400/25 via-indigo-400/25 to-fuchsia-400/25 text-indigo-200'
                        : account.plan === 'pro'
                          ? 'bg-violet-400/15 text-violet-300'
                          : account.plan === 'mini'
                            ? 'bg-amber-400/15 text-amber-300'
                            : 'bg-white/10 text-zinc-400'
                    }`}
                  >
                    {(PLAN_INFO[account.plan] || PLAN_INFO.free).label}
                  </span>
                )}
              </div>
              <div className="truncate text-[11px] text-zinc-500">
                {account
                  ? account.provider === 'discord'
                    ? tr("Mit Discord angemeldet")
                    : account.provider === 'github'
                      ? tr("Mit GitHub angemeldet")
                      : tr("Angemeldet")
                  : apiKeys[provider]
                    ? tr("API-Key gesetzt")
                    : tr("Lokale CLI / ChatGPT Login")}
              </div>
              {account?.plan === 'max' && (
                <div className="truncate text-[11px] text-violet-300/80">{tr("Beta-Zugang & Priority-Support")}</div>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 py-1">
          <AccountMenuButton
            icon={<Settings className="h-4 w-4" />}
            label={tr("Einstellungen")}
            shortcut="Ctrl+,"
            onClick={() => {
              onSettingsClick();
              onClose();
            }}
          />
          <AccountMenuButton
            icon={<Crown className="h-4 w-4" />}
            label={tr("Pläne")}
            onClick={() => {
              openUsagePopup({ fiveHour: { used: 0, limit: 0, resetAt: 0 }, weekly: { used: 0, limit: 0, resetAt: 0 }, resets: 0, tab: 'plans' });
              onClose();
            }}
          />
          <AccountMenuButton
            icon={<Gauge className="h-4 w-4" />}
            label={tr("Nutzung")}
            onClick={() => {
              openUsagePopup();
              onClose();
            }}
          />
          <div className="flex items-center justify-between px-3 py-2 text-[13px] text-zinc-200 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-zinc-500" />
              <span>{tr("Discord Status")}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={discordRpcEnabled}
              onClick={(event) => {
                event.stopPropagation();
                setDiscordRpcEnabled(!discordRpcEnabled);
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                discordRpcEnabled ? 'bg-amber-400' : 'bg-white/20'
              }`}
              title={discordRpcEnabled ? tr("Discord Rich Presence ausschalten") : tr("Discord Rich Presence einschalten")}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  discordRpcEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {pluginItems.map((item) => {
            const key = `${item.pluginId}:${item.label}`;
            if (item.children?.length) {
              const open = openPlugin === key;
              return (
                <div key={key}>
                  <AccountMenuButton
                    icon={<Puzzle className="h-4 w-4" />}
                    label={item.label}
                    onClick={() => setOpenPlugin(open ? null : key)}
                  />
                  {open && (
                    <div className="mx-3 mb-1 rounded-lg border border-white/10 bg-black/20 p-1">
                      {item.children.map((child) => (
                        <button
                          key={child.id || child.label}
                          onClick={() => {
                            if (child.id) runPlugin(item.pluginId, child.id);
                            onClose();
                          }}
                          className="w-full truncate rounded px-2 py-1.5 text-left text-[11px] text-zinc-300 transition-colors hover:bg-white/10"
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <AccountMenuButton
                key={key}
                icon={<Puzzle className="h-4 w-4" />}
                label={item.label}
                onClick={() => {
                  if (item.id) runPlugin(item.pluginId, item.id);
                  onClose();
                }}
              />
            );
          })}
          {mobileMode && (
            <AccountMenuButton
              icon={<BookOpen className="h-4 w-4" />}
              label={tr("Verbindungsanleitung")}
              onClick={() => {
                setShowTutorial(true);
              }}
            />
          )}
          <AccountMenuButton
            icon={<Megaphone className="h-4 w-4" />}
            label={tr("Was ist neu")}
            onClick={() => setShowNews(true)}
          />
          <AccountMenuButton
            icon={<Scale className="h-4 w-4" />}
            label={tr("Datenschutz & Impressum")}
            onClick={() => window.open('https://account.crazymine.de/datenschutz', '_blank')}
          />
          <AccountMenuButton icon={<LogOut className="h-4 w-4" />} label={tr("Abmelden")} onClick={logout} />
        </div>
      </div>
      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
      {showNews && <NewsPopup onClose={() => setShowNews(false)} />}
    </>,
    document.getElementById('overlay-root') ?? document.body,
  );
}

const PROVIDER_INFO = {
  antigravity: {
    label: 'Antigravity',
    helpUrl: 'https://antigravity.google/docs/cli-troubleshooting',
  },
  openai: {
    label: 'Codex',
    helpUrl: 'https://developers.openai.com/codex/cli',
  },
  anthropic: {
    label: 'Claude',
    helpUrl: 'https://code.claude.com/docs',
  },
  cursor: {
    label: 'Cursor',
    helpUrl: 'https://cursor.com/docs/cli/overview',
  },
  opencode: {
    label: 'OpenCode',
    helpUrl: 'https://opencode.ai/docs/',
  },
  freebuff: {
    label: 'FreeBuff',
    helpUrl: 'https://freebuff.com/',
  },
} as const;

function AccountMenuButton({
  icon,
  label,
  shortcut,
  value,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  value?: string;
  onClick(): void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] text-zinc-200 hover:bg-white/10"
    >
      <span className="text-zinc-500">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value && <span className="max-w-20 truncate text-[11px] text-zinc-500">{value}</span>}
      {shortcut && <span className="text-[11px] text-zinc-500">{shortcut}</span>}
    </button>
  );
}
