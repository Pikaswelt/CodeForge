import { useState, type ReactNode } from 'react';
import { BookOpen, CircleUserRound, Loader2, LogOut, Megaphone, MessageSquare, Play, Settings } from 'lucide-react';
import { PROVIDER_MODELS, useAppContext } from '../AppContext';
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
    startAntigravityLimit,
    discordRpcEnabled,
    setDiscordRpcEnabled,
  } = useAppContext();
  const [showLimitStarter, setShowLimitStarter] = useState(false);
  const [limitModel, setLimitModel] = useState(PROVIDER_MODELS.antigravity[0].id);
  const [busy, setBusy] = useState<'limit' | null>(null);
  const [status, setStatus] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const providerInfo = PROVIDER_INFO[provider];

  return (
    <>
      <div
        className={`theme-popover absolute z-[140] w-72 overflow-hidden rounded-xl border border-white/10 bg-[#242124]/95 py-1.5 text-sm text-zinc-200 shadow-2xl backdrop-blur-xl ${className}`}
      >
        <div className="px-3 pb-2 pt-1">
          <div className="flex items-center gap-2 rounded-lg px-1 py-1.5">
            <CircleUserRound className="h-4 w-4 text-zinc-500" />
            <div className="min-w-0">
              <div className="truncate text-[13px] text-zinc-200">{providerInfo.label} Konto</div>
              <div className="truncate text-[11px] text-zinc-500">
                {apiKeys[provider] ? 'API-Key gesetzt' : 'Lokale CLI / ChatGPT Login'}
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 py-1">
          <AccountMenuButton
            icon={<Settings className="h-4 w-4" />}
            label="Einstellungen"
            shortcut="Ctrl+,"
            onClick={() => {
              onSettingsClick();
              onClose();
            }}
          />
          <div className="flex items-center justify-between px-3 py-2 text-[13px] text-zinc-200 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-zinc-500" />
              <span>Discord Status</span>
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
              title={discordRpcEnabled ? 'Discord Rich Presence ausschalten' : 'Discord Rich Presence einschalten'}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  discordRpcEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <AccountMenuButton
            icon={busy === 'limit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            label="Limit starten"
            onClick={() => {
              setShowLimitStarter((value) => !value);
              setStatus('');
            }}
          />
          {showLimitStarter && (
            <div className="mx-3 mb-1 rounded-lg border border-white/10 bg-black/20 p-2">
              <label className="text-[10px] uppercase tracking-wide text-zinc-600">
                Antigravity Modell
                <select
                  value={limitModel}
                  onChange={(event) => setLimitModel(event.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-[#181516] px-2 py-1.5 text-xs normal-case tracking-normal text-zinc-200 outline-none"
                >
                  {PROVIDER_MODELS.antigravity.map((model) => (
                    <option key={model.id} value={model.id}>{model.name} - {model.intelligence || model.id}</option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy === 'limit'}
                onClick={async () => {
                  setBusy('limit');
                  setStatus('');
                  try {
                    const ok = await startAntigravityLimit(limitModel);
                    const message = ok ? 'Limit gestartet. Du kannst aus dem Tab raus.' : 'Antigravity hat nicht nur OK geantwortet.';
                    setStatus(message);
                    window.alert(message);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Limit konnte nicht gestartet werden.';
                    setStatus(message);
                    window.alert(message);
                  } finally {
                    setBusy(null);
                  }
                }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-white/10 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                {busy === 'limit' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Starten
              </button>
              {status && <div className="mt-2 text-[10px] text-zinc-500">{status}</div>}
            </div>
          )}
          {mobileMode && (
            <AccountMenuButton
              icon={<BookOpen className="h-4 w-4" />}
              label="Verbindungsanleitung"
              onClick={() => {
                setShowTutorial(true);
              }}
            />
          )}
          <AccountMenuButton
            icon={<Megaphone className="h-4 w-4" />}
            label="Was ist neu"
            onClick={() => setShowNews(true)}
          />
          <AccountMenuButton
            icon={<LogOut className="h-4 w-4" />}
            label="Abmelden"
            onClick={() => {
              setApiKey(provider, '');
              onClose();
            }}
          />
        </div>
      </div>
      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
      {showNews && <NewsPopup onClose={() => setShowNews(false)} />}
    </>
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
