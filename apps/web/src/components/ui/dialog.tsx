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
/** Max-width presets: `md` (default, form dialogs) or `lg` for content-dense
 * dialogs such as tables. */
const SIZE_CLASSES = { md: 'max-w-md', lg: 'max-w-2xl' } as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  role,
  size = 'md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  role?: 'dialog' | 'alertdialog';
  size?: keyof typeof SIZE_CLASSES;
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

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...(role ? { role } : {})}
      onClose={onClose}
      onCancel={onClose}
      className={cn(
        'border-border bg-card text-card-foreground m-auto w-[calc(100vw-2rem)] rounded-lg border p-0 shadow-lg',
        SIZE_CLASSES[size],
        'backdrop:bg-black/50',
      )}
    >
      {open ? (
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
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
