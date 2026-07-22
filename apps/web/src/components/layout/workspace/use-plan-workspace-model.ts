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
  type TsldLoeSpanInput,
  type TsldLoeSpanOutcome,
  type TsldRepositionInput,
  type TsldRepositionOutcome,
  type TsldResizeInput,
  type TsldEditOutcome,
} from '@/features/tsld';
import {
  activityDefinitionInput,
  autoArrangeCommand,
  createActivityCommand,
  createLoeSpanCommand,
  deleteActivityCommand,
  dependencyAddCommand,
  dependencyRemoveCommand,
  durationResizeCommand,
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
  canExportSchedule,
  canManageHierarchy,
  canReportProgress,
  canSharePlan,
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
  // The canvas-axis-aligned **resource-view** lens (Stage E, ADR-0049, behind `VITE_CANVAS_RESOURCE_VIEW`):
  // an ephemeral, session-local open flag toggled from the `resource-view` toolbar item, exactly like the
  // other Look-row lenses. Inert when nothing reads it (flag off / the ADR-0030 fallback), so it is
  // byte-for-byte today's behaviour by default.
  const [resourceViewOpen, setResourceViewOpen] = useState(false);
  const toggleResourceView = useCallback(() => setResourceViewOpen((open) => !open), []);
  // The on-canvas **over-allocation highlight** mode (Stage E M2, spec `docs/specs/canvas-resource-view/`,
  // behind `VITE_CANVAS_RESOURCE_VIEW`): an ephemeral, session-local flag toggled from the
  // `over-allocation` toolbar item that flags bars carrying the engine-owned levelling over-allocation
  // flags (ADR-0041) — its own mode, independent of whether the demand strip is open. Inert when nothing
  // reads it (flag off / the ADR-0030 fallback), so it is byte-for-byte today's behaviour by default.
  const [overAllocationHighlight, setOverAllocationHighlight] = useState(false);
  const toggleOverAllocation = useCallback(() => setOverAllocationHighlight((on) => !on), []);
  const [logicActivity, setLogicActivityState] = useState<ActivitySummary | undefined>(undefined);
  // Whether the Logic panel, when open, should reveal + focus its Notes section (toolbar quick-wins
  // U4/A4): only the toolbar **Add note** path sets it, so a canvas "Open logic" / table open lands on
  // Predecessors as before. `setLogicActivity` clears it on any plain open/close; `revealActivityNotes`
  // sets it. Inert (never read) when `VITE_NOTES`/quick-wins are off.
  const [logicRevealNotes, setLogicRevealNotes] = useState(false);
  const setLogicActivity = useCallback((activity: ActivitySummary | undefined) => {
    setLogicRevealNotes(false);
    setLogicActivityState(activity);
  }, []);
  // Toolbar **Add note** (quick-wins F4/U4): open the selected activity's Logic panel AND flag that it
  // should reveal + focus its Notes section — parity with the Comments reveal for plan-level notes.
  const revealActivityNotes = useCallback((activity: ActivitySummary) => {
    setLogicRevealNotes(true);
    setLogicActivityState(activity);
  }, []);
  // The activity targeted by the floating selection bar's Edit / Delete actions (ADR-0031). Held as
  // ids (not the row) so a 409 retry re-derives the current version from the live query — the shared
  // `ActivityCrudDialogs` renders the edit/delete dialogs from these, so the canvas and the table
  // trigger the same host-owned dialogs (ADR-0026 D8: the tsld feature stays dependency-free).
  const [editActivityId, setEditActivityId] = useState<string | null>(null);
  const [deleteActivityId, setDeleteActivityId] = useState<string | null>(null);
  const onEditActivity = useCallback((a: ActivitySummary) => setEditActivityId(a.id), []);
  const onDeleteActivity = useCallback((a: ActivitySummary) => setDeleteActivityId(a.id), []);
  // Plan notes right-side drawer (entry-route win 1, `VITE_ENTRY_ROUTES`): the open flag the toolbar
  // **Comments** button opens (`revealComments` → `setNotesOpen(true)` when the flag is on) and the
  // drawer's Close button clears. Inert when nothing reads it (flag off) — the notes stay inline.
  const [notesOpen, setNotesOpen] = useState(false);
  // The activity targeted by the canvas selection bar's **Resources** action (entry-route win 2,
  // `VITE_ENTRY_ROUTES`) — held as an id (mirroring `editActivityId`) so a refetch re-derives the
  // current row and the dialog closes the moment its target vanishes. Drives the workspace-hosted
  // `ActivityResourcesDialog` (beside the crud dialogs). Inert when nothing reads it (flag off).
  const [resourcesActivityId, setResourcesActivityId] = useState<string | null>(null);
  const onResourcesActivity = useCallback((a: ActivitySummary) => setResourcesActivityId(a.id), []);
  const setResourcesActivity = useCallback(
    (a: ActivitySummary | undefined) => setResourcesActivityId(a?.id ?? null),
    [],
  );
  // The activity targeted by the canvas selection bar's **Steps** action (entry-route, `VITE_ENTRY_ROUTES`
  // + earned-value/steps flags) — held as an id like the crud/resources targets so a refetch re-derives
  // the current row and the dialog closes when it vanishes. Drives the workspace-hosted `ActivityStepsDialog`.
  const [stepsActivityId, setStepsActivityId] = useState<string | null>(null);
  const onStepsActivity = useCallback((a: ActivitySummary) => setStepsActivityId(a.id), []);
  const setStepsActivity = useCallback(
    (a: ActivitySummary | undefined) => setStepsActivityId(a?.id ?? null),
    [],
  );
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
  // The canvas selection bar's **Report progress** action (entry-route, `VITE_ENTRY_ROUTES`) reuses this
  // same `progressActivityId` state the toolbar's Report-progress drives, so both entry points open the
  // ONE workspace-hosted `ActivityProgressDialog` (no second dialog). Stable opener like `onEditActivity`.
  const onProgressActivity = useCallback((a: ActivitySummary) => setProgressActivityId(a.id), []);

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
  // The resolved Resources-dialog target (entry-route win 2), derived from the live query like the
  // progress/edit targets above — so it carries the current row and becomes undefined the moment its
  // activity is deleted, closing the dialog with no extra effect.
  const resourcesActivity = useMemo(
    () =>
      resourcesActivityId
        ? (activities.data ?? []).find((a) => a.id === resourcesActivityId)
        : undefined,
    [resourcesActivityId, activities.data],
  );
  // The resolved Steps-dialog target (entry-route), derived from the live query like the resources/
  // progress targets — closes the dialog the moment its activity is deleted.
  const stepsActivity = useMemo(
    () =>
      stepsActivityId ? (activities.data ?? []).find((a) => a.id === stepsActivityId) : undefined,
    [stepsActivityId, activities.data],
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

  // TSLD finish-edge duration resize (ADR-0052 M2, behind `VITE_CANVAS_DIRECT_MANIPULATION`): the
  // bar-end drag / `Shift+←/→` nudge becomes a `PATCH durationDays` through the SAME single-activity
  // update the reposition path uses — carried as the FULL definition round-trip
  // (`activityDefinitionInput`) so durationType / EV / accrual / constraints are resent verbatim,
  // never silently cleared. Unlike a reposition it does NOT touch the primary constraint or lane.
  // Optimistic-lock 409 and pen-loss 423 reuse the exact reposition contract; the follow-up recalc
  // is the coalesced auto-recalc (or the inline recalc when authoring is off).
  const resizeConflict =
    'This plan changed since you opened it — your resize wasn’t applied. Refresh to see the latest.';
  const onTsldResize = async ({
    activityId,
    durationDays,
  }: TsldResizeInput): Promise<TsldEditOutcome> => {
    const activity = (activities.data ?? []).find((a) => a.id === activityId);
    if (!activity) return { applied: false, conflict: null };
    // Defensive no-op: the gesture/nudge only emit a *changed* duration, but a stale caller must
    // never burn a version bump (and a recalc) on an identical write.
    if (durationDays === activity.durationDays) return { applied: false, conflict: null };
    try {
      const saved = await updateActivity.mutateAsync({
        activityId,
        version: activity.version,
        ...activityDefinitionInput(activity),
        durationDays,
      });
      // Record the resize for undo (ADR-0048) — the single user edit, NOT the follow-up recalc.
      // The inverse restores the pre-edit definition (its prior duration); a drag/held-key burst
      // coalesces to one step (`resize:{id}`). Guarded on the flag so behaviour is unchanged off.
      if (UNDO_REDO_ENABLED) {
        editHistory.record(
          durationResizeCommand({
            update: updateActivity.mutateAsync,
            before: activity,
            after: saved,
          }),
        );
      }
    } catch (err) {
      if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
      if (err instanceof ApiFetchError && err.status === 409) {
        // Stale version — the resize was NOT applied (nothing changed); never re-send.
        return { applied: false, conflict: resizeConflict };
      }
      throw err;
    }
    // The resize landed; a recalc failure is non-fatal (dates stay stale until the next recalc).
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
          'Resized, but the schedule couldn’t recalculate just now. The dates will update after the next recalculation.',
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

  // The live activities held in a ref so `clearVisualPlacement` can read the pre-clear row WITHOUT
  // taking `activities.data` as a dependency — react-query hands a fresh array reference on every
  // recalc, so depending on it would re-identify the callback each recalc cycle and churn the toolbar
  // context memo (which keys on this callback), re-rendering all ~46 toolbar buttons flag-independently
  // (perf review P1). Mirrors the `usePlanAutoRecalc` live-ref precedent.
  const activitiesRef = useRef(activities.data);
  useEffect(() => {
    activitiesRef.current = activities.data;
  });
  // Clear a bar's hand-placed `visualStart` (toolbar quick-wins F5, spec `docs/specs/toolbar-quick-wins/`)
  // — the **Clear visual placement** command. A faithful subset of the reposition VISUAL branch above:
  // the minimal `visualStart: null` PATCH → (flag-guarded) the `visualStartCommand` inverse restoring the
  // prior placement → announce + `autoRecalc.notify()` so the effective-Visual pass re-plots the bar at
  // its computed date. A stale-version 409 surfaces the (announced) conflict non-destructively, and a
  // pen-loss 423 defers to the shared pen banner: either way nothing applied, nothing recorded, never
  // re-sent — exactly like a reposition. It touches only the existing PATCH hook + auto-recalc, so the
  // CPM engine and its recalc parity gate are untouched. Stable identity (the toolbar context memo
  // depends on it): the member handles below are hoisted into stable locals and the pre-clear row is
  // read through `activitiesRef` at call time, so the deps array is all-stable (no eslint-disable).
  const notifyRecalc = autoRecalc.notify;
  const onPenWriteRejected = pen.onWriteRejected;
  const setVisualStartAsync = setVisualStart.mutateAsync;
  const clearVisualPlacement = useCallback(
    async (activityId: string, version: number): Promise<void> => {
      const activity = (activitiesRef.current ?? []).find((a) => a.id === activityId);
      const name = activity?.name ?? 'the activity';
      try {
        const saved = await setVisualStartAsync({ activityId, visualStart: null, version });
        // Record the clear for undo (ADR-0048) — the single user edit, NOT the follow-up recalc. The
        // inverse restores the prior `visualStart` (lane unchanged). Guarded on the flag, like the
        // reposition VISUAL branch — byte-identical when off.
        if (UNDO_REDO_ENABLED) {
          editHistory.record(
            visualStartCommand({
              setVisualStart: setVisualStartAsync,
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
        if (onPenWriteRejected(err).kind === 'lock') return;
        // Stale version — the clear was NOT applied (nothing changed); never re-send, never record.
        // Surface it non-destructively (announced), mirroring the reposition VISUAL branch's conflict
        // path (which shows + announces rather than silently no-op'ing), then stop.
        if (err instanceof ApiFetchError && err.status === 409) {
          announce(
            'This plan changed since you opened it — the visual placement wasn’t cleared. Refresh to see the latest.',
          );
          return;
        }
        throw err;
      }
      // Announce success so the (otherwise-silent) canvas re-plot is reachable to AT (WCAG 4.1.3),
      // matching the reposition VISUAL branch's "dates will update" wording.
      announce(`Cleared the visual placement for “${name}”; dates will update.`);
      notifyRecalc();
    },
    [editHistory, setVisualStartAsync, notifyRecalc, onPenWriteRejected, announce],
  );

  // Compose a **Level of Effort span** from two driver activities (Stage D, spec
  // `docs/specs/canvas-activity-types/`, behind `VITE_CANVAS_ACTIVITY_TYPES`) — the canvas endpoint-pick
  // tool's commit. It reuses the *shipped* LOE type + API (M5-epic, ADR-0035 §21): create a
  // `LEVEL_OF_EFFORT` activity (duration is engine-derived, so `durationDays: 0`) → SS (start → LOE) →
  // FF (LOE → finish), recorded as ONE undoable `createLoeSpanCommand` (undo deletes the LOE, cascading
  // its edges; redo re-composes). It is NON-ATOMIC across three POSTs, so on ANY sub-mutation failure it
  // ROLLS BACK the just-created LOE (delete → cascade removes any partial edge) so no orphan survives,
  // refetches the server truth, and clears the now-untrustworthy redo branch (ADR-0048's conflict
  // contract) — mirroring `onTsldLink`'s non-destructive 409/422 + 423 handling. The engine already
  // produces-and-flags a no-span LOE (N12 `loeNoSpan`), so the no-span case just succeeds. No `HAMMOCK`
  // is ever created — the LOE is the span-derived hammock (Stage D Q1). Only the existing activity +
  // dependency creates run, so the CPM engine and its recalc parity gate are untouched.
  const createLoeSpan = async ({
    startDriverId,
    finishDriverId,
  }: TsldLoeSpanInput): Promise<TsldLoeSpanOutcome> => {
    // Defensive: the tool pre-checks the same-activity case (an LOE can't be its own driver), so this
    // is a no-op guard, never a request.
    if (startDriverId === finishDriverId) return { applied: false, conflict: null };
    const rows = activitiesRef.current ?? [];
    // Place the LOE in its start driver's lane so it appears beside the span it derives from (layout
    // only; the engine owns its dates). Fall back to lane 0 if the driver isn't loaded.
    const laneIndex = rows.find((a) => a.id === startDriverId)?.laneIndex ?? 0;
    const placedInput = {
      name: 'Level of effort',
      type: 'LEVEL_OF_EFFORT' as const,
      durationDays: 0,
      laneIndex,
    };
    // Step 1 — create the LOE. A failure here leaves nothing to roll back.
    let loe: ActivitySummary;
    try {
      loe = await createPlacedActivity.mutateAsync(placedInput);
    } catch (err) {
      if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
      if (err instanceof ApiFetchError && (err.status === 409 || err.status === 422)) {
        onTsldRefresh();
        if (UNDO_REDO_ENABLED) editHistory.clearRedo();
        return { applied: false, conflict: err.error.message };
      }
      throw err;
    }
    // Steps 2 & 3 — the SS + FF edges. Both depend only on the new LOE id (not on each other), so they
    // fire concurrently (`Promise.all`) to save a round-trip. On ANY failure, roll back the LOE (delete
    // cascades any partial edge), refetch, and clear redo — so no orphan LOE with 0/1 edge is ever left
    // behind; `Promise.all` rejects on the first failure but both POSTs have already been dispatched, so
    // the rollback still cleans up a landed edge.
    try {
      await Promise.all([
        createDependency.mutateAsync({
          planId,
          predecessorId: startDriverId,
          successorId: loe.id,
          type: 'SS',
          lagDays: 0,
          lagCalendar: 'PROJECT_DEFAULT',
        }),
        createDependency.mutateAsync({
          planId,
          predecessorId: loe.id,
          successorId: finishDriverId,
          type: 'FF',
          lagDays: 0,
          lagCalendar: 'PROJECT_DEFAULT',
        }),
      ]);
    } catch (err) {
      // Best-effort rollback — a failed delete (e.g. the pen was also lost) still leaves the server to
      // reconcile on refetch; never surface the rollback's own error over the original cause.
      try {
        await deleteActivity.mutateAsync(loe.id);
      } catch {
        /* swallow: the refetch below re-syncs the client to server truth */
      }
      onTsldRefresh();
      if (UNDO_REDO_ENABLED) editHistory.clearRedo();
      if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
      if (err instanceof ApiFetchError && (err.status === 409 || err.status === 422)) {
        return { applied: false, conflict: err.error.message };
      }
      throw err;
    }
    // Record the whole compose as ONE reversible step (ADR-0048) — undo deletes the LOE (cascading its
    // edges); redo re-composes. The single user edit, NOT the follow-up recalc. Guarded on the flag.
    if (UNDO_REDO_ENABLED) {
      editHistory.record(
        createLoeSpanCommand({
          loe,
          placedInput,
          planId,
          startDriverId,
          finishDriverId,
          createPlaced: createPlacedActivity.mutateAsync,
          createDependency: createDependency.mutateAsync,
          deleteActivity: deleteActivity.mutateAsync,
        }),
      );
    }
    // Fire the coalesced auto-recalc so the LOE redraws at its engine-derived span (ADR-0032). A recalc
    // failure is non-fatal — the span persisted; the dates land on the next recalc. This is unconditional
    // because `createLoeSpan` is only reachable when the LOE tool is armed (the Add split-button, hence
    // CANVAS_AUTHORING_ENABLED); `autoRecalc.enabled` is likewise gated on it, so `notifyRecalc` is a
    // no-op otherwise — do NOT "fix" it by flag-guarding here.
    notifyRecalc();
    return { applied: true, conflict: null };
  };

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
    // Schedule interchange export (ADR-0050 M4d) — every member may export (Viewer upward, a read-egress
    // of on-screen schedule data), so this is role-only (NOT pen-gated). Gates the Export menu's
    // "Interchange" group alongside `VITE_SCHEDULE_INTERCHANGE`. Named to match the `canExportSchedule`
    // rbac fn end-to-end. False for a signed-out / unknown role.
    canExportSchedule: canExportSchedule(role),
    // External-Guest share links (ADR-0051 F-M4): who may create/list/revoke a plan's share links —
    // Planner + Org Admin (`plan:share`, a governance act that mints a bearer credential), NOT pen-gated
    // (it grants read access, it doesn't edit the plan). Gates the toolbar Share affordance alongside
    // `VITE_GUEST_SHARE_LINKS`. Named to match the `canSharePlan` rbac fn; false for a signed-out role.
    canShare: canSharePlan(role),
    canManageLogic,
    penReadOnly,
    // Unified auto-recalc (ADR-0032 M3): the manual Recalculate button flushes it; inert flag-off.
    autoRecalc,
    // Local UI state
    editing,
    setEditing,
    // Resource-view lens (Stage E, ADR-0049): the ephemeral open flag + toggle the `resource-view`
    // toolbar item drives; the workspace mounts the `ResourceStripPanel` + strip band when open. Inert
    // unless `VITE_CANVAS_RESOURCE_VIEW` is on (the item is its placeholder otherwise).
    resourceViewOpen,
    toggleResourceView,
    // Over-allocation highlight (Stage E M2): the ephemeral mode flag + toggle the `over-allocation`
    // toolbar item drives; TsldPanel flags the over-allocated bars when on. Inert unless
    // `VITE_CANVAS_RESOURCE_VIEW` is on (the item is its placeholder otherwise).
    overAllocationHighlight,
    toggleOverAllocation,
    logicActivity,
    setLogicActivity,
    // Whether the open Logic panel should reveal its Notes section (toolbar quick-wins U4/A4) + the
    // toolbar **Add note** opener that sets it. Inert unless `VITE_NOTES`/quick-wins are on.
    logicRevealNotes,
    revealActivityNotes,
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
    // Plan notes right-side drawer (entry-route win 1, `VITE_ENTRY_ROUTES`): the open flag +
    // setter the toolbar Comments button and the drawer's Close control drive. Inert flag-off.
    notesOpen,
    setNotesOpen,
    // Resources dialog target from the canvas selection bar (entry-route win 2, `VITE_ENTRY_ROUTES`):
    // the opener + the resolved row + the close setter. `resourcesActivity` re-derives from the live
    // query, so it closes the dialog when the row is deleted. Inert flag-off.
    onResourcesActivity,
    resourcesActivity,
    setResourcesActivity,
    // Report-progress opener from the canvas selection bar (entry-route) — reuses `progressActivityId`
    // so it opens the ONE workspace-hosted `ActivityProgressDialog`. Inert flag-off.
    onProgressActivity,
    // Steps dialog target from the canvas selection bar (entry-route + earned-value/steps flags): the
    // opener + resolved row + close setter, mirroring the resources trio. Inert flag-off.
    onStepsActivity,
    stepsActivity,
    setStepsActivity,
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
    // Finish-edge duration resize (ADR-0052 M2, `VITE_CANVAS_DIRECT_MANIPULATION`) — the
    // full-definition durationDays PATCH + coalesced recalc + coalesced undo.
    onTsldResize,
    onTsldLink,
    onTsldAutoArrange,
    onTsldRefresh,
    // Compose a Level of Effort span from two driver activities (Stage D, `VITE_CANVAS_ACTIVITY_TYPES`)
    // — reuses the shipped LOE type/API; one undoable action with rollback-on-partial-failure.
    createLoeSpan,
  };
}

export type PlanWorkspaceModel = ReturnType<typeof usePlanWorkspaceModel>;

/** The plan detail, narrowed to loaded — the screen guards pending/error before rendering a layout. */
export type LoadedPlan = NonNullable<PlanWorkspaceModel['plan']['data']>;
