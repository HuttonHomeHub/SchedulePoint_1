import { Info } from 'lucide-react';
import { useState } from 'react';
import { flushSync } from 'react-dom';

import type { PlanWorkspaceModel } from './use-plan-workspace-model';

import { ChromePortal } from '@/components/layout/chrome/chrome-slot';
import { ContextDrawerEmpty } from '@/components/layout/drawer/context-drawer';
import {
  useDrawerSubject,
  useDrawerSubjectShowing,
} from '@/components/layout/drawer/drawer-subject';
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
  type ActivityEditorShell,
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
 * Hoisted to module scope so the registration's icon is one element rather than a new one per
 * render. `useDrawerSubject` holds it in a ref for the same reason, but a stable element at the
 * call site is the honest fix — the icon is a property of the subject, not of this render.
 */
const ACTIVITY_SUBJECT_ICON = <Info aria-hidden="true" className="size-4" />;

/**
 * The workspace's one activity editor, **in whichever chrome the shell is offering** (Graphite
 * M6-T2).
 *
 * It renders exactly once. `ActivityEditor` takes a `shell` render prop (M6-T1), so the choice
 * between a modal dialog and the trailing context drawer is a choice of chrome around an unchanged
 * component — not two mounts. Mounting one of each would give a single activity two independent
 * sets of scope forms and two independent dirty states, and a planner could save one and lose the
 * other with both on screen.
 *
 * **The drawer's shell is a passthrough**, which is what makes "the drawer must not inherit focus
 * containment" structural rather than a rule someone has to remember: there is no `<Dialog>` in its
 * tree to trap focus, so there is nothing to opt out of.
 *
 * The subject is registered for as long as this workspace is mounted, so the rail's button appears
 * with the plan and leaves with it. Its `title` is the activity's own name — and deliberately
 * absent when nothing is selected, because the drawer then says so rather than keeping the last
 * subject's heading over an empty body.
 */
function PlanActivityEditor({
  activity,
  ...props
}: Omit<Parameters<typeof ActivityEditor>[0], 'shell'>): React.ReactElement {
  const showingInDrawer = useDrawerSubjectShowing();
  useDrawerSubject({
    // **"Activity details", not "Activity".** The shorter name collides with the Add split-button's
    // caret ("Activity type: Task") under any substring match, which is how the browser probe found
    // it — but the reason to change it is that a rail button should say what pressing it SHOWS, as
    // "Project Explorer" beside it does. A bare noun names the subject and not the panel.
    label: 'Activity details',
    icon: ACTIVITY_SUBJECT_ICON,
    ...(activity ? { title: activity.name } : {}),
  });

  /**
   * **The drawer's chrome is a passthrough — and its empty state is not optional.**
   *
   * A modal hides itself when `open` is false; a drawer has no such state, so without this branch
   * selecting nothing would paint the whole four-tab editor against `activity: undefined`. That is
   * worse than it sounds: the tabs render, the Save bars render, and the fields read as an activity
   * with no name — a screen that looks like data and is not. The M4 rule ("never the last subject's
   * stale data") is the same rule; this is the case where there is no data at all.
   *
   * Found by looking at a screenshot rather than by a test, which is the standing instruction after
   * `orientation` passed typecheck and 119 unit tests while rendering a row that overflowed a 48 px
   * rail.
   */
  const drawerShell: ActivityEditorShell = ({ children }) => (
    <ChromePortal name="drawer">
      {props.open ? (
        children
      ) : (
        <ContextDrawerEmpty>Select an activity to see its details here.</ContextDrawerEmpty>
      )}
    </ChromePortal>
  );
  return (
    <ActivityEditor
      {...props}
      {...(activity ? { activity } : { activity: undefined })}
      shell={showingInDrawer ? drawerShell : modalShell(props.open)}
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
