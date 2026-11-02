// FancyAgent-Collab in FancyCode Desktop: eine Verbindung für die ganze App (Popups überall, Chat im Bereich „Team“).
// Gemeinsamer Client aus /root/fancyservers-collab (src/vendor/fancyservers-collab, per `npm run sync` kopiert).
import { CollabClient, startCollab } from '../vendor/fancyservers-collab/collab.js';
import '../vendor/fancyservers-collab/collab.css';

type Team = ReturnType<typeof startCollab>;
let team: Team | null = null;
let starting: Promise<Team | null> | null = null;
let showChat: () => void = () => {};
const hooks = {
  agentTask: null as null | ((t: { project: number; doc: string; text: string; from: any }) => void),
  openDoc: null as null | ((d: { project: number; doc: string; kind: string; title: string }) => void),
  openTerminal: null as null | ((t: { project: number; sid: string; title: string; owner: any }) => void),
};

export function setShowChat(fn: () => void) {
  showChat = fn;
}
export function setTeamHooks(h: Partial<typeof hooks>) {
  Object.assign(hooks, h);
}
export const currentTeam = () => team;

/** Startet die Verbindung, sobald ein FancyServers-Konto angemeldet ist. Mehrfach-Aufrufe sind harmlos. */
export function startTeam(): Promise<Team | null> {
  if (team) return Promise.resolve(team);
  if (starting) return starting;
  const api = window.agentWorkspace?.fancyAccount;
  if (!api?.collabToken) return Promise.resolve(null);
  starting = (async () => {
    let { hub, token, error } = await api.collabToken();
    if (!token) throw new Error(error || 'FancyAgent nicht erreichbar.');
    const client = new CollabClient({ hub, mode: 'device', token, app: 'fancycode' });
    client.on('auth-lost', async () => {
      // Gerät wurde in FancyAgent getrennt: neu anmelden (braucht wieder eine Bestätigung).
      team?.stop();
      team = null;
      ({ token } = await api.collabToken({ reset: true }));
    });
    team = startCollab({
      client,
      app: 'fancycode',
      onShowChat: () => showChat(),
      onAgentTask: (t) => hooks.agentTask?.(t),
      chat: {
        docKinds: ['text', 'agent-session'],
        onOpenDoc: (d) => hooks.openDoc?.(d),
        onOpenTerminal: (t) => hooks.openTerminal?.(t),
        openExternal: (url) => window.open(url, '_blank', 'noopener'),
      },
    });
    // Live-Arbeit (Terminal, Agent-Session, Dateien) erst nach dem Start laden (CodeMirror/xterm sind groß).
    import('./live').then((m) => m.initLive()).catch((e) => console.warn('[team] live', e));
    return team;
  })().finally(() => {
    starting = null;
  });
  return starting;
}

export function stopTeam() {
  team?.stop();
  team = null;
}
