export type AppKey = 'fancycode' | 'fancyagent' | 'kuroi';
export interface AppBrand {
    key: AppKey;
    name: string;
    letters: [string, string];
    /** Akzentfarbe für Buttons, Links, Ränder. */
    accent: string;
    /** Verlauf der Kachel: oben links → unten rechts. */
    from: string;
    to: string;
    /** Helle Farbe für Text auf dunklem Grund. */
    light: string;
}
export declare const BRANDS: Record<AppKey, AppBrand>;
/** Normalisiert App-Kennungen (Geräte-Apps, Konto-Apps) auf eine Marke. */
export declare function brandOf(app: string | null | undefined): AppBrand;
/**
 * SVG der Kachel. size nur für width/height, die Grafik ist 512×512.
 * Gleiche Geometrie für alle Apps, nur Farben und Buchstaben unterscheiden sich.
 */
export declare function logoSvg(app: AppKey | string, size?: number): string;
/** Data-URL für <img src>. */
export declare function logoDataUrl(app: AppKey | string): string;
