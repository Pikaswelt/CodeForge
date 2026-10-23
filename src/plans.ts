// Tarif-Grenzen der App. Free bleibt knapp (Einladung ist trotzdem Pflicht),
// Pro ist der bisherige Stand, Max bekommt mehr Reserven.
export type Plan = 'free' | 'pro' | 'max';

export const PLAN_INFO: Record<Plan, { label: string; terminals: number; vservers: number }> = {
  free: { label: 'Free', terminals: 2, vservers: 1 },
  pro: { label: 'Pro', terminals: 8, vservers: 5 },
  max: { label: 'Max', terminals: 8, vservers: 20 },
};

const STORAGE_KEY = 'fancyPlan';

export function readPlan(): Plan {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'pro' || value === 'max' || value === 'free') return value;
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

// Animierte Hintergründe (bewegter Farbverlauf, Videohintergrund) gibt es ab Pro.
export function animatedEffectsAllowed(plan: Plan = readPlan()) {
  return plan !== 'free';
}
