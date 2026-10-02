/**
 * Shortcuts match physical keys (KeyboardEvent.code), so they work with an Arabic keyboard layout where `.key`
 * returns Arabic letters (research memo §4.10). Editing shortcuts use Ctrl+Shift (Cmd+Shift on macOS) and avoid
 * keys browsers reserve (Ctrl+Shift+I/J/C/N/T/W/Q).
 */
export const mod = (e: KeyboardEvent | React.KeyboardEvent) => e.ctrlKey || e.metaKey;
export const modShift = (e: KeyboardEvent | React.KeyboardEvent, code: string) => mod(e) && e.shiftKey && !e.altKey && e.code === code;
export const modOnly = (e: KeyboardEvent | React.KeyboardEvent, code: string) => mod(e) && !e.shiftKey && !e.altKey && e.code === code;

/** Digit 1–9 from a physical key (top row or numpad), else null. */
export function digitOf(e: KeyboardEvent | React.KeyboardEvent): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  return m ? Number(m[1]) : null;
}

/** True while the user types in a field (global single-key shortcuts must not fire). */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD_LABEL = () => (isMac() ? "⌘" : "Ctrl");

export const EDITOR_KEYS = {
  unclear: "KeyU",
  gap: "KeyG",
  supplied: "KeyS",
  del: "KeyD",
  add: "KeyA",
  abbr: "KeyE",
  marks: "KeyM",
  hi: "KeyH",
  clear: "KeyX",
  chars: "KeyK",
  reading: "KeyF",
  zoomLine: "KeyL",
} as const;
