import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ActivitiesTable, CreateActivityButton } from '@/features/activities';
import { useClient } from '@/features/clients';
import { PLAN_STATUS_LABELS, PlanFormDialog, usePlan } from '@/features/plans';
import { useProject } from '@/features/projects';
import { canManageHierarchy, canReportProgress, useOrgRole } from '@/hooks/use-org-role';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * A single plan (`/orgs/$orgSlug/plans/$planId`): its metadata plus a region
 * reserved for the future Time-Scaled Logic Diagram canvas. Writers can edit the
 * plan's metadata here.
 */
export function PlanDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const planId = 'planId' in params ? params.planId : '';
  const role = useOrgRole(orgSlug);
  const canWrite = canManageHierarchy(role);
  const canProgress = canReportProgress(role);
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
        <dd>{formatCalendarDate(plan.data.plannedStart)}</dd>
      </dl>
      {plan.data.description ? (
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm">{plan.data.description}</p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Activities</h2>
        {canWrite ? <CreateActivityButton orgSlug={orgSlug} planId={planId} /> : null}
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        The activities that make up this plan. The graphical Time-Scaled Logic Diagram will edit
        these on a timeline in a later release.
      </p>
      <div className="mt-3">
        <ActivitiesTable
          orgSlug={orgSlug}
          planId={planId}
          canWrite={canWrite}
          canReportProgress={canProgress}
        />
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
