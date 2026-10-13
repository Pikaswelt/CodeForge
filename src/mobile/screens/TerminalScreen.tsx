import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ClipboardPaste,
  Copy,
  Keyboard,
  MessageSquareText,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  SendHorizontal,
  SquareTerminal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { harnessIcon } from '../../harnessIcons';
import { Native } from '../native';
import { useStore } from '../store';
import { getController, disposeController, peekController, type TerminalController } from '../terminalController';
import { resolveTheme, terminalFontCss, terminalTheme } from '../theme';
import type { TerminalSession } from '../types';
import { Button, EmptyState, IconButton, Row, Sheet, StatusDot, cx } from '../ui';
import NewTerminalSheet from './NewTerminalSheet';

function useController(controller: TerminalController | undefined) {
  return useSyncExternalStore(
    (listener) => (controller ? controller.subscribe(listener) : () => {}),
    () => (controller ? `${controller.state}|${controller.message}|${controller.ctrl}|${controller.alt}` : ''),
  );
}

export default function TerminalScreen({ visible }: { visible: boolean }) {
  const { terminals, activeTerminalId, setActiveTerminalId, servers, settings, customThemes, updateSettings, prompt, renameTerminal } = useStore();
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(false);
  const [closing, setClosing] = useState<TerminalSession | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const active = terminals.find((item) => item.id === activeTerminalId) || terminals[terminals.length - 1];
  const theme = useMemo(() => resolveTheme(settings.themeId, customThemes), [settings.themeId, customThemes]);
  const options = useMemo(
    () => ({ fontSize: settings.terminalFontSize, fontFamily: terminalFontCss(settings.terminalFont), theme: terminalTheme(theme) }),
    [settings.terminalFontSize, settings.terminalFont, theme],
  );
  const controller = active ? getController(active, options) : undefined;
  useController(controller);

  // Pinch-zoom in a terminal becomes the default size for all of them.
  useEffect(() => {
    if (!controller) return;
    controller.onZoom = (size) => updateSettings({ terminalFontSize: size });
    return () => {
      controller.onZoom = null;
    };
  }, [controller, updateSettings]);

  useEffect(() => {
    if (active && active.id !== activeTerminalId) setActiveTerminalId(active.id);
  }, [active, activeTerminalId, setActiveTerminalId]);

  // Controllers of tabs closed elsewhere (e.g. server removed) are cleaned up.
  useEffect(() => {
    const ids = new Set(terminals.map((item) => item.id));
    for (const id of knownIds) if (!ids.has(id)) disposeController(id);
    knownIds = ids;
  }, [terminals]);

  const setFont = (size: number) => {
    const next = Math.min(26, Math.max(8, size));
    updateSettings({ terminalFontSize: next });
    for (const item of terminals) peekController(item.id)?.setOptions({ fontSize: next });
  };

  if (terminals.length === 0) {
    return (
      <div className="cf-safe-top flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<SquareTerminal className="h-8 w-8" />}
            title="Kein Terminal offen"
            text={servers.length ? 'Starte Claude Code, Codex, Antigravity oder eine Shell auf deinem V-Server.' : 'Füge zuerst auf dem Home-Tab deinen V-Server hinzu.'}
            action={servers.length ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Neues Terminal</Button> : undefined}
          />
        </div>
        {creating && <NewTerminalSheet onClose={() => setCreating(false)} />}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="cf-glass cf-safe-top relative z-10 flex shrink-0 items-center gap-1 border-x-0 border-t-0 pb-1.5 pl-2 pr-1">
        <div className="cf-scroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5">
          {terminals.map((session) => (
            <TabChip key={session.id} session={session} active={session.id === active?.id} onSelect={() => setActiveTerminalId(session.id)} onClose={() => setClosing(session)} />
          ))}
        </div>
        <IconButton label="Neues Terminal" onClick={() => setCreating(true)}>
          <Plus className="h-5 w-5" />
        </IconButton>
        <IconButton label="Menü" onClick={() => setMenu(true)}>
          <MoreVertical className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="cf-terminal-shell relative min-h-0 flex-1">
        {terminals.map((session) => (
          <TerminalView key={session.id} session={session} active={session.id === active?.id && visible} options={options} />
        ))}
        {controller && <StateOverlay controller={controller} onClose={() => active && setClosing(active)} />}
      </div>

      {controller && <InputBar controller={controller} />}

      {creating && <NewTerminalSheet onClose={() => setCreating(false)} />}
      {menu && active && controller && (
        <Sheet title={active.title} onClose={() => setMenu(false)}>
          <div className="cf-glass cf-card mb-3 overflow-hidden">
            <Row icon={<Copy className="h-4 w-4" />} title="Text kopieren" subtitle="Ausgabe markieren und kopieren" onClick={() => { setMenu(false); setCopying(controller.bufferText()); }} />
            <Row icon={<ClipboardPaste className="h-4 w-4" />} title="Einfügen" subtitle="Zwischenablage ins Terminal" onClick={async () => { setMenu(false); const { text } = await Native.readClipboard(); if (text) controller.paste(text); }} />
            <Row icon={<Pencil className="h-4 w-4" />} title="Umbenennen" onClick={() => { setMenu(false); void renameTab(active); }} />
            <Row icon={<RefreshCw className="h-4 w-4" />} title="Neu verbinden" subtitle="Hängt sich wieder an die tmux-Session an" onClick={() => { setMenu(false); void controller.start(true); }} />
          </div>
          <div className="cf-glass cf-card mb-3 flex items-center gap-2 px-4 py-3">
            <span className="flex-1 text-[0.95rem] font-medium">Schriftgröße</span>
            <IconButton label="Kleiner" className="bg-cf-hover" onClick={() => setFont(settings.terminalFontSize - 1)}><ZoomOut className="h-4 w-4" /></IconButton>
            <span className="w-8 text-center tabular-nums">{settings.terminalFontSize}</span>
            <IconButton label="Größer" className="bg-cf-hover" onClick={() => setFont(settings.terminalFontSize + 1)}><ZoomIn className="h-4 w-4" /></IconButton>
          </div>
          <div className="cf-glass cf-card overflow-hidden">
            <Row icon={<X className="h-4 w-4" />} title="Terminal schließen …" danger onClick={() => { setMenu(false); setClosing(active); }} />
          </div>
        </Sheet>
      )}
      {closing && <CloseSheet session={closing} onClose={() => setClosing(null)} />}
      {copying !== null && (
        <Sheet
          title="Text kopieren"
          full
          onClose={() => setCopying(null)}
          footer={<Button variant="primary" className="flex-1" icon={<Copy className="h-4 w-4" />} onClick={async () => { await Native.copyText({ text: copying }); setCopying(null); }}>Alles kopieren</Button>}
        >
          <p className="cf-muted mb-2 text-[0.78rem]">Lange drücken, um einen Teil zu markieren.</p>
          <pre className="cf-selectable whitespace-pre-wrap break-words rounded-xl bg-black/40 p-3 font-mono text-[0.72rem] leading-relaxed text-zinc-200">{copying || '(leer)'}</pre>
        </Sheet>
      )}
    </div>
  );

  async function renameTab(session: TerminalSession) {
    const value = await prompt({ title: 'Terminal umbenennen', label: 'Name', value: session.title });
    if (value?.trim()) renameTerminal(session.id, value.trim());
  }
}

let knownIds = new Set<string>();

function TabChip({ session, active, onSelect, onClose }: { session: TerminalSession; active: boolean; onSelect: () => void; onClose: () => void }) {
  const controller = peekController(session.id);
  useController(controller);
  const Icon = harnessIcon(session.icon);
  return (
    <div className={cx('flex shrink-0 items-center rounded-full border pl-3 pr-1 transition-colors', active ? 'border-transparent cf-accent-bg' : 'border-cf-line bg-cf-hover')}>
      <button onClick={onSelect} className="flex max-w-[11rem] items-center gap-1.5 py-1.5 text-[0.8rem] font-semibold">
        <StatusDot state={controller?.state} />
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{session.title}</span>
      </button>
      <button onClick={onClose} className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full opacity-70" aria-label="Schliessen">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TerminalView({ session, active, options }: { session: TerminalSession; active: boolean; options: Parameters<typeof getController>[1] }) {
  const host = useRef<HTMLDivElement>(null);
  const controller = getController(session, options);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    controller.attach(element);
    void controller.start();
    return () => {
      if (controller.element.parentElement === element) element.removeChild(controller.element);
    };
  }, [controller]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => controller.syncSize(), 30);
    return () => window.clearTimeout(timer);
  }, [active, controller]);

  return <div ref={host} className={cx('absolute inset-0', !active && 'invisible pointer-events-none')} />;
}

function StateOverlay({ controller, onClose }: { controller: TerminalController; onClose: () => void }) {
  useController(controller);
  if (controller.state === 'online') return null;
  if (controller.state === 'connecting') {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <span className="cf-glass rounded-full px-3.5 py-1.5 text-[0.78rem] font-medium">Verbinde mit dem V-Server …</span>
      </div>
    );
  }
  const lost = controller.state === 'lost';
  return (
    <div className="absolute inset-x-3 bottom-3 flex justify-center">
      <div className="cf-glass cf-card w-full max-w-sm px-4 py-3.5 shadow-2xl">
        <div className="mb-1 flex items-center gap-2 text-[0.95rem] font-semibold">
          <StatusDot state={controller.state} />
          {lost ? 'Verbindung unterbrochen' : controller.state === 'ended' ? 'Session beendet' : 'Verbindung fehlgeschlagen'}
        </div>
        <p className="cf-muted mb-3 text-[0.82rem] leading-snug">
          {lost ? 'Die Session läuft auf dem Server in tmux weiter. Neu verbinden hängt sich wieder an.' : controller.message}
        </p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClose}>Schließen</Button>
          <Button className="flex-1" variant="primary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void controller.start(true)}>
            {controller.state === 'ended' ? 'Neu starten' : 'Neu verbinden'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const KEYS: { label: string; seq?: string; icon?: typeof ArrowUp; modifier?: 'ctrl' | 'alt' }[] = [
  { label: 'Esc', seq: '\x1b' },
  { label: 'Tab', seq: '\t' },
  { label: '⇧Tab', seq: '\x1b[Z' },
  { label: 'Ctrl', modifier: 'ctrl' },
  { label: 'Alt', modifier: 'alt' },
  { label: '←', seq: '\x1b[D', icon: ArrowLeft },
  { label: '↓', seq: '\x1b[B', icon: ArrowDown },
  { label: '↑', seq: '\x1b[A', icon: ArrowUp },
  { label: '→', seq: '\x1b[C', icon: ArrowRight },
  { label: '^C', seq: '\x03' },
  { label: '/', seq: '/' },
  { label: '|', seq: '|' },
  { label: '-', seq: '-' },
  { label: '~', seq: '~' },
  { label: 'Pos1', seq: '\x1b[H' },
  { label: 'Ende', seq: '\x1b[F' },
  { label: 'Bild↑', seq: '\x1b[5~' },
  { label: 'Bild↓', seq: '\x1b[6~' },
  { label: 'Enter', seq: '\r' },
];

function InputBar({ controller }: { controller: TerminalController }) {
  const { settings, updateSettings } = useStore();
  const [text, setText] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useController(controller);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const update = () => setKeyboardOpen(document.activeElement === controller.term.textarea);
    const textarea = controller.term.textarea;
    textarea?.addEventListener('focus', update);
    textarea?.addEventListener('blur', update);
    return () => {
      textarea?.removeEventListener('focus', update);
      textarea?.removeEventListener('blur', update);
    };
  }, [controller]);

  const send = () => {
    const value = settings.prefixSuffixEnabled ? `${settings.prefix}${text}${settings.suffix}` : text;
    controller.sendText(value, true);
    setText('');
    if (settings.haptics) navigator.vibrate?.(8);
  };

  const press = (item: (typeof KEYS)[number]) => {
    if (settings.haptics) navigator.vibrate?.(6);
    if (item.modifier) controller.toggleModifier(item.modifier);
    else if (item.seq) controller.key(item.seq);
  };

  return (
    <div className="cf-glass relative z-10 shrink-0 border-x-0 border-b-0">
      {settings.composerOpen && (
        <div className="flex items-end gap-2 px-2 pt-2">
          <textarea
            ref={area}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={Math.min(5, Math.max(1, text.split('\n').length))}
            placeholder="Prompt eingeben oder diktieren …"
            className="cf-input min-h-[2.75rem] flex-1 resize-none py-2.5 text-[16px] leading-snug"
            enterKeyHint="enter"
          />
          <button
            onClick={send}
            onMouseDown={(event) => event.preventDefault()}
            className="cf-press cf-accent-bg flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-lg"
            aria-label="Senden"
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        </div>
      )}
      {settings.extraKeys && (
        <div className="cf-scroll flex gap-1.5 overflow-x-auto px-2 py-2" onMouseDown={(event) => event.preventDefault()}>
          <button
            className={cx('cf-key cf-press flex items-center justify-center', keyboardOpen && 'active')}
            onClick={() => (keyboardOpen ? controller.blur() : controller.focus())}
            aria-label="Tastatur"
          >
            <Keyboard className="h-4 w-4" />
          </button>
          <button
            className={cx('cf-key cf-press flex items-center justify-center', settings.composerOpen && 'active')}
            onClick={() => {
              updateSettings({ composerOpen: !settings.composerOpen });
              if (!settings.composerOpen) setTimeout(() => area.current?.focus(), 50);
            }}
            aria-label="Prompt-Eingabe"
          >
            <MessageSquareText className="h-4 w-4" />
          </button>
          {KEYS.map((item) => {
            const Icon = item.icon;
            const on = item.modifier ? controller[item.modifier] : false;
            return (
              <button key={item.label} className={cx('cf-key cf-press flex items-center justify-center', on && 'active')} onClick={() => press(item)} aria-label={item.label}>
                {Icon ? <Icon className="h-4 w-4" /> : item.label}
              </button>
            );
          })}
          <button
            className="cf-key cf-press flex items-center justify-center"
            onClick={async () => {
              const { text: clip } = await Native.readClipboard();
              if (clip) controller.paste(clip);
            }}
            aria-label="Einfügen"
          >
            <ClipboardPaste className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function CloseSheet({ session, onClose }: { session: TerminalSession; onClose: () => void }) {
  const { closeTerminal } = useStore();
  const controller = peekController(session.id);
  const finish = async (kill: boolean) => {
    onClose();
    closeTerminal(session.id);
    await controller?.close(kill);
    disposeController(session.id);
  };
  if (controller?.state === 'ended') {
    return (
      <Sheet title="Terminal schließen" onClose={onClose}>
        <Button variant="primary" className="w-full" onClick={() => void finish(false)}>Schließen</Button>
      </Sheet>
    );
  }
  return (
    <Sheet title={`${session.title} schließen`} onClose={onClose}>
      <div className="cf-glass cf-card overflow-hidden">
        <Row
          icon={<SquareTerminal className="h-4 w-4" />}
          title="Nur Tab schließen"
          subtitle="Läuft auf dem Server weiter, später unter „Laufende Sessions“ öffnen"
          onClick={() => void finish(false)}
        />
        <div className="h-px bg-cf-line" />
        <Row icon={<X className="h-4 w-4" />} title="Session beenden" subtitle="Stoppt die tmux-Session und alles, was darin läuft" danger onClick={() => void finish(true)} />
      </div>
    </Sheet>
  );
}
