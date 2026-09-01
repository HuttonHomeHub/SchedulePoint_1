import { Link, useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { PlanWorkspace } from '@/components/layout/workspace/plan-workspace';
import { usePlanWorkspaceModel } from '@/components/layout/workspace/use-plan-workspace-model';
import { Spinner } from '@/components/ui/spinner';
import { useRememberPlan } from '@/features/overview/hooks/use-remember-plan';

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
 * Its one other job is to tell the overview's "Jump back in" that this plan was opened
 * ({@link useRememberPlan}) — one call, ids only, written once per plan rather than per render.
 */
export function PlanDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const planId = 'planId' in params ? params.planId : '';
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
      <div className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Breadcrumbs
          items={[
            { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
            { label: 'Not found' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Plan not found</h1>
        {/* **An error, not an empty state** (`docs/specs/empty-state-consolidation/` §1.5.2, M2).
            This branch is `query.isError` — the plan does not exist, was deleted, or the reader
            has no access. Drawn as a dashed centred box it read as "there is nothing here", which
            is a statement about the plan when the truth may be a statement about the reader.
            `role="alert"` + destructive ink is the shape `DataTable` already uses for the same
            condition. The exit link stays: `isError` also covers a transient network failure, so a
            reader who is not lost must not be stranded. */}
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-destructive-text text-sm">
            This plan doesn’t exist, was deleted, or you don’t have access to it.
          </p>
          <Link
            to="/orgs/$orgSlug/clients"
            params={{ orgSlug }}
            className="text-foreground underline underline-offset-4"
          >
            Back to clients
          </Link>
        </div>
      </div>
    );
  }

  const plan = planQuery.data;

  return <PlanWorkspace model={model} plan={plan} />;
}
