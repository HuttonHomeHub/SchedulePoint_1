import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { useNativeDialogClose } from '@/components/ui/native-dialog-close';
import { cn } from '@/lib/utils';

/**
 * An off-canvas **modal side sheet** (drawer) built on the native `<dialog>` element — focus trapping,
 * Escape-to-close, and an inert backdrop for free (via `showModal`), matching {@link Dialog}. Full
 * height; anchored to the inline-start edge by default (`side="left"`, the navigator rail below `lg`) or
 * to the inline-end edge with `side="right"`. Controlled via `open`/`onClose`. The sheet is given an
 * accessible name from `title` (visually hidden — the content supplies its own visible header, e.g.
 * {@link SheetHeader}).
 */
export function Sheet({
  open,
  onClose,
  title,
  side = 'left',
  confirmBeforeClose = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Which edge the sheet anchors to — `'left'` (default, inline-start) or `'right'` (inline-end). */
  side?: 'left' | 'right';
  /**
   * As on {@link Dialog}: the host may refuse a close, so Escape/backdrop ask rather than act.
   * **Latent by design** — no consumer sets it today (2026-08-28, verified by grep), and it exists
   * for the reason the nesting guard below was fixed while latent: `Sheet` is a general-purpose
   * drawer, and the next feature to host an editor in one needs the clause to already be a property
   * of the primitive rather than a convention (TECH_DEBT #197 item 1 — the two `closeIfSelf`
   * copies had already diverged by exactly this prop).
   */
  confirmBeforeClose?: boolean;
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

  /**
   * The close/cancel guard is the shared leaf — see `native-dialog-close.ts` (TECH_DEBT #50/#197).
   *
   * The nesting it guards against is latent here: no consumer nests a `<dialog>` inside a `Sheet`
   * today — the Project Explorer drawer renders its dialogs as siblings of `{children}`. It is
   * guarded anyway because that avoidance is a convention, not a property of the primitive, and
   * `Sheet` is a general-purpose drawer: the next feature to put a confirmation inside one would
   * reintroduce exactly the bug that was removed from `Dialog`.
   */
  const closeHandlers = useNativeDialogClose({ ref, onClose, confirmBeforeClose });

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={closeHandlers.onClose}
      onCancel={closeHandlers.onCancel}
      // `!m-0` beats the UA `margin:auto` that would otherwise centre a modal dialog; `fixed inset-y-0`
      // + the side edge anchors it full-height to the inline-start (default) or inline-end edge.
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

/**
 * The shared header chrome for a {@link Sheet}'s content — a title with an optional right-aligned Close
 * button (and optional extra `actions` before it), so the navigator rail and the plan-notes drawer stop
 * hand-rolling the same bar. The title is a plain `<span>` (not a heading): the `Sheet` already supplies
 * the dialog's accessible name, and the content below may carry its own heading. Class overrides let a
 * caller keep its exact look (border colour, height, button size) — no visual change, just dedupe.
 */
export function SheetHeader({
  title,
  onClose,
  closeLabel,
  closeButtonSize = 'icon-sm',
  actions,
  className,
  titleClassName,
  actionsClassName,
}: {
  title: string;
  /** When set, renders the trailing Close button (ghost `X`). */
  onClose?: () => void;
  /** Accessible name for the Close button. Defaults to `Close <title>`. */
  closeLabel?: string;
  /** Close-button size — `icon-sm` (default) or `icon` (the navigator rail). */
  closeButtonSize?: 'icon' | 'icon-sm';
  /** Extra controls rendered before the Close button (e.g. the rail's New-client / Collapse). */
  actions?: React.ReactNode;
  className?: string;
  titleClassName?: string;
  actionsClassName?: string;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'border-border flex items-center justify-between gap-2 border-b px-4 py-2',
        className,
      )}
    >
      <span className={cn('text-sm font-medium', titleClassName)}>{title}</span>
      {actions || onClose ? (
        <div className={cn('flex items-center gap-2', actionsClassName)}>
          {actions}
          {onClose ? (
            <Button
              variant="ghost"
              size={closeButtonSize}
              aria-label={closeLabel ?? `Close ${title}`}
              onClick={onClose}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
