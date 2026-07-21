import { useEffect, useId, useRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * An off-canvas **side sheet** (drawer) built on the native `<dialog>` element —
 * focus trapping, Escape-to-close, and an inert backdrop for free, matching
 * {@link Dialog}. Full height; anchored to the inline-start edge by default (`side="left"`,
 * the navigator rail below `lg`) or to the inline-end edge with `side="right"` (the plan-notes
 * drawer). Controlled via `open`/`onClose`. The sheet is given an accessible name from `title`
 * (visually hidden — the content supplies its own visible header).
 */
export function Sheet({
  open,
  onClose,
  title,
  side = 'left',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Which edge the sheet anchors to — `'left'` (default, inline-start) or `'right'` (inline-end). */
  side?: 'left' | 'right';
  children: React.ReactNode;
}): React.ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      // `!m-0` beats the UA `margin:auto` that would otherwise centre a modal dialog;
      // `fixed inset-y-0` + the side edge anchors it full-height to the inline-start (default)
      // or inline-end edge.
      className={cn(
        'text-card-foreground fixed inset-y-0 !m-0 h-dvh max-h-dvh w-[min(20rem,85vw)] max-w-none border-0 bg-transparent p-0',
        side === 'right' ? 'right-0' : 'left-0',
        'backdrop:bg-black/50',
      )}
    >
      <h2 id={titleId} className="sr-only">
        {title}
      </h2>
      {open ? <div className="h-full">{children}</div> : null}
    </dialog>
  );
}
