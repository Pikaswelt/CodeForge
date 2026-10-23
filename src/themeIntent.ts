// Fragt der Nutzer den Agenten nach einem eigenen Theme, öffnet die App das Theme-Fenster.
export const THEME_CREATOR_EVENT = 'codeforge:create-theme';

export function wantsThemeCreator(text: string) {
  const value = text.trim();
  if (!value || value.length > 400) return false;
  const topic = /(theme|design|hintergrund|background|look|aussehen|skin)/i.test(value);
  const action = /(erstell|mach|bau|anwend|änder|wechsel|create|make|apply|change|custom|eigen)/i.test(value);
  return topic && action;
}
