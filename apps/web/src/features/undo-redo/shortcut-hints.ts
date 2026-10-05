/**
 * The undo/redo accelerators as a planner is told them (undo-redo M5, spec §4.7).
 *
 * The handler accepts Cmd **or** Ctrl on every platform, so what differs is only which one the
 * planner expects to see: macOS users read ⌘Z and ⇧⌘Z, everyone else Ctrl+Z and Ctrl+Y. A tooltip
 * that says "Ctrl+Z" to a Mac user points at the wrong key, and one that says "Cmd / Ctrl"
 * everywhere makes every user translate it.
 */
export interface ShortcutHint {
  /** What a sighted planner reads in a tooltip or the shortcuts sheet. */
  display: string;
  /** The `aria-keyshortcuts` value — space-separated alternatives, each a `+`-joined chord. */
  aria: string;
}

export interface UndoRedoHints {
  undo: ShortcutHint;
  redo: ShortcutHint;
}

/**
 * Whether this browser is on an Apple platform. `userAgentData` first (the non-deprecated source,
 * Chromium only), `navigator.platform` as the fallback every other engine still answers.
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function undoRedoHints(apple: boolean = isApplePlatform()): UndoRedoHints {
  return apple
    ? {
        undo: { display: '⌘Z', aria: 'Meta+Z Control+Z' },
        redo: { display: '⇧⌘Z', aria: 'Meta+Shift+Z Control+Shift+Z' },
      }
    : {
        undo: { display: 'Ctrl+Z', aria: 'Control+Z' },
        redo: { display: 'Ctrl+Y or Ctrl+Shift+Z', aria: 'Control+Y Control+Shift+Z' },
      };
}
