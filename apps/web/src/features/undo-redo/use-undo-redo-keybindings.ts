import { useEffect, useRef, type RefObject } from 'react';

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
 * fires alongside ours. The handler no-ops when disabled (flag off or the user can't edit), while
 * focus is in a text field / textarea / select / contenteditable (so typing an undo in a form is never
 * hijacked), and while a modal dialog is open (`modalOpen`) — otherwise `Ctrl+Z` would mutate plan
 * state underneath an open `ConfirmDialog`/`ActivityFormDialog` (e.g. focus on a confirm's Cancel
 * button, which isn't a text field). When `enabled` is false no listener is attached at all (flag-off ⇒
 * byte-identical).
 */
export function useUndoRedoKeybindings(params: {
  /** The workspace root the listener scopes to (keydown bubbles here from the canvas / toolbar). */
  rootRef: RefObject<HTMLElement | null>;
  /** Attach only when the feature is on AND the user can author (holds the pen; not read-only). */
  enabled: boolean;
  /**
   * A modal dialog/form is open — the accelerators go inert so an undo/redo never mutates plan state
   * from beneath a modal (the host folds the plan dialogs + the activity edit/delete dialogs + the
   * edit-plan form into this flag). Read live so opening a dialog suppresses the next keystroke
   * without re-attaching the listener.
   */
  modalOpen?: boolean;
  undo: () => void;
  redo: () => void;
}): void {
  const { rootRef, enabled, modalOpen = false, undo, redo } = params;
  // Track `modalOpen` in a ref so the handler reads the live value without the effect re-subscribing
  // (and so an already-attached listener honours a dialog that opened after mount). Synced in an
  // effect (never during render) so the ref update stays outside the render pass.
  const modalOpenRef = useRef(modalOpen);
  useEffect(() => {
    modalOpenRef.current = modalOpen;
  }, [modalOpen]);
  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent): void => {
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
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [rootRef, enabled, undo, redo]);
}
