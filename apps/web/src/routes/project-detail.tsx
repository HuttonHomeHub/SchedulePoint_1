import { Link, useParams } from '@tanstack/react-router';

import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { Spinner } from '@/components/ui/spinner';
import { useClient } from '@/features/clients';
import { useProject } from '@/features/projects';

/**
 * A project's plans screen (`/orgs/$orgSlug/projects/$projectId`). For E1 this is
 * the shell (breadcrumbs + header + an empty plans area); the plans table and
 * plan detail land in E2.
 */
export function ProjectDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const projectId = 'projectId' in params ? params.projectId : '';
  const project = useProject(orgSlug, projectId);
  // The parent client (for the breadcrumb trail); resolved once the project loads.
  const client = useClient(orgSlug, project.data?.clientId ?? '');

  if (project.isPending) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Spinner label="Loading project…" />
      </main>
    );
  }

  if (project.isError) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Breadcrumbs
          items={[
            { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
            { label: 'Not found' },
          ]}
        />
        <div className="border-border text-muted-foreground mt-6 rounded-lg border border-dashed p-8 text-center text-sm">
          <p>This project doesn’t exist, was deleted, or you don’t have access to it.</p>
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
      params: { orgSlug, clientId: project.data.clientId },
    },
    { label: project.data.name },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={crumbs} />
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{project.data.name}</h1>
      {project.data.description ? (
        <p className="text-muted-foreground mt-1 text-sm">{project.data.description}</p>
      ) : null}
      <h2 className="mt-6 text-lg font-medium">Plans</h2>
      <div className="border-border text-muted-foreground mt-3 rounded-lg border border-dashed p-8 text-center text-sm">
        Plans and the schedule editor arrive in the next update.
      </div>
    </main>
  );
}
