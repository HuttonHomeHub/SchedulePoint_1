import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
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

  /**
   * Only this dialog's own close counts as this dialog closing.
   *
   * `close` and `cancel` do not bubble, but React listens at the root in the
   * CAPTURE phase — and capture reaches every ancestor on the way DOWN,
   * bubbling or not. So a nested `<dialog>` closing (a `ConfirmDialog` inside a
   * `Dialog`, e.g. revoking a share link or deleting a baseline) used to fire
   * the OUTER dialog's `onClose` too, tearing down the whole parent behind the
   * confirmation the user just answered (TECH_DEBT #50). Comparing the target
   * fixes every nesting inside a `Dialog` at once, rather than the two that had
   * been noticed. `Sheet` is a separate primitive and carries its own copy of
   * this guard.
   */
  const closeIfSelf = (event: React.SyntheticEvent<HTMLDialogElement>): void => {
    if (event.target !== ref.current) return;
    // `cancel` is Escape (and the backdrop). Cancelling it keeps the dialog on screen so the host's
    // `onClose` can decide — the browser's default is to close first and ask never.
    if (confirmBeforeClose && event.type === 'cancel') event.preventDefault();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...(role ? { role } : {})}
      onClose={closeIfSelf}
      onCancel={closeIfSelf}
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
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
              ✕
            </Button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
