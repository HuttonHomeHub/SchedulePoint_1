import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

/**
 * A reusable confirm-then-act dialog. Built on {@link Dialog}, so it inherits focus trapping and
 * Escape-to-close. The action button defaults to `destructive` (delete/remove); pass
 * `confirmVariant="default"` for a significant-but-non-destructive confirm (e.g. a bulk reorder).
 * An optional error is announced via `role="alert"`.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  pendingLabel = 'Deleting…',
  confirmVariant = 'destructive',
  pending = false,
  error = null,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  confirmVariant?: 'destructive' | 'default';
  pending?: boolean;
  error?: string | null;
}): React.ReactElement {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      role="alertdialog"
      {...(description ? { description } : {})}
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="text-destructive-text text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            // Use `aria-disabled` (not the native `disabled`) so the button keeps focus
            // while the mutation is in flight — a natively-disabled button is blurred to
            // <body> the instant `pending` flips, losing the user's place (SC 2.4.3). The
            // handler is guarded so a busy button can't re-fire.
            aria-disabled={pending}
            aria-busy={pending}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onClick={() => {
              if (!pending) onConfirm();
            }}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
