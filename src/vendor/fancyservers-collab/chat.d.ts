import { CollabClient, type Person } from './client';
import { type AppKey } from './logos';
export interface ChatOptions {
    client: CollabClient;
    app: AppKey;
    /** Live-Dokument/Terminal/Video öffnen – macht die Host-App (z. B. Kuroi öffnet die Timeline). */
    onOpenDoc?: (d: {
        project: number;
        doc: string;
        kind: string;
        title: string;
    }) => void;
    onOpenTerminal?: (t: {
        project: number;
        sid: string;
        title: string;
        owner: Person;
    }) => void;
    onOpenMedia?: (m: {
        project: number;
        media: any;
        at_ms?: number | null;
    }) => void;
    /** Externe Links (Browser). Standard: window.open. */
    openExternal?: (url: string) => void;
    /** Welche Dokumentarten diese App öffnen kann (z. B. Kuroi: kuroi-timeline). */
    docKinds?: string[];
}
export declare class CollabChat {
    el: HTMLElement;
    private c;
    private o;
    private view;
    private rail;
    private side;
    private main;
    private members;
    private list;
    private typingEl;
    private composer;
    private replyTo;
    private messages;
    private hasMore;
    private presence;
    private channels;
    private typing;
    private lastTypingSent;
    private off;
    private blobUrls;
    private pendingFiles;
    constructor(container: HTMLElement, opts: ChatOptions);
    destroy(): void;
    /** Von außen öffnen (Popup „Öffnen“, Deep-Link). */
    open(target: {
        kind: string;
        project_id?: number;
        channel_id?: number;
        thread_id?: number;
    }): Promise<void>;
    private go;
    private channelName;
    private loadChannels;
    private reloadChannels;
    private renderAll;
    private renderStatus;
    private renderRail;
    private renderSide;
    private meBar;
    private renderMain;
    private renderLink;
    private renderMembers;
    private historyPath;
    private loadMessages;
    private loadOlder;
    private fetchNewer;
    private markRead;
    private renderMessages;
    private messageEl;
    private attachmentEl;
    /** Video mit Kommentaren an Zeitstempeln (Feedback zu geteilten Kuroi-Videos). */
    openMedia(id: string, atMs?: number | null): Promise<void>;
    private scrollTo;
    private react;
    private replaceMessage;
    private editMessage;
    private deleteMessage;
    private setReply;
    private renderComposer;
    private renderPending;
    private submit;
    private sendTyping;
    private mentionSuggest;
    private onMessage;
    private onDm;
    private onMessageUpdate;
    private onTyping;
    private renderTyping;
    private modal;
    private confirm;
    private toast;
    private newChannelDialog;
    private newDmDialog;
    private inviteDialog;
    private emojiPicker;
    private external;
}
