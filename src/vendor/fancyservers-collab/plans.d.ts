import { type AppKey } from './logos';
export type PlanId = 'free' | 'mini' | 'pro' | 'max';
export interface PlanInfo {
    id: PlanId;
    name: string;
    tagline: string;
    icon: 'star' | 'bolt' | 'crown' | 'gem';
    popular?: boolean;
    badge: string;
    price: {
        month: number;
        yearMonthly: number;
        year: number;
    };
    tokens: {
        fiveHour: number;
        weekly: number;
    };
    monthlyResets: number;
    perks: string[];
    apps: Record<string, string[]>;
}
export interface PlanCatalog {
    version: number;
    order: PlanId[];
    yearlyDiscount: number;
    currency: string;
    upgradeUrl: string;
    plans: PlanInfo[];
    features: Record<string, {
        app: string;
        label: string;
        minPlan: PlanId;
    }>;
}
export interface UsageWindow {
    used: number;
    limit: number;
    resetAt: number;
}
/** Antwort von GET /v1/usage (oder Teil davon). */
export interface PlanUsage {
    plan?: string;
    fiveHour?: UsageWindow;
    weekly?: UsageWindow;
    unit?: string;
    resets?: number | null;
    planResets?: {
        left: number;
        total: number;
    };
    supermodeUntil?: number;
}
/** Eigene Zeilen der App, z. B. Terminals oder V-Server. limit null = unbegrenzt. */
export interface UsageRow {
    label: string;
    used: number;
    limit: number | null;
    unit?: string;
}
export interface PlansOptions {
    app: AppKey;
    /** Standard: https://account.crazymine.de */
    apiBase?: string;
    /** Aktueller Plan, falls die App ihn schon kennt (sonst aus fetchUsage). */
    plan?: () => string | null | undefined;
    fetchUsage?: () => Promise<PlanUsage | null>;
    /** Reset auslösen (POST /v1/usage/reset der App). Fehlt er, gibt es keinen Reset-Knopf. */
    resetUsage?: () => Promise<PlanUsage | null>;
    extraUsage?: () => UsageRow[] | Promise<UsageRow[]>;
    openExternal?: (url: string) => void;
    theme?: () => 'light' | 'dark';
    container?: HTMLElement;
    fetch?: typeof fetch;
    /** Wird aufgerufen, wenn das Fenster geschlossen wird. */
    onClose?: () => void;
}
/** Holt den Katalog einmal pro Sitzung; bei Fehlern bleibt die eingebaute Kopie. */
export declare function loadPlanCatalog(apiBase?: string, f?: typeof fetch): Promise<PlanCatalog>;
export declare function planCatalogSync(): PlanCatalog;
/** Alte Konten/Apps: unbekannte Werte zählen als free. */
export declare function normalizePlan(p: unknown): PlanId;
export declare function planRank(p: unknown): number;
export declare function planAtLeast(p: unknown, min: PlanId): boolean;
/** Anzeigename: free → Free, mini → Spark, pro → Nova, max → Galaxy. */
export declare function planLabel(p: unknown): string;
export declare function featureMinPlan(feature: string): PlanId;
export declare function featureAllowed(p: unknown, feature: string): boolean;
/** Kleines Abzeichen mit dem Plannamen (leer bei Free). */
export declare function planBadge(p: unknown): HTMLElement;
/**
 * Öffnet „Pläne & Nutzung“. tab: 'plans' (Karten) oder 'usage' (Verbrauch).
 * Gibt { close } zurück; Esc und Klick neben das Fenster schließen ebenfalls.
 */
export declare function openPlans(o: PlansOptions, tab?: 'plans' | 'usage'): {
    close: () => void;
};
/**
 * Prüft eine Funktion gegen den Plan. Gesperrt → kleines Fenster „Ab Spark verfügbar“ mit Knopf zu den Plänen.
 * Gibt true zurück, wenn die Funktion genutzt werden darf.
 */
export declare function requireFeature(o: PlansOptions, feature: string, plan?: unknown): boolean;
export declare function showLocked(o: PlansOptions, feature: string): {
    close: () => void;
};
