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

  // --- Lens / display (group 2) -------------------------------------------------------------
  viewToggles: TsldViewToggles;
  toggleView: (key: keyof TsldViewToggles) => void;

  // --- Tools / author (group 4, pen-gated) --------------------------------------------------
  /** True when the current edit mode is "add activity" (drives the tool's pressed state). */
  isAddingActivity: boolean;
  /** Enter/leave add-activity mode (pen-gated at the toolbar level via `authoringEnabled`). */
  toggleAddActivity: () => void;
  /** Whether the auto-arrange-lanes action is offered (editing + an `onAutoArrange` handler). */
  canAutoArrange: boolean;
  /** Open the auto-arrange confirm flow on the canvas (pen-gated). */
  requestAutoArrange: () => void;

  // --- Object / plan actions (group 5) ------------------------------------------------------
  /** Whether the plan can be recalculated now (role + pen; from the model). */
  canRecalc: boolean;
  /** True while a recalculation POST is in flight (drives the busy/disabled state). */
  recalcPending: boolean;
  recalculate: () => void;
  openBaselines: () => void;
  openCalendar: () => void;
  openPlanDetails: () => void;
  /** Edit the plan's metadata (writer only); absent for non-writers (item hidden). */
  editPlan: (() => void) | null;

  // --- Help (group 7) -----------------------------------------------------------------------
  openShortcuts: () => void;
  /** The legend body for the `Legend▾` popover (lifted from the canvas so it isn't duplicated). */
  legendContent: ReactNode;

  // --- Summary popover + pinned Project-finish chip -----------------------------------------
  /** The schedule-summary body for the `Summary▾` popover (`ScheduleSummaryStrip`). */
  summaryContent: ReactNode;
  /** The Project-finish chip content (pinned Tier-1, product-owner decision #1); null while unknown. */
  projectFinishContent: ReactNode;

  // --- Visibility gates ---------------------------------------------------------------------
  /** True once the plan has activities to plot — the view/summary/legend controls appear then. */
  hasDiagram: boolean;
}
