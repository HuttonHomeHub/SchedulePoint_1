import { Link, useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { PageContainer, PageHeader, SectionCard } from '@/components/ui/page';
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
      <PageContainer>
        <Spinner label="Loading client…" />
      </PageContainer>
    );
  }

  if (client.isError) {
    return (
      <PageContainer>
        <Breadcrumbs
          items={[
            { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
            { label: 'Not found' },
          ]}
        />
        <PageHeader className="mt-2" title="Client not found" />
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
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
          { label: client.data.name },
        ]}
      />
      <PageHeader
        className="mt-2"
        title={client.data.name}
        description={client.data.description ?? undefined}
        actions={canWrite ? <CreateProjectButton orgSlug={orgSlug} clientId={clientId} /> : null}
      />
      {/* `flush`: the body is a table, so the card contributes a frame and a name and no VERTICAL
          padding — the rows start directly under the heading. It still supplies the horizontal
          gutter, because `DataTable`'s cells carry none and without it the first cell sat hard
          against the card's own border while the heading sat 24px in. That is the "wording in the
          boxes is hard against margins" report, and this comment used to assert the opposite —
          that the table "already has its own" padding, which it does not (ADR-0146 D3). */}
      <SectionCard className="mt-6" title="Projects" flush>
        <ProjectsTable orgSlug={orgSlug} clientId={clientId} canWrite={canWrite} />
      </SectionCard>
    </PageContainer>
  );
}
