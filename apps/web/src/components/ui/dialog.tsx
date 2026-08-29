import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { useNativeDialogClose } from '@/components/ui/native-dialog-close';
import { cn } from '@/lib/utils';

/**
 * Accessible modal dialog built on the native `<dialog>` element, which gives
 * focus trapping, Escape-to-close, and an inert backdrop for free. Controlled
 * via `open`/`onClose`. The title and (optional) description are associated via
 * `aria-labelledby`/`aria-describedby` with per-instance ids so two dialogs can
 * safely mount on the same screen. `role` may be raised to `alertdialog` for
 * destructive confirmations.
 */
/**
 * Max-width presets: `md` (default, form dialogs), `lg` for content-dense dialogs such as tables,
 * or `xl` for a **two-pane** dialog — a section rail beside a content pane (ADR-0061 §3). `xl` is
 * not "a bit wider"; it is the width at which a rail plus a two-column pane both fit, and it exists
 * for that layout alone. Widening a single-column form to `xl` produces 900px-long input rows,
 * which is worse than the 448px it came from.
 */
const SIZE_CLASSES = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  role,
  size = 'md',
  body = 'padded',
  confirmBeforeClose = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  role?: 'dialog' | 'alertdialog';
  size?: keyof typeof SIZE_CLASSES;
  /**
   * `'padded'` (default) wraps the children in the standard `p-6` column — every existing consumer,
   * unchanged. `'flush'` pads only the header and hands the children the full width, for a layout
   * that must reach the dialog's edges: a section rail, a full-bleed context strip, a save bar
   * pinned to the bottom. It also caps the dialog's height and makes it a flex column, so the
   * **pane** scrolls rather than the whole dialog — a rail that scrolls out of view with its
   * content is not a rail.
   */
  body?: 'padded' | 'flush';
  /**
   * The host may *refuse* a close — e.g. to confirm discarding unsaved work — so Escape and the
   * backdrop must ask rather than act.
   *
   * Without this, `cancel` closes the `<dialog>` natively before `onClose` has any say: the host
   * opens its confirmation into a dialog the browser has already torn down, and the user sees the
   * editor vanish with their work. Opt-in, so every other consumer keeps today's behaviour exactly.
   */
  confirmBeforeClose?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The close/cancel guard is the shared leaf — see `native-dialog-close.ts` for why only the
  // dialog's own close counts (TECH_DEBT #50) and why the guard lives once (TECH_DEBT #197).
  const closeHandlers = useNativeDialogClose({ ref, onClose, confirmBeforeClose });

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...(role ? { role } : {})}
      onClose={closeHandlers.onClose}
      onCancel={closeHandlers.onCancel}
      className={cn(
        'border-border bg-card text-card-foreground m-auto w-[calc(100vw-2rem)] rounded-lg border p-0 shadow-lg',
        SIZE_CLASSES[size],
        'backdrop:bg-black/50',
        // Only `flush` takes over the height: `open:flex` is what lets the pane inside own the
        // scroll. Applying it unconditionally would change every existing dialog's overflow
        // behaviour for no benefit.
        body === 'flush' && 'max-h-[calc(100vh-4rem)] overflow-hidden open:flex open:flex-col',
      )}
    >
      {open ? (
        <div className={cn('flex flex-col', body === 'flush' ? 'min-h-0 flex-1' : 'gap-4 p-6')}>
          <div
            className={cn(
              'flex shrink-0 items-start justify-between gap-4',
              body === 'flush' && 'px-6 pt-6 pb-4',
            )}
          >
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="text-muted-foreground text-sm">
                  {description}
                </p>
              ) : null}
            </div>
            {/* **`size="icon"` and a Lucide `X`, matching `Sheet`'s close** (ADR-0118 M3).
                It was `size="sm"` around a raw `✕` glyph, which made it **36 × 44** under a
                coarse pointer — the height came from the token axis and the width came from
                `px-3` plus one character, so it cleared the house rule on one axis only. Found by
                the F3b measurement, which is the M0 falsification condition that had gone
                unanswered because its first probe never opened a dialog.

                Two primitives rendering the same affordance two ways is the shape this register
                has recorded in six consecutive epics; `sheet.tsx` already used the icon button
                and the icon. This is not a new decision, it is the existing one applied to its
                neighbour. */}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
