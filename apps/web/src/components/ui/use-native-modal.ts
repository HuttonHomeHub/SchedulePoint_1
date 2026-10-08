import { useEffect, useLayoutEffect } from 'react';
import type * as React from 'react';

/**
 * The one open→`showModal()` / closed→`close()` effect for primitives built on the native
 * `<dialog>`, extracted from `Dialog` and `Sheet`, which carried identical copies (ADR-0179 added a
 * third consumer, the viewport notice, and a third copy was the point at which to extract).
 *
 * The dialog stays mounted and is driven from `open`; unmounting a modal that is open drops focus
 * to `<body>`, which is why callers never gate the element itself.
 *
 * `layout: true` runs the same effect before paint. The viewport notice needs it so that a reader
 * who loads the app in a narrow window never sees one frame of the shell before the page covers
 * it. `Dialog` and `Sheet` keep the passive effect they always had.
 */
export function useNativeModal({
  ref,
  open,
  layout = false,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  open: boolean;
  layout?: boolean;
}): void {
  // Both hooks are always called (the rules of hooks); `layout` is a constant per call site, so
  // exactly one of them does any work.
  useEffect(() => {
    if (!layout) syncModal(ref.current, open);
  }, [ref, open, layout]);
  useLayoutEffect(() => {
    if (layout) syncModal(ref.current, open);
  }, [ref, open, layout]);
}

function syncModal(dialog: HTMLDialogElement | null, open: boolean): void {
  if (!dialog) return;
  if (open && !dialog.open) dialog.showModal();
  if (!open && dialog.open) dialog.close();
}
