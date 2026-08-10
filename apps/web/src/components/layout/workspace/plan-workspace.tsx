import { ToolbarPlanWorkspace } from './plan-workspace-toolbar';
import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

/**
 * The plan workspace surface.
 *
 * A thin re-export of {@link ToolbarPlanWorkspace}, kept as the name every consumer imports.
 *
 * **`VITE_CANVAS_TOOLBAR` selected an alternative layout here until ADR-0088 D3 retired it.**
 * Flag-off rendered `Adr0030PlanWorkspace`, a ~257-line second implementation of this screen that
 * nobody had rendered in months and that no shipped bundle could select — the flag was compiled on
 * and unreachable by any build path (ADR-0088 D1). It was not free for being unreachable: ADR-0080
 * shipped a user-facing defect because `bulk` was wired into one host and not the other, which is
 * what two implementations of one surface cost whether or not anybody switches between them.
 */
export function PlanWorkspace({
  model,
  plan,
}: {
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  return <ToolbarPlanWorkspace model={model} plan={plan} />;
}
