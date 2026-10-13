import { useState } from 'react';
import { Film, ImagePlus, Trash2 } from 'lucide-react';
import { Native, errorMessage, mediaUrl } from '../native';
import { newId, useStore } from '../store';
import { BUILT_IN_THEMES, resolveTheme } from '../theme';
import type { MobileTheme } from '../types';
import { Button, Field, Segmented, Sheet, Slider, Toggle, cx } from '../ui';

export default function ThemeEditor({ theme, onClose }: { theme?: MobileTheme; onClose: () => void }) {
  const { customThemes, setCustomThemes, settings, updateSettings, toast, confirm } = useStore();
  const current = resolveTheme(settings.themeId, customThemes);
  const [draft, setDraft] = useState<MobileTheme>(
    () =>
      theme || {
        id: `custom-${newId().slice(0, 8)}`,
        name: 'Mein Theme',
        background: current.bg.startsWith('#') ? current.bg : '#111111',
        surface: current.surface.startsWith('#') ? current.surface : '#1c1a1b',
        text: current.text.startsWith('#') ? current.text : '#e4e4e7',
        accent: current.accent.startsWith('#') ? current.accent : '#f2c96d',
        animatedGradient: false,
        mediaOnly: false,
        baseTheme: BUILT_IN_THEMES.some((item) => item.id === settings.themeId) ? settings.themeId : 'modern-dark',
        mediaDim: 40,
        mediaBlur: 0,
      },
  );
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<MobileTheme>) => setDraft((value) => ({ ...value, ...patch }));
  const preview = resolveTheme(draft.id, [...customThemes.filter((item) => item.id !== draft.id), draft]);

  const pickMedia = async (kind: 'image' | 'video') => {
    setBusy(true);
    try {
      const result = await Native.importMedia({ kind });
      if (result.canceled || !result.path) return;
      const previous = draft.backgroundMedia;
      set({ backgroundMedia: result.path, backgroundMediaKind: result.mime?.startsWith('video') || kind === 'video' ? 'video' : 'image' });
      // The old file is only removed when no saved theme still uses it.
      if (previous && previous !== theme?.backgroundMedia) void Native.deleteMedia({ path: previous });
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const clearMedia = () => {
    if (draft.backgroundMedia && draft.backgroundMedia !== theme?.backgroundMedia) void Native.deleteMedia({ path: draft.backgroundMedia });
    set({ backgroundMedia: undefined, backgroundMediaKind: undefined });
  };

  const save = () => {
    if (theme?.backgroundMedia && theme.backgroundMedia !== draft.backgroundMedia) void Native.deleteMedia({ path: theme.backgroundMedia });
    setCustomThemes((list) => (list.some((item) => item.id === draft.id) ? list.map((item) => (item.id === draft.id ? draft : item)) : [...list, draft]));
    updateSettings({ themeId: draft.id });
    onClose();
  };

  const remove = async () => {
    if (!theme) return;
    if (!(await confirm({ title: 'Theme löschen?', message: `${theme.name} wird gelöscht.`, confirmLabel: 'Löschen', danger: true }))) return;
    if (theme.backgroundMedia) void Native.deleteMedia({ path: theme.backgroundMedia });
    setCustomThemes((list) => list.filter((item) => item.id !== theme.id));
    if (settings.themeId === theme.id) updateSettings({ themeId: theme.baseTheme || 'modern-dark' });
    onClose();
  };

  const cancel = () => {
    if (draft.backgroundMedia && draft.backgroundMedia !== theme?.backgroundMedia) void Native.deleteMedia({ path: draft.backgroundMedia });
    onClose();
  };

  const url = mediaUrl(draft.backgroundMedia);

  return (
    <Sheet
      title={theme ? 'Theme bearbeiten' : 'Eigenes Theme'}
      full
      onClose={cancel}
      footer={<Button variant="primary" className="flex-1" onClick={save} disabled={!draft.name.trim()}>Speichern & anwenden</Button>}
    >
      <div className="relative mb-4 h-44 overflow-hidden rounded-3xl border border-cf-line" style={{ background: preview.bg }}>
        <div className={cx('absolute inset-[-10%]', preview.animated && 'cf-backdrop-gradient animated')} style={{ backgroundImage: preview.gradient, backgroundSize: '220% 220%' }} />
        {url && draft.backgroundMediaKind === 'video' && <video className="cf-backdrop-media" src={url} autoPlay muted loop playsInline style={{ filter: draft.mediaBlur ? `blur(${draft.mediaBlur}px)` : undefined }} />}
        {url && draft.backgroundMediaKind !== 'video' && <img className="cf-backdrop-media" src={url} alt="" style={{ filter: draft.mediaBlur ? `blur(${draft.mediaBlur}px)` : undefined }} />}
        {url && <div className="absolute inset-0" style={{ background: `rgb(0 0 0 / ${(draft.mediaDim ?? 40) / 100})` }} />}
        <div className="absolute inset-x-4 bottom-4 rounded-2xl border p-3" style={{ background: `color-mix(in srgb, ${preview.surface} ${settings.surfaceOpacity}%, transparent)`, borderColor: 'rgb(255 255 255 / 0.1)', color: preview.text, backdropFilter: `blur(${settings.blur}px)` }}>
          <div className="text-[0.9rem] font-semibold">{draft.name || 'Vorschau'}</div>
          <div className="text-[0.75rem] opacity-70">So sieht CodeForge damit aus</div>
          <div className="mt-2 inline-block rounded-lg px-3 py-1 text-[0.75rem] font-semibold" style={{ background: preview.accent, color: '#111' }}>Akzent</div>
        </div>
      </div>

      <Field label="Name">
        <input className="cf-input" value={draft.name} onChange={(event) => set({ name: event.target.value })} />
      </Field>

      <div className="mb-3">
        <Segmented
          value={draft.mediaOnly ? 'media' : 'full'}
          onChange={(value) => set({ mediaOnly: value === 'media' })}
          options={[{ value: 'full', label: 'Eigene Farben' }, { value: 'media', label: 'Nur Hintergrund' }]}
        />
      </div>

      {draft.mediaOnly ? (
        <Field label="Look übernehmen von" hint="Farben dieses Themes bleiben, nur der Hintergrund wird ersetzt.">
          <select className="cf-input" value={draft.baseTheme} onChange={(event) => set({ baseTheme: event.target.value })}>
            {BUILT_IN_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            {customThemes.filter((item) => !item.mediaOnly && item.id !== draft.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {([
              ['background', 'Hintergrund'],
              ['surface', 'Flächen'],
              ['text', 'Text'],
              ['accent', 'Akzent'],
            ] as const).map(([key, label]) => (
              <label key={key} className="cf-press flex items-center gap-3 rounded-2xl border border-cf-line bg-cf-hover px-3 py-2.5">
                <input type="color" value={draft[key]} onChange={(event) => set({ [key]: event.target.value })} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                <span className="min-w-0">
                  <span className="block text-[0.84rem] font-medium">{label}</span>
                  <span className="cf-muted block font-mono text-[0.7rem] uppercase">{draft[key]}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="cf-glass cf-card mb-3 overflow-hidden">
            <Toggle checked={Boolean(draft.animatedGradient)} onChange={(value) => set({ animatedGradient: value })} label="Animierter Verlauf" description="Der Farbverlauf bewegt sich langsam" />
          </div>
        </>
      )}

      <div className="mb-2 mt-1 px-0.5 text-[0.8rem] font-medium cf-muted">Hintergrundbild oder -video vom Handy</div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button icon={<ImagePlus className="h-4 w-4" />} busy={busy} onClick={() => void pickMedia('image')}>Bild</Button>
        <Button icon={<Film className="h-4 w-4" />} busy={busy} onClick={() => void pickMedia('video')}>Video</Button>
      </div>
      {draft.backgroundMedia && (
        <div className="cf-glass cf-card mb-3 overflow-hidden">
          <Slider label="Abdunkeln" value={draft.mediaDim ?? 40} min={0} max={90} unit="%" onChange={(value) => set({ mediaDim: value })} />
          <Slider label="Weichzeichnen" value={draft.mediaBlur ?? 0} min={0} max={24} unit="px" onChange={(value) => set({ mediaBlur: value })} />
          <button onClick={clearMedia} className="cf-press flex w-full items-center gap-2 border-t border-cf-line px-4 py-3 text-[0.9rem] text-red-400">
            <Trash2 className="h-4 w-4" /> Hintergrund entfernen
          </button>
        </div>
      )}
      <p className="cf-muted mb-4 text-[0.75rem] leading-relaxed">Videos laufen stumm in Dauerschleife. Die Datei wird in den App-Speicher kopiert, das Original kannst du danach löschen.</p>

      {theme && (
        <Button variant="danger" className="w-full" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
          Theme löschen
        </Button>
      )}
    </Sheet>
  );
}
