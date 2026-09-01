import { Link, useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Spinner } from '@/components/ui/spinner';
import { useClient } from '@/features/clients';
import { CreateProjectButton, ProjectsTable } from '@/features/projects';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/** A client's projects screen (`/orgs/$orgSlug/clients/$clientId`). */
export function ClientDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const clientId = 'clientId' in params ? params.clientId : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));
  const client = useClient(orgSlug, clientId);

  if (client.isPending) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Spinner label="Loading client…" />
      </div>
    );
  }

  if (client.isError) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 p-6">
        <Breadcrumbs
          items={[
            { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
            { label: 'Not found' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Client not found</h1>
        {/* **An error, not an empty state** (`docs/specs/empty-state-consolidation/` §1.5.2, M2).
            This branch is `query.isError` — the client does not exist, was deleted, or the reader
            has no access. Drawn as a dashed centred box it read as "there is nothing here", which
            is a statement about the client when the truth may be a statement about the reader.
            `role="alert"` + destructive ink is the shape `DataTable` already uses for the same
            condition. The exit link stays: `isError` also covers a transient network failure, so a
            reader who is not lost must not be stranded. */}
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-destructive-text text-sm">
            This client doesn’t exist, was deleted, or you don’t have access to it.
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

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs
        items={[
          { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
          { label: client.data.name },
        ]}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{client.data.name}</h1>
          {client.data.description ? (
            <p className="text-muted-foreground mt-1 text-sm">{client.data.description}</p>
          ) : null}
        </div>
        {canWrite ? <CreateProjectButton orgSlug={orgSlug} clientId={clientId} /> : null}
      </div>
      <h2 className="mt-6 text-lg font-medium">Projects</h2>
      <div className="mt-3">
        <ProjectsTable orgSlug={orgSlug} clientId={clientId} canWrite={canWrite} />
      </div>
    </div>
  );
}
