export declare const DEFAULT_HUB = "https://fancyagent.crazymine.de";
export type DeviceApp = 'fancycode' | 'kuroi' | 'fancyagent-desktop';
export interface Person {
    id: number;
    login: string;
    name: string;
    avatar_url: string;
    github?: boolean;
}
export interface Notification {
    id: number;
    kind: 'project_invite' | 'link_request' | 'mention' | 'media_comment' | 'info' | string;
    state: string;
    created_at: number;
    expires_at: number | null;
    [k: string]: any;
}
export interface CollabState {
    me: Person;
    plan: 'free' | 'pro' | 'max';
    projects: {
        id: number;
        name: string;
        slug: string;
        my_role: string;
    }[];
    dms: any[];
    notifications: Notification[];
    devices: any[];
    media: {
        used: number;
        limit: number;
        upload_limit: number;
        plan: string;
        enabled?: boolean;
    };
    device?: {
        id: string;
        app: string;
        approved: boolean;
    } | null;
}
export interface ClientOptions {
    hub?: string;
    mode: 'device' | 'cookie';
    /** Geräte-Token (Modus device). */
    token?: string | null;
    /** CSRF-Token (Modus cookie). */
    csrf?: string;
    app?: DeviceApp | 'web';
    /** Eigenes fetch (z. B. Tauri-HTTP). */
    fetch?: typeof fetch;
    WebSocket?: typeof WebSocket;
}
type Listener = (msg: any) => void;
export declare class HubError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string);
}
/**
 * Meldet eine Desktop-App am Hub an: FancyServers-Token (aus dem App-Login) → Geräte-Token.
 * Das Gerät ist danach noch nicht verbunden – erst nach Bestätigung (Popup auf der anderen Seite).
 */
export declare function registerDevice(opts: {
    hub?: string;
    accountToken: string;
    app: DeviceApp;
    name: string;
    fetch?: typeof fetch;
}): Promise<{
    token: string;
    device: {
        id: string;
        approved: boolean;
    };
    user: Person;
    plan: string;
}>;
export declare class CollabClient {
    readonly hub: string;
    readonly mode: 'device' | 'cookie';
    token: string | null;
    csrf: string;
    state: CollabState | null;
    connected: boolean;
    approved: boolean;
    private ws;
    private listeners;
    private subs;
    private docs;
    private retry;
    private stopped;
    private pingTimer;
    private reconnectTimer;
    private f;
    private WS;
    constructor(opts: ClientOptions);
    on(type: string, fn: Listener): () => boolean | undefined;
    emit(type: string, msg: any): void;
    api<T = any>(method: string, path: string, body?: unknown): Promise<T>;
    loadState(): Promise<CollabState>;
    /** App bittet um Verbindung – bestätigt wird in FancyAgent (Popup). */
    requestLink(): Promise<any>;
    answerLink(requestId: string, accept: boolean): Promise<any>;
    answerInvite(projectId: number, accept: boolean): Promise<any>;
    dismiss(notificationId: number): Promise<any>;
    /**
     * Lädt eine Datei hoch. Für Videos vorher komprimieren (Kuroi Studio macht das mit FFmpeg).
     * onProgress bekommt 0..1.
     */
    upload(file: Blob, opts: {
        projectId?: number | null;
        kind: 'video' | 'image' | 'audio' | 'file';
        name: string;
        meta?: any;
        onProgress?: (p: number) => void;
    }): Promise<any>;
    mediaUrl(id: string): string;
    /** Medien mit Geräte-Token als Blob-URL laden (img/video können keinen Authorization-Header schicken). */
    mediaBlobUrl(id: string): Promise<string>;
    private raw;
    connect(): void;
    private scheduleReconnect;
    disconnect(): void;
    private rawSend;
    send(msg: any): void;
    subscribe(projectId: number): void;
    unsubscribe(projectId: number): void;
    presence(projectId: number, activity: string, doc?: string): void;
    joinDoc(projectId: number, doc: string, opts?: {
        kind?: string;
        title?: string;
    }): void;
    leaveDoc(projectId: number, doc: string): void;
}
/** Kurze, freundliche Zeitangabe („gerade eben“, „vor 5 Min.“, „gestern 14:03“). */
export declare function timeLabel(ts: number): string;
export {};
