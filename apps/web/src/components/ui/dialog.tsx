import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Accessible modal dialog built on the native `<dialog>` element, which gives
 * focus trapping, Escape-to-close, and an inert backdrop for free. Controlled
 * via `open`/`onClose`.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = 'dialog-title';

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
      className={cn(
        'border-border bg-card text-card-foreground m-auto w-[calc(100vw-2rem)] max-w-md rounded-lg border p-0 shadow-lg',
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
              {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
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
