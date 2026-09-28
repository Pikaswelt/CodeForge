import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Download, Ear, Loader2, Mic, Trash2, X } from 'lucide-react';
import type { WhisperStatus } from '../electron.d';
import {
  closeInstallPrompt,
  refreshWhisperStatus,
  startDictation,
  syncWakeMode,
  updateVoiceSettings,
  useVoiceSettings,
  useVoiceState,
  type VoiceSettings,
} from '../voice';

const LANGUAGES = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'auto', label: 'Automatisch' },
];

type Progress = { label?: string; percent?: number; error?: string; done?: boolean } | null;

function useWhisperInstall() {
  const [status, setStatus] = useState<WhisperStatus | null>(null);
  const [progress, setProgress] = useState<Progress>(null);

  useEffect(() => {
    void refreshWhisperStatus().then(setStatus);
    return window.agentWorkspace?.onWhisperProgress?.((payload) => {
      if (payload.type === 'progress') setProgress({ label: payload.label, percent: payload.percent });
      else if (payload.type === 'done') setProgress({ percent: 100, done: true });
      else setProgress({ error: payload.error });
    });
  }, []);

  const install = async (model: string) => {
    setProgress({ label: 'Starte Download...', percent: 0 });
    const result = await window.agentWorkspace!.whisperInstall({ model });
    setStatus(result.status);
    await refreshWhisperStatus();
    if (!result.ok) setProgress({ error: result.error });
    return result.ok;
  };

  const remove = async () => {
    setStatus((await window.agentWorkspace?.whisperRemove()) || null);
    await refreshWhisperStatus();
    setProgress(null);
  };

  return { status, progress, install, remove };
}

function ProgressBar({ progress }: { progress: Progress }) {
  if (!progress) return null;
  if (progress.error) return <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{progress.error}</div>;
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
        <span>{progress.done ? 'Fertig installiert' : progress.label || 'Lade...'}</span>
        <span>{progress.percent ?? 0}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${Math.max(2, progress.percent ?? 0)}%` }} />
      </div>
    </div>
  );
}

// Asks to install Whisper the first time voice input is used.
export function VoiceInstallModal() {
  const state = useVoiceState();
  const settings = useVoiceSettings();
  const { progress, install } = useWhisperInstall();
  const [model, setModel] = useState(settings.model);
  const [busy, setBusy] = useState(false);

  if (!state.installPrompt) return null;

  const run = async () => {
    setBusy(true);
    const ok = await install(model);
    setBusy(false);
    if (ok) {
      updateVoiceSettings({ model });
      closeInstallPrompt();
      void syncWakeMode();
      void startDictation();
    }
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[400] grid place-items-center bg-black/60 backdrop-blur-sm">
        <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} className="w-[440px] rounded-2xl border border-white/10 bg-[#161316] p-6 shadow-2xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10">
                <Mic className="h-5 w-5 text-amber-300" />
              </span>
              <div>
                <div className="text-base font-medium text-white">Whisper installieren?</div>
                <div className="text-xs text-zinc-500">Lokale Spracherkennung, laeuft offline auf deinem PC.</div>
              </div>
            </div>
            {!busy && (
              <button onClick={closeInstallPrompt} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-400">
            Fuer die Spracheingabe laedt CodeForge einmalig Whisper (ca. 8 MB) und ein Sprachmodell herunter. Danach funktioniert alles ohne Internet.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(['base', 'small'] as const).map((id) => (
              <button
                key={id}
                disabled={busy}
                onClick={() => setModel(id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${model === id ? 'border-amber-400/60 bg-amber-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
              >
                <div className="text-sm text-white">{id === 'base' ? 'Schnell' : 'Genau'}</div>
                <div className="text-[11px] text-zinc-500">{id === 'base' ? 'Base · 148 MB' : 'Small · 488 MB'}</div>
              </button>
            ))}
          </div>
          <ProgressBar progress={progress} />
          <div className="mt-5 flex gap-2">
            <button disabled={busy} onClick={closeInstallPrompt} className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05] disabled:opacity-40">
              Nein
            </button>
            <button disabled={busy} onClick={() => void run()} className="primary-button flex flex-[2] items-center justify-center gap-2 !py-2.5 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {busy ? 'Installiere...' : 'Ja, installieren'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Small floating indicator while the microphone is active.
export function VoiceIndicator() {
  const state = useVoiceState();
  const settings = useVoiceSettings();
  if (state.mode === 'off' && !state.error) return null;
  if (state.mode === 'off' && state.error) {
    return (
      <div className="fixed bottom-4 left-1/2 z-[300] -translate-x-1/2 rounded-full border border-red-500/30 bg-[#1a1215]/95 px-4 py-2 text-xs text-red-300 shadow-xl">
        {state.error}
      </div>
    );
  }
  const dictating = state.mode === 'dictating';
  return (
    <div
      className={`fixed bottom-4 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-2.5 rounded-full border px-4 py-2 text-xs shadow-xl backdrop-blur-xl ${
        dictating ? 'border-red-500/40 bg-[#1a1215]/95 text-red-200' : 'border-white/10 bg-[#141214]/90 text-zinc-400'
      }`}
    >
      {dictating ? <Mic className="h-3.5 w-3.5" /> : <Ear className="h-3.5 w-3.5" />}
      <span className="flex h-3 items-end gap-0.5">
        {[0.5, 1, 0.7].map((factor, index) => (
          <span
            key={index}
            className={`w-0.5 rounded-full ${dictating ? 'bg-red-400' : 'bg-zinc-500'}`}
            style={{ height: `${Math.max(20, Math.min(100, state.level * 100 * factor))}%` }}
          />
        ))}
      </span>
      <span>
        {dictating
          ? state.transcribing
            ? 'Erkenne...'
            : state.wakeTriggered
              ? 'Hoere zu... (Pause beendet)'
              : 'Hoere zu... (Alt+S beendet)'
          : `Warte auf "${settings.wakeWord}"`}
      </span>
      {state.error && <span className="text-red-300">· {state.error}</span>}
    </div>
  );
}

// "Sprache" tab in the settings.
export function VoiceSettingsSection() {
  const settings = useVoiceSettings();
  const { status, progress, install, remove } = useWhisperInstall();
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<VoiceSettings>) => updateVoiceSettings(patch);
  const modelInstalled = Boolean(status?.models?.[settings.model]);

  return (
    <div className="space-y-7">
      <section>
        <div className="section-label">Spracheingabe</div>
        <div className="mt-3 space-y-2">
          <Toggle label="Spracheingabe aktiv" description="Aus = Mikrofon-Buttons, Hotkey und Wake-Word ueberall deaktiviert." checked={settings.enabled} onChange={(value) => set({ enabled: value })} />
        </div>
      </section>

      <section>
        <div className="section-label">Whisper</div>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              {status?.installed ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Download className="h-4 w-4 text-zinc-500" />}
              {status?.installed ? 'Installiert' : 'Nicht installiert'}
            </div>
            {status?.installed && (
              <button onClick={() => void remove()} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:bg-red-500/10 hover:text-red-300">
                <Trash2 className="h-3 w-3" /> Deinstallieren
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(['base', 'small'] as const).map((id) => (
              <button
                key={id}
                onClick={() => set({ model: id })}
                className={`rounded-lg border px-3 py-2 text-left ${settings.model === id ? 'border-amber-400/60 bg-amber-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
              >
                <div className="flex items-center justify-between text-xs text-white">
                  {id === 'base' ? 'Base (schnell)' : 'Small (genau)'}
                  {status?.models?.[id] && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                </div>
                <div className="text-[10px] text-zinc-500">{id === 'base' ? '148 MB' : '488 MB'}</div>
              </button>
            ))}
          </div>
          {(!status?.installed || !modelInstalled) && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await install(settings.model);
                setBusy(false);
                void syncWakeMode();
              }}
              className="primary-button mt-3 flex w-full items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {status?.installed ? 'Modell herunterladen' : 'Whisper installieren'}
            </button>
          )}
          <ProgressBar progress={progress} />
        </div>
      </section>

      <section>
        <div className="section-label">Erkennung</div>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] text-zinc-500">Sprache</span>
            <select value={settings.language} onChange={(event) => set({ language: event.target.value })} className="input w-full">
              {LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>{language.label}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-zinc-500">Praefix (vor dem Text)</span>
              <input value={settings.prefix} onChange={(event) => set({ prefix: event.target.value })} className="input w-full" placeholder="z.B. Bitte: " />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-zinc-500">Suffix (nach dem Text)</span>
              <input value={settings.suffix} onChange={(event) => set({ suffix: event.target.value })} className="input w-full" placeholder="z.B.  Danke." />
            </label>
          </div>
          <Toggle label="Automatisch senden" description="Nach dem Diktat Enter druecken (Chat senden / Terminal-Befehl ausfuehren)." checked={settings.autoSend} onChange={(value) => set({ autoSend: value })} />
          <label className="block">
            <span className="mb-1 block text-[11px] text-zinc-500">Sende-Wort (optional)</span>
            <input value={settings.stopWord} onChange={(event) => set({ stopWord: event.target.value })} className="input w-full" placeholder="z.B. senden" />
            <span className="mt-1 block text-[10px] text-zinc-600">Sagst du dieses Wort am Ende, stoppt die Aufnahme und der Text wird abgeschickt.</span>
          </label>
        </div>
      </section>

      <section>
        <div className="section-label">Wake-Word</div>
        <div className="mt-3 space-y-3">
          <Toggle
            label="Immer zuhoeren"
            description="CodeForge hoert dauerhaft zu. Sagst du das Wake-Word, startet das Diktat. Eine Sprechpause beendet es."
            checked={settings.wakeWordEnabled}
            onChange={(value) => set({ wakeWordEnabled: value })}
          />
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-zinc-500">Wake-Word</span>
              <input value={settings.wakeWord} onChange={(event) => set({ wakeWord: event.target.value })} className="input w-full" placeholder="Computer" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-zinc-500">Ende nach Pause (s)</span>
              <input
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={settings.wakeEndSilenceSec}
                onChange={(event) => set({ wakeEndSilenceSec: Math.max(1, Math.min(10, Number(event.target.value) || 2.5)) })}
                className="input w-full"
              />
            </label>
          </div>
          <p className="text-[10px] text-zinc-600">Tipp: kurze, eindeutige Woerter wie "Computer" oder "Jarvis" werden am zuverlaessigsten erkannt.</p>
        </div>
      </section>

      <section>
        <div className="section-label">Buttons im Terminal / Chat anzeigen</div>
        <div className="mt-3 space-y-2">
          <Toggle label="Spracheingabe-Button" checked={settings.showMicButton} onChange={(value) => set({ showMicButton: value })} />
          <Toggle label="Start-Befehl-Button" checked={settings.showStartCommandButton} onChange={(value) => set({ showStartCommandButton: value })} />
          <Toggle label="Praefix/Suffix-Button" checked={settings.showPrefixSuffixButton} onChange={(value) => set({ showPrefixSuffixButton: value })} />
        </div>
      </section>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-3 transition-all hover:border-white/20 hover:bg-white/[0.05]"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-200">{label}</div>
        {description && <div className="mt-0.5 text-[10px] leading-snug text-zinc-500">{description}</div>}
      </div>
      <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-amber-400' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </div>
  );
}
