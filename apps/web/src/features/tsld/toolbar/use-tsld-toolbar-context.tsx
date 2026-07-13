import { useMemo } from 'react';

import { TsldLegend } from '../components/TsldLegend';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { useAnnounce } from '@/components/ui/announcer';
import { CANVAS_AUTHORING_ENABLED } from '@/config/env';
import { useSetPlanStart } from '@/features/plans';
import { ScheduleSummaryStrip } from '@/features/schedule';
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
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
  canvasUi: TsldCanvasUiState;
  openDialog: (kind: PlanDialogKind) => void;
}): TsldToolbarContext {
  const { orgSlug, planId } = model;
  const announce = useAnnounce();
  const recalc = useRecalculateCommand(orgSlug, planId);
  const setStart = useSetPlanStart(orgSlug);

  const activities = model.activities.data ?? [];
  const hasDiagram =
    activities.length > 0 &&
    activities.some((a) => a.earlyStart !== null) &&
    plan.plannedStart !== null;

  const summaryContent = useMemo(
    () => <ScheduleSummaryStrip orgSlug={orgSlug} planId={planId} />,
    [orgSlug, planId],
  );
  const projectFinishContent = useMemo(
    () => <ProjectFinishChip orgSlug={orgSlug} planId={planId} />,
    [orgSlug, planId],
  );
  const legendContent = useMemo(() => <TsldLegend />, []);

  const { canRecalc, canEditSchedule, canWrite, setEditing } = model;
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
      // Inline timeline start (ADR-0032 M2): read + (pen-gated) write `plannedStart`. Read-only
      // viewers get a null setter so the control renders the date as static text (Critical Q3).
      plannedStart: plan.plannedStart,
      setPlannedStart: canEditSchedule
        ? (iso: string) =>
            setStart.mutate(
              { planId, version: plan.version, plannedStart: iso || null },
              {
                onSuccess: () =>
                  announce(
                    iso
                      ? `Timeline start set to ${formatCalendarDate(iso)}.`
                      : 'Timeline start cleared.',
                  ),
                onError: () => announce('Couldn’t update the timeline start. Please try again.'),
              },
            )
        : null,

      // Lens
      viewToggles,
      toggleView,

      // Tools (pen-gated as a set at the toolbar via authoringEnabled)
      isAddingActivity: mode === 'add-activity',
      toggleAddActivity: () => setMode((m) => (m === 'add-activity' ? 'select' : 'add-activity')),
      canAutoArrange: canEditSchedule,
      requestAutoArrange,

      // Object / plan actions. With canvas-first authoring on, the manual button flushes the shared
      // auto-recalc coalescer (ADR-0032 M3) so it and the debounced auto-recalcs are one path;
      // flag-off it's the standalone recalc command, byte-for-byte.
      canRecalc,
      recalcPending: CANVAS_AUTHORING_ENABLED ? model.autoRecalc.isPending : recalc.isPending,
      recalculate: () =>
        CANVAS_AUTHORING_ENABLED
          ? model.autoRecalc.flush()
          : recalc.run({
              onSuccess: () => announce('Schedule recalculated.'),
              onError: (message) => announce(message),
            }),
      openBaselines: () => openDialog('baselines'),
      openCalendar: () => openDialog('calendar'),
      openPlanDetails: () => openDialog('details'),
      editPlan: canWrite ? () => setEditing(true) : null,

      // Help
      openShortcuts: () => setShowHelp(true),
      legendContent,

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
      plan.version,
      setStart,
      planId,
      viewToggles,
      toggleView,
      mode,
      setMode,
      requestAutoArrange,
      setShowHelp,
      canRecalc,
      canEditSchedule,
      canWrite,
      setEditing,
      recalc,
      model.autoRecalc,
      announce,
      openDialog,
      legendContent,
      summaryContent,
      projectFinishContent,
      hasDiagram,
    ],
  );
}
