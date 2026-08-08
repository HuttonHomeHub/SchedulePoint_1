import { useCallback, useEffect, useRef } from 'react';

/**
 * `Cmd/Ctrl+C` / `Cmd/Ctrl+V` for the plan workspace (`docs/specs/activity-copy-paste/` M3-T2).
 *
 * **A React `onKeyDown` handler, never a native listener**, for the reason
 * `use-undo-redo-keybindings.ts` gives and this hook inherits: the TSLD toolbar is portalled into
 * the chrome band (ADR-0055 S2), so it is not a DOM descendant of the workspace root. A native
 * listener follows the DOM tree and would go silently deaf to every keystroke typed while a toolbar
 * control has focus — no error, nothing failing, just a shortcut that stops working in one place.
 *
 * **The extra guard, and why the undo hook's is not enough.** Undo has no benign meaning outside a
 * form field, so `closest('input, textarea, …')` covers it. `Ctrl+C` does: a planner can select
 * label text inside the activities table with focus on a table row — not a text field, so the undo
 * hook's guard passes it — press `Ctrl+C` expecting the text, and get a silent activity copy while
 * their clipboard keeps whatever was in it before. That is the single most likely user-visible
 * defect in this epic, and it is a **test before it is a line of code**: the handler stands down
 * whenever the document has a non-collapsed selection, so a genuine text copy always wins.
 *
 * There is no symmetric guard on paste. `Ctrl+V` outside a text field has no browser behaviour to
 * hijack — there is nothing to paste into — so a selection is not evidence of intent there, and
 * standing down would leave the planner with a shortcut that works or not depending on whether they
 * happened to have text selected.
 *
 * Every handled combo calls `preventDefault()` (the TECH_DEBT #25 precedent), so the browser's own
 * copy never fires alongside ours.
 */
export function useClipboardKeybindings(params: {
  /** Handle only when the feature is on AND the planner may create activities. */
  enabled: boolean;
  /**
   * A modal dialog is open — the accelerators go inert, so a paste never writes plan state from
   * beneath a `ConfirmDialog` or the activity editor. Read live via a ref, as undo/redo does.
   */
  modalOpen?: boolean;
  onCopy: () => void;
  onPaste: () => void;
}): React.KeyboardEventHandler<HTMLElement> {
  const { enabled, modalOpen = false, onCopy, onPaste } = params;
  const modalOpenRef = useRef(modalOpen);
  useEffect(() => {
    modalOpenRef.current = modalOpen;
  }, [modalOpen]);

  return useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      if (!enabled) return;
      if (modalOpenRef.current) return;
      if (!event.metaKey && !event.ctrlKey) return;
      // Shift+Ctrl+C is the browser devtools/inspector chord on several platforms, and Ctrl+Alt+C
      // is claimed by assistive software. Neither is ours; requiring a bare modifier leaves both.
      if (event.shiftKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key !== 'c' && key !== 'v') return;

      // Never hijack a copy or paste the planner is typing into a form field.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      if (key === 'c') {
        // The guard the undo hook does not need: a live text selection means the planner is copying
        // TEXT, and taking that keystroke would swap their clipboard contents for a silent activity
        // copy. `getSelection` is absent in some non-browser environments, so its absence is treated
        // as "no selection" rather than assumed.
        const selection = typeof window === 'undefined' ? null : window.getSelection();
        if (selection !== null && !selection.isCollapsed) return;
        event.preventDefault();
        onCopy();
        return;
      }

      event.preventDefault();
      onPaste();
    },
    [enabled, onCopy, onPaste],
  );
}
