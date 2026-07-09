import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  Wifi,
  Search,
  BookOpen,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import type { MobileConnectionConfig, MobileConnectionType } from '../types';
import TutorialModal from './TutorialModal';

type DiscoveredServer = {
  ip: string;
  port: number;
  name: string;
  tokenRequired: boolean;
  providers: string[];
};

async function tryDiscover(ip: string, port: number, signal: AbortSignal): Promise<DiscoveredServer | null> {
  try {
    const url = `http://${ip}:${port}/discover`;
    const res = await fetch(url, { signal, cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ok && data.service === 'codeforge-remote') {
      return {
        ip,
        port,
        name: data.name || 'CodeForge Server',
        tokenRequired: data.tokenRequired !== false,
        providers: data.providers || [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

function generateLocalIpRange(): string[] {
  // Common local network ranges
  const ips: string[] = [];
  const ranges = [
    { subnet: '192.168.', ranges: [[0, 1]] },
    { subnet: '10.', ranges: [[0]] },
    { subnet: '172.', ranges: [[16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]] },
  ];

  // Also try common IPs close to the device's own IP
  try {
    // Infer own IP from connection
    const ownIp = window.location.hostname;
    if (ownIp && ownIp !== 'localhost' && ownIp !== '127.0.0.1') {
      const parts = ownIp.split('.');
      if (parts.length === 4) {
        const base = parts.slice(0, 3).join('.');
        ips.push(`${base}.1`);
        ips.push(`${base}.2`);
        ips.push(`${base}.100`);
        ips.push(`${base}.101`);
        ips.push(`${base}.254`);
        // Also try the own IP
        ips.push(ownIp);
      }
    }
  } catch {}

  // Add common gateway IPs
  for (const range of ranges) {
    for (const thirdOctetRange of range.ranges) {
      const start = thirdOctetRange[0];
      const end = thirdOctetRange[1] ?? start;
      for (let i = start; i <= end; i++) {
        ips.push(`${range.subnet}${i}.1`);
        ips.push(`${range.subnet}${i}.2`);
        ips.push(`${range.subnet}${i}.100`);
        ips.push(`${range.subnet}${i}.254`);
      }
    }
  }

  return [...new Set(ips)];
}

export default function MobileConnectModal({ onClose }: { onClose: () => void }) {
  const { mobileConnectionConfig, setMobileConnectionConfig, setMobileMode } = useAppContext();
  const [step, setStep] = useState<'select' | 'lan-scan' | 'vps' | 'ssh'>(
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
  
  // LAN discovery state
  const [discovering, setDiscovering] = useState(false);
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);
  const [discoveryProgress, setDiscoveryProgress] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);

  const testVpsConnection = async () => {
    if (!vpsUrl.trim()) {
      setTestResult({ ok: false, message: 'Bitte gib die Server-URL ein.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const cleanUrl = vpsUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/discover`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({
          ok: true,
          message: `Gefunden! ${data.name}, Provider: ${(data.providers || []).join(', ')}`,
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

  const startLanDiscovery = useCallback(async () => {
    setDiscovering(true);
    setDiscoveredServers([]);
    setDiscoveryProgress('Sammle IP-Adressen...');
    
    const ips = generateLocalIpRange();
    const ports = [8787, 8788, 3000, 8080, 8888];
    const found: DiscoveredServer[] = [];
    const total = ips.length * ports.length;
    let checked = 0;

    // Check in batches to avoid overwhelming the network
    const batchSize = 10;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (ip) => {
          // Try ports in parallel
          const portResults = await Promise.all(
            ports.map((port) => {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 3000);
              return tryDiscover(ip, port, controller.signal).finally(() => clearTimeout(timeout));
            }),
          );
          return portResults.filter(Boolean) as DiscoveredServer[];
        }),
      );
      
      for (const result of results) {
        found.push(...result);
      }
      
      checked += batch.length * ports.length;
      const percent = Math.round((checked / total) * 100);
      setDiscoveryProgress(`Suche... ${percent}% (${found.length > 0 ? `${found.length} gefunden` : ''})`);
      
      // Early exit if we found servers
      if (found.length > 0) {
        setDiscoveredServers(found);
        setDiscovering(false);
        setDiscoveryProgress('');
        return;
      }
    }

    setDiscoveredServers(found);
    setDiscovering(false);
    setDiscoveryProgress(found.length === 0 ? 'Kein Server im lokalen Netzwerk gefunden.' : '');
  }, []);

  const connectToDiscovered = (server: DiscoveredServer) => {
    const url = `http://${server.ip}:${server.port}`;
    if (server.tokenRequired) {
      // Go to VPS config with URL pre-filled
      setVpsUrl(url);
      setConnectionType('vps');
      setStep('vps');
    } else {
      // Connect directly (no token configured – just set up)
      const config: MobileConnectionConfig = {
        type: 'vps',
        vpsUrl: url,
        vpsToken: '',
        vpsProjectPath: '/root/codeforge-project',
        connected: true,
        connectedAt: Date.now(),
      };
      setMobileConnectionConfig(config);
      onClose();
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

  // Connection health check – update lastTestedAt when still alive
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(async () => {
      const config = mobileConnectionConfig;
      if (!config || config.type !== 'vps' || !config.vpsUrl) return;
      try {
        const url = `${config.vpsUrl}/discover`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          setMobileConnectionConfig({ ...config, lastTestedAt: Date.now() });
        } else {
          // Connection lost
          setMobileConnectionConfig({ ...config, connected: false });
        }
      } catch {
        // Connection might be temporarily down – don't disconnect immediately
        // Only disconnect if we've had multiple failures
      }
    }, 15000); // Check every 15 seconds
    return () => clearInterval(interval);
  }, [isConnected, mobileConnectionConfig?.vpsUrl]);

  // Show duration since connection
  const connectionDuration = isConnected && mobileConnectionConfig?.connectedAt
    ? Math.floor((Date.now() - mobileConnectionConfig.connectedAt) / 1000)
    : 0;

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
              <Wifi className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg text-white font-semibold">Mobile Verbindung</h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                {isConnected
                  ? `Verbunden seit ${connectionDuration > 60 ? `${Math.floor(connectionDuration / 60)} Min` : `${connectionDuration} Sek`}`
                  : 'Verbinde mit deinem PC/Laptop'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTutorial(true)}
              className="p-2 text-zinc-500 hover:text-amber-300 transition-colors"
              title="Anleitung öffnen"
            >
              <BookOpen className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isConnected && mobileConnectionConfig && (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-emerald-200 font-medium">
                    Live verbunden
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {mobileConnectionConfig.type === 'vps'
                      ? mobileConnectionConfig.vpsUrl
                      : `${mobileConnectionConfig.sshUser}@${mobileConnectionConfig.sshHost}:${mobileConnectionConfig.sshPort}`}
                  </div>
                  {mobileConnectionConfig.lastTestedAt && (
                    <div className="text-[10px] text-emerald-500/60 mt-0.5">
                      Zuletzt geprueft: vor {Math.floor((Date.now() - mobileConnectionConfig.lastTestedAt) / 1000)}s
                    </div>
                  )}
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
              Verbinde dein Handy mit einem Linux-PC / VPS. 
              Fuehre auf dem PC einfach aus:
            </p>
            <pre className="text-[11px] font-mono text-zinc-300 bg-black/30 p-3 rounded-lg border border-white/5 overflow-x-auto">
              bash codeforge-connect.sh
            </pre>

            {/* LAN Auto-Discovery */}
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <div className="flex items-center gap-3 mb-3">
                <Search className="w-5 h-5 text-amber-300" />
                <div className="text-sm text-amber-200 font-medium">PC im lokalen Netzwerk finden</div>
              </div>
              <p className="text-[11px] text-zinc-500 leading-5 mb-3">
                Suche automatisch nach CodeForge-Servern im selben Netzwerk.
              </p>
              {discoveredServers.length > 0 && (
                <div className="space-y-2 mb-3">
                  {discoveredServers.map((server, idx) => (
                    <button
                      key={idx}
                      onClick={() => connectToDiscovered(server)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 text-left hover:bg-emerald-400/10 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-emerald-200">{server.name}</div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          http://{server.ip}:{server.port}
                          {server.providers.length > 0 && ` - ${server.providers.join(', ')}`}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={startLanDiscovery}
                disabled={discovering}
                className="w-full secondary-button"
              >
                {discovering ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Suche laeuft...</>
                ) : (
                  <><Search className="w-4 h-4" /> Netzwerk durchsuchen</>
                )}
              </button>
              {discoveryProgress && (
                <p className="text-[10px] text-zinc-600 mt-2 text-center">{discoveryProgress}</p>
              )}
            </div>

            {/* Manual options */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#141214] px-2 text-zinc-600">Oder manuell</span>
              </div>
            </div>

            <button
              onClick={() => { setConnectionType('vps'); setStep('vps'); }}
              className="w-full p-4 rounded-xl border border-white/10 bg-white/[0.02] text-left hover:border-sky-400/30 hover:bg-sky-400/5 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-400/10 border border-sky-400/20 flex items-center justify-center shrink-0">
                  <Server className="w-5 h-5 text-sky-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-medium">Server-URL manuell eingeben</div>
                  <p className="text-[11px] text-zinc-500 mt-1">VPS oder Linux-PC mit IP + Token verbinden</p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 mt-1 group-hover:text-sky-300 transition-colors" />
              </div>
            </button>

            <button
              onClick={() => { setConnectionType('ssh'); setStep('ssh'); }}
              className="w-full p-4 rounded-xl border border-white/10 bg-white/[0.02] text-left hover:border-emerald-400/30 hover:bg-emerald-400/5 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center shrink-0">
                  <Monitor className="w-5 h-5 text-emerald-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-medium">SSH (fuer Windows/Experten)</div>
                  <p className="text-[11px] text-zinc-500 mt-1">SSH-Verbindung zu einem Remote-Rechner</p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 mt-1 group-hover:text-emerald-300 transition-colors" />
              </div>
            </button>
          </div>
        )}

        {!isConnected && step === 'lan-scan' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setStep('select')} className="text-[11px] text-zinc-500 hover:text-white">
                &larr; Zurueck
              </button>
              <span className="text-zinc-700">|</span>
              <span className="text-sm text-white font-medium">Netzwerk-Suche</span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-[11px] text-zinc-500 leading-5 mb-3">
                Stelle sicher, dass auf dem Linux-PC der Befehl ausgefuehrt wurde:
              </p>
              <pre className="text-[11px] font-mono text-zinc-300 bg-black/30 p-3 rounded-lg border border-white/5 overflow-x-auto mb-3">
                bash codeforge-connect.sh
              </pre>
              <button
                onClick={startLanDiscovery}
                disabled={discovering}
                className="w-full primary-button"
              >
                {discovering ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Suche...</>
                ) : (
                  <><Search className="w-4 h-4" /> Netzwerk durchsuchen</>
                )}
              </button>
              {discoveryProgress && (
                <p className="text-[10px] text-zinc-600 mt-2 text-center">{discoveryProgress}</p>
              )}
            </div>

            {discoveredServers.length > 0 && (
              <div>
                <div className="text-xs text-zinc-400 mb-2">Gefundene Server:</div>
                <div className="space-y-2">
                  {discoveredServers.map((server, idx) => (
                    <button
                      key={idx}
                      onClick={() => connectToDiscovered(server)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 text-left hover:bg-emerald-400/10 transition-colors"
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-emerald-200 font-medium">{server.name}</div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          http://{server.ip}:{server.port}
                        </div>
                      </div>
                      <span className="text-[11px] text-emerald-400">Verbinden</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!discovering && discoveredServers.length === 0 && (
              <div className="text-center text-xs text-zinc-600 py-4">
                Kein Server gefunden. 
                Stelle sicher, dass <code className="text-zinc-400">codeforge-connect.sh</code> auf dem PC laeuft.
              </div>
            )}
          </div>
        )}

        {!isConnected && step === 'vps' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setStep('select')} className="text-[11px] text-zinc-500 hover:text-white">
                &larr; Zurueck
              </button>
              <span className="text-zinc-700">|</span>
              <span className="text-sm text-white font-medium">Server verbinden</span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-[11px] text-zinc-500 leading-5 mb-3">
                Auf dem Linux-PC ausfuehren:
              </p>
              <pre className="text-[11px] font-mono text-zinc-300 bg-black/30 p-3 rounded-lg border border-white/5 overflow-x-auto">
                bash codeforge-connect.sh
              </pre>
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">Server-URL *</label>
              <input
                value={vpsUrl}
                onChange={(e) => setVpsUrl(e.target.value)}
                className="input w-full"
                placeholder="z.B. http://192.168.1.100:8787"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">API-Token (falls erforderlich)</label>
              <input
                type="password"
                value={vpsToken}
                onChange={(e) => setVpsToken(e.target.value)}
                className="input w-full"
                placeholder="Token aus dem Terminal"
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
                Testen
              </button>
              <button
                onClick={saveVpsConfig}
                disabled={!vpsUrl.trim()}
                className="primary-button flex-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                Verbinden
              </button>
            </div>
          </div>
        )}

        {!isConnected && step === 'ssh' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setStep('select')} className="text-[11px] text-zinc-500 hover:text-white">
                &larr; Zurueck
              </button>
              <span className="text-zinc-700">|</span>
              <span className="text-sm text-white font-medium">SSH-Verbindung</span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-[11px] text-zinc-500 leading-5">
                SSH-Verbindung zu einem Remote-Rechner mit KI-CLI (agy/codex).
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
                placeholder="z.B. /home/user/.ssh/id_rsa"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">Projektpfad auf Zielrechner</label>
              <input
                value={sshProjectPath}
                onChange={(e) => setSshProjectPath(e.target.value)}
                className="input w-full"
                placeholder="~/codeforge-project"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={saveSshConfig}
                disabled={!sshHost.trim()}
                className="primary-button flex-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                Verbinden
              </button>
            </div>
          </div>
        )}
        {/* Tutorial Modal */}
        <AnimatePresence>
          {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
