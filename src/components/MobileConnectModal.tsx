import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  Loader2,
  X,
  Wifi,
  Radio,
  Copy,
  Check,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { REMOTE_SERVER_BASE64 } from './serverCode';

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
      return { ok: false, error: 'Ungültige Server-Antwort.' };
    }
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verbindung fehlgeschlagen.' };
  }
}

export default function MobileConnectModal({ onClose }: { onClose: () => void }) {
  const { mobileConnectionConfig, setMobileConnectionConfig, setMobileMode } = useAppContext();
  
  // OS & Network choices
  const [os, setOs] = useState<'windows' | 'linux' | null>(null);
  const [network, setNetwork] = useState<'same' | 'remote' | null>(null);
  const [remoteIp, setRemoteIp] = useState('');
  
  const [status, setStatus] = useState<'idle' | 'scanning' | 'verifying' | 'connected' | 'error'>('idle');
  const [copied, setCopied] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  // Manual fallback input fields
  const [vpsUrl, setVpsUrl] = useState(mobileConnectionConfig?.vpsUrl || '');
  const [vpsToken, setVpsToken] = useState(mobileConnectionConfig?.vpsToken || '');
  const [vpsProjectPath, setVpsProjectPath] = useState(
    mobileConnectionConfig?.vpsProjectPath || '/root/codeforge-project',
  );

  const isConnected = mobileConnectionConfig?.connected;

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

  // Connection auto-check loop
  useEffect(() => {
    if (!os || !network || isConnected) return;
    if (status === 'connected') return;
    if (manualMode) return;

    let active = true;
    let timer: NodeJS.Timeout;

    const checkConnection = async () => {
      if (!active) return;

      if (network === 'same') {
        setStatus('scanning');
        try {
          const server = await quickScan();
          if (server && server.pairingActive && server.pairingCode) {
            setStatus('verifying');
            const serverUrl = `http://${server.ip}:${server.port}`;
            const res = await verifyPairingCode(serverUrl, server.pairingCode);
            if (res.ok && res.token) {
              setStatus('connected');
              setMobileConnectionConfig({
                type: 'vps',
                vpsUrl: res.serverUrl || serverUrl,
                vpsToken: res.token,
                vpsProjectPath: os === 'windows' ? 'C:/codeforge-project' : '/root/codeforge-project',
                connected: true,
                connectedAt: Date.now(),
              });
              setMobileMode(true);
              active = false;
              setTimeout(() => {
                window.location.reload();
              }, 1000);
              return;
            }
          }
        } catch (e) {
          // ignore
        }
      } else {
        // Remote VPS
        if (!remoteIp.trim()) {
          setStatus('idle');
          if (active) timer = setTimeout(checkConnection, 3000);
          return;
        }

        setStatus('scanning');
        const cleanIp = remoteIp.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const serverUrl = cleanIp.includes(':') ? `http://${cleanIp}` : `http://${cleanIp}:8787`;
        const host = cleanIp.includes(':') ? cleanIp.split(':')[0] : cleanIp;
        const port = cleanIp.includes(':') ? Number(cleanIp.split(':')[1]) : 8787;

        try {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 2000);
          const server = await tryDiscover(host, port, ctrl.signal);
          clearTimeout(timeout);

          if (server && server.pairingActive && server.pairingCode) {
            setStatus('verifying');
            const res = await verifyPairingCode(serverUrl, server.pairingCode);
            if (res.ok && res.token) {
              setStatus('connected');
              setMobileConnectionConfig({
                type: 'vps',
                vpsUrl: res.serverUrl || serverUrl,
                vpsToken: res.token,
                vpsProjectPath: os === 'windows' ? 'C:/codeforge-project' : '/root/codeforge-project',
                connected: true,
                connectedAt: Date.now(),
              });
              setMobileMode(true);
              active = false;
              setTimeout(() => {
                window.location.reload();
              }, 1000);
              return;
            }
          }
        } catch (e) {
          // ignore
        }
      }

      if (active) {
        timer = setTimeout(checkConnection, 3000);
      }
    };

    timer = setTimeout(checkConnection, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [os, network, remoteIp, isConnected, status, manualMode]);

  const getCommand = (): string => {
    if (os === 'windows') {
      return `$token = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | ForEach-Object { [char]$_ }); $b = [System.Convert]::FromBase64String('${REMOTE_SERVER_BASE64}'); $ms = [System.IO.MemoryStream]::new($b); $gs = [System.IO.Compression.GZipStream]::new($ms, [System.IO.Compression.CompressionMode]::Decompress); $os = [System.IO.MemoryStream]::new(); $gs.CopyTo($os); [System.IO.File]::WriteAllBytes("codeforge-remote-server.mjs", $os.ToArray()); if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Installiere Node.js..." -ForegroundColor Yellow; winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements; Write-Host "Bitte starte das Terminal neu und fuehre node codeforge-remote-server.mjs aus!" -ForegroundColor Green; exit }; $env:CODEFORGE_TOKEN = $token; $env:CODEFORGE_AUTO_PAIR = "true"; node codeforge-remote-server.mjs`;
    }
    if (os === 'linux') {
      const setupNode = "export DEBIAN_FRONTEND=noninteractive; if ! command -v node >/dev/null 2>&1; then echo 'Installiere Node.js...'; SUDO=''; if [ \"\$(id -u)\" -ne 0 ]; then if command -v sudo >/dev/null 2>&1; then SUDO='sudo'; else echo 'Fehler: root oder sudo erforderlich.'; exit 1; fi; fi; \$SUDO apt-get update -y && \$SUDO apt-get install -y -o Dpkg::Options::=\"--force-confdef\" -o Dpkg::Options::=\"--force-confold\" curl gnupg ca-certificates && curl -fsSL https://deb.nodesource.com/setup_22.x | \$SUDO bash - && \$SUDO apt-get install -y -o Dpkg::Options::=\"--force-confdef\" -o Dpkg::Options::=\"--force-confold\" nodejs; fi; if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'active'; then \$SUDO ufw allow 8787/tcp; fi; if command -v iptables >/dev/null 2>&1; then \$SUDO iptables -A INPUT -p tcp --dport 8787 -j ACCEPT 2>/dev/null || true; fi";
      return `token=\$(head -c 16 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 16); echo '${REMOTE_SERVER_BASE64}' | base64 -d | gzip -d > codeforge-remote-server.mjs; ${setupNode}; export CODEFORGE_TOKEN="\$token"; export CODEFORGE_AUTO_PAIR="true"; node codeforge-remote-server.mjs`;
    }
    return '';
  };

  const handleCopy = () => {
    const cmd = getCommand();
    if (!cmd) return;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualConnect = () => {
    if (!vpsUrl.trim()) return;
    setMobileConnectionConfig({
      type: 'vps',
      vpsUrl: vpsUrl.trim().replace(/\/+$/, ''),
      vpsToken: vpsToken.trim(),
      vpsProjectPath: vpsProjectPath.trim() || '/root/codeforge-project',
      connected: true,
      connectedAt: Date.now(),
    });
    setMobileMode(true);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const disconnect = () => {
    setMobileConnectionConfig({ type: 'vps', connected: false });
    setMobileMode(false);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const command = getCommand();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/85 backdrop-blur-xl z-[120] flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-[#141214] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <Wifi className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base text-white font-semibold">Remote Verbindung</h2>
              <p className="text-xs text-zinc-600 mt-0.5">PC / Server fernsteuern</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connected info */}
        {isConnected && mobileConnectionConfig && (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 mb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-emerald-300 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Live verbunden
                </div>
                <div className="text-[11px] text-zinc-500 truncate mt-1">
                  {mobileConnectionConfig.vpsUrl}
                </div>
              </div>
              <button
                onClick={disconnect}
                className="shrink-0 text-xs text-red-400 hover:text-red-300 border border-red-400/20 px-3 py-1.5 rounded-xl hover:bg-red-400/5 transition-colors cursor-pointer"
              >
                Trennen
              </button>
            </div>
          </div>
        )}

        {/* Wizard */}
        {!isConnected && !manualMode && (
          <div className="space-y-5">
            {/* Step 1: Choose OS */}
            <div>
              <div className="text-xs text-zinc-400 font-semibold mb-2">1. Betriebssystem wählen:</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setOs('windows'); setStatus('idle'); }}
                  className={`p-3 rounded-xl border text-center text-xs font-semibold transition-all cursor-pointer ${
                    os === 'windows'
                      ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                      : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/10'
                  }`}
                >
                  Windows PC
                </button>
                <button
                  onClick={() => { setOs('linux'); setStatus('idle'); }}
                  className={`p-3 rounded-xl border text-center text-xs font-semibold transition-all cursor-pointer ${
                    os === 'linux'
                      ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                      : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/10'
                  }`}
                >
                  Linux / Debian
                </button>
              </div>
            </div>

            {/* Step 2: Choose Network Type */}
            {os && (
              <div>
                <div className="text-xs text-zinc-400 font-semibold mb-2">2. Netzwerk-Szenario:</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setNetwork('same'); setStatus('idle'); }}
                    className={`p-3 rounded-xl border text-center text-xs font-semibold transition-all cursor-pointer ${
                      network === 'same'
                        ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                        : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/10'
                    }`}
                  >
                    Gleiches WLAN / LAN
                  </button>
                  <button
                    onClick={() => { setNetwork('remote'); setStatus('idle'); }}
                    className={`p-3 rounded-xl border text-center text-xs font-semibold transition-all cursor-pointer ${
                      network === 'remote'
                        ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                        : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/10'
                    }`}
                  >
                    Anderes Netz / VPS
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Server IP for Remote VPS */}
            {os && network === 'remote' && (
              <div>
                <div className="text-xs text-zinc-400 font-semibold mb-1.5">3. Server IP-Adresse oder Domain:</div>
                <input
                  type="text"
                  value={remoteIp}
                  onChange={(e) => { setRemoteIp(e.target.value); setStatus('idle'); }}
                  className="input w-full text-xs font-mono py-2.5 px-3"
                  placeholder="z.B. 88.214.56.241 oder mein-server.de"
                />
              </div>
            )}

            {/* Step 4: Show Command and Check Status */}
            {os && network && (network === 'same' || remoteIp.trim() !== '') && (
              <div className="rounded-xl border border-violet-400/15 bg-violet-400/5 p-4 mt-2">
                <div className="text-xs text-violet-300 font-semibold flex items-center gap-1.5 mb-2">
                  <Radio className="w-4 h-4 text-violet-400" />
                  Terminal-Befehl ausführen:
                </div>
                <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">
                  Führe diesen Befehl im Terminal auf deinem {os === 'windows' ? 'PC' : 'Server'} aus:
                </p>
                <div className="flex items-center gap-2 rounded-lg bg-black/45 border border-white/5 p-2 font-mono text-[11px] text-emerald-300 overflow-x-auto break-all">
                  <span className="flex-1 select-all">{command}</span>
                  <button
                    onClick={handleCopy}
                    className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
                    title="Kopieren"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-center gap-2.5 py-2 border-t border-white/5">
                  {status === 'scanning' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                      <span className="text-[11px] text-amber-300">Warte auf Server-Start... (Auto-Check läuft)</span>
                    </>
                  ) : status === 'verifying' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-violet-300" />
                      <span className="text-[11px] text-violet-300">Kopplung wird verifiziert...</span>
                    </>
                  ) : status === 'connected' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-[11px] text-emerald-400 font-bold">Verbunden! Starte neu...</span>
                    </>
                  ) : (
                    <span className="text-[11px] text-zinc-600">Erwarte Verbindung von Server...</span>
                  )}
                </div>
              </div>
            )}

            {/* Manual fallback link */}
            <div className="pt-2 border-t border-white/5 text-center">
              <button
                onClick={() => setManualMode(true)}
                className="text-[11px] text-zinc-600 hover:text-zinc-400 underline transition-colors cursor-pointer"
              >
                Manuelle IP und Token eingeben
              </button>
            </div>
          </div>
        )}

        {/* Manual Fallback form */}
        {manualMode && !isConnected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setManualMode(false)}
                className="text-[11px] text-zinc-500 hover:text-white cursor-pointer"
              >
                &larr; Zurück zum Assistenten
              </button>
              <span className="text-xs text-white font-semibold">Manuelle Verbindung</span>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Server-URL *</label>
              <input
                value={vpsUrl}
                onChange={(e) => setVpsUrl(e.target.value)}
                className="input w-full text-xs"
                placeholder="http://192.168.1.100:8787"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">API-Token (optional)</label>
              <input
                type="password"
                value={vpsToken}
                onChange={(e) => setVpsToken(e.target.value)}
                className="input w-full text-xs"
                placeholder="Token"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 block mb-1">Projektpfad</label>
              <input
                value={vpsProjectPath}
                onChange={(e) => setVpsProjectPath(e.target.value)}
                className="input w-full text-xs"
                placeholder="/root/codeforge-project"
              />
            </div>
            <button
              onClick={handleManualConnect}
              disabled={!vpsUrl.trim()}
              className="primary-button w-full text-xs font-semibold py-2 cursor-pointer"
            >
              Verbinden
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
