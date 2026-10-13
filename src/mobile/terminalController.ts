import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { Native, errorCode, errorMessage } from './native';
import { buildRemoteSessionCommand, nativeServer } from './remote';
import type { MobileServer, TerminalSession } from './types';

// Each terminal tab owns one xterm instance and one SSH channel. Controllers live outside React
// so a terminal keeps running (and buffering output) while the user is on another screen;
// the view only mounts the controller's element.

export type TerminalState = 'connecting' | 'online' | 'lost' | 'ended' | 'error';

type Deps = {
  getServer: (id: string) => MobileServer | undefined;
  withServer: <T>(server: MobileServer, task: () => Promise<T>) => Promise<T>;
  onOutput?: (session: TerminalSession, text: string) => void;
};

const controllers = new Map<string, TerminalController>();
const byChannel = new Map<string, TerminalController>();
let listening = false;
let deps: Deps | null = null;

function ensureListeners() {
  if (listening) return;
  listening = true;
  void Native.addListener('shellData', ({ channelId, data }) => byChannel.get(channelId)?.receive(channelId, data));
  void Native.addListener('shellExit', ({ channelId, code, lost }) => byChannel.get(channelId)?.exited(channelId, code, lost));
  // Coming back to the app (or back online) re-attaches every terminal whose connection dropped.
  const revive = () => {
    if (document.visibilityState !== 'visible') return;
    for (const controller of controllers.values()) if (controller.state === 'lost') void controller.start(true);
  };
  document.addEventListener('visibilitychange', revive);
  window.addEventListener('online', revive);
}

export function configureTerminals(next: Deps) {
  deps = next;
  ensureListeners();
}

export function getController(session: TerminalSession, options: TerminalOptions) {
  let controller = controllers.get(session.id);
  if (!controller) {
    controller = new TerminalController(session, options);
    controllers.set(session.id, controller);
  }
  return controller;
}

export function peekController(id: string) {
  return controllers.get(id);
}

export function disposeController(id: string) {
  controllers.get(id)?.dispose();
  controllers.delete(id);
}

export function applyToAll(patch: Partial<TerminalOptions>) {
  for (const controller of controllers.values()) controller.setOptions(patch);
}

export type TerminalOptions = {
  fontSize: number;
  fontFamily: string;
  theme: Record<string, string>;
};

export class TerminalController {
  readonly session: TerminalSession;
  readonly term: Terminal;
  readonly element: HTMLDivElement;
  private fit = new FitAddon();
  private generation = 0;
  private channelId = '';
  private lastSize = '';
  private resizeTimer = 0;
  private retryTimer = 0;
  private retries = 0;
  private observer: ResizeObserver | null = null;
  private listeners = new Set<() => void>();
  state: TerminalState = 'connecting';
  message = '';
  ctrl = false;
  alt = false;
  private started = false;

  constructor(session: TerminalSession, options: TerminalOptions) {
    this.session = session;
    this.element = document.createElement('div');
    this.element.className = 'cf-xterm';
    this.term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      fontSize: options.fontSize,
      fontFamily: options.fontFamily,
      theme: options.theme,
      allowTransparency: true,
      smoothScrollDuration: 80,
      linkHandler: {
        activate: (_event, uri) => {
          if (/^https?:\/\//i.test(uri)) void Native.openUrl({ url: uri });
        },
        allowNonHttpProtocols: false,
      },
    });
    this.term.loadAddon(this.fit);
    this.term.loadAddon(new WebLinksAddon((_event, uri) => void Native.openUrl({ url: uri })));
    const unicode = new Unicode11Addon();
    this.term.loadAddon(unicode);
    this.term.unicode.activeVersion = '11';
    this.term.onData((data) => this.input(data));
    this.term.onBinary((data) => this.send(data));
    this.observer = new ResizeObserver(() => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.syncSize(), 60);
    });
    this.observer.observe(this.element);
    this.installTouch();
  }

  private opened = false;

  // xterm measures its font when opened, so it is opened once the element is in the page.
  attach(host: HTMLElement) {
    if (this.element.parentElement !== host) host.appendChild(this.element);
    if (this.opened) return;
    this.opened = true;
    this.term.open(this.element);
    const textarea = this.term.textarea;
    if (textarea) {
      // Plain input: no autocorrect, capitals or suggestions from the phone keyboard.
      textarea.setAttribute('autocapitalize', 'off');
      textarea.setAttribute('autocomplete', 'off');
      textarea.setAttribute('autocorrect', 'off');
      textarea.setAttribute('spellcheck', 'false');
      textarea.setAttribute('enterkeyhint', 'send');
    }
    this.changed();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }

  private setState(state: TerminalState, message = '') {
    this.state = state;
    this.message = message;
    this.changed();
  }

  setOptions(patch: Partial<TerminalOptions>) {
    if (patch.fontSize) this.term.options.fontSize = patch.fontSize;
    if (patch.fontFamily) this.term.options.fontFamily = patch.fontFamily;
    if (patch.theme) this.term.options.theme = patch.theme;
    this.lastSize = '';
    this.syncSize();
  }

  // Starts the shell once; called again after a lost connection to re-attach the tmux session.
  async start(force = false) {
    if (!deps) return;
    if (force) this.retries = 0;
    if (this.started && !force && this.state !== 'lost' && this.state !== 'error') return;
    this.started = true;
    window.clearTimeout(this.retryTimer);
    const server = deps.getServer(this.session.serverId);
    if (!server) {
      this.setState('error', 'Der V-Server dieses Terminals wurde geloescht.');
      return;
    }
    this.setState('connecting');
    const generation = ++this.generation;
    if (this.channelId) byChannel.delete(this.channelId);
    this.channelId = `${this.session.id}.${generation}`;
    byChannel.set(this.channelId, this);
    this.fitNow();
    try {
      const command = buildRemoteSessionCommand({
        tmuxName: this.session.tmuxName,
        agyAccountId: this.session.agyAccountId,
        startCommand: this.session.command || undefined,
        cwd: this.session.cwd || server.defaultPath || undefined,
      });
      const channelId = this.channelId;
      await deps.withServer(server, () =>
        Native.openShell({ server: nativeServer(server), channelId, command, cols: this.term.cols, rows: this.term.rows }),
      );
      if (generation !== this.generation) return;
      this.retries = 0;
      this.setState('online');
      this.lastSize = '';
      this.syncSize();
    } catch (error) {
      if (generation !== this.generation) return;
      if (errorCode(error) === 'NETWORK' || errorCode(error) === 'SSH') {
        this.setState('lost', errorMessage(error));
        this.scheduleRetry();
      } else {
        this.setState('error', errorCode(error) === 'CANCELED' ? 'Anmeldung abgebrochen.' : errorMessage(error));
      }
    }
  }

  private scheduleRetry() {
    window.clearTimeout(this.retryTimer);
    // A few automatic attempts; after that the overlay offers a manual reconnect.
    if (document.visibilityState !== 'visible' || this.retries >= 5) return;
    this.retries += 1;
    this.retryTimer = window.setTimeout(() => {
      if (this.state === 'lost') void this.start();
    }, 4000);
  }

  receive(channelId: string, data: string) {
    if (channelId !== this.channelId) return;
    this.term.write(data);
    deps?.onOutput?.(this.session, data);
  }

  exited(channelId: string, code: number, lost: boolean) {
    if (channelId !== this.channelId) return;
    byChannel.delete(channelId);
    if (lost) {
      this.term.write('\r\n\x1b[33m[Verbindung getrennt – verbinde neu …]\x1b[0m\r\n');
      this.setState('lost', 'Verbindung getrennt.');
      this.scheduleRetry();
    } else {
      this.setState('ended', code > 0 ? `Session beendet (Code ${code}).` : 'Session beendet.');
    }
  }

  private send(data: string) {
    if (this.state !== 'online') return;
    void Native.write({ channelId: this.channelId, data });
  }

  // Typed input, with the sticky Ctrl/Alt keys of the extra-keys bar applied to the next key.
  private input(data: string) {
    let text = data;
    if (this.ctrl && text.length === 1) {
      const code = text.toUpperCase().charCodeAt(0);
      if (code >= 64 && code <= 95) text = String.fromCharCode(code - 64);
      else if (text === ' ') text = '\x00';
      else if (text === '?') text = '\x7f';
      this.ctrl = false;
      this.changed();
    }
    if (this.alt) {
      text = `\x1b${text}`;
      this.alt = false;
      this.changed();
    }
    this.send(text);
  }

  // Keys from the extra-keys bar (already escape sequences).
  key(sequence: string) {
    // Programs in application-cursor mode (vim, less, some CLIs) expect ESC O A instead of ESC [ A.
    if (!this.ctrl && !this.alt && this.term.modes.applicationCursorKeysMode) {
      const plain = /^\x1b\[([ABCD])$/.exec(sequence);
      if (plain) sequence = `\x1bO${plain[1]}`;
    }
    if (this.ctrl || this.alt) {
      // Ctrl/Alt + arrows use the xterm modifier form, e.g. ESC[1;5D for Ctrl+Left.
      const modifier = 1 + (this.alt ? 2 : 0) + (this.ctrl ? 4 : 0);
      const arrow = /^\x1b\[([ABCDHF])$/.exec(sequence);
      if (arrow) sequence = `\x1b[1;${modifier}${arrow[1]}`;
      else if (this.alt) sequence = `\x1b${sequence}`;
      this.ctrl = false;
      this.alt = false;
      this.changed();
    }
    this.send(sequence);
  }

  toggleModifier(which: 'ctrl' | 'alt') {
    this[which] = !this[which];
    this.changed();
  }

  // Sends a whole prompt (composer); pastes as one block, Enter submits.
  sendText(text: string, submit: boolean) {
    if (!text) {
      if (submit) this.send('\r');
      return;
    }
    if (this.term.modes.bracketedPasteMode) this.send(`\x1b[200~${text.replace(/\r?\n/g, '\r')}\x1b[201~`);
    else this.send(text.replace(/\r?\n/g, '\r'));
    if (submit) window.setTimeout(() => this.send('\r'), 60);
  }

  paste(text: string) {
    this.term.paste(text);
  }

  focus() {
    this.term.focus();
  }

  blur() {
    this.term.blur();
  }

  // Text of the buffer (scrollback + screen) for the copy sheet.
  bufferText(maxLines = 2000) {
    const buffer = this.term.buffer.active;
    const lines: string[] = [];
    const start = Math.max(0, buffer.length - maxLines);
    for (let index = start; index < buffer.length; index += 1) {
      const line = buffer.getLine(index);
      if (!line) continue;
      const text = line.translateToString(true);
      if (line.isWrapped && lines.length) lines[lines.length - 1] += text;
      else lines.push(text);
    }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.join('\n');
  }

  private fitNow() {
    if (this.element.clientWidth < 40 || this.element.clientHeight < 40) return;
    try {
      this.fit.fit();
    } catch {
      // Not attached yet.
    }
  }

  // Fits xterm to its box and tells the server; skipped while hidden so the last real size stays.
  syncSize() {
    if (this.element.clientWidth < 40 || this.element.clientHeight < 40) return;
    this.fitNow();
    const size = `${this.term.cols}x${this.term.rows}`;
    if (size === this.lastSize || this.state !== 'online') return;
    this.lastSize = size;
    void Native.resize({ channelId: this.channelId, cols: this.term.cols, rows: this.term.rows });
  }

  // One-finger swipe scrolls (tmux history via mouse wheel), two-finger pinch zooms the font.
  private installTouch() {
    let lastY = 0;
    let accumulated = 0;
    let pinchStart = 0;
    let fontStart = 0;
    let moved = false;
    const lineHeight = () => Math.max(8, (this.element.clientHeight || 300) / Math.max(1, this.term.rows));
    this.element.addEventListener('touchstart', (event) => {
      moved = false;
      if (event.touches.length === 2) {
        pinchStart = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
        fontStart = this.term.options.fontSize || 13;
      } else if (event.touches.length === 1) {
        lastY = event.touches[0].clientY;
        accumulated = 0;
      }
    }, { passive: true });
    this.element.addEventListener('touchmove', (event) => {
      if (event.touches.length === 2 && pinchStart) {
        const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
        const size = Math.round(Math.min(26, Math.max(8, fontStart * (distance / pinchStart))));
        if (size !== this.term.options.fontSize) {
          this.term.options.fontSize = size;
          this.syncSize();
          this.onZoom?.(size);
        }
        event.preventDefault();
        return;
      }
      if (event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      accumulated += lastY - y;
      lastY = y;
      const step = lineHeight();
      const lines = Math.trunc(accumulated / step);
      if (!lines) return;
      accumulated -= lines * step;
      moved = true;
      this.scrollBy(lines);
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false, capture: true });
    this.element.addEventListener('touchend', (event) => {
      if (event.touches.length === 0) pinchStart = 0;
      if (moved) event.preventDefault();
    }, { capture: true });
  }

  onZoom: ((size: number) => void) | null = null;

  private scrollBy(lines: number) {
    const mouse = this.term.modes.mouseTrackingMode;
    if (mouse && mouse !== 'none' && this.state === 'online') {
      // The program (tmux, an agent CLI) handles scrolling itself: send SGR mouse-wheel events.
      const button = lines < 0 ? 64 : 65;
      const col = Math.max(1, Math.floor(this.term.cols / 2));
      const row = Math.max(1, Math.floor(this.term.rows / 2));
      const count = Math.min(10, Math.abs(lines));
      this.send(`\x1b[<${button};${col};${row}M`.repeat(count));
    } else if (this.term.buffer.active.type === 'normal') {
      this.term.scrollLines(lines);
    } else if (this.state === 'online') {
      this.send((lines < 0 ? '\x1b[A' : '\x1b[B').repeat(Math.min(10, Math.abs(lines))));
    }
  }

  async close(killRemote: boolean) {
    window.clearTimeout(this.retryTimer);
    const channelId = this.channelId;
    this.generation += 1;
    byChannel.delete(channelId);
    if (channelId) await Native.closeShell({ channelId }).catch(() => {});
    if (killRemote && deps) {
      const server = deps.getServer(this.session.serverId);
      if (server) {
        await deps.withServer(server, () =>
          Native.exec({ server: nativeServer(server), command: `tmux kill-session -t '=${this.session.tmuxName}' 2>/dev/null || true`, timeoutMs: 15000 }),
        ).catch(() => {});
      }
    }
  }

  dispose() {
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.resizeTimer);
    this.observer?.disconnect();
    byChannel.delete(this.channelId);
    this.term.dispose();
    this.listeners.clear();
  }
}
