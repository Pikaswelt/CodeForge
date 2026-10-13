import { useState, type ReactNode } from 'react';
import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Github,
  Info,
  Keyboard,
  Palette,
  Pencil,
  Plus,
  Rocket,
  Server,
  SquareTerminal,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import { HARNESS_ICONS, harnessIcon } from '../../harnessIcons';
import { listModels } from '../apiChat';
import { Native, errorMessage, mediaUrl } from '../native';
import { AGY_ACCOUNT_ID_PATTERN, run, shellQuote } from '../remote';
import { newId, useStore } from '../store';
import { BUILT_IN_THEMES, TERMINAL_FONTS, resolveTheme } from '../theme';
import { MAX_AGY_ACCOUNTS, type ApiProviderConfig, type CliHarness, type MobileTheme } from '../types';
import { Button, Divider, Field, IconButton, Row, ScreenHeader, Section, Segmented, Sheet, Slider, Toggle, cx } from '../ui';
import ImportSheet from './ImportSheet';
import ThemeEditor from './ThemeEditor';

type Page = 'main' | 'appearance' | 'terminal' | 'harnesses' | 'agy' | 'providers' | 'about';

export default function SettingsScreen() {
  const [page, setPage] = useState<Page>('main');
  const [importing, setImporting] = useState(false);
  const { settings, customThemes, harnesses, agyAccounts, apiProviders, servers, setTab } = useStore();
  const theme = resolveTheme(settings.themeId, customThemes);

  if (page !== 'main') {
    const titles: Record<Exclude<Page, 'main'>, string> = {
      appearance: 'Aussehen',
      terminal: 'Terminal',
      harnesses: 'CLI-Harnesses',
      agy: 'Antigravity-Accounts',
      providers: 'KI-Provider',
      about: 'Über CodeForge',
    };
    return (
      <div className="flex h-full flex-col">
        <ScreenHeader
          title={titles[page]}
          leading={<IconButton label="Zurück" onClick={() => setPage('main')}><ChevronLeft className="h-5 w-5" /></IconButton>}
        />
        <div className="cf-scroll min-h-0 flex-1 px-4 pb-8">
          {page === 'appearance' && <AppearancePage />}
          {page === 'terminal' && <TerminalPage />}
          {page === 'harnesses' && <HarnessPage />}
          {page === 'agy' && <AgyPage />}
          {page === 'providers' && <ProviderPage />}
          {page === 'about' && <AboutPage />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Einstellungen" />
      <div className="cf-scroll min-h-0 flex-1 px-4 pb-8">
        <Section>
          <div className="cf-glass cf-card overflow-hidden">
            <NavRow icon={<Palette className="h-4 w-4" />} title="Aussehen" subtitle={`${theme.name} · Hintergründe, Transparenz`} onClick={() => setPage('appearance')} />
            <Divider />
            <NavRow icon={<Keyboard className="h-4 w-4" />} title="Terminal" subtitle={`Schrift ${settings.terminalFontSize}px · Sondertasten · Trigger-Wörter`} onClick={() => setPage('terminal')} />
          </div>
        </Section>
        <Section title="Agents">
          <div className="cf-glass cf-card overflow-hidden">
            <NavRow icon={<Wrench className="h-4 w-4" />} title="CLI-Harnesses" subtitle={harnesses.map((item) => item.name).join(', ')} onClick={() => setPage('harnesses')} />
            <Divider />
            <NavRow icon={<Rocket className="h-4 w-4" />} title="Antigravity-Accounts" subtitle={agyAccounts.length ? `${agyAccounts.length} von ${MAX_AGY_ACCOUNTS}` : 'Mehrere agy-Logins auf dem Server'} onClick={() => setPage('agy')} />
            <Divider />
            <NavRow icon={<Bot className="h-4 w-4" />} title="KI-Provider" subtitle={apiProviders.length ? apiProviders.map((item) => item.name).join(', ') : 'Für den API-Chat'} onClick={() => setPage('providers')} />
          </div>
        </Section>
        <Section title="V-Server">
          <div className="cf-glass cf-card overflow-hidden">
            <NavRow icon={<Server className="h-4 w-4" />} title="V-Server verwalten" subtitle={servers.length ? servers.map((item) => item.name).join(', ') : 'Noch keiner'} onClick={() => setTab('home')} />
            <Divider />
            <NavRow icon={<Upload className="h-4 w-4" />} title="Vom PC übernehmen" subtitle="Server, Keys und Einstellungen aus CodeForge am PC" onClick={() => setImporting(true)} />
          </div>
        </Section>
        <Section>
          <div className="cf-glass cf-card overflow-hidden">
            <NavRow icon={<Info className="h-4 w-4" />} title="Über CodeForge" subtitle={`Version ${__APP_VERSION__}`} onClick={() => setPage('about')} />
          </div>
        </Section>
      </div>
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
    </div>
  );
}

function NavRow(props: { icon: ReactNode; title: string; subtitle?: string; onClick: () => void }) {
  return <Row {...props} trailing={<ChevronRight className="cf-muted h-4 w-4" />} />;
}

function AppearancePage() {
  const { settings, updateSettings, customThemes } = useStore();
  const [editing, setEditing] = useState<MobileTheme | 'new' | null>(null);
  return (
    <>
      <Section title="Themes">
        <div className="grid grid-cols-2 gap-2.5">
          {BUILT_IN_THEMES.map((item) => (
            <ThemeTile key={item.id} name={item.name} gradient={item.gradient} accent={item.accent} text={item.text} active={settings.themeId === item.id} onClick={() => updateSettings({ themeId: item.id })} />
          ))}
        </div>
      </Section>
      <Section
        title="Eigene Themes"
        action={<button className="cf-accent-text flex items-center gap-1 text-[0.8rem] font-semibold" onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Neu</button>}
      >
        {customThemes.length === 0 ? (
          <button onClick={() => setEditing('new')} className="cf-press w-full rounded-2xl border border-dashed border-cf-line px-4 py-6 text-center">
            <Palette className="cf-accent-text mx-auto mb-2 h-6 w-6" />
            <div className="text-[0.92rem] font-semibold">Eigenes Theme erstellen</div>
            <div className="cf-muted text-[0.78rem]">Eigene Farben, animierter Verlauf, Bild oder Video vom Handy als Hintergrund</div>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {customThemes.map((item) => {
              const resolved = resolveTheme(item.id, customThemes);
              return (
                <ThemeTile
                  key={item.id}
                  name={item.name}
                  gradient={resolved.gradient}
                  accent={resolved.accent}
                  text={resolved.text}
                  media={item.backgroundMedia}
                  video={item.backgroundMediaKind === 'video'}
                  active={settings.themeId === item.id}
                  onClick={() => updateSettings({ themeId: item.id })}
                  onEdit={() => setEditing(item)}
                />
              );
            })}
          </div>
        )}
      </Section>
      <Section title="Oberfläche">
        <div className="cf-glass cf-card overflow-hidden">
          <Slider label="Deckkraft der Flächen" value={settings.surfaceOpacity} min={20} max={100} unit="%" onChange={(value) => updateSettings({ surfaceOpacity: value })} />
          <Divider />
          <Slider label="Glas-Unschärfe" value={settings.blur} min={0} max={40} unit="px" onChange={(value) => updateSettings({ blur: value })} />
          <Divider />
          <Slider label="Ecken-Radius" value={settings.radius} min={4} max={28} unit="px" onChange={(value) => updateSettings({ radius: value })} />
          <Divider />
          <Slider label="Terminal-Hintergrund" value={settings.terminalOpacity} min={0} max={100} unit="%" onChange={(value) => updateSettings({ terminalOpacity: value })} />
        </div>
      </Section>
      {editing && <ThemeEditor theme={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ThemeTile({ name, gradient, accent, text, media, video, active, onClick, onEdit }: { name: string; gradient: string; accent: string; text: string; media?: string; video?: boolean; active: boolean; onClick: () => void; onEdit?: () => void }) {
  const url = mediaUrl(media);
  return (
    <div className={cx('relative overflow-hidden rounded-2xl border-2 transition-colors', active ? 'border-[var(--cf-accent)]' : 'border-transparent')}>
      <button onClick={onClick} className="cf-press block h-24 w-full text-left" style={{ backgroundImage: gradient }}>
        {url && video && <video className="absolute inset-0 h-full w-full object-cover" src={url} muted playsInline preload="metadata" />}
        {url && !video && <img className="absolute inset-0 h-full w-full object-cover" src={url} alt="" />}
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: accent }} />
          <span className="truncate text-[0.8rem] font-semibold" style={{ color: url ? '#fff' : text }}>{name}</span>
        </span>
        {active && <span className="cf-accent-bg absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full"><Check className="h-3.5 w-3.5" /></span>}
      </button>
      {onEdit && (
        <button onClick={onEdit} className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white" aria-label="Bearbeiten">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function TerminalPage() {
  const { settings, updateSettings } = useStore();
  return (
    <>
      <Section title="Darstellung">
        <div className="cf-glass cf-card overflow-hidden">
          <Slider label="Schriftgröße" value={settings.terminalFontSize} min={8} max={26} unit="px" onChange={(value) => updateSettings({ terminalFontSize: value })} />
          <Divider />
          <div className="px-4 py-3">
            <div className="mb-2 text-[0.95rem] font-medium">Schriftart</div>
            <div className="grid grid-cols-2 gap-2">
              {TERMINAL_FONTS.map((font) => (
                <button
                  key={font.id}
                  onClick={() => updateSettings({ terminalFont: font.id })}
                  className={cx('cf-press rounded-xl border px-3 py-2.5 text-left text-[0.85rem]', settings.terminalFont === font.id ? 'border-[var(--cf-accent)] bg-cf-hover' : 'border-cf-line')}
                  style={{ fontFamily: font.css }}
                >
                  {font.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="cf-muted mt-2 px-1 text-[0.75rem]">Tipp: Im Terminal mit zwei Fingern zoomen ändert die Schriftgröße direkt.</p>
      </Section>
      <Section title="Bedienung">
        <div className="cf-glass cf-card overflow-hidden">
          <Toggle checked={settings.extraKeys} onChange={(value) => updateSettings({ extraKeys: value })} label="Sondertasten-Leiste" description="Esc, Tab, Ctrl, Alt, Pfeile, ^C und mehr über der Tastatur" />
          <Divider />
          <Toggle checked={settings.haptics} onChange={(value) => updateSettings({ haptics: value })} label="Vibration" description="Kurzes Feedback bei Sondertasten und Senden" />
        </div>
      </Section>
      <Section title="Prompts">
        <div className="cf-glass cf-card overflow-hidden">
          <Toggle checked={settings.prefixSuffixEnabled} onChange={(value) => updateSettings({ prefixSuffixEnabled: value })} label="Präfix & Suffix" description="Wird um jeden Prompt aus dem Eingabefeld gesetzt" />
          {settings.prefixSuffixEnabled && (
            <div className="px-4 pb-3">
              <Field label="Präfix"><input className="cf-input" value={settings.prefix} onChange={(event) => updateSettings({ prefix: event.target.value })} /></Field>
              <Field label="Suffix"><input className="cf-input" value={settings.suffix} onChange={(event) => updateSettings({ suffix: event.target.value })} /></Field>
            </div>
          )}
        </div>
      </Section>
      <Section title="Benachrichtigungen">
        <div className="cf-glass cf-card overflow-hidden">
          <div className="px-4 py-3">
            <Field label="Trigger-Wörter (mit Komma getrennt)" hint="Erscheint eines davon in einem Terminal, meldet sich die App. Zum Beispiel wenn ein Agent auf dich wartet.">
              <input className="cf-input" value={settings.triggerWords} onChange={(event) => updateSettings({ triggerWords: event.target.value })} placeholder="fertig, Do you want, ? for shortcuts" />
            </Field>
          </div>
          <Divider />
          <Toggle checked={settings.notifications} onChange={(value) => updateSettings({ notifications: value })} label="Android-Benachrichtigung" description="Auch wenn die App im Hintergrund ist, solange die Verbindung besteht" />
        </div>
      </Section>
    </>
  );
}

function HarnessPage() {
  const { harnesses, setHarnesses } = useStore();
  const [editing, setEditing] = useState<CliHarness | 'new' | null>(null);
  return (
    <>
      <p className="cf-muted mb-3 px-1 text-[0.82rem] leading-relaxed">Programme, die ein neues Terminal auf dem V-Server startet. Sie müssen dort installiert sein.</p>
      <div className="cf-glass cf-card mb-3 overflow-hidden">
        {harnesses.map((item, index) => {
          const Icon = harnessIcon(item.icon);
          return (
            <div key={item.id}>
              {index > 0 && <Divider />}
              <Row icon={<Icon className="cf-accent-text h-4 w-4" />} title={item.name} subtitle={item.command || 'Leere Shell'} onClick={() => setEditing(item)} trailing={<Pencil className="cf-muted h-4 w-4" />} />
            </div>
          );
        })}
      </div>
      <Button className="w-full" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Harness hinzufügen</Button>
      {editing && (
        <HarnessEditor
          harness={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            setHarnesses(harnesses.some((item) => item.id === next.id) ? harnesses.map((item) => (item.id === next.id ? next : item)) : [...harnesses, next]);
            setEditing(null);
          }}
          onDelete={(id) => {
            setHarnesses(harnesses.filter((item) => item.id !== id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function HarnessEditor({ harness, onClose, onSave, onDelete }: { harness?: CliHarness; onClose: () => void; onSave: (harness: CliHarness) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState(harness?.name || '');
  const [command, setCommand] = useState(harness?.command || '');
  const [icon, setIcon] = useState(harness?.icon || 'Terminal');
  return (
    <Sheet
      title={harness ? 'Harness bearbeiten' : 'Neuer Harness'}
      onClose={onClose}
      footer={<Button variant="primary" className="flex-1" disabled={!name.trim()} onClick={() => onSave({ id: harness?.id || newId(), name: name.trim(), command: command.trim(), icon })}>Speichern</Button>}
    >
      <Field label="Name"><input className="cf-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="z.B. OpenCode" /></Field>
      <Field label="Startbefehl" hint="Leer lassen für eine normale Shell. Beispiele: claude --dangerously-skip-permissions, codex, agy">
        <input className="cf-input font-mono" value={command} onChange={(event) => setCommand(event.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </Field>
      <div className="mb-2 px-0.5 text-[0.8rem] font-medium cf-muted">Symbol</div>
      <div className="mb-4 grid grid-cols-5 gap-2">
        {Object.entries(HARNESS_ICONS).map(([key, Icon]) => (
          <button key={key} onClick={() => setIcon(key)} className={cx('cf-press flex h-12 items-center justify-center rounded-xl border', icon === key ? 'border-transparent cf-accent-bg' : 'border-cf-line bg-cf-hover')} aria-label={key}>
            <Icon className="h-5 w-5" />
          </button>
        ))}
      </div>
      {harness && <Button variant="danger" className="w-full" icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete(harness.id)}>Löschen</Button>}
    </Sheet>
  );
}

function AgyPage() {
  const { agyAccounts, setAgyAccounts, servers, withServer, toast, confirm, prompt } = useStore();

  const add = async () => {
    const name = await prompt({ title: 'Antigravity-Account', label: 'Name (z.B. Arbeit, Privat)', value: '', confirmLabel: 'Hinzufügen' });
    if (!name?.trim()) return;
    const slug = name.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'account';
    let id = slug;
    for (let index = 2; agyAccounts.some((item) => item.id === id); index += 1) id = `${slug}-${index}`;
    if (!AGY_ACCOUNT_ID_PATTERN.test(id)) id = newId().slice(0, 8);
    setAgyAccounts([...agyAccounts, { id, name: name.trim() }]);
  };

  const remove = async (id: string, name: string) => {
    const wipe = servers.length > 0 && (await confirm({
      title: `${name} entfernen?`,
      message: 'Soll auch das Login-Profil auf deinen V-Servern gelöscht werden (~/.codeforge-agy/…)? Sonst bleibt der Login dort erhalten.',
      confirmLabel: 'Profil löschen',
      danger: true,
    }));
    setAgyAccounts(agyAccounts.filter((item) => item.id !== id));
    if (!wipe || !AGY_ACCOUNT_ID_PATTERN.test(id)) return;
    for (const server of servers) {
      try {
        await withServer(server, () => run(server, `tmux kill-session -t ${shellQuote(`=cf-agy-${id}`)} 2>/dev/null; rm -rf -- "$HOME/.codeforge-agy/"${shellQuote(id)}`));
      } catch (error) {
        toast(`${server.name}: ${errorMessage(error)}`, 'error');
      }
    }
  };

  return (
    <>
      <p className="cf-muted mb-3 px-1 text-[0.82rem] leading-relaxed">
        Jeder Account bekommt auf dem V-Server ein eigenes Profil (<code>~/.codeforge-agy/&lt;id&gt;</code>) und eine eigene tmux-Session. Gleiche IDs wie am PC teilen sich Login und Session. Beim ersten Start meldest du dich im Terminal an, der Google-Link öffnet sich im Browser.
      </p>
      {agyAccounts.length > 0 && (
        <div className="cf-glass cf-card mb-3 overflow-hidden">
          {agyAccounts.map((item, index) => (
            <div key={item.id}>
              {index > 0 && <Divider />}
              <Row
                icon={<Rocket className="cf-accent-text h-4 w-4" />}
                title={item.name}
                subtitle={`ID ${item.id}`}
                trailing={<IconButton label="Entfernen" onClick={() => void remove(item.id, item.name)}><Trash2 className="h-4 w-4 text-red-400" /></IconButton>}
              />
            </div>
          ))}
        </div>
      )}
      <Button className="w-full" icon={<Plus className="h-4 w-4" />} disabled={agyAccounts.length >= MAX_AGY_ACCOUNTS} onClick={() => void add()}>
        Account hinzufügen {agyAccounts.length >= MAX_AGY_ACCOUNTS ? `(max. ${MAX_AGY_ACCOUNTS})` : ''}
      </Button>
    </>
  );
}

function ProviderPage() {
  const { apiProviders, setApiProviders } = useStore();
  const [editing, setEditing] = useState<ApiProviderConfig | 'new' | null>(null);
  return (
    <>
      <p className="cf-muted mb-3 px-1 text-[0.82rem] leading-relaxed">API-Keys werden nur in der App auf diesem Handy gespeichert und direkt an den jeweiligen Anbieter geschickt.</p>
      {apiProviders.length > 0 && (
        <div className="cf-glass cf-card mb-3 overflow-hidden">
          {apiProviders.map((item, index) => (
            <div key={item.id}>
              {index > 0 && <Divider />}
              <Row icon={<Bot className="cf-accent-text h-4 w-4" />} title={item.name} subtitle={`${item.provider} · ${item.model || 'kein Standardmodell'}`} onClick={() => setEditing(item)} trailing={<Pencil className="cf-muted h-4 w-4" />} />
            </div>
          ))}
        </div>
      )}
      <Button className="w-full" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Provider hinzufügen</Button>
      {editing && (
        <ProviderEditor
          provider={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            setApiProviders(apiProviders.some((item) => item.id === next.id) ? apiProviders.map((item) => (item.id === next.id ? next : item)) : [...apiProviders, next]);
            setEditing(null);
          }}
          onDelete={(id) => {
            setApiProviders(apiProviders.filter((item) => item.id !== id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

const PROVIDER_PRESETS: Record<ApiProviderConfig['provider'], { name: string; baseUrl: string; model: string }> = {
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5' },
  'openai-compatible': { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: '' },
};

function ProviderEditor({ provider, onClose, onSave, onDelete }: { provider?: ApiProviderConfig; onClose: () => void; onSave: (provider: ApiProviderConfig) => void; onDelete: (id: string) => void }) {
  const { toast } = useStore();
  const [draft, setDraft] = useState<ApiProviderConfig>(provider || { id: newId(), ...PROVIDER_PRESETS.anthropic, provider: 'anthropic', apiKey: '' });
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const set = (patch: Partial<ApiProviderConfig>) => setDraft((value) => ({ ...value, ...patch }));

  const test = async () => {
    setLoading(true);
    try {
      const list = await listModels(draft);
      setModels(list);
      toast(`Verbunden: ${list.length} Modelle gefunden.`, 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      title={provider ? 'Provider bearbeiten' : 'Neuer Provider'}
      full
      onClose={onClose}
      footer={<Button variant="primary" className="flex-1" disabled={!draft.name.trim()} onClick={() => onSave(draft)}>Speichern</Button>}
    >
      <div className="mb-3">
        <Segmented
          value={draft.provider}
          onChange={(value) => set({ provider: value, ...(provider ? {} : PROVIDER_PRESETS[value]) })}
          options={[{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai', label: 'OpenAI' }, { value: 'openai-compatible', label: 'Kompatibel' }]}
        />
      </div>
      <Field label="Name"><input className="cf-input" value={draft.name} onChange={(event) => set({ name: event.target.value })} /></Field>
      <Field label="API-URL" hint={draft.provider === 'openai-compatible' ? 'z.B. https://openrouter.ai/api/v1 oder http://<server>:11434/v1 für Ollama' : undefined}>
        <input className="cf-input font-mono text-[14px]" value={draft.baseUrl} onChange={(event) => set({ baseUrl: event.target.value })} autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="url" />
      </Field>
      <Field label="API-Key">
        <input className="cf-input font-mono text-[14px]" type="password" value={draft.apiKey} onChange={(event) => set({ apiKey: event.target.value })} autoComplete="off" placeholder="sk-…" />
      </Field>
      <Field label="Standardmodell">
        {models.length ? (
          <select className="cf-input" value={draft.model} onChange={(event) => set({ model: event.target.value })}>
            {!models.includes(draft.model) && draft.model && <option value={draft.model}>{draft.model}</option>}
            {models.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        ) : (
          <input className="cf-input" value={draft.model} onChange={(event) => set({ model: event.target.value })} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        )}
      </Field>
      <Button className="mb-4 w-full" busy={loading} onClick={() => void test()}>Verbindung testen & Modelle laden</Button>
      {provider && <Button variant="danger" className="w-full" icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete(provider.id)}>Löschen</Button>}
    </Sheet>
  );
}

function AboutPage() {
  return (
    <div className="cf-glass cf-card p-5">
      <div className="mb-3 flex items-center gap-3">
        <SquareTerminal className="cf-accent-text h-8 w-8" />
        <div>
          <div className="text-lg font-bold">CodeForge Mobile</div>
          <div className="cf-muted text-[0.82rem]">Version {__APP_VERSION__}</div>
        </div>
      </div>
      <p className="cf-muted mb-4 text-[0.86rem] leading-relaxed">
        Die Android-App von CodeForge. Sie verbindet sich per SSH direkt mit deinem V-Server: Terminals laufen dort in tmux weiter, auch wenn das Handy die Verbindung verliert. Auf dem Handy wird nichts lokal ausgeführt.
      </p>
      <Button className="w-full" icon={<Github className="h-4 w-4" />} onClick={() => void Native.openUrl({ url: 'https://github.com/Pikaswelt/CodeForge/releases/latest' })}>
        Neueste Version auf GitHub
      </Button>
    </div>
  );
}
