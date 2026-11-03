export * from './client';
export * from './logos';
export { PopupHost, roleLabel, type PopupOptions } from './popups';
export { CollabChat, type ChatOptions } from './chat';
export { h, avatar, richText, formatBytes } from './dom';
import { CollabClient } from './client';
import { CollabChat, type ChatOptions } from './chat';
import { PopupHost } from './popups';
import type { AppKey } from './logos';
export interface StartOptions {
    client: CollabClient;
    app: AppKey;
    /** Wo der Chat hin soll. Ohne: nur Popups (z. B. solange der Chat-Tab zu ist). */
    container?: HTMLElement | null;
    popupContainer?: HTMLElement;
    chat?: Omit<ChatOptions, 'client' | 'app'>;
    onAgentTask?: (task: {
        project: number;
        doc: string;
        text: string;
        from: any;
    }) => void;
    /** Wird aufgerufen, wenn ein Popup etwas öffnen will und der Chat erst sichtbar gemacht werden muss. */
    onShowChat?: () => void;
}
/** Startet Verbindung, Popups und (optional) den Chat. Gibt Steuerobjekt zurück. */
export declare function startCollab(o: StartOptions): {
    client: CollabClient;
    popups: PopupHost;
    ready: Promise<void>;
    readonly chat: CollabChat | null;
    /** Chat später einhängen (z. B. wenn der Tab geöffnet wird). */
    mountChat(container: HTMLElement): CollabChat;
    stop(): void;
};
export { startAppPopups, pageTheme, type AccountPopup, type AppStatus, type AppPopupOptions } from './apppopups';
export { openPlans, requireFeature, showLocked, loadPlanCatalog, planCatalogSync, planLabel, planBadge, planAtLeast, planRank, featureAllowed, featureMinPlan, normalizePlan as normalizePlanId, type PlanId, type PlanInfo, type PlanCatalog, type PlanUsage, type UsageRow, type PlansOptions, } from './plans';
