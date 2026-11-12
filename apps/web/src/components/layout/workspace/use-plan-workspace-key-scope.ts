import { useCallback, useEffect, useRef } from 'react';

import { useClipboardKeybindings } from '@/features/activity-copy';
import { useUndoRedoKeybindings } from '@/features/undo-redo';

/**
 * The plan workspace's **keyboard scope** — one `onKeyDown` bound to the workspace root, composing
 * the `?` shortcuts-sheet binding with the ADR-0048 undo/redo accelerators.
 *
 * Why a React handler rather than the two native `keydown` listeners this replaces: a native
 * listener follows the DOM tree, and once the toolbar is portalled into the chrome band (ADR-0055
 * S2) it is no longer a DOM descendant of the workspace root. Both bindings would have gone
 * silently deaf while a toolbar control had focus — no error, no failing test, just shortcuts that
 * stopped working for the one surface a planner uses most. React events follow the React tree, so
 * the portal is invisible to them.
 *
 * The handlers cannot swallow each other, and that is a structural property rather than an ordering
 * anybody has to preserve: `?` returns early on **any** modifier; undo/redo returns early **without**
 * one and then handles only `z`/`y`; copy/paste returns early without one and then handles only
 * `c`/`v`. No key reaches two of them, so composition order is irrelevant.
 *
 * **The one document fallback, for focus that is above the workspace** (ADR-0218 D2, which replaces
 * the undo hook's body-only fallback of undo-redo M5). A React handler hears only keys whose focused
 * element is inside the root's React tree. A press on a non-focusable part of the diagram, the foot
 * row or the Gantt moves focus to the nearest focusable ANCESTOR, which is the shell's
 * `<main tabIndex={-1}>` — it contains the root, so no key pressed there ever reaches the handler.
 * One `keydown` listener on the document therefore acts when `document.activeElement` is nothing,
 * `<body>`, or an element that CONTAINS the root.
 *
 * **That rule is disjoint from the React handler's, which is why the two cannot both fire for one
 * keystroke:** an element cannot both contain the root and sit inside it (the root itself is not
 * focusable, and is excluded anyway). Focus on a control in the portalled chrome band is in the
 * React tree but not an ancestor, so the React handler has it and the fallback stands down. The
 * fallback runs the SAME composed handler, so the guards (`modalOpen`, text-entry targets, the pen)
 * are the same in both places, and it additionally stands down while any dialog, menu or the create popover is open.
 */
export function usePlanWorkspaceKeyScope(params: {
  /** The workspace root the handler is bound to; the fallback asks whether focus is above it. */
  rootRef: React.RefObject<HTMLElement | null>;
  /** A modal is open — every binding goes inert rather than acting beneath it. */
  modalOpen: boolean;
  /** Open the shortcuts sheet (`?`). */
  onShowShortcuts: () => void;
  /** Undo/redo are live only when the flag is on AND the user can author. */
  undoRedoEnabled: boolean;
  undo: () => void;
  redo: () => void;
  /** An undo/redo accelerator fired while it is off; true when there was a step to refuse. */
  onUndoRedoBlocked?: (direction: 'undo' | 'redo') => boolean;
  /** Copy/paste are live only when the copy flag is on AND the planner can create activities. */
  clipboardEnabled: boolean;
  onCopy: () => void;
  onPaste: () => void;
}): React.KeyboardEventHandler<HTMLElement> {
  const {
    rootRef,
    modalOpen,
    onShowShortcuts,
    undoRedoEnabled,
    undo,
    redo,
    onUndoRedoBlocked,
    clipboardEnabled,
    onCopy,
    onPaste,
  } = params;

  const onUndoRedoKeyDown = useUndoRedoKeybindings({
    enabled: undoRedoEnabled,
    modalOpen,
    undo,
    redo,
    ...(onUndoRedoBlocked ? { onBlocked: onUndoRedoBlocked } : {}),
  });

  const onClipboardKeyDown = useClipboardKeybindings({
    enabled: clipboardEnabled,
    modalOpen,
    onCopy,
    onPaste,
  });

  const onShortcutsKeyDown = useCallback(
    (event: KeyLike): void => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (modalOpen) return;
      event.preventDefault();
      onShowShortcuts();
    },
    [modalOpen, onShowShortcuts],
  );

  const handle = useCallback(
    (event: KeyLike): void => {
      onShortcutsKeyDown(event);
      onUndoRedoKeyDown(event);
      onClipboardKeyDown(event);
    },
    [onShortcutsKeyDown, onUndoRedoKeyDown, onClipboardKeyDown],
  );

  // The latest composed handler, read by the one document listener so it is installed once rather
  // than re-bound whenever a binding changes identity.
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);

  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (!focusIsAboveWorkspace(rootRef.current)) return;
      // An open dialog, menu or popover owns the keyboard, and a flag the host forgot to fold into
      // `modalOpen` must still not let a key mutate the plan from beneath it. A press on a
      // non-focusable part of one (a label, padding) leaves focus on `<main>`, which is exactly where
      // this fallback listens. The create popover is a plain `<form>`, so it carries the marker.
      if (document.querySelector(OPEN_OVERLAY_SELECTOR) !== null) return;
      handleRef.current(event);
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  }, [rootRef]);

  return handle;
}

/**
 * Anything that, while open, means a key is not for the plan beneath it. A `<dialog>` element counts
 * only when `[open]`: the workspace keeps its closed confirmations in the document with a dialog role,
 * so a bare `[role="alertdialog"]` would match them all, always, and silence the fallback for good.
 */
const OPEN_OVERLAY_SELECTOR =
  'dialog[open], [role="dialog"]:not(dialog), [role="alertdialog"]:not(dialog), [role="menu"], [data-key-scope-block]';

/**
 * True when no element holds focus, `<body>` does, or the focused element contains the workspace root
 * (the shell's `<main>`, which is where a press on a non-focusable surface leaves focus). `activeElement`
 * is null in a document with nothing focusable yet, which is body focus too.
 */
function focusIsAboveWorkspace(root: HTMLElement | null): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body) return true;
  return root !== null && active !== root && active.contains(root);
}

/** The slice of a keyboard event the bindings read — a React synthetic event and a native one both fit. */
type KeyLike = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'target' | 'preventDefault'
>;
