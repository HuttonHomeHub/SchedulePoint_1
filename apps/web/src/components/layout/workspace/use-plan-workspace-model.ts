import type { ActivitySummary, BaselineVarianceRow, DependencySummary } from '@repo/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import {
  CANVAS_AUTHORING_ENABLED,
  NOTES_ENABLED,
  SCHEDULING_MODES_ENABLED,
  UNDO_REDO_ENABLED,
} from '@/config/env';
import {
  useActivities,
  useCreateActivity,
  useCreatePlacedActivity,
  useUpdateActivity,
  useRepositionLane,
  useSetActivityVisualStart,
  useBatchPositions,
  useDeleteActivity,
  isMilestoneType,
} from '@/features/activities';
import { useSession } from '@/features/auth';
import { useBaselineVariance } from '@/features/baselines';
import { useCalendar, useCalendars } from '@/features/calendars';
import { useClient } from '@/features/clients';
import {
  useCreateDependency,
  useDeleteDependency,
  usePlanDependencies,
} from '@/features/dependencies';
import { useActivityNoteCounts } from '@/features/notes';
import { derivePlanGating, usePlanPen } from '@/features/plan-lock';
import { usePlan } from '@/features/plans';
import { useProject } from '@/features/projects';
import { useRecalculate, usePlanAutoRecalc } from '@/features/schedule';
import {
  addCalendarDays,
  type TsldCreateInput,
  type TsldCreateOutcome,
  type TsldLinkInput,
  type TsldLinkOutcome,
  type TsldRepositionInput,
  type TsldRepositionOutcome,
  type TsldEditOutcome,
} from '@/features/tsld';
import {
  autoArrangeCommand,
  createActivityCommand,
  deleteActivityCommand,
  dependencyAddCommand,
  dependencyRemoveCommand,
  relaneCommand,
  repositionCommand,
  updateCommand,
  visualStartCommand,
  usePlanEditHistory,
  usePlanUndoRedo,
  type LanePlacement,
} from '@/features/undo-redo';
import {
  canCalculateSchedule,
  canManageHierarchy,
  canReportProgress,
  canWriteNotes,
  useOrgRole,
} from '@/hooks/use-org-role';
import { ApiFetchError } from '@/lib/api/client';
import { minorToMajorInput } from '@/lib/format-money';

/**
 * The single source of a plan surface's route-composed orchestration — every query, the
 * gating matrix, and the TSLD edit callbacks (create / reposition / link / auto-arrange /
 * refresh) that compose a mutation + authoritative recalc across features (ADR-0026 D8).
 *
 * Extracted from `PlanDetailScreen` so the legacy stacked page and the canvas-first
 * `PlanWorkspace` (ADR-0030) render the **same** behaviour from one implementation — the
 * flag only chooses the layout, never the logic. The callbacks are lifted verbatim; this
 * hook adds no new behaviour.
 */
export function usePlanWorkspaceModel(orgSlug: string, planId: string) {
  const role = useOrgRole(orgSlug);
  const session = useSession();
  const currentUserId = session.data?.user.id;
  // The edit-lock "pen" (ADR-0028). When the pen layer is off (`VITE_PLAN_EDIT_LOCK`
  // unset) `penManaged` is false and gating falls back to role only — today's behaviour.
  const pen = usePlanPen(orgSlug, planId);
  const canWrite = canManageHierarchy(role); // role only — plan metadata + baselines
  // Notes (ADR-0046) are collaborative annotations: Contributor upward may write, and unlike schedule
  // editing they are NOT pen-gated (the progress precedent). Role-only, like `canWrite`.
  const canWriteNotesValue = canWriteNotes(role);
  // The on-canvas schedule model (activities/dependencies/positions/recalculate) is
  // additionally pen-gated: a Planner must hold the pen to edit it (spec §3.1 / ADR-0028).
  const { canEditSchedule, canRecalc, canProgress, penReadOnly } = derivePlanGating({
    penManaged: pen.penManaged,
    holdsPen: pen.holdsPen,
    canWrite,
    canProgress: canReportProgress(role),
    canCalculate: canCalculateSchedule(role),
  });
  const [editing, setEditing] = useState(false);
  const [logicActivity, setLogicActivity] = useState<ActivitySummary | undefined>(undefined);
  // The activity targeted by the floating selection bar's Edit / Delete actions (ADR-0031). Held as
  // ids (not the row) so a 409 retry re-derives the current version from the live query — the shared
  // `ActivityCrudDialogs` renders the edit/delete dialogs from these, so the canvas and the table
  // trigger the same host-owned dialogs (ADR-0026 D8: the tsld feature stays dependency-free).
  const [editActivityId, setEditActivityId] = useState<string | null>(null);
  const [deleteActivityId, setDeleteActivityId] = useState<string | null>(null);
  const onEditActivity = useCallback((a: ActivitySummary) => setEditActivityId(a.id), []);
  const onDeleteActivity = useCallback((a: ActivitySummary) => setDeleteActivityId(a.id), []);
  // The canvas selection lifted to the workspace (toolbar quick-wins F0, spec
  // `docs/specs/toolbar-quick-wins/`): the TSLD panel reports its selection here so the main toolbar's
  // selection-aware items (Update progress / Add note / Clear visual placement) can read it — mirroring
  // the `editActivityId`/`deleteActivityId` precedent. Held as an id; the resolved row is derived below
  // from the live query so it clears when the row is deleted. Inert when nothing reads it (flag off).
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const onSelectionChange = useCallback((id: string | null) => setSelectedActivityId(id), []);
  // The activity targeted by the toolbar's **Update progress…** action (F3), driving the
  // workspace-hosted `ActivityProgressDialog` (beside `ActivityCrudDialogs`). Held as an id like the
  // crud dialogs so a 409 retry re-derives the current version; the derived row (below) closes the
  // dialog when its target vanishes.
  const [progressActivityId, setProgressActivityId] = useState<string | null>(null);

  const plan = usePlan(orgSlug, planId);
  const project = useProject(orgSlug, plan.data?.projectId ?? '');
  const client = useClient(orgSlug, project.data?.clientId ?? '');
  // Shares the activities cache with the table (same query key); used to populate the
  // logic-editor's add picker and the TSLD canvas.
  const activities = useActivities(orgSlug, planId);
  // The plan's dependency edges — drawn as logic lines on the TSLD canvas.
  const dependencies = usePlanDependencies(orgSlug, planId);
  // The org's calendars, for the plan calendar picker (read for every member).
  const calendars = useCalendars(orgSlug);
  // The plan's working-day calendar (mask + holiday exceptions) drives the TSLD's non-working
  // shading. The mask comes from the already-loaded list; the exceptions from the (cached) detail.
  const planCalendarId = plan.data?.calendarId ?? null;
  const calendarDetail = useCalendar(orgSlug, planCalendarId ?? '');
  const tsldCalendar = useMemo(() => {
    const mask =
      calendars.data?.find((c) => c.id === planCalendarId)?.workingWeekdays ??
      calendarDetail.data?.workingWeekdays;
    if (mask == null) return null;
    const exceptions = new Map<string, boolean>(
      (calendarDetail.data?.exceptions ?? []).map((e) => [e.date, e.isWorking]),
    );
    return { workingWeekdays: mask, exceptions };
  }, [calendars.data, calendarDetail.data, planCalendarId]);
  // Today as a local calendar day (`YYYY-MM-DD`), for the TSLD's "today" marker — resolved here so
  // the diagram does no wall-clock math.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // Variance vs the plan's active baseline (M7). The route composes it and passes a
  // per-activity map into the activities table, so that feature imports no baseline code.
  const variance = useBaselineVariance(orgSlug, planId);
  const varianceByActivityId = useMemo(() => {
    if (!variance.data || variance.data.summary.baselineId === null) return undefined;
    return new Map<string, BaselineVarianceRow>(
      variance.data.rows.map((row) => [row.activityId, row]),
    );
  }, [variance.data]);
  const canManageLogic = canEditSchedule; // dependency write is pen-gated schedule editing

  // Per-activity note counts for the activities-table row badge (ADR-0046), route-composed like
  // `varianceByActivityId` — ONE batch query for the whole table (never per-row). Gated on `VITE_NOTES`
  // via `enabled`, so with the flag off the query never fires and the map stays undefined (the
  // activities table then renders no badge column) — byte-identical to today.
  const noteCounts = useActivityNoteCounts(orgSlug, planId, NOTES_ENABLED);
  const noteCountByActivityId = useMemo(() => {
    if (!NOTES_ENABLED || !noteCounts.data) return undefined;
    return new Map<string, number>(noteCounts.data.map((entry) => [entry.activityId, entry.count]));
  }, [noteCounts.data]);

  // Resolve the lifted selection / progress target from the live query (toolbar quick-wins F0/F3), so
  // each carries the current `version` and becomes undefined the moment its row is deleted — the
  // selection-aware toolbar items then re-disable and the progress dialog closes, with no extra effect.
  const selectedActivity = useMemo(
    () =>
      selectedActivityId
        ? (activities.data ?? []).find((a) => a.id === selectedActivityId)
        : undefined,
    [selectedActivityId, activities.data],
  );
  const progressActivity = useMemo(
    () =>
      progressActivityId
        ? (activities.data ?? []).find((a) => a.id === progressActivityId)
        : undefined,
    [progressActivityId, activities.data],
  );

  // Unified auto-recalc (ADR-0032 M3): behind `VITE_CANVAS_AUTHORING`, any structural edit — from
  // the canvas *or* the activities table — triggers a coalesced recalculation, so the canvas plots
  // new/changed rows without a manual Recalculate. Enabled only when a recalc could succeed (role +
  // pen + a start date); guarded live at fire time. Recalc failures announce (rare). The manual
  // button becomes `flush()`. Flag-off: this stays inert and the callbacks keep their inline recalc.
  const announce = useAnnounce();
  // Undo/redo command stack (ADR-0048, dark M1). Records the inverse of each structural edit behind
  // `VITE_UNDO_REDO`; nothing is recorded and no behaviour changes when the flag is off. The store is
  // keyed on `planId` so switching plans resets history. No visible surface yet — M3 wires the UI.
  const editHistory = usePlanEditHistory(planId);
  // Undo/redo user-visible surface (ADR-0048 M3): wraps the dark M1/M2 store with the conflict +
  // pen-loss contract (409/404 → refetch + clear redo; 423 → clear history + shared pen contract) and
  // the success announcements. Shared by the toolbar controls + keybindings (the SAME store the
  // recording seams above push onto). Inert unless `VITE_UNDO_REDO` is on — the wrapper only acts when
  // the user invokes undo/redo, which the flag-gated surface never does when off, so byte-identical.
  const undoRedo = usePlanUndoRedo({
    history: editHistory,
    orgSlug,
    planId,
    announce,
    onLockLost: pen.onWriteRejected,
  });
  const autoRecalc = usePlanAutoRecalc(orgSlug, planId, {
    enabled: CANVAS_AUTHORING_ENABLED && canRecalc && plan.data?.plannedStart != null,
    onMessage: announce,
  });
  // Any structural edit — from the canvas, the activities table, or the logic editor — should
  // auto-recalc. Watching only the row *count* misses in-place edits that change the schedule
  // without adding/removing a row (a duration or constraint edit from the table — ux review), so we
  // key on a **scheduling-input signature**: each activity's duration/type/constraint and each
  // dependency's type/lag. Crucially this excludes the engine-*computed* fields (early/late dates,
  // floats, critical) that a recalc writes back, so a settled recalc never re-triggers `notify()` —
  // no loop. Layout-only `laneIndex` is excluded too (a lane move needs no recalc; the canvas path
  // already skips it). The canvas reposition/link callbacks still `notify()` explicitly, which just
  // coalesces with this. Baseline is taken on the first *loaded* (non-pending) observation, so
  // opening a plan never fires a gratuitous recalc.
  const structureSignature = useMemo(() => {
    const acts = (activities.data ?? [])
      .map(
        (a) =>
          `${a.id}:${a.type}:${a.durationDays}:${a.constraintType ?? ''}:${a.constraintDate ?? ''}`,
      )
      .sort()
      .join('|');
    const deps = (dependencies.data ?? [])
      .map((d) => `${d.id}:${d.type}:${d.lagDays}`)
      .sort()
      .join('|');
    return `${acts}##${deps}`;
  }, [activities.data, dependencies.data]);
  const structureSizeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!CANVAS_AUTHORING_ENABLED) return;
    if (activities.isPending || dependencies.isPending) return; // wait for a real loaded baseline
    if (structureSizeRef.current === null) {
      structureSizeRef.current = structureSignature;
      return;
    }
    if (structureSizeRef.current !== structureSignature) {
      structureSizeRef.current = structureSignature;
      autoRecalc.notify();
    }
  }, [structureSignature, activities.isPending, dependencies.isPending, autoRecalc]);

  // TSLD create-by-drag (M2): the route composes the create + recalc so features/tsld imports
  // no other feature (ADR-0026 D8). A drag becomes a 1-day-min TASK pinned at the dropped day
  // with an SNET constraint, then the authoritative recalc places it.
  const createPlacedActivity = useCreatePlacedActivity(orgSlug, planId);
  // Full-definition create + delete, used only by the undo/redo inverses (ADR-0048 M2): undoing a
  // create deletes it; undoing a leaf delete re-creates its whole definition (a new id). Instantiated
  // here (not in the dialog) so the command's inverse re-issues through the same authorised endpoints.
  const createActivity = useCreateActivity(orgSlug, planId);
  const deleteActivity = useDeleteActivity(orgSlug, planId);
  const recalculate = useRecalculate(orgSlug, planId);
  const onTsldCreate = async (input: TsldCreateInput): Promise<TsldCreateOutcome> => {
    // Post-M1 every saved plan has a mandatory start (ADR-0033 M1), so the ADR-0032 "first draw pins
    // the start to today" special-case is gone — a plan can't exist start-less. This guard is now
    // purely defensive (the plan's data simply hasn't loaded yet); the canvas isn't drawable until it
    // has, so a draw here is a no-op rather than an error.
    const plannedStart = plan.data?.plannedStart;
    if (!plannedStart) return { recalcConflict: null };
    // The create must land first (this throw keeps the popover open with the error). Only
    // then recalc — a recalc failure is non-fatal: the row persisted, so we report the
    // conflict without re-prompting (never a second POST). The next recalc reconciles dates.
    // The draw kind (ADR-0032 M4): a task spans its dragged days; a milestone is a zero-duration
    // point (the canvas already collapsed the drag to a single day, and the API rejects a non-zero
    // milestone duration). An SNET at the start day pins placement; recalc then lands the dates.
    // VISUAL mode (ADR-0033 M3): the drop hand-places `visualStart`, no implicit SNET constraint;
    // EARLY mode keeps the SNET-at-start pin. Either way recalc then lands the dates.
    const dropDate = addCalendarDays(plannedStart, input.startDay);
    const placedInput = {
      name: input.name,
      type: input.type,
      durationDays: isMilestoneType(input.type) ? 0 : input.endDay - input.startDay + 1,
      laneIndex: input.laneIndex,
      ...(isVisualMode
        ? { visualStart: dropDate }
        : { constraintType: 'SNET' as const, constraintDate: dropDate }),
    };
    const created = await createPlacedActivity.mutateAsync(placedInput);
    // Record the create for undo (ADR-0048 M2) — the single user edit, NOT the follow-up recalc.
    // Undo deletes the created activity; redo re-creates it from the same placement input. Guarded on
    // the flag so behaviour is byte-identical when off.
    if (UNDO_REDO_ENABLED) {
      editHistory.record(
        createActivityCommand({
          created,
          input: placedInput,
          createPlaced: createPlacedActivity.mutateAsync,
          deleteActivity: deleteActivity.mutateAsync,
        }),
      );
    }
    // Canvas-first authoring (ADR-0032 M3): hand the recalc to the coalescer and return — the new
    // bar plots a beat later (the optimistic pending bar covers the gap). Flag-off keeps the inline
    // await + recalc-conflict semantics byte-for-byte.
    if (CANVAS_AUTHORING_ENABLED) {
      autoRecalc.notify();
      return { recalcConflict: null };
    }
    try {
      await recalculate.mutateAsync();
      return { recalcConflict: null };
    } catch {
      return {
        recalcConflict:
          'Activity added, but the schedule couldn’t recalculate just now. The dates will update after the next recalculation.',
      };
    }
  };

  // TSLD free-2D reposition (M4): a body drag moves a bar in time and/or lane at once, reported
  // as the axes that changed. A day change is an SNET-at-new-start + recalc (M2); a lane change is
  // a layout-only `laneIndex` write with NO recalc. Both go through the single-activity PATCH with
  // the live version (optimistic lock) — a stale version is a non-destructive conflict, never re-sent.
  const updateActivity = useUpdateActivity(orgSlug, planId);
  const repositionLane = useRepositionLane(orgSlug, planId);
  const setVisualStart = useSetActivityVisualStart(orgSlug, planId);
  // Dependency create/delete. `createDependency` backs the canvas link (onTsldLink); both also back the
  // undo/redo inverses (ADR-0048 M2) — undoing a link removes it, undoing a remove re-creates it.
  const createDependency = useCreateDependency(orgSlug);
  const deleteDependency = useDeleteDependency(orgSlug);
  // Record an activity DEFINITION edit (rename / duration / constraint / …) on the undo stack (ADR-0048,
  // dark M1). Called by `ActivityCrudDialogs` when the shared edit dialog saves, with the pre-edit row
  // and the server's post-edit row; the inverse re-PATCHes the full definition through the same
  // `useUpdateActivity` endpoint. A no-op unless `VITE_UNDO_REDO` is on — byte-identical when off.
  const recordActivityUpdate = useCallback(
    (before: ActivitySummary, after: ActivitySummary): void => {
      if (!UNDO_REDO_ENABLED) return;
      editHistory.record(updateCommand({ update: updateActivity.mutateAsync, before, after }));
    },
    [editHistory, updateActivity.mutateAsync],
  );
  // Record an activity DELETE on the undo stack (ADR-0048 M2). Called by `ActivityCrudDialogs` after a
  // successful delete, with the pre-delete row. A **leaf** delete is reversible: undo re-creates the
  // whole definition (a NEW id — the conservative rule; id-stable/cascade-clean restore is M4). A
  // **cascade** (a WBS summary with a subtree, ADR-0038) is NOT cleanly reversible in M2, so rather
  // than offer a broken partial undo we record an explicit non-undoable boundary that **truncates**
  // the history (clear the stack). A no-op unless `VITE_UNDO_REDO` is on — byte-identical when off.
  const recordActivityDelete = useCallback(
    (activity: ActivitySummary): void => {
      if (!UNDO_REDO_ENABLED) return;
      const hasSubtree = (activities.data ?? []).some((a) => a.parentId === activity.id);
      if (activity.type === 'WBS_SUMMARY' && hasSubtree) {
        editHistory.clear();
        return;
      }
      editHistory.record(
        deleteActivityCommand({
          activity,
          createActivity: createActivity.mutateAsync,
          repositionLane: repositionLane.mutateAsync,
          deleteActivity: deleteActivity.mutateAsync,
        }),
      );
    },
    [
      editHistory,
      activities.data,
      createActivity.mutateAsync,
      repositionLane.mutateAsync,
      deleteActivity.mutateAsync,
    ],
  );
  // Record a dependency REMOVE on the undo stack (ADR-0048 M2). Called by the `DependencyEditor` after
  // a successful remove, with the pre-remove edge. The inverse re-creates the link (a new id) from its
  // endpoints/type/lag; redo removes it again. A no-op unless `VITE_UNDO_REDO` is on.
  const recordDependencyRemove = useCallback(
    (dependency: DependencySummary): void => {
      if (!UNDO_REDO_ENABLED) return;
      editHistory.record(
        dependencyRemoveCommand({
          dependency,
          createDependency: createDependency.mutateAsync,
          deleteDependency: deleteDependency.mutateAsync,
        }),
      );
    },
    [editHistory, createDependency.mutateAsync, deleteDependency.mutateAsync],
  );
  // Visual-Planning mode (ADR-0033 M3): a day-drag hand-places `visualStart` (no SNET constraint),
  // then the effective-Visual recalc pins the bar and pushes its unplaced successors. Flag-off (or in
  // EARLY mode) the schedule mode is always EARLY, so today's SNET path is byte-for-byte unchanged.
  const isVisualMode = SCHEDULING_MODES_ENABLED && plan.data?.schedulingMode === 'VISUAL';
  const moveConflict =
    'This plan changed since you opened it — your move wasn’t applied. Refresh to see the latest.';
  const onTsldReposition = async ({
    activityId,
    startDay,
    laneIndex,
  }: TsldRepositionInput): Promise<TsldRepositionOutcome> => {
    const activity = (activities.data ?? []).find((a) => a.id === activityId);
    if (!activity) return { applied: false, conflict: null };

    // Pure lane move: the cheap, layout-only PATCH — no constraint change, no recalc.
    if (startDay === undefined) {
      if (laneIndex === undefined) return { applied: false, conflict: null };
      try {
        const saved = await repositionLane.mutateAsync({
          activityId,
          laneIndex,
          version: activity.version,
        });
        // Record the lane move for undo (ADR-0048, dark M1) — only the user edit, never the recalc
        // (a pure lane move has none). Guarded on the flag so behaviour is unchanged when off.
        if (UNDO_REDO_ENABLED) {
          editHistory.record(
            relaneCommand({
              repositionLane: repositionLane.mutateAsync,
              activityId,
              fromLaneIndex: activity.laneIndex,
              toLaneIndex: laneIndex,
              version: saved.version,
            }),
          );
        }
        return { applied: true, conflict: null };
      } catch (err) {
        if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
        if (err instanceof ApiFetchError && err.status === 409) {
          return { applied: false, conflict: moveConflict };
        }
        throw err;
      }
    }

    // Day changed (optionally lane too). VISUAL mode (ADR-0033 M3): hand-place `visualStart` at the
    // drop via the minimal PATCH — NO constraint write — then recalc; the effective-Visual pass pins
    // this bar and pushes its unplaced successors. EARLY mode: one PATCH imposing an SNET-at-new-start
    // (ADR-0023) — which by design overwrites any prior constraint, re-pinning a pinned bar where it
    // was dropped — plus the lane if it moved, then recalc. Resent definition fields are unchanged.
    const plannedStart = plan.data?.plannedStart;
    if (!plannedStart) return { applied: false, conflict: null };
    const droppedDate = addCalendarDays(plannedStart, startDay);
    try {
      if (isVisualMode) {
        const saved = await setVisualStart.mutateAsync({
          activityId,
          visualStart: droppedDate,
          version: activity.version,
          ...(laneIndex !== undefined ? { laneIndex } : {}),
        });
        // Record the Visual-mode placement for undo (ADR-0048 M2) — the single user edit, NOT the
        // follow-up recalc. The inverse restores the prior `visualStart` (and lane); a drag/nudge
        // burst coalesces to one step (the command carries a coalescing key). Guarded on the flag.
        if (UNDO_REDO_ENABLED) {
          editHistory.record(
            visualStartCommand({
              setVisualStart: setVisualStart.mutateAsync,
              activityId,
              before: { visualStart: activity.visualStart, laneIndex: activity.laneIndex },
              after: { visualStart: droppedDate, laneIndex: laneIndex ?? activity.laneIndex },
              version: saved.version,
            }),
          );
        }
      } else {
        const saved = await updateActivity.mutateAsync({
          activityId,
          version: activity.version,
          name: activity.name,
          code: activity.code ?? undefined,
          type: activity.type,
          // Round-trip the duration type unchanged (ADR-0040) — a canvas move must not reset it.
          durationType: activity.durationType,
          durationDays: activity.durationDays,
          description: activity.description ?? undefined,
          // Round-trip the Earned-Value inputs unchanged (EV4b, ADR-0042) — the update body always
          // sends them, so a canvas move must resend the stored values (money minor → major units) or
          // it would silently clear them, exactly like the duration type above.
          percentCompleteType: activity.percentCompleteType,
          // Round-trip the cost accrual unchanged (M7 rung 5, ADR-0044 §32) — the update body always
          // sends it, so a canvas move must resend the stored value or it would silently reset it.
          accrualType: activity.accrualType,
          physicalPercentComplete: activity.physicalPercentComplete ?? undefined,
          budgetedExpense: minorToMajorInput(activity.budgetedExpense),
          actualExpense: minorToMajorInput(activity.actualExpense),
          constraintType: 'SNET',
          constraintDate: droppedDate,
          ...(laneIndex !== undefined ? { laneIndex } : {}),
        });
        // Record the reposition for undo (ADR-0048, dark M1) — the single user edit, NOT the follow-up
        // recalc below (recompute-don't-restore: the inverse replays the input, recalc redraws). The
        // inverse restores the pre-edit definition (its prior constraint) and lane. Guarded on the flag.
        if (UNDO_REDO_ENABLED) {
          editHistory.record(
            repositionCommand({
              update: updateActivity.mutateAsync,
              before: activity,
              after: saved,
            }),
          );
        }
      }
    } catch (err) {
      if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
      if (err instanceof ApiFetchError && err.status === 409) {
        // Stale version — the move was NOT applied (nothing changed); never re-send.
        return { applied: false, conflict: moveConflict };
      }
      throw err;
    }
    // The move landed; a recalc failure is non-fatal (dates stay stale until the next recalc).
    if (CANVAS_AUTHORING_ENABLED) {
      autoRecalc.notify();
      return { applied: true, conflict: null };
    }
    try {
      await recalculate.mutateAsync();
      return { applied: true, conflict: null };
    } catch {
      return {
        applied: true,
        conflict:
          'Moved, but the schedule couldn’t recalculate just now. The dates will update after the next recalculation.',
      };
    }
  };

  // TSLD dependency-draw (M2): a drag from one bar's edge to another becomes a link. The route
  // composes the create + recalc (ADR-0026 D8). A cycle or duplicate (ADR-0021) is a 422/409 the
  // engine rejects — surfaced non-destructively (nothing was created), never retried.
  const onTsldLink = async ({
    predecessorId,
    successorId,
    type,
  }: TsldLinkInput): Promise<TsldLinkOutcome> => {
    try {
      const created = await createDependency.mutateAsync({
        planId,
        predecessorId,
        successorId,
        type,
        lagDays: 0,
        lagCalendar: 'PROJECT_DEFAULT',
      });
      // Record the link for undo (ADR-0048 M2) — the single user edit, NOT the follow-up recalc.
      // Undo removes the created edge; redo re-creates it from the captured endpoints/type/lag.
      if (UNDO_REDO_ENABLED) {
        editHistory.record(
          dependencyAddCommand({
            dependency: created,
            createDependency: createDependency.mutateAsync,
            deleteDependency: deleteDependency.mutateAsync,
          }),
        );
      }
    } catch (err) {
      if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
      if (err instanceof ApiFetchError && (err.status === 409 || err.status === 422)) {
        // A cycle/duplicate the engine refused — nothing was created; show the reason, don't retry.
        return { applied: false, conflict: err.error.message };
      }
      throw err;
    }
    // The link landed; a recalc failure is non-fatal (dates stay stale until the next recalc).
    if (CANVAS_AUTHORING_ENABLED) {
      autoRecalc.notify();
      return { applied: true, conflict: null };
    }
    try {
      await recalculate.mutateAsync();
      return { applied: true, conflict: null };
    } catch {
      return {
        applied: true,
        conflict:
          'Linked, but the schedule couldn’t recalculate just now. The dates will update after the next recalculation.',
      };
    }
  };

  // TSLD auto-arrange (M4 4.3): persist the packed lane changes through the batch positions
  // endpoint — all-or-nothing, no recalc (lane is layout). The panel computed the moves with the
  // pure packer; here we attach each row's live version and surface the batch's N-row 409.
  const batchPositions = useBatchPositions(orgSlug, planId);
  const onTsldAutoArrange = async (
    changes: readonly { id: string; laneIndex: number }[],
  ): Promise<TsldEditOutcome> => {
    const rows = activities.data ?? [];
    const versionById = new Map(rows.map((a) => [a.id, a.version]));
    const laneById = new Map(rows.map((a) => [a.id, a.laneIndex]));
    const positions = changes.flatMap((c) => {
      const version = versionById.get(c.id);
      return version === undefined ? [] : [{ id: c.id, laneIndex: c.laneIndex, version }];
    });
    if (positions.length === 0) return { applied: false, conflict: null };
    // Snapshot each affected row's prior lane so the undo can restore it (ADR-0048 M2.3). `after` is
    // the packed target; `before` the pre-arrange lane. Only rows we can source a prior lane for.
    const before: LanePlacement[] = positions.flatMap((p) => {
      const laneIndex = laneById.get(p.id);
      return laneIndex === undefined ? [] : [{ id: p.id, laneIndex }];
    });
    const after: LanePlacement[] = positions.map((p) => ({ id: p.id, laneIndex: p.laneIndex }));
    try {
      const saved = await batchPositions.mutateAsync({ positions });
      // Record the whole batch as ONE reversible step (ADR-0048 M2.3): undo restores every prior
      // lane, redo re-applies the pack. Versions are seeded from this forward response so the inverse
      // carries current versions. Guarded on the flag; a lane batch has no recalc to double-record.
      if (UNDO_REDO_ENABLED) {
        editHistory.record(
          autoArrangeCommand({
            batchPositions: batchPositions.mutateAsync,
            before,
            after,
            versions: new Map(saved.map((row) => [row.id, row.version])),
          }),
        );
      }
      return { applied: true, conflict: null };
    } catch (err) {
      if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
      if (err instanceof ApiFetchError && err.status === 409) {
        // All-or-nothing: one stale row rejected the whole pack — nothing moved.
        return {
          applied: false,
          conflict:
            'The plan changed since you opened it, so auto-arrange wasn’t applied. Refresh and try again.',
        };
      }
      throw err;
    }
  };

  // The conflict banner's Refresh: re-pull the plan's server truth (diagram + variance) so a
  // "changed elsewhere" 409 has a real recovery action, not just copy telling the user to refresh.
  const onTsldRefresh = (): void => {
    void activities.refetch();
    void dependencies.refetch();
    void variance.refetch();
  };

  // Clear a bar's hand-placed `visualStart` (toolbar quick-wins F5, spec `docs/specs/toolbar-quick-wins/`)
  // — the **Clear visual placement** command. A faithful subset of the reposition VISUAL branch above:
  // the minimal `visualStart: null` PATCH → (flag-guarded) the `visualStartCommand` inverse restoring the
  // prior placement → `autoRecalc.notify()` so the effective-Visual pass re-plots the bar at its computed
  // date. A stale-version 409 (or a pen-loss 423) is non-destructive: nothing applied, nothing recorded,
  // never re-sent — exactly like a reposition. It touches only the existing PATCH hook + auto-recalc, so
  // the CPM engine and its recalc parity gate are untouched. Stable identity (the toolbar context memo
  // depends on it) — it reads the pre-clear row through the live query at call time. Only offered in
  // Visual mode (the item's gate requires `schedulingMode === 'VISUAL'`, which needs canvas authoring).
  const clearVisualPlacement = useCallback(
    async (activityId: string, version: number): Promise<void> => {
      const activity = (activities.data ?? []).find((a) => a.id === activityId);
      try {
        const saved = await setVisualStart.mutateAsync({ activityId, visualStart: null, version });
        // Record the clear for undo (ADR-0048) — the single user edit, NOT the follow-up recalc. The
        // inverse restores the prior `visualStart` (lane unchanged). Guarded on the flag, like the
        // reposition VISUAL branch — byte-identical when off.
        if (UNDO_REDO_ENABLED) {
          editHistory.record(
            visualStartCommand({
              setVisualStart: setVisualStart.mutateAsync,
              activityId,
              before: {
                visualStart: activity?.visualStart ?? null,
                laneIndex: activity?.laneIndex ?? 0,
              },
              after: { visualStart: null, laneIndex: activity?.laneIndex ?? 0 },
              version: saved.version,
            }),
          );
        }
      } catch (err) {
        if (pen.onWriteRejected(err).kind === 'lock') return;
        // Stale version — the clear was NOT applied (nothing changed); never re-send, never record.
        if (err instanceof ApiFetchError && err.status === 409) return;
        throw err;
      }
      autoRecalc.notify();
    },
    // The member handles below (`setVisualStart.mutateAsync`, `autoRecalc.notify`, `pen.onWriteRejected`)
    // are the stable references this callback needs; depending on the enclosing `setVisualStart` /
    // `autoRecalc` / `pen` objects instead (as exhaustive-deps wants for a *called* member) would churn
    // the toolbar-context memo that keys on this callback's identity. Same pattern as the sibling
    // reposition handler's stable-handle usage (and `components/ui/menu.tsx`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activities.data,
      setVisualStart.mutateAsync,
      editHistory,
      autoRecalc.notify,
      pen.onWriteRejected,
    ],
  );

  return {
    orgSlug,
    planId,
    // Queries
    plan,
    project,
    client,
    activities,
    dependencies,
    calendars,
    variance,
    // Derived
    tsldCalendar,
    todayIso,
    varianceByActivityId,
    // Per-activity note counts for the row badge (ADR-0046) — undefined when `VITE_NOTES` is off.
    noteCountByActivityId,
    // Gating / identity
    pen,
    currentUserId,
    canWrite,
    canWriteNotes: canWriteNotesValue,
    canEditSchedule,
    canRecalc,
    canProgress,
    canManageLogic,
    penReadOnly,
    // Unified auto-recalc (ADR-0032 M3): the manual Recalculate button flushes it; inert flag-off.
    autoRecalc,
    // Local UI state
    editing,
    setEditing,
    logicActivity,
    setLogicActivity,
    // Activity edit/delete targeted from the floating selection bar (rendered by ActivityCrudDialogs).
    editActivityId,
    setEditActivityId,
    deleteActivityId,
    setDeleteActivityId,
    onEditActivity,
    onDeleteActivity,
    // Canvas selection lifted to the workspace (toolbar quick-wins F0) + the toolbar's Update-progress
    // target (F3). Inert when nothing reads them (flag off). `selectedActivity`/`progressActivity`
    // resolve from the live query, so they clear when their row is deleted.
    selectedActivityId,
    onSelectionChange,
    selectedActivity,
    progressActivityId,
    setProgressActivityId,
    progressActivity,
    // Clear a hand-placed `visualStart` (toolbar quick-wins F5) — the null-visualStart PATCH + undo
    // inverse + auto-recalc; only the existing PATCH hook, so the parity gate is untouched.
    clearVisualPlacement,
    // Undo/redo recording seam (ADR-0048, dark M1). `ActivityCrudDialogs` calls this when the shared
    // edit dialog saves so a definition edit joins the reposition/relane commands recorded inline in
    // the TSLD callbacks. A no-op when `VITE_UNDO_REDO` is off; undo/redo controls arrive in M3.
    recordActivityUpdate,
    // Undo/redo recording seams for delete (ADR-0048 M2). `ActivityCrudDialogs` calls
    // `recordActivityDelete` after a successful delete (leaf → reversible re-create; cascade → history
    // truncation); the `DependencyEditor` calls `recordDependencyRemove` after a successful link
    // removal. No-ops when `VITE_UNDO_REDO` is off.
    recordActivityDelete,
    recordDependencyRemove,
    // Undo/redo user-visible surface (ADR-0048 M3): the toolbar Undo/Redo items + the workspace
    // keybindings drive this, sharing the ONE history instance the recording seams above push onto.
    // Inert (never invoked) unless `VITE_UNDO_REDO` is on.
    undoRedo,
    // TSLD edit callbacks
    onTsldCreate,
    onTsldReposition,
    onTsldLink,
    onTsldAutoArrange,
    onTsldRefresh,
  };
}

export type PlanWorkspaceModel = ReturnType<typeof usePlanWorkspaceModel>;

/** The plan detail, narrowed to loaded — the screen guards pending/error before rendering a layout. */
export type LoadedPlan = NonNullable<PlanWorkspaceModel['plan']['data']>;
