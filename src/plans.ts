// Tarif-Grenzen der App. Free bleibt knapp (Einladung ist trotzdem Pflicht).
// Pläne gelten global: free = Free, mini = Spark, pro = Nova, max = Galaxy (Katalog: Konto-Server /v1/plans).
// Die Werte hier müssen zu APP_PERKS.fancycode im Konto-Server passen.
import { featureAllowed, requireFeature, type PlansOptions } from './vendor/fancyservers-collab/collab.js';

export type Plan = 'free' | 'mini' | 'pro' | 'max';

export const PLAN_INFO: Record<Plan, { label: string; terminals: number; vservers: number }> = {
  free: { label: 'Free', terminals: 2, vservers: 1 },
  mini: { label: 'Spark', terminals: 4, vservers: 2 },
  pro: { label: 'Nova', terminals: 8, vservers: 5 },
  max: { label: 'Galaxy', terminals: 12, vservers: 20 },
};

const STORAGE_KEY = 'fancyPlan';

export function readPlan(): Plan {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'mini' || value === 'pro' || value === 'max' || value === 'free') return value;
  } catch {}
  // Ohne Konto (Web-Build, Tests) bleibt die App wie bisher nutzbar.
  return 'pro';
}

export function writePlan(plan: Plan) {
  try {
    localStorage.setItem(STORAGE_KEY, plan);
  } catch {}
}

export function planInfo(plan: Plan = readPlan()) {
  return PLAN_INFO[plan];
}

// Animierte Hintergründe (bewegter Farbverlauf, Videohintergrund) gibt es ab Spark (alle bezahlten Pläne).
export function animatedEffectsAllowed(plan: Plan = readPlan()) {
  return plan !== 'free';
}

// Claude direkt im Agent (eigenes Claude-Konto über die claude-CLI) gibt es ab Spark.
export function claudeEngineAllowed(plan: Plan = readPlan()) {
  return plan !== 'free';
}

export function planLabelOf(plan: string | null | undefined) {
  return PLAN_INFO[(plan === 'mini' || plan === 'pro' || plan === 'max' ? plan : 'free') as Plan].label;
}

/** true = Funktion ist im aktuellen Plan frei (Katalog: /v1/plans, sonst eingebaute Kopie). */
export function featureFree(feature: string) {
  return featureAllowed(readPlan(), feature);
}

/** Gesperrt? Zeigt „Ab Spark verfügbar“ und liefert false. */
export function requirePlanFeature(feature: string) {
  const options: PlansOptions = {
    app: 'fancycode',
    plan: () => readPlan(),
    openExternal: (url) => void window.agentWorkspace?.openExternal?.(url),
  };
  return requireFeature(options, feature, readPlan());
}
