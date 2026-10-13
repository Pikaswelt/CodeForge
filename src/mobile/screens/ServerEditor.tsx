import { useRef, useState } from 'react';
import { Check, Copy, FileKey2, KeyRound, ShieldCheck, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Native, errorCode, errorMessage } from '../native';
import { installPublicKey, setSecret } from '../remote';
import { newId, useStore } from '../store';
import type { MobileServer } from '../types';
import { Button, Field, Segmented, Sheet, cx } from '../ui';

type KeySource = 'keep' | 'file' | 'paste' | 'generate';

export default function ServerEditor({ server, onClose }: { server?: MobileServer; onClose: () => void }) {
  const { saveServer, removeServer, connect, toast, confirm, prompt } = useStore();
  const [id] = useState(() => server?.id || newId());
  const [name, setName] = useState(server?.name || '');
  const [host, setHost] = useState(server?.host || '');
  const [port, setPort] = useState(String(server?.port || 22));
  const [user, setUser] = useState(server?.user || 'root');
  const [defaultPath, setDefaultPath] = useState(server?.defaultPath || '');
  const [auth, setAuth] = useState<MobileServer['auth']>(server?.auth || 'key');
  const [keySource, setKeySource] = useState<KeySource>(server?.keyId ? 'keep' : 'generate');
  const [keyText, setKeyText] = useState('');
  const [keyName, setKeyName] = useState(server?.keyName || '');
  const [publicKey, setPublicKey] = useState(server?.publicKey || '');
  const [keyEncrypted, setKeyEncrypted] = useState(Boolean(server?.keyEncrypted));
  const [keyReady, setKeyReady] = useState(Boolean(server?.keyId));
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const keyId = `k-${id}`.toLowerCase();

  const portNumber = Number(port);
  const valid = Boolean(host.trim() && user.trim() && Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536 && (auth === 'password' || keyReady));

  const draft = (): MobileServer => ({
    id,
    name: name.trim() || host.trim(),
    host: host.trim(),
    port: portNumber || 22,
    user: user.trim(),
    auth,
    keyId: auth === 'key' && keyReady ? keyId : undefined,
    keyName: auth === 'key' ? keyName : undefined,
    keyEncrypted: auth === 'key' ? keyEncrypted : undefined,
    publicKey: auth === 'key' ? publicKey : undefined,
    defaultPath: defaultPath.trim() || undefined,
    lastConnectedAt: server?.lastConnectedAt,
    fingerprint: server?.host === host.trim() ? server?.fingerprint : undefined,
  });

  const storeKey = async (text: string, label: string) => {
    setBusy('key');
    try {
      const result = await Native.saveKey({ keyId, privateKey: text });
      setKeyReady(true);
      setKeyEncrypted(result.encrypted);
      setPublicKey(result.publicKey || '');
      setKeyName(label);
      setKeyText('');
      toast(result.encrypted ? 'Key gespeichert. Er ist mit einer Passphrase geschützt.' : 'Key gespeichert.', 'success');
    } catch (error) {
      setKeyReady(false);
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 64 * 1024) {
      toast('Die Datei ist zu groß für einen SSH-Key.', 'error');
      return;
    }
    await storeKey(await file.text(), file.name);
  };

  const generate = async () => {
    if (keyReady && !(await confirm({ title: 'Neuen Key erzeugen?', message: 'Der bisher gespeicherte Key dieses Servers wird ersetzt.', confirmLabel: 'Erzeugen' }))) return;
    setBusy('generate');
    try {
      const result = await Native.generateKey({ keyId, comment: `codeforge-android-${new Date().toISOString().slice(0, 10)}` });
      setKeyReady(true);
      setKeyEncrypted(false);
      setPublicKey(result.publicKey);
      setKeyName('Ed25519 (auf diesem Handy erzeugt)');
      toast('Neuer Key erzeugt. Jetzt auf dem Server eintragen.', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  // Logs in once with the password and adds the phone's public key to authorized_keys.
  const installOnServer = async () => {
    if (!publicKey || !host.trim()) return;
    const password = await prompt({ title: 'Key auf dem Server eintragen', label: `Passwort von ${user.trim() || 'root'}@${host.trim()}`, value: '', confirmLabel: 'Eintragen', secret: true });
    if (!password) return;
    setBusy('install');
    const passwordServer: MobileServer = { ...draft(), id: `${id}-pw`, auth: 'password', keyId: undefined };
    try {
      setSecret(passwordServer.id, password);
      await installPublicKey(passwordServer, publicKey);
      toast('Key ist auf dem Server eingetragen. Ab jetzt ohne Passwort.', 'success');
    } catch (error) {
      toast(errorCode(error) === 'NEED_SECRET' ? 'Passwort falsch oder Passwort-Login auf dem Server deaktiviert.' : errorMessage(error), 'error');
    } finally {
      setSecret(passwordServer.id, '');
      void Native.disconnect({ id: passwordServer.id }).catch(() => {});
      setBusy(null);
    }
  };

  const copyPublicKey = async () => {
    await Native.copyText({ text: publicKey });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const testAndSave = async () => {
    const next = draft();
    saveServer(next);
    setBusy('test');
    const ok = await connect(next);
    setBusy(null);
    if (ok) {
      toast(`Verbunden mit ${next.name}.`, 'success');
      onClose();
    }
  };

  const remove = async () => {
    if (!server) return;
    const ok = await confirm({ title: 'V-Server entfernen?', message: `${server.name} und sein Key werden von diesem Handy gelöscht. Auf dem Server selbst ändert sich nichts.`, confirmLabel: 'Entfernen', danger: true });
    if (!ok) return;
    await removeServer(server.id);
    onClose();
  };

  return (
    <Sheet
      title={server ? 'V-Server bearbeiten' : 'V-Server hinzufügen'}
      onClose={onClose}
      full
      footer={
        <>
          <Button className="flex-1" disabled={!valid || Boolean(busy)} onClick={() => { saveServer(draft()); onClose(); }}>Speichern</Button>
          <Button className="flex-[1.4]" variant="primary" disabled={!valid} busy={busy === 'test'} onClick={() => void testAndSave()}>
            Testen & speichern
          </Button>
        </>
      }
    >
      <Field label="Name">
        <input className="cf-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="z.B. Crazy Mind V-Server" />
      </Field>
      <div className="flex gap-2">
        <div className="flex-[3]">
          <Field label="Adresse (IP oder Domain)">
            <input className="cf-input" value={host} onChange={(event) => setHost(event.target.value)} placeholder="203.0.113.10" autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="url" />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Port">
            <input className="cf-input" value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, ''))} inputMode="numeric" />
          </Field>
        </div>
      </div>
      <Field label="Benutzer">
        <input className="cf-input" value={user} onChange={(event) => setUser(event.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </Field>
      <Field label="Startordner (optional)" hint="Neue Terminals und der Dateibrowser starten hier, z.B. /root/projekte.">
        <input className="cf-input" value={defaultPath} onChange={(event) => setDefaultPath(event.target.value)} placeholder="Home-Verzeichnis" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </Field>

      <div className="mb-2 mt-1 px-0.5 text-[0.8rem] font-medium cf-muted">Anmeldung</div>
      <Segmented<MobileServer['auth']> value={auth} onChange={setAuth} options={[{ value: 'key', label: 'SSH-Key' }, { value: 'password', label: 'Passwort' }]} />

      {auth === 'password' && (
        <p className="cf-muted mt-3 text-[0.82rem] leading-relaxed">
          Das Passwort wird beim Verbinden abgefragt und nur bis zum Schließen der App im Speicher gehalten. Sicherer und bequemer ist ein SSH-Key.
        </p>
      )}

      {auth === 'key' && (
        <div className="mt-3">
          {keyReady && (
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.9rem] font-medium">{keyName || 'SSH-Key gespeichert'}</div>
                <div className="cf-muted text-[0.75rem]">{keyEncrypted ? 'Mit Passphrase geschützt' : 'Liegt nur in der App auf diesem Handy'}</div>
              </div>
            </div>
          )}
          <div className="mb-3 grid grid-cols-3 gap-2">
            {([
              { value: 'generate', label: 'Neu erzeugen', icon: Wand2 },
              { value: 'file', label: 'Key-Datei', icon: FileKey2 },
              { value: 'paste', label: 'Einfügen', icon: KeyRound },
            ] as const).map((option) => (
              <button
                key={option.value}
                onClick={() => setKeySource(option.value)}
                className={cx('cf-press flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-[0.78rem] font-medium', keySource === option.value ? 'border-transparent cf-accent-bg' : 'border-cf-line bg-cf-hover')}
              >
                <option.icon className="h-5 w-5" />
                {option.label}
              </button>
            ))}
          </div>

          {keySource === 'generate' && (
            <div className="rounded-2xl border border-cf-line bg-cf-hover p-3.5">
              <p className="cf-muted mb-3 text-[0.82rem] leading-relaxed">
                Erzeugt einen eigenen Ed25519-Key für dieses Handy. Der private Teil verlässt das Gerät nie. Den öffentlichen Teil trägst du einmal auf dem Server ein, per Passwort direkt aus der App oder per Hand in <code>~/.ssh/authorized_keys</code>.
              </p>
              <Button className="w-full" icon={<Sparkles className="h-4 w-4" />} busy={busy === 'generate'} onClick={() => void generate()}>
                {publicKey ? 'Neuen Key erzeugen' : 'Key erzeugen'}
              </Button>
            </div>
          )}

          {keySource === 'file' && (
            <div className="rounded-2xl border border-cf-line bg-cf-hover p-3.5">
              <p className="cf-muted mb-3 text-[0.82rem] leading-relaxed">
                Wähle die private Key-Datei, die auch CodeForge am PC nutzt (z.B. <code>id_ed25519</code>, nicht die .pub-Datei). Kopiere sie dafür vorher aufs Handy.
              </p>
              <input ref={fileInput} type="file" className="hidden" onChange={(event) => void pickFile(event.target.files?.[0])} />
              <Button className="w-full" icon={<FileKey2 className="h-4 w-4" />} busy={busy === 'key'} onClick={() => fileInput.current?.click()}>
                Datei auswählen
              </Button>
            </div>
          )}

          {keySource === 'paste' && (
            <div className="rounded-2xl border border-cf-line bg-cf-hover p-3.5">
              <textarea
                className="cf-input mb-3 h-36 resize-none font-mono text-[0.75rem]"
                value={keyText}
                onChange={(event) => setKeyText(event.target.value)}
                placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----'}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <Button className="w-full" variant="primary" disabled={!keyText.trim()} busy={busy === 'key'} onClick={() => void storeKey(keyText, 'Eingefügter Key')}>
                Key übernehmen
              </Button>
            </div>
          )}

          {publicKey && (
            <div className="mt-3 rounded-2xl border border-cf-line p-3.5">
              <div className="mb-2 text-[0.8rem] font-semibold">Öffentlicher Key</div>
              <div className="cf-selectable mb-3 max-h-24 overflow-auto break-all rounded-xl bg-black/30 p-2.5 font-mono text-[0.7rem] leading-relaxed">{publicKey}</div>
              <div className="flex gap-2">
                <Button className="flex-1" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => void copyPublicKey()}>
                  {copied ? 'Kopiert' : 'Kopieren'}
                </Button>
                <Button className="flex-[1.6]" variant="primary" disabled={!host.trim() || !user.trim()} busy={busy === 'install'} onClick={() => void installOnServer()}>
                  Per Passwort eintragen
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {server?.fingerprint && server.fingerprint !== 'SHA256:' && (
        <div className="cf-muted mt-4 break-all px-0.5 text-[0.72rem]">Server-Fingerprint: {server.fingerprint}</div>
      )}

      {server && (
        <div className="mt-5 flex flex-col gap-2">
          {server.fingerprint && (
            <Button
              onClick={async () => {
                const ok = await confirm({ title: 'Server-Schlüssel vergessen?', message: 'Nur nötig, wenn der Server neu installiert wurde. Beim nächsten Verbinden wird der neue Schlüssel gespeichert.', confirmLabel: 'Vergessen' });
                if (!ok) return;
                await Native.forgetHost({ host: server.host, port: server.port });
                saveServer({ ...server, fingerprint: undefined });
                toast('Server-Schlüssel vergessen.', 'success');
              }}
            >
              Server-Schlüssel zurücksetzen
            </Button>
          )}
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
            V-Server entfernen
          </Button>
        </div>
      )}
    </Sheet>
  );
}
