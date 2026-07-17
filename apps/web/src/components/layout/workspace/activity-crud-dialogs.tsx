import { useState } from 'react';
import { flushSync } from 'react-dom';

import type { PlanWorkspaceModel } from './use-plan-workspace-model';

import { useAnnounce } from '@/components/ui/announcer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ActivityFormDialog, useDeleteActivity } from '@/features/activities';

/**
 * The activity **edit / delete** dialogs opened from the floating {@link SelectionActionsBar} on the
 * TSLD canvas (ADR-0031). The canvas can't own these — the tsld feature imports no other feature
 * (ADR-0026 D8) — so the workspace hosts them here, driven by the shared model's `editActivityId` /
 * `deleteActivityId` (which the bar's callbacks set). The edit target is re-derived from the live
 * query so a 409 retry carries the current version, mirroring {@link ActivitiesTable}'s own dialogs;
 * both use the same shared `ActivityFormDialog` / `ConfirmDialog`, so their behaviour can't drift.
 */
export function ActivityCrudDialogs({ model }: { model: PlanWorkspaceModel }): React.ReactElement {
  const { orgSlug, planId } = model;
  const deleteActivity = useDeleteActivity(orgSlug, planId);
  const announce = useAnnounce();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editing = model.editActivityId
    ? model.activities.data?.find((a) => a.id === model.editActivityId)
    : undefined;
  const deleting = model.deleteActivityId
    ? model.activities.data?.find((a) => a.id === model.deleteActivityId)
    : undefined;

  const closeDelete = (): void => {
    model.setDeleteActivityId(null);
    setDeleteError(null);
  };

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    deleteActivity.mutate(deleting.id, {
      onSuccess: () => {
        // Close synchronously before the announcement so focus/AT state settles in one paint (as
        // ActivitiesTable does); the canvas then reconciles the selection to the nearest survivor.
        flushSync(() => {
          model.setDeleteActivityId(null);
          setDeleteError(null);
        });
        announce(`Activity “${name}” deleted.`);
      },
      onError: (err) => setDeleteError(err.message),
    });
  };

  return (
    <>
      <ActivityFormDialog
        orgSlug={orgSlug}
        planId={planId}
        open={editing !== undefined}
        onClose={() => model.setEditActivityId(null)}
        calendars={model.calendars.data ?? []}
        calendarsLoading={model.calendars.isPending}
        calendarsError={model.calendars.isError}
        parentSummaries={model.activities.data ?? []}
        parentSummariesLoading={model.activities.isPending}
        {...(editing ? { activity: editing } : {})}
      />
      <ConfirmDialog
        open={deleting !== undefined}
        onClose={closeDelete}
        onConfirm={confirmDelete}
        title="Delete activity"
        description={deleting ? `Delete “${deleting.name}”? You can restore it later.` : ''}
        pending={deleteActivity.isPending}
        pendingLabel="Deleting…"
        error={deleteError}
      />
    </>
  );
}
