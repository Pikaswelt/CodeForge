type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, any> | null;
export declare function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Child[]): HTMLElementTagNameMap[K];
export declare function clear(el: Element): void;
/** Avatar: Bild oder farbiger Kreis mit Initiale. */
export declare function avatar(p: {
    name?: string;
    login?: string;
    avatar_url?: string;
} | null | undefined, size?: number): HTMLSpanElement;
/**
 * Sehr kleines, sicheres Markdown: ```code```, `code`, **fett**, *kursiv*, Links (nur http/https), @Erwähnungen.
 * Baut DOM-Knoten, nie innerHTML mit Nutzertext.
 */
export declare function richText(text: string, meLogin?: string): Node;
export declare function formatBytes(n: number): string;
export {};
