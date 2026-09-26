import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Box,
  Check,
  ChevronDown,
  Gamepad2,
  GitBranch,
  Gauge,
  Mic,
  Monitor,
  Paperclip,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { PROVIDER_MODELS, useAppContext } from '../AppContext';
import type { AccessMode, ProviderId, ReasoningEffort } from '../types';

const ACCESS_OPTIONS: { id: AccessMode; label: string; description: string }[] = [
  { id: 'read-only', label: 'Nur lesen', description: 'Keine Dateiaenderungen erlauben' },
  { id: 'workspace-write', label: 'Projektzugriff', description: 'Im Projekt lesen und schreiben' },
  { id: 'full', label: 'Voller Zugriff', description: 'Auch Befehle ohne Sandbox erlauben' },
];

const INTELLIGENCE_OPTIONS: { id: ReasoningEffort; label: string; description: string }[] = [
  { id: 'low', label: 'Niedrig', description: 'Schneller, weniger Ausfuehrlichkeit' },
  { id: 'medium', label: 'Standard', description: 'Ausgewogene Logik' },
  { id: 'high', label: 'Hoch', description: 'Tiefere Analyse fuer komplexe Aufgaben' },
];

const PROVIDER_OPTIONS: { id: ProviderId; label: string; description: string }[] = [
  { id: 'antigravity', label: 'Antigravity', description: 'agy CLI' },
  { id: 'openai', label: 'Codex', description: 'OpenAI Codex CLI' },
  { id: 'anthropic', label: 'Claude', description: 'Claude Code CLI' },
  { id: 'cursor', label: 'Cursor', description: 'Cursor Agent CLI' },
  { id: 'opencode', label: 'OpenCode', description: 'OpenCode CLI' },
  { id: 'freebuff', label: 'FreeBuff', description: 'FreeBuff CLI' },
];

export default function InputArea() {
  const {
    provider,
    setProvider,
    aiModel,
    setAiModel,
    reasoningEffort,
    setReasoningEffort,
    accessMode,
    setAccessMode,
    sendMessage,
    cancelRun,
    isSending,
    folders,
    selectedFolderId,
    selectFolder,
    addProject,
    createNewProject,
    selectedProject,
    attachments,
    addAttachments,
    removeAttachment,
    cliStatus,
    installCli,
    gitInfo,
    branches,
    switchBranch,
    usage,
    refreshProviderUsage,
    lyzDevPluginEnabled,
    originalPluginEnabled,
    sendAgentInput,
    chats,
    selectedChatId,
    sendEscKey,
    mobileMode,
  } = useAppContext();
  const [text, setText] = useState('');
  const [dropdown, setDropdown] = useState<'access' | 'provider' | 'model' | 'project' | 'runtime' | 'usage' | 'branch' | null>(
    null,
  );
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const recognitionRef = useRef<any>(null);

  const send = async () => {
    const isInteractiveInput = isSending && originalPluginEnabled;
    if (!text.trim() || (isSending && !isInteractiveInput)) return;
    setError('');
    const prompt = text.trim();
    setText('');
    try {
      if (isInteractiveInput) {
        await sendAgentInput(prompt);
      } else {
        await sendMessage(prompt);
      }
    } catch (sendError) {
      setText(prompt);
      setError(sendError instanceof Error ? sendError.message : 'Nachricht konnte nicht gesendet werden.');
    }
  };

  const nativeSpeechCleanupRef = useRef<(() => void) | null>(null);

  const stopDictation = () => {
    if (window.agentWorkspace?.stopSpeechRecognition) {
      window.agentWorkspace.stopSpeechRecognition().catch(() => {});
    }
    if (nativeSpeechCleanupRef.current) {
      nativeSpeechCleanupRef.current();
      nativeSpeechCleanupRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.error(e);
      }
      recognitionRef.current = null;
    }
    setListening(false);
  };

  const startDictation = async () => {
    if (listening) {
      stopDictation();
      return;
    }

    setError('');

    // 1. Electron Native Windows Speech Engine (Offline, 100% reliable)
    if (window.agentWorkspace?.startSpeechRecognition && window.agentWorkspace?.onSpeechResult) {
      try {
        setListening(true);
        if (nativeSpeechCleanupRef.current) {
          nativeSpeechCleanupRef.current();
        }

        const unsub = window.agentWorkspace.onSpeechResult((payload) => {
          if (payload.type === 'final' && payload.text) {
            setText((current) => `${current}${current ? ' ' : ''}${payload.text}`);
          } else if (payload.type === 'error') {
            setError(`Spracherkennungsfehler: ${payload.error || 'Unbekannt'}`);
            setListening(false);
          } else if (payload.type === 'stopped') {
            setListening(false);
          }
        });
        nativeSpeechCleanupRef.current = unsub;

        const res = await window.agentWorkspace.startSpeechRecognition({ lang: navigator.language || 'de-DE' });
        if (!res.ok && res.error) {
          console.warn('[Speech] Native speech warning:', res.error);
        }
        return;
      } catch (err) {
        console.error('[Speech] Native speech error, falling back to Web Speech:', err);
      }
    }

    // 2. Web Speech API Fallback (Browser / Android)
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Spracherkennung wird auf diesem System nicht unterstuetzt.');
      setListening(false);
      return;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (permErr) {
      console.error('Mikrofon-Zugriff verweigert:', permErr);
      setError('Mikrofon-Zugriff wurde verweigert.');
      setListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = navigator.language || 'de-DE';
      recognition.interimResults = false;
      recognition.continuous = true;
      recognition.onstart = () => {
        setListening(true);
        setError('');
      };
      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };
      recognition.onerror = (event: any) => {
        setListening(false);
        recognitionRef.current = null;
        const errName = event?.error;
        if (errName === 'not-allowed') {
          setError('Mikrofon-Zugriff wurde nicht erlaubt.');
        } else if (errName === 'audio-capture') {
          setError('Kein Mikrofon gefunden.');
        } else if (errName === 'network') {
          setError('Web-Spracherkennung verlangt Internetverbindung.');
        } else if (errName !== 'no-speech') {
          setError(`Spracherkennungsfehler: ${errName || 'Unbekannt'}`);
        }
      };
      recognition.onresult = (event: any) => {
        const results = event.results;
        for (let i = event.resultIndex || 0; i < results.length; i++) {
          if (results[i].isFinal) {
            const transcript = results[i][0]?.transcript;
            if (transcript) {
              setText((current) => `${current}${current ? ' ' : ''}${transcript}`);
            }
          }
        }
      };
      recognition.start();
    } catch (err) {
      console.error(err);
      setListening(false);
      setError('Spracherkennung konnte nicht gestartet werden.');
    }
  };

  useEffect(() => {
    return () => {
      stopDictation();
    };
  }, []);

  const access = ACCESS_OPTIONS.find((option) => option.id === accessMode)!;
  const models = PROVIDER_MODELS[provider];
  const selectedModel = models.find((model) => model.id === aiModel) || models[0];
  const intelligence = getModelIntelligence(provider, selectedModel.id, reasoningEffort);
  const modelRows = getModelRows(provider);
  const intelligenceOptions = getAvailableIntelligenceOptions(provider, selectedModel.id);
  const runtime = cliStatus[provider];
  const remainingTokens = usage.tokenLimit > 0 ? Math.max(0, usage.tokenLimit - usage.totalTokens) : null;
  const selectedProvider = PROVIDER_OPTIONS.find((option) => option.id === provider)!;

  return (
    <div className="w-full max-w-[760px] mt-4">
      <div className="composer-shell bg-[#181516] border border-white/10 rounded-[18px] shadow-2xl focus-within:border-white/20 transition-all p-1">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {attachments.map((file) => (
              <div
                key={file}
                title={file}
                className="flex items-center gap-1.5 max-w-52 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[11px] text-zinc-400"
              >
                <Paperclip className="w-3 h-3 shrink-0" />
                <span className="truncate">{file.split(/[\\/]/).at(-1)}</span>
                <button onClick={() => removeAttachment(file)} className="hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 pt-3 pb-1 max-h-56 overflow-y-auto custom-scrollbar">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            className="w-full bg-transparent text-white placeholder-zinc-600 text-[15px] outline-none resize-none min-h-[48px]"
            placeholder={
              isSending && originalPluginEnabled
                ? 'Terminal-Eingabe: Passwort, Prompt oder y/n tippen...'
                : originalPluginEnabled
                  ? 'Nachricht sendet startet den Agent im Terminal-Modus...'
                  : selectedProject
                    ? 'Beschreibe, was im Projekt erledigt werden soll...'
                    : 'Nachricht schreiben - startet ohne Projekt im CodeForge-Arbeitsordner...'
            }
            rows={2}
          />
        </div>

        <div className="px-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 relative">
            <button
              onClick={addAttachments}
              className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5"
              title="Dateien anhaengen"
            >
              <Paperclip className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={() => setDropdown(dropdown === 'access' ? null : 'access')}
              className="flex items-center gap-1.5 text-orange-400 bg-orange-500/[0.08] px-2.5 py-1 rounded-full text-[12px] border border-orange-500/10"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {access.label}
              <ChevronDown className="w-3 h-3" />
            </button>
            <AnimatePresence>
              {dropdown === 'access' && (
                <Dropdown className="left-8 w-64">
                  {ACCESS_OPTIONS.map((option) => (
                    <DropdownButton
                      key={option.id}
                      checked={accessMode === option.id}
                      onClick={() => {
                        setAccessMode(option.id);
                        setDropdown(null);
                      }}
                      title={option.label}
                      subtitle={option.description}
                    />
                  ))}
                </Dropdown>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2 relative">
            <button
              onClick={() => setDropdown(dropdown === 'model' ? null : 'model')}
              className="flex items-center gap-2 px-3 py-1 rounded-md text-left text-zinc-300 hover:text-white bg-white/[0.03] hover:bg-white/5"
            >
              <div className="flex flex-col items-start">
                <span className="text-[13px] font-medium leading-tight">{selectedModel.name}</span>
                <span className="text-[9.5px] text-zinc-600 font-mono mt-0.5">{selectedModel.id}</span>
              </div>
              <span className="rounded-full border border-amber-400/15 bg-amber-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                {intelligence}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>
            <AnimatePresence>
              {dropdown === 'model' && (
                <Dropdown className="right-14 w-80 max-h-96 overflow-y-auto custom-scrollbar">
                  <div className="px-3 pb-2 pt-1">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                      <Sparkles className="w-3 h-3" />
                      Intelligenz
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {INTELLIGENCE_OPTIONS.map((option) => {
                        const targetModel = intelligenceOptions[option.id];
                        const available = Boolean(targetModel);
                        const active = intelligence === option.id;
                        return (
                          <button
                            key={option.id}
                            disabled={!available}
                            onClick={() => {
                              if (!targetModel) return;
                              setReasoningEffort(option.id);
                              setAiModel(targetModel.id);
                            }}
                            className={`rounded-lg border px-2 py-2 text-left transition-all ${
                              active
                                ? 'border-amber-300/30 bg-amber-300/10 text-amber-100'
                                : available
                                  ? 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.08]'
                                  : 'border-white/5 bg-black/10 text-zinc-700'
                            }`}
                          >
                            <div className="text-[11px] font-medium">{option.label}</div>
                            <div className="text-[9px] text-zinc-600">
                              {available ? option.description : 'Nicht verfuegbar'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="my-1 border-t border-white/5" />
                  {modelRows.map((model) => (
                    <DropdownButton
                      key={model.id}
                      checked={getModelBaseName(provider, aiModel) === model.name}
                      onClick={() => {
                        setAiModel(resolveModelForIntelligence(provider, model.id, reasoningEffort));
                      }}
                      title={model.name}
                      subtitle={model.subtitle}
                    />
                  ))}
                </Dropdown>
              )}
            </AnimatePresence>
            <button
              onClick={startDictation}
              className={`p-1.5 rounded-md ${listening ? 'text-red-400 bg-red-500/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
              title="Spracheingabe"
            >
              <Mic className="w-4 h-4" />
            </button>
            {(isSending || chats.find(c => c.id === selectedChatId)?.mode === 'terminal') && (
              <button
                onClick={sendEscKey}
                className="px-2 py-1 text-[11px] font-semibold tracking-wider bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700 text-zinc-300 rounded-md transition-all active:scale-95"
                title="ESC-Taste an Prozess senden"
              >
                ESC
              </button>
            )}
            {isSending ? (
              originalPluginEnabled ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={send}
                    disabled={!text.trim()}
                    className="p-2 rounded-full bg-emerald-500 text-white hover:bg-emerald-400 disabled:bg-white/10 disabled:text-zinc-600"
                    title="Terminal-Eingabe senden"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={cancelRun}
                    className="p-2 rounded-full bg-red-500 text-white hover:bg-red-400"
                    title="Agent stoppen"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={cancelRun}
                  className="p-2 rounded-full bg-red-500 text-white hover:bg-red-400"
                  title="Agent stoppen"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              )
            ) : (
              <button
                onClick={send}
                disabled={!text.trim()}
                className="p-2 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-white/10 disabled:text-zinc-600"
                title="Senden"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="px-3 pb-3 pt-1 flex items-center gap-1.5 text-[12px] relative">
          {!mobileMode && (
            <>
              <button
                onClick={() => setDropdown(dropdown === 'provider' ? null : 'provider')}
                className="context-button"
              >
                <Bot className="w-3.5 h-3.5" />
                {selectedProvider.label}
                <ChevronDown className="w-3 h-3" />
              </button>
              <AnimatePresence>
                {dropdown === 'provider' && (
                  <Dropdown className="left-3 w-64">
                    {PROVIDER_OPTIONS.map((option) => {
                      const status = cliStatus[option.id];
                      return (
                        <DropdownButton
                          key={option.id}
                          checked={provider === option.id}
                          onClick={() => {
                            setProvider(option.id);
                            setDropdown(null);
                          }}
                          title={option.label}
                          subtitle={`${option.description}${status?.installed ? ' - bereit' : ' - fehlt'}`}
                        />
                      );
                    })}
                  </Dropdown>
                )}
              </AnimatePresence>
            </>
          )}

          {lyzDevPluginEnabled && (
            <span className="context-button border-emerald-300/15 bg-emerald-300/10 text-emerald-200">
              <Gamepad2 className="w-3.5 h-3.5" />
              Lyz Dev
            </span>
          )}

          <button
            onClick={() => setDropdown(dropdown === 'project' ? null : 'project')}
            className="context-button"
          >
            <Box className="w-3.5 h-3.5" />
            <span className="max-w-40 truncate">{selectedProject?.title || 'Projekt waehlen'}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          <AnimatePresence>
            {dropdown === 'project' && (
              <Dropdown className="left-24 w-64">
                {folders.map((folder) => (
                  <DropdownButton
                    key={folder.id}
                    checked={selectedFolderId === folder.id}
                    onClick={() => {
                      selectFolder(folder.id);
                      setDropdown(null);
                    }}
                    title={folder.title}
                    subtitle={folder.path}
                  />
                ))}
                <button onClick={createNewProject} className="w-full text-left px-3 py-2 text-xs text-emerald-300 hover:bg-white/10 cursor-pointer">
                  + Neues Projekt erstellen
                </button>
                <button onClick={addProject} className="w-full text-left px-3 py-2 text-xs text-amber-300 hover:bg-white/10 cursor-pointer">
                  + Projektordner oeffnen
                </button>
              </Dropdown>
            )}
          </AnimatePresence>

          {!mobileMode && (
            <>
              <button
                onClick={() => setDropdown(dropdown === 'runtime' ? null : 'runtime')}
                className="context-button"
              >
                <Monitor className="w-3.5 h-3.5" />
                {runtime.installed ? 'CLI bereit' : 'CLI fehlt'}
                <span className={`w-1.5 h-1.5 rounded-full ${runtime.installed ? 'bg-emerald-400' : 'bg-red-400'}`} />
              </button>
              <AnimatePresence>
                {dropdown === 'runtime' && (
                  <Dropdown className="left-52 w-80">
                    <div className="px-3 py-2">
                      <div className="text-xs text-white">{runtime.installed ? runtime.version : 'Nicht installiert'}</div>
                      <div className="text-[10px] text-zinc-600 mt-1 break-all">
                        {runtime.executable || 'Die gewaehlte CLI ist nicht im PATH verfuegbar.'}
                      </div>
                      <button
                        onClick={async () => {
                          setRuntimeBusy(true);
                          try {
                            if (runtime.installed) {
                              const info = await refreshProviderUsage(provider);
                              window.alert(info?.raw || info?.error || info?.label || 'Keine Terminalausgabe erhalten.');
                            }
                            else setError(await installCli(provider));
                          } catch (runtimeError) {
                            setError(runtimeError instanceof Error ? runtimeError.message : 'Aktion fehlgeschlagen.');
                          } finally {
                            setRuntimeBusy(false);
                            setDropdown(null);
                          }
                        }}
                        className="mt-3 inline-flex items-center gap-2 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/5 cursor-pointer"
                      >
                        {runtimeBusy && <span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" />}
                        {runtime.installed ? 'Provider-Limit abrufen' : 'Installation starten'}
                      </button>
                      {usage.providerLimits?.[provider] && (
                        <div className="mt-2 text-[10px] text-zinc-600">
                          Provider: {usage.providerLimits[provider]?.label}
                        </div>
                      )}
                    </div>
                  </Dropdown>
                )}
              </AnimatePresence>
            </>
          )}

          <button
            onClick={() => setDropdown(dropdown === 'usage' ? null : 'usage')}
            className="context-button"
          >
            <Gauge className="w-3.5 h-3.5" />
            {remainingTokens === null ? `${usage.totalTokens.toLocaleString('de-DE')} Tokens` : `${remainingTokens.toLocaleString('de-DE')} uebrig`}
          </button>
          <AnimatePresence>
            {dropdown === 'usage' && (
              <Dropdown className="left-80 w-72">
                <div className="px-3 py-2">
                  <div className="text-xs text-white">Token-Nutzung</div>
                  {usage.providerLimits?.[provider] && (
                    <div className="mb-2 text-[10px] text-zinc-600">
                      Provider: {usage.providerLimits[provider]?.label}
                    </div>
                  )}
                  <div className="text-[10px] text-zinc-600 mt-1">
                    Verbraucht: {usage.totalTokens.toLocaleString('de-DE')}
                    {usage.tokenLimit ? ` von ${usage.tokenLimit.toLocaleString('de-DE')}` : ' - kein Limit gesetzt'}
                  </div>
                </div>
              </Dropdown>
            )}
          </AnimatePresence>

          <button
            onClick={() => setDropdown(dropdown === 'branch' ? null : 'branch')}
            disabled={!gitInfo.isRepository}
            className="context-button disabled:opacity-35"
          >
            <GitBranch className="w-3.5 h-3.5" />
            {gitInfo.isRepository ? gitInfo.branch || 'detached' : 'Kein Git'}
            {gitInfo.isRepository && <ChevronDown className="w-3 h-3" />}
          </button>
          <AnimatePresence>
            {dropdown === 'branch' && (
              <Dropdown className="left-56 w-56 max-h-56 overflow-y-auto custom-scrollbar">
                {branches.map((branch) => (
                  <DropdownButton
                    key={branch}
                    checked={gitInfo.branch === branch}
                    onClick={async () => {
                      try {
                        await switchBranch(branch);
                        setDropdown(null);
                      } catch (branchError) {
                        setError(branchError instanceof Error ? branchError.message : 'Branchwechsel fehlgeschlagen.');
                      }
                    }}
                    title={branch}
                  />
                ))}
              </Dropdown>
            )}
          </AnimatePresence>
        </div>
      </div>
      {error && <div className="mt-2 px-3 text-xs text-red-400">{error}</div>}
    </div>
  );
}

function Dropdown({ children, className }: { children: ReactNode; className: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 4 }}
      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
      className={`theme-popover absolute bottom-full mb-2 bg-[#27272a] border border-white/10 rounded-lg shadow-2xl py-1.5 z-50 ${className}`}
    >
      {children}
    </motion.div>
  );
}

function DropdownButton({
  checked,
  onClick,
  title,
  subtitle,
}: {
  checked: boolean;
  onClick(): void;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <div className="text-[12.5px] text-zinc-200 truncate">{title}</div>
        {subtitle && <div className="text-[9.5px] text-zinc-600 font-mono truncate mt-0.5">{subtitle}</div>}
      </div>
      {checked && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
    </button>
  );
}

function getModelBaseName(provider: ProviderId, modelId: string) {
  const model = PROVIDER_MODELS[provider].find((item) => item.id === modelId);
  return model?.name || modelId.replace(/\s+\((?:Low|Medium|High)\)$/i, '');
}

function getModelIntelligence(provider: ProviderId, modelId: string, fallback: ReasoningEffort) {
  const model = PROVIDER_MODELS[provider].find((item) => item.id === modelId);
  return model?.intelligence || fallback;
}

function getModelRows(provider: ProviderId) {
  const seen = new Set<string>();
  return PROVIDER_MODELS[provider].flatMap((model) => {
    if (seen.has(model.name)) return [];
    seen.add(model.name);
    const variants = PROVIDER_MODELS[provider].filter((item) => item.name === model.name);
    const levels = variants
      .map((item) => item.intelligence)
      .filter(Boolean)
      .join(', ');
    return [{ id: model.id, name: model.name, subtitle: levels ? `${levels} verfuegbar` : model.id }];
  });
}

function getAvailableIntelligenceOptions(provider: ProviderId, modelId: string) {
  const baseName = getModelBaseName(provider, modelId);
  const current = PROVIDER_MODELS[provider].find((item) => item.id === modelId);
  const variants = PROVIDER_MODELS[provider].filter((item) => item.name === baseName);
  if (variants.some((item) => item.intelligence)) {
    return Object.fromEntries(
      variants
        .filter((item) => item.intelligence)
        .map((item) => [item.intelligence, item]),
    ) as Partial<Record<ReasoningEffort, (typeof PROVIDER_MODELS)[ProviderId][number]>>;
  }
  if (provider === 'openai') {
    return {
      low: current,
      medium: current,
      high: current,
    };
  }
  return {
    [current?.intelligence || 'medium']: current,
  } as Partial<Record<ReasoningEffort, (typeof PROVIDER_MODELS)[ProviderId][number]>>;
}

function resolveModelForIntelligence(provider: ProviderId, modelId: string, reasoningEffort: ReasoningEffort) {
  const baseName = getModelBaseName(provider, modelId);
  const variants = PROVIDER_MODELS[provider].filter((item) => item.name === baseName);
  return (
    variants.find((item) => item.intelligence === reasoningEffort)?.id ||
    variants.find((item) => item.intelligence === 'medium')?.id ||
    variants[0]?.id ||
    modelId
  );
}
