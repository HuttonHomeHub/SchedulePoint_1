import type {
  ActivitySummary,
  ActivityType,
  BaselineVarianceRow,
  DependencySummary,
  DependencyType,
} from '@repo/types';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  CANVAS_AUTHORING_ENABLED,
  CANVAS_DIRECT_MANIPULATION_ENABLED,
  CANVAS_LENSES_ENABLED,
  CANVAS_NAV_ENABLED,
  CANVAS_RESOURCE_VIEW_ENABLED,
  TSLD_EDITING_ENABLED,
  UNDO_REDO_ENABLED,
} from '../../../config/env';
import type { EditIntent, LoeSpanStep } from '../interaction/gesture-machine';
import { useCoalescedDurationNudge } from '../interaction/use-coalesced-duration-nudge';
import { useCoalescedNudge } from '../interaction/use-coalesced-nudge';
import {
  announceChainStep,
  chainNeighbour,
  describeActivity,
  lagPhrase,
  summarizeLogic,
} from '../render/a11y';
import { packLanes } from '../render/auto-pack';
import {
  buildBaselineGhosts,
  buildColourInkMap,
  buildColourMap,
  isFilterActive,
  matchesActivityFilter,
  overAllocatedIds,
} from '../render/lenses';
import { linkIllegalMessage, linkLegality } from '../render/link-legality';
import { computeLogicPath, isolateDimmedIds } from '../render/logic-path';
import { resolveLensPalette } from '../render/palette';
import {
  addCalendarDays,
  daysBetween,
  isMilestone,
  isResizeEligibleType,
  type Point,
} from '../render/render-model';
import type { ResourceStripSnapshot } from '../render/resource-strip';
import { snapToWorkingDay } from '../render/snap';
import { makeWorkingDayPredicate, type WorkingDayCalendar } from '../render/time-scale';
import { toRenderActivities, toRenderEdges, type BarDateSource } from '../render/to-render-model';
import { useThemeVersion } from '../render/use-theme-version';
import {
  SelectionActionsBar,
  type SelectionActionContext,
  type SelectionAnchor,
} from '../toolbar/selection-actions';
import { useTsldCanvasUiState, type TsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { CreateActivityPopover } from './CreateActivityPopover';
import { EditConflictBanner } from './EditConflictBanner';
import { RULER_HEIGHT, TsldCanvas, type PendingGhost } from './TsldCanvas';
import { TsldLegend } from './TsldLegend';
import { TsldShortcutsHelp } from './TsldShortcutsHelp';
import { TsldToolbar } from './TsldToolbar';
import { TsldViewControls } from './TsldViewControls';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatCalendarDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

/** Fixed screen anchor for the keyboard (`n`) create popover — a stable top-left corner, since a
 * keyboard invocation has no pointer position (the drag/toolbar paths pass the real anchor). */
const KEYBOARD_CREATE_ANCHOR: Point = { x: 24, y: 24 };

/** A committed create from the canvas; the route maps it to `POST /activities` + recalc. */
export interface TsldCreateInput {
  name: string;
  /** The activity type to create (ADR-0032 M4); TASK unless the add tool selected a milestone. */
  type: ActivityType;
  startDay: number;
  endDay: number;
  laneIndex: number;
}

/**
 * The outcome of a create. It **resolves iff the activity was persisted** — so the panel
 * closes the popover and never re-POSTs. `recalcConflict` carries a non-fatal message when the
 * row was created but the follow-up recalc was refused (e.g. the plan lock was held): the row
 * stays, and the message is surfaced via the conflict banner, not the create popover. A create
 * failure (validation/duplicate) rejects, keeping the popover open with the inline error.
 */
export interface TsldCreateOutcome {
  recalcConflict: string | null;
}

/**
 * A committed reposition — a free-2D move (M4). `startDay` (present iff the day changed) maps to
 * an SNET constraint + recalc; `laneIndex` (present iff the lane changed) is layout only (no
 * recalc). The route issues the minimal PATCH for whichever axes are present. **At least one axis
 * is always present** — the gesture machine emits a `reposition` only when a whole cell changed,
 * and the route treats the all-absent case as a no-op — though the type can't enforce that.
 */
export interface TsldRepositionInput {
  activityId: string;
  startDay?: number;
  laneIndex?: number;
}

/**
 * The shared outcome of an optimistic edit (reposition or link). It **resolves** for both
 * success and a domain conflict (stale `version`, a cycle, a duplicate — ADR-0021/0022); a
 * genuine failure rejects. `applied` says whether the write actually landed — false when it was
 * refused (nothing changed), true when it landed (even if the follow-up recalc then failed) — so
 * the success status is announced only when it's true. `conflict` is the banner message.
 */
export interface TsldEditOutcome {
  applied: boolean;
  conflict: string | null;
}

export type TsldRepositionOutcome = TsldEditOutcome;

/**
 * A committed bar-end resize (ADR-0052 M2 finish edge, M3 start edge) — the new whole-day
 * duration, plus (start edge only) the new start day. Finish edge: the route maps it to a
 * `PATCH durationDays` carrying the FULL definition round-trip (like a reposition) + the
 * coalesced recalc; start day and lane are untouched. Start edge (`startDay` present): the
 * finish stays pinned (`durationDays` = finish − newStart + 1) and the route maps it
 * **mode-aware** (ADR-0052 §3): EARLY → `PATCH {constraintType: SNET, constraintDate,
 * durationDays}`, VISUAL → `PATCH {visualStart, durationDays}`.
 */
export interface TsldResizeInput {
  activityId: string;
  /** The new duration in whole days (≥ 1 — the gesture/nudge clamp before emitting). */
  durationDays: number;
  /** The new start day offset (present iff the START edge was dragged — ADR-0052 M3). */
  startDay?: number;
}

export type TsldResizeOutcome = TsldEditOutcome;

/**
 * A committed lag-anchor drag (ADR-0052 M3) — the dependency's new signed whole-day lag
 * (negative = lead), snapped on its lag calendar by the inverse anchor mapping. The route maps
 * it to a `PATCH /dependencies/:id` echoing the unchanged type + lag calendar at the live
 * version, + the coalesced recalc.
 */
export interface TsldLagInput {
  dependencyId: string;
  lagDays: number;
}

export type TsldLagOutcome = TsldEditOutcome;

/** A committed dependency-draw — predecessor → successor with the modifier-chosen type. */
export interface TsldLinkInput {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
}

export type TsldLinkOutcome = TsldEditOutcome;

/** A committed LOE endpoint-pick (Stage D) — the two driver activities the span hangs off. The route
 * composes a `LEVEL_OF_EFFORT` activity plus an SS (start → LOE) and FF (LOE → finish) edge as one
 * undoable action; no `HAMMOCK` is ever created (the LOE is the span-derived hammock). */
export interface TsldLoeSpanInput {
  startDriverId: string;
  finishDriverId: string;
}

export type TsldLoeSpanOutcome = TsldEditOutcome;

export interface TsldPanelProps {
  activities: readonly ActivitySummary[];
  dependencies: readonly DependencySummary[];
  /** The plan's start (`plannedStart`) — the diagram's day-zero origin. Null → not schedulable. */
  dataDate: string | null;
  /** Whether the viewer may edit (Planner/Org Admin). Combined with the M2 flag to gate editing. */
  canEdit?: boolean;
  /** Route-composed create handler (owns the mutation + recalc, ADR-0026 D8). Its presence + the
   * flag + `canEdit` enable on-canvas editing. Resolves once the activity persists (see
   * {@link TsldCreateOutcome}); rejects only when the create itself failed. */
  onCreate?: (input: TsldCreateInput) => Promise<TsldCreateOutcome>;
  /** Route-composed reposition handler (SNET PATCH + recalc). Resolves with a conflict message
   * when the move was refused (stale version) or dates couldn't recalc; rejects on real error. */
  onReposition?: (input: TsldRepositionInput) => Promise<TsldRepositionOutcome>;
  /** Route-composed bar-end resize handler (ADR-0052 M2 finish edge, M3 start edge): the
   * full-definition `PATCH durationDays` (+ SNET/`visualStart` for a start drag, mode-aware) +
   * recalc. Only reachable under `VITE_CANVAS_DIRECT_MANIPULATION`; its presence arms the bar-end
   * resize handles + the `Shift+←/→` duration nudge. Resolves with a conflict message when
   * refused (stale version); rejects on real error. */
  onResize?: (input: TsldResizeInput) => Promise<TsldResizeOutcome>;
  /** Route-composed lag-drag handler (ADR-0052 M3): `PATCH /dependencies/:id` echoing the
   * unchanged type + lag calendar + recalc. Only reachable under
   * `VITE_CANVAS_DIRECT_MANIPULATION`; its presence arms the drawn lag-anchor grab zones.
   * Resolves with a conflict message when refused (stale version); rejects on real error. */
  onLag?: (input: TsldLagInput) => Promise<TsldLagOutcome>;
  /** Route-composed dependency-draw handler (`POST /dependencies` + recalc). Resolves with a
   * conflict message on a cycle/duplicate (ADR-0021) or a recalc refusal; rejects on real error. */
  onLink?: (input: TsldLinkInput) => Promise<TsldLinkOutcome>;
  /** Route-composed **LOE span** handler (Stage D): composes a `LEVEL_OF_EFFORT` activity + SS/FF edges
   * as one undoable action (`model.createLoeSpan`). Resolves with a conflict message on a
   * cycle/duplicate/stale/pen-loss (rolled back, no orphan); rejects on real error. Its presence + the
   * LOE tool-mode (armed from the flag-gated Add-menu item) enables the on-canvas endpoint-pick. */
  onLoeSpan?: (input: TsldLoeSpanInput) => Promise<TsldLoeSpanOutcome>;
  /** Route-composed auto-arrange handler (M4 4.3): persists the packed lanes via the batch
   * positions endpoint (all-or-nothing, no recalc). Resolves with a conflict message when a stale
   * version refused the whole batch; rejects on real error. Its presence shows the toolbar action. */
  onAutoArrange?: (
    changes: readonly { id: string; laneIndex: number }[],
  ) => Promise<TsldEditOutcome>;
  /** Open the logic (dependency) editor for an activity — the keyboard equivalent of link-draw,
   * invoked from the parallel listbox (no pointer-only capability, WCAG 2.1.1). Also the read action
   * on the floating {@link SelectionActionsBar}. */
  onOpenLogic?: (activity: ActivitySummary) => void;
  /** Open the edit dialog for an activity — the **floating selection bar**'s Edit action (ADR-0031).
   * The host owns the dialog so this feature imports no other feature (ADR-0026 D8); its presence
   * (with {@link onDeleteActivity}) mounts the bar over the selected bar. */
  onEditActivity?: (activity: ActivitySummary) => void;
  /** Delete an activity (host-owned confirm) — the floating selection bar's Delete action (ADR-0031). */
  onDeleteActivity?: (activity: ActivitySummary) => void;
  /** Open the per-activity resource-assignment editor — the floating selection bar's **Resources**
   * action (entry-route win 2, `VITE_ENTRY_ROUTES`). The host owns the dialog (ADR-0026 D8). Optional:
   * absent ⇒ the selection bar isn't wired (like the edit/delete pair). The `resources` toolbar item
   * that surfaces it is itself flag-gated in {@link selectionActionItems}, so flag-off is byte-for-byte. */
  onResources?: (activity: ActivitySummary) => void;
  /** Open the progress editor — the selection bar's **Report progress** action (entry-route,
   * `VITE_ENTRY_ROUTES`). Host-owned dialog. The item is role-gated via {@link canReportProgress}. */
  onProgress?: (activity: ActivitySummary) => void;
  /** Open the weighted-steps editor — the selection bar's **Steps** action (entry-route). Host-owned
   * dialog; the item is gated on the earned-value/steps flags + {@link isStepsEligible}. */
  onSteps?: (activity: ActivitySummary) => void;
  /** Whether the viewer may report progress (Contributor upward) — gates the selection bar's Progress
   * action (role only, not pen-gated), mirroring the toolbar's Update-progress command. Default false. */
  canReportProgress?: boolean;
  /** Predicate: may this activity carry weighted steps? False for a duration-derived type
   * (milestone / LOE / WBS summary) — gates the Steps action, matching the table's `!isDurationDerivedType`.
   * The host supplies it so this feature stays free of an activities-feature import (ADR-0026 D8). */
  isStepsEligible?: (activity: ActivitySummary) => boolean;
  /** Report the current canvas selection to the host (toolbar quick-wins F0) — the id of the selected
   * activity, or null when none. Called on every selection transition (select / chain-nav / focus /
   * delete-reconcile) so the main toolbar's selection-aware items can read it. Optional: absent ⇒ no
   * behaviour change (the in-panel `SelectionActionContext` is unaffected). */
  onSelectionChange?: (id: string | null) => void;
  /** Refetch the plan's server truth (activities/links/variance). Wired to the conflict banner's
   * Refresh so the "this changed elsewhere" cases have a real recovery action, not just copy. */
  onRefresh?: () => void;
  /** The plan's working-day calendar (weekly mask + holiday exceptions), for the non-working
   * shading. Null/absent → no shading. The route resolves it from the plan's calendar. */
  calendar?: WorkingDayCalendar | null;
  /** Today as a calendar day (`YYYY-MM-DD`), for the TODAY marker. The route passes it (floored
   * to the local day) so the component does no wall-clock math. */
  todayIso?: string;
  /** Fill the available height instead of the default fixed 480px box. When set, the canvas
   * container is `h-full` (with a min-height floor) so the diagram fills the workspace region —
   * used by the canvas-first `PlanWorkspace` (ADR-0030). Default (unset) keeps today's boxed look. */
  fill?: boolean;
  /** **Chromeless** (ADR-0031): drop the panel's own hint line, editing/view toolbars, legend and
   * shortcuts button, leaving just the canvas + parallel listbox + inline editing surfaces (create
   * popover, conflict banner, auto-arrange + help dialogs). The canvas-first toolbar hosts those
   * controls instead. Default (unset) keeps the self-contained chrome for the flag-off / legacy path. */
  chromeless?: boolean;
  /** Externally-owned canvas UI state (mode/toggles/zoom/fit/help), so the workspace toolbar and the
   * canvas share one source of truth (ADR-0031). Absent → the panel owns it (unchanged behaviour). */
  canvasUi?: TsldCanvasUiState;
  /** Which engine dates draw each bar (ADR-0033): `early` (default, classic CPM), `visual` (VISUAL
   * mode's effective-Visual dates), or `late` (the read-only Late-Start overlay). The route derives
   * it from the plan's `schedulingMode` + the Late overlay toggle, gated by `VITE_SCHEDULING_MODES`
   * (flag-off it stays `early`, byte-for-byte). */
  barDateSource?: BarDateSource;
  /** The plan's baseline-variance rows (`useBaselineVariance`), for the **Baseline overlay** lens
   * (spec `docs/specs/canvas-lenses/`, behind `VITE_CANVAS_LENSES`). The host passes the shipped
   * variance data (already route-composed for the activities table) so no new fetch is added; the
   * ghost geometry joins these captured dates to the live lanes. Absent/empty ⇒ no ghost layer. */
  varianceRows?: readonly BaselineVarianceRow[] | undefined;
  /** Whether the canvas-axis-aligned resource strip is active (Stage E, ADR-0049, behind
   * `VITE_CANVAS_RESOURCE_VIEW`) — reserves the strip band at the canvas bottom and paints the demand
   * bars. Absent/false ⇒ no band, byte-for-byte today's canvas. Forwarded straight to `TsldCanvas`.
   *
   * NB this lens intentionally takes a SEPARATE boolean + data prop ({@link resourceStrip}), unlike the
   * sibling `flaggedIds` / `baselineGhosts` lenses that derive a single optional field: the band's
   * height must be reserved (`active`) during the loading state — before any snapshot exists (`data` is
   * still `null`) — so the two can't collapse into one. Don't "fix" the inconsistency. */
  resourceStripActive?: boolean;
  /** The resource-strip snapshot the workspace's `ResourceStripPanel` publishes (selected series +
   * pre-projected bucket day-offsets + whole-series max). Forwarded to `TsldCanvas`, which paints ONLY
   * the strip on a change. `null`/absent ⇒ the band (if {@link resourceStripActive}) draws just its
   * axis rule — the loading/empty state where the band is reserved but there's nothing to plot yet. */
  resourceStrip?: ResourceStripSnapshot | null;
  /** Whether the **over-allocation highlight** mode is on (Stage E M2, behind `VITE_CANVAS_RESOURCE_VIEW`)
   * — flags bars carrying the engine-owned levelling over-allocation flags (`levelingWindowExceeded ||
   * selfOverAllocated`, ADR-0041) with a non-colour-only badge + a parallel listbox mark + a count
   * announcement. Absent/false ⇒ no `flaggedIds` scene field ⇒ byte-for-byte today's canvas + a11y tree. */
  overAllocationHighlight?: boolean;
}

interface PendingCreate {
  type: ActivityType;
  startDay: number;
  endDay: number;
  laneIndex: number;
  anchor: Point;
  saving: boolean;
  error: string | null;
}

/**
 * The Time-Scaled Logic Diagram (TSLD) panel (ADR-0026). Renders the plan's computed schedule
 * on a Canvas 2D surface paired with a **parallel focusable listbox** (the canvas is
 * `aria-hidden`; keyboard/AT users navigate the listbox, and selecting rings the bar). The
 * activities table remains the fuller conforming alternative.
 *
 * **M2 (flagged):** when editing is enabled (`canEdit` + `onCreate` + `VITE_TSLD_EDITING`),
 * a toolbar adds an **Add activity** tool — drag on the timeline to draw a task, then name it
 * in an inline popover — and in **Select** mode a writer drags a bar's body sideways to move it
 * in time (an SNET reposition) or drags from a bar's **edge handle** to another bar to draw a
 * dependency (modifier picks the type). Edits show an instant optimistic preview; the route owns
 * the write + authoritative recalc, and a stale-version / cycle / duplicate conflict surfaces as
 * a non-destructive banner. With editing off the surface is byte-for-byte the M1 read-only diagram.
 */
export function TsldPanel({
  activities,
  dependencies,
  dataDate: dataDateProp,
  canEdit = false,
  onCreate,
  onReposition,
  onResize,
  onLag,
  onLink,
  onLoeSpan,
  onAutoArrange,
  onOpenLogic,
  onEditActivity,
  onDeleteActivity,
  onResources,
  onProgress,
  onSteps,
  canReportProgress = false,
  isStepsEligible,
  onSelectionChange,
  onRefresh,
  calendar = null,
  todayIso,
  fill = false,
  chromeless = false,
  canvasUi,
  barDateSource = 'early',
  varianceRows,
  resourceStripActive = false,
  resourceStrip = null,
  overAllocationHighlight = false,
}: TsldPanelProps): React.ReactElement {
  // Canvas-first authoring (ADR-0032): the timeline needs an origin to draw against, so when the
  // plan has no `plannedStart` yet the canvas anchors to **today** — letting a planner draw the
  // first activity on a blank plan. Flag-off (or once a start is set) this is exactly the prop, so
  // the legacy path is byte-for-byte unchanged. The first structural write pins `plannedStart` to
  // this anchor (the workspace's `onTsldCreate`), keeping the persisted dates coherent.
  const dataDate = dataDateProp ?? (CANVAS_AUTHORING_ENABLED ? (todayIso ?? null) : null);
  const announce = useAnnounce();
  const listboxId = useId();
  const optionId = (id: string): string => `${listboxId}-opt-${id}`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The selected activity's live viewport geometry, written by the canvas each frame and read by the
  // floating selection bar to follow pan/zoom without per-frame React state (ADR-0026 D3 / ADR-0031).
  const selectionAnchorRef = useRef<SelectionAnchor | null>(null);
  // Canvas UI state (mode/toggles/zoom/fit/help): externally-owned when the workspace toolbar
  // drives the canvas (ADR-0031), else owned here (flag-off / legacy — unchanged). The hook is
  // always called (rules of hooks); its result is ignored when `canvasUi` is supplied.
  const ownCanvasUi = useTsldCanvasUiState();
  const {
    mode,
    setMode,
    viewToggles,
    toggleView,
    zoomPreset,
    setZoomPreset,
    fitSignal,
    requestFit,
    autoArrangeSignal,
    showHelp,
    setShowHelp,
    canvasControlRef,
    createType,
    linkType,
    loeStartId,
    setLoeStartId,
    lensState,
    navState,
  } = canvasUi ?? ownCanvasUi;
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  // The moved bar's ghost while a reposition mutation is in flight (no popover, just the ghost).
  const [pendingReposition, setPendingReposition] = useState<PendingGhost | null>(null);
  // Auto-arrange confirm dialog + in-flight state (a bulk, no-undo reorder — §5 of the M4 design).
  // The pending lane changes are computed when the dialog opens, so confirm applies exactly them.
  const [confirmArrange, setConfirmArrange] = useState(false);
  const [arrangeChanges, setArrangeChanges] = useState<{ id: string; laneIndex: number }[]>([]);
  const [arranging, setArranging] = useState(false);
  // A rejected-edit banner message. `refreshable` gates the "Refresh" action: most conflicts are a
  // stale server truth (refetch reconciles), but the local link-draw pre-check verdict comes from
  // the already-loaded graph, so Refresh can't change it — that path sets `refreshable: false`.
  const [conflict, setConflict] = useState<{ message: string; refreshable: boolean } | null>(null);
  const clearConflict = (): void => setConflict(null);
  const showConflict = (message: string, refreshable = true): void =>
    setConflict({ message, refreshable });
  // Focus returns here when the create popover closes, so keyboard users aren't dropped to
  // <body> (they're placed back on the tool to draw again).
  const addActivityRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  // Where the floating selection bar hands focus back when it hides/unmounts while focused (so a
  // keyboard user is never dropped to <body> on pan-away or a last-activity delete). Stable.
  const restoreSelectionFocus = useCallback(() => listboxRef.current?.focus(), []);
  // Set just before a Next-conflict cycle focuses the listbox programmatically, so the listbox's
  // `onFocus` default-select (pick the first row when nothing is selected) doesn't clobber the conflict
  // selection we set in the same tick (the closure's `selectedId` is still stale then). Consumed once.
  const conflictFocusPendingRef = useRef(false);
  // Where focus returns when the create popover closes: the listbox when opened via `n`, else the
  // Add-activity tool (drag/toolbar). Reset after each close.
  const createReturnFocusRef = useRef<HTMLElement | null>(null);
  // The LOE endpoint-pick tool's picked **start driver** (Stage D, `docs/specs/canvas-activity-types/`)
  // now lives in the shared canvas UI state (destructured above) so it is the ONE source of truth read
  // by the keyboard flow (listbox Enter), the pointer flow (seeded into the canvas via `loePickStartId`),
  // and the toolbar's Add-trigger label. Null when no start is picked; cleared when the tool disarms.
  // Whether the LOE tool's disarm was triggered by a SUCCESSFUL commit (B1) rather than an Escape /
  // abandon — so the disarm effect below announces "cancelled/closed" only on a genuine cancel, never
  // after the success announcement (spec B2 sequencing). Set by `runLoeSpan` just before it disarms.
  const loeCommitDisarmRef = useRef(false);
  // Mirror the live picked-start id so the mode effect can read it at disarm time WITHOUT listing
  // `loeStartId` as a dep (which would re-announce the arm prompt on every pick).
  const loeStartIdRef = useRef(loeStartId);
  useEffect(() => {
    loeStartIdRef.current = loeStartId;
  }, [loeStartId]);
  // True while the LOE tool is armed, so the disarm branch only reacts to a real transition FROM `'loe'`
  // (never the initial mount, where `mode` starts `'select'`).
  const loeArmedRef = useRef(false);
  // Arm/disarm side effects: announce the first prompt when the LOE tool is armed (its canvas is
  // aria-hidden, so the prompt must be spoken), and — on disarm — drop any half-finished pick and
  // announce the disarm (WCAG 4.1.3), UNLESS a successful commit already announced its success. Runs
  // only on a `mode` transition. Inert while the flag is off — `mode` is never `'loe'` then.
  useEffect(() => {
    if (mode === 'loe') {
      loeArmedRef.current = true;
      announce('Level of effort (hammock): pick the start driver, then the finish driver.');
      return;
    }
    // Only react to a genuine disarm (a transition FROM `'loe'`), not the mount / other-mode renders.
    if (!loeArmedRef.current) return;
    loeArmedRef.current = false;
    const hadStart = loeStartIdRef.current !== null;
    // Leaving the LOE tool drops any half-finished pick, so a re-arm never inherits a stale start driver.
    // The endorsed "subscribe to an external system (the toolbar-owned tool `mode`), setState in
    // response" effect case (mirrors the Next-conflict select-signal sync above). `setLoeStartId` is the
    // shared canvas-UI setter (a prop, not local state), so no set-state-in-effect suppression is needed.
    setLoeStartId(null);
    // A successful commit already announced "Added a level-of-effort span…"; don't also say "cancelled".
    if (loeCommitDisarmRef.current) {
      loeCommitDisarmRef.current = false;
      return;
    }
    // Otherwise this is an Escape / menu-toggle / re-select disarm — announce it so the aria-hidden
    // canvas's silent tool change isn't invisible to AT (B2). "Cancelled" when a start was pending, else
    // "closed"; keep the "(hammock)" anchor a planner may have searched for (S2).
    announce(
      hadStart ? 'Level of effort (hammock) cancelled.' : 'Level of effort (hammock) tool closed.',
    );
  }, [mode, announce, setLoeStartId]);

  const renderActivities = useMemo(
    () => toRenderActivities(activities, barDateSource),
    [activities, barDateSource],
  );
  const renderEdges = useMemo(() => toRenderEdges(dependencies), [dependencies]);
  // The listbox option text (Tier-1 `describeActivity`) is memoised by activity, keyed on
  // `activities` only — NOT on selection or unrelated parent re-renders. Without this, any parent
  // render (e.g. every pointermove while dragging the workspace's activity-panel resizer) re-ran
  // `describeActivity` for every row, which measured ~1.3s at 2,000 activities (ADR-0030 perf).
  const optionDescriptions = useMemo(() => {
    // Which activities the render pass flagged as sharing a lane with a time-overlapping neighbour
    // (TECH_DEBT #24c) — computed once on the drawn dates, so the spoken cue matches the canvas badge.
    const overlap = new Map(renderActivities.map((r) => [r.id, r.laneOverlap ?? false]));
    return new Map(
      activities.map((a) => [
        a.id,
        describeActivity(a, { overlapsInLane: overlap.get(a.id) ?? false }),
      ]),
    );
  }, [activities, renderActivities]);
  // ── Insight lenses (spec `docs/specs/canvas-lenses/`, behind `VITE_CANVAS_LENSES`) ──────────
  // Precomputed, memoised maps handed to the painter via the `TsldScene`, so the culled rAF loop draws
  // from them with zero per-frame allocation (ADR-0026 draw budget). ALL default to `undefined` — when
  // the flag is off, no filter is active, the mode is the default Criticality, or the overlay is off —
  // so the scene carries no lens fields and the paint is byte-for-byte today's.
  const { filterQuery, filterAttrs, colourMode, baselineOverlay } = lensState;
  // Bumps on a light/dark/system switch so the Colour-by fill + ink maps re-resolve their token colours
  // (the canvas paints concrete colours, not `var()`), matching the base painter's re-theme (C1/U3).
  const themeVersion = useThemeVersion();
  const filterActive = CANVAS_LENSES_ENABLED && isFilterActive(filterQuery, filterAttrs);
  // The ids of the NON-matching activities (dimmed on the canvas + marked in the listbox). Absent when
  // no filter is active, so an empty/cleared filter dims nothing (parity).
  const filterDimmedIds = useMemo<Set<string> | undefined>(() => {
    if (!filterActive) return undefined;
    const set = new Set<string>();
    for (const a of activities) {
      if (!matchesActivityFilter(a, filterQuery, filterAttrs)) set.add(a.id);
    }
    return set;
  }, [filterActive, activities, filterQuery, filterAttrs]);
  // ── Isolate logic path (canvas nav, `docs/specs/canvas-nav/`, behind `VITE_CANVAS_NAV`) ──────
  // The selected activity's transitive logic chain (full or driving-only), memoised on the selection +
  // edges + mode only — never per frame (perf; O(V+E)). Absent unless isolate is active AND something
  // is selected, so flag-off / no-selection contributes NO dim (byte-for-byte parity).
  const isolateChain = useMemo<Set<string> | undefined>(() => {
    if (!CANVAS_NAV_ENABLED || !navState.isolateActive || selectedId === null) return undefined;
    return computeLogicPath(selectedId, dependencies, { mode: navState.isolateMode });
  }, [navState.isolateActive, navState.isolateMode, selectedId, dependencies]);
  // The complement of the chain within the plan — the ids isolate dims. Reuses the Stage A dim seam.
  const isolateDimmed = useMemo<Set<string> | undefined>(() => {
    if (!isolateChain) return undefined;
    return isolateDimmedIds(
      activities.map((a) => a.id),
      isolateChain,
    );
  }, [isolateChain, activities]);
  // The scene's dim set is the UNION of the filter dim and the isolate dim (both recede a bar; the two
  // are independent, dimming composes). Absent when neither is active ⇒ no `dimmedIds` scene field ⇒
  // byte-for-byte today's paint.
  const dimmedIds = useMemo<Set<string> | undefined>(() => {
    if (!filterDimmedIds && !isolateDimmed) return undefined;
    if (filterDimmedIds && !isolateDimmed) return filterDimmedIds;
    if (!filterDimmedIds && isolateDimmed) return isolateDimmed;
    const union = new Set(filterDimmedIds);
    for (const id of isolateDimmed!) union.add(id);
    return union;
  }, [filterDimmedIds, isolateDimmed]);
  // The Colour-by fill + inside-label ink overrides. Criticality (the default) ⇒ `undefined` so the
  // painter's own criticality fills/inks run (byte-for-byte parity); the other modes precompute per-id
  // maps from the token palette. Re-resolved on a theme switch (`themeVersion`) so the recoloured bars
  // and their labels track light/dark, like the base painter (C1/U3). `barInk` is paired 1:1 with
  // `barFill` so an inside-bar label clears 4.5:1 on the recoloured hue (WCAG 1.4.3; U2/A1).
  const barFill = useMemo<Map<string, string> | undefined>(() => {
    if (!CANVAS_LENSES_ENABLED || colourMode === 'criticality') return undefined;
    return buildColourMap(activities, colourMode, resolveLensPalette());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- themeVersion re-resolves the token palette
  }, [colourMode, activities, themeVersion]);
  const barInk = useMemo<Map<string, string> | undefined>(() => {
    if (!CANVAS_LENSES_ENABLED || colourMode === 'criticality') return undefined;
    return buildColourInkMap(activities, colourMode, resolveLensPalette());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- themeVersion re-resolves the token palette
  }, [colourMode, activities, themeVersion]);
  // The baseline ghost bars — the captured baseline spans joined to the live lanes. Absent unless the
  // overlay is on AND there are variance rows to draw (and at least one joins a live activity).
  const baselineGhosts = useMemo(() => {
    if (!CANVAS_LENSES_ENABLED || !baselineOverlay || !varianceRows || varianceRows.length === 0) {
      return undefined;
    }
    const laneById = new Map(
      activities.map((a) => [a.id, { laneIndex: a.laneIndex, isMilestone: isMilestone(a.type) }]),
    );
    const ghosts = buildBaselineGhosts(varianceRows, laneById);
    return ghosts.length > 0 ? ghosts : undefined;
  }, [baselineOverlay, varianceRows, activities]);
  // ── Over-allocation highlight (Stage E M2, spec `docs/specs/canvas-resource-view/`) ──────────
  // The ids of the engine-flagged over-allocated activities (`levelingWindowExceeded ||
  // selfOverAllocated`, ADR-0041) — marked on the canvas with a badge + in the parallel listbox, and
  // announced. Read ENGINE-OWNED flags only (never re-derive over-allocation client-side). Absent when
  // the mode is off, the flag is off, or nothing is over-allocated (`overAllocatedIds` returns
  // undefined on an empty set) — so no `flaggedIds` scene field ⇒ byte-for-byte today's paint.
  const flaggedIds = useMemo<Set<string> | undefined>(() => {
    if (!CANVAS_RESOURCE_VIEW_ENABLED || !overAllocationHighlight) return undefined;
    return overAllocatedIds(activities);
  }, [overAllocationHighlight, activities]);
  // A **value-stable** signature of the flagged set (sorted ids), so the announce effect below fires only
  // on a real change — not on every unrelated refetch that hands `activities` a fresh array reference with
  // the SAME over-allocated ids (which would otherwise re-speak the identical announcement, N4). Empty ⇒
  // `''` (activity ids never contain a comma, so the split-count below is exact).
  const flaggedSignature = useMemo(
    () => (flaggedIds ? [...flaggedIds].sort().join(',') : ''),
    [flaggedIds],
  );
  // Announce the filter match count for AT (WCAG 4.1.3) — the canvas dimming is otherwise invisible.
  // Debounced (announce, not paint): a burst of keystrokes speaks once the query settles. When the
  // filter clears (active → inactive), announce a neutral empty message so the polite live region drops
  // the stale "N of M activities match" text rather than leaving it to be re-read. Off when the flag is
  // off (the effect early-returns, so it is inert then).
  const filterWasActiveRef = useRef(false);
  useEffect(() => {
    if (!CANVAS_LENSES_ENABLED) return;
    if (!filterActive) {
      if (filterWasActiveRef.current) announce(''); // clear the stale count only on the clear transition
      filterWasActiveRef.current = false;
      return;
    }
    filterWasActiveRef.current = true;
    const total = activities.length;
    // Count against the FILTER dim only (not the combined `dimmedIds`, which may also carry the isolate
    // complement) so "N of M match" reports the search/filter result truthfully.
    const matched = total - (filterDimmedIds?.size ?? 0);
    const handle = setTimeout(() => {
      announce(matched === 0 ? 'No activities match.' : `${matched} of ${total} activities match.`);
    }, 400);
    return () => clearTimeout(handle);
  }, [filterActive, activities.length, filterDimmedIds, announce]);
  // Announce isolate for AT (WCAG 4.1.3 / 1.4.1) — the canvas dimming + listbox marking are otherwise
  // colour/emphasis-only. Fires on activate, selection change, or mode change; clears on exit. Isolate
  // changes only on those (not per keystroke), so no debounce is needed. Inert when the flag is off.
  const isolateWasActiveRef = useRef(false);
  useEffect(() => {
    if (!CANVAS_NAV_ENABLED) return;
    if (!isolateChain || selectedId === null) {
      if (isolateWasActiveRef.current) announce('');
      isolateWasActiveRef.current = false;
      return;
    }
    isolateWasActiveRef.current = true;
    const target = activities.find((a) => a.id === selectedId);
    const name = target?.name ?? 'the selected activity';
    const count = isolateChain.size;
    announce(
      `Isolating ${count} ${count === 1 ? 'activity' : 'activities'} on the ${
        navState.isolateMode === 'driving' ? 'driving' : 'full'
      } logic path for ${name}.`,
    );
  }, [isolateChain, selectedId, navState.isolateMode, activities, announce]);
  // Announce the over-allocation count for AT (WCAG 4.1.3 / 1.4.1) — the canvas badges + listbox marking
  // are otherwise shape/emphasis-only. Fires when the highlight turns on or the flagged set changes;
  // clears on exit. Changes only on those (not per keystroke), so no debounce is needed. Inert when the
  // flag/mode is off (the effect early-returns), keeping the a11y tree byte-for-byte then.
  const overAllocWasActiveRef = useRef(false);
  useEffect(() => {
    if (!CANVAS_RESOURCE_VIEW_ENABLED || !overAllocationHighlight) {
      if (overAllocWasActiveRef.current) announce('');
      overAllocWasActiveRef.current = false;
      return;
    }
    overAllocWasActiveRef.current = true;
    // Derive the count from the stable signature (not `flaggedIds.size`), so the object ref stays out of
    // the deps and the effect keys purely on value-stable inputs (N4).
    const count = flaggedSignature === '' ? 0 : flaggedSignature.split(',').length;
    const total = activities.length;
    // The NOUN follows `total`, the VERB follows `count` (N1) — so count=1/total=2 reads
    // "1 of 2 activities is over-allocated." rather than the ungrammatical "…activity is…".
    announce(
      count === 0
        ? 'No activities are over-allocated.'
        : `${count} of ${total} ${total === 1 ? 'activity' : 'activities'} ${
            count === 1 ? 'is' : 'are'
          } over-allocated.`,
    );
  }, [overAllocationHighlight, flaggedSignature, activities.length, announce]);
  // Apply a Next-conflict selection command from the toolbar (canvas nav): select the requested activity
  // so the canvas rings it (the toolbar centres it first, so the reveal-on-select pan is a no-op). De-
  // duped by the signal's `nonce` so repeated jumps to the same id still fire. Inert when the flag is off.
  // Sync the canvas selection from the toolbar's one-shot **select signal** (the external command system
  // the effect subscribes to, de-duped by `nonce`). Set it WITHOUT announcing — the toolbar already
  // announced "Conflict i of n", which a description announce would overwrite. This is the effect rule's
  // endorsed "subscribe to an external system, setState in response" case (like the delete-reconcile
  // effect below), so the direct setState is intentional.
  const selectSignalSeenRef = useRef<number | null>(navState.selectSignal?.nonce ?? null);
  useEffect(() => {
    if (!CANVAS_NAV_ENABLED) return;
    const signal = navState.selectSignal;
    if (!signal || signal.nonce === selectSignalSeenRef.current) return;
    selectSignalSeenRef.current = signal.nonce;
    if (activities.some((a) => a.id === signal.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external one-shot signal → selection sync
      setSelectedId(signal.id);
      // Move DOM focus into the parallel listbox so `aria-activedescendant` is actually conveyed and an
      // SR user who pressed the toolbar's Next-conflict button LANDS on the conflict (a11y-rec-1) — not
      // just hears the announcement. Guarded to this conflict-cycle path so ordinary canvas selection
      // never steals focus; the guard also stops the listbox's `onFocus` from re-selecting row 0.
      conflictFocusPendingRef.current = true;
      listboxRef.current?.focus();
    }
  }, [navState.selectSignal, activities]);

  const isCalculated = activities.some((a) => a.earlyStart !== null);
  // The interactive canvas mounts once there's a timeline origin. Normally that also needs a
  // computed schedule (`isCalculated`), but canvas-first authoring (ADR-0032) mounts a **blank,
  // draw-ready** canvas before any recalc so the first activity can be placed on it; uncalculated
  // bars simply don't paint (`paint.ts` skips `earlyStart === null`).
  const showDiagram = dataDate !== null && (isCalculated || CANVAS_AUTHORING_ENABLED);
  const editingEnabled = showDiagram && canEdit && TSLD_EDITING_ENABLED && onCreate !== undefined;

  // The floating selection-actions bar (ADR-0031) is wired iff the host supplies the object actions
  // (open-logic + edit + delete). Its mutating actions are pen-gated as a set via `canEditSchedule`,
  // mirroring the main toolbar's `authoringEnabled` (role + pen). Read actions stay available. The
  // context is null when nothing's selected or the host didn't opt in — the bar then renders nothing.
  const selectionActionsWired =
    onOpenLogic !== undefined && onEditActivity !== undefined && onDeleteActivity !== undefined;
  const selectionCtx = useMemo<SelectionActionContext | null>(() => {
    if (!onOpenLogic || !onEditActivity || !onDeleteActivity) return null;
    const activity = selectedId ? activities.find((a) => a.id === selectedId) : undefined;
    if (!activity) return null;
    return {
      targetName: activity.name,
      canEditSchedule: canEdit,
      canReportProgress,
      // Whether this selection can carry weighted steps (host predicate; false when absent) — matching
      // the activities-table's `!isDurationDerivedType` gate. Read by the Steps item's `isVisible`.
      stepsEligible: isStepsEligible ? isStepsEligible(activity) : false,
      onOpenLogic: () => onOpenLogic(activity),
      onEdit: () => onEditActivity(activity),
      onDelete: () => onDeleteActivity(activity),
      // The entry-route actions (Progress / Resources / Steps). Each is a no-op when the host didn't wire
      // it (the corresponding toolbar item is itself flag-gated, so it only renders when the flag — and
      // this handler — are present); building them unconditionally keeps the fields plain + required.
      onResources: () => onResources?.(activity),
      onProgress: () => onProgress?.(activity),
      onSteps: () => onSteps?.(activity),
    };
  }, [
    selectedId,
    activities,
    canEdit,
    canReportProgress,
    isStepsEligible,
    onOpenLogic,
    onEditActivity,
    onDeleteActivity,
    onResources,
    onProgress,
    onSteps,
  ]);

  // View controls (read-only or editing) — zoom preset (reflected from the canvas's coarse
  // stop-crossing callback) + layer toggles + the imperative canvas handle — now live in the
  // shared {@link useTsldCanvasUiState} above so the canvas-first toolbar can drive them (ADR-0031).

  // The non-working predicate + today marker offset, derived from the plan calendar / today. The
  // predicate is memoised (referentially stable) so it doesn't re-trigger the canvas scene effect
  // every render (ADR-0026 D3 / ui-architect note); both are null when their inputs are absent.
  const workingDayPredicate = useMemo(
    () => (calendar && dataDate ? makeWorkingDayPredicate(dataDate, calendar) : null),
    [calendar, dataDate],
  );
  const todayOffset = useMemo(
    () => (dataDate && todayIso ? daysBetween(dataDate, todayIso) : null),
    [dataDate, todayIso],
  );

  const select = (id: string | null): void => {
    setSelectedId(id);
    if (id) {
      // Reuse the memoised Tier-1 line (it already carries the lane-overlap clause) rather than
      // recomputing describeActivity here, so the spoken line matches the listbox exactly.
      const description = optionDescriptions.get(id);
      if (description) announce(description);
    }
  };

  // Keep the focused activity's list position, so if it's deleted elsewhere (arriving via a
  // refetch) we can move the ring to the nearest survivor rather than stranding keyboard focus.
  const selectedIndexRef = useRef(0);
  useEffect(() => {
    if (selectedId === null) return;
    const idx = activities.findIndex((a) => a.id === selectedId);
    if (idx >= 0) {
      selectedIndexRef.current = idx;
      return;
    }
    // The selected bar vanished — reconcile selection to the nearest remaining activity.
    const next = activities[Math.min(selectedIndexRef.current, activities.length - 1)];
    setSelectedId(next ? next.id : null);
    announce('Activity removed.');
  }, [activities, selectedId, announce]);

  // Report the selection to the host on every transition (toolbar quick-wins F0), so the main toolbar's
  // selection-aware items track it. One effect covers all paths — select / chain-nav / focus and the
  // delete-reconcile above — rather than threading the callback through each `setSelectedId` site. The
  // host's callback is a stable `useCallback`, so this fires only on a real selection change; an absent
  // callback is a no-op (unchanged behaviour for the flag-off / legacy hosts).
  useEffect(() => {
    onSelectionChange?.(selectedId);
  }, [selectedId, onSelectionChange]);

  // Coalesced keyboard nudge (M5 5.2) — a held Alt+arrow becomes one net write per burst, read at
  // the live version, serialized, flushed on unmount, and race-free vs. an in-flight pointer drag.
  // The full state machine + its correctness reasoning live in the hook (unit-tested there).
  const pointerRepositionBusyRef = useRef(false);
  const nudge = useCoalescedNudge({
    onReposition,
    activities,
    dataDate,
    setGhost: setPendingReposition,
    // A nudge conflict is a stale-version reject (refreshable); null clears the banner.
    setConflict: (message) => (message === null ? clearConflict() : showConflict(message)),
    announce,
    isPointerBusy: () => pointerRepositionBusyRef.current,
  });
  // Coalesced duration nudge (ADR-0052 M2, WCAG 2.5.7) — the `Shift+←/→` keyboard equivalent of
  // the finish-edge resize drag, sharing the pointer-busy gate + ghost + banner seams with the
  // reposition nudge above. Inert unless the direct-manipulation flag armed the keyboard branch.
  const durationNudge = useCoalescedDurationNudge({
    onResize,
    activities,
    dataDate,
    setGhost: setPendingReposition,
    setConflict: (message) => (message === null ? clearConflict() : showConflict(message)),
    announce,
    isPointerBusy: () => pointerRepositionBusyRef.current,
  });

  const onListKeyDown = (event: React.KeyboardEvent): void => {
    if (activities.length === 0) return;
    // LOE endpoint-pick keyboard path (Stage D) — the parallel-DOM equivalent of the pointer two-pick,
    // so the tool is fully keyboard-operable (WCAG 2.1.1). In the LOE tool, Enter picks the FOCUSED
    // activity: first as the start driver (prompt for the finish), then — on a DIFFERENT activity — it
    // commits the span. Re-picking the same activity is rejected + re-prompted (spec §Edge cases).
    // Escape (the canvas window listener) disarms the whole tool. Takes precedence over the Enter →
    // open-logic path below while the tool is armed.
    if (editingEnabled && mode === 'loe' && onLoeSpan && event.key === 'Enter') {
      event.preventDefault();
      const current = activities.find((a) => a.id === selectedId);
      if (!current) return;
      if (loeStartId === null) {
        setLoeStartId(current.id);
        announce(
          `Picked “${current.name}” as the level-of-effort start driver. Now pick the finish driver.`,
        );
        return;
      }
      if (current.id === loeStartId) {
        announce('That’s the start driver — pick a different activity as the finish driver.');
        return;
      }
      runLoeSpan(loeStartId, current.id);
      return;
    }
    // Enter on the focused activity opens its logic (dependency) editor — the keyboard path for
    // creating links, so link-draw introduces no pointer-only capability (WCAG 2.1.1).
    if (event.key === 'Enter' && onOpenLogic) {
      const current = activities.find((a) => a.id === selectedId);
      if (current) {
        event.preventDefault();
        onOpenLogic(current);
      }
      return;
    }
    // ? opens the keyboard-shortcuts help (discoverability, read — no flag).
    if (event.key === '?') {
      event.preventDefault();
      setShowHelp(true);
      return;
    }
    // [ / ] — driving-first chain navigation to the predecessor / successor (read — no flag).
    // Selection follows (the canvas reveals + rings it); the announcement names the tie + driving,
    // so driving/logic context is delivered exactly when a planner traces the path (M5 §2/§3).
    if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      const current = activities.find((a) => a.id === selectedId);
      if (!current) return;
      const dir = event.key === '[' ? 'pred' : 'succ';
      const neighbour = chainNeighbour(current.id, dependencies, dir);
      if (neighbour) setSelectedId(neighbour.id);
      announce(announceChainStep(dir, neighbour));
      return;
    }
    // Space — Tier-2 "tell me more": logic ties + driving for the focused activity (read — no flag).
    if (event.key === ' ') {
      event.preventDefault();
      const current = activities.find((a) => a.id === selectedId);
      if (current) announce(summarizeLogic(current.id, dependencies));
      return;
    }
    // Shift+←/→ nudges the focused activity's DURATION one day (ADR-0052 M2) — the keyboard
    // equivalent of the finish-edge resize drag (WCAG 2.5.7), coalesced like the Alt+arrow moves.
    // Same eligibility as the pointer path: the flag, a wired handler, editing, and a bar whose
    // duration is a real user input (milestones / LOE / WBS summaries no-op). Flag-off this branch
    // is unreachable, so the listbox keymap is byte-for-byte today's.
    if (
      CANVAS_DIRECT_MANIPULATION_ENABLED &&
      editingEnabled &&
      onResize &&
      event.shiftKey &&
      !event.altKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault();
      const current = activities.find((a) => a.id === selectedId);
      if (!current || !isResizeEligibleType(current.type)) return;
      durationNudge(current, event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    // Alt+arrows nudge the focused activity — vertical = lane (no recalc), horizontal = start day
    // (an SNET constraint, recalcs). The keyboard equivalent of a free-2D drag, coalesced so a held
    // key is one net write (WCAG 2.1.1; no pointer-only capability). Behind the edit flag.
    if (
      editingEnabled &&
      onReposition &&
      event.altKey &&
      (event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight')
    ) {
      event.preventDefault();
      const current = activities.find((a) => a.id === selectedId);
      if (!current) return;
      if (event.key === 'ArrowUp') nudge(current, 'lane', -1);
      else if (event.key === 'ArrowDown') nudge(current, 'lane', 1);
      else if (event.key === 'ArrowLeft') nudge(current, 'time', -1);
      else nudge(current, 'time', 1);
      return;
    }
    // n opens the create-activity popover pre-filled from the focused activity's lane + start —
    // in-canvas keyboard parity for create (the activities-table dialog is the 2.1.1 alternative).
    if (editingEnabled && (event.key === 'n' || event.key === 'N')) {
      event.preventDefault();
      const current = activities.find((a) => a.id === selectedId);
      const startDay =
        current?.earlyStart && dataDate ? daysBetween(dataDate, current.earlyStart) : 0;
      clearConflict();
      createReturnFocusRef.current = listboxRef.current; // return focus to the list, not the toolbar
      setPendingCreate({
        type: createType ?? 'TASK',
        startDay,
        endDay: startDay,
        laneIndex: current ? current.laneIndex : 0,
        anchor: KEYBOARD_CREATE_ANCHOR,
        saving: false,
        error: null,
      });
      return;
    }
    const index = activities.findIndex((a) => a.id === selectedId);
    let next = index;
    if (event.key === 'ArrowDown') next = Math.min(activities.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index < 0 ? 0 : index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = activities.length - 1;
    else return;
    event.preventDefault();
    const target = activities[next];
    if (target) select(target.id);
  };

  const closeCreate = (): void => {
    setPendingCreate(null);
    // Return focus to wherever create was invoked from (the listbox for `n`, else the tool).
    (createReturnFocusRef.current ?? addActivityRef.current)?.focus();
    createReturnFocusRef.current = null;
  };

  // Auto-arrange (M4 4.3): pack the drawn (dated) activities into the fewest non-overlapping lanes.
  // Pure `packLanes` computes the minimal set of moves; undated activities have no x-span → keep
  // their lane. (Returns [] when the plan isn't schedulable — a dead case, since the toolbar only
  // renders when editing is enabled, which already requires a data date.)
  const computeArrangeChanges = (): { id: string; laneIndex: number }[] => {
    if (dataDate === null) return [];
    const packItems = activities.flatMap((a) =>
      a.earlyStart === null
        ? []
        : [
            {
              id: a.id,
              startDay: daysBetween(dataDate, a.earlyStart),
              endDay: daysBetween(dataDate, a.earlyFinish ?? a.earlyStart),
              laneIndex: a.laneIndex,
            },
          ],
    );
    return packLanes(packItems);
  };

  // Toolbar click: compute the pack up front so an already-tidy diagram reports "nothing to move"
  // immediately (no pointless confirm round-trip, and no dialog that could dead-end) — only open
  // the confirm when there is actually something to reorder.
  const openAutoArrange = (): void => {
    if (!onAutoArrange) return;
    const changes = computeArrangeChanges();
    if (changes.length === 0) {
      announce('Lanes are already arranged; nothing to move.');
      return;
    }
    setArrangeChanges(changes);
    setConfirmArrange(true);
  };

  // Confirm: persist exactly the changes shown to the user (the route owns the batch write).
  const runAutoArrange = (): void => {
    if (!onAutoArrange || arrangeChanges.length === 0) return;
    clearConflict();
    setArranging(true);
    void onAutoArrange(arrangeChanges)
      .then((outcome) => {
        setArranging(false);
        setConfirmArrange(false);
        if (outcome.conflict) showConflict(outcome.conflict);
        if (outcome.applied) {
          const n = arrangeChanges.length;
          announce(`Lanes auto-arranged; ${n} ${n === 1 ? 'activity' : 'activities'} moved.`);
        }
      })
      .catch((err: unknown) => {
        setArranging(false);
        setConfirmArrange(false);
        showConflict(err instanceof Error ? err.message : 'Couldn’t auto-arrange the lanes.');
      });
  };

  // When chromeless, the workspace toolbar triggers auto-arrange by bumping `autoArrangeSignal`
  // (the on-canvas TsldToolbar button is gone). Open the same confirm flow on each bump; the ref
  // skips the initial value so a fresh mount never auto-opens (ADR-0031).
  const arrangeSignalSeen = useRef(autoArrangeSignal);
  useEffect(() => {
    if (autoArrangeSignal === arrangeSignalSeen.current) return;
    arrangeSignalSeen.current = autoArrangeSignal;
    openAutoArrange();
    // openAutoArrange reads current activities at call time; re-run only on a new signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoArrangeSignal]);

  // Compose the LOE span from the two picked drivers (Stage D) — shared by the pointer commit (a
  // `loeSpan` intent) and the keyboard commit (the second listbox Enter). Clears the pick, then hands
  // off to the route's `onLoeSpan` (which owns the create + SS/FF + one-undo + rollback + recalc);
  // announces only when the span actually landed, mirroring the link path's outcome handling.
  const runLoeSpan = (startDriverId: string, finishDriverId: string): void => {
    if (!onLoeSpan) return;
    clearConflict();
    setLoeStartId(null);
    const start = activities.find((a) => a.id === startDriverId);
    const finish = activities.find((a) => a.id === finishDriverId);
    void onLoeSpan({ startDriverId, finishDriverId })
      .then((outcome) => {
        if (outcome.conflict) showConflict(outcome.conflict);
        if (outcome.applied) {
          announce(
            `Added a level-of-effort span from “${start?.name ?? 'activity'}” to “${finish?.name ?? 'activity'}”.`,
          );
          // Disarm the tool after a successful compose (spec §2/§workflow AC; WCAG 4.1.3 — a sticky
          // armed state reads as ambiguous to AT after the success announcement). This intentionally
          // diverges from the Link tool's sticky-after-commit behaviour — the LOE spec wants a disarm.
          // Flag the disarm as commit-driven so the mode effect doesn't ALSO announce "cancelled" over
          // the success message (B2 sequencing). A conflict/rollback keeps the tool armed for a retry.
          loeCommitDisarmRef.current = true;
          setMode('select');
        }
      })
      .catch((err: unknown) => {
        showConflict(err instanceof Error ? err.message : 'Couldn’t add the level-of-effort span.');
      });
  };

  // The LOE tool's per-pick feedback from the canvas (Stage D) — announce the prompt + keep the
  // parallel `loeStartId` in step with the pointer pick, so the keyboard and pointer flows agree.
  const handleLoeSpanStep = (step: LoeSpanStep): void => {
    if (step.kind === 'start') {
      setLoeStartId(step.startId);
      const picked = activities.find((a) => a.id === step.startId);
      announce(
        `Picked “${picked?.name ?? 'activity'}” as the level-of-effort start driver. Now pick the finish driver.`,
      );
    } else if (step.kind === 'reprompt') {
      announce('That’s the start driver — pick a different activity as the finish driver.');
    } else {
      setLoeStartId(null);
      announce('Level-of-effort pick cancelled. Pick the start driver.');
    }
  };

  const onIntent = (intent: EditIntent, anchor: Point): void => {
    // Ignore a new gesture while a create popover or a reposition is already in flight.
    if (pendingCreate || pendingReposition) return;
    if (intent.kind === 'create') {
      clearConflict();
      setPendingCreate({ ...intent, anchor, saving: false, error: null });
      return;
    }
    if (intent.kind === 'reposition') {
      const activity = activities.find((a) => a.id === intent.activityId);
      if (!activity || !onReposition) return;
      clearConflict();
      // Snap to grid (canvas nav, `docs/specs/canvas-nav/`, Visual mode): round the dropped day to the
      // nearest working day BEFORE the PATCH — only in Visual mode (`barDateSource === 'visual'`), only
      // when the toggle is on, and only when a day actually changed. Off / flag-off ⇒ the raw dropped
      // day, byte-for-byte (the PATCH contract, undo record and auto-recalc are all unchanged; this only
      // adjusts the day value fed into the existing `startDay`). The snapped value drives BOTH the
      // optimistic ghost and the write so the preview matches what saves.
      const snappedStartDay =
        CANVAS_NAV_ENABLED &&
        navState.snapToGrid &&
        barDateSource === 'visual' &&
        intent.startDay !== undefined &&
        workingDayPredicate
          ? snapToWorkingDay(intent.startDay, workingDayPredicate)
          : intent.startDay;
      // Free-2D: the intent carries only the axes that changed. Fill the unchanged axis from the
      // activity's current geometry so the optimistic ghost sits at the resulting day+lane.
      const span =
        activity.earlyStart && activity.earlyFinish
          ? daysBetween(activity.earlyStart, activity.earlyFinish)
          : 0;
      const currentStartDay =
        activity.earlyStart && dataDate ? daysBetween(dataDate, activity.earlyStart) : 0;
      const startDay = snappedStartDay ?? currentStartDay;
      const laneIndex = intent.laneIndex ?? activity.laneIndex;
      setPendingReposition({ startDay, endDay: startDay + span, laneIndex });
      // Flag the pointer write in flight so a keyboard nudge can't race it (M5 5.2).
      pointerRepositionBusyRef.current = true;
      void onReposition({
        activityId: intent.activityId,
        ...(snappedStartDay !== undefined ? { startDay: snappedStartDay } : {}),
        ...(intent.laneIndex !== undefined ? { laneIndex: intent.laneIndex } : {}),
      })
        .then((outcome) => {
          setPendingReposition(null);
          if (outcome.conflict) showConflict(outcome.conflict);
          // Announce "Moved" only when the move actually landed, so it never contradicts a
          // "wasn't applied" conflict banner (WCAG 4.1.3); name the new lane when it changed and,
          // for any time change (SNET + recalc), that the dates will update — matching the keyboard
          // nudge's wording so the same operation reads the same to AT users.
          if (outcome.applied) {
            const timeChanged = intent.startDay !== undefined;
            const laneChanged = intent.laneIndex !== undefined;
            // When Snap actually ROUNDED the dropped day to a working day (`snappedStartDay` differs
            // from the raw drop), name the resulting working day so the snap is legible to AT (a11y-rec-2)
            // — otherwise the generic "dates will update" wording. The snapped day is a working-day
            // offset from the data date; the existing `addCalendarDays` + formatter turn it into a date.
            const snappedDay =
              intent.startDay !== undefined &&
              snappedStartDay !== undefined &&
              snappedStartDay !== intent.startDay
                ? snappedStartDay
                : null;
            const snappedDate =
              snappedDay !== null && dataDate
                ? formatCalendarDate(addCalendarDays(dataDate, snappedDay))
                : null;
            announce(
              snappedDate
                ? `Moved and snapped “${activity.name}” to ${snappedDate}${laneChanged ? ` in lane ${laneIndex + 1}` : ''}.`
                : laneChanged
                  ? `Moved “${activity.name}” to lane ${laneIndex + 1}${timeChanged ? '; dates will update' : ''}.`
                  : `Moved “${activity.name}”; dates will update.`,
            );
          }
        })
        .catch((err: unknown) => {
          setPendingReposition(null);
          showConflict(err instanceof Error ? err.message : 'Couldn’t move the activity.');
        })
        .finally(() => {
          pointerRepositionBusyRef.current = false;
        });
      return;
    }
    if (intent.kind === 'resize') {
      // Bar-end resize (ADR-0052 M2 finish edge, M3 start edge) — the reposition contract. A
      // finish drag pins the start (the ghost's right edge tracks the new duration); a start drag
      // pins the finish (the ghost's left edge tracks the new start; the route maps it mode-aware,
      // ADR-0052 §3). The route owns the PATCH + recalc; a stale-version refusal banners.
      const activity = activities.find((a) => a.id === intent.activityId);
      if (!activity || !onResize) return;
      clearConflict();
      const startDay =
        intent.edge === 'start'
          ? intent.newStartDay
          : activity.earlyStart && dataDate
            ? daysBetween(dataDate, activity.earlyStart)
            : 0;
      const days = intent.newDurationDays;
      setPendingReposition({
        startDay,
        endDay: startDay + days - 1,
        laneIndex: activity.laneIndex,
      });
      // Share the pointer-busy gate with reposition so a keyboard nudge can't race this write.
      pointerRepositionBusyRef.current = true;
      void onResize({
        activityId: intent.activityId,
        durationDays: days,
        ...(intent.edge === 'start' ? { startDay: intent.newStartDay } : {}),
      })
        .then((outcome) => {
          setPendingReposition(null);
          if (outcome.conflict) showConflict(outcome.conflict);
          // Announce only when the resize actually landed (WCAG 4.1.3), wording matched to the
          // keyboard nudge so the same operation reads the same to AT users. A start drag also
          // names the new start date — the number that edge actually chose.
          if (outcome.applied) {
            const newStart =
              intent.edge === 'start' && dataDate
                ? formatCalendarDate(addCalendarDays(dataDate, intent.newStartDay))
                : null;
            announce(
              newStart
                ? `Moved the start of “${activity.name}” to ${newStart} (${days} ${days === 1 ? 'day' : 'days'}, finish unchanged); dates will update.`
                : `Resized “${activity.name}” to ${days} ${days === 1 ? 'day' : 'days'}; dates will update.`,
            );
          }
        })
        .catch((err: unknown) => {
          setPendingReposition(null);
          showConflict(err instanceof Error ? err.message : 'Couldn’t resize the activity.');
        })
        .finally(() => {
          pointerRepositionBusyRef.current = false;
        });
      return;
    }
    if (intent.kind === 'lag') {
      // Lag-anchor drag (ADR-0052 M3): the dependency PATCH echoing the unchanged type + lag
      // calendar. No optimistic ghost — the link redraws from the persisted lag on refetch, and
      // the readout chip already previewed the value through the drag.
      if (!onLag) return;
      const dependency = dependencies.find((d) => d.id === intent.dependencyId);
      clearConflict();
      void onLag({ dependencyId: intent.dependencyId, lagDays: intent.newLagDays })
        .then((outcome) => {
          if (outcome.conflict) showConflict(outcome.conflict);
          // Announce only when the change actually landed (WCAG 4.1.3), speaking the same
          // lagPhrase the a11y layer uses for the drawn offset.
          if (outcome.applied && dependency) {
            const phrase = lagPhrase({
              type: dependency.type,
              lagDays: intent.newLagDays,
              lagCalendar: dependency.lagCalendar,
            });
            announce(
              `Set the link “${dependency.predecessor.name}” → “${dependency.successor.name}” to ${phrase}${intent.newLagDays === 0 ? ' (no lag)' : ''}; dates will update.`,
            );
          }
        })
        .catch((err: unknown) => {
          showConflict(err instanceof Error ? err.message : 'Couldn’t change the link’s lag.');
        });
      return;
    }
    if (intent.kind === 'link') {
      if (!onLink) return;
      clearConflict();
      const pred = activities.find((a) => a.id === intent.predecessorId);
      const succ = activities.find((a) => a.id === intent.successorId);
      // Client-side legality pre-check (ADR-0026 D5): if the loaded graph already proves the link
      // illegal (self/duplicate/cycle), surface it locally and skip the doomed POST. The server
      // stays authoritative for anything the client can't yet see.
      const illegal = linkLegality(
        intent.predecessorId,
        intent.successorId,
        intent.type,
        renderEdges,
      );
      if (illegal) {
        // Not refreshable — the verdict is from the loaded graph, so Refresh can't change it. The
        // banner's `role="alert"` announces it (no extra `announce()` — that would double-speak).
        // NB: `self` is currently unreachable via pointer (the gesture machine never targets the
        // source), kept as a mirror of the server invariant for future entry points.
        showConflict(linkIllegalMessage(illegal), false);
        return;
      }
      void onLink({
        predecessorId: intent.predecessorId,
        successorId: intent.successorId,
        type: intent.type,
      })
        .then((outcome) => {
          if (outcome.conflict) showConflict(outcome.conflict);
          // Announce only when the link was actually created (never on a cycle/duplicate reject).
          if (outcome.applied) {
            announce(`Linked “${pred?.name ?? 'activity'}” to “${succ?.name ?? 'activity'}”.`);
          }
        })
        .catch((err: unknown) => {
          showConflict(err instanceof Error ? err.message : 'Couldn’t create the link.');
        });
    }
    if (intent.kind === 'loeSpan') {
      // The two-click LOE tool committed (Stage D). Compose the span via the shared helper — the route
      // owns the create + SS/FF edges + one-undo + rollback + recalc (`model.createLoeSpan`).
      runLoeSpan(intent.startDriverId, intent.finishDriverId);
    }
  };

  const commitCreate = (name: string): void => {
    if (!pendingCreate || !onCreate) return;
    const { type, startDay, endDay, laneIndex } = pendingCreate;
    setPendingCreate((p) => (p ? { ...p, saving: true, error: null } : p));
    // onCreate resolves iff the row persisted → close and never re-POST. A recalc conflict is
    // non-fatal (row kept) and shown in the banner; only a create failure keeps the popover.
    void onCreate({ name, type, startDay, endDay, laneIndex })
      .then((outcome) => {
        closeCreate();
        announce(`Activity “${name}” added.`);
        if (outcome.recalcConflict) showConflict(outcome.recalcConflict);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Couldn’t add the activity.';
        setPendingCreate((p) => (p ? { ...p, saving: false, error: message } : p));
      });
  };

  // Canvas-first authoring (ADR-0032) mounts a blank, draw-ready canvas on an empty plan (there's a
  // timeline anchor via `dataDate`), so skip the empty-state note in that case and fall through to
  // the interactive canvas below. Flag-off — or with no anchor — keep today's empty-state note.
  if (activities.length === 0 && !(CANVAS_AUTHORING_ENABLED && showDiagram)) {
    return (
      <div
        className={cn(
          'border-border text-muted-foreground flex items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm',
          // In the canvas-first workspace the region is tall; fill it and centre the message
          // rather than leaving a small box pinned to the top (ADR-0030). Boxed otherwise.
          fill ? 'h-full min-h-[240px]' : '',
        )}
      >
        No activities to diagram yet. Add activities to this plan to see the logic diagram.
      </div>
    );
  }

  return (
    <section
      aria-label="Time-scaled logic diagram"
      className={fill ? 'flex h-full min-h-0 flex-col gap-2' : 'flex flex-col gap-2'}
    >
      {chromeless ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">
            {!isCalculated
              ? 'Recalculate the schedule to plot the activities on the timeline.'
              : editingEnabled && mode === 'add-activity'
                ? 'Drag on the timeline to add an activity. Esc cancels.'
                : editingEnabled
                  ? 'Drag a bar to move it in time or to another lane, or drag from a bar’s edge to link it (Shift = SS, Alt = FF); drag empty space to pan.'
                  : 'Drag to pan, scroll to zoom. The critical path is highlighted.'}
          </p>
          {editingEnabled ? (
            <TsldToolbar
              mode={mode}
              onModeChange={setMode}
              {...(onAutoArrange ? { onAutoArrange: openAutoArrange } : {})}
              addActivityRef={addActivityRef}
            />
          ) : null}
          {showDiagram ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHelp(true)}
              aria-haspopup="dialog"
            >
              Keyboard shortcuts
            </Button>
          ) : null}
        </div>
      )}

      {/* Always-available view controls (read-only or editing): zoom, Fit, and layer toggles.
          Hosted by the workspace toolbar instead when chromeless (ADR-0031). */}
      {!chromeless && showDiagram ? (
        <TsldViewControls
          zoomPreset={zoomPreset}
          onZoomPreset={(level) => canvasControlRef.current?.zoomToPreset(level)}
          onZoomStep={(factor) => canvasControlRef.current?.stepZoom(factor)}
          onFit={requestFit}
          toggles={viewToggles}
          onToggle={toggleView}
        />
      ) : null}

      {conflict ? (
        <EditConflictBanner
          message={conflict.message}
          onDismiss={() => clearConflict()}
          {...(conflict.refreshable && onRefresh
            ? {
                onRefresh: () => {
                  onRefresh();
                  clearConflict();
                },
              }
            : {})}
        />
      ) : null}

      {!chromeless && showDiagram ? <TsldLegend /> : null}

      <div
        className={
          fill
            ? 'border-border relative min-h-[240px] flex-1 overflow-hidden rounded-lg border'
            : 'border-border relative h-[480px] overflow-hidden rounded-lg border'
        }
      >
        {showDiagram && dataDate ? (
          <>
            <TsldCanvas
              activities={renderActivities}
              edges={renderEdges}
              dataDate={dataDate}
              selectedId={selectedId}
              onSelect={select}
              fitSignal={fitSignal}
              editing={editingEnabled}
              mode={mode}
              createType={createType}
              linkType={linkType}
              canReposition={onReposition !== undefined}
              canResize={onResize !== undefined}
              canLag={onLag !== undefined}
              canLink={onLink !== undefined}
              onIntent={onIntent}
              onLoeSpanStep={handleLoeSpanStep}
              loePickStartId={loeStartId}
              onExitAddMode={() => setMode('select')}
              view={viewToggles}
              isWorkingDay={workingDayPredicate}
              todayOffset={todayOffset}
              dimmedIds={dimmedIds}
              barFill={barFill}
              barInk={barInk}
              baselineGhosts={baselineGhosts}
              flaggedIds={flaggedIds}
              resourceStripActive={resourceStripActive}
              resourceStrip={resourceStrip}
              controlRef={canvasControlRef}
              onZoomStopChange={setZoomPreset}
              {...(selectionActionsWired ? { selectionAnchorRef } : {})}
              pending={
                pendingCreate
                  ? {
                      startDay: pendingCreate.startDay,
                      endDay: pendingCreate.endDay,
                      laneIndex: pendingCreate.laneIndex,
                    }
                  : pendingReposition
              }
            />

            {pendingCreate ? (
              <CreateActivityPopover
                x={pendingCreate.anchor.x}
                // The anchor is canvas-relative; the popover is positioned against the outer
                // container, which the ruler band offsets by RULER_HEIGHT — add it back so the
                // popover lands at the drop point, not RULER_HEIGHT above it.
                y={pendingCreate.anchor.y + RULER_HEIGHT}
                saving={pendingCreate.saving}
                error={pendingCreate.error}
                onCommit={commitCreate}
                onCancel={closeCreate}
              />
            ) : null}

            {/*
              The accessible parallel representation: a focusable listbox mirroring the
              canvas (ADR-0026). Visually hidden — the canvas is the sighted view and rings
              the selection — but fully keyboard-operable and announced, so the diagram is
              never pointer-only. `aria-activedescendant` publishes the active option to AT;
              `sr-only` keeps the widget in the a11y tree and tab order.
            */}
            <ul
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              aria-label="Activities in the diagram"
              tabIndex={0}
              className="sr-only"
              aria-activedescendant={selectedId ? optionId(selectedId) : undefined}
              onKeyDown={onListKeyDown}
              onFocus={() => {
                // A Next-conflict cycle focused us programmatically and already set the selection — skip
                // the default row-0 select so it isn't clobbered (a11y-rec-1). Consume the one-shot flag.
                if (conflictFocusPendingRef.current) {
                  conflictFocusPendingRef.current = false;
                  return;
                }
                if (!selectedId && activities[0]) select(activities[0].id);
              }}
            >
              {activities.map((a) => {
                // Mirror the canvas dimming in the parallel listbox so it isn't conveyed by
                // colour/emphasis alone (WCAG 1.4.1). Isolate (canvas nav) and the insight-lens filter
                // (`docs/specs/canvas-lenses/`) each carry their own wording; a marked option stays fully
                // selectable/navigable (dim-not-hide) — so NO `aria-disabled`, which would wrongly signal
                // an inoperable option (a11y review). When a row is dimmed by BOTH, name both causes (a
                // single-cause suffix would hide the other), rather than letting isolate silently win.
                const offPath = isolateDimmed?.has(a.id) ?? false;
                const filteredOut = filterDimmedIds?.has(a.id) ?? false;
                const marker =
                  offPath && filteredOut
                    ? ' (filtered out, off the logic path)'
                    : offPath
                      ? ' (off the logic path)'
                      : filteredOut
                        ? ' (filtered out)'
                        : '';
                // Over-allocation (Stage E M2) is an ADDITIVE highlight, not a dim — so it marks the
                // option independently of the dim marker above (a bar can be over-allocated AND dimmed),
                // mirroring the canvas badge that draws over the dim (WCAG 1.4.1 — the flag isn't
                // colour/emphasis-only). Absent `flaggedIds` ⇒ empty ⇒ byte-for-byte today's option text.
                const overAllocated = flaggedIds?.has(a.id) ?? false;
                return (
                  <li
                    key={a.id}
                    id={optionId(a.id)}
                    role="option"
                    aria-selected={a.id === selectedId}
                  >
                    {optionDescriptions.get(a.id)}
                    {marker}
                    {overAllocated ? ' (over-allocated)' : ''}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm">
            The diagram appears once the schedule has been calculated.
          </div>
        )}
      </div>

      {/* The floating object-actions bar over the selected bar (ADR-0031, Fork-2). Rendered inline
          (DOM-adjacent to the listbox for Tab order); renders nothing until an activity is selected,
          and only when the host wired the object actions. */}
      {showDiagram && selectionActionsWired ? (
        <SelectionActionsBar
          anchorRef={selectionAnchorRef}
          context={selectionCtx}
          restoreFocus={restoreSelectionFocus}
        />
      ) : null}

      <ConfirmDialog
        open={confirmArrange}
        onClose={() => setConfirmArrange(false)}
        onConfirm={runAutoArrange}
        title="Auto-arrange lanes?"
        description={
          // The no-undo caveat is only true with undo/redo OFF; flag-on, auto-arrange records a
          // reversible `autoArrangeCommand` (ADR-0048 M2.3), so drop the stale warning (B6).
          UNDO_REDO_ENABLED
            ? 'This repacks activities into the fewest lanes with no time-overlap. It changes only vertical layout, not dates.'
            : 'This repacks activities into the fewest lanes with no time-overlap. It changes only vertical layout, not dates — but it can’t be undone yet.'
        }
        confirmLabel="Auto-arrange"
        pendingLabel="Arranging…"
        confirmVariant="default"
        pending={arranging}
      />

      <TsldShortcutsHelp
        open={showHelp}
        onClose={() => setShowHelp(false)}
        editingEnabled={editingEnabled}
      />
    </section>
  );
}
