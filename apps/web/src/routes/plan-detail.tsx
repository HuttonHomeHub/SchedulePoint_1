import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useClient } from '@/features/clients';
import { PLAN_STATUS_LABELS, PlanFormDialog, formatPlannedStart, usePlan } from '@/features/plans';
import { useProject } from '@/features/projects';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/**
 * A single plan (`/orgs/$orgSlug/plans/$planId`): its metadata plus a region
 * reserved for the future Time-Scaled Logic Diagram canvas. Writers can edit the
 * plan's metadata here.
 */
export function PlanDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const planId = 'planId' in params ? params.planId : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));
  const [editing, setEditing] = useState(false);

  const plan = usePlan(orgSlug, planId);
  const project = useProject(orgSlug, plan.data?.projectId ?? '');
  const client = useClient(orgSlug, project.data?.clientId ?? '');

  if (plan.isPending) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Spinner label="Loading plan…" />
      </main>
    );
  }

  if (plan.isError) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Breadcrumbs
          items={[
            { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
            { label: 'Not found' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Plan not found</h1>
        <div className="border-border text-muted-foreground mt-4 rounded-lg border border-dashed p-8 text-center text-sm">
          <p>This plan doesn’t exist, was deleted, or you don’t have access to it.</p>
          <Link
            to="/orgs/$orgSlug/clients"
            params={{ orgSlug }}
            className="text-foreground mt-2 inline-block underline underline-offset-4"
          >
            Back to clients
          </Link>
        </div>
      </main>
    );
  }

  const crumbs: Crumb[] = [
    { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
    {
      label: client.data?.name ?? 'Client',
      to: '/orgs/$orgSlug/clients/$clientId',
      params: { orgSlug, clientId: project.data?.clientId ?? '' },
    },
    {
      label: project.data?.name ?? 'Project',
      to: '/orgs/$orgSlug/projects/$projectId',
      params: { orgSlug, projectId: plan.data.projectId },
    },
    { label: plan.data.name },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={crumbs} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{plan.data.name}</h1>
        {canWrite ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit plan
          </Button>
        ) : null}
      </div>

      <dl className="mt-4 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>{PLAN_STATUS_LABELS[plan.data.status]}</dd>
        <dt className="text-muted-foreground">Planned start</dt>
        <dd>{formatPlannedStart(plan.data.plannedStart)}</dd>
      </dl>
      {plan.data.description ? (
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm">{plan.data.description}</p>
      ) : null}

      <h2 className="mt-8 text-lg font-medium">Schedule</h2>
      <div className="border-border text-muted-foreground mt-3 flex min-h-64 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm">
        The schedule editor (Time-Scaled Logic Diagram) will live here.
      </div>

      {canWrite ? (
        <PlanFormDialog
          orgSlug={orgSlug}
          projectId={plan.data.projectId}
          open={editing}
          onClose={() => setEditing(false)}
          plan={plan.data}
        />
      ) : null}
    </main>
  );
}
