import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * An off-canvas **side sheet** (drawer) built on the native `<dialog>` element. Full height; anchored
 * to the inline-start edge by default (`side="left"`, the navigator rail below `lg`) or to the
 * inline-end edge with `side="right"` (the plan-notes drawer, given a slightly wider cap). Controlled
 * via `open`/`onClose`. The sheet is given an accessible name from `title` (visually hidden — the
 * content supplies its own visible header, e.g. {@link SheetHeader}).
 *
 * `modal` (default `true`) uses `dialog.showModal()`: an inert backdrop, focus trap, Escape-to-close
 * and focus restoration all come for free — the navigator-rail drawer. `modal={false}` uses
 * `dialog.show()` so the page **behind** the sheet stays interactive (the plan-notes drawer beside a
 * live canvas): a non-modal `<dialog>` does none of that focus/Escape work, so this component does it
 * itself — move focus into the drawer on open, close on Escape, and restore focus to the opener on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  side = 'left',
  modal = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Which edge the sheet anchors to — `'left'` (default, inline-start) or `'right'` (inline-end). */
  side?: 'left' | 'right';
  /** Modal (default, `showModal` — backdrop + native focus trap/Escape) vs non-modal (`show` — the page
   * behind stays live; this component supplies focus move/restore + Escape itself). */
  modal?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Non-modal only: the element focus was on when the sheet opened, so we can restore it on close (a
  // modal <dialog> restores this itself; a non-modal one does not).
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (modal) {
        dialog.showModal();
      } else {
        // Non-modal: remember the opener, open without the inert backdrop, then move focus into the
        // drawer (its first focusable — the Close button) since a non-modal <dialog> won't.
        openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
        dialog.show();
        dialog
          .querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          )
          ?.focus();
      }
    }
    if (!open && dialog.open) {
      dialog.close();
      if (!modal) {
        openerRef.current?.focus();
        openerRef.current = null;
      }
    }
  }, [open, modal]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      // A non-modal <dialog> does NOT emit `cancel` on Escape, so wire it here; the modal path leaves
      // Escape to the native `cancel` → `onClose` above.
      onKeyDown={
        modal
          ? undefined
          : (event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
              }
            }
      }
      // `!m-0` beats the UA `margin:auto` that would otherwise centre a modal dialog; `fixed inset-y-0`
      // + the side edge anchors it full-height to the inline-start (default) or inline-end edge. The
      // right sheet gets a slightly wider cap for multi-paragraph content (notes + composer).
      className={cn(
        'text-card-foreground fixed inset-y-0 !m-0 h-dvh max-h-dvh max-w-none border-0 bg-transparent p-0',
        side === 'right' ? 'right-0 w-[min(24rem,90vw)]' : 'left-0 w-[min(20rem,85vw)]',
        // The inert backdrop only paints for a modal dialog; drop the class in the non-modal case.
        modal ? 'backdrop:bg-black/50' : null,
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
