/**
 * **What a finger or stylus is told when it selects a bar** (ADR-0177 D2).
 *
 * A mouse sees the cursor change and reads a `title`; a touch has neither. So selecting a bar by
 * touch or stylus puts one sentence in a visible `role="status"` line: the bar's refusal reason when
 * it cannot move, or — once per session — how to use it when it can. These are selection-time facts,
 * not write outcomes, so they are not the "after the write settles" announcement ADR-0170 D6 owns.
 */

export const TOUCH_ARM_HINT = 'Drag to move, or press and hold for actions';

const HINT_STORAGE_KEY = 'schedulepoint:gantt-touch-hint-seen';

/**
 * Has this session already been shown the hint? Recording it is part of asking, so a caller cannot
 * show it twice by forgetting to write the flag.
 *
 * `sessionStorage` can throw (blocked storage, a sandboxed frame). The hint is a courtesy, so a
 * failure means it is shown again next time rather than never — the harmless direction.
 */
export function takeTouchHint(): boolean {
  try {
    if (window.sessionStorage.getItem(HINT_STORAGE_KEY) !== null) return false;
    window.sessionStorage.setItem(HINT_STORAGE_KEY, '1');
  } catch {
    return true;
  }
  return true;
}

/**
 * The line for a bar just selected by touch or stylus, or null when there is nothing to add.
 * `hintDue` is read lazily, so the once-per-session flag is spent only when the hint is the line
 * that would be shown.
 */
export function touchSelectionNote(
  gate: { movable: boolean; reason: string | null },
  hintDue: () => boolean,
  hasDraggableBar = true,
): string | null {
  if (!gate.movable) return gate.reason;
  // A movable activity whose bar nothing can drag (a diamond, an uncalculated row) has no gesture
  // to teach, so the hint's once-per-session flag is not spent on it either.
  return hasDraggableBar && hintDue() ? TOUCH_ARM_HINT : null;
}
