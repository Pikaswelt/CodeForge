import { useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  Cloud,
  Monitor,
  Loader2,
  Network,
  Server,
  X,
  ArrowRight,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import type { MobileConnectionConfig, MobileConnectionType } from '../types';

export default function MobileConnectModal({ onClose }: { onClose: () => void }) {
  const { mobileConnectionConfig, setMobileConnectionConfig } = useAppContext();
  const [step, setStep] = useState<'select' | 'vps' | 'ssh'>(
    mobileConnectionConfig?.type ? (mobileConnectionConfig.type as 'vps' | 'ssh') : 'select',
  );
  const [connectionType, setConnectionType] = useState<MobileConnectionType | null>(
    mobileConnectionConfig?.type || null,
  );
  const [vpsUrl, setVpsUrl] = useState(mobileConnectionConfig?.vpsUrl || '');
  const [vpsToken, setVpsToken] = useState(mobileConnectionConfig?.vpsToken || '');
  const [vpsProjectPath, setVpsProjectPath] = useState(
    mobileConnectionConfig?.vpsProjectPath || '/root/codeforge-project',
  );
  const [sshHost, setSshHost] = useState(mobileConnectionConfig?.sshHost || '');
  const [sshPort, setSshPort] = useState(mobileConnectionConfig?.sshPort || 22);
  const [sshUser, setSshUser] = useState(mobileConnectionConfig?.sshUser || 'root');
  const [sshKey, setSshKey] = useState(mobileConnectionConfig?.sshKey || '');
  const [sshProjectPath, setSshProjectPath] = useState(
    mobileConnectionConfig?.sshProjectPath || '~/codeforge-project',
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const testVpsConnection = async () => {
    if (!vpsUrl.trim()) {
      setTestResult({ ok: false, message: 'Bitte gib die Server-URL ein.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const cleanUrl = vpsUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/health`, {
        headers: { Authorization: `Bearer ${vpsToken}` },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({
          ok: true,
          message: `Verbunden! Server: ${data.name}, Provider: ${Object.keys(data.providers || {}).join(', ')}`,
        });
      } else {
        setTestResult({ ok: false, message: data.error || 'Server nicht erreichbar.' });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Verbindung fehlgeschlagen.',
      });
    } finally {
      setTesting(false);
    }
  };

  const saveVpsConfig = () => {
    if (!vpsUrl.trim()) return;
    const config: MobileConnectionConfig = {
      type: 'vps',
      vpsUrl: vpsUrl.trim().replace(/\/+$/, ''),
      vpsToken: vpsToken.trim(),
      vpsProjectPath: vpsProjectPath.trim() || '/root/codeforge-project',
      connected: true,
      connectedAt: Date.now(),
    };
    setMobileConnectionConfig(config);
    onClose();
  };

  const saveSshConfig = () => {
    if (!sshHost.trim()) return;
    const config: MobileConnectionConfig = {
      type: 'ssh',
      sshHost: sshHost.trim(),
      sshPort: sshPort,
      sshUser: sshUser.trim() || 'root',
      sshKey: sshKey.trim(),
      sshProjectPath: sshProjectPath.trim() || '~/codeforge-project',
      connected: true,
      connectedAt: Date.now(),
    };
    setMobileConnectionConfig(config);
    onClose();
  };

  const disconnect = () => {
    setMobileConnectionConfig({
      type: connectionType || 'vps',
      connected: false,
    });
    setConnectionType(null);
    setStep('select');
    setTestResult(null);
  };

  const isConnected = mobileConnectionConfig?.connected;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[120] flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="w-full max-w-lg bg-[#141214] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <Network className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg text-white font-semibold">Mobile Verbindung</h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                {isConnected
                  ? 'Mit Server verbunden'
                  : 'Verbinde mit einem Rechner für Terminals & KI-Chat'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isConnected && mobileConnectionConfig && (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-emerald-200 font-medium">
                    Verbunden mit{' '}
                    {mobileConnectionConfig.type === 'vps'
                      ? 'Debian VPS'
                      : 'Windows PC (SSH)'}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {mobileConnectionConfig.type === 'vps'
                      ? mobileConnectionConfig.vpsUrl
                      : `${mobileConnectionConfig.sshUser}@${mobileConnectionConfig.sshHost}:${mobileConnectionConfig.sshPort}`}
                  </div>
                </div>
              </div>
              <button
                onClick={disconnect}
                className="shrink-0 text-[11px] text-red-400 hover:text-red-300 border border-red-400/20 px-2.5 py-1 rounded-lg"
              >
                Trennen
              </button>
            </div>
          </div>
        )}

        {!isConnected && step === 'select' && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400 leading-6">
              Waehle einen Verbindungstyp. Dein Handy verbindet sich dann mit einem Rechner,
              der die KI-CLIs und Terminals bereitstellt.
            </p>

            <button
              onClick={() => { setConnectionType('vps'); setStep('vps'); }}
              className="w-full p-5 rounded-xl border border-white/10 bg-white/[0.02] text-left hover:border-amber-400/30 hover:bg-amber-400/5 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-sky-400/10 border border-sky-400/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Server className="w-6 h-6 text-sky-300" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base text-white font-medium">Debian VPS</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300 border border-emerald-400/20">
                      Einfach
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 mt-1.5 leading-5">
                    Node.js HTTP API Server. Einmalig mit{' '}
                    <code className="text-[11px] bg-white/5 px-1 rounded">server-setup-codeforge.sh</code>{' '}
                    einrichten, dann nur URL + Token eingeben.
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-[11px] text-zinc-600">
                    <Terminal className="w-3.5 h-3.5" />
                    CLI: agy + codex auf dem Server
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-zinc-600 shrink-0 mt-1 group-hover:text-amber-300 transition-colors" />
              </div>
            </button>

            <button
              onClick={() => { setConnectionType('ssh'); setStep('ssh'); }}
              className="w-full p-5 rounded-xl border border-white/10 bg-white/[0.02] text-left hover:border-amber-400/30 hover:bg-amber-400/5 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Monitor className="w-6 h-6 text-emerald-300" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base text-white font-medium">Windows PC / Laptop</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">
                      SSH
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 mt-1.5 leading-5">
                    SSH-Verbindung zu deinem Windows-PC oder Laptop. Benoetigt einen SSH-Server
                    (OpenSSH) auf dem Zielrechner.
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-[11px] text-zinc-600">
                    <Terminal className="w-3.5 h-3.5" />
                    CLI: agy + codex auf dem PC
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-zinc-600 shrink-0 mt-1 group-hover:text-amber-300 transition-colors" />
              </div>
            </button>
          </div>
        )}

        {!isConnected && step === 'vps' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setStep('select')} className="text-[11px] text-zinc-500 hover:text-white">
                &larr; Zuruueck
              </button>
              <span className="text-zinc-700">|</span>
              <span className="text-sm text-white font-medium">Debian VPS einrichten</span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-[11px] text-zinc-500 leading-5 mb-3">
                Installiere den Remote-Server auf deinem Debian-VPS mit:
              </p>
              <pre className="text-[11px] font-mono text-zinc-300 bg-black/30 p-3 rounded-lg border border-white/5 overflow-x-auto">
                bash server-setup-codeforge.sh
              </pre>
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">Server-URL *</label>
              <input
                value={vpsUrl}
                onChange={(e) => setVpsUrl(e.target.value)}
                className="input w-full"
                placeholder="z.B. http://88.214.56.241:8787"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">API-Token</label>
              <input
                type="password"
                value={vpsToken}
                onChange={(e) => setVpsToken(e.target.value)}
                className="input w-full"
                placeholder="CODEFORGE_TOKEN vom Server"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">Projektpfad auf Server</label>
              <input
                value={vpsProjectPath}
                onChange={(e) => setVpsProjectPath(e.target.value)}
                className="input w-full"
                placeholder="/root/codeforge-project"
              />
            </div>

            {testResult && (
              <div
                className={`text-[12px] leading-5 p-3 rounded-lg border ${
                  testResult.ok
                    ? 'bg-emerald-400/5 border-emerald-400/20 text-emerald-200'
                    : 'bg-red-400/5 border-red-400/20 text-red-300'
                }`}
              >
                {testResult.ok ? <CheckCircle2 className="w-4 h-4 inline mr-2" /> : <X className="w-4 h-4 inline mr-2" />}
                {testResult.message}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={testVpsConnection}
                disabled={testing || !vpsUrl.trim()}
                className="secondary-button flex-1"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Verbindung testen
              </button>
              <button
                onClick={saveVpsConfig}
                disabled={!vpsUrl.trim()}
                className="primary-button flex-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                Speichern & Verbinden
              </button>
            </div>
          </div>
        )}

        {!isConnected && step === 'ssh' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setStep('select')} className="text-[11px] text-zinc-500 hover:text-white">
                &larr; Zuruueck
              </button>
              <span className="text-zinc-700">|</span>
              <span className="text-sm text-white font-medium">Windows PC (SSH) einrichten</span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-[11px] text-zinc-500 leading-5">
                Stelle sicher, dass auf dem Windows-PC OpenSSH Server installiert ist und
              die CLI (agy/codex/claude) eingerichtet sind.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] text-zinc-400 block mb-1.5">SSH-Host *</label>
                <input
                  value={sshHost}
                  onChange={(e) => setSshHost(e.target.value)}
                  className="input w-full"
                  placeholder="z.B. 192.168.1.100"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1.5">Port</label>
                <input
                  type="number"
                  value={sshPort}
                  onChange={(e) => setSshPort(Number(e.target.value))}
                  className="input w-full"
                  placeholder="22"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">Benutzername</label>
              <input
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                className="input w-full"
                placeholder="root"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">SSH-Key (optional)</label>
              <input
                value={sshKey}
                onChange={(e) => setSshKey(e.target.value)}
                className="input w-full"
                placeholder="z.B. C:\Users\name\.ssh\id_rsa oder Pfad auf dem PC"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">Projektpfad auf Windows</label>
              <input
                value={sshProjectPath}
                onChange={(e) => setSshProjectPath(e.target.value)}
                className="input w-full"
                placeholder="C:\Users\name\codeforge-project"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={saveSshConfig}
                disabled={!sshHost.trim()}
                className="primary-button flex-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                Speichern & Verbinden
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
