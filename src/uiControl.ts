// Generic UI control for agents (via the codeforge MCP server): a text snapshot of every visible
// control with a short ref, plus click / type / key on those refs. Covers every CodeForge feature
// without a dedicated tool per feature. Terminal contents are left out; the terminal tools read those.

const INTERACTIVE =
  'button, a[href], input, textarea, select, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [contenteditable="true"], [contenteditable=""], label:has(input[type="checkbox"]), label:has(input[type="radio"]), .cursor-pointer';

let refs = new Map<string, HTMLElement>();

function isVisible(element: HTMLElement) {
  if (!element.isConnected || element.getClientRects().length === 0) return false;
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
}

function clean(value: string | null | undefined, max = 70) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Icon-only buttons: lucide icons carry their name as a class (lucide-x, lucide-settings ...).
function iconName(element: HTMLElement) {
  const svg = element.querySelector('svg');
  if (!svg) return '';
  const name = [...svg.classList].find((item) => item.startsWith('lucide-'))?.slice(7);
  return name ? `(Symbol: ${name})` : '(Symbol)';
}

function describe(element: HTMLElement) {
  const tag = element.tagName.toLowerCase();
  const input = element as HTMLInputElement;
  const role = element.getAttribute('role');
  let kind = role || tag;
  if (tag === 'input') kind = input.type === 'checkbox' || input.type === 'radio' ? input.type : `input:${input.type || 'text'}`;
  if (tag === 'label') kind = 'toggle';
  const name =
    clean(element.getAttribute('aria-label')) ||
    clean(element.innerText) ||
    clean(element.getAttribute('title')) ||
    clean((element as HTMLInputElement).placeholder) ||
    clean(element.getAttribute('name')) ||
    iconName(element);
  const title = clean(element.getAttribute('title'));
  const state: string[] = [];
  const checkbox = tag === 'label' ? (element.querySelector('input') as HTMLInputElement | null) : input;
  if (checkbox && (checkbox.type === 'checkbox' || checkbox.type === 'radio')) state.push(checkbox.checked ? 'an' : 'aus');
  if ((element as HTMLButtonElement).disabled) state.push('deaktiviert');
  if (tag === 'select') state.push(`Wert: ${clean((element as HTMLSelectElement).selectedOptions[0]?.text)}`);
  else if ((tag === 'input' && input.type !== 'password' && input.type !== 'checkbox' && input.type !== 'radio') || tag === 'textarea') {
    state.push(`Wert: "${clean(input.value, 120)}"`);
  }
  if (element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-selected') === 'true') state.push('aktiv');
  return `${kind} "${name}"${title && title !== name ? ` (Tipp: ${title})` : ''}${state.length ? ` [${state.join(', ')}]` : ''}`;
}

export function uiSnapshot() {
  refs = new Map();
  const lines: string[] = [];
  const headings = [...document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="dialog"] .section-label, .section-label')]
    .filter((element) => isVisible(element) && !element.closest('.xterm'))
    .map((element) => clean(element.innerText, 60))
    .filter(Boolean);
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"], .fixed.inset-0')].find(isVisible);
  if (dialog) lines.push('Hinweis: Ein Dialog/Overlay ist offen (Escape schliesst ihn meist).');
  if (headings.length) lines.push(`Ueberschriften: ${[...new Set(headings)].slice(0, 25).join(' | ')}`);
  let index = 0;
  const seen = new Set<HTMLElement>();
  for (const element of document.querySelectorAll<HTMLElement>(INTERACTIVE)) {
    if (seen.has(element) || element.closest('.xterm') || !isVisible(element)) continue;
    // A clickable wrapper whose only job is to hold a real control is skipped.
    if (element.classList.contains('cursor-pointer') && !element.matches('button, a, input, label, [role]')) {
      const inner = element.querySelector<HTMLElement>('button, a[href], input, textarea, select');
      if (inner && clean(element.innerText) === clean(inner.innerText)) continue;
    }
    // A checkbox inside a listed label is covered by the label.
    if (element.tagName === 'INPUT' && element.closest('label') && seen.has(element.closest('label') as HTMLElement)) continue;
    seen.add(element);
    index += 1;
    const ref = `e${index}`;
    refs.set(ref, element);
    lines.push(`[${ref}] ${describe(element)}`);
    if (index >= 400) {
      lines.push('… (weitere Elemente abgeschnitten)');
      break;
    }
  }
  const terminals = [...document.querySelectorAll<HTMLElement>('[data-terminal-tab-id]')].filter(isVisible);
  if (terminals.length) {
    lines.push(`Sichtbare Terminals (Inhalt mit codeforge_read): ${terminals.map((element) => element.dataset.terminalTabId).join(', ')}`);
  }
  return lines.join('\n');
}

function resolve(ref: string) {
  const element = refs.get(ref);
  if (!element || !element.isConnected) throw new Error(`Element ${ref} gibt es nicht mehr. Zuerst codeforge_ui_snapshot aufrufen.`);
  return element;
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

export async function uiClick(ref: string, button: 'left' | 'right' | 'double' = 'left') {
  const element = resolve(ref);
  element.scrollIntoView({ block: 'center', inline: 'center' });
  const rect = element.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  if (button === 'right') {
    element.dispatchEvent(new MouseEvent('contextmenu', { ...init, button: 2 }));
  } else {
    element.dispatchEvent(new PointerEvent('pointerdown', init));
    element.dispatchEvent(new MouseEvent('mousedown', init));
    element.dispatchEvent(new PointerEvent('pointerup', init));
    element.dispatchEvent(new MouseEvent('mouseup', init));
    element.click();
    if (button === 'double') element.dispatchEvent(new MouseEvent('dblclick', init));
  }
  await pause(350);
}

export async function uiType(ref: string, text: string, options: { submit?: boolean; clear?: boolean } = {}) {
  const element = resolve(ref);
  element.focus();
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const next = options.clear ? text : element.value + text;
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element instanceof HTMLSelectElement) {
    const option = [...element.options].find((item) => item.value === text || item.text.trim().toLowerCase() === text.trim().toLowerCase());
    if (!option) throw new Error(`Option "${text}" gibt es nicht. Moeglich: ${[...element.options].map((item) => item.text.trim()).join(', ')}`);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(element, option.value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    if (options.clear) document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
  }
  if (options.submit) {
    await pause(100);
    const enter = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    element.dispatchEvent(new KeyboardEvent('keydown', enter));
    element.dispatchEvent(new KeyboardEvent('keyup', enter));
  }
  await pause(300);
}

// Keys like "Escape", "Enter", "Tab", "ctrl+,", "alt+s" go to the focused element (or the window).
export async function uiKey(combo: string) {
  const parts = combo.split('+').map((part) => part.trim());
  const rawKey = parts.pop() || '';
  const mods = new Set(parts.map((part) => part.toLowerCase()));
  const names: Record<string, string> = { esc: 'Escape', escape: 'Escape', enter: 'Enter', tab: 'Tab', space: ' ', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', backspace: 'Backspace', delete: 'Delete' };
  const key = names[rawKey.toLowerCase()] || rawKey;
  const init = {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    bubbles: true,
    cancelable: true,
    ctrlKey: mods.has('ctrl') || mods.has('control'),
    altKey: mods.has('alt'),
    shiftKey: mods.has('shift'),
    metaKey: mods.has('meta') || mods.has('cmd'),
  };
  const target = (document.activeElement as HTMLElement | null) || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', init));
  target.dispatchEvent(new KeyboardEvent('keyup', init));
  await pause(300);
}
