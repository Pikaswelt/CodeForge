import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  Monitor,
  Loader2,
  Server,
  X,
  ArrowRight,
  RefreshCw,
  Wifi,
  Search,
  BookOpen,
  QrCode,
  Radio,
  KeyRound,
  Copy,
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
  pairingActive?: boolean;
  pairingCode?: string;
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
        pairingActive: data.pairingActive,
        pairingCode: data.pairingCode,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Generate a small set of likely IPs for fast LAN discovery
function generateQuickIpList(): string[] {
  const ips: string[] = [];
  // Try to infer from own connection
  try {
    const ownIp = window.location.hostname;
    if (ownIp && ownIp !== 'localhost' && ownIp !== '127.0.0.1') {
      const parts = ownIp.split('.');
      if (parts.length === 4) {
        const base = parts.slice(0, 3).join('.');
        for (let i = 1; i <= 5; i++) ips.push(`${base}.${i}`);
        for (let i = 100; i <= 105; i++) ips.push(`${base}.${i}`);
        ips.push(`${base}.254`);
      }
    }
  } catch {}
  // Common gateway IPs
  ips.push('192.168.1.1', '192.168.1.2', '192.168.1.100', '192.168.1.101');
  ips.push('192.168.0.1', '192.168.0.2', '192.168.0.100', '192.168.0.101');
  ips.push('10.0.0.1', '10.0.0.2', '10.0.0.100');
  return [...new Set(ips)];
}

async function verifyPairingCode(serverUrl: string, code: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const url = `${serverUrl}/pair/verify`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verbindung fehlgeschlagen.' };
  }
}

export default function MobileConnectModal({ onClose }: { onClose: () => void }) {
  const { mobileConnectionConfig, setMobileConnectionConfig, setMobileMode } = useAppContext();
  const [step, setStep] = useState<'select' | 'pairing' | 'vps' | 'ssh'>(
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
  
  // Kopplungsmodus / Pairing state
  const [pairingCode, setPairingCode] = useState('');
  const [pairingPhase, setPairingPhase] = useState<'enter-code' | 'scanning' | 'verifying' | 'found' | 'error'>('enter-code');
  const [pairingError, setPairingError] = useState('');
  const [foundServer, setFoundServer] = useState<DiscoveredServer | null>(null);
  
  // QR Code state for VPS
  const [showQr, setShowQr] = useState(false);
  const [qrData, setQrData] = useState('');
  
  const [showTutorial, setShowTutorial] = useState(false);

  // Fast LAN discovery
  const quickScan = useCallback(async (): Promise<DiscoveredServer | null> => {
    const ips = generateQuickIpList();
    const ports = [8787, 8788];
    const totalChecks = ips.length * ports.length;
    
    // Run all checks in parallel with 2s timeout each
    const results = await Promise.all(
      ips.flatMap((ip) =>
        ports.map((port) => {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 2000);
          return tryDiscover(ip, port, ctrl.signal).finally(() => clearTimeout(timeout));
        }),
      ),
    );
    
    return results.find(Boolean) || null;
  }, []);

  const startPairing = async () => {
    if (!pairingCode || pairingCode.length !== 4 || !/^\d{4}$/.test(pairingCode)) {
      setPairingPhase('error');
      setPairingError('Bitte gib einen 4-stelligen Code ein.');
      return;
    }
    setPairingPhase('scanning');
    setPairingError('');
    
    // Step 1: Quick LAN scan
    const server = await quickScan();
    
    if (!server) {
      setPairingPhase('error');
      setPairingError('Kein Server im lokalen Netzwerk gefunden. Stelle sicher, dass PC und Handy im selben WLAN sind und der Kopplungsmodus auf dem PC aktiv ist.');
      return;
    }
    
    setFoundServer(server);
    setPairingPhase('verifying');
    
    // Step 2: Verify pairing code
    const url = `http://${server.ip}:${server.port}`;
    const result = await verifyPairingCode(url, pairingCode);
    
    if (result.ok) {
      setPairingPhase('found');
      const config: MobileConnectionConfig = {
        type: 'vps',
        vpsUrl: url,
        vpsToken: result.token || '',
        vpsProjectPath: '/root/codeforge-project',
        connected: true,
        connectedAt: Date.now(),
      };
      setMobileConnectionConfig(config);
      // Auto-close after short delay
      setTimeout(() => onClose(), 1500);
    } else {
      setPairingPhase('error');
      setPairingError(result.error || 'Falscher Code. Bitte versuche es erneut.');
    }
  };

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

  // Connection health check
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
          setMobileConnectionConfig({ ...config, connected: false });
        }
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [isConnected, mobileConnectionConfig?.vpsUrl]);

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
            {/* ── Kopplungsmodus (Main CTA) ── */}
            <div className="rounded-xl border border-violet-400/30 bg-violet-400/5 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-violet-400/15 border border-violet-400/30 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-violet-300" />
                </div>
                <div>
                  <div className="text-sm text-violet-200 font-semibold">Kopplungsmodus</div>
                  <p className="text-[11px] text-violet-400/60">Einfach per 4-stelligem Code verbinden</p>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 leading-5 mb-3">
                Starte auf dem PC/Server den Kopplungsmodus und gib hier den angezeigten Code ein.
              </p>
              <button
                onClick={() => {
                  setStep('pairing');
                  setPairingPhase('enter-code');
                  setPairingCode('');
                  setPairingError('');
                  setFoundServer(null);
                }}
                className="w-full primary-button bg-violet-500 hover:bg-violet-400"
              >
                <Radio className="w-4 h-4" />
                Kopplungsmodus starten
              </button>
            </div>

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

        {/* ── Kopplungsmodus ── */}
        {!isConnected && step === 'pairing' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setStep('select')} className="text-[11px] text-zinc-500 hover:text-white">
                &larr; Zurueck
              </button>
              <span className="text-zinc-700">|</span>
              <span className="text-sm text-white font-medium">Kopplungsmodus</span>
            </div>

            {/* Phase: Enter code */}
            {pairingPhase === 'enter-code' && (
              <>
                <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <KeyRound className="w-5 h-5 text-violet-300" />
                    <div>
                      <div className="text-sm text-violet-200 font-medium">Code eingeben</div>
                      <p className="text-[10px] text-zinc-500">Starte den Kopplungsmodus auf deinem PC</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-5 mb-3">
                    Auf dem PC/Server ausführen:
                  </p>
                  <pre className="text-[11px] font-mono text-zinc-300 bg-black/30 p-3 rounded-lg border border-white/5 overflow-x-auto mb-3">
                    bash codeforge-connect.sh
                  </pre>
                  <p className="text-[10px] text-zinc-600 mb-3">
                    Dann den 4-stelligen Code vom PC-Bildschirm hier eingeben:
                  </p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={pairingCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setPairingCode(val);
                      }}
                      className="input flex-1 text-center text-2xl tracking-[0.5em] font-mono py-3"
                      placeholder="1234"
                      autoFocus
                    />
                    <button
                      onClick={startPairing}
                      disabled={pairingCode.length !== 4}
                      className="primary-button bg-violet-500 hover:bg-violet-400 disabled:opacity-30"
                    >
                      <Search className="w-4 h-4" />
                      Suchen
                    </button>
                  </div>
                  <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-amber-300" />
                        <span className="text-xs text-amber-200 font-medium">Fuer VPS / Remote-Server:</span>
                      </div>
                      <button
                        onClick={() => {
                          if (!showQr) {
                            setShowQr(true);
                            setQrData(`http://codeforge-remote:8787/pair?code=XXXX`);
                          } else {
                            setShowQr(false);
                          }
                        }}
                        className="text-[10px] text-amber-300 hover:text-amber-200 underline"
                      >
                        {showQr ? 'QR ausblenden' : 'QR anzeigen'}
                      </button>
                    </div>
                    {showQr && (
                      <div className="bg-white p-3 rounded-lg mb-2 flex items-center justify-center">
                        <QrCode className="w-32 h-32 text-black" />
                      </div>
                    )}
                    <p className="text-[10px] text-zinc-500 leading-4">
                      Bei einem entfernten Server: Starte den Server, der QR-Code mit der Verbindungs-URL erscheint im Terminal.
                      Scanne ihn oder nutze "Server-URL manuell eingeben".
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Phase: Scanning */}
            {pairingPhase === 'scanning' && (
              <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-6 text-center">
                <Loader2 className="w-8 h-8 text-violet-300 animate-spin mx-auto mb-3" />
                <div className="text-sm text-violet-200 font-medium">Suche Server...</div>
                <div className="text-[11px] text-zinc-500 mt-1">Durchsuche lokales Netzwerk</div>
              </div>
            )}

            {/* Phase: Verifying */}
            {pairingPhase === 'verifying' && (
              <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-6 text-center">
                <Loader2 className="w-8 h-8 text-violet-300 animate-spin mx-auto mb-3" />
                <div className="text-sm text-violet-200 font-medium">
                  Prüfe Code mit {foundServer?.name}...
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  http://{foundServer?.ip}:{foundServer?.port}
                </div>
              </div>
            )}

            {/* Phase: Found! */}
            {pairingPhase === 'found' && (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <div className="text-sm text-emerald-200 font-bold text-lg">Verbunden!</div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  {foundServer?.name} – Code akzeptiert
                </div>
              </div>
            )}

            {/* Phase: Error */}
            {pairingPhase === 'error' && (
              <div className="space-y-3">
                <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4">
                  <div className="flex items-center gap-3">
                    <X className="w-5 h-5 text-red-300 shrink-0" />
                    <div>
                      <div className="text-sm text-red-200 font-medium">Nicht gefunden</div>
                      <div className="text-[11px] text-red-400/60 mt-0.5">{pairingError}</div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setPairingPhase('enter-code');
                    setPairingError('');
                  }}
                  className="w-full secondary-button"
                >
                  Erneut versuchen
                </button>
                <p className="text-[10px] text-zinc-600 text-center">
                  Du kannst auch die Server-URL manuell eingeben.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── VPS Manual Entry ── */}
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
                Auf dem Linux-PC ausführen:
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

        {/* ── SSH Manual Entry ── */}
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
