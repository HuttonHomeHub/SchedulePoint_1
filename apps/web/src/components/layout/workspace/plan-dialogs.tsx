import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { PlanFormDialog } from '@/features/plans';

/**
 * The modal surface a plan needs regardless of layout: the {@link PlanFormDialog} for editing the
 * plan's metadata. Driven off the shared {@link PlanWorkspaceModel}. The per-activity Logic and
 * Resources editors are tabs of the activity editor (`activity-crud-dialogs`), so they are not
 * mounted here — two live copies of those panels would mean two sets of queries on the page.
 */
export function PlanDialogs({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement | null {
  return model.canWrite ? (
    <PlanFormDialog
      orgSlug={model.orgSlug}
      projectId={plan.projectId}
      open={model.editing}
      onClose={() => model.setEditing(false)}
      plan={plan}
    />
  ) : null;
}
