import type { ActivityType, DependencyType } from '@repo/types';
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
  /** The plan's timeline start (`plannedStart`) — the canvas day-zero origin; null when unset. The
   * inline start-date control reads it (ADR-0032 M2). */
  plannedStart: string | null;
  /** Set the timeline start (targeted PATCH). Pen-gated (`canEditSchedule`, Critical Q3): `null`
   * when the viewer can't edit the schedule, so the control renders the date as static text. */
  setPlannedStart: ((iso: string) => void) | null;

  // --- Lens / display (group 2) -------------------------------------------------------------
  viewToggles: TsldViewToggles;
  toggleView: (key: keyof TsldViewToggles) => void;

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
  /** Whether the two-click Link tool is offered (canvas-first authoring + a link handler wired,
   * ADR-0032 M5). False ⇒ the Link tool + its type selector are hidden. */
  canLink: boolean;
  /** True when the current edit mode is the two-click Link tool (drives the tool's pressed state). */
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
