// Bereich „Team“: gemeinsamer Chat mit FancyAgent (gleiche Oberfläche wie in FancyAgent und Kuroi Studio)
// plus Leiste zum Teilen: Terminal (zuschauen), FancyCode-Agent-Session, Datei live bearbeiten.
import { useEffect, useRef, useState } from 'react';
import { Bot, FileCode2, Terminal as TerminalIcon, Square } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { startTeam, currentTeam } from './team';
import { harnessSessions, isTerminalShared, shareAgentSession, shareFile, shareTerminal, stopTerminal } from './live';

export default function TeamView() {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [project, setProject] = useState<number>(0);
  const [menu, setMenu] = useState<'' | 'term' | 'agent'>('');
  const [note, setNote] = useState('');
  const [, force] = useState(0);
  const { chats } = useAppContext();

  useEffect(() => {
    let alive = true;
    startTeam()
      .then((team) => {
        if (!alive || !host.current) return;
        if (!team) return setError('Melde dich mit deinem FancyServers-Konto an, um mit deinem Team zu arbeiten.');
        team.mountChat(host.current);
        setReady(true);
        const off = team.client.on('state', () => force((n) => n + 1));
        return off;
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      host.current?.replaceChildren();
    };
  }, []);

  const client = currentTeam()?.client;
  const projects = client?.state?.projects ?? [];
  const pid = project || projects[0]?.id || 0;
  const linked = Boolean(client?.approved);
  const terminals = chats
    .filter((c) => c.mode === 'terminal')
    .flatMap((c) => (c.terminalTabs?.length ? c.terminalTabs.map((t) => ({ id: t.id, title: t.title || c.title })) : [{ id: c.id, title: c.title }]));
  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(''), 4000);
  };
  const run = (fn: () => unknown, ok: string) => {
    try {
      fn();
      flash(ok);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    }
    setMenu('');
    force((n) => n + 1);
  };

  return (
    <div className="flex-1 min-h-0 p-3 flex flex-col gap-2">
      {ready && linked && projects.length > 0 && (
        <div className="fc-team-bar">
          <span className="text-zinc-400 text-xs">Teilen in</span>
          <select value={pid} onChange={(e) => setProject(Number(e.target.value))} className="fc-team-select">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <button className="fc-team-btn" onClick={() => setMenu(menu === 'term' ? '' : 'term')}>
              <TerminalIcon className="w-3.5 h-3.5" /> Terminal
            </button>
            {menu === 'term' && (
              <div className="fc-team-menu">
                {terminals.length ? (
                  terminals.map((t) =>
                    isTerminalShared(t.id) ? (
                      <button key={t.id} onClick={() => run(() => stopTerminal(t.id), 'Teilen beendet.')}>
                        <Square className="w-3 h-3" /> {t.title} – beenden
                      </button>
                    ) : (
                      <button key={t.id} onClick={() => run(() => shareTerminal(pid, t.id, t.title), 'Terminal geteilt – dein Team kann zuschauen.')}>
                        {t.title}
                      </button>
                    ),
                  )
                ) : (
                  <div className="fc-team-empty">Kein offenes Terminal.</div>
                )}
              </div>
            )}
          </div>
          <div className="relative">
            <button className="fc-team-btn" onClick={() => setMenu(menu === 'agent' ? '' : 'agent')}>
              <Bot className="w-3.5 h-3.5" /> Agent-Session
            </button>
            {menu === 'agent' && (
              <div className="fc-team-menu">
                {harnessSessions().length ? (
                  harnessSessions().map((s) => (
                    <button key={s.id} onClick={() => run(() => shareAgentSession(pid, s.id, s.title), 'Agent-Session geteilt – Aufträge bestätigst du per Popup.')}>
                      {s.title}
                    </button>
                  ))
                ) : (
                  <div className="fc-team-empty">Starte zuerst eine FancyCode-Session.</div>
                )}
              </div>
            )}
          </div>
          <button className="fc-team-btn" onClick={() => shareFile(pid).catch((e) => flash(e.message))}>
            <FileCode2 className="w-3.5 h-3.5" /> Datei live
          </button>
          {note && <span className="text-xs text-sky-300 ml-2">{note}</span>}
        </div>
      )}
      {error ? (
        <div className="flex-1 grid place-items-center text-zinc-400 text-sm">{error}</div>
      ) : (
        <div ref={host} className="fc-team-host flex-1 min-h-0 rounded-2xl overflow-hidden border border-white/10" />
      )}
    </div>
  );
}
