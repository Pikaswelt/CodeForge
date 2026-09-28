import { useSyncExternalStore } from 'react';
import type { WhisperStatus } from './electron.d';

// Voice input: microphone capture with a simple energy-based voice activity
// detector, transcription through the local Whisper server (main process) and
// an optional always-on wake word mode. One engine for the whole app; views
// register a "target" that receives the recognized text.

export type VoiceSettings = {
  enabled: boolean;
  showMicButton: boolean;
  showStartCommandButton: boolean;
  showPrefixSuffixButton: boolean;
  language: string;
  model: 'base' | 'small';
  prefix: string;
  suffix: string;
  autoSend: boolean;
  stopWord: string;
  wakeWordEnabled: boolean;
  wakeWord: string;
  wakeEndSilenceSec: number;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  showMicButton: true,
  showStartCommandButton: true,
  showPrefixSuffixButton: true,
  language: 'de',
  model: 'base',
  prefix: '',
  suffix: '',
  autoSend: false,
  stopWord: '',
  wakeWordEnabled: false,
  wakeWord: 'Computer',
  wakeEndSilenceSec: 2.5,
};

export type VoiceTarget = {
  insert(text: string): void;
  submit?(): void;
};

export type VoiceState = {
  mode: 'off' | 'dictating' | 'wake';
  // Dictation started by the wake word (ends by silence) or by button.
  wakeTriggered: boolean;
  recording: boolean;
  transcribing: boolean;
  level: number;
  error: string;
  installPrompt: boolean;
  lastText: string;
};

const SETTINGS_KEY = 'agentWorkspace.voiceSettings';
const SAMPLE_RATE = 16000;
const FRAME = 1024; // 64 ms at 16 kHz
const PRE_ROLL_FRAMES = 5;
const MAX_SEGMENT_SEC = 25;

type Listener = () => void;

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(patch: Partial<T>) {
      value = { ...value, ...patch };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function loadSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(raw) } : DEFAULT_VOICE_SETTINGS;
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

const settingsStore = createStore<VoiceSettings>(loadSettings());
const stateStore = createStore<VoiceState>({
  mode: 'off',
  wakeTriggered: false,
  recording: false,
  transcribing: false,
  level: 0,
  error: '',
  installPrompt: false,
  lastText: '',
});

export function updateVoiceSettings(patch: Partial<VoiceSettings>) {
  settingsStore.set(patch);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsStore.get()));
  } catch {
    // storage full or unavailable: keep in memory
  }
  syncWakeMode();
}

let errorTimer = 0;
let shownError = '';
stateStore.subscribe(() => {
  const { error } = stateStore.get();
  if (error === shownError) return;
  shownError = error;
  if (!error) return;
  window.clearTimeout(errorTimer);
  errorTimer = window.setTimeout(() => {
    if (stateStore.get().error === error) stateStore.set({ error: '' });
  }, 6000);
});

export function useVoiceSettings() {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
}

export function useVoiceState() {
  return useSyncExternalStore(stateStore.subscribe, stateStore.get);
}

export function getVoiceState() {
  return stateStore.get();
}

// ---------- targets ----------

const targets: { id: number; target: VoiceTarget }[] = [];
let nextTargetId = 1;

export function registerVoiceTarget(target: VoiceTarget) {
  const id = nextTargetId++;
  targets.push({ id, target });
  return () => {
    const index = targets.findIndex((item) => item.id === id);
    if (index >= 0) targets.splice(index, 1);
  };
}

const currentTarget = () => targets[targets.length - 1]?.target;

// ---------- whisper status ----------

let whisperStatus: WhisperStatus | null = null;

export async function refreshWhisperStatus() {
  whisperStatus = (await window.agentWorkspace?.whisperStatus?.()) || null;
  return whisperStatus;
}

async function ensureInstalled() {
  if (!window.agentWorkspace?.whisperStatus) {
    stateStore.set({ error: 'Spracheingabe ist nur in der Desktop-App verfuegbar.' });
    return false;
  }
  const status = whisperStatus?.installed ? whisperStatus : await refreshWhisperStatus();
  if (!status?.installed) {
    stateStore.set({ installPrompt: true });
    return false;
  }
  return true;
}

export function closeInstallPrompt() {
  stateStore.set({ installPrompt: false });
}

// ---------- microphone capture + VAD ----------

type Capture = {
  stream: MediaStream;
  context: AudioContext;
  node: ScriptProcessorNode;
};

let capture: Capture | null = null;
let speechFrames: Float32Array[] = [];
let preRoll: Float32Array[] = [];
let inSpeech = false;
let silentFrames = 0;
let loudFrames = 0;
let noiseFloor = 0.005;
let lastSpeechAt = 0;
let finishing = false;

async function startCapture() {
  if (capture) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  // Record at the device rate and resample ourselves: a 16 kHz AudioContext
  // does not work with every microphone driver.
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const node = context.createScriptProcessor(4096, 1, 1);
  const resample = createResampler(context.sampleRate);
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(context.destination);
  node.onaudioprocess = (event) => resample(event.inputBuffer.getChannelData(0)).forEach(onFrame);
  capture = { stream, context, node };
  resetSegment();
  void window.agentWorkspace?.whisperWarmUp?.(settingsStore.get().model);
}

// Converts device-rate audio to 16 kHz frames of FRAME samples (box filter).
function createResampler(inputRate: number) {
  const ratio = inputRate / SAMPLE_RATE;
  let pending: number[] = [];
  let position = 0;
  let carry = new Float32Array(0);
  return (input: Float32Array) => {
    const data = new Float32Array(carry.length + input.length);
    data.set(carry);
    data.set(input, carry.length);
    while (position + ratio <= data.length) {
      const start = Math.floor(position);
      const end = Math.max(start + 1, Math.floor(position + ratio));
      let sum = 0;
      for (let i = start; i < end; i += 1) sum += data[i];
      pending.push(sum / (end - start));
      position += ratio;
    }
    const consumed = Math.floor(position);
    carry = data.slice(consumed);
    position -= consumed;
    const frames: Float32Array[] = [];
    while (pending.length >= FRAME) {
      frames.push(Float32Array.from(pending.slice(0, FRAME)));
      pending = pending.slice(FRAME);
    }
    return frames;
  };
}

function stopCapture() {
  if (!capture) return;
  capture.node.onaudioprocess = null;
  capture.stream.getTracks().forEach((track) => track.stop());
  void capture.context.close().catch(() => {});
  capture = null;
  resetSegment();
  stateStore.set({ recording: false, level: 0 });
}

function resetSegment() {
  speechFrames = [];
  preRoll = [];
  inSpeech = false;
  silentFrames = 0;
  loudFrames = 0;
}

function onFrame(frame: Float32Array) {
  if (finishing) return;
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / frame.length);
  if (!inSpeech) noiseFloor = noiseFloor * 0.97 + Math.min(rms, 0.05) * 0.03;
  const threshold = Math.max(0.012, noiseFloor * 3);
  const loud = rms > threshold;
  const state = stateStore.get();
  const level = Math.min(1, rms * 12);
  if (Math.abs(level - state.level) > 0.04) stateStore.set({ level });

  const settings = settingsStore.get();
  const silenceLimit = Math.round((state.mode === 'wake' ? 0.7 : 0.9) * SAMPLE_RATE / FRAME);

  if (!inSpeech) {
    preRoll.push(frame);
    if (preRoll.length > PRE_ROLL_FRAMES) preRoll.shift();
    loudFrames = loud ? loudFrames + 1 : 0;
    if (loudFrames >= 2) {
      inSpeech = true;
      silentFrames = 0;
      speechFrames = [...preRoll];
      preRoll = [];
      lastSpeechAt = Date.now();
      stateStore.set({ recording: true });
    }
    // Wake-triggered dictation ends after a pause without new speech.
    if (state.mode === 'dictating' && state.wakeTriggered && !state.transcribing && pending === 0) {
      if (Date.now() - lastSpeechAt > settings.wakeEndSilenceSec * 1000) void finishDictation();
    }
    return;
  }

  speechFrames.push(frame);
  if (loud) {
    silentFrames = 0;
    lastSpeechAt = Date.now();
  } else {
    silentFrames += 1;
  }
  const tooLong = speechFrames.length * FRAME >= MAX_SEGMENT_SEC * SAMPLE_RATE;
  if (silentFrames >= silenceLimit || tooLong) {
    const frames = speechFrames;
    resetSegment();
    stateStore.set({ recording: false });
    // Ignore clicks and very short noises.
    if (frames.length * FRAME >= SAMPLE_RATE * 0.35) enqueue(frames);
  }
}

// ---------- transcription queue ----------

let queue: Promise<void> = Promise.resolve();
let pending = 0;
let insertedInSession = false;

function enqueue(frames: Float32Array[]) {
  pending += 1;
  stateStore.set({ transcribing: true });
  queue = queue.then(async () => {
    try {
      const settings = settingsStore.get();
      const mode = stateStore.get().mode;
      if (mode === 'off') return;
      const result = await window.agentWorkspace!.whisperTranscribe({
        audio: encodeWav(frames),
        language: settings.language,
        model: settings.model,
        prompt: mode === 'wake' ? settings.wakeWord : undefined,
      });
      if (!result.ok) {
        stateStore.set({ error: result.error || 'Transkription fehlgeschlagen.' });
        return;
      }
      handleText(result.text || '');
    } finally {
      pending -= 1;
      lastSpeechAt = Date.now();
      if (pending === 0) stateStore.set({ transcribing: false });
    }
  });
}

function handleText(text: string) {
  if (!text) return;
  const settings = settingsStore.get();
  const state = stateStore.get();
  if (state.mode === 'wake') {
    const remainder = matchWakeWord(text, settings.wakeWord);
    if (remainder === null) return;
    beep(880);
    insertedInSession = false;
    stateStore.set({ mode: 'dictating', wakeTriggered: true, error: '' });
    lastSpeechAt = Date.now();
    if (remainder) handleText(remainder);
    return;
  }
  if (state.mode !== 'dictating') return;

  let spoken = text;
  let stop = false;
  if (settings.stopWord.trim()) {
    const stripped = stripStopWord(spoken, settings.stopWord);
    if (stripped !== null) {
      spoken = stripped;
      stop = true;
    }
  }
  if (spoken) insertText(spoken);
  stateStore.set({ lastText: spoken });
  if (stop) void finishDictation(true);
}

function insertText(text: string) {
  const target = currentTarget();
  if (!target) {
    stateStore.set({ error: 'Kein Eingabefeld offen. Oeffne einen Chat oder ein Terminal.' });
    return;
  }
  const settings = settingsStore.get();
  const piece = insertedInSession ? ` ${text}` : `${settings.prefix}${text}`;
  insertedInSession = true;
  target.insert(piece);
}

// ---------- public controls ----------

export async function startDictation() {
  if (!settingsStore.get().enabled) return;
  if (!(await ensureInstalled())) return;
  try {
    insertedInSession = false;
    stateStore.set({ mode: 'dictating', wakeTriggered: false, error: '', lastText: '' });
    await startCapture();
    beep(660);
  } catch (error) {
    stateStore.set({ mode: 'off', error: micError(error) });
    stopCapture();
  }
}

export async function finishDictation(forceSend = false) {
  const state = stateStore.get();
  if (state.mode !== 'dictating') return;
  // Flush the running segment so the last words are not lost.
  if (inSpeech && speechFrames.length) {
    const frames = speechFrames;
    resetSegment();
    enqueue(frames);
  }
  const wasWake = state.wakeTriggered;
  // Stay in "dictating" until the queue is empty so queued text still lands,
  // but stop cutting new segments.
  finishing = true;
  try {
    await queue;
  } finally {
    finishing = false;
  }
  const settings = settingsStore.get();
  const target = currentTarget();
  if (insertedInSession && target) {
    if (settings.suffix) target.insert(settings.suffix);
    if (settings.autoSend || forceSend) target.submit?.();
  }
  insertedInSession = false;
  if (settings.enabled && settings.wakeWordEnabled && whisperStatus?.installed) {
    stateStore.set({ mode: 'wake', wakeTriggered: false });
    if (wasWake) beep(440);
  } else {
    stateStore.set({ mode: 'off', wakeTriggered: false });
    stopCapture();
  }
}

export function toggleDictation() {
  const state = stateStore.get();
  if (state.mode === 'dictating') void finishDictation();
  else void startDictation();
}

export function stopVoice() {
  stateStore.set({ mode: 'off', wakeTriggered: false });
  stopCapture();
}

// Starts or stops the always-on wake word listener to match the settings.
export async function syncWakeMode() {
  const settings = settingsStore.get();
  const state = stateStore.get();
  const want = settings.enabled && settings.wakeWordEnabled;
  if (!want) {
    if (state.mode === 'wake') stopVoice();
    return;
  }
  if (state.mode !== 'off') return;
  const status = await refreshWhisperStatus();
  if (!status?.installed) return;
  try {
    stateStore.set({ mode: 'wake', error: '' });
    await startCapture();
  } catch (error) {
    stateStore.set({ mode: 'off', error: micError(error) });
  }
}

// ---------- helpers ----------

function micError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError') return 'Mikrofonzugriff verweigert (Windows: Einstellungen > Datenschutz > Mikrofon).';
  if (name === 'NotFoundError') return 'Kein Mikrofon gefunden.';
  return error instanceof Error ? error.message : 'Mikrofon konnte nicht gestartet werden.';
}

function encodeWav(frames: Float32Array[]) {
  const length = frames.reduce((total, frame) => total + frame.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, frame[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
}

function normalizeWord(word: string) {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}

// Finds the wake word (fuzzy, also when whisper splits or merges words) and
// returns the text spoken after it, or null when it was not said.
export function matchWakeWord(text: string, wakeWord: string): string | null {
  const wake = normalizeWord(wakeWord);
  if (!wake) return null;
  const words = text.split(/\s+/).filter(Boolean);
  const wakeCount = wakeWord.split(/\s+/).filter(Boolean).length;
  for (let start = 0; start < words.length; start += 1) {
    for (let size = Math.max(1, wakeCount - 1); size <= wakeCount + 1 && start + size <= words.length; size += 1) {
      const candidate = normalizeWord(words.slice(start, start + size).join(''));
      if (similarity(candidate, wake) >= (wake.length <= 5 ? 0.8 : 0.72)) {
        return words.slice(start + size).join(' ').replace(/^[\s,.!?:;-]+/, '');
      }
    }
  }
  return null;
}

function stripStopWord(text: string, stopWord: string): string | null {
  const words = text.trim().split(/\s+/);
  const stopCount = stopWord.trim().split(/\s+/).length;
  if (words.length < stopCount) return null;
  const tail = normalizeWord(words.slice(-stopCount).join(''));
  if (similarity(tail, normalizeWord(stopWord)) < 0.8) return null;
  return words.slice(0, -stopCount).join(' ').replace(/[\s,;:-]+$/, '');
}

function beep(frequency: number) {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
    oscillator.onended = () => void context.close();
  } catch {
    // audio output unavailable
  }
}


// Appends a dictated piece to text in an input field with sensible spacing.
export function appendSpoken(current: string, piece: string) {
  if (!current || /\s$/.test(current) || /^\s/.test(piece)) return current + piece;
  return `${current} ${piece}`;
}
