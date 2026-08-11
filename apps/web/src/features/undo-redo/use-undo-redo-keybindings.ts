import { useCallback, useEffect, useRef } from 'react';

/**
 * Scoped Undo/Redo keybindings for the plan workspace (ADR-0048 M3.2). Bindings:
 *
 * - `Cmd/Ctrl+Z` → undo
 * - `Cmd/Ctrl+Shift+Z` → redo
 * - `Ctrl+Y` → redo (the Windows convention; not `Cmd+Y`, a macOS history shortcut)
 *
 * **It returns a React `onKeyDown` handler rather than attaching a native listener** (ADR-0055
 * §3, spec §4.7 D2). A native listener follows the DOM tree; React events follow the REACT tree.
 * Once the toolbar is portalled into the chrome band (S2) it stops being a DOM descendant of the
 * workspace root — a native listener would go silently deaf to every keystroke typed while a
 * toolbar control has focus, with no error and nothing failing. Returning a handler makes the
 * binding work through the portal by construction, which is why this change lands *before* the
 * portal exists rather than alongside it.
 *
 * Each handled combo calls `preventDefault()` — the same Back/Forward-suppression mitigation the
 * `Alt+←/→` nudge uses (TECH_DEBT #25) — so the browser's native edit-undo / history navigation
 * never fires alongside ours. React's synthetic `preventDefault()` calls through to the native
 * event, so the suppression survives the move.
 *
 * The handler no-ops when disabled (flag off or the user can't edit), while focus is in a text
 * field / textarea / select / contenteditable (so typing an undo in a form is never hijacked), and
 * while a modal dialog is open (`modalOpen`) — otherwise `Ctrl+Z` would mutate plan state
 * underneath an open `ConfirmDialog`/`ActivityCreateDialog` (e.g. focus on a confirm's Cancel
 * button, which isn't a text field).
 */
export function useUndoRedoKeybindings(params: {
  /** Handle only when the feature is on AND the user can author (holds the pen; not read-only). */
  enabled: boolean;
  /**
   * A modal dialog/form is open — the accelerators go inert so an undo/redo never mutates plan state
   * from beneath a modal (the host folds the plan dialogs + the activity edit/delete dialogs + the
   * edit-plan form into this flag). Read live so opening a dialog suppresses the next keystroke.
   */
  modalOpen?: boolean;
  undo: () => void;
  redo: () => void;
}): React.KeyboardEventHandler<HTMLElement> {
  const { enabled, modalOpen = false, undo, redo } = params;
  // Track `modalOpen` in a ref so the handler identity does not change every time a dialog opens
  // (it is composed with the `?` scope and bound once on the workspace root). Synced in an effect,
  // never during render.
  const modalOpenRef = useRef(modalOpen);
  useEffect(() => {
    modalOpenRef.current = modalOpen;
  }, [modalOpen]);

  return useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      if (!enabled) return;
      // Never fire while a modal dialog is open — an undo would mutate plan state under the modal.
      if (modalOpenRef.current) return;
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
    },
    [enabled, undo, redo],
  );
}
