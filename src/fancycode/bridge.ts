// Bridge der FancyCode-Ansicht zum Hauptprozess (Preload stellt window.fancycode bereit).
import type { FancyCodeBridge } from './FancyCodePanel';

declare global {
  interface Window {
    fancycode?: FancyCodeBridge;
  }
}

export function fancycodeBridge(): FancyCodeBridge | null {
  return typeof window !== 'undefined' && window.fancycode ? window.fancycode : null;
}
