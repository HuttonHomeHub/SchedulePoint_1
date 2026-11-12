import { useCallback, useEffect, useRef } from 'react';

import { isTextEntryTarget } from './text-entry';

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
 * The handler no-ops when disabled (flag off or the user can't edit), while focus is in a
 * text-entry field (`isTextEntryTarget` — text-type inputs, textarea, select, contenteditable; a
 * checkbox or button is NOT one, so the plan's undo runs there), and while a modal dialog is open
 * (`modalOpen`) — otherwise `Ctrl+Z` would mutate plan state underneath an open
 * `ConfirmDialog`/`ActivityCreateDialog` (e.g. focus on a confirm's Cancel button).
 *
 * **The document fallback lives in the workspace's key scope, not here** (ADR-0218 D2). This hook used
 * to install its own `keydown` listener that acted only while `<body>` had focus (undo-redo M5, spec
 * F-4). It stood down for `<main>`, which is where a click on the diagram leaves focus, and copy/paste
 * had none at all, so one scope-level fallback replaced it. The hook is now only the handler.
 *
 * **Disabled is not silent when there was something to undo** (undo-redo M1-T4). A planner who
 * presses `Ctrl+Z` without the pen — or with the Late-start overlay on — used to get nothing at all,
 * which reads as "undo is broken". `onBlocked` lets the host say why; it returns whether it had a
 * step to refuse, and only then does the key's browser default get pre-empted. An empty history
 * leaves `Ctrl+Z` to the browser, exactly as before.
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
  /**
   * The accelerator fired while {@link enabled} is false. Return `true` when there was a step it
   * would have run and the refusal has been posted; `false` to leave the key alone.
   */
  onBlocked?: (direction: 'undo' | 'redo') => boolean;
}): (event: KeyLike) => void {
  const { enabled, modalOpen = false, undo, redo, onBlocked } = params;
  // Track `modalOpen` in a ref so the handler identity does not change every time a dialog opens
  // (it is composed with the `?` scope and bound once on the workspace root). Synced in an effect,
  // never during render.
  const modalOpenRef = useRef(modalOpen);
  // `onBlocked` is held the same way: the host builds it fresh each render, and depending on it
  // would rebind the root handler on every one.
  const onBlockedRef = useRef(onBlocked);
  useEffect(() => {
    modalOpenRef.current = modalOpen;
    onBlockedRef.current = onBlocked;
  }, [modalOpen, onBlocked]);
  const hasBlocked = onBlocked !== undefined;

  const handle = useCallback(
    (event: KeyLike): void => {
      if (!enabled && !hasBlocked) return;
      // Never fire while a modal dialog is open — an undo would mutate plan state under the modal.
      if (modalOpenRef.current) return;
      // Undo/redo are always modified (Cmd on macOS, Ctrl elsewhere) — bail early on a bare key.
      if (!event.metaKey && !event.ctrlKey) return;
      // AltGr is reported as Ctrl+Alt on Windows and types a character on some layouts (AltGr+Z, AltGr+Y),
      // so an Alt-chord is never an undo.
      if (event.altKey) return;
      const key = event.key.toLowerCase();
      // Never hijack an undo the user is typing into a text field (the native edit-undo owns it).
      if (isTextEntryTarget(event.target)) return;

      if (!enabled) {
        const direction =
          key === 'z'
            ? event.shiftKey
              ? 'redo'
              : 'undo'
            : key === 'y' && event.ctrlKey && !event.metaKey
              ? 'redo'
              : null;
        if (direction !== null && onBlockedRef.current?.(direction)) event.preventDefault();
        return;
      }

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
    [enabled, undo, redo, hasBlocked],
  );

  return handle;
}

/** The slice of a keyboard event the handler reads — a React synthetic event and a native one both fit. */
type KeyLike = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'target' | 'preventDefault'
>;
