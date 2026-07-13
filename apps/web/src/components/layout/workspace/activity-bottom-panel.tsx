import type { PlanWorkspaceModel } from './use-plan-workspace-model';

import { ActivitiesTable, CreateActivityButton } from '@/features/activities';
import { BaselineVarianceSummary } from '@/features/baselines';
import { PenReadOnlyNote } from '@/features/plan-lock';

/**
 * The activity list docked at the bottom of the canvas-first {@link PlanWorkspace}
 * (ADR-0030). It fills the height its container gives it and scrolls internally, so the
 * canvas above keeps the rest. **M1: static height.** M2 wraps it in a draggable,
 * collapsible resizer (the shared resizable-panel primitive) — this component stays the
 * panel *content* either way.
 *
 * Reuses the same `ActivitiesTable` (computed columns, variance, progress editor, CRUD,
 * virtualization) the stacked page used, driven off the shared model so behaviour is
 * identical to the legacy layout.
 */
export function ActivityBottomPanel({ model }: { model: PlanWorkspaceModel }): React.ReactElement {
  return (
    <section
      aria-label="Activities"
      className="border-border flex h-full min-h-0 flex-col border-t"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium">Activities</h2>
          {model.variance.data ? (
            <BaselineVarianceSummary summary={model.variance.data.summary} />
          ) : null}
        </div>
        {model.canEditSchedule ? (
          <CreateActivityButton orgSlug={model.orgSlug} planId={model.planId} />
        ) : null}
      </div>
      {model.penReadOnly ? (
        <div className="px-4 pb-2">
          <PenReadOnlyNote />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <ActivitiesTable
          orgSlug={model.orgSlug}
          planId={model.planId}
          canWrite={model.canEditSchedule}
          canReportProgress={model.canProgress}
          onOpenLogic={model.setLogicActivity}
          {...(model.varianceByActivityId
            ? { varianceByActivityId: model.varianceByActivityId }
            : {})}
        />
      </div>
    </section>
  );
}
