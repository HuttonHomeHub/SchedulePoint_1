import { useMemo } from 'react';

import { TsldLegend } from '../components/TsldLegend';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { useAnnounce } from '@/components/ui/announcer';
import { ScheduleSummaryStrip } from '@/features/schedule';
import { useRecalculate, useScheduleSummary } from '@/features/schedule/api/use-schedule';
import { formatCalendarDate } from '@/lib/format-date';

/** The pinned Tier-1 Project-finish chip (product-owner decision #1) — the number planners glance
 * at most, kept inline even though the rest of the summary moves into `Summary▾`. */
function ProjectFinishChip({
  orgSlug,
  planId,
}: {
  orgSlug: string;
  planId: string;
}): React.ReactElement | null {
  const summary = useScheduleSummary(orgSlug, planId);
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
  const recalc = useRecalculate(orgSlug, planId);

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

  return {
    // Frame — the canvas is commanded imperatively via the shared control handle.
    zoomPreset: canvasUi.zoomPreset,
    setZoomPreset: (level) => canvasUi.canvasControlRef.current?.zoomToPreset(level),
    stepZoom: (factor) => canvasUi.canvasControlRef.current?.stepZoom(factor),
    fit: canvasUi.requestFit,

    // Lens
    viewToggles: canvasUi.viewToggles,
    toggleView: canvasUi.toggleView,

    // Tools (pen-gated as a set at the toolbar via authoringEnabled)
    isAddingActivity: canvasUi.mode === 'add-activity',
    toggleAddActivity: () =>
      canvasUi.setMode((m) => (m === 'add-activity' ? 'select' : 'add-activity')),
    canAutoArrange: model.canEditSchedule,
    requestAutoArrange: canvasUi.requestAutoArrange,

    // Object / plan actions
    canRecalc: model.canRecalc,
    recalculate: () => {
      if (recalc.isPending) return;
      recalc.mutate(undefined, {
        onSuccess: () => announce('Schedule recalculated.'),
        onError: () => announce('Couldn’t recalculate the schedule. Please try again.'),
      });
    },
    openBaselines: () => openDialog('baselines'),
    openCalendar: () => openDialog('calendar'),
    openPlanDetails: () => openDialog('details'),
    editPlan: model.canWrite ? () => model.setEditing(true) : null,

    // Help
    openShortcuts: () => canvasUi.setShowHelp(true),
    legendContent,

    // Summary popover + pinned finish chip
    summaryContent,
    projectFinishContent,

    hasDiagram,
  };
}
