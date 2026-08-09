import type { ActivitySummary, BaselineVarianceRow, DependencySummary } from '@repo/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import {
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED,
  ACTIVITY_EDITOR_TABS_ENABLED,
  CANVAS_AUTHORING_ENABLED,
  CANVAS_TIME_AXIS_ENABLED,
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
  useBatchPlacements,
  useDeleteActivity,
  useBulkDeleteActivities,
  useRestoreDeleteBatch,
  isMilestoneType,
} from '@/features/activities';
// Deep import, deliberately (the `@/features/navigator/lib` precedent): these are pure, dependency-
// free helpers, and the activities barrel pulls the whole data layer with it — which is exactly why
// a dozen workspace tests replace that barrel wholesale. Routing pure logic through a mocked module
// would have those tests exercising a stub of the gate this epic exists to get right.
import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';
import {
  openActivityEditor,
  type ActivityEditorIntent,
} from '@/features/activities/lib/activity-editor-intent';
import {
  bandCopyConfirmation,
  bandMembers,
  MAX_CLONE_ASSIGNMENT_COUNT,
  missingNote,
  planClone,
  refusalMessage,
  resolveClipboard,
  type BandCopyCopy,
  type ClipboardContents,
  type CloneRefusal,
} from '@/features/activity-copy';
import { useCreateClonedActivity } from '@/features/activity-copy/api/use-clone-activities';
import {
  useCloneCarriage,
  type SkippedAssignment,
} from '@/features/activity-copy/api/use-clone-carriage';
import { useSession } from '@/features/auth';
import { useBaselineVariance } from '@/features/baselines';
import { useCalendar, usePlanScopedCalendars } from '@/features/calendars';
import { useClient } from '@/features/clients';
import {
  useCreateDependency,
  useDeleteDependency,
  usePlanDependencies,
  useUpdateDependency,
} from '@/features/dependencies';
import { useFloatPathsPanel } from '@/features/float-paths';
import { useActivityNoteCounts } from '@/features/notes';
import { derivePlanGating, scheduleRefusal, usePlanPen } from '@/features/plan-lock';
import { usePlan } from '@/features/plans';
import { useProject } from '@/features/projects';
import { useRecalculate, usePlanAutoRecalc } from '@/features/schedule';
import {
  addCalendarDays,
  todayDayFraction,
  useCoalescedLagNudge,
  useNow,
  type TsldCreateInput,
  type TsldCreateOutcome,
  type TsldLinkInput,
  type TsldLinkOutcome,
  type TsldLoeSpanInput,
  type TsldLoeSpanOutcome,
  type TsldLagInput,
  type TsldRepositionInput,
  type TsldRepositionOutcome,
  type TsldResizeInput,
  type TsldEditOutcome,
} from '@/features/tsld';
import { bulkMoveSnapshots, isLaneOnly, isNoOp } from '@/features/tsld/model/bulk-move';
import {
  activityDefinitionInput,
  autoArrangeCommand,
  bulkDeleteCommand,
  bulkPlacementCommand,
  createActivityCommand,
  createLoeSpanCommand,
  pasteActivitiesCommand,
  deleteActivityCommand,
  dependencyAddCommand,
  dependencyRemoveCommand,
  durationResizeCommand,
  lagDragCommand,
  relaneCommand,
  repositionCommand,
  updateCommand,
  visualResizeCommand,
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
 * What a duplicate attempt did. Three distinguishable outcomes, because a planner needs to know
 * which happened: a **refusal** (a pre-check said no before any write), a **conflict** (the server
 * rejected the write and the copy was rolled back), and success.
 */
/**
 * The stale-version sentence for a move, shared by the single-bar drag and the plural one.
 *
 * At module scope because the plural path lives in a memo declared **above** where this used to sit
 * as a `const` inside the hook — which was the stated reason the plural path did no conflict
 * handling at all. Hoisting a string is the whole of that obstacle, and one sentence in two places
 * is how the same refusal comes to read differently depending on how many bars you dragged.
 */
const MOVE_CONFLICT =
  'This plan changed since you opened it — your move wasn’t applied. Refresh to see the latest.';

export interface DuplicateOutcome {
  readonly applied: boolean;
  /** Set when a pre-check refused. Carries the numbers/names a message needs to be specific. */
  readonly refusal: CloneRefusal | null;
  /** Set when the server rejected a write (409/422); the copy has already been rolled back. */
  readonly conflict: string | null;
  readonly createdIds?: readonly string[];
  /**
   * Assignments the copy could not take because their resource is archived (M4, ADR-0053 §4).
   *
   * Not an error — the copy succeeded — but not silence either: the source keeps a live assignment
   * the clone is refused, so a planner who is not told ends up with a copy that is quietly
   * short-crewed. Named per activity so the message can say which work lost which resource.
   */
  readonly skippedAssignments?: readonly SkippedAssignment[];
}

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
  const penHolder = pen.status?.holder ?? null;
  const refuseSchedule = useCallback(
    (action: string) => scheduleRefusal({ canEditSchedule, penReadOnly }, penHolder, action),
    [canEditSchedule, penReadOnly, penHolder],
  );
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
  // The activity targeted by the floating selection bar's Edit / Delete actions (ADR-0031). Held as
  // ids (not the row) so a 409 retry re-derives the current version from the live query — the shared
  // `ActivityCrudDialogs` renders the edit/delete dialogs from these, so the canvas and the table
  // trigger the same host-owned dialogs (ADR-0026 D8: the tsld feature stays dependency-free).
  const [editActivityId, setEditActivityId] = useState<string | null>(null);
  const [deleteActivityId, setDeleteActivityId] = useState<string | null>(null);
  const onDeleteActivity = useCallback((a: ActivitySummary) => setDeleteActivityId(a.id), []);

  // The summary targeted by **Dissolve** (WBS improvements M2). Deliberately its own state rather
  // than a mode on `deleteActivityId`: the two confirmations say opposite things about the work
  // underneath, and sharing one slot is how they would end up sharing one sentence.
  const [dissolveActivityId, setDissolveActivityId] = useState<string | null>(null);
  const onDissolveSummary = useCallback((a: ActivitySummary) => setDissolveActivityId(a.id), []);
  // The summary targeted by **Duplicate band** (`docs/specs/activity-copy-paste/` M2). Its own
  // state for the same reason Dissolve has its own: the two confirmations describe opposite fates
  // for the work underneath, and one slot is how they would end up sharing one sentence.
  const [duplicateBandId, setDuplicateBandId] = useState<string | null>(null);
  const onDuplicateBand = useCallback((a: ActivitySummary) => setDuplicateBandId(a.id), []);
  /**
   * An activity the canvas should select and scroll to, set by a completed duplicate or paste.
   *
   * A **one-shot request** rather than a mirror of the selection: the canvas owns its selection and
   * reports it outward (`onSelectionChange`), so a second inbound source of truth would fight it —
   * every arrow-key move would be pulled back. The panel clears this the moment it honours it.
   */
  const [revealActivityId, setRevealActivityId] = useState<string | null>(null);
  const onRevealHandled = useCallback(() => setRevealActivityId(null), []);
  /**
   * The tabbed editor's open intent (ADR-0060 §7, M5) — the ONE piece of state the three entry
   * points (**Edit**, **Report progress**, **Steps**) now share, replacing the three that could
   * drift. `null` ⇒ closed. Flag-off it is never set: each opener below falls back to the legacy
   * per-dialog state, so the old surface is byte-for-byte what it was.
   */
  const [editorIntent, setEditorIntent] = useState<ActivityEditorIntent | null>(null);
  const onEditActivity = useCallback(
    (a: ActivitySummary) =>
      ACTIVITY_EDITOR_TABS_ENABLED
        ? setEditorIntent(openActivityEditor(a, 'edit'))
        : setEditActivityId(a.id),
    [],
  );
  // The **Logic** entry point, shared by the canvas selection bar, the canvas keyboard (Enter on a
  // focused bar), the row menu and the bottom panel. Flag-on it opens the editor's Logic tab
  // instead of a dialog of its own (the convergence epic); flag-off it is `setLogicActivity`, which
  // is what every host called directly before — the same conditional shape `onEditActivity` uses.
  const onOpenLogic = useCallback(
    (a: ActivitySummary) =>
      ACTIVITY_EDITOR_CONVERGENCE_ENABLED
        ? setEditorIntent(openActivityEditor(a, 'logic'))
        : setLogicActivity(a),
    [setLogicActivity],
  );
  // Toolbar **Add note** (quick-wins F4/U4): open the selected activity's Logic panel AND flag that it
  // should reveal + focus its Notes section — parity with the Comments reveal for plan-level notes.
  // Flag-on there is nothing to reveal: **Add note** opens the editor's Notes tab, which IS the
  // notes surface. Flag-off it keeps the scroll-and-focus plumbing, which is still the only way to
  // reach a section buried three panels down the Logic dialog.
  const revealActivityNotes = useCallback((activity: ActivitySummary) => {
    if (ACTIVITY_EDITOR_CONVERGENCE_ENABLED) {
      setEditorIntent(openActivityEditor(activity, 'notes'));
      return;
    }
    setLogicRevealNotes(true);
    setLogicActivityState(activity);
  }, []);
  // Plan notes right-side drawer (entry-route win 1, `VITE_ENTRY_ROUTES`): the open flag the toolbar
  // **Comments** button opens (`revealComments` → `setNotesOpen(true)` when the flag is on) and the
  // drawer's Close button clears. Inert when nothing reads it (flag off) — the notes stay inline.
  const [notesOpen, setNotesOpen] = useState(false);
  // The activity targeted by the canvas selection bar's **Resources** action (entry-route win 2,
  // `VITE_ENTRY_ROUTES`) — held as an id (mirroring `editActivityId`) so a refetch re-derives the
  // current row and the dialog closes the moment its target vanishes. Drives the workspace-hosted
  // `ActivityResourcesDialog` (beside the crud dialogs). Inert when nothing reads it (flag off).
  const [resourcesActivityId, setResourcesActivityId] = useState<string | null>(null);
  // Flag-on, **Resources** is a tab of the one editor rather than a dialog of its own — the same
  // shape as `onEditActivity` / `onOpenLogic`. Flag-off it still drives the workspace-hosted
  // `ActivityResourcesDialog` below.
  const onResourcesActivity = useCallback(
    (a: ActivitySummary) =>
      ACTIVITY_EDITOR_CONVERGENCE_ENABLED
        ? setEditorIntent(openActivityEditor(a, 'resources'))
        : setResourcesActivityId(a.id),
    [],
  );
  const setResourcesActivity = useCallback(
    (a: ActivitySummary | undefined) => setResourcesActivityId(a?.id ?? null),
    [],
  );
  // The activity targeted by the canvas selection bar's **Steps** action (entry-route, `VITE_ENTRY_ROUTES`
  // + earned-value/steps flags) — held as an id like the crud/resources targets so a refetch re-derives
  // the current row and the dialog closes when it vanishes. Drives the workspace-hosted `ActivityStepsDialog`.
  const [stepsActivityId, setStepsActivityId] = useState<string | null>(null);
  // Flag-on, **Steps** is no longer a dialog of its own: it opens the editor's Progress tab with
  // focus on the Weighted-steps panel, beside the physical % it overrides (ADR-0060 §7).
  const onStepsActivity = useCallback(
    (a: ActivitySummary) =>
      ACTIVITY_EDITOR_TABS_ENABLED
        ? setEditorIntent(openActivityEditor(a, 'steps'))
        : setStepsActivityId(a.id),
    [],
  );
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
  // The canvas's PLURAL selection, lifted for `Ctrl+C` (`docs/specs/activity-copy-paste/` M3). Held
  // in a ref rather than state: its only consumer is a keydown handler, so storing it in state would
  // re-render the whole workspace on every selection transition — including marquee drags, which
  // emit one per frame — to feed something that reads it lazily and renders nothing.
  const pluralSelectionRef = useRef<readonly string[]>([]);
  const onPluralSelectionChange = useCallback((ids: readonly string[]) => {
    pluralSelectionRef.current = ids;
  }, []);
  // The app clipboard (M3). A ref for the same reason: nothing renders from it, and re-rendering the
  // workspace on a copy would be a visible cost for an invisible change. Cleared on plan switch —
  // the ADR-0048 history lifetime, mirrored deliberately rather than coincidentally.
  const clipboardRef = useRef<ClipboardContents | null>(null);
  useEffect(() => {
    clipboardRef.current = null;
  }, [planId]);
  // The activity targeted by the toolbar's **Update progress…** action (F3), driving the
  // workspace-hosted `ActivityProgressDialog` (beside `ActivityCrudDialogs`). Held as an id like the
  // crud dialogs so a 409 retry re-derives the current version; the derived row (below) closes the
  // dialog when its target vanishes.
  const [progressActivityId, setProgressActivityId] = useState<string | null>(null);
  // The canvas selection bar's **Report progress** action (entry-route, `VITE_ENTRY_ROUTES`) reuses this
  // same `progressActivityId` state the toolbar's Report-progress drives, so both entry points open the
  // ONE workspace-hosted `ActivityProgressDialog` (no second dialog). Stable opener like `onEditActivity`.
  // Flag-on, both entry points open the editor's Progress tab instead — where the reported % sits
  // beside the measure it does NOT control (ADR-0060 §7).
  const onProgressActivity = useCallback(
    (a: ActivitySummary) =>
      ACTIVITY_EDITOR_TABS_ENABLED
        ? setEditorIntent(openActivityEditor(a, 'progress'))
        : setProgressActivityId(a.id),
    [],
  );

  const plan = usePlan(orgSlug, planId);
  const project = useProject(orgSlug, plan.data?.projectId ?? '');
  const client = useClient(orgSlug, project.data?.clientId ?? '');
  // Shares the activities cache with the table (same query key); used to populate the
  // logic-editor's add picker and the TSLD canvas.
  const activities = useActivities(orgSlug, planId);
  // The plan's dependency edges — drawn as logic lines on the TSLD canvas.
  const dependencies = usePlanDependencies(orgSlug, planId);
  // The calendars offered by the plan and activity calendar pickers (read for every member). Flag
  // off this is the org library exactly as before; behind `VITE_LIBRARY_SCOPING` it becomes the set
  // usable in this plan's PROJECT — its own calendars plus every organisation one (ADR-0053 §1),
  // which is precisely what the API's write guard accepts here. The switch lives in the calendars
  // feature; this composer only supplies the project.
  const calendars = usePlanScopedCalendars(orgSlug, plan.data?.projectId ?? '');
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
  // the diagram does no wall-clock math. `useNow` (F6c, `VITE_CANVAS_TIME_AXIS`) bumps a counter
  // every 60s (paused while the tab is hidden) so this — and `todayFraction` below — re-derive
  // instead of freezing at whatever instant the plan happened to mount, which is what made the
  // pre-existing integer marker go stale across a session left open past midnight.
  useNow(60_000);
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // The viewer-local time-of-day fraction (F6a) — undefined when the flag is off, which is what
  // keeps the Today marker at its plain integer offset (byte-for-byte parity) downstream.
  const todayFraction = CANVAS_TIME_AXIS_ENABLED
    ? todayDayFraction(now.getTime(), now.getTimezoneOffset())
    : undefined;
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

  /**
   * The tabbed editor's per-scope write gate (ADR-0060 §6), derived **once** here and handed to
   * every host — the workspace's editor and both `ActivitiesTable` mounts. That is the point: the
   * role/pen split cannot be reconstructed from `canEditSchedule` alone (it has already fused the
   * two), so a host given only that boolean would have to guess which sentence to show, and would
   * eventually guess differently from its sibling. Deriving it where both inputs still exist makes
   * the divergence impossible rather than merely unlikely.
   */
  const activityEditorGating = useMemo(
    () =>
      deriveActivityEditorGating({
        penManaged: pen.penManaged,
        holdsPen: pen.holdsPen,
        canWrite,
        canProgress,
        // Client-derived from the role, because the DTO returns `null` for both "unset" and "not
        // permitted" (TECH_DEBT #62). Sound while `cost:read` and `activity:update` share a role set.
        canReadCost: canWrite,
        // Who holds the pen, when it is not this reader (`docs/TECH_DEBT.md` #115). Without it the
        // refusal says "Start editing to …" to somebody whose screen shows **Request control** and
        // no Start-editing button — naming a control they do not have. The pen layer already knows
        // (`lock-view.ts` reads the same `status.holder`), so this is threading, not new data.
        holder: pen.status?.holder ?? null,
      }),
    [pen.penManaged, pen.holdsPen, canWrite, canProgress, pen.status?.holder],
  );

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
  // **Float paths** (audit F4, `VITE_FLOAT_PATHS`) — the ranked driving chains into one activity.
  // Hosted here rather than in either view because the emphasis id-set it derives is handed to BOTH
  // the canvas and the Gantt: two derivations of "which activities are on the path" would differ
  // eventually, and only in a screenshot or a printed programme (the ADR-0063 `wbs-band-source`
  // rule). Its query is `enabled`-gated on the panel being open with a target, so a closed panel
  // costs nothing — this endpoint runs a full `computeSchedule` per request.
  const floatPaths = useFloatPathsPanel({
    orgSlug,
    planId,
    activities: activities.data ?? [],
    planCalendarId: plan.data?.calendarId ?? null,
    calendars: calendars.data ?? [],
    selectedActivityId,
  });

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
  const bulkDeleteActivities = useBulkDeleteActivities(orgSlug, planId);
  const restoreDeleteBatch = useRestoreDeleteBatch(orgSlug, planId);
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
  /**
   * Bumped when a recalculation hold expires (ADR-0064 T7) — the canvas drops any open link pick,
   * because the bars are about to move and a pick taken against the old positions is no longer the
   * pick the planner made. A counter rather than a boolean: the canvas needs "this is a new
   * request", not "a request is outstanding".
   */
  const [dropLinkPickSignal, setDropLinkPickSignal] = useState(0);
  const autoRecalc = usePlanAutoRecalc(orgSlug, planId, {
    enabled: CANVAS_AUTHORING_ENABLED && canRecalc && plan.data?.plannedStart != null,
    onMessage: announce,
    onHoldExpired: () => {
      setDropLinkPickSignal((n) => n + 1);
      announce(
        'Schedule recalculated — the unfinished link was dropped. Pick the predecessor again.',
      );
    },
  });
  // Any structural edit — from the canvas, the activities table, or the logic editor — should
  // auto-recalc. Watching only the row *count* misses in-place edits that change the schedule
  // without adding/removing a row (a duration or constraint edit from the table — ux review), so we
  // key on a **scheduling-input signature**: each activity's duration/type/constraint/WBS-parent and
  // each dependency's type/lag. `parentId` is included because reparenting to (or out of) a
  // WBS_SUMMARY changes that summary's rollup dates, which are themselves engine-computed — without
  // this a WBS reassignment would silently never auto-recalc. Crucially this excludes the engine-
  // *computed* fields (early/late dates, floats, critical) that a recalc writes back, so a settled
  // recalc never re-triggers `notify()` — no loop. Layout-only `laneIndex` is excluded too (a lane
  // move needs no recalc; the canvas path already skips it). The canvas reposition/link callbacks
  // still `notify()` explicitly, which just coalesces with this. Baseline is taken on the first
  // *loaded* (non-pending) observation, so opening a plan never fires a gratuitous recalc.
  const structureSignature = useMemo(() => {
    const acts = (activities.data ?? [])
      .map(
        (a) =>
          `${a.id}:${a.type}:${a.durationDays}:${a.constraintType ?? ''}:${a.constraintDate ?? ''}:${a.parentId ?? ''}`,
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
  const createClone = useCreateClonedActivity(orgSlug, planId);
  const cloneCarriage = useCloneCarriage(orgSlug);
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

  /**
   * The three bulk operations the canvas's plural selection offers
   * (`docs/specs/canvas-multi-select/` M4).
   *
   * Assembled HERE rather than in the panel because this is where the mutations and the ADR-0048
   * command stack already live; `features/tsld` imports no other feature (ADR-0026 D8) and takes
   * these as plain async functions.
   *
   * The gate is `canEditSchedule` — the same fused role+pen boolean every other authoring action
   * uses — with `penReadOnly` deciding which of the two sentences to show. A gate assembled a
   * second way here would eventually disagree with the toolbar beside it about whether the same
   * planner may write.
   */
  // The four mutations the memo below closes over, taken as plain functions FIRST.
  // `exhaustive-deps` reports the whole mutation object as missing when the same `.mutateAsync` is
  // read from more than one nested closure in a single memo — and depending on the objects would
  // rebuild this on every render, since `useMutation` returns a fresh result each time. Naming the
  // functions removes the member expression, so the deps say exactly what the memo actually uses.
  const batchPlacementsMutation = useBatchPlacements(orgSlug, planId);
  const bulkDelete = bulkDeleteActivities.mutateAsync;
  const restoreBatch = restoreDeleteBatch.mutateAsync;
  const createLink = createDependency.mutateAsync;
  // Taken as a plain function for the same `exhaustive-deps` reason as its siblings above.
  const batchPlacements = batchPlacementsMutation.mutateAsync;
  const removeLink = deleteDependency.mutateAsync;
  // Declared here, above the memo that depends on it: `moveMany` must write the field the plan's
  // CURRENT mode calls for, and a memo cannot list a binding declared below itself.
  const isVisualMode = SCHEDULING_MODES_ENABLED && plan.data?.schedulingMode === 'VISUAL';
  // Destructured, not reached through `pen`, so the memo depends on the stable `useCallback` rather
  // than on the pen object — which is rebuilt on every 15-second status poll and would otherwise
  // rebuild every callback the canvas holds, four times a minute, for nothing.
  const { onWriteRejected } = pen;
  const bulkOperations = useMemo(
    () => ({
      gate: {
        writable: canEditSchedule,
        reason: canEditSchedule
          ? null
          : penReadOnly
            ? 'Take the edit lock to change this plan.'
            : 'You don’t have permission to change this plan.',
      },
      deleteMany: async (rows: readonly ActivitySummary[]): Promise<void> => {
        if (rows.length === 0) return;
        const activities = rows.map((a) => ({ id: a.id, version: a.version }));
        const result = await bulkDelete({ activities });
        // ONE reversible step for the whole gesture, and its undo is the id-stable batch restore
        // (CQ-4) — re-creating N activities would silently lose the links BETWEEN them.
        if (UNDO_REDO_ENABLED) {
          editHistory.record(
            bulkDeleteCommand({
              bulkDelete: bulkDelete,
              restoreBatch: restoreBatch,
              activities,
              deleteBatchId: result.deleteBatchId,
            }),
          );
        }
        autoRecalc.notify();
      },
      /**
       * Move every selected activity by one delta — ONE batch write, ONE undoable step
       * (`docs/TECH_DEBT.md` #108).
       *
       * Every piece below this shipped with ADR-0080 and had **no caller**: `bulkMoveSnapshots`
       * builds the before/after and the version map, `useBatchPlacements` sends the single
       * `PATCH …/activities/placements`, and `bulkPlacementCommand` makes the pair reversible. The
       * gesture kept moving one bar, so the data layer was correct and unreachable.
       *
       * Mode-aware through `bulkMoveSnapshots`, never inline: the single-bar drag branches on the
       * plan's scheduling mode (EARLY pins an SNET, VISUAL writes `visualStart`), and doing that
       * branch a second time here is how the two come to disagree — invisibly, because each looks
       * right alone and only a planner who moved one bar and then twelve would ever see it.
       */
      moveMany: async (
        rows: readonly ActivitySummary[],
        delta: { dayDelta: number; laneDelta: number },
      ): Promise<{ conflict: string | null }> => {
        if (rows.length === 0 || isNoOp(delta)) return { conflict: null };
        const { before, after, versions } = bulkMoveSnapshots({
          activities: rows,
          delta,
          mode: isVisualMode ? 'visual' : 'early',
        });
        // Hold the coalesced recalculation across the write so the bars cannot move under the
        // planner mid-batch, released in `finally` — a leaked hold stalls every later
        // recalculation for the session with no error and no surface (ADR-0064).
        const holdToken = Symbol('bulk-move');
        autoRecalc.hold(holdToken);
        try {
          const saved = await batchPlacements({
            placements: after.flatMap((placement) => {
              const version = versions.get(placement.id);
              return version === undefined ? [] : [{ ...placement, version }];
            }),
          });
          for (const row of saved) versions.set(row.id, row.version);
          if (UNDO_REDO_ENABLED) {
            editHistory.record(
              bulkPlacementCommand({
                batchPlacements,
                before,
                after,
                versions,
                label:
                  rows.length === 1 && rows[0] !== undefined
                    ? `Move \u201c${rows[0].name}\u201d`
                    : `Move ${String(rows.length)} activities`,
              }),
            );
          }
        } catch (err) {
          // **The same refusals the single-bar drag already handles**, and for the same reasons.
          // This block replaced a comment claiming pen handling was impossible here "because both
          // are declared after this memo". Half of that was false and it was the load-bearing
          // half: `pen` is declared at the top of this hook, hundreds of lines ABOVE this memo —
          // only the sentence was below, and a string constant hoists. Skipping `onWriteRejected`
          // meant a peer taking the pen mid-drag left the client's pen state stale until the next
          // 15-second poll, on the one gesture that moves a dozen bars at once. Checked, not
          // reasoned about (ADR-0076): the declaration order is the first thing this file shows.
          if (onWriteRejected(err).kind === 'lock') return { conflict: null };
          if (err instanceof ApiFetchError && err.status === 409)
            return { conflict: MOVE_CONFLICT };
          throw err;
        } finally {
          // Released on every path including a throw — a leaked hold stalls every later
          // recalculation for the session, with no error and no surface (ADR-0064).
          autoRecalc.release(holdToken);
        }
        // A lane-only move changes no date, so it needs no recalculation — the same minimal-write
        // rule the single-bar drag already follows.
        if (!isLaneOnly(delta)) autoRecalc.notify();
        return { conflict: null };
      },
      linkChain: async (
        edges: readonly { predecessorId: string; successorId: string }[],
      ): Promise<void> => {
        // Sequential, and rolled back as a set. There is no batch dependency endpoint, so a
        // mid-loop failure would otherwise leave a partial chain — half a sequence is worse than
        // none, because the plan then looks finished (the `createLoeSpanCommand` precedent).
        const created: string[] = [];
        try {
          for (const edge of edges) {
            const dependency = await createLink({
              planId,
              predecessorId: edge.predecessorId,
              successorId: edge.successorId,
              type: 'FS',
              lagDays: 0,
              lagCalendar: 'PROJECT_DEFAULT',
            });
            created.push(dependency.id);
          }
        } catch (error) {
          for (const id of created.reverse()) {
            // Best-effort: a failed rollback leaves edges the planner can delete, whereas throwing
            // here would replace the real error with a second one and tell them nothing useful.
            await removeLink(id).catch(() => undefined);
          }
          throw error;
        }
        if (UNDO_REDO_ENABLED && created.length > 0) {
          editHistory.record({
            label: `Link ${created.length} activities in sequence`,
            undo: async () => {
              for (const id of [...created].reverse()) await removeLink(id);
            },
            redo: async () => {
              // A redo creates NEW edges, so the ids the undo will need are re-threaded here — the
              // same rule as `bulkDeleteCommand`'s batch id, for the same reason.
              created.length = 0;
              for (const edge of edges) {
                const dependency = await createLink({
                  planId,
                  predecessorId: edge.predecessorId,
                  successorId: edge.successorId,
                  type: 'FS',
                  lagDays: 0,
                  lagCalendar: 'PROJECT_DEFAULT',
                });
                created.push(dependency.id);
              }
            },
          });
        }
        autoRecalc.notify();
      },
    }),
    [
      canEditSchedule,
      penReadOnly,
      bulkDelete,
      restoreBatch,
      createLink,
      removeLink,
      editHistory,
      autoRecalc,
      planId,
      // `moveMany`'s six. `isVisualMode` is the one that matters: without it the memo would keep
      // a stale mode and a plural move on a plan switched to Visual would go on writing SNET
      // constraints — wrong dates, silently, on exactly the plans where placement is hand-made.
      //
      // `pen.onWriteRejected` and not `pen`: the whole object is rebuilt on every status poll, so
      // depending on it would rebuild this memo — and every callback the canvas holds — four times a
      // minute for no reason. The function itself is a `useCallback` over
      // `[acknowledgeLost, queryClient, orgSlug, planId]`, checked rather than assumed.
      batchPlacements,
      isVisualMode,
      onWriteRejected,
    ],
  );

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
  /**
   * Record a summary **dissolve** as a non-undoable boundary (WBS improvements M2). Dissolve is one
   * server-side compound — reparent every child, then soft-delete the summary — and the client has no
   * inverse it can compose from the existing mutations: re-creating the summary yields a NEW id, so
   * "undo" would rebuild a different grouping and leave the original in Recently deleted. That is a
   * worse outcome than no undo, so this **truncates** the history exactly as a cascade delete does.
   * A no-op unless `VITE_UNDO_REDO` is on.
   */
  const recordDissolveBoundary = useCallback((): void => {
    if (!UNDO_REDO_ENABLED) return;
    editHistory.clear();
  }, [editHistory]);
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
  // Record a dependency ADD on the undo stack (ADR-0048 M2), the mirror of `recordDependencyRemove`.
  // Called by the Logic panel after a successful add — the canvas link path records its own inline
  // (there is no shared code path, so there is no double-count; a test asserts exactly one command
  // per add). Undoing an add was asymmetric until this: removing a link from the panel could be
  // undone, adding one could not.
  const recordDependencyAdd = useCallback(
    (dependency: DependencySummary): void => {
      if (!UNDO_REDO_ENABLED) return;
      editHistory.record(
        dependencyAddCommand({
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
          return { applied: false, conflict: MOVE_CONFLICT };
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
          // The exact stored minutes (ADR-0070) — resending the ROUNDED day here silently
          // flattened a sub-day activity to zero on every canvas move.
          duration: String(activity.durationDays),
          durationMinutes: activity.durationMinutes,
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
        return { applied: false, conflict: MOVE_CONFLICT };
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

  // TSLD bar-end resize (ADR-0052 M2 finish edge, M3 start edge, behind
  // `VITE_CANVAS_DIRECT_MANIPULATION`). **Finish edge** (`startDay` absent): the drag / `Shift+←/→`
  // nudge becomes a `PATCH durationDays` through the SAME single-activity update the reposition
  // path uses — carried as the FULL definition round-trip (`activityDefinitionInput`) so
  // durationType / EV / accrual / constraints are resent verbatim, never silently cleared; it does
  // NOT touch the primary constraint or lane. **Start edge** (`startDay` present): move the start,
  // keep the finish — mode-aware (ADR-0052 §3): EARLY imposes an SNET at the new start (the same
  // constraint expression a reposition writes) PLUS the new duration in the one full-definition
  // PATCH; VISUAL hand-places `visualStart` + the new duration through the minimal
  // `setVisualStart` PATCH (the reposition-in-VISUAL seam — no constraint write, no definition
  // resend). Optimistic-lock 409 and pen-loss 423 reuse the exact reposition contract; the
  // follow-up recalc is the coalesced auto-recalc (or the inline recalc when authoring is off).
  const resizeConflict =
    'This plan changed since you opened it — your resize wasn’t applied. Refresh to see the latest.';
  const onTsldResize = async ({
    activityId,
    durationDays,
    startDay,
  }: TsldResizeInput): Promise<TsldEditOutcome> => {
    const activity = (activities.data ?? []).find((a) => a.id === activityId);
    if (!activity) return { applied: false, conflict: null };
    // Defensive no-op (finish edge): the gesture/nudge only emit a *changed* duration, but a stale
    // caller must never burn a version bump (and a recalc) on an identical write. A start-edge
    // drag always moves the start (the gesture selects instead when nothing changed).
    if (startDay === undefined && durationDays === activity.durationDays) {
      return { applied: false, conflict: null };
    }
    const plannedStart = plan.data?.plannedStart;
    if (startDay !== undefined && !plannedStart) return { applied: false, conflict: null };
    try {
      if (startDay !== undefined && isVisualMode) {
        // VISUAL start-edge: hand-place the new start + duration in ONE minimal PATCH — the
        // effective-Visual pass then pins the bar (ADR-0033), exactly like a reposition drop.
        const saved = await setVisualStart.mutateAsync({
          activityId,
          visualStart: addCalendarDays(plannedStart!, startDay),
          durationDays,
          version: activity.version,
        });
        // Record for undo (ADR-0048): the inverse restores the prior `visualStart` AND duration
        // through the same seam; a drag burst coalesces to one step (`resize:{id}`).
        if (UNDO_REDO_ENABLED) {
          editHistory.record(
            visualResizeCommand({
              setVisualStart: setVisualStart.mutateAsync,
              before: activity,
              after: saved,
            }),
          );
        }
      } else {
        const saved = await updateActivity.mutateAsync({
          activityId,
          version: activity.version,
          ...activityDefinitionInput(activity),
          // EARLY start-edge (ADR-0052 §3): the start is computed, so the moved edge is pinned as
          // an SNET at the new start — mirroring how a reposition builds its SNET payload — and
          // the duration shrinks/grows so the finish stays put. A finish-edge resize spreads
          // neither field, leaving the stored constraint round-tripped verbatim.
          ...(startDay !== undefined
            ? {
                constraintType: 'SNET' as const,
                constraintDate: addCalendarDays(plannedStart!, startDay),
              }
            : {}),
          // The resize is a DAY drag on a day-scaled diagram, so it sets days — and takes
          // precedence over the exact-minutes round-trip the spread above carries (ADR-0070).
          durationDays,
        });
        // Record the resize for undo (ADR-0048) — the single user edit, NOT the follow-up recalc.
        // The inverse restores the whole pre-edit definition (its prior duration AND, for a
        // start-edge drag, its prior constraint); a drag/held-key burst coalesces to one step
        // (`resize:{id}`). Guarded on the flag so behaviour is unchanged off.
        if (UNDO_REDO_ENABLED) {
          editHistory.record(
            durationResizeCommand({
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

  // TSLD lag-anchor drag (ADR-0052 M3, behind `VITE_CANVAS_DIRECT_MANIPULATION`): the dragged (or
  // Logic-panel-nudged) lag becomes a `PATCH /dependencies/:id` echoing the row's unchanged type +
  // lag calendar at the live version — exactly `useUpdateDependency`'s input, the same endpoint the
  // Edit-link dialog writes through. Optimistic-lock 409 and pen-loss 423 reuse the reposition
  // contract; the follow-up recalc is the coalesced auto-recalc (or the inline recalc when
  // authoring is off). A no-op when the lag is already the persisted value.
  const updateDependency = useUpdateDependency(orgSlug);
  const lagConflict =
    'This plan changed since you opened it — the lag wasn’t changed. Refresh to see the latest.';
  const onTsldLag = async ({ dependencyId, lagDays }: TsldLagInput): Promise<TsldEditOutcome> => {
    const dependency = (dependencies.data ?? []).find((d) => d.id === dependencyId);
    if (!dependency) return { applied: false, conflict: null };
    // Defensive no-op: the gesture/nudge only emit a *changed* lag, but a stale caller must never
    // burn a version bump (and a recalc) on an identical write.
    if (lagDays === dependency.lagDays) return { applied: false, conflict: null };
    try {
      const saved = await updateDependency.mutateAsync({
        dependencyId,
        type: dependency.type,
        lagDays,
        lagCalendar: dependency.lagCalendar,
        version: dependency.version,
      });
      // Record the lag change for undo (ADR-0048) — the single user edit, NOT the follow-up
      // recalc. The inverse restores the prior lag through the same PATCH; a drag/nudge burst
      // coalesces to one step (`lag:{dependencyId}`). Guarded on the flag.
      if (UNDO_REDO_ENABLED) {
        editHistory.record(
          lagDragCommand({
            updateDependency: updateDependency.mutateAsync,
            dependency,
            afterLagDays: lagDays,
            version: saved.version,
          }),
        );
      }
    } catch (err) {
      if (pen.onWriteRejected(err).kind === 'lock') return { applied: false, conflict: null };
      if (err instanceof ApiFetchError && err.status === 409) {
        // Stale version — the change was NOT applied (nothing changed); never re-send.
        return { applied: false, conflict: lagConflict };
      }
      throw err;
    }
    // The change landed; a recalc failure is non-fatal (dates stay stale until the next recalc).
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
          'Lag changed, but the schedule couldn’t recalculate just now. The dates will update after the next recalculation.',
      };
    }
  };

  // The keyboard lag nudge (ADR-0052 M3) composed once, here, rather than in whichever component
  // happens to host the Logic panel: it is rendered by the Logic *dialog* flag-off and by the
  // editor's Logic *tab* flag-on, and two call sites of the same hook is how the two surfaces
  // would drift. The coalescing is what makes `Shift+←/→` held down one PATCH rather than ten.
  const nudgeDependencyLag = useCoalescedLagNudge({
    onLag: onTsldLag,
    dependencies: dependencies.data ?? [],
    announce,
  });

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

  /**
   * **Duplicate one or more activities** (`docs/specs/activity-copy-paste/` M1-T2, behind
   * `VITE_ACTIVITY_COPY_PASTE`).
   *
   * Pre-checks come from `planClone`'s refusal union rather than from ad-hoc tests here, so a case
   * cannot be handled in one call site and forgotten in the next. Everything else follows
   * `createLoeSpan`'s shape: it is NON-ATOMIC across N creates, so any failure rolls the clones back,
   * refetches server truth, and clears the redo branch (ADR-0048's conflict contract).
   *
   * The **recalculation hold** is the part most likely to break quietly. ADR-0064 says in terms that
   * a leaked hold stalls every later recalculation for the session — there is no error and no
   * surface, the schedule simply stops updating — so it is released in a `finally`, and the failure
   * path has its own test rather than an assumption.
   *
   * The CPM engine is not imported: this composes creates the product already makes.
   */
  /**
   * The ONE `planClone` input derivation.
   *
   * Extracted because the band confirmation and the write that follows it must plan the *same*
   * copy: a preview built from a second derivation would drift, and it would drift in the one place
   * a planner cannot check — the sentence says "3 activities and 2 links", the write does something
   * else, and both look right in isolation. That is the ADR-0065 argument applied to a dialog.
   */
  const cloneInputFor = (
    sources: readonly ActivitySummary[],
    rows: readonly ActivitySummary[],
  ): Parameters<typeof planClone>[0] => ({
    set: sources,
    dependencies: dependencies.data ?? [],
    usedNames: new Set(rows.map((a) => a.name)),
    archivedCalendarIds: new Set(
      (calendars.data ?? []).filter((c) => c.archivedAt !== null).map((c) => c.id),
    ),
    offsetDays: 0,
    laneOffset:
      rows.reduce((hi, a) => Math.max(hi, a.laneIndex), -1) +
      1 -
      Math.min(...sources.map((a) => a.laneIndex)),
    mode: isVisualMode ? 'VISUAL' : 'EARLY',
  });

  const duplicateActivities = async (
    sources: readonly ActivitySummary[],
  ): Promise<DuplicateOutcome> => {
    const rows = activitiesRef.current ?? [];
    const plan_ = planClone(cloneInputFor(sources, rows));
    if (!plan_.ok) return { applied: false, refusal: plan_.refusal, conflict: null };

    // Hold the coalesced recalculation for the whole composite so the bars cannot move between the
    // creates — released in `finally`, never on the happy path alone (ADR-0064).
    const holdToken = Symbol('duplicate');
    autoRecalc.hold(holdToken);
    const created: { id: string; version: number }[] = [];
    // The clones with no cloned parent. A band's undo deletes these and lets the ADR-0038 cascade
    // take the subtree, because `bulkDelete` refuses a batch containing a summary by design.
    const roots: { id: string; version: number }[] = [];
    const idMap = new Map<string, string>();
    const skippedAssignments: SkippedAssignment[] = [];
    try {
      // **Read every source BEFORE writing anything.** Two reasons, and the second is the one that
      // made this an ordering rather than a preference.
      //
      // `MAX_CLONE_ASSIGNMENT_COUNT` bounds the third rate-limit handler this composite touches,
      // and `planClone` structurally cannot check it — it never sees an assignment. Counting here,
      // before the first create, turns "over the cap" into a refusal that costs nothing to recover
      // from. Counting as we went would mean discovering it half way through a 50-activity band and
      // rolling the whole copy back, which is the failure the caps exist to prevent rather than a
      // milder version of it.
      //
      // The request count is unchanged: these are the same two GETs per source the carriage made
      // anyway, moved earlier.
      const sources = new Map<string, Awaited<ReturnType<typeof cloneCarriage.readSource>>>();
      let assignmentCount = 0;
      for (const step of plan_.creates) {
        const source = await cloneCarriage.readSource(step.sourceId);
        sources.set(step.sourceId, source);
        assignmentCount += source.assignments.length;
      }
      if (assignmentCount > MAX_CLONE_ASSIGNMENT_COUNT) {
        return {
          applied: false,
          refusal: {
            kind: 'too-many-assignments',
            assignments: assignmentCount,
            cap: MAX_CLONE_ASSIGNMENT_COUNT,
          },
          conflict: null,
        };
      }

      for (const step of plan_.creates) {
        const parentId = step.parentSourceId === null ? undefined : idMap.get(step.parentSourceId);
        const row = await createClone.mutateAsync({
          ...step.body,
          ...(parentId === undefined ? {} : { parentId }),
        });
        idMap.set(step.sourceId, row.id);
        created.push({ id: row.id, version: row.version });
        if (step.parentSourceId === null) roots.push({ id: row.id, version: row.version });

        // Carry the crew and the step breakdown onto this clone before moving to the next (M4).
        // Inside the same try, so a failure here rolls the whole copy back like any other write —
        // a clone that exists without the resources it was supposed to carry is a half-copy the
        // planner has no way to spot, and the confirmation has already promised them otherwise.
        const source = sources.get(step.sourceId);
        if (source === undefined) continue;
        const carried = await cloneCarriage.carry({
          cloneId: row.id,
          cloneVersion: row.version,
          sourceName: step.sourceName,
          assignments: source.assignments,
          steps: source.steps,
        });
        skippedAssignments.push(...carried.skipped);
      }
      // Links are created SEQUENTIALLY, and the plan's "bound the concurrency, start at 4" is
      // deliberately not followed. Every dependency create runs inside a transaction under
      // `lockPlanForWrite(plan.id)` — a PLAN-SCOPED advisory lock
      // (`dependencies.service.ts:213-222`, read before deciding). Concurrent creates on one plan
      // therefore serialise on that lock server-side: parallelism buys no throughput, and it costs
      // a worse failure mode, because four in-flight requests failing together make "which one
      // broke, and what landed" much harder to answer than one at a time does. If M2-T4's
      // measurement shows the wall clock is the problem, the answer is a batch endpoint
      // (Milestone B), not client-side fan-out at a lock.
      for (const link of plan_.links) {
        const predecessorId = idMap.get(link.predecessorSourceId);
        const successorId = idMap.get(link.successorSourceId);
        // Defensive only: `planClone` filters to edges whose BOTH endpoints are in the create set,
        // and a structural test pins that. A miss here would mean the two have drifted.
        if (predecessorId === undefined || successorId === undefined) continue;
        await createDependency.mutateAsync({
          planId,
          predecessorId,
          successorId,
          type: link.type,
          lagMinutes: link.lagMinutes,
          lagCalendar: link.lagCalendar,
        });
      }
    } catch (err) {
      // Roll the whole copy back. Best-effort: a failed rollback still leaves the refetch below to
      // re-sync, and the original cause must never be replaced by the rollback's own error.
      if (created.length > 0) {
        try {
          // Roots only when the copy is not flat — a rollback batch holding the band's summary is
          // refused for the same reason its undo is (422 SUMMARY_NOT_BULK_ELIGIBLE), which would
          // leave the half-copy in place under a message about the original failure.
          if (roots.length === created.length) {
            await bulkDeleteActivities.mutateAsync({ activities: created });
          } else {
            for (const root of roots) await deleteActivity.mutateAsync(root.id);
          }
        } catch {
          /* swallow — the refetch re-syncs the client to server truth */
        }
      }
      onTsldRefresh();
      if (UNDO_REDO_ENABLED) editHistory.clearRedo();
      if (pen.onWriteRejected(err).kind === 'lock') {
        return { applied: false, refusal: null, conflict: null };
      }
      if (err instanceof ApiFetchError && (err.status === 409 || err.status === 422)) {
        return { applied: false, refusal: null, conflict: err.error.message };
      }
      throw err;
    } finally {
      autoRecalc.release(holdToken);
    }

    if (UNDO_REDO_ENABLED) {
      editHistory.record(
        pasteActivitiesCommand({
          created,
          roots,
          deleteActivity: deleteActivity.mutateAsync,
          bulkDelete: bulkDeleteActivities.mutateAsync,
          restoreBatch: restoreDeleteBatch.mutateAsync,
          label:
            sources.length === 1 && sources[0] !== undefined
              ? `Duplicate \u201c${sources[0].name}\u201d`
              : `Copy ${String(sources.length)} activities`,
        }),
      );
    }
    notifyRecalc();
    // The skipped-assignment sentence rides the SAME announcement rather than a second one: two
    // live-region writes in one frame collapse to the last (the ADR-0073 C1 / TECH_DEBT #104
    // shape), so a planner would hear only whichever won and never the fact that a resource was
    // dropped. Success and its caveat are one sentence because they reach one channel.
    const skippedNote =
      skippedAssignments.length === 0
        ? ''
        : skippedAssignments.length === 1
          ? ' 1 resource assignment was not copied because its resource is archived.'
          : ` ${String(skippedAssignments.length)} resource assignments were not copied because their resources are archived.`;
    announce(
      (created.length === 1
        ? '1 activity duplicated.'
        : `${String(created.length)} activities duplicated.`) + skippedNote,
    );
    // **Reveal the copy.** A clone lands below the plan's lowest lane, so on a 60-lane imported
    // programme a successful duplicate otherwise produces no visible change at all — the planner
    // reads "1 activity duplicated." and sees nothing move. The implementation plan named this as
    // M1's risk (c) and US-1 made it an acceptance criterion; `createdIds` was produced and then
    // read by nothing but a count until the M5 enablement pass. Selecting the first clone puts the
    // canvas cursor on it, which is also what scrolls it into view.
    const anchorId = created[0]?.id ?? null;
    if (anchorId !== null) setRevealActivityId(anchorId);

    return {
      applied: true,
      refusal: null,
      conflict: null,
      createdIds: created.map((c) => c.id),
      skippedAssignments,
    };
  };

  /**
   * **Duplicate a band** — the summary and its whole subtree
   * (`docs/specs/activity-copy-paste/` M2, US-2).
   *
   * The confirmation's counts come off the **plan** `planClone` will execute, never off the
   * selection, so the sentence a planner reads and the write that follows cannot disagree. Returns
   * `null` when the band cannot be copied at all, so the caller can announce the refusal instead of
   * opening a dialog that only says no.
   *
   * This is where M2's model finally reaches a planner. `bandMembers` and `bandCopyConfirmation`
   * shipped with unit tests and **no caller at all** — the enablement review found them validating
   * dead code, and the toolbar comment beside the excluded summary still read "copying the band
   * with its subtree is M2" as though M2 were future work. The capability was not lit-but-inert; it
   * was never offered.
   */
  const bandCopyPreview = (summary: ActivitySummary): BandCopyCopy | null => {
    const rows = activitiesRef.current ?? [];
    const members = bandMembers(rows, summary.id);
    if (members.length === 0) return null;
    const preview = planClone(cloneInputFor(members, rows));
    if (!preview.ok) return null;
    return bandCopyConfirmation(summary.name, preview);
  };

  /**
   * `Ctrl+C` — capture the canvas's current selection (`docs/specs/activity-copy-paste/` M3).
   *
   * Stores **ids**, resolved against the live plan at paste time, so a copy always pastes what those
   * activities are now rather than what they were when the planner pressed the key. The clipboard is
   * per plan and cleared on plan switch, mirroring the ADR-0048 history lifetime — the two are the
   * same mental object to a planner, and separate lifetimes would leave a paste landing work that
   * can no longer be undone in one step.
   */
  const copySelection = (): void => {
    const ids = pluralSelectionRef.current;
    if (ids.length === 0) {
      announce('Select an activity to copy.');
      return;
    }
    clipboardRef.current = { planId, activityIds: [...ids] };
    announce(ids.length === 1 ? '1 activity copied.' : `${String(ids.length)} activities copied.`);
  };

  /**
   * `Ctrl+V` — paste the clipboard by the M2 rules.
   *
   * **Paste does not touch any ADR-0064 tool mode.** It arms nothing, disarms nothing and does not
   * take an open link pick's next click: it composes the same `duplicateActivities` the row action
   * and the toolbar item already call, and that function's whole surface is mutations plus the
   * recalculation hold. The non-interaction is structural rather than a rule to remember — there is
   * no mode setter in reach of this module at all, which `paste-tool-mode.structural.test.ts`
   * asserts directly (and was verified red by planting one).
   */
  const pasteClipboard = async (): Promise<void> => {
    const contents = clipboardRef.current;
    if (contents === null) {
      announce('Nothing has been copied yet.');
      return;
    }
    if (contents.planId !== planId) {
      // Refused rather than translated. A cross-plan paste needs calendars, resources and a parent
      // tree resolved into a different org-scoped world; guessing would produce a copy that
      // schedules differently from its source with nothing saying why.
      announce('That copy came from a different plan.');
      return;
    }
    const { present, missingCount } = resolveClipboard(contents, activitiesRef.current ?? []);
    if (present.length === 0) {
      announce('The activities you copied no longer exist.');
      return;
    }
    const outcome = await duplicateActivities(present);
    if (outcome.refusal !== null) {
      announce(refusalMessage(outcome.refusal));
      return;
    }
    if (outcome.conflict !== null) {
      announce(outcome.conflict);
      return;
    }
    // `duplicateActivities` has already announced the success and any skipped assignments. The
    // stale-id note is folded in by re-announcing the whole sentence rather than adding a second
    // live-region write, which would collapse to whichever landed last (TECH_DEBT #104).
    if (missingCount > 0) {
      announce(
        `${String(outcome.createdIds?.length ?? present.length)} activities pasted.` +
          missingNote(missingCount),
      );
    }
  };

  /**
   * Run the band copy the confirmation described.
   *
   * Re-derives the members from the **live** rows rather than closing over what the preview saw: a
   * planner can leave the dialog open while a colleague adds an activity to the band, and copying
   * the band the dialog described rather than the band that exists would be a quietly wrong copy.
   */
  const confirmDuplicateBand = async (): Promise<void> => {
    const summaryId = duplicateBandId;
    if (summaryId === null) return;
    const members = bandMembers(activitiesRef.current ?? [], summaryId);
    setDuplicateBandId(null);
    if (members.length === 0) {
      announce('There is nothing in this band to copy.');
      return;
    }
    const outcome = await duplicateActivities(members);
    if (outcome.refusal !== null) announce(refusalMessage(outcome.refusal));
    else if (outcome.conflict !== null) announce(outcome.conflict);
  };

  /**
   * The single-row entry point both hosts call. Refusals and conflicts are **announced**, because
   * this is the live region every other canvas action already speaks through and a planner driving
   * from the keyboard has no other channel; a refusal that only appeared visually would be silent
   * for exactly the person who cannot see the bar not changing.
   */
  const onDuplicateActivity = async (activity: ActivitySummary): Promise<void> => {
    const outcome = await duplicateActivities([activity]);
    if (outcome.refusal !== null) {
      announce(refusalMessage(outcome.refusal));
      return;
    }
    if (outcome.conflict !== null) announce(outcome.conflict);
  };

  return {
    orgSlug,
    planId,
    duplicateActivities,
    onDuplicateActivity,
    /** Duplicate a band (M2): the confirmation's state, its copy, and the run. */
    duplicateBandId,
    setDuplicateBandId,
    onDuplicateBand,
    bandCopyPreview,
    confirmDuplicateBand,
    /** The canvas should select and scroll to this activity, then call `onRevealHandled`. */
    revealActivityId,
    onRevealHandled,
    /** The app clipboard (`docs/specs/activity-copy-paste/` M3): `Ctrl+C` / `Ctrl+V`. */
    copySelection,
    pasteClipboard,
    onPluralSelectionChange,
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
    todayFraction,
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
    /**
     * Why a pen-gated schedule command is shut, given a phrase naming what it does — `null` when it
     * is open (`docs/TECH_DEBT.md` #114.1). Bound here because this is the one place that holds
     * both halves the sentence needs: the role/pen split (`penReadOnly`, which `canEditSchedule`
     * has already fused away) and who currently holds the pen. A caller given only
     * `canEditSchedule` cannot tell a Viewer from a Planner without the lock, and every caller that
     * tried wrote a sentence that is false for one of them.
     */
    scheduleRefusal: refuseSchedule,
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
    // The Logic entry point every host calls (canvas bar, row menu, keyboard Enter). Flag-on it
    // builds the editor intent; flag-off it opens the dialog, exactly as before.
    onOpenLogic,
    // The coalesced keyboard lag nudge, composed once here so the Logic dialog and the Logic tab
    // cannot end up with two different implementations of the same chord.
    nudgeDependencyLag,
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
    // Dissolve target (WBS improvements M2) — set by the canvas selection bar, rendered by
    // ActivityCrudDialogs. Inert when `VITE_WBS_IMPROVEMENTS` is off: nothing sets it.
    dissolveActivityId,
    setDissolveActivityId,
    onDissolveSummary,
    // The tabbed editor's single open intent + the per-scope gate every host shares (ADR-0060 §7,
    // M5). Flag-off `editorIntent` is never set, so the legacy per-dialog state above still drives.
    editorIntent,
    setEditorIntent,
    activityEditorGating,
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
    // The Float paths panel's whole state, actions and derived emphasis set, as ONE bundle rather
    // than eight loose fields — `PlanWorkspaceModel` is consumed by ~30 files and widening it a
    // field at a time is how it got to this length. Inert when `VITE_FLOAT_PATHS` is off: nothing
    // opens it and the query's `enabled` is false by construction.
    floatPaths,
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
    // Dissolve's undo boundary (WBS improvements M2) — see `recordDissolveBoundary`.
    recordDissolveBoundary,
    recordDependencyRemove,
    recordDependencyAdd,
    // Undo/redo user-visible surface (ADR-0048 M3): the toolbar Undo/Redo items + the workspace
    // keybindings drive this, sharing the ONE history instance the recording seams above push onto.
    // Inert (never invoked) unless `VITE_UNDO_REDO` is on.
    undoRedo,
    /** The canvas's plural-selection operations (`docs/specs/canvas-multi-select/` M4). */
    bulkOperations,
    /** The ADR-0064 T7 quiescence seam + its drop signal, handed to the canvas by the workspace. */
    autoRecalcHold: { hold: autoRecalc.hold, release: autoRecalc.release },
    dropLinkPickSignal,
    // TSLD edit callbacks
    onTsldCreate,
    onTsldReposition,
    // Bar-end resize (ADR-0052 M2 finish, M3 start — `VITE_CANVAS_DIRECT_MANIPULATION`): the
    // full-definition durationDays PATCH (+ mode-aware SNET/visualStart for a start drag) +
    // coalesced recalc + coalesced undo.
    onTsldResize,
    // Lag-anchor drag / Logic-panel lag nudge (ADR-0052 M3): the dependency PATCH echoing the
    // unchanged type + lag calendar + coalesced recalc + coalesced undo.
    onTsldLag,
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
