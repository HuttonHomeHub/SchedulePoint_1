import { useState } from 'react';
import { flushSync } from 'react-dom';

import type { PlanWorkspaceModel } from './use-plan-workspace-model';

import { useAnnounce } from '@/components/ui/announcer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED,
  CANVAS_DIRECT_MANIPULATION_ENABLED,
  NOTES_ENABLED,
  PROGRAMME_SCHEDULING_ENABLED,
} from '@/config/env';
import {
  ActivityCreateDialog,
  ActivityEditor,
  modalShell,
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
 * both use the same shared `ActivityEditorDialog` / `ConfirmDialog`, so their behaviour can't drift.
 *
 * This is the workspace's **one** activity editor (ADR-0060 §7): the canvas's Edit, its
 * Report-progress and its Steps actions — plus the toolbar's Update-progress — all resolve to the
 * same `editorIntent`. The separate progress and steps dialogs it replaced were deleted with
 * `VITE_ACTIVITY_EDITOR_TABS` (ADR-0089); there is no longer another surface for an entry point to
 * open.
 */
/**
 * The workspace's one activity editor, **as a modal dialog** (ADR-0101, reversing Graphite M6-T2).
 *
 * It renders exactly once, and it renders in the chrome ADR-0061 designed it for: an `xl`
 * (`max-w-4xl`, 896 px) dialog with a vertical section rail beside the content pane.
 *
 * **Why this stopped being a drawer subject.** Graphite M6 docked it in the trailing context
 * drawer, which is 300 px by default and caps at 420 px (`use-context-drawer-prefs.ts`). ADR-0061
 * had widened this exact form to 896 px *because 448 px was already unusable* — Save fell below the
 * fold — so docking it put a form into a third of a width that had been judged too narrow at half.
 * The M10 gate pass then found the vertical rail left "about 92 px of content beside it" and
 * switched the drawer to a horizontal tab strip, which fixed the symptom: on a 1920 px desktop the
 * editor ran its sub-768 px narrow layout permanently, four tabs overflowing sideways inside a
 * panel that was itself scrolling vertically, over a Successors table scrolling sideways of its own.
 *
 * The deeper reason is in the record rather than in anyone's taste. ADR-0097 D2 deferred the docked
 * editor on 2026-08-19 with the words *"it wants its own epic and its own design pass"*; Graphite M6
 * shipped it the next day as a sub-task of a shell epic, and that design pass never happened. This
 * restores the chrome the editor was designed for and returns the docked editor to the backlog it
 * was already on — where, if it is built, it is built as something drawer-shaped rather than as a
 * dialog squeezed into a column.
 *
 * The drawer keeps the Project Explorer, which is what it is shaped for: a tree, narrow, a list.
 */
function PlanActivityEditor({
  activity,
  ...props
}: Omit<Parameters<typeof ActivityEditor>[0], 'shell'>): React.ReactElement {
  return (
    <ActivityEditor
      {...props}
      {...(activity ? { activity } : { activity: undefined })}
      // No `tabRailAllowed`: it defaults true, so the rail is chosen by the VIEWPORT query again —
      // the right question for a dialog sized by the window, and the one this editor had before it
      // was docked in a panel sized by a splitter.
      shell={modalShell(props.open)}
    />
  );
}

export function ActivityCrudDialogs({ model }: { model: PlanWorkspaceModel }): React.ReactElement {
  const { orgSlug, planId } = model;
  const deleteActivity = useDeleteActivity(orgSlug, planId);
  const dissolveSummary = useDissolveSummary(orgSlug, planId);
  const announce = useAnnounce();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [dissolveError, setDissolveError] = useState<string | null>(null);
  const [bandCopyError, setBandCopyError] = useState<string | null>(null);
  const [bandCopyPending, setBandCopyPending] = useState(false);

  // The intent holds an id, the row comes from the live query, so a save that bumps `version` feeds
  // the next one and the editor closes when its target is deleted.
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
      <PlanActivityEditor
        orgSlug={orgSlug}
        planId={planId}
        open={intended !== undefined}
        onClose={() => model.setEditorIntent(null)}
        /*
         * **Keep editing** on the subject-change guard: put the intent back to the activity the
         * editor is still holding, so the host and the editor agree about the subject rather than
         * the drawer editing one activity while everything else names another.
         *
         * Wired now although nothing changes the subject under the editor **yet** — the drawer does
         * not follow the canvas selection until T4. A guard that arrives with the path it guards is
         * a guard somebody has to remember to add, and this register records that shape (ADR-0064
         * §7) more often than any other.
         */
        onSubjectHeld={(activityId) =>
          model.setEditorIntent({ ...(model.editorIntent ?? { tab: 'general' }), activityId })
        }
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
      {/*
        "Insert activity below" (ADR-0095 M5-T5). Mounted HERE rather than beside the Gantt row
        menu, for the reason this file's own docblock gives about the editor and the confirmations:
        one instance the workspace owns cannot drift from itself. The bottom panel's
        `CreateActivityButton` keeps its own dialog — a different surface with a different trigger —
        and both now feed the same component with the same props.

        `insertParentId` is three-state: `undefined` closed, `null` open at the top level, an id
        open inside that summary. Open is therefore `!== undefined`, never a truthiness test, which
        would treat a top-level insert as closed.
      */}
      <ActivityCreateDialog
        orgSlug={orgSlug}
        planId={planId}
        open={model.insertParentId !== undefined}
        onClose={model.closeInsertActivity}
        calendars={model.calendars.data ?? []}
        calendarsLoading={model.calendars.isPending}
        calendarsError={model.calendars.isError}
        {...(model.plan.data?.calendarId == null
          ? {}
          : { planCalendarId: model.plan.data.calendarId })}
        planActivities={model.activities.data ?? []}
        planActivitiesLoading={model.activities.isPending}
        planActivitiesError={model.activities.isError}
        {...(model.insertParentId === undefined ? {} : { initialParentId: model.insertParentId })}
      />

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
