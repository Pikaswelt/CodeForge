import { type AppKey } from './logos';
export interface AccountPopup {
    id: string;
    kind: 'gift' | 'notice';
    title: string;
    message: string;
    image?: string;
    imageLight?: string;
    imageDark?: string;
    blocking?: boolean;
    cta?: {
        label: string;
        url: string;
    } | null;
    plan?: 'mini' | 'pro' | 'max' | null;
    days?: number;
    resets?: number;
    supermode?: boolean;
}
export interface AppStatus {
    maintenance: {
        active: boolean;
        title: string;
        message: string;
        until: number;
        image: string;
    } | null;
    update: {
        latest: string;
        minVersion: string;
        required: boolean;
        available: boolean;
        notes: string;
        url: string;
    };
}
export interface AppPopupOptions {
    app: AppKey;
    /** z. B. https://account.crazymine.de – für /v1/app/status und relative Bildpfade. */
    apiBase: string;
    /** Installierte Version der App (für Pflicht-Updates). */
    version: string;
    theme?: () => 'light' | 'dark';
    /** Popups des angemeldeten Kontos (GET /v1/announcements der App). Ohne Anmeldung: leere Liste. */
    fetchPopups?: () => Promise<AccountPopup[]>;
    markSeen?: (ids: string[]) => Promise<unknown>;
    /** Update starten (App-eigener Updater). Fehlt er, öffnet der Knopf den Download-Link. */
    onUpdate?: (status: AppStatus['update']) => void | Promise<void>;
    openExternal?: (url: string) => void;
    container?: HTMLElement;
    pollMs?: number;
    fetch?: typeof fetch;
}
/** Hell oder dunkel nach dem tatsächlichen Hintergrund der App (funktioniert mit jedem Theme-System). */
export declare function pageTheme(): 'light' | 'dark';
export declare function startAppPopups(o: AppPopupOptions): {
    check: () => Promise<void>;
    /** Nach Theme-Wechsel neu zeichnen. */
    refresh: () => void;
    readonly blocked: boolean;
    stop(): void;
};
