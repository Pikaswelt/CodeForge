import { tr } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Image as ImageIcon, Loader2, Sparkles, Upload, Video, X } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { isVideoPath, toFileUrl } from '../media';
import { animatedEffectsAllowed } from '../plans';
import { THEME_CREATOR_EVENT } from '../themeIntent';

// Öffnet sich, wenn der Agent nach einem Theme gefragt wird: Medium wählen, „Anwenden“,
// Namen eingeben – danach ist das Theme gespeichert und sofort aktiv.
export default function ThemeCreator() {
  const { createCustomTheme } = useAppContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'media' | 'name'>('media');
  const [media, setMedia] = useState('');
  const [pickedName, setPickedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setStep('media');
      setMedia('');
      setPickedName('');
      setName('');
      setError('');
    };
    window.addEventListener(THEME_CREATOR_EVENT, onOpen);
    return () => window.removeEventListener(THEME_CREATOR_EVENT, onOpen);
  }, []);

  if (!open) return null;

  const isVideo = isVideoPath(media);
  const fileName = pickedName || media.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/, '') || '';

  const pickMedia = () => {
    setError('');
    fileRef.current?.click();
  };

  // Bilder werden als Data-URL gespeichert (bleiben nach Neustart), Videos nur für die Sitzung.
  const onFile = (file: File | undefined) => {
    if (!file) return;
    const video = file.type.startsWith('video/');
    if (video && !animatedEffectsAllowed()) {
      setError(tr("Video-Hintergründe gibt es ab dem Pro-Plan. Nutze solange ein Bild."));
      return;
    }
    setError('');
    setPickedName(file.name.replace(/\.[^.]+$/, '').slice(0, 40));
    if (video) {
      setMedia(URL.createObjectURL(file));
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      setBusy(false);
      if (typeof reader.result === 'string') setMedia(reader.result);
    };
    reader.onerror = () => {
      setBusy(false);
      setError(tr("Datei konnte nicht gelesen werden."));
    };
    reader.readAsDataURL(file);
  };

  const apply = () => {
    if (!media) return;
    setName(fileName);
    setStep('name');
  };

  const create = () => {
    const title = name.trim();
    if (!title) {
      setError(tr("Bitte gib dem Theme einen Namen."));
      return;
    }
    createCustomTheme({
      name: title,
      background: '#0b0a0b',
      surface: '#17151a',
      text: '#f4f4f5',
      accent: '#f97316',
      backgroundMedia: media,
      backgroundImage: isVideo ? undefined : media,
      animatedGradient: false,
    });
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/75 p-5 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141214] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
              <Sparkles className="h-3.5 w-3.5" /> {tr("Neues Theme")}
            </div>
            <h2 className="mt-0.5 text-lg font-semibold text-white">
              {step === 'media' ? tr("Bild oder Video wählen") : tr("Theme benennen")}
            </h2>
            <p className="mt-1 text-[12px] text-zinc-400">
              {step === 'media'
                ? tr("Wähle einen Hintergrund – er wird direkt zum Theme.")
                : tr("Der Name erscheint später in deiner Theme-Liste.")}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
            aria-label={tr("Theme-Fenster schließen")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
          {step === 'media' ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(event) => onFile(event.target.files?.[0])}
              />
              <button
                onClick={pickMedia}
                disabled={busy}
                className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-black/30 transition-colors hover:border-orange-400/40 hover:bg-white/[0.03] disabled:opacity-60"
              >
                {media ? (
                  isVideo ? (
                    <video src={toFileUrl(media)} className="h-full w-full object-cover" autoPlay muted loop playsInline />
                  ) : (
                    <img src={toFileUrl(media)} alt="" className="h-full w-full object-cover" />
                  )
                ) : (
                  <span className="flex flex-col items-center gap-2 text-zinc-400">
                    {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                    <span className="text-sm">{tr("Bild oder Video auswählen")}</span>
                    <span className="text-[11px] text-zinc-600">{tr("PNG, JPG, GIF, MP4 oder WebM")}</span>
                  </span>
                )}
              </button>

              {media && (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-zinc-300">
                  <span className="flex min-w-0 items-center gap-2">
                    {isVideo ? <Video className="h-4 w-4 shrink-0" /> : <ImageIcon className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{media.split(/[\\/]/).at(-1)}</span>
                  </span>
                  <button onClick={pickMedia} className="shrink-0 text-orange-300 hover:underline">
                    {tr("ändern")}
                  </button>
                </div>
              )}

              {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{error}</p>}
            </>
          ) : (
            <>
              <label className="text-[11px] uppercase tracking-wide text-zinc-500">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(event) => {
                  setName(event.target.value.slice(0, 40));
                  setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') create();
                }}
                placeholder={tr("Mein Theme")}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-orange-400/50"
              />
              {name.trim() && (
                <p className="mt-2 text-[11px] text-zinc-500">
                  {tr("Wird als")} <span className="text-zinc-300">„{name.trim()}“</span> {tr("gespeichert und sofort angewendet.")}
                </p>
              )}
              {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{error}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-6 py-4">
          {step === 'name' ? (
            <button onClick={() => setStep('media')} className="text-[12px] text-zinc-500 transition-colors hover:text-zinc-300">
              {tr("Zurück")}
            </button>
          ) : (
            <span className="text-[11px] text-zinc-600">{tr("Der Agent öffnet dieses Fenster auf Zuruf.")}</span>
          )}
          <button
            onClick={step === 'media' ? apply : create}
            disabled={step === 'media' ? !media : !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-400 disabled:opacity-40"
          >
            {step === 'media' ? tr("Anwenden") : tr("Erstellen & anwenden")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
