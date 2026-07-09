import { useState, useEffect, useCallback, useRef } from 'react';
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
  BookOpen,
  Radio,
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

function generateQuickIpList(): string[] {
  const ips: string[] = [];
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
  ips.push('192.168.1.1', '192.168.1.2', '192.168.1.100', '192.168.1.101');
  ips.push('192.168.0.1', '192.168.0.2', '192.168.0.100', '192.168.0.101');
  ips.push('10.0.0.1', '10.0.0.2', '10.0.0.100');
  return [...new Set(ips)];
}

async function verifyPairingCode(serverUrl: string, code: string): Promise<{ ok: boolean; token?: string; serverUrl?: string; error?: string }> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const url = `${serverUrl}/pair/verify`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          ok: false,
          error: `Server antwortete mit Status ${res.status} (kein JSON). Die URL '${serverUrl}' ist evtl. falsch oder der Server verwendet HTTPS.`,
        };
      }
      if (!res.ok && !data.ok) {
        return {
          ok: false,
          error: data.error || `Server-Fehler (${res.status}). Prüfe ob der Server läuft: http://${serverUrl.replace(/^https?:\/\//, '')}/discover`,
        };
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verbindung fehlgeschlagen.';
      // On last attempt, return a helpful error
      if (attempt >= maxRetries) {
        const helpfulMessage =
          message.includes('fetch') || message.includes('NetworkError') || message.includes('network')
            ? `🚫 Keine Verbindung zum Server. Mögliche Ursachen:
  • Server läuft nicht (Status prüfen: systemctl status codeforge-remote)
  • Port 8787 in der Firewall nicht freigegeben (ufw allow 8787)
  • Handy und Server müssen sich erreichen können (gleiches Netzwerk oder öffentliche IP)
  • Bei HTTPS-App: Server braucht HTTPS oder die Android-Einstellungen müssen angepasst werden`
            : message;
        return { ok: false, error: helpfulMessage };
      }
      // Wait before retry (500ms, 1s)
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return { ok: false, error: 'Verbindung fehlgeschlagen nach mehreren Versuchen.' };
}

export default function MobileConnectModal({ onClose }: { onClose: () => void }) {
  const { mobileConnectionConfig, setMobileConnectionConfig, setMobileMode } = useAppContext();
  const [step, setStep] = useState<'select' | 'vps' | 'ssh'>('select');
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

  // Omni-Input: erkennt 4-stelligen Code ODER Easy-Setup-URL
  const [omniInput, setOmniInput] = useState('');
  const [pairingPhase, setPairingPhase] = useState<'enter' | 'scanning' | 'verifying' | 'found' | 'error'>('enter');
  const [pairingError, setPairingError] = useState('');
  const [foundServer, setFoundServer] = useState<DiscoveredServer | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const pairingInFlight = useRef(false);

  // Fast LAN discovery
  const quickScan = useCallback(async (): Promise<DiscoveredServer | null> => {
    const ips = generateQuickIpList();
    const ports = [8787, 8788];
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

  // Parse omni-input: detect URL vs 4-digit code
  const parseInput = (input: string): { type: 'url'; serverUrl: string; code: string } | { type: 'code'; code: string } | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    
    // Detect Easy-Setup-URL: http://IP:PORT/pair?code=XXXX
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const urlObj = new URL(trimmed);
        const code = urlObj.searchParams.get('code') || '';
        if (code && /^\d{4}$/.test(code)) {
          const serverUrl = `${urlObj.protocol}//${urlObj.host}`;
          return { type: 'url', serverUrl, code };
        }
      } catch {}
    }
    
    // Detect 4-digit code
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 4) {
      return { type: 'code', code: digits };
    }
    
    return null;
  };

  // Auto-submit: useEffect that watches omniInput and pairingPhase
  useEffect(() => {
    const parsed = parseInput(omniInput);
    if (!parsed) return;
    if (pairingPhase !== 'enter' && pairingPhase !== 'error') return;
    if (pairingInFlight.current) return;

    pairingInFlight.current = true;

    const doPair = async () => {
      if (parsed.type === 'url') {
        // Easy-Setup URL → direkt verifizieren
        setPairingPhase('verifying');
        setPairingError('');
        const result = await verifyPairingCode(parsed.serverUrl, parsed.code);
        if (result.ok) {
          setFoundServer({ ip: parsed.serverUrl.replace(/^https?:\/\//, ''), port: 0, name: 'Remote VPS', tokenRequired: true, providers: [] });
          setPairingPhase('found');
          setMobileConnectionConfig({
            type: 'vps',
            vpsUrl: result.serverUrl || parsed.serverUrl,
            vpsToken: result.token || '',
            vpsProjectPath: '/root/codeforge-project',
            connected: true,
            connectedAt: Date.now(),
          });
          setTimeout(() => onClose(), 1500);
        } else {
          setPairingPhase('error');
          setPairingError(result.error || 'Falscher Code oder Server nicht erreichbar.');
        }
        pairingInFlight.current = false;
        return;
      }

      if (parsed.type === 'code') {
        // 4-digit code → LAN scan + verify
        setPairingPhase('scanning');
        setPairingError('');
        const server = await quickScan();
        if (!server) {
          setPairingPhase('error');
          setPairingError('Kein Server im lokalen Netzwerk gefunden. Tipp: Kopiere den Easy-Setup-Link vom Server (http://...) und füge ihn hier ein.');
          pairingInFlight.current = false;
          return;
        }
        setFoundServer(server);
        setPairingPhase('verifying');
        const serverUrl = `http://${server.ip}:${server.port}`;
        const result = await verifyPairingCode(serverUrl, parsed.code);
        if (result.ok) {
          setPairingPhase('found');
          setMobileConnectionConfig({
            type: 'vps',
            vpsUrl: result.serverUrl || serverUrl,
            vpsToken: result.token || '',
            vpsProjectPath: '/root/codeforge-project',
            connected: true,
            connectedAt: Date.now(),
          });
          setTimeout(() => onClose(), 1500);
        } else {
          setPairingPhase('error');
          setPairingError(result.error || 'Falscher Code.');
        }
        pairingInFlight.current = false;
      }
    };
    doPair();
  }, [omniInput, pairingPhase]);

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
    setMobileConnectionConfig({
      type: 'vps',
      vpsUrl: vpsUrl.trim().replace(/\/+$/, ''),
      vpsToken: vpsToken.trim(),
      vpsProjectPath: vpsProjectPath.trim() || '/root/codeforge-project',
      connected: true,
      connectedAt: Date.now(),
    });
    onClose();
  };

  const saveSshConfig = () => {
    if (!sshHost.trim()) return;
    setMobileConnectionConfig({
      type: 'ssh',
      sshHost: sshHost.trim(),
      sshPort: sshPort,
      sshUser: sshUser.trim() || 'root',
      sshKey: sshKey.trim(),
      sshProjectPath: sshProjectPath.trim() || '~/codeforge-project',
      connected: true,
      connectedAt: Date.now(),
    });
    onClose();
  };

  const disconnect = () => {
    setMobileConnectionConfig({ type: connectionType || 'vps', connected: false });
    setConnectionType(null);
    setStep('select');
    setTestResult(null);
  };

  const isConnected = mobileConnectionConfig?.connected;

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
                  : 'Verbinde mit deinem PC/Server'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTutorial(true)} className="p-2 text-zinc-500 hover:text-amber-300 transition-colors" title="Anleitung">
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
                  <div className="text-sm text-emerald-200 font-medium">Live verbunden</div>
                  <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {mobileConnectionConfig.type === 'vps'
                      ? mobileConnectionConfig.vpsUrl
                      : `${mobileConnectionConfig.sshUser}@${mobileConnectionConfig.sshHost}:${mobileConnectionConfig.sshPort}`}
                  </div>
                </div>
              </div>
              <button onClick={disconnect} className="shrink-0 text-[11px] text-red-400 hover:text-red-300 border border-red-400/20 px-2.5 py-1 rounded-lg">Trennen</button>
            </div>
          </div>
        )}

        {!isConnected && step === 'select' && (
          <div className="space-y-4">
            {/* ⚡ Easy Setup – Omni-Input (URL oder 4-digit Code) */}
            <div className="rounded-xl border border-violet-400/30 bg-violet-400/5 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-violet-400/15 border border-violet-400/30 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-violet-300" />
                </div>
                <div>
                  <div className="text-sm text-violet-200 font-semibold">⚡ Easy Setup</div>
                  <p className="text-[11px] text-violet-400/60">Link vom Server kopieren → hier einfügen → FERTIG!</p>
                </div>
              </div>

              <div className="rounded-lg bg-black/30 border border-white/5 p-3 mb-3">
                <p className="text-[10px] text-zinc-500 mb-1">Auf dem PC/Server ausführen:</p>
                <code className="text-[12px] font-mono text-emerald-300 block">bash codeforge-connect.sh</code>
                <p className="text-[10px] text-zinc-500 mt-2">Dann den <b>Easy Setup Link</b> kopieren und hier einfügen:</p>
                <code className="text-[10px] font-mono text-zinc-400 block mt-1">http://DEINE-IP:8787/pair?code=1234</code>
              </div>

              {/* Omni-Input */}
              {pairingPhase === 'enter' || pairingPhase === 'error' ? (
                <div>
                  <input
                    type="text"
                    inputMode="text"
                    value={omniInput}
                    onChange={(e) => {
                      setOmniInput(e.target.value);
                      if (pairingPhase === 'error') setPairingPhase('enter');
                    }}
                    className="input w-full text-sm font-mono py-3 px-3"
                    placeholder="http://88.214.56.241:8787/pair?code=4821  oder  4821"
                    autoFocus
                  />
                  <p className="text-[9px] text-zinc-600 mt-1.5">
                    🪄 Erkennt automatisch Easy-Setup-Links UND 4-stellige Codes
                  </p>
                </div>
              ) : pairingPhase === 'scanning' ? (
                <div className="flex items-center justify-center gap-2 py-4 text-violet-200">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Suche Server im Netzwerk...</span>
                </div>
              ) : pairingPhase === 'verifying' ? (
                <div className="flex items-center justify-center gap-2 py-4 text-violet-200">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Prüfe Verbindung...</span>
                </div>
              ) : pairingPhase === 'found' ? (
                <div className="flex items-center justify-center gap-2 py-4 text-emerald-300">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-bold">✨ Verbunden!</span>
                </div>
              ) : null}

              {pairingPhase === 'error' && pairingError && (
                <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-2 mt-2">
                  <p className="text-[10px] text-red-300 flex items-center gap-1"><X className="w-3 h-3 shrink-0" />{pairingError}</p>
                  <button onClick={() => { setPairingPhase('enter'); setPairingError(''); setOmniInput(''); }}
                    className="text-[10px] text-red-400 hover:text-red-300 underline mt-1">Erneut versuchen</button>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-[#141214] px-2 text-zinc-600">Oder manuell</span></div>
            </div>

            <button onClick={() => { setConnectionType('vps'); setStep('vps'); }}
              className="w-full p-4 rounded-xl border border-white/10 bg-white/[0.02] text-left hover:border-sky-400/30 hover:bg-sky-400/5 transition-all group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-400/10 border border-sky-400/20 flex items-center justify-center shrink-0">
                  <Server className="w-5 h-5 text-sky-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-medium">Server-URL + Token (Manuell)</div>
                  <p className="text-[11px] text-zinc-500 mt-1">IP und Token direkt eingeben</p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 mt-1 group-hover:text-sky-300 transition-colors" />
              </div>
            </button>

            <button onClick={() => { setConnectionType('ssh'); setStep('ssh'); }}
              className="w-full p-4 rounded-xl border border-white/10 bg-white/[0.02] text-left hover:border-emerald-400/30 hover:bg-emerald-400/5 transition-all group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center shrink-0">
                  <Monitor className="w-5 h-5 text-emerald-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-medium">SSH (Experte)</div>
                  <p className="text-[11px] text-zinc-500 mt-1">Direkte SSH-Verbindung</p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 mt-1 group-hover:text-emerald-300 transition-colors" />
              </div>
            </button>
          </div>
        )}

        {/* ── VPS Manual Entry ── */}
        {!isConnected && step === 'vps' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setStep('select')} className="text-[11px] text-zinc-500 hover:text-white">&larr; Zurueck</button>
              <span className="text-zinc-700">|</span>
              <span className="text-sm text-white font-medium">Server verbinden</span>
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">Server-URL *</label>
              <input value={vpsUrl} onChange={(e) => setVpsUrl(e.target.value)} className="input w-full" placeholder="http://88.214.56.241:8787" />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">API-Token</label>
              <input type="password" value={vpsToken} onChange={(e) => setVpsToken(e.target.value)} className="input w-full" placeholder="Token" />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">Projektpfad</label>
              <input value={vpsProjectPath} onChange={(e) => setVpsProjectPath(e.target.value)} className="input w-full" placeholder="/root/codeforge-project" />
            </div>
            {testResult && (
              <div className={`text-[12px] leading-5 p-3 rounded-lg border ${testResult.ok ? 'bg-emerald-400/5 border-emerald-400/20 text-emerald-200' : 'bg-red-400/5 border-red-400/20 text-red-300'}`}>
                {testResult.ok ? <CheckCircle2 className="w-4 h-4 inline mr-2" /> : <X className="w-4 h-4 inline mr-2" />}{testResult.message}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={testVpsConnection} disabled={testing || !vpsUrl.trim()} className="secondary-button flex-1">
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}Testen
              </button>
              <button onClick={saveVpsConfig} disabled={!vpsUrl.trim()} className="primary-button flex-1">
                <CheckCircle2 className="w-4 h-4" />Verbinden
              </button>
            </div>
          </div>
        )}

        {/* ── SSH Manual Entry ── */}
        {!isConnected && step === 'ssh' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setStep('select')} className="text-[11px] text-zinc-500 hover:text-white">&larr; Zurueck</button>
              <span className="text-zinc-700">|</span>
              <span className="text-sm text-white font-medium">SSH-Verbindung</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><label className="text-[11px] text-zinc-400 block mb-1.5">SSH-Host *</label><input value={sshHost} onChange={(e) => setSshHost(e.target.value)} className="input w-full" placeholder="192.168.1.100" /></div>
              <div><label className="text-[11px] text-zinc-400 block mb-1.5">Port</label><input type="number" value={sshPort} onChange={(e) => setSshPort(Number(e.target.value))} className="input w-full" placeholder="22" /></div>
            </div>
            <div><label className="text-[11px] text-zinc-400 block mb-1.5">Benutzername</label><input value={sshUser} onChange={(e) => setSshUser(e.target.value)} className="input w-full" placeholder="root" /></div>
            <div><label className="text-[11px] text-zinc-400 block mb-1.5">SSH-Key (optional)</label><input value={sshKey} onChange={(e) => setSshKey(e.target.value)} className="input w-full" placeholder="/home/user/.ssh/id_rsa" /></div>
            <div><label className="text-[11px] text-zinc-400 block mb-1.5">Projektpfad</label><input value={sshProjectPath} onChange={(e) => setSshProjectPath(e.target.value)} className="input w-full" placeholder="~/codeforge-project" /></div>
            <button onClick={saveSshConfig} disabled={!sshHost.trim()} className="primary-button w-full"><CheckCircle2 className="w-4 h-4" />Verbinden</button>
          </div>
        )}

        <AnimatePresence>{showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}</AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
