import { useState } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export interface CodeDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  /** "Delete L1?" / "Delete Area and its 4 values?" — null while the dialog is closed. */
  title: string | null;
  /** What happens to the activities that carry it, counted from the activity list in memory. */
  description: string;
  confirmLabel: 'Delete value' | 'Delete code type';
  /** Performs the delete; a rejection is shown in the dialog. Resolves the sentence to announce. */
  onConfirm: () => Promise<string>;
  /** Completes "Could not …" for a refusal: "delete L1". */
  failureAction: string;
  describeFailure: (action: string, cause: unknown) => string;
  /** Told once the delete has landed and before the dialog closes, so the host can pick where focus goes. */
  onDeleted?: () => void;
}

/**
 * The delete confirmation for a code type or a value. Both sentences are true of the server: a
 * deleted value or type is absent from every carrier's `codes`, and a restore (here, or Undo) brings
 * every carrier back, because nothing is written to the activities.
 *
 * Working state lives for one opening: the error is cleared whenever it closes (ADR-0169).
 */
export function CodeDeleteDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  failureAction,
  describeFailure,
  onDeleted,
}: CodeDeleteDialogProps): React.ReactElement {
  const announce = useAnnounce();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setError(null);
    onClose();
  };

  return (
    <ConfirmDialog
      open={open && title !== null}
      onClose={close}
      title={title ?? ''}
      description={description}
      confirmLabel={confirmLabel}
      pendingLabel="Deleting…"
      pending={pending}
      error={error}
      onConfirm={() => {
        setPending(true);
        void onConfirm()
          .then(
            (sentence) => {
              onDeleted?.();
              announce(sentence);
              close();
            },
            (cause: unknown) => setError(describeFailure(failureAction, cause)),
          )
          .finally(() => setPending(false));
      }}
    />
  );
}
