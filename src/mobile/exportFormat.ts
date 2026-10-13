// File the desktop app writes with "Für Android exportieren" and the phone imports.
// Contains private keys when the user chose to include them, so it is meant to be moved to the
// phone and deleted afterwards.
export const EXPORT_TYPE = 'codeforge-mobile-export';
export const EXPORT_VERSION = 1;

export type ExportedServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  privateKey?: string;
  keyName?: string;
};

export type MobileExport = {
  type: typeof EXPORT_TYPE;
  version: number;
  exportedAt: number;
  servers: ExportedServer[];
  harnesses?: { id: string; name: string; command: string; icon: string }[];
  agyAccounts?: { id: string; name: string }[];
  theme?: string;
  customThemes?: { id: string; name: string; background: string; surface: string; text: string; accent: string; animatedGradient?: boolean; mediaOnly?: boolean; baseTheme?: string }[];
  apiProviders?: { id: string; name: string; provider: 'anthropic' | 'openai' | 'openai-compatible'; baseUrl: string; apiKey: string; model: string }[];
  terminal?: { prefixSuffixEnabled?: boolean; prefix?: string; suffix?: string; triggerWords?: string };
};

export function parseExport(text: string): MobileExport {
  let data: MobileExport;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine CodeForge-Exportdatei.');
  }
  if (!data || data.type !== EXPORT_TYPE || !Array.isArray(data.servers)) throw new Error('Die Datei ist keine CodeForge-Exportdatei.');
  if (data.version > EXPORT_VERSION) throw new Error('Die Exportdatei ist neuer als diese App. Bitte die App aktualisieren.');
  return data;
}
