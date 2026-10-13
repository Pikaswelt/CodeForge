import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, KeyRound, Loader2, X } from 'lucide-react';
import { useStore } from './store';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'soft' | 'danger'; busy?: boolean; icon?: ReactNode };

export function Button({ variant = 'soft', busy, icon, className, children, disabled, ...props }: ButtonProps) {
  const styles = {
    primary: 'cf-accent-bg font-semibold shadow-lg shadow-black/20',
    soft: 'bg-cf-hover border border-cf-line',
    ghost: 'bg-transparent',
    danger: 'bg-red-500/15 text-red-400 border border-red-500/25',
  }[variant];
  return (
    <button
      {...props}
      disabled={disabled || busy}
      className={cx('cf-press cf-chip inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[0.92rem]', styles, className)}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ className, children, label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...props} aria-label={label} title={label} className={cx('cf-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-cf-hover', className)}>
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin cf-muted', className)} />;
}

export function StatusDot({ state }: { state?: 'idle' | 'connecting' | 'online' | 'error' | 'lost' | 'ended' }) {
  const color = {
    online: 'bg-emerald-400',
    connecting: 'bg-amber-400 cf-pulse-dot',
    lost: 'bg-amber-400 cf-pulse-dot',
    error: 'bg-red-400',
    ended: 'bg-zinc-500',
    idle: 'bg-zinc-500',
  }[state || 'idle'];
  return <span className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', color)} />;
}

export function ScreenHeader({ title, subtitle, actions, leading }: { title: string; subtitle?: string; actions?: ReactNode; leading?: ReactNode }) {
  return (
    <header className="cf-safe-top flex shrink-0 items-center gap-2 px-4 pb-3">
      {leading}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.45rem] font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="cf-muted truncate text-[0.82rem]">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Section({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-5">
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between px-1">
          {title && <h2 className="cf-muted text-[0.75rem] font-semibold uppercase tracking-[0.08em]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('cf-glass cf-card block w-full text-left', onClick && 'cf-press', className)}>
      {children}
    </Tag>
  );
}

export function Row({ icon, title, subtitle, trailing, onClick, danger }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; onClick?: () => void; danger?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left', onClick && 'cf-press active:bg-cf-hover', danger && 'text-red-400')}>
      {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cf-hover">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.95rem] font-medium">{title}</span>
        {subtitle && <span className="cf-muted block truncate text-[0.8rem]">{subtitle}</span>}
      </span>
      {trailing}
    </Tag>
  );
}

export function Divider() {
  return <div className="mx-4 h-px bg-cf-line" />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block px-0.5 text-[0.8rem] font-medium cf-muted">{label}</span>
      {children}
      {hint && <span className="cf-muted mt-1 block px-0.5 text-[0.75rem] leading-snug">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="cf-press flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[0.95rem] font-medium">{label}</span>
        {description && <span className="cf-muted block text-[0.78rem] leading-snug">{description}</span>}
      </span>
      <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'cf-accent-bg' : 'bg-cf-hover border border-cf-line')}>
        <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
      </span>
    </button>
  );
}

export function Slider({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-[0.92rem]">
        <span className="font-medium">{label}</span>
        <span className="cf-muted tabular-nums">{value}{unit}</span>
      </div>
      <input className="cf-range" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-cf-hover p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx('cf-press flex-1 rounded-lg px-3 py-2 text-[0.85rem] font-medium', value === option.value ? 'cf-glass shadow' : 'cf-muted')}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cf-hover cf-accent-text">{icon}</div>
      <h3 className="mb-1 text-lg font-semibold">{title}</h3>
      <p className="cf-muted mb-5 text-[0.9rem] leading-relaxed">{text}</p>
      {action}
    </div>
  );
}

// Bottom sheet: slides up, closes on backdrop tap or the Android back gesture.
export function Sheet({ title, onClose, children, footer, full }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; full?: boolean }) {
  useBackHandler(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" style={{ height: 'var(--cf-app-height)' }}>
      <div className="cf-fade-in absolute inset-0 bg-black/55" onClick={onClose} />
      <div
        className={cx('cf-sheet-enter relative flex flex-col overflow-hidden rounded-t-[26px] border-t border-cf-line shadow-2xl', full ? 'h-[92%]' : 'max-h-[88%]')}
        style={{ background: 'var(--cf-surface)', color: 'var(--cf-text)' }}
      >
        <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-cf-line" />
          <h2 className="flex-1 truncate pt-2 text-[1.1rem] font-semibold">{title}</h2>
          <IconButton label="Schliessen" onClick={onClose} className="mt-1">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="cf-scroll min-h-0 flex-1 px-4 pb-4">{children}</div>
        {footer && <div className="flex shrink-0 gap-2 border-t border-cf-line px-4 pt-3" style={{ paddingBottom: 'calc(var(--sab) + 0.75rem)' }}>{footer}</div>}
        {!footer && <div style={{ height: 'var(--sab)' }} />}
      </div>
    </div>,
    document.body,
  );
}

// Android back gesture: closes the topmost sheet first.
const backStack: (() => void)[] = [];
export function useBackHandler(handler: () => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const entry = () => ref.current();
    backStack.push(entry);
    return () => {
      const index = backStack.lastIndexOf(entry);
      if (index >= 0) backStack.splice(index, 1);
    };
  }, [enabled]);
}

export function handleBack() {
  const top = backStack[backStack.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function Dialogs() {
  const { secretRequest, confirmRequest, promptRequest, closeDialogs } = useStore();
  return (
    <>
      {secretRequest && <SecretDialog key={secretRequest.server.id} />}
      {confirmRequest && (
        <CenterDialog onClose={() => { confirmRequest.resolve(false); closeDialogs(); }}>
          <h3 className="mb-2 text-lg font-semibold">{confirmRequest.title}</h3>
          <p className="cf-muted mb-5 whitespace-pre-line text-[0.92rem] leading-relaxed">{confirmRequest.message}</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => { confirmRequest.resolve(false); closeDialogs(); }}>Abbrechen</Button>
            <Button className="flex-1" variant={confirmRequest.danger ? 'danger' : 'primary'} onClick={() => { confirmRequest.resolve(true); closeDialogs(); }}>
              {confirmRequest.confirmLabel}
            </Button>
          </div>
        </CenterDialog>
      )}
      {promptRequest && <PromptDialog />}
    </>
  );
}

function CenterDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useBackHandler(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5" style={{ height: 'var(--cf-app-height)' }}>
      <div className="cf-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="cf-sheet-enter relative w-full max-w-sm rounded-3xl border border-cf-line p-5 shadow-2xl" style={{ background: 'var(--cf-surface)', color: 'var(--cf-text)' }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function SecretDialog() {
  const { secretRequest, closeDialogs } = useStore();
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  if (!secretRequest) return null;
  const isKey = secretRequest.server.auth === 'key';
  const cancel = () => {
    secretRequest.resolve(null);
    closeDialogs();
  };
  return (
    <CenterDialog onClose={cancel}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-cf-hover cf-accent-text">
        <KeyRound className="h-5 w-5" />
      </div>
      <h3 className="mb-1 text-lg font-semibold">{isKey ? 'Passphrase' : 'Passwort'} für {secretRequest.server.name}</h3>
      <p className="cf-muted mb-4 text-[0.88rem] leading-relaxed">{secretRequest.message}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value) secretRequest.resolve(value);
        }}
      >
        <div className="relative mb-2">
          <input
            autoFocus
            className="cf-input pr-12"
            type={visible ? 'text' : 'password'}
            value={value}
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
            placeholder={isKey ? 'Passphrase des Keys' : `Passwort von ${secretRequest.server.user}`}
          />
          <button type="button" onClick={() => setVisible((v) => !v)} className="cf-muted absolute right-2 top-1/2 -translate-y-1/2 p-2" aria-label="Anzeigen">
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="cf-muted mb-4 text-[0.75rem]">Wird nur im Arbeitsspeicher gehalten, bis die App geschlossen wird.</p>
        <div className="flex gap-2">
          <Button type="button" className="flex-1" onClick={cancel}>Abbrechen</Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!value}>Verbinden</Button>
        </div>
      </form>
    </CenterDialog>
  );
}

function PromptDialog() {
  const { promptRequest, closeDialogs } = useStore();
  const [value, setValue] = useState(promptRequest?.value || '');
  if (!promptRequest) return null;
  const cancel = () => {
    promptRequest.resolve(null);
    closeDialogs();
  };
  return (
    <CenterDialog onClose={cancel}>
      <h3 className="mb-3 text-lg font-semibold">{promptRequest.title}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          promptRequest.resolve(value);
          closeDialogs();
        }}
      >
        <Field label={promptRequest.label}>
          <input autoFocus className="cf-input" type={promptRequest.secret ? 'password' : 'text'} value={value} onChange={(event) => setValue(event.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off" />
        </Field>
        <div className="flex gap-2">
          <Button type="button" className="flex-1" onClick={cancel}>Abbrechen</Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!value.trim()}>{promptRequest.confirmLabel}</Button>
        </div>
      </form>
    </CenterDialog>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 z-[90] flex flex-col items-center gap-2 px-4" style={{ top: 'calc(var(--sat) + 0.75rem)' }}>
      {toasts.map((item) => (
        <div
          key={item.id}
          className={cx(
            'cf-sheet-enter pointer-events-auto max-w-md rounded-2xl border px-4 py-2.5 text-[0.88rem] shadow-xl backdrop-blur-xl',
            item.tone === 'error' && 'border-red-500/30 bg-red-950/85 text-red-100',
            item.tone === 'success' && 'border-emerald-500/30 bg-emerald-950/85 text-emerald-100',
            item.tone === 'info' && 'border-white/10 bg-zinc-900/90 text-zinc-100',
          )}
        >
          {item.text}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function timeAgo(timestamp?: number) {
  if (!timestamp) return '';
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'gerade eben';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'gestern' : `vor ${days} Tagen`;
}
