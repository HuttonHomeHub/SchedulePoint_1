import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { DependencyEditor } from '@/features/dependencies';
import { PlanFormDialog } from '@/features/plans';

/**
 * The two modal surfaces a plan needs regardless of layout: the per-activity
 * {@link DependencyEditor} (opened from the canvas or the activities table) and the
 * {@link PlanFormDialog} for editing the plan's metadata. Rendered once by whichever
 * layout is active (legacy stacked page or the canvas-first workspace), driven off the
 * shared {@link PlanWorkspaceModel} so both open/close them identically.
 */
export function PlanDialogs({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  return (
    <>
      <DependencyEditor
        orgSlug={model.orgSlug}
        planId={model.planId}
        planActivities={model.activities.data ?? []}
        canManageLogic={model.canManageLogic}
        open={model.logicActivity !== undefined}
        onClose={() => model.setLogicActivity(undefined)}
        {...(model.logicActivity ? { activity: model.logicActivity } : {})}
      />

      {model.canWrite ? (
        <PlanFormDialog
          orgSlug={model.orgSlug}
          projectId={plan.projectId}
          open={model.editing}
          onClose={() => model.setEditing(false)}
          plan={plan}
        />
      ) : null}
    </>
  );
}
