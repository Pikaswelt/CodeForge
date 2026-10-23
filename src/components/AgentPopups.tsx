import { tr } from '../i18n';
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Info,
  Plug,
  Send,
  X,
  XCircle,
} from "lucide-react";
import {
  dismissPopup,
  focusPopupSession,
  subscribePopups,
  type AgentPopup,
  type FormField,
  type PopupKind,
} from "../agentPopups";

const KIND_STYLE: Record<
  PopupKind,
  { icon: typeof Info; tone: string; ring: string }
> = {
  info: { icon: Info, tone: "text-sky-300", ring: "border-sky-400/25" },
  success: {
    icon: CheckCircle2,
    tone: "text-emerald-300",
    ring: "border-emerald-400/30",
  },
  warning: {
    icon: AlertTriangle,
    tone: "text-amber-300",
    ring: "border-amber-400/30",
  },
  error: { icon: XCircle, tone: "text-red-300", ring: "border-red-400/30" },
};

// Reine Meldungen verschwinden von selbst, Fragen und Formulare bleiben bis zur Antwort.
const AUTO_HIDE_MS = { connect: 5000, notify: 30000 };

function GoToWork({
  popup,
  label,
  onDone,
}: {
  popup: AgentPopup;
  label?: string;
  onDone?: () => void;
}) {
  if (!popup.sessionId) return null;
  return (
    <button
      onClick={() => {
        focusPopupSession(popup.sessionId);
        onDone?.();
      }}
      className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-100 transition-colors hover:bg-white/20"
    >
      {label || tr("Zur Arbeit")} <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

function NotifyCard({
  popup,
}: {
  popup: Extract<AgentPopup, { type: "notify" }>;
}) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover) return;
    const timer = setTimeout(
      () => dismissPopup(popup.id),
      popup.connect ? AUTO_HIDE_MS.connect : AUTO_HIDE_MS.notify,
    );
    return () => clearTimeout(timer);
  }, [hover, popup.id, popup.connect]);
  const style = KIND_STYLE[popup.kind];
  const Icon = popup.connect ? Plug : style.icon;
  // „Verbunden mit …“: klein und einzeilig, ein Klick springt zum Terminal.
  if (popup.connect) {
    return (
      <button
        onClick={() => {
          focusPopupSession(popup.sessionId);
          dismissPopup(popup.id);
        }}
        className="flex w-full items-center gap-2 text-left text-[12px] text-zinc-200"
        title={popup.sessionId ? tr("Zur Arbeit") : undefined}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60" />
        <span className="truncate">{popup.title}</span>
        {popup.sessionId && (
          <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-500" />
        )}
      </button>
    );
  }
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <CardHead
        icon={<Icon className={`h-4 w-4 ${style.tone}`} />}
        title={popup.title}
        source={popup.source}
        onClose={() => dismissPopup(popup.id)}
      />
      {popup.message && (
        <p className="mt-1 pl-6 text-[12px] leading-5 text-zinc-400">
          {popup.message}
        </p>
      )}
      {popup.sessionId && (
        <div className="mt-3 flex justify-end">
          <GoToWork
            popup={popup}
            label={popup.buttonLabel}
            onDone={() => dismissPopup(popup.id)}
          />
        </div>
      )}
    </div>
  );
}

function CardHead({
  icon,
  title,
  source,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  source: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-5 text-zinc-100">
          {title || tr("Nachricht vom Agenten")}
        </div>
        {source && (
          <div className="text-[10px] uppercase tracking-wide text-zinc-600">
            {source}
          </div>
        )}
      </div>
      <button
        onClick={onClose}
        className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
        aria-label={tr("Schließen")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AskCard({ popup }: { popup: Extract<AgentPopup, { type: "ask" }> }) {
  const [own, setOwn] = useState("");
  const answer = (value: string) => dismissPopup(popup.id, { answer: value });
  return (
    <div>
      <CardHead
        icon={<HelpCircle className="h-4 w-4 text-violet-300" />}
        title={popup.question}
        source={popup.source}
        onClose={() => dismissPopup(popup.id)}
      />
      {popup.message && popup.message !== popup.question && (
        <p className="mt-1 pl-6 text-[12px] leading-5 text-zinc-400">
          {popup.message}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-1.5 pl-6">
        {popup.options.map((option) => (
          <button
            key={option}
            onClick={() => answer(option)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[12px] text-zinc-200 transition-colors hover:border-violet-400/40 hover:bg-violet-500/10"
          >
            {option}
          </button>
        ))}
        {popup.allowText && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (own.trim()) answer(own.trim());
            }}
            className="flex gap-1.5"
          >
            <input
              value={own}
              onChange={(event) => setOwn(event.target.value)}
              placeholder={tr("Eigene Antwort …")}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-zinc-100 outline-none focus:border-violet-400/50"
            />
            <button
              type="submit"
              disabled={!own.trim()}
              className="rounded-lg bg-violet-500/80 px-2.5 text-white disabled:opacity-40"
              aria-label={tr("Senden")}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        )}
      </div>
      {popup.sessionId && (
        <div className="mt-3 flex justify-end">
          <GoToWork popup={popup} />
        </div>
      )}
    </div>
  );
}

function initialValue(field: FormField) {
  if (field.default !== undefined) return field.default;
  if (field.type === "checkbox") return false;
  if (field.type === "select" || field.type === "radio")
    return field.options[0] ?? "";
  return "";
}

function FormCard({ popup }: { popup: Extract<AgentPopup, { type: "form" }> }) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      popup.fields.map((field) => [field.name, initialValue(field)]),
    ),
  );
  const set = (name: string, value: unknown) =>
    setValues((current) => ({ ...current, [name]: value }));
  const missing = popup.fields.filter(
    (field) =>
      field.required &&
      field.type !== "checkbox" &&
      String(values[field.name] ?? "").trim() === "",
  );
  const inputClass =
    "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-zinc-100 outline-none focus:border-violet-400/50";

  const submit = () => {
    if (missing.length) return;
    const out: Record<string, unknown> = {};
    for (const field of popup.fields) {
      const value = values[field.name];
      out[field.name] =
        field.type === "number" ? (value === "" ? null : Number(value)) : value;
    }
    dismissPopup(popup.id, { values: out });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <CardHead
        icon={<HelpCircle className="h-4 w-4 text-violet-300" />}
        title={popup.title}
        source={popup.source}
        onClose={() => dismissPopup(popup.id)}
      />
      {popup.message && (
        <p className="mt-1 pl-6 text-[12px] leading-5 text-zinc-400">
          {popup.message}
        </p>
      )}
      <div className="mt-3 max-h-[50vh] space-y-3 overflow-y-auto pl-6 pr-1">
        {popup.fields.map((field) => (
          <label key={field.name} className="block">
            {field.type !== "checkbox" && (
              <span className="mb-1 block text-[11px] font-medium text-zinc-300">
                {field.label}
                {field.required && <span className="text-violet-300"> *</span>}
              </span>
            )}
            {field.type === "textarea" ? (
              <textarea
                rows={3}
                value={String(values[field.name] ?? "")}
                placeholder={field.placeholder}
                onChange={(event) => set(field.name, event.target.value)}
                className={inputClass}
              />
            ) : field.type === "select" ? (
              <select
                value={String(values[field.name] ?? "")}
                onChange={(event) => set(field.name, event.target.value)}
                className={inputClass}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.type === "radio" ? (
              <div className="flex flex-wrap gap-1.5">
                {field.options.map((option) => (
                  <button
                    type="button"
                    key={option}
                    onClick={() => set(field.name, option)}
                    className={`rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${values[field.name] === option ? "border-violet-400/60 bg-violet-500/20 text-zinc-100" : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/10"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : field.type === "checkbox" ? (
              <span className="flex items-center gap-2 text-[12px] text-zinc-200">
                <input
                  type="checkbox"
                  checked={Boolean(values[field.name])}
                  onChange={(event) => set(field.name, event.target.checked)}
                  className="h-3.5 w-3.5 accent-violet-500"
                />
                {field.label}
              </span>
            ) : (
              <input
                type={field.type === "number" ? "number" : "text"}
                value={String(values[field.name] ?? "")}
                placeholder={field.placeholder}
                onChange={(event) => set(field.name, event.target.value)}
                className={inputClass}
              />
            )}
            {field.help && (
              <span className="mt-1 block text-[10px] leading-4 text-zinc-500">
                {field.help}
              </span>
            )}
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <GoToWork popup={popup} />
        <button
          type="submit"
          disabled={missing.length > 0}
          className="flex items-center gap-1.5 rounded-md bg-violet-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" /> {popup.submitLabel || tr("Abschicken")}
        </button>
      </div>
    </form>
  );
}

// Unten rechts über allem: Meldungen, Fragen und Formulare von Agenten (MCP fancycode_notify/_ask/_form).
export default function AgentPopups() {
  const [popups, setPopups] = useState<AgentPopup[]>([]);
  useEffect(() => subscribePopups(setPopups), []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[130] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {popups.map((popup) => {
          const small = popup.type === "notify" && popup.connect;
          return (
            <motion.div
              key={popup.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={`pointer-events-auto border bg-[#141214]/95 shadow-2xl backdrop-blur-md ${small ? "self-end rounded-full border-emerald-400/25 px-3.5 py-2" : `rounded-xl p-3.5 ${popup.type === "notify" ? KIND_STYLE[popup.kind].ring : "border-violet-400/30"}`}`}
            >
              {popup.type === "notify" ? (
                <NotifyCard popup={popup} />
              ) : popup.type === "ask" ? (
                <AskCard popup={popup} />
              ) : (
                <FormCard popup={popup} />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
