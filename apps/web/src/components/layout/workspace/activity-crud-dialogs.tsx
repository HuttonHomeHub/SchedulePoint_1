import { useState } from 'react';
import { flushSync } from 'react-dom';

import type { PlanWorkspaceModel } from './use-plan-workspace-model';

import { useAnnounce } from '@/components/ui/announcer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormSection } from '@/components/ui/form-layout';
import {
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED,
  CANVAS_DIRECT_MANIPULATION_ENABLED,
  NOTES_ENABLED,
  PROGRAMME_SCHEDULING_ENABLED,
} from '@/config/env';
import {
  ActivityCreateDialog,
  ActivityEditorDialog,
  deleteActivityDescription,
  dissolveSummaryDescription,
  useDeleteActivity,
} from '@/features/activities';
import { ActivityHistoryPanel } from '@/features/activity-history';
import { ActivityCodesSection } from '@/features/codes';
import { CrossPlanLinksSection } from '@/features/cross-plan-dependencies';
import { ActivityNotesSection } from '@/features/notes';
import { CodeSwimlaneField, WbsSwimlaneField } from '@/features/swimlanes';
import { MoveToSwimlaneControl } from '@/features/tsld/components/MoveToSwimlaneControl';
import {
  NO_SWIMLANE_CHOICE_LABEL,
  type SwimlaneAssignment,
} from '@/features/tsld/model/swimlane-assignment';
import { isWbsSwimlaneLevel, useDissolveSummaryInSwimlanes } from '@/features/wbs';
import { activitySchedulingHoursPerDay } from '@/lib/effective-hours-per-day';

/**
 * The activity **edit / delete** dialogs opened from the floating {@link SelectionActionsBar} on the
 * TSLD canvas (ADR-0031). The canvas can't own these — it imports no other feature
 * (ADR-0026 §8) and the editor lives in `features/activities` — so the workspace hosts them here, driven by the shared model's `editActivityId` /
 * `deleteActivityId` (which the bar's callbacks set). The edit target is re-derived from the live
 * query so a 409 retry carries the current version, mirroring {@link ActivitiesTable}'s own dialogs;
 * both use the same shared `ActivityEditorDialog` / `ConfirmDialog`, so their behaviour can't drift.
 *
 * This is the workspace's **one** activity editor (ADR-0060 §7): the canvas's Edit, its
 * Report-progress and its Steps actions — plus the toolbar's Update-progress — all resolve to the
 * same `editorIntent`. The separate progress and steps dialogs it replaced were deleted with
 * `VITE_ACTIVITY_EDITOR_TABS` (ADR-0089); there is no longer another surface for an entry point to
 * open. It is a modal dialog (ADR-0101): an editor's chrome is the dialog and nothing else, so there
 * is no host-chosen shell and no subject change to guard while it is open (ADR-0169 D5).
 */
export function ActivityCrudDialogs({
  model,
  swimlaneAssignment = null,
}: {
  model: PlanWorkspaceModel;
  /** Move to swimlane… as an editor field (swimlanes M2-T10); absent omits the section. */
  swimlaneAssignment?: SwimlaneAssignment | null;
}): React.ReactElement {
  const { orgSlug, planId } = model;
  const deleteActivity = useDeleteActivity(orgSlug, planId);
  const dissolveSummary = useDissolveSummaryInSwimlanes(orgSlug, planId);
  const announce = useAnnounce();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [dissolveError, setDissolveError] = useState<string | null>(null);
  const [bandCopyError, setBandCopyError] = useState<string | null>(null);
  const [bandCopyPending, setBandCopyPending] = useState(false);

  const plan = model.plan.data;
  // Made from a code: the editor's Swimlane section only says where the activity is, because the
  // value it would change is written in the Codes section of the same tab (`m4-ui-design.md` §5.3).
  const codeSwimlaneTypeId =
    plan?.swimlaneSource === 'ACTIVITY_CODE' ? (plan.swimlaneCodeTypeId ?? null) : null;
  const wbsSwimlaneLevel =
    plan?.swimlaneSource === 'WBS' && isWbsSwimlaneLevel(plan.swimlaneWbsLevel)
      ? plan.swimlaneWbsLevel
      : null;

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
    // the inverse can name what it restored.
    const snapshot = deleting;
    deleteActivity.mutate(deleting.id, {
      onSuccess: (result) => {
        // Record the delete for undo (an id-stable restore of `result.deleteBatchId`, for a leaf and
        // a cascade alike — ADR-0048's 2026-09-02 amendment). Only the user edit is recorded here, never the follow-up recalc.
        model.recordActivityDelete(snapshot, result.deleteBatchId);
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
      onSuccess: (result) => {
        // One undo step: the response carries the batch the summary went in, which is what restores it.
        model.recordActivityDissolve(dissolving, result);
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
      <ActivityEditorDialog
        orgSlug={orgSlug}
        planId={planId}
        open={intended !== undefined}
        onClose={() => model.setEditorIntent(null)}
        onSaved={model.recordActivityUpdate}
        onStepsSaved={model.recordStepsSaved}
        onAssignmentEdited={model.recordAssignmentEdit}
        onReparented={model.recordReparent}
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
        {...(intended && codeSwimlaneTypeId !== null
          ? {
              swimlaneSlot: () => (
                <FormSection title="Swimlane">
                  <CodeSwimlaneField
                    orgSlug={orgSlug}
                    planId={planId}
                    codeTypeId={codeSwimlaneTypeId}
                    activity={intended}
                  />
                </FormSection>
              ),
            }
          : {})}
        {...(intended && !swimlaneAssignment && wbsSwimlaneLevel !== null && model.activities.data
          ? {
              // The swimlanes follow the WBS: the field says where the activity is, and why it is not
              // editable here. Filing it under another summary (Breakdown) is what moves it.
              swimlaneSlot: () => (
                <FormSection title="Swimlane">
                  <WbsSwimlaneField
                    activities={model.activities.data ?? []}
                    level={wbsSwimlaneLevel}
                    activityId={intended.id}
                  />
                </FormSection>
              ),
            }
          : {})}
        {...(intended && swimlaneAssignment && codeSwimlaneTypeId === null
          ? {
              swimlaneSlot: ({ generalDirty }: { generalDirty: boolean }) => (
                <FormSection title="Swimlane">
                  <p className="text-muted-foreground text-sm">
                    {`Now in ${
                      swimlaneAssignment.choices.find(
                        (c) => c.id === swimlaneAssignment.currentOf(intended.id),
                      )?.name ?? NO_SWIMLANE_CHOICE_LABEL
                    }.`}
                  </p>
                  <MoveToSwimlaneControl
                    key={intended.id}
                    assignment={swimlaneAssignment}
                    ids={[intended.id]}
                    names={[intended.name]}
                    // The same right the selection bars use: this is a layout write of its own, not
                    // part of any editor scope, so it is gated on the schedule and the pen.
                    gate={{
                      writable: model.canEditSchedule,
                      reason: model.scheduleRefusal('change swimlanes'),
                    }}
                    fieldLabel="Swimlane"
                    hint={
                      <>
                        <p>Moves the activity now. Saved separately from this tab.</p>
                        {generalDirty ? (
                          <p>Your unsaved changes to this tab aren’t affected.</p>
                        ) : null}
                        {swimlaneAssignment.shown ? null : (
                          <p>
                            Swimlanes aren’t shown on the diagram. Turn on Swimlanes in View to see
                            it.
                          </p>
                        )}
                      </>
                    }
                  />
                </FormSection>
              ),
            }
          : {})}
        {...(model.editorIntent ? { intent: model.editorIntent } : {})}
        {...(intended
          ? {
              // The Codes section of General (P6 activity codes, M3-T3): its own scope and its own
              // Save, drawn here because the editor must not import the codes feature. The session
              // owns the working state; the section does the write and records the one undo step.
              codesSlot: (state: React.ComponentProps<typeof ActivityCodesSection>['state']) => (
                <ActivityCodesSection
                  orgSlug={orgSlug}
                  planId={planId}
                  state={state}
                  record={model.recordCodeEdit}
                />
              ),
            }
          : {})}
        {...(intended
          ? {
              // The History tab (ADR-0174). Unflagged (ADR-0088 D1), and composed here because the
              // panel reads the plan's calendars and currency and this root is where the editor's
              // other cross-feature panels are wired. The day factor is the one the Duration field
              // reads, so a duration is worded identically in both.
              historySlot: (
                <ActivityHistoryPanel
                  orgSlug={orgSlug}
                  planId={planId}
                  activityId={intended.id}
                  activityCreatedAt={intended.createdAt}
                  context={{
                    hoursPerDay: activitySchedulingHoursPerDay(
                      model.calendars.data ?? [],
                      intended,
                      model.plan.data?.calendarId,
                    ),
                    currencyCode: model.plan.data?.currencyCode ?? null,
                  }}
                />
              ),
            }
          : {})}
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
                onEdited: model.recordDependencyEdit,
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
                          onAdded={model.recordCrossPlanLinkAdd}
                          onRemoved={model.recordCrossPlanLinkRemove}
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
                        // The **Add note** entry point asks for focus in the composer, not on the
                        // tab (`docs/TECH_DEBT.md` #68). Read from the intent here rather than
                        // inside the editor, because the slot is a `ReactNode` the editor cannot
                        // reach into.
                        autoFocusComposer={model.editorIntent?.focusNotes === true}
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
        onCreated={model.recordActivityCreate}
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
