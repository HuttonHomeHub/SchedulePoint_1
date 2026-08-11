import { useState } from 'react';
import { flushSync } from 'react-dom';

import type { PlanWorkspaceModel } from './use-plan-workspace-model';

import { useAnnounce } from '@/components/ui/announcer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED,
  ACTIVITY_EDITOR_TABS_ENABLED,
  CANVAS_DIRECT_MANIPULATION_ENABLED,
  NOTES_ENABLED,
  PROGRAMME_SCHEDULING_ENABLED,
} from '@/config/env';
import {
  ActivityEditorDialog,
  ActivityFormDialog,
  deleteActivityDescription,
  dissolveSummaryDescription,
  useDeleteActivity,
  useDissolveSummary,
} from '@/features/activities';
import { CrossPlanLinksSection } from '@/features/cross-plan-dependencies';
import { ActivityNotesSection } from '@/features/notes';

/**
 * The activity **edit / delete** dialogs opened from the floating {@link SelectionActionsBar} on the
 * TSLD canvas (ADR-0031). The canvas can't own these — the tsld feature imports no other feature
 * (ADR-0026 D8) — so the workspace hosts them here, driven by the shared model's `editActivityId` /
 * `deleteActivityId` (which the bar's callbacks set). The edit target is re-derived from the live
 * query so a 409 retry carries the current version, mirroring {@link ActivitiesTable}'s own dialogs;
 * both use the same shared `ActivityFormDialog` / `ConfirmDialog`, so their behaviour can't drift.
 *
 * Behind `VITE_ACTIVITY_EDITOR_TABS` this becomes the workspace's **one** activity editor
 * (ADR-0060 §7, M5): the canvas's Edit, its Report-progress and its Steps actions — plus the
 * toolbar's Update-progress — all resolve to the same `editorIntent`, so `plan-dialogs.tsx` stops
 * mounting the separate progress and steps dialogs entirely. Flag-off, every line below is what it
 * was.
 */
export function ActivityCrudDialogs({ model }: { model: PlanWorkspaceModel }): React.ReactElement {
  const { orgSlug, planId } = model;
  const deleteActivity = useDeleteActivity(orgSlug, planId);
  const dissolveSummary = useDissolveSummary(orgSlug, planId);
  const announce = useAnnounce();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [dissolveError, setDissolveError] = useState<string | null>(null);
  const [bandCopyError, setBandCopyError] = useState<string | null>(null);
  const [bandCopyPending, setBandCopyPending] = useState(false);

  const editing = model.editActivityId
    ? model.activities.data?.find((a) => a.id === model.editActivityId)
    : undefined;
  // Same rule as `editing`: the intent holds an id, the row comes from the live query, so a save
  // that bumps `version` feeds the next one and the editor closes when its target is deleted.
  const intended = model.editorIntent
    ? model.activities.data?.find((a) => a.id === model.editorIntent?.activityId)
    : undefined;
  const deleting = model.deleteActivityId
    ? model.activities.data?.find((a) => a.id === model.deleteActivityId)
    : undefined;
  const dissolving = model.dissolveActivityId
    ? model.activities.data?.find((a) => a.id === model.dissolveActivityId)
    : undefined;

  const closeDelete = (): void => {
    model.setDeleteActivityId(null);
    setDeleteError(null);
  };

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    // Snapshot the pre-delete row for the undo command (ADR-0048 M2) — captured before the mutation so
    // the inverse can re-create its whole definition.
    const snapshot = deleting;
    deleteActivity.mutate(deleting.id, {
      onSuccess: () => {
        // Record the delete for undo (leaf → reversible; cascade → history truncation). Only the user
        // edit is recorded here, never the follow-up recalc. A no-op when `VITE_UNDO_REDO` is off.
        model.recordActivityDelete(snapshot);
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

  // The band-copy confirmation's copy, derived from the plan `planClone` will actually execute —
  // never from the selection — so the sentence and the write cannot disagree (M2-T2).
  const bandCopy = model.duplicateBandId
    ? model.activities.data?.find((a) => a.id === model.duplicateBandId)
    : undefined;
  const bandCopyText = bandCopy ? model.bandCopyPreview(bandCopy) : null;

  const closeBandCopy = (): void => {
    model.setDuplicateBandId(null);
    setBandCopyError(null);
  };

  const confirmBandCopy = (): void => {
    setBandCopyPending(true);
    setBandCopyError(null);
    void model
      .confirmDuplicateBand()
      .catch((err: unknown) => {
        setBandCopyError(err instanceof Error ? err.message : 'The band could not be copied.');
      })
      .finally(() => setBandCopyPending(false));
  };

  const closeDissolve = (): void => {
    model.setDissolveActivityId(null);
    setDissolveError(null);
  };

  const confirmDissolve = (): void => {
    if (!dissolving) return;
    const name = dissolving.name;
    dissolveSummary.mutate(dissolving.id, {
      onSuccess: () => {
        // Dissolve is a server-side compound with no client-composable inverse, so it truncates the
        // undo history rather than offering a broken one (ADR-0048 M2's cascade-delete rule).
        model.recordDissolveBoundary();
        flushSync(() => {
          model.setDissolveActivityId(null);
          setDissolveError(null);
        });
        // Says what SURVIVED, not just what went — the whole point of the action, and the thing a
        // planner will otherwise assume went with it.
        announce(`Summary “${name}” dissolved. Its activities were kept.`);
      },
      onError: (err) => setDissolveError(err.message),
    });
  };

  return (
    <>
      {ACTIVITY_EDITOR_TABS_ENABLED ? (
        <ActivityEditorDialog
          orgSlug={orgSlug}
          planId={planId}
          open={intended !== undefined}
          onClose={() => model.setEditorIntent(null)}
          onSaved={model.recordActivityUpdate}
          gating={model.activityEditorGating}
          calendars={model.calendars.data ?? []}
          calendarsLoading={model.calendars.isPending}
          calendarsError={model.calendars.isError}
          {...(model.plan.data?.calendarId == null
            ? {}
            : { planCalendarId: model.plan.data.calendarId })}
          planActivities={model.activities.data ?? []}
          planActivitiesLoading={model.activities.isPending}
          planActivitiesError={model.activities.isError}
          activity={intended}
          {...(model.editorIntent ? { intent: model.editorIntent } : {})}
          {...(ACTIVITY_EDITOR_CONVERGENCE_ENABLED
            ? {
                // The Logic tab's seams, which `plan-dialogs` wired into the Logic dialog before
                // this. Each is named in the plan as a thing that dies silently if it is dropped
                // in the move — the undo recording for a removed link, the keyboard lag nudge, and
                // the cross-plan section this feature must not import sideways — so each has its
                // own regression test.
                logic: {
                  onAdded: model.recordDependencyAdd,
                  onRemoved: model.recordDependencyRemove,
                  ...(CANVAS_DIRECT_MANIPULATION_ENABLED && model.canManageLogic
                    ? { onNudgeLag: model.nudgeDependencyLag }
                    : {}),
                  ...(PROGRAMME_SCHEDULING_ENABLED && intended
                    ? {
                        crossPlanSlot: (
                          <CrossPlanLinksSection
                            orgSlug={orgSlug}
                            planId={planId}
                            activity={intended}
                            canManageLogic={model.canManageLogic}
                            // `intended` is already narrowed truthy by this branch's own
                            // condition (`PROGRAMME_SCHEDULING_ENABLED && intended`), so this
                            // section is always showing its subject when it renders at all.
                            enabled
                          />
                        ),
                      }
                    : {}),
                },
                ...(NOTES_ENABLED && intended
                  ? {
                      notesSlot: (
                        <ActivityNotesSection
                          orgSlug={orgSlug}
                          planId={planId}
                          activity={intended}
                          canWrite={model.canWriteNotes}
                          // Same reasoning as the cross-plan slot above: `intended` is already
                          // narrowed truthy by this branch's own condition (`NOTES_ENABLED &&
                          // intended`).
                          enabled
                        />
                      ),
                    }
                  : {}),
              }
            : {})}
        />
      ) : (
        <ActivityFormDialog
          orgSlug={orgSlug}
          planId={planId}
          open={editing !== undefined}
          onClose={() => model.setEditActivityId(null)}
          onSaved={model.recordActivityUpdate}
          calendars={model.calendars.data ?? []}
          calendarsLoading={model.calendars.isPending}
          calendarsError={model.calendars.isError}
          {...(model.plan.data?.calendarId == null
            ? {}
            : { planCalendarId: model.plan.data.calendarId })}
          planActivities={model.activities.data ?? []}
          planActivitiesLoading={model.activities.isPending}
          planActivitiesError={model.activities.isError}
          {...(editing ? { activity: editing } : {})}
        />
      )}
      <ConfirmDialog
        open={deleting !== undefined}
        onClose={closeDelete}
        onConfirm={confirmDelete}
        title="Delete activity"
        description={
          deleting ? deleteActivityDescription(deleting, model.activities.data ?? []) : ''
        }
        pending={deleteActivity.isPending}
        pendingLabel="Deleting…"
        error={deleteError}
      />
      {/*
        Deliberately NOT `confirmVariant="destructive"`: dissolve keeps every activity. Dressing it
        in the delete red would tell the eye the opposite of what the sentence says, and the eye
        wins. The same pairing is used by the table's own Dissolve action, from the same copy
        function, so the two entry points cannot say different things.
      */}
      {/*
        Duplicate band (M2). Deliberately NOT `confirmVariant="destructive"`: a band copy creates
        work, it does not remove any — the same reasoning that keeps Dissolve out of the delete red,
        and for the same reason (the eye wins over the sentence).
      */}
      <ConfirmDialog
        open={bandCopyText !== null}
        onClose={closeBandCopy}
        onConfirm={confirmBandCopy}
        title={bandCopyText?.title ?? 'Duplicate band'}
        description={bandCopyText?.description ?? ''}
        confirmLabel="Duplicate"
        confirmVariant="default"
        pending={bandCopyPending}
        pendingLabel="Duplicating…"
        error={bandCopyError}
      />
      <ConfirmDialog
        open={dissolving !== undefined}
        onClose={closeDissolve}
        onConfirm={confirmDissolve}
        title="Dissolve summary"
        description={
          dissolving ? dissolveSummaryDescription(dissolving, model.activities.data ?? []) : ''
        }
        confirmLabel="Dissolve"
        confirmVariant="default"
        pending={dissolveSummary.isPending}
        pendingLabel="Dissolving…"
        error={dissolveError}
      />
    </>
  );
}
