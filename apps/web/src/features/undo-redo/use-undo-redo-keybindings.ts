import { useEffect, type RefObject } from 'react';

/**
 * Scoped Undo/Redo keybindings for the plan workspace (ADR-0048 M3.2). Attached to the workspace root
 * element (not the document) so the accelerators only fire when focus is inside the plan surface —
 * mirroring the workspace-scoped `?` shortcut and the listbox-scoped `Alt+←/→` time-nudge. Bindings:
 *
 * - `Cmd/Ctrl+Z` → undo
 * - `Cmd/Ctrl+Shift+Z` → redo
 * - `Ctrl+Y` → redo (the Windows convention; not `Cmd+Y`, a macOS history shortcut)
 *
 * Each handled combo calls `preventDefault()` — the same Back/Forward-suppression mitigation the
 * `Alt+←/→` nudge uses (TECH_DEBT #25) — so the browser's native edit-undo / history navigation never
 * fires alongside ours. The handler no-ops when disabled (flag off or the user can't edit), and while
 * focus is in a text field / textarea / select / contenteditable, so typing an undo in a form is never
 * hijacked. When `enabled` is false no listener is attached at all (flag-off ⇒ byte-identical).
 */
export function useUndoRedoKeybindings(params: {
  /** The workspace root the listener scopes to (keydown bubbles here from the canvas / toolbar). */
  rootRef: RefObject<HTMLElement | null>;
  /** Attach only when the feature is on AND the user can author (holds the pen; not read-only). */
  enabled: boolean;
  undo: () => void;
  redo: () => void;
}): void {
  const { rootRef, enabled, undo, redo } = params;
  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      // Undo/redo are always modified (Cmd on macOS, Ctrl elsewhere) — bail early on a bare key.
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      // Never hijack an undo the user is typing into a form field (the native edit-undo owns it there).
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      if (key === 'z' && event.shiftKey) {
        // Cmd/Ctrl+Shift+Z → redo.
        event.preventDefault();
        redo();
      } else if (key === 'z') {
        // Cmd/Ctrl+Z → undo.
        event.preventDefault();
        undo();
      } else if (key === 'y' && event.ctrlKey && !event.metaKey) {
        // Ctrl+Y → redo (Windows); deliberately not Cmd+Y.
        event.preventDefault();
        redo();
      }
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [rootRef, enabled, undo, redo]);
}
