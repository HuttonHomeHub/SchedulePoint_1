import type { SwimlaneSummary } from '@repo/types';
import { useState } from 'react';

import { deleteConsequence } from '../model/swimlane-order';
import type { SwimlaneActions } from '../model/use-swimlane-actions';

import { useAnnounce } from '@/components/ui/announcer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export interface SwimlaneDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  swimlane: SwimlaneSummary | null;
  /** How many activities are in it now: the sentence names the number. */
  memberCount: number;
  actions: SwimlaneActions;
}

/**
 * The delete confirmation (feature-spec US-2): "12 activities will show under No swimlane. Undo
 * brings them back." Both halves are true — a soft delete keeps every member's swimlane, and the
 * restore Undo performs returns the swimlane with their remembered lanes.
 *
 * Working state lives for one opening: the error is cleared whenever it closes (ADR-0169).
 */
export function SwimlaneDeleteDialog({
  open,
  onClose,
  swimlane,
  memberCount,
  actions,
}: SwimlaneDeleteDialogProps): React.ReactElement {
  const announce = useAnnounce();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setError(null);
    onClose();
  };

  return (
    <ConfirmDialog
      open={open && swimlane !== null}
      onClose={close}
      title={`Delete swimlane “${swimlane?.name ?? ''}”?`}
      description={deleteConsequence(memberCount)}
      confirmLabel="Delete swimlane"
      pendingLabel="Deleting…"
      pending={pending}
      error={error}
      onConfirm={() => {
        if (!swimlane) return;
        setPending(true);
        void actions
          .remove(swimlane)
          .then(
            () => {
              announce(`Swimlane ${swimlane.name} deleted. Undo brings it back.`);
              close();
            },
            (cause: unknown) =>
              setError(cause instanceof Error ? cause.message : 'Something went wrong.'),
          )
          .finally(() => setPending(false));
      }}
    />
  );
}
