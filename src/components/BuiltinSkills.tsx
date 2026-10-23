import { tr } from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BookOpen, Loader2, Pickaxe, Server, Upload } from 'lucide-react';
import type { SkillsState } from '../electron';
import type { VServerConnection } from '../types';

const cleanError = (error: unknown) =>
  error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : tr("Unbekannter Fehler");

function Switch({ on, busy, onChange, label }: { on: boolean; busy?: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-violet-500' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

function savedServers(): VServerConnection[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('agentWorkspace.vservers') || '[]');
    return Array.isArray(parsed)
      ? parsed.map((server) => ({ id: server.id, name: server.name, host: server.host, port: server.port, user: server.user, keyPath: server.keyPath }))
      : [];
  } catch {
    return [];
  }
}

// Mitgelieferte Plugins (z. B. Minecraft Hub) und Skills: Teil der App, werden als SKILL.md in die
// Skill-Ordner von FancyCode, Claude Code, OpenCode, Codex und Gemini/Antigravity kopiert.
export function BuiltinSkills() {
  const api = window.agentWorkspace?.skills;
  const [state, setState] = useState<SkillsState | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const servers = savedServers();

  const load = useCallback(async () => {
    if (!api) return;
    try {
      setState(await api.state());
    } catch (err) {
      setError(cleanError(err));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!api) return null;

  const run = async (key: string, work: () => Promise<SkillsState>, done?: string) => {
    setBusy(key);
    setError('');
    setStatus('');
    try {
      setState(await work());
      if (done) setStatus(done);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy('');
    }
  };

  const pushToServer = async (server: VServerConnection) => {
    setBusy(`server:${server.id}`);
    setError('');
    setStatus('');
    try {
      const result = await api.installRemote(server);
      if (result.ok) setStatus(tr("Skills auf {server} aktualisiert (für die dort installierten Harnesses).", { server: server.name }));
      else setError(tr("Auf {server} fehlgeschlagen: {failed}. Ist der Server per SSH-Schlüssel erreichbar?", { server: server.name, failed: result.failed.join(', ') }));
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy('');
    }
  };

  const plugins = state?.skills.filter((skill) => skill.plugin) || [];
  const skills = state?.skills.filter((skill) => !skill.plugin) || [];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">{tr("Mitgelieferte Plugins")}</h3>
        {!state && (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> {tr("Wird geladen …")}
          </div>
        )}
        <div className="space-y-2">
          {plugins.map((plugin) => (
            <div key={plugin.id} className={`rounded-xl border p-4 transition-colors ${plugin.enabled ? 'border-emerald-400/30 bg-emerald-500/[0.04]' : 'border-white/10 bg-white/[0.02]'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                    <Pickaxe className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-100">{plugin.title}</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-500">mitgeliefert</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                      {tr("Fragst du eine KI nach Minecraft-Servern, Plugins oder Mods, meldet sie zuerst, dass das FancyCode Minecraft-Plugin aktiv ist. Dann fragt sie, wo sie arbeiten soll (Server per SSH/RCON/Panel oder dieser PC) und ob sie live deployen darf oder nur bauen soll. Danach erledigt sie die Aufgabe.")}
                    </p>
                  </div>
                </div>
                <Switch on={plugin.enabled} busy={busy === plugin.id} label={plugin.title} onChange={(value) => void run(plugin.id, () => api.setSkill(plugin.id, value), value ? tr("{plugin} ist aktiviert.", { plugin: plugin.title }) : tr("{plugin} ist aus.", { plugin: plugin.title }))} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {skills.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-zinc-200">{tr("Skills")}</h3>
          <p className="mb-3 text-[11px] leading-4 text-zinc-500">{tr("Anleitungen, die der Agent bei passenden Aufgaben selbst lädt.")}</p>
          <div className="space-y-1.5">
            {skills.map((skill) => (
              <div key={skill.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex min-w-0 gap-2.5">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                  <div className="min-w-0">
                    <div className="text-[13px] text-zinc-200">{skill.title}</div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-500">{skill.description}</p>
                  </div>
                </div>
                <Switch on={skill.enabled} busy={busy === skill.id} label={skill.title} onChange={(value) => void run(skill.id, () => api.setSkill(skill.id, value))} />
              </div>
            ))}
          </div>
        </section>
      )}

      {state && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-zinc-200">{tr("Für diese Harnesses")}</h3>
          <p className="mb-3 text-[11px] leading-4 text-zinc-500">{tr("Eingeschaltete Plugins und Skills landen im Skill-Ordner jeder ausgewählten Harness auf diesem PC.")}</p>
          <div className="flex flex-wrap gap-2">
            {state.targets.map((target) => (
              <label
                key={target.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${target.detected ? 'border-white/10 bg-white/[0.03] text-zinc-200' : 'border-white/5 text-zinc-600'}`}
                title={target.detected ? '' : tr("Auf diesem PC nicht gefunden")}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-violet-500"
                  checked={target.enabled && target.detected}
                  disabled={!target.detected || busy === `target:${target.id}` || target.id === 'fancycode'}
                  onChange={(event) => void run(`target:${target.id}`, () => api.setTarget(target.id, event.target.checked))}
                />
                {target.label}
                {!target.detected && <span className="text-[10px]">{tr("(nicht installiert)")}</span>}
              </label>
            ))}
          </div>
          {servers.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] leading-4 text-zinc-500">{tr("Agenten auf V-Servern bekommen die Skills hiermit (überträgt den aktuellen Stand per SSH):")}</p>
              <div className="flex flex-wrap gap-2">
                {servers.map((server) => (
                  <button
                    key={server.id}
                    onClick={() => void pushToServer(server)}
                    disabled={Boolean(busy)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-40"
                  >
                    {busy === `server:${server.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}
                    {server.name}
                    <Upload className="h-3 w-3 text-zinc-500" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {state.conflicts.length > 0 && (
            <p className="mt-3 text-[11px] leading-4 text-amber-300">
              {tr("Nicht überschrieben, weil dort ein eigener Skill mit gleichem Namen liegt:")} {state.conflicts.join(', ')}
            </p>
          )}
        </section>
      )}

      {(error || status) && (
        <div className={`flex items-start gap-2 rounded-lg border p-3 text-[11px] ${error ? 'border-red-500/25 bg-red-500/10 text-red-200' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'}`}>
          {error && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          {error || status}
        </div>
      )}
    </div>
  );
}
