import { useEffect, useState } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { tr } from '../i18n';
import { errorMessage } from './native';
import { useStore } from './store';
import { Button, Sheet } from './ui';
import { checkForUpdate, installUpdate, markChecked, shouldAutoCheck, UPDATE_EVENT, type UpdateInfo } from './update';

function formatSize(bytes: number) {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

// One update layer for the whole app: silent check on start, plus a manual check from Settings.
export default function UpdateLayer() {
  const { toast } = useStore();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const check = async (manual: boolean) => {
    setChecking(true);
    setError('');
    if (manual) setOpen(true);
    try {
      const next = await checkForUpdate();
      markChecked();
      if (next) {
        setInfo(next);
        setOpen(true);
      } else if (manual) {
        setOpen(false);
        toast(tr('FancyCode ist aktuell ({version}).', { version: __APP_VERSION__ }), 'success');
      }
    } catch (err) {
      const message = errorMessage(err);
      if (manual) {
        setError(message);
        setOpen(true);
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const listener = () => void check(true);
    window.addEventListener(UPDATE_EVENT, listener);
    if (shouldAutoCheck()) {
      const timer = window.setTimeout(() => void check(false), 4000);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener(UPDATE_EVENT, listener);
      };
    }
    return () => window.removeEventListener(UPDATE_EVENT, listener);
    // Runs once per app start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async () => {
    if (!info) return;
    setInstalling(true);
    setError('');
    try {
      await installUpdate(info);
      setOpen(false);
      toast(tr('Android-Installer geöffnet. Bestätige dort das Update.'), 'info');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setInstalling(false);
    }
  };

  if (!open) return null;
  return (
    <Sheet
      title={info ? tr('Update {version}', { version: info.version }) : tr('Updates')}
      onClose={() => setOpen(false)}
      footer={
        info ? (
          <>
            <Button className="flex-1" onClick={() => setOpen(false)}>{tr('Später')}</Button>
            <Button className="flex-[2]" variant="primary" busy={installing} icon={<Download className="h-4 w-4" />} onClick={() => void install()}>
              {tr('Installieren')}
            </Button>
          </>
        ) : (
          <Button className="w-full" onClick={() => setOpen(false)}>{tr('Schliessen')}</Button>
        )
      }
    >
      {checking ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[0.9rem] cf-muted">
          <RefreshCw className="h-4 w-4 animate-spin" /> {tr('Suche nach Updates...')}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[0.85rem] text-red-300">{error}</div>
      ) : info ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[0.82rem] cf-muted">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            {tr('Aktuell {current}. Das Update wird geprüft und direkt installiert.', { current: __APP_VERSION__ })}
          </div>
          {info.notes && (
            <div className="cf-glass cf-card max-h-64 overflow-y-auto whitespace-pre-line p-3 text-[0.82rem] leading-relaxed">
              {info.notes.slice(0, 4000)}
            </div>
          )}
          {info.asset && (
            <div className="cf-muted text-[0.78rem]">
              {info.asset.name}{info.asset.size ? ` · ${formatSize(info.asset.size)}` : ''}
            </div>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
