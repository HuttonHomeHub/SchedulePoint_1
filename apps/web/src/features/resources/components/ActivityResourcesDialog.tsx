import type { DurationType } from '@repo/types';
import { useRef } from 'react';

import { ActivityResourcesPanel } from './ActivityResourcesPanel';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

/**
 * The per-activity resource assignment **dialog** (ADR-0039), opened from the activities row menu —
 * a thin `Dialog` around {@link ActivityResourcesPanel}, which owns the assigned rows and the assign
 * form. The split exists so the same surface can be mounted inside the activity editor's Resources
 * tab without a second implementation.
 *
 * `activityId` is optional so the `<dialog>` element stays mounted (toggled by `open`), preserving
 * native focus-restore. `Dialog` renders its children only while open, so the panel — and its
 * queries — come and go with it.
 */
export function ActivityResourcesDialog({
  orgSlug,
  planId,
  activityId,
  activityName,
  activityDurationType,
  activityHoursPerDay,
  isMilestone = false,
  open,
  onClose,
  canWrite,
}: {
  orgSlug: string;
  /** See {@link ActivityResourcesPanel} — forwarded unchanged. */
  planId?: string;
  /** Optional so the dialog can stay mounted (toggled by `open`), preserving focus restore. */
  activityId?: string;
  activityName?: string;
  /** See {@link ActivityResourcesPanel} — forwarded unchanged. */
  activityDurationType?: DurationType;
  /** See {@link ActivityResourcesPanel} — forwarded unchanged (the join lag's day factor). */
  activityHoursPerDay?: number;
  /** See {@link ActivityResourcesPanel} — forwarded unchanged. */
  isMilestone?: boolean;
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
}): React.ReactElement {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Resources"
      {...(activityName ? { description: `Assign resources to “${activityName}”.` } : {})}
    >
      <div className="flex flex-col gap-5">
        <ActivityResourcesPanel
          orgSlug={orgSlug}
          canWrite={canWrite}
          enabled={open}
          isMilestone={isMilestone}
          {...(activityHoursPerDay === undefined ? {} : { activityHoursPerDay })}
          // Keep the dialog's focus-restore target: after an unassign the removed row unmounts, and
          // Close is the stable control the dialog has always handed focus back to.
          onRowRemoved={() => closeButtonRef.current?.focus()}
          {...(planId ? { planId } : {})}
          {...(activityId ? { activityId } : {})}
          {...(activityDurationType ? { activityDurationType } : {})}
        />
        <div className="border-border flex justify-end border-t pt-4">
          <Button ref={closeButtonRef} type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
