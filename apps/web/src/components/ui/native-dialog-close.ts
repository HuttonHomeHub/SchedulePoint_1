import type * as React from 'react';

/**
 * The one close guard for primitives built on the native `<dialog>` element.
 *
 * Only the dialog's own close counts as that dialog closing.
 *
 * `close` and `cancel` do not bubble, but React listens at the root in the
 * CAPTURE phase — and capture reaches every ancestor on the way DOWN,
 * bubbling or not. So a nested `<dialog>` closing (a `ConfirmDialog` inside a
 * `Dialog`, e.g. revoking a share link or deleting a baseline) used to fire
 * the OUTER dialog's `onClose` too, tearing down the whole parent behind the
 * confirmation the user just answered (TECH_DEBT #50). Comparing the target
 * fixes every nesting inside a `Dialog` at once, rather than the two that had
 * been noticed.
 *
 * Extracted from `dialog.tsx` (2026-08-28, TECH_DEBT #197 item 1): `Sheet` carried its own copy of
 * this guard, and the copies had already diverged — `Dialog` grew `confirmBeforeClose` and `Sheet`
 * never did, so a drawer hosting an editor could not refuse its own close. One leaf makes the next
 * clause land on both primitives by construction.
 */
export function useNativeDialogClose({
  ref,
  onClose,
  confirmBeforeClose = false,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  /**
   * The host may *refuse* a close — e.g. to confirm discarding unsaved work — so Escape and the
   * backdrop must ask rather than act.
   *
   * Without this, `cancel` closes the `<dialog>` natively before `onClose` has any say: the host
   * opens its confirmation into a dialog the browser has already torn down, and the user sees the
   * editor vanish with their work. Opt-in, so every other consumer keeps today's behaviour exactly.
   */
  confirmBeforeClose?: boolean;
}): {
  onClose: React.ReactEventHandler<HTMLDialogElement>;
  onCancel: React.ReactEventHandler<HTMLDialogElement>;
} {
  const closeIfSelf = (event: React.SyntheticEvent<HTMLDialogElement>): void => {
    if (event.target !== ref.current) return;
    // `cancel` is Escape (and the backdrop). Cancelling it keeps the dialog on screen so the host's
    // `onClose` can decide — the browser's default is to close first and ask never.
    if (confirmBeforeClose && event.type === 'cancel') event.preventDefault();
    onClose();
  };
  return { onClose: closeIfSelf, onCancel: closeIfSelf };
}
