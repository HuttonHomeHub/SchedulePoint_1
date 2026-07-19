import type { ActivitySummary, ActivityType, DependencyType, SchedulingMode } from '@repo/types';
import type { ReactNode } from 'react';

import type { TsldViewToggles } from '../render/paint';
import type { ZoomLevel } from '../render/render-model';

/**
 * The context the TSLD toolbar registry ({@link tsldToolbarItems}) reads and commands (ADR-0031).
 * It is the **seam** between the generic `<Toolbar>` and the plan workspace: the registry never
 * touches the canvas or the model directly — it only reads these flags and calls these callbacks,
 * so behaviour stays sourced from `usePlanWorkspaceModel` + the canvas control handle (the M4
 * builder assembles this from the model, the canvas UI state, and the dialog openers).
 *
 * `render`-item bodies that reuse existing components (the schedule summary, the legend) are passed
 * in as ready {@link ReactNode}s (`summaryContent`, `legendContent`) so the registry stays free of
 * data-fetching and the content isn't duplicated.
 */
export interface TsldToolbarContext {
  // --- Frame / navigate (group 1) -----------------------------------------------------------
  /** The active zoom preset (drives the segmented control's pressed state). */
  zoomPreset: ZoomLevel;
  setZoomPreset: (level: ZoomLevel) => void;
  stepZoom: (factor: number) => void;
  fit: () => void;
  /** The plan's data date (`plannedStart`) — the canvas day-zero origin; null when unset. The registry
   * gates **Go to date** on it (there is a timeline to navigate only once it's set). The persisted
   * value is edited off-toolbar now (set at plan creation, changed via *Edit plan*), so there is no
   * `setPlannedStart` seam here (ADR-0031 two-row amendment). */
  plannedStart: string | null;
  /** Pan the canvas so `iso` sits at the left edge — a pure **view** jump, no fetch and no persisted
   * state (ADR-0033 M2, CQ-1). Drives the **Go to date** navigation control (flag-on only), which is
   * available to every role including read-only viewers because navigating never mutates the plan. */
  goToDate: (iso: string) => void;
  /** Today as a local calendar day (`YYYY-MM-DD`) — the target of the **Recenter on today** command
   * (`VITE_TOOLBAR_QUICK_WINS`), which reuses {@link goToDate}. View-only; offered to every role. */
  todayIso: string;

  // --- Lens / display (group 2) -------------------------------------------------------------
  viewToggles: TsldViewToggles;
  toggleView: (key: keyof TsldViewToggles) => void;
  /** The plan's scheduling mode (ADR-0033) — EARLY or VISUAL. Drives the Mode selector's pressed
   * state. Only surfaced under `SCHEDULING_MODES_ENABLED`. */
  schedulingMode: SchedulingMode;
  /** Switch the plan's scheduling mode (targeted PATCH, pen-gated). `null` when the viewer can't edit
   * the schedule — the registry then keeps the Early | Visual selector **visible but shaded** (the mode
   * changes how the diagram reads, so viewers still see which is active), operable only by writers. */
  setSchedulingMode: ((mode: SchedulingMode) => void) | null;

  // --- Tools / author (group 4, pen-gated) --------------------------------------------------
  /** True when the current edit mode is "add activity" (drives the tool's pressed state). */
  isAddingActivity: boolean;
  /** Enter/leave add-activity mode (pen-gated at the toolbar level via `authoringEnabled`). */
  toggleAddActivity: () => void;
  /** The activity kind the next canvas draw creates — Task / Start- / Finish-milestone (ADR-0032
   * M4). The Add split-button reads it for its pressed sub-item and label. */
  createType: ActivityType;
  /** Pick the activity kind the next draw creates (also enters add mode). */
  setCreateType: (type: ActivityType) => void;
  /** True when the current edit mode is the two-click Link tool (drives the tool's pressed state).
   * The Link tool is shown whenever canvas-first authoring is on (shade-don't-hide) and pen-gated, so
   * its visibility no longer depends on a per-plan capability flag (ADR-0031 two-row amendment). */
  isLinking: boolean;
  /** Enter/leave the Link tool (pen-gated). */
  toggleLinkMode: () => void;
  /** The dependency kind the Link tool creates — FS / SS / FF (SF is dialog-only, ADR-0026 D5). */
  linkType: DependencyType;
  /** Pick the dependency kind the Link tool creates. */
  setLinkType: (type: DependencyType) => void;
  /** Whether the auto-arrange-lanes action is offered (editing + an `onAutoArrange` handler). */
  canAutoArrange: boolean;
  /** Open the auto-arrange confirm flow on the canvas (pen-gated). */
  requestAutoArrange: () => void;
  // --- Undo / redo (group 4, pen-gated — ADR-0048 M3) ---------------------------------------
  /** Whether there is a reversible edit to undo (drives the Undo item's enabled state). */
  canUndo: boolean;
  /** Whether there is an undone edit to redo (drives the Redo item's enabled state). */
  canRedo: boolean;
  /** The next undo step's label, for the Undo control's accessible name ("Undo move activity"). */
  undoLabel: string | null;
  /** The next redo step's label, for the Redo control's accessible name. */
  redoLabel: string | null;
  /** Run the top undo step (pen-gated; applies the M3.1 conflict contract + announcement). */
  undo: () => void;
  /** Run the top redo step. */
  redo: () => void;

  // --- Object / plan actions (group 5) ------------------------------------------------------
  /** Whether the plan can be recalculated now (role + pen; from the model). */
  canRecalc: boolean;
  /** True while a recalculation POST is in flight (drives the busy/disabled state). */
  recalcPending: boolean;
  recalculate: () => void;
  openBaselines: () => void;
  openCalendar: () => void;
  /** Open the Earned-Value analysis dialog (EV4b, ADR-0042). Wired to the shared plan-chrome dialogs;
   * the toolbar item that calls it is gated behind `VITE_EARNED_VALUE`. */
  openEarnedValue: () => void;
  /** Open the resource-loading-histogram dialog (M7 rung 5, ADR-0044 §3). Wired to the shared
   * plan-chrome dialogs; the toolbar item that calls it is gated behind `VITE_RESOURCE_CURVES`. */
  openResourceHistogram: () => void;
  /** Edit the plan's metadata (writer only); absent for non-writers. Surfaced by the Summary popover's
   * Edit-plan shortcut and the header edit-pencil — the standalone toolbar buttons were removed
   * (ADR-0031 amendment: Plan details folded into Summary). */
  editPlan: (() => void) | null;

  // --- Help (group 7) -----------------------------------------------------------------------
  openShortcuts: () => void;
  /** Whether the on-canvas floating Legend panel is open (drives the Legend toggle's pressed state).
   * The legend lives on the canvas now (ADR-0031 amendment), so the toolbar item is a show/hide
   * toggle rather than a popover that renders the key itself. */
  legendOpen: boolean;
  /** Show/hide the on-canvas floating Legend panel. */
  toggleLegend: () => void;

  // --- Summary popover + pinned Project-finish chip -----------------------------------------
  /** The schedule-summary body for the `Summary▾` popover (`ScheduleSummaryStrip`). */
  summaryContent: ReactNode;
  /** The Project-finish chip content (pinned Tier-1, product-owner decision #1); null while unknown. */
  projectFinishContent: ReactNode;

  // --- Visibility gates ---------------------------------------------------------------------
  /** True once the plan has activities to plot — the view/summary/legend controls appear then. */
  hasDiagram: boolean;

  // --- Toolbar quick-wins (VITE_TOOLBAR_QUICK_WINS) ------------------------------------------
  // These wire five previously-"Coming soon" placeholders to shipped features (spec
  // `docs/specs/toolbar-quick-wins/`). Populated on every build; nothing reads them while the flag is
  // off (the five ids then resolve to their `placeholderItem()` stubs), so they are inert by default.
  /** The canvas selection lifted to the main toolbar (F0), or null when nothing is selected. Drives
   * the selection-aware items' enabled state. */
  selectedActivityId: string | null;
  /** The resolved selected activity (id + live `version`), or undefined when nothing is selected or the
   * row is gone (deleted/stale). The selection-aware `onActivate`s read its id/version. */
  selectedActivity: ActivitySummary | undefined;
  /** Reveal + focus the plan-level notes thread (the **Comments** button, F2). A guarded no-op when the
   * `PlanNotesSection` isn't mounted (the responsive single-pane toggle can unmount it). */
  revealComments: () => void;
  /** Whether the viewer may report progress (`canProgress`, Contributor+; NOT pen-gated). Gates the
   * **Update progress…** item (F3). */
  canProgress: boolean;
  /** Open the progress editor for the selected activity (F3) — sets the workspace-hosted dialog's
   * target. A no-op when nothing is selected. */
  openProgress: () => void;
  /** Whether the viewer may write notes (`canWriteNotes`, Contributor+; NOT pen-gated). Gates the
   * **Add note** item (F4). */
  canWriteNotes: boolean;
  /** Open the selected activity's Logic panel at its Notes section (F4) — the same path as the canvas
   * "Open logic". A no-op when nothing is selected. */
  openActivityNotes: () => void;
  /** Whether the viewer may edit the schedule (`canEditSchedule`, Planner+ **and** the pen). Gates the
   * **Clear visual placement** item (F5), which is additionally pen-gated + Visual-mode-only. */
  canEditSchedule: boolean;
  /** Clear a bar's hand-placed `visualStart` so it reverts to its computed date (F5, Visual mode). A
   * faithful subset of the reposition VISUAL branch: the null-`visualStart` PATCH → undo inverse (when
   * `VITE_UNDO_REDO` is on) → auto-recalc; a stale-version 409 is a non-destructive no-op. */
  clearVisualPlacement: (activityId: string, version: number) => void;
}
