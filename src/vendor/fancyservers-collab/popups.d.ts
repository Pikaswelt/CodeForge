import type { CollabClient, Notification } from './client';
import { type AppKey } from './logos';
export interface PopupOptions {
    client: CollabClient;
    app: AppKey;
    /** Wird aufgerufen, wenn der Nutzer etwas öffnen will (Chat, DM, Video …). */
    onOpen?: (target: {
        kind: string;
        project_id?: number;
        channel_id?: number;
        thread_id?: number;
        media_id?: string;
        at_ms?: number | null;
    }) => void;
    /** Geteilte Agent-Session: angenommener Auftrag soll ausgeführt werden. */
    onAgentTask?: (task: {
        project: number;
        doc: string;
        text: string;
        from: any;
    }) => void;
    /** Ist der passende Chat gerade sichtbar? Dann keine DM-/Nachrichten-Popups. */
    isVisible?: (target: {
        thread_id?: number;
        project_id?: number;
        channel_id?: number;
    }) => boolean;
    container?: HTMLElement;
}
interface Card {
    key: string;
    title: string;
    text?: string;
    person?: any;
    logo?: AppKey | 'pair';
    pairApp?: string;
    actions: {
        label: string;
        primary?: boolean;
        danger?: boolean;
        run: () => Promise<unknown> | unknown;
    }[];
    timeout?: number;
}
export declare class PopupHost {
    el: HTMLElement;
    private opts;
    private shown;
    private off;
    constructor(opts: PopupOptions);
    destroy(): void;
    fromNotification(n: Notification): void;
    agentAsk(m: any): void;
    dm(m: any): void;
    show(card: Card): void;
    close(key: string): void;
}
export declare function roleLabel(role: string): string;
export {};
