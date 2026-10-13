import { useEffect, useState } from 'react';
import { Bot, Check, Copy, Loader2 } from 'lucide-react';
import { useAppContext } from '../AppContext';

// Registers CodeForge's MCP server with Claude Code or agy, so an agent can manage all terminals.
export function McpSettings() {
  const { agyAccounts } = useAppContext();
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState<'' | 'claude' | 'agy'>('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void window.agentWorkspace?.getMcpInfo?.().then((info) => {
      const env = Object.entries(info.env).map(([key, value]) => `${key}=${value} `).join('');
      setCommand(`${env}"${info.command}" ${info.args.map((arg) => `"${arg}"`).join(' ')}`);
    });
  }, []);

  if (!window.agentWorkspace?.registerMcp) return null;

  const register = async (target: 'claude' | 'agy') => {
    setBusy(target);
    setResult(null);
    try {
      const answer = await window.agentWorkspace!.registerMcp!({ target, accountIds: agyAccounts.map((account) => account.id) });
      const name = target === 'claude' ? 'Claude Code' : `Antigravity (Hauptlogin + ${agyAccounts.length} Account${agyAccounts.length === 1 ? '' : 's'} auf diesem PC)`;
      setResult({ ok: answer.ok, text: answer.ok ? `In ${name} eingetragen. Dort neu starten, dann ist "codeforge" verfuegbar.` : answer.output });
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'Eintragen fehlgeschlagen.' });
    } finally {
      setBusy('');
    }
  };

  const buttonClass = 'flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.08] disabled:opacity-50';

  return (
    <section>
      <div className="section-label">Agent-Steuerung (MCP)</div>
      <p className="text-[11px] leading-4 text-zinc-500 mt-2">
        Ein Agent wie Claude Code kann damit alle Terminals sehen, Aufgaben schicken, auf Ergebnisse warten und Sessions starten oder fortsetzen. Lesen und Senden geht auch, wenn CodeForge zu ist.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => void register('claude')} disabled={Boolean(busy)} className={buttonClass}>
          {busy === 'claude' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
          In Claude Code eintragen
        </button>
        <button onClick={() => void register('agy')} disabled={Boolean(busy)} className={buttonClass}>
          {busy === 'agy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
          In Antigravity eintragen
        </button>
      </div>
      {result && (
        <div className={`mt-2 whitespace-pre-wrap text-[11px] px-3 py-2 rounded-lg border ${result.ok ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-red-300 bg-red-500/10 border-red-500/20'}`}>
          {result.text}
        </div>
      )}
      {command && (
        <div className="mt-3">
          <div className="text-[11px] text-zinc-500">Fuer andere Tools (stdio-Befehl):</div>
          <div className="mt-1 flex items-start gap-2">
            <code className="flex-1 min-w-0 break-all rounded-lg bg-black/30 border border-white/5 px-2 py-1.5 text-[10px] text-zinc-400">{command}</code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(command);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200"
              title="Kopieren"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
