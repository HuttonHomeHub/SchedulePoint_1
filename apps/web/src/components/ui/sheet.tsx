import { useEffect, useId, useRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * An off-canvas **side sheet** (drawer) built on the native `<dialog>` element —
 * focus trapping, Escape-to-close, and an inert backdrop for free, matching
 * {@link Dialog}. Anchored to the inline-start edge and full height; used for the
 * navigator rail below `lg`. Controlled via `open`/`onClose`. The sheet is given an
 * accessible name from `title` (visually hidden — the content supplies its own
 * visible header).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
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
      // `fixed inset-y-0 left-0` anchors it full-height to the inline-start edge.
      className={cn(
        'text-card-foreground fixed inset-y-0 left-0 !m-0 h-dvh max-h-dvh w-[min(20rem,85vw)] max-w-none border-0 bg-transparent p-0',
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
