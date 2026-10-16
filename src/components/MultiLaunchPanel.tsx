import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  FolderOpen,
  LayoutGrid,
  Layers,
  Monitor,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Server,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { useVServers } from './VServers';
import type { MultiLaunchConfig, MultiLaunchSlot } from '../types';
import { DEFAULT_MULTI_LAUNCH_CONFIG } from '../types';

const MAX_SLOTS = 8;

const newSlotId = () => `slot-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

export function MultiLaunchPanel({
  onCancel,
  onStart,
}: {
  onCancel(): void;
  onStart?(): void;
}) {
  const { multiLaunchConfig, setMultiLaunchConfig, agyAccounts, startMultiLaunch } = useAppContext();
  const savedServers = useVServers();

  // Local state for editing until saved
  const [config, setConfig] = useState<MultiLaunchConfig>(() => ({
    mode: multiLaunchConfig.mode || 'default',
    buttonLabel: multiLaunchConfig.buttonLabel || 'Antigravity starten',
    layout: multiLaunchConfig.layout || 'grid',
    slots: multiLaunchConfig.slots && multiLaunchConfig.slots.length > 0
      ? JSON.parse(JSON.stringify(multiLaunchConfig.slots))
      : JSON.parse(JSON.stringify(DEFAULT_MULTI_LAUNCH_CONFIG.slots)),
  }));

  const [starting, setStarting] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  const handleSave = (newConfig = config) => {
    setMultiLaunchConfig(newConfig);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const handleSaveAndStart = async () => {
    setStarting(true);
    handleSave(config);
    try {
      if (onStart) {
        onStart();
      } else {
        await startMultiLaunch(config);
        onCancel();
      }
    } catch {
      setStarting(false);
    }
  };

  const handleResetToDefault = () => {
    const next: MultiLaunchConfig = {
      mode: 'default',
      buttonLabel: 'Antigravity starten',
      layout: 'grid',
      slots: JSON.parse(JSON.stringify(DEFAULT_MULTI_LAUNCH_CONFIG.slots)),
    };
    setConfig(next);
    handleSave(next);
  };

  // Preset handlers
  const applyPreset5Agy1Claude = () => {
    const slots: MultiLaunchSlot[] = [
      { id: newSlotId(), name: 'Antigravity 1', tool: 'agy', command: 'agy', targetType: 'local' },
      { id: newSlotId(), name: 'Antigravity 2', tool: 'agy', command: 'agy', targetType: 'local' },
      { id: newSlotId(), name: 'Antigravity 3', tool: 'agy', command: 'agy', targetType: 'local' },
      { id: newSlotId(), name: 'Antigravity 4', tool: 'agy', command: 'agy', targetType: 'local' },
      { id: newSlotId(), name: 'Antigravity 5', tool: 'agy', command: 'agy', targetType: 'local' },
      { id: newSlotId(), name: 'Claude Code', tool: 'claude', command: 'claude', targetType: 'local' },
    ];
    setConfig((prev) => ({
      ...prev,
      mode: 'custom',
      buttonLabel: 'Antigravity x5 + Claude',
      slots,
    }));
  };

  const applyPreset2PC2VServer = () => {
    const defaultServer = savedServers[0];
    const slots: MultiLaunchSlot[] = [
      { id: newSlotId(), name: 'Antigravity PC 1', tool: 'agy', command: 'agy', targetType: 'local' },
      { id: newSlotId(), name: 'Antigravity PC 2', tool: 'agy', command: 'agy', targetType: 'local' },
      {
        id: newSlotId(),
        name: defaultServer ? `Antigravity (${defaultServer.name}) 1` : 'Antigravity V-Server 1',
        tool: 'agy',
        command: 'agy',
        targetType: defaultServer ? 'vserver' : 'local',
        vserverId: defaultServer?.id,
      },
      {
        id: newSlotId(),
        name: defaultServer ? `Antigravity (${defaultServer.name}) 2` : 'Antigravity V-Server 2',
        tool: 'agy',
        command: 'agy',
        targetType: defaultServer ? 'vserver' : 'local',
        vserverId: defaultServer?.id,
      },
    ];
    setConfig((prev) => ({
      ...prev,
      mode: 'custom',
      buttonLabel: 'Agy: 2x PC + 2x Server',
      slots,
    }));
  };

  const applyPresetAgyPCClaudeServer = () => {
    const defaultServer = savedServers[0];
    const slots: MultiLaunchSlot[] = [
      { id: newSlotId(), name: 'Antigravity 1', tool: 'agy', command: 'agy', targetType: 'local' },
      { id: newSlotId(), name: 'Antigravity 2', tool: 'agy', command: 'agy', targetType: 'local' },
      {
        id: newSlotId(),
        name: defaultServer ? `Claude (${defaultServer.name})` : 'Claude V-Server',
        tool: 'claude',
        command: 'claude',
        targetType: defaultServer ? 'vserver' : 'local',
        vserverId: defaultServer?.id,
      },
    ];
    setConfig((prev) => ({
      ...prev,
      mode: 'custom',
      buttonLabel: 'Agy (PC) + Claude (Server)',
      slots,
    }));
  };

  const updateSlot = (id: string, patch: Partial<MultiLaunchSlot>) => {
    setConfig((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const addSlot = () => {
    if (config.slots.length >= MAX_SLOTS) return;
    const num = config.slots.length + 1;
    const newSlot: MultiLaunchSlot = {
      id: newSlotId(),
      name: `Terminal ${num}`,
      tool: 'agy',
      command: 'agy',
      targetType: 'local',
    };
    setConfig((prev) => ({
      ...prev,
      slots: [...prev.slots, newSlot],
    }));
  };

  const removeSlot = (id: string) => {
    if (config.slots.length <= 1) return;
    setConfig((prev) => ({
      ...prev,
      slots: prev.slots.filter((s) => s.id !== id),
    }));
  };

  const moveSlot = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= config.slots.length) return;
    const nextSlots = [...config.slots];
    const [removed] = nextSlots.splice(index, 1);
    nextSlots.splice(targetIdx, 0, removed);
    setConfig((prev) => ({ ...prev, slots: nextSlots }));
  };

  return (
    <section className="panel w-full max-w-2xl my-6 p-6 border border-white/10 bg-[#16141a]/95 backdrop-blur-xl rounded-2xl shadow-2xl space-y-6 text-zinc-200">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Start-Button anpassen (Multi-Launch)</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Belege den Button frei mit Terminals auf diesem PC und deinen V-Servern.
            </p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Schließen"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Button Vorschau & Beschriftung */}
      <div className="space-y-3 bg-white/[0.03] border border-white/5 rounded-xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-xs font-semibold text-zinc-300 block mb-1">
              Button-Beschriftung auf Home
            </label>
            <input
              type="text"
              value={config.buttonLabel}
              onChange={(e) => setConfig((prev) => ({ ...prev, buttonLabel: e.target.value }))}
              placeholder="z. B. Antigravity starten oder Antigravity x5"
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-orange-500/60 focus:outline-none"
            />
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Vorschau</span>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-200 text-xs font-medium">
              <Rocket className="w-3.5 h-3.5 text-orange-300" />
              <span>
                {config.buttonLabel || 'Antigravity starten'}
                {config.mode === 'custom'
                  ? ` (${config.slots.length})`
                  : agyAccounts.length ? ` (${agyAccounts.length})` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Layout toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
          <span className="text-zinc-400">Terminal-Layout</span>
          <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5">
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, layout: 'grid' }))}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${
                config.layout === 'grid'
                  ? 'bg-orange-500/20 text-orange-200 border border-orange-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              <span>Grid (Kacheln)</span>
            </button>
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, layout: 'single' }))}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${
                config.layout === 'single'
                  ? 'bg-orange-500/20 text-orange-200 border border-orange-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Tabs</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modus Wahl */}
      <div>
        <label className="text-xs font-semibold text-zinc-300 block mb-2">Ausführungs-Modus</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, mode: 'default' }))}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              config.mode === 'default'
                ? 'border-orange-500/60 bg-orange-500/10'
                : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white flex items-center gap-1.5">
                <Rocket className="w-4 h-4 text-orange-400" />
                Standard
              </span>
              {config.mode === 'default' && <Check className="w-4 h-4 text-orange-400" />}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
              Startet automatisch alle hinterlegten Antigravity-Accounts auf diesem PC nebeneinander ({agyAccounts.length} Account(s)).
            </p>
          </button>

          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, mode: 'custom' }))}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              config.mode === 'custom'
                ? 'border-orange-500/60 bg-orange-500/10'
                : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-orange-400" />
                Individuell
              </span>
              {config.mode === 'custom' && <Check className="w-4 h-4 text-orange-400" />}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
              Frei konfigurierbar: 5x Agy + Claude Code, Aufteilung auf PC und V-Server, eigene Befehle ({config.slots.length} Terminal(s)).
            </p>
          </button>
        </div>
      </div>

      {/* Schnell-Presets */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-zinc-400 block">Schnell-Vorlagen:</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyPreset5Agy1Claude}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-orange-300" />
            <span>5x Agy + 1x Claude (PC)</span>
          </button>
          <button
            type="button"
            onClick={applyPreset2PC2VServer}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <Server className="w-3.5 h-3.5 text-sky-400" />
            <span>2x PC + 2x V-Server</span>
          </button>
          <button
            type="button"
            onClick={applyPresetAgyPCClaudeServer}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Agy (PC) + Claude (Server)</span>
          </button>
        </div>
      </div>

      {/* Slots Konfiguration (wenn Modus = individuell) */}
      {config.mode === 'custom' && (
        <div className="space-y-4 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-white">Terminal-Slots ({config.slots.length} von {MAX_SLOTS})</span>
              <p className="text-[11px] text-zinc-400">Jeder Slot öffnet ein eigenes Terminal im Grid-Layout.</p>
            </div>
            {config.slots.length < MAX_SLOTS && (
              <button
                type="button"
                onClick={addSlot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Slot hinzufügen</span>
              </button>
            )}
          </div>

          <div className="space-y-3 max-h-[46vh] overflow-y-auto custom-scrollbar pr-1">
            {config.slots.map((slot, index) => {
              const isFirst = index === 0;
              const isLast = index === config.slots.length - 1;

              return (
                <div
                  key={slot.id}
                  className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-3"
                >
                  {/* Slot Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-300 text-[10px] font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={slot.name}
                        onChange={(e) => updateSlot(slot.id, { name: e.target.value })}
                        placeholder={`Terminal ${index + 1}`}
                        className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-orange-400/60 text-sm font-medium text-white px-1 py-0.5 outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveSlot(index, 'up')}
                        disabled={isFirst}
                        className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-20 transition-colors"
                        title="Nach oben verschieben"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSlot(index, 'down')}
                        disabled={isLast}
                        className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-20 transition-colors"
                        title="Nach unten verschieben"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      {config.slots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSlot(slot.id)}
                          className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors ml-1"
                          title="Slot entfernen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Slot Configuration */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Tool / Programm */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Tool / Befehl</span>
                      <div className="flex rounded-lg border border-white/10 bg-black/50 p-0.5">
                        <button
                          type="button"
                          onClick={() => updateSlot(slot.id, { tool: 'agy', command: 'agy' })}
                          className={`flex-1 py-1.5 rounded text-center transition-colors ${
                            slot.tool === 'agy'
                              ? 'bg-orange-500/20 text-orange-200 border border-orange-500/30 font-medium'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          Antigravity
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSlot(slot.id, { tool: 'claude', command: 'claude' })}
                          className={`flex-1 py-1.5 rounded text-center transition-colors ${
                            slot.tool === 'claude'
                              ? 'bg-orange-500/20 text-orange-200 border border-orange-500/30 font-medium'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          Claude Code
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSlot(slot.id, { tool: 'custom' })}
                          className={`flex-1 py-1.5 rounded text-center transition-colors ${
                            slot.tool === 'custom'
                              ? 'bg-orange-500/20 text-orange-200 border border-orange-500/30 font-medium'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          Eigener
                        </button>
                      </div>

                      {/* Custom command field */}
                      {slot.tool === 'custom' && (
                        <input
                          type="text"
                          value={slot.command || ''}
                          onChange={(e) => updateSlot(slot.id, { command: e.target.value })}
                          placeholder="Befehl, z. B. agy, claude, bash"
                          className="w-full mt-1.5 rounded-lg bg-black/60 border border-white/10 px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:border-orange-500/60 focus:outline-none"
                        />
                      )}

                      {/* Agy Account picker (local) */}
                      {slot.tool === 'agy' && slot.targetType === 'local' && agyAccounts.length > 0 && (
                        <select
                          value={slot.agyAccountId || ''}
                          onChange={(e) => updateSlot(slot.id, { agyAccountId: e.target.value || undefined })}
                          className="w-full mt-1 rounded-lg bg-black/60 border border-white/10 px-2 py-1 text-[11px] text-zinc-300 focus:outline-none"
                        >
                          <option value="">Auto (nach Slot-Reihenfolge)</option>
                          {agyAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              Account: {account.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Ausführungsort (PC vs V-Server) */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Ausführungsort</span>
                      <div className="flex rounded-lg border border-white/10 bg-black/50 p-0.5">
                        <button
                          type="button"
                          onClick={() => updateSlot(slot.id, { targetType: 'local', vserverId: undefined })}
                          className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors ${
                            slot.targetType === 'local'
                              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 font-medium'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Monitor className="w-3 h-3" />
                          <span>Dieser PC</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSlot(slot.id, { targetType: 'vserver', vserverId: savedServers[0]?.id })}
                          className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors ${
                            slot.targetType === 'vserver'
                              ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30 font-medium'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Server className="w-3 h-3" />
                          <span>V-Server</span>
                        </button>
                      </div>

                      {/* V-Server Picker */}
                      {slot.targetType === 'vserver' && (
                        <div className="mt-1.5">
                          {savedServers.length === 0 ? (
                            <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
                              Noch kein V-Server hinterlegt. Lege zuerst einen unter Home &gt; V-Server an.
                            </div>
                          ) : (
                            <select
                              value={slot.vserverId || savedServers[0]?.id || ''}
                              onChange={(e) => updateSlot(slot.id, { vserverId: e.target.value })}
                              className="w-full rounded-lg bg-black/60 border border-white/10 px-2 py-1.5 text-xs text-sky-200 focus:outline-none"
                            >
                              {savedServers.map((server) => (
                                <option key={server.id} value={server.id}>
                                  {server.name} ({server.host})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
        <button
          type="button"
          onClick={handleResetToDefault}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Auf Standard zurücksetzen</span>
        </button>

        <div className="flex items-center gap-2">
          {savedFeedback && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 mr-2 animate-fade-in">
              <Check className="w-3.5 h-3.5" /> Gespeichert!
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-white/10 text-xs text-zinc-300 hover:bg-white/[0.05] transition-colors"
          >
            Schließen
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            className="px-4 py-2 rounded-lg border border-orange-500/40 bg-orange-500/20 text-xs text-orange-200 hover:bg-orange-500/30 transition-colors font-medium"
          >
            Speichern
          </button>
          <button
            type="button"
            onClick={handleSaveAndStart}
            disabled={starting}
            className="primary-button !py-2 !px-4 flex items-center gap-1.5 text-xs font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform duration-150 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{starting ? 'Startet...' : 'Jetzt starten'}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
