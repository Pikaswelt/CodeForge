import { tr, locale } from '../../i18n';
import { useRef, useState } from 'react';
import { FileUp, MonitorSmartphone, ShieldAlert } from 'lucide-react';
import { Native, errorMessage } from '../native';
import { parseExport, type MobileExport } from '../exportFormat';
import { newId, useStore } from '../store';
import type { MobileServer } from '../types';
import { Button, Sheet, Toggle } from '../ui';

export default function ImportSheet({ onClose }: { onClose: () => void }) {
  const { servers, saveServer, harnesses, setHarnesses, agyAccounts, setAgyAccounts, setCustomThemes, updateSettings, apiProviders, setApiProviders, toast } = useStore();
  const [data, setData] = useState<MobileExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [withSettings, setWithSettings] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      setData(parseExport(await file.text()));
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  const run = async () => {
    if (!data) return;
    setBusy(true);
    let imported = 0;
    try {
      for (const item of data.servers) {
        const existing = servers.find((server) => server.host === item.host && server.user === item.user && server.port === (item.port || 22));
        const id = existing?.id || newId();
        const server: MobileServer = {
          ...(existing || {}),
          id,
          name: item.name || item.host,
          host: item.host,
          port: item.port || 22,
          user: item.user || 'root',
          auth: item.privateKey ? 'key' : existing?.auth || 'password',
        };
        if (item.privateKey) {
          const keyId = `k-${id}`.toLowerCase();
          const result = await Native.saveKey({ keyId, privateKey: item.privateKey });
          server.keyId = keyId;
          server.keyName = item.keyName || tr("Vom PC übernommen");
          server.keyEncrypted = result.encrypted;
          server.publicKey = result.publicKey || undefined;
        }
        saveServer(server);
        imported += 1;
      }
      if (withSettings) {
        if (data.harnesses?.length) {
          const known = new Set(harnesses.map((item) => item.id));
          setHarnesses([...harnesses, ...data.harnesses.filter((item) => !known.has(item.id))]);
        }
        if (data.agyAccounts?.length) {
          const known = new Set(agyAccounts.map((item) => item.id));
          setAgyAccounts([...agyAccounts, ...data.agyAccounts.filter((item) => !known.has(item.id))].slice(0, 6));
        }
        if (data.customThemes?.length) {
          setCustomThemes((current) => {
            const known = new Set(current.map((item) => item.id));
            return [...current, ...data.customThemes!.filter((item) => !known.has(item.id))];
          });
        }
        if (data.theme) updateSettings({ themeId: data.theme });
        if (data.terminal) {
          updateSettings({
            prefixSuffixEnabled: Boolean(data.terminal.prefixSuffixEnabled),
            prefix: data.terminal.prefix || '',
            suffix: data.terminal.suffix || '',
            triggerWords: data.terminal.triggerWords || '',
          });
        }
        if (data.apiProviders?.length) {
          const known = new Set(apiProviders.map((item) => item.id));
          setApiProviders([...apiProviders, ...data.apiProviders.filter((item) => !known.has(item.id))]);
        }
      }
      toast(tr("{count} V-Server übernommen. Lösche die Exportdatei jetzt vom Handy.", { count: imported }), 'success');
      onClose();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const keys = data?.servers.filter((item) => item.privateKey).length || 0;

  return (
    <Sheet
      title={tr("Vom PC übernehmen")}
      onClose={onClose}
      footer={data ? <Button variant="primary" className="flex-1" busy={busy} onClick={() => void run()}>{tr("Übernehmen")}</Button> : undefined}
    >
      <div className="mb-4 flex gap-3 rounded-2xl bg-cf-hover p-3.5">
        <MonitorSmartphone className="cf-accent-text mt-0.5 h-5 w-5 shrink-0" />
        <ol className="cf-muted list-decimal space-y-1 pl-4 text-[0.84rem] leading-relaxed">
          <li>{tr("Am PC in FancyCode Desktop auf dem Startbildschirm bei den V-Servern")} <b>{tr("Für Android exportieren")}</b> {tr("wählen.")}</li>
          <li>{tr("Die Datei")} <code>codeforge-android.json</code> {tr("aufs Handy kopieren (USB, Cloud, Messenger an dich selbst).")}</li>
          <li>{tr("Hier auswählen und übernehmen.")}</li>
        </ol>
      </div>

      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void pick(event.target.files?.[0])} />
      {!data && (
        <Button className="w-full" variant="primary" icon={<FileUp className="h-4 w-4" />} onClick={() => input.current?.click()}>
          {tr("Exportdatei auswählen")}
        </Button>
      )}

      {data && (
        <div className="cf-glass cf-card overflow-hidden">
          <div className="px-4 py-3">
            <div className="text-[0.95rem] font-semibold">{data.servers.length} {tr("V-Server")}</div>
            <div className="cf-muted text-[0.8rem]">{data.servers.map((item) => item.name || item.host).join(', ')}</div>
            <div className="cf-muted mt-1 text-[0.75rem]">{tr("Exportiert")} {new Date(data.exportedAt).toLocaleString(locale())}</div>
          </div>
          <div className="h-px bg-cf-line" />
          <Toggle
            checked={withSettings}
            onChange={setWithSettings}
            label={tr("Einstellungen übernehmen")}
            description={tr("Harnesses, {count} Antigravity-Accounts, Themes{providers} und Terminal-Optionen", { count: data.agyAccounts?.length || 0, providers: data.apiProviders?.length ? tr(", API-Provider") : '' })}
          />
        </div>
      )}

      {keys > 0 && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-[0.8rem] leading-relaxed text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {tr("Die Datei enthält")} {keys} {tr("privaten SSH-Key")}{keys > 1 ? 's' : ''}{tr(". Die App speichert sie geschützt in ihrem eigenen Speicher. Lösche die Exportdatei danach aus Downloads, Cloud und Chats.")}
        </div>
      )}
    </Sheet>
  );
}
