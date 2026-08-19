import { ToolbarPlanWorkspace } from './plan-workspace-toolbar';
import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { CanvasSurfaceProvider } from '@/features/tsld/render/canvas-surface';

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
  // **`CanvasSurfaceProvider` sits HERE and not in `plan-workspace-toolbar.tsx`** (ADR-0097
  // Landing E). The toolbar file's root `<div>` is the obvious home and is the wrong one:
  // `useTsldToolbarContext` is called at `plan-workspace-toolbar.tsx:282`, in
  // `ToolbarPlanWorkspace`'s OWN body, and a provider rendered in that component's JSX does not
  // cover a hook called in the same component. That hook is what reaches `resolvePrintPalette` —
  // the export path — so getting this wrong would leave a delivered PDF painted in page colours
  // with every screen looking correct.
  return (
    <CanvasSurfaceProvider>
      <ToolbarPlanWorkspace model={model} plan={plan} />
    </CanvasSurfaceProvider>
  );
}
