import { useMemo } from 'react';

import { PlanSummaryPanel } from './plan-summary-panel';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { useAnnounce } from '@/components/ui/announcer';
import { CANVAS_AUTHORING_ENABLED, SCHEDULING_MODES_ENABLED } from '@/config/env';
import { PLAN_STATUS_LABELS, useSetPlanSchedulingMode } from '@/features/plans';
import { useRecalculateCommand, useScheduleSummary } from '@/features/schedule/api/use-schedule';
import { formatCalendarDate } from '@/lib/format-date';

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
export type PlanDialogKind = 'baselines' | 'calendar' | 'details';

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
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
  canvasUi: TsldCanvasUiState;
  openDialog: (kind: PlanDialogKind) => void;
  /** The on-canvas floating Legend panel's open state + toggle (ADR-0031 amendment) — the toolbar's
   * Legend control shows/hides it rather than rendering the key in a popover. */
  legend: { open: boolean; toggle: () => void };
}): TsldToolbarContext {
  const { orgSlug, planId } = model;
  const announce = useAnnounce();
  const recalc = useRecalculateCommand(orgSlug, planId);
  const setPlanMode = useSetPlanSchedulingMode(orgSlug);

  const activities = model.activities.data ?? [];
  const hasDiagram =
    activities.length > 0 &&
    activities.some((a) => a.earlyStart !== null) &&
    plan.plannedStart !== null;

  const { canRecalc, canEditSchedule, canWrite, setEditing } = model;
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
  } = canvasUi;

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
    ],
  );
}
