import { useRef } from 'react';

import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { useAnnounce } from '@/components/ui/announcer';
import {
  ACTIVITY_STEPS_ENABLED,
  CANVAS_DIRECT_MANIPULATION_ENABLED,
  EARNED_VALUE_ENABLED,
  ENTRY_ROUTES_ENABLED,
  NOTES_ENABLED,
  PROGRAMME_SCHEDULING_ENABLED,
  RESOURCES_ENABLED,
} from '@/config/env';
import {
  ActivityProgressDialog,
  ActivityStepsDialog,
  isMilestoneType,
} from '@/features/activities';
import { CrossPlanLinksSection } from '@/features/cross-plan-dependencies';
import { DependencyEditor } from '@/features/dependencies';
import { ActivityNotesSection } from '@/features/notes';
import { PlanFormDialog } from '@/features/plans';
import { ActivityResourcesDialog } from '@/features/resources';
import { useCoalescedLagNudge } from '@/features/tsld';

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
  // The activity Notes-section heading ref (toolbar quick-wins U4/A4): wired into both the
  // `ActivityNotesSection` (which makes the heading focusable) and the `DependencyEditor` (which scrolls
  // + focuses it when the panel is opened via the toolbar **Add note** button, `logicRevealNotes`).
  const notesHeadingRef = useRef<HTMLHeadingElement>(null);
  // Keyboard lag nudge (ADR-0052 M3): the coalesced tsld hook over the model's `onTsldLag`,
  // composed here into the Logic panel's dependency rows — the app's per-dependency keyboard
  // surface (see `DependencyEditor.onNudgeLag`). The hook is unconditionally called (rules of
  // hooks) but only wired under the flag for writers, so flag-off is byte-identical.
  const announce = useAnnounce();
  const nudgeLag = useCoalescedLagNudge({
    onLag: model.onTsldLag,
    dependencies: model.dependencies.data ?? [],
    announce,
  });
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
        {...(CANVAS_DIRECT_MANIPULATION_ENABLED && model.canManageLogic
          ? { onNudgeLag: nudgeLag }
          : {})}
        notesHeadingRef={notesHeadingRef}
        revealNotes={model.logicRevealNotes}
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
                  headingRef={notesHeadingRef}
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

      {/* The per-activity resource-assignment editor the canvas selection bar's **Resources** action
          opens (entry-route win 2, `VITE_ENTRY_ROUTES`), driven off `model.resourcesActivity`. Mounted
          and toggled like the crud dialogs; its target re-derives from the live query, so it closes when
          the row is deleted. Reuses the same dialog + prop shape as the activities-table row action; the
          dialog enforces its own write gating via `canWrite`. Flag-off ⇒ not rendered (byte-for-byte). */}
      {ENTRY_ROUTES_ENABLED && RESOURCES_ENABLED ? (
        <ActivityResourcesDialog
          orgSlug={model.orgSlug}
          planId={model.planId}
          open={model.resourcesActivity !== undefined}
          onClose={() => model.setResourcesActivity(undefined)}
          canWrite={model.canEditSchedule}
          {...(model.resourcesActivity
            ? {
                activityId: model.resourcesActivity.id,
                activityName: model.resourcesActivity.name,
                activityDurationType: model.resourcesActivity.durationType,
                isMilestone: isMilestoneType(model.resourcesActivity.type),
              }
            : {})}
        />
      ) : null}

      {/* The progress editor, shared by BOTH the toolbar's Report-progress command and the canvas
          selection bar's Report-progress action (entry-route), driven off `model.progressActivity`
          (the id reused by both entry points, so there's exactly ONE progress dialog per workspace).
          Role-gated (Contributor+), NOT pen-gated (the progress precedent, ADR-0046). Rendered by both
          canvas layouts (this component is shared), so progress works on the selection bar regardless
          of `VITE_CANVAS_TOOLBAR`. */}
      {model.canProgress ? (
        <ActivityProgressDialog
          orgSlug={model.orgSlug}
          planId={model.planId}
          open={model.progressActivity !== undefined}
          onClose={() => model.setProgressActivityId(null)}
          {...(model.progressActivity ? { activity: model.progressActivity } : {})}
        />
      ) : null}

      {/* The weighted-steps editor the canvas selection bar's **Steps** action opens (entry-route +
          earned-value/steps flags), driven off `model.stepsActivity`. Same dialog + gates as the
          activities-table Steps row action (writer surface; the item hides for a duration-derived
          selection). Flag-off / flags-off ⇒ not rendered (byte-for-byte). */}
      {ENTRY_ROUTES_ENABLED &&
      EARNED_VALUE_ENABLED &&
      ACTIVITY_STEPS_ENABLED &&
      model.canEditSchedule ? (
        <ActivityStepsDialog
          orgSlug={model.orgSlug}
          planId={model.planId}
          open={model.stepsActivity !== undefined}
          onClose={() => model.setStepsActivity(undefined)}
          {...(model.stepsActivity ? { activity: model.stepsActivity } : {})}
        />
      ) : null}
    </>
  );
}
