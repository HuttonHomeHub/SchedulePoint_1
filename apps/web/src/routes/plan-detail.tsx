import { useParams } from '@tanstack/react-router';

import { PlanWorkspace } from '@/components/layout/workspace/plan-workspace';
import { usePlanWorkspaceModel } from '@/components/layout/workspace/use-plan-workspace-model';
import { Spinner } from '@/components/ui/spinner';
import { useRememberPlan } from '@/features/overview/hooks/use-remember-plan';
import { EntityLoadFailure } from '@/routes/entity-not-found';

/**
 * A single plan (`/orgs/$orgSlug/plans/$planId`). Route-composed orchestration (queries, gating,
 * TSLD edit callbacks) lives in {@link usePlanWorkspaceModel}; this route resolves the plan and
 * hands it to {@link PlanWorkspace}.
 *
 * It selected between TWO layouts until `VITE_CANVAS_WORKSPACE` retired (ADR-0088 D3) — the
 * canvas-first workspace and a ~270-line legacy long-scrolling page, which is now deleted along
 * with the flag. The model lives where it does because two layouts once shared it; it stays there
 * because the split between "what this plan needs" and "how it is laid out" is worth keeping
 * whether or not there is a second layout to prove it.
 *
 * **A failed plan query is two pictures, split by HTTP status** ({@link EntityLoadFailure}). A 404 —
 * the plan does not exist, was deleted, or belongs to somebody else's organisation — is a destination
 * that matches the in-shell "Page not found" (#463): calm, heading focused, no alert. Any other error
 * (a dropped connection, a 5xx) stays a `role="alert"` in destructive ink, because it says nothing
 * about the plan and "doesn't exist" would be false (`docs/specs/empty-state-consolidation/` §1.5.2 M2).
 *
 * Its one other job is to tell the overview's "Jump back in" that this plan was opened
 * ({@link useRememberPlan}) — one call, ids only, written once per plan rather than per render.
 */
export function PlanDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const planId = 'planId' in params ? params.planId : '';
  // **One workspace per plan, by key** (`docs/TECH_DEBT.md` #451). TanStack Router re-renders this
  // route when only `$planId` changes — opening another plan from the Project Explorer — so without
  // the key every ref and state in the model outlived the plan it was about. The auto-recalculation
  // watcher compared plan B's activities with its snapshot of plan A, counted the difference as an
  // edit, and the status bar said "1 edit not calculated" on a plan nobody had touched; a debounced
  // recalculation due for A fired against B. Several hooks in the model already document a
  // `key={planId}` remount as their contract (`usePlanAutoRecalc`'s unmount flush is one), and this
  // is where that remount now actually happens.
  return <PlanDetail key={`${orgSlug}/${planId}`} orgSlug={orgSlug} planId={planId} />;
}

function PlanDetail({ orgSlug, planId }: { orgSlug: string; planId: string }): React.ReactElement {
  const model = usePlanWorkspaceModel(orgSlug, planId);
  const planQuery = model.plan;

  useRememberPlan({ orgSlug, planId, resolved: planQuery.isSuccess });

  if (planQuery.isPending) {
    // A workspace-shaped skeleton (header + canvas + panel) on the canvas-first path so the load
    // → loaded transition doesn't jump from a small centred box to a full-bleed column (ADR-0030).
    return (
      <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
        <div className="border-border flex flex-col gap-2 border-b px-4 py-3">
          <div className="bg-muted h-3 w-56 animate-pulse rounded" />
          <div className="bg-muted h-6 w-64 animate-pulse rounded" />
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Spinner label="Loading plan…" />
        </div>
        <div className="border-border h-40 shrink-0 border-t px-4 py-3">
          <div className="bg-muted h-4 w-32 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (planQuery.isError) {
    return (
      <EntityLoadFailure
        entity="Plan"
        orgSlug={orgSlug}
        error={planQuery.error}
        onRetry={() => void planQuery.refetch()}
      />
    );
  }

  const plan = planQuery.data;

  return <PlanWorkspace model={model} plan={plan} />;
}
