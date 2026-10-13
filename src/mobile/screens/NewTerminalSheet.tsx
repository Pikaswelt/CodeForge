import { useState } from 'react';
import { Check, Server } from 'lucide-react';
import { harnessIcon } from '../../harnessIcons';
import { useStore } from '../store';
import { Button, Field, Section, Sheet, cx } from '../ui';

export default function NewTerminalSheet({ onClose, serverId: presetServer, cwd: presetCwd }: { onClose: () => void; serverId?: string; cwd?: string }) {
  const { servers, harnesses, agyAccounts, openTerminal } = useStore();
  const [serverId, setServerId] = useState(presetServer || servers[0]?.id || '');
  const [harnessId, setHarnessId] = useState(harnesses[0]?.id || '');
  const [accountId, setAccountId] = useState('');
  const server = servers.find((item) => item.id === serverId);
  const [cwd, setCwd] = useState(presetCwd ?? server?.defaultPath ?? '');
  const harness = harnesses.find((item) => item.id === harnessId);
  const isAgy = /(^|\s|\/)agy(\s|$)/.test(harness?.command || '');

  const start = () => {
    if (!server || !harness) return;
    const account = isAgy ? agyAccounts.find((item) => item.id === accountId) : undefined;
    openTerminal({
      serverId: server.id,
      title: account ? `Antigravity · ${account.name}` : harness.name,
      icon: harness.icon,
      command: harness.command || undefined,
      agyAccountId: account?.id,
      cwd: cwd.trim() || undefined,
    });
    onClose();
  };

  return (
    <Sheet
      title="Neues Terminal"
      onClose={onClose}
      footer={<Button variant="primary" className="flex-1" disabled={!server || !harness} onClick={start}>Starten</Button>}
    >
      {servers.length > 1 && (
        <Section title="V-Server">
          <div className="flex flex-col gap-2">
            {servers.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setServerId(item.id);
                  if (presetCwd === undefined) setCwd(item.defaultPath || '');
                }}
                className={cx('cf-press flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left', serverId === item.id ? 'border-[var(--cf-accent)] bg-cf-hover' : 'border-cf-line')}
              >
                <Server className="cf-accent-text h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.92rem] font-medium">{item.name}</span>
                  <span className="cf-muted block truncate text-[0.75rem]">{item.user}@{item.host}</span>
                </span>
                {serverId === item.id && <Check className="cf-accent-text h-4 w-4" />}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Programm">
        <div className="grid grid-cols-2 gap-2">
          {harnesses.map((item) => {
            const Icon = harnessIcon(item.icon);
            const selected = item.id === harnessId;
            return (
              <button
                key={item.id}
                onClick={() => setHarnessId(item.id)}
                className={cx('cf-press flex items-center gap-2.5 rounded-2xl border px-3 py-3 text-left', selected ? 'border-transparent cf-accent-bg' : 'border-cf-line bg-cf-hover')}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-[0.86rem] font-semibold">{item.name}</span>
                  <span className="block truncate text-[0.7rem] opacity-70">{item.command || 'bash'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {isAgy && agyAccounts.length > 0 && (
        <Section title="Antigravity-Account">
          <div className="flex flex-wrap gap-2">
            {[{ id: '', name: 'Standard-Login' }, ...agyAccounts].map((item) => (
              <button
                key={item.id || 'default'}
                onClick={() => setAccountId(item.id)}
                className={cx('cf-press rounded-full border px-3.5 py-2 text-[0.82rem] font-medium', accountId === item.id ? 'border-transparent cf-accent-bg' : 'border-cf-line bg-cf-hover')}
              >
                {item.name}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Field label="Ordner auf dem Server" hint="Leer lassen für das Home-Verzeichnis. Eine laufende Session behält ihren Ordner.">
        <input className="cf-input" value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="~" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </Field>
    </Sheet>
  );
}
