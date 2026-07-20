import { useMemo } from 'react';

import { orderedConflicts, nextConflictIndex, type ConflictHit } from '../render/conflicts';

import { PlanSummaryPanel } from './plan-summary-panel';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import type { UseLegendPanelPrefs } from './use-legend-panel-prefs';
import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { useAnnounce } from '@/components/ui/announcer';
import {
  CANVAS_AUTHORING_ENABLED,
  CANVAS_NAV_ENABLED,
  SCHEDULING_MODES_ENABLED,
} from '@/config/env';
import { PLAN_STATUS_LABELS, useSetPlanSchedulingMode } from '@/features/plans';
import { useRecalculateCommand, useScheduleSummary } from '@/features/schedule/api/use-schedule';
import { formatCalendarDate } from '@/lib/format-date';

/** A stable empty conflict list, so the flag-off path (P-sug1) hands a byte-stable reference to the
 * memos below (`orderedConflicts` is never even called when the flag is off — "flag-off ⇒ zero cost"). */
const EMPTY_CONFLICTS: readonly ConflictHit[] = [];

/** The pinned Tier-1 Project-finish chip (product-owner decision #1) — the number planners glance
 * at most, kept inline even though the rest of the summary moves into `Summary▾`. Loading shows a
 * subtle placeholder so the chip's slot doesn't flicker in/out; a not-yet-calculated plan or a load
 * error renders nothing here (the full states live in the `Summary▾` popover, which reuses the same
 * `ScheduleSummaryStrip` — so the chip stays a glance, never a second error surface). */
function ProjectFinishChip({
  orgSlug,
  planId,
}: {
  orgSlug: string;
  planId: string;
}): React.ReactElement | null {
  const summary = useScheduleSummary(orgSlug, planId);
  if (summary.isPending) {
    return (
      <span className="text-muted-foreground" aria-hidden="true">
        Finish …
      </span>
    );
  }
  const finish = summary.data?.projectFinish ?? null;
  if (finish === null) return null;
  return (
    <>
      <span className="text-muted-foreground mr-1">Finish</span>
      <span className="text-foreground font-medium">{formatCalendarDate(finish)}</span>
    </>
  );
}

/** The plan-chrome dialogs the toolbar's overflow opens (owned by the workspace). */
export type PlanDialogKind =
  'baselines' | 'calendar' | 'details' | 'earned-value' | 'resource-histogram';

/**
 * Assemble the {@link TsldToolbarContext} the TSLD registry drives (ADR-0031), from the route model,
 * the shared canvas UI state, and the workspace's dialog opener. This is the M2-deferred builder: it
 * wires each command to an existing seam (the canvas control handle, `setMode`, the recalc mutation,
 * the plan dialogs) and never re-derives a rule — visibility/enablement read the model's capability
 * flags. Memoised so a toolbar re-render never touches the canvas or re-runs `describeActivity`.
 */
export function useTsldToolbarContext({
  model,
  plan,
  canvasUi,
  openDialog,
  legend,
  revealComments,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
  canvasUi: TsldCanvasUiState;
  openDialog: (kind: PlanDialogKind) => void;
  /** The on-canvas floating Legend panel's open state + toggle (ADR-0031 amendment) — the toolbar's
   * Legend control shows/hides it rather than rendering the key in a popover. */
  legend: Pick<UseLegendPanelPrefs, 'open' | 'toggle'>;
  /** Reveal + focus the plan-level notes thread (toolbar quick-wins F2). The workspace owns the target
   * ref and passes a stable, guarded callback (no-op when the section isn't in the DOM). */
  revealComments: () => void;
}): TsldToolbarContext {
  const { orgSlug, planId } = model;
  const announce = useAnnounce();
  const recalc = useRecalculateCommand(orgSlug, planId);
  const setPlanMode = useSetPlanSchedulingMode(orgSlug);

  // Stabilise the activities reference (a `?? []` is a fresh array each render) so the memos keyed on it
  // (the conflict ordering + `goToNextConflict`) don't rebuild every render.
  const activities = useMemo(() => model.activities.data ?? [], [model.activities.data]);
  const hasDiagram =
    activities.length > 0 &&
    activities.some((a) => a.earlyStart !== null) &&
    plan.plannedStart !== null;

  const { canRecalc, canEditSchedule, canWrite, setEditing } = model;
  // Selection-aware quick-wins (spec `docs/specs/toolbar-quick-wins/`): the lifted canvas selection +
  // the role capabilities + the shipped seams the five items call. Read directly off the model so no
  // rule is re-derived; nothing here does anything until a flag-on item reads it. The two open-*
  // callbacks are defined inline in the memo below (keyed on the selection, which is exactly when the
  // context re-identifies anyway), so they need no separate stabilisation.
  const {
    todayIso,
    selectedActivityId,
    selectedActivity,
    canProgress,
    canWriteNotes,
    revealActivityNotes,
    setProgressActivityId,
    clearVisualPlacement,
  } = model;
  // The read-only Late-start overlay (ADR-0033 M4) suppresses all editing; the workspace derives it the
  // same way to build `authoringEnabled`. Expose it on the context so a pen-gated item disabled BY the
  // overlay (not by role/pen) can still explain why (toolbar quick-wins A1) — `canEditSchedule` stays
  // true under the overlay, so without this the button would disable with no reason.
  const lateOverlayActive = SCHEDULING_MODES_ENABLED && canvasUi.viewToggles.lateOverlay;
  // Edit-plan opens the plan form (writer only). Shared by the Summary popover's shortcut and the
  // header edit-pencil. Memoised so it doesn't re-identify the toolbar context each render.
  const editPlan = useMemo(
    () => (canWrite ? () => setEditing(true) : null),
    [canWrite, setEditing],
  );

  // The Summary popover folds the former Plan-details facts (status + data date, plus the scheduling
  // mode) together with the computed schedule strip and an Edit-plan shortcut (ADR-0031 amendment).
  const summaryContent = useMemo(
    () => (
      <PlanSummaryPanel
        statusLabel={PLAN_STATUS_LABELS[plan.status]}
        dataDate={plan.plannedStart}
        schedulingModeLabel={
          SCHEDULING_MODES_ENABLED
            ? plan.schedulingMode === 'VISUAL'
              ? 'Visual'
              : 'Early'
            : undefined
        }
        orgSlug={orgSlug}
        planId={planId}
        onEdit={editPlan}
      />
    ),
    [orgSlug, planId, plan.status, plan.plannedStart, plan.schedulingMode, editPlan],
  );
  const projectFinishContent = useMemo(
    () => <ProjectFinishChip orgSlug={orgSlug} planId={planId} />,
    [orgSlug, planId],
  );
  const { open: legendOpen, toggle: toggleLegend } = legend;

  const {
    zoomPreset,
    canvasControlRef,
    requestFit,
    viewToggles,
    toggleView,
    mode,
    setMode,
    requestAutoArrange,
    setShowHelp,
    createType,
    setCreateType,
    linkType,
    setLinkType,
    lensState,
    setFilterQuery,
    toggleFilterAttr,
    setColourMode,
    toggleBaselineOverlay,
    navState,
    toggleIsolate,
    setIsolateMode,
    setConflictCursorId,
    toggleSnapToGrid,
    requestSelectActivity,
  } = canvasUi;

  // Canvas nav (VITE_CANVAS_NAV): the plan's flagged activities in stable order (CQ-2), memoised on the
  // activities only so it never rebuilds per render. `goToNextConflict` reads it to advance the cursor,
  // centre + select the hit, and announce; `conflictCount`/`hasConflicts` gate the toolbar item. Nothing
  // reads any of this while the flag is off (the id resolves to its placeholder stub), so it is inert.
  // Gated on the flag (P-sug1): flag-off ⇒ the stable empty list, so `orderedConflicts` never runs and
  // `hasConflicts`/`conflictCount`/`currentConflict` all degrade to zero/null — matching the flag's
  // "flag-off ⇒ zero cost" contract (`orderedConflicts` is only exercised when the feature is on).
  const orderedConflictHits = useMemo(
    () => (CANVAS_NAV_ENABLED ? orderedConflicts(activities) : EMPTY_CONFLICTS),
    [activities],
  );
  // The current-conflict readout the visible Next-conflict status chip renders (U2), derived from the
  // cursor + the ordered set. Null (chip hidden) until the user starts cycling (no cursor), while
  // isolating, when the cursor's activity is no longer flagged, when there are none, or flag-off (the
  // ordered set is then empty). Kept in step with the polite announcement `goToNextConflict` speaks.
  const currentConflict = useMemo<TsldToolbarContext['currentConflict']>(() => {
    if (navState.isolateActive || navState.conflictCursorId === null) return null;
    const index = orderedConflictHits.findIndex((h) => h.id === navState.conflictCursorId);
    if (index === -1) return null;
    const hit = orderedConflictHits[index];
    if (!hit) return null;
    return {
      index: index + 1,
      total: orderedConflictHits.length,
      name: hit.name,
      reasons: hit.reasons,
    };
  }, [navState.isolateActive, navState.conflictCursorId, orderedConflictHits]);
  const goToNextConflict = useMemo(
    () => (): void => {
      if (orderedConflictHits.length === 0) return;
      const index = nextConflictIndex(navState.conflictCursorId, orderedConflictHits);
      const hit = orderedConflictHits[index];
      if (!hit) return;
      setConflictCursorId(hit.id);
      // Centre the flagged bar (a small centred variant of `goToDate`), then lift the selection to it —
      // the canvas rings it; the reveal-on-select pan is then a no-op since it is already centred.
      const activity = activities.find((a) => a.id === hit.id);
      if (activity?.earlyStart) canvasControlRef.current?.centerOnDate(activity.earlyStart);
      requestSelectActivity(hit.id);
      announce(
        `Conflict ${index + 1} of ${orderedConflictHits.length}: ${hit.name} — ${hit.reasons.join(', ')}.`,
      );
    },
    [
      orderedConflictHits,
      navState.conflictCursorId,
      setConflictCursorId,
      activities,
      canvasControlRef,
      requestSelectActivity,
      announce,
    ],
  );

  // Insight lenses (VITE_CANVAS_LENSES): the Baseline-overlay gate reads the SAME variance query the
  // activities table + the ghost builder consume (route-composed in the model) — no new fetch. An
  // active baseline exists iff the summary carries a `baselineId`; loading/error feed the toolbar item's
  // disabled-with-reason (ADR-0031 shade-don't-hide), so the toggle never enables without ghosts to draw.
  const hasActiveBaseline = model.variance.data?.summary.baselineId != null;
  const varianceLoading = model.variance.isPending;
  const varianceError = model.variance.isError;

  // Memoised on the actual values it reads, so an unrelated parent re-render (an activity-panel
  // drag, the 15s pen poll) doesn't hand `<Toolbar>` a fresh context and churn its resolve →
  // partition → measure → ResizeObserver cycle (perf review, ADR-0031). Behaviour is unchanged —
  // only identity is stabilised.
  return useMemo(
    () => ({
      // Frame — the canvas is commanded imperatively via the shared control handle.
      zoomPreset,
      setZoomPreset: (level) => canvasControlRef.current?.zoomToPreset(level),
      stepZoom: (factor) => canvasControlRef.current?.stepZoom(factor),
      fit: requestFit,
      // The plan's data date (`plannedStart`) is read-only here: it gates Go-to-date visibility and is
      // the canvas day-zero origin. Its persisted value is edited off-toolbar (plan creation / Edit
      // plan), so there's no write seam here (ADR-0031 two-row amendment).
      plannedStart: plan.plannedStart,
      // Go to date (ADR-0033 M2): a pure view pan via the canvas control handle — no fetch, no write,
      // no persisted state (CQ-1). Available to every role; navigating never mutates the plan. It
      // announces the jump (WCAG 4.1.3) since the canvas repaint is otherwise invisible to AT.
      goToDate: (iso: string) => {
        canvasControlRef.current?.goToDate(iso);
        announce(`Jumped to ${formatCalendarDate(iso)}.`);
      },

      // Lens
      viewToggles,
      toggleView,
      // Scheduling mode (ADR-0033 M3): read the plan's mode + a pen-gated switch. Read-only viewers
      // get a null setter so the selector renders inert. Announces the switch (the bars re-source on
      // the next recalc).
      schedulingMode: plan.schedulingMode,
      setSchedulingMode: canEditSchedule
        ? (nextMode) =>
            setPlanMode.mutate(
              { planId, version: plan.version, schedulingMode: nextMode },
              {
                onSuccess: () =>
                  announce(
                    nextMode === 'VISUAL'
                      ? 'Scheduling mode set to Visual planning.'
                      : 'Scheduling mode set to Early start.',
                  ),
                onError: () => announce('Couldn’t change the scheduling mode. Please try again.'),
              },
            )
        : null,

      // Tools (pen-gated as a set at the toolbar via authoringEnabled)
      isAddingActivity: mode === 'add-activity',
      toggleAddActivity: () => setMode((m) => (m === 'add-activity' ? 'select' : 'add-activity')),
      // The Add split-button's per-type choice (ADR-0032 M4): pick the kind the next draw creates and
      // arm add mode in one gesture (a picked type always means "draw one now").
      createType,
      setCreateType: (type) => {
        setCreateType(type);
        setMode('add-activity');
      },
      // Two-click Link tool (ADR-0032 M5): a mode toggle + a persistent FS/SS/FF type. Shown whenever
      // canvas-first authoring is on (shade-don't-hide) and pen-gated as a set with the other tools.
      isLinking: mode === 'link',
      toggleLinkMode: () => setMode((m) => (m === 'link' ? 'select' : 'link')),
      linkType,
      setLinkType,
      canAutoArrange: canEditSchedule,
      requestAutoArrange,

      // Undo / redo (ADR-0048 M3): the model's wrapped store (conflict contract + announcements),
      // shared with the workspace keybindings. Pen-gated as part of the authoring cluster at the
      // toolbar; the items themselves swap in only when `VITE_UNDO_REDO` is on (else Coming-soon stubs).
      canUndo: model.undoRedo.canUndo,
      canRedo: model.undoRedo.canRedo,
      undoLabel: model.undoRedo.undoLabel,
      redoLabel: model.undoRedo.redoLabel,
      undo: model.undoRedo.undo,
      redo: model.undoRedo.redo,

      // Object / plan actions. With canvas-first authoring on, the manual button flushes the shared
      // auto-recalc coalescer (ADR-0032 M3) so it and the debounced auto-recalcs are one path;
      // flag-off it's the standalone recalc command, byte-for-byte.
      canRecalc,
      recalcPending: CANVAS_AUTHORING_ENABLED ? model.autoRecalc.isPending : recalc.isPending,
      recalculate: () =>
        CANVAS_AUTHORING_ENABLED
          ? // A manual flush is an explicit action, so it confirms — unlike the silent auto-recalcs
            // (ux review); errors already surface via the coalescer's onMessage → announce.
            model.autoRecalc.flush(() => announce('Schedule recalculated.'))
          : recalc.run({
              onSuccess: () => announce('Schedule recalculated.'),
              onError: (message) => announce(message),
            }),
      openBaselines: () => openDialog('baselines'),
      openCalendar: () => openDialog('calendar'),
      openEarnedValue: () => openDialog('earned-value'),
      openResourceHistogram: () => openDialog('resource-histogram'),
      editPlan,

      // Help
      openShortcuts: () => setShowHelp(true),
      // The legend lives on the canvas now (ADR-0031 amendment) — this toggles the floating panel.
      legendOpen,
      toggleLegend,

      // Summary popover + pinned finish chip
      summaryContent,
      projectFinishContent,

      hasDiagram,

      // Toolbar quick-wins (VITE_TOOLBAR_QUICK_WINS) — the lifted selection + shipped seams the five
      // real items call. Inert while the flag is off (the ids resolve to their placeholder stubs).
      todayIso,
      selectedActivityId,
      selectedActivity,
      revealComments,
      canProgress,
      // Update progress (F3): set the workspace-hosted dialog's target to the current selection.
      openProgress: () => setProgressActivityId(selectedActivityId),
      canWriteNotes,
      // Add note (F4/U4): open the selected activity's Logic panel AND reveal + focus its Notes section
      // (parity with Comments for plan notes), so the user lands on notes rather than Predecessors. A
      // no-op when nothing is selected.
      openActivityNotes: () => {
        if (selectedActivity) revealActivityNotes(selectedActivity);
      },
      canEditSchedule,
      lateOverlayActive,
      clearVisualPlacement,

      // Insight lenses (VITE_CANVAS_LENSES) — read the lens view state + wire its setters; the Baseline
      // gate reads the shared variance query. Inert while the flag is off (the ids resolve to stubs).
      filterQuery: lensState.filterQuery,
      setFilterQuery,
      filterAttrs: lensState.filterAttrs,
      toggleFilterAttr,
      colourMode: lensState.colourMode,
      setColourMode,
      baselineOverlay: lensState.baselineOverlay,
      toggleBaselineOverlay,
      hasActiveBaseline,
      varianceLoading,
      varianceError,

      // Canvas nav (VITE_CANVAS_NAV) — the isolate/next-conflict/snap view state + commands. Inert while
      // the flag is off (the three ids resolve to their placeholder stubs).
      isolateActive: navState.isolateActive,
      isolateMode: navState.isolateMode,
      toggleIsolate,
      setIsolateMode,
      conflictCount: orderedConflictHits.length,
      hasConflicts: orderedConflictHits.length > 0,
      currentConflict,
      goToNextConflict,
      snapToGrid: navState.snapToGrid,
      toggleSnapToGrid,
    }),
    [
      zoomPreset,
      canvasControlRef,
      requestFit,
      plan.plannedStart,
      plan.schedulingMode,
      plan.version,
      setPlanMode,
      planId,
      viewToggles,
      toggleView,
      mode,
      setMode,
      createType,
      setCreateType,
      linkType,
      setLinkType,
      requestAutoArrange,
      model.undoRedo,
      setShowHelp,
      canRecalc,
      canEditSchedule,
      editPlan,
      recalc,
      model.autoRecalc,
      announce,
      openDialog,
      legendOpen,
      toggleLegend,
      summaryContent,
      projectFinishContent,
      hasDiagram,
      // Toolbar quick-wins — re-identify the context only when the selection / resolved row / a
      // capability actually changes (the callbacks are stable). `todayIso` is value-stable (a fresh
      // string of the same value each render), so it never churns the memo.
      todayIso,
      selectedActivityId,
      selectedActivity,
      revealComments,
      canProgress,
      canWriteNotes,
      setProgressActivityId,
      revealActivityNotes,
      lateOverlayActive,
      clearVisualPlacement,
      // Insight lenses — re-identify only when the lens view state / variance status changes (setters
      // are stable). `lensState` is one memoised object off `useTsldCanvasUiState`, so it churns only
      // on a real lens change.
      lensState,
      setFilterQuery,
      toggleFilterAttr,
      setColourMode,
      toggleBaselineOverlay,
      hasActiveBaseline,
      varianceLoading,
      varianceError,
      // Canvas nav — re-identify only when the nav view state / conflict set / callbacks change (setters
      // are stable). `navState` is one memoised object off `useTsldCanvasUiState`.
      navState.isolateActive,
      navState.isolateMode,
      navState.snapToGrid,
      toggleIsolate,
      setIsolateMode,
      toggleSnapToGrid,
      orderedConflictHits.length,
      currentConflict,
      goToNextConflict,
    ],
  );
}
