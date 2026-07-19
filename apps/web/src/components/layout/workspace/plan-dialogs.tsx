import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { NOTES_ENABLED, PROGRAMME_SCHEDULING_ENABLED } from '@/config/env';
import { CrossPlanLinksSection } from '@/features/cross-plan-dependencies';
import { DependencyEditor } from '@/features/dependencies';
import { ActivityNotesSection } from '@/features/notes';
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
        onRemoved={model.recordDependencyRemove}
        {...(model.logicActivity ? { activity: model.logicActivity } : {})}
        {...(PROGRAMME_SCHEDULING_ENABLED && model.logicActivity
          ? {
              crossPlanSlot: (
                <CrossPlanLinksSection
                  orgSlug={model.orgSlug}
                  planId={model.planId}
                  activity={model.logicActivity}
                  canManageLogic={model.canManageLogic}
                  enabled={model.logicActivity !== undefined}
                />
              ),
            }
          : {})}
        {...(NOTES_ENABLED && model.logicActivity
          ? {
              notesSlot: (
                <ActivityNotesSection
                  orgSlug={model.orgSlug}
                  planId={model.planId}
                  activity={model.logicActivity}
                  canWrite={model.canWriteNotes}
                  enabled={model.logicActivity !== undefined}
                />
              ),
            }
          : {})}
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
