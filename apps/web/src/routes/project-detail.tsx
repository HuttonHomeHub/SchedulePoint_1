import { Link, useParams } from '@tanstack/react-router';

import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { Spinner } from '@/components/ui/spinner';
import { SCHEDULE_INTERCHANGE_ENABLED } from '@/config/env';
import { useClient } from '@/features/clients';
import { ImportScheduleButton } from '@/features/interchange';
import { CreatePlanButton, PlansTable } from '@/features/plans';
import { useProject } from '@/features/projects';
import { canImportSchedule, canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/**
 * A project's plans screen (`/orgs/$orgSlug/projects/$projectId`): the project's
 * plans, with create/edit/delete for writers. Individual plan detail (and the
 * future TSLD canvas) lives at `/orgs/$orgSlug/plans/$planId`.
 */
export function ProjectDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const projectId = 'projectId' in params ? params.projectId : '';
  const role = useOrgRole(orgSlug);
  const canWrite = canManageHierarchy(role);
  const canImport = canImportSchedule(role);
  const project = useProject(orgSlug, projectId);
  // The parent client (for the breadcrumb trail); resolved once the project loads.
  const client = useClient(orgSlug, project.data?.clientId ?? '');

  if (project.isPending) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Spinner label="Loading project…" />
      </div>
    );
  }

  if (project.isError) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Breadcrumbs
          items={[
            { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
            { label: 'Not found' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Project not found</h1>
        <div className="border-border text-muted-foreground mt-4 rounded-lg border border-dashed p-8 text-center text-sm">
          <p>This project doesn’t exist, was deleted, or you don’t have access to it.</p>
          <Link
            to="/orgs/$orgSlug/clients"
            params={{ orgSlug }}
            className="text-foreground mt-2 inline-block underline underline-offset-4"
          >
            Back to clients
          </Link>
        </div>
      </div>
    );
  }

  const crumbs: Crumb[] = [
    { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
    {
      label: client.data?.name ?? 'Client',
      to: '/orgs/$orgSlug/clients/$clientId',
      params: { orgSlug, clientId: project.data.clientId },
    },
    { label: project.data.name },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={crumbs} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.data.name}</h1>
          {project.data.description ? (
            <p className="text-muted-foreground mt-1 text-sm">{project.data.description}</p>
          ) : null}
        </div>
        {/* Flag OFF ⇒ render exactly the prior surface (byte-for-byte, no wrapper). Flag ON ⇒ the
            "Import from file…" entry sits beside "New plan" (the entry self-gates on interchange:import). */}
        {SCHEDULE_INTERCHANGE_ENABLED ? (
          <div className="flex flex-wrap items-center gap-2">
            <ImportScheduleButton
              orgSlug={orgSlug}
              projectId={projectId}
              projectName={project.data.name}
              canImport={canImport}
            />
            {canWrite ? <CreatePlanButton orgSlug={orgSlug} projectId={projectId} /> : null}
          </div>
        ) : canWrite ? (
          <CreatePlanButton orgSlug={orgSlug} projectId={projectId} />
        ) : null}
      </div>
      <h2 className="mt-6 text-lg font-medium">Plans</h2>
      <div className="mt-3">
        <PlansTable orgSlug={orgSlug} projectId={projectId} canWrite={canWrite} />
      </div>
    </div>
  );
}
