import { useCallback } from 'react';

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
 */
export function usePlanWorkspaceKeyScope(params: {
  /** A modal is open — every binding goes inert rather than acting beneath it. */
  modalOpen: boolean;
  /** Open the shortcuts sheet (`?`). */
  onShowShortcuts: () => void;
  /** Undo/redo are live only when the flag is on AND the user can author. */
  undoRedoEnabled: boolean;
  undo: () => void;
  redo: () => void;
  /** Copy/paste are live only when the copy flag is on AND the planner can create activities. */
  clipboardEnabled: boolean;
  onCopy: () => void;
  onPaste: () => void;
}): React.KeyboardEventHandler<HTMLElement> {
  const {
    modalOpen,
    onShowShortcuts,
    undoRedoEnabled,
    undo,
    redo,
    clipboardEnabled,
    onCopy,
    onPaste,
  } = params;

  const onUndoRedoKeyDown = useUndoRedoKeybindings({
    enabled: undoRedoEnabled,
    modalOpen,
    undo,
    redo,
  });

  const onClipboardKeyDown = useClipboardKeybindings({
    enabled: clipboardEnabled,
    modalOpen,
    onCopy,
    onPaste,
  });

  const onShortcutsKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (modalOpen) return;
      event.preventDefault();
      onShowShortcuts();
    },
    [modalOpen, onShowShortcuts],
  );

  return useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      onShortcutsKeyDown(event);
      onUndoRedoKeyDown(event);
      onClipboardKeyDown(event);
    },
    [onShortcutsKeyDown, onUndoRedoKeyDown, onClipboardKeyDown],
  );
}
