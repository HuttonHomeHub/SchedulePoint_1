import { useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import {
  ChildCounts,
  LoadingShape,
  PageContainer,
  PageHeader,
  PageHeaderSkeleton,
  SectionCard,
  Skeleton,
} from '@/components/ui/page';
import { useClient } from '@/features/clients';
import { CreateProjectButton, ProjectsTable } from '@/features/projects';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';
import { EntityLoadFailure } from '@/routes/entity-not-found';

/**
 * A client's projects screen (`/orgs/$orgSlug/clients/$clientId`).
 *
 * **The frame renders at once and only the header waits for the client.** The Projects table reads
 * its own list (`ProjectsTable`), so mounting it while the client is pending starts both requests
 * together instead of one after the other, and its own skeleton draws the real column headings. The
 * header skeleton speaks no sentence of its own (`announce="none"`): the table's shape is the one
 * sentence the page says while it loads. A client that does not exist replaces the whole screen
 * with {@link EntityLoadFailure}, and the table's own request may fail first for the same reason — a
 * momentary failure state that gives way to the not-found screen (loading-skeletons CQ-2).
 */
export function ClientDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const clientId = 'clientId' in params ? params.clientId : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));
  const client = useClient(orgSlug, clientId);

  if (client.isError) {
    return (
      <EntityLoadFailure
        entity="Client"
        orgSlug={orgSlug}
        error={client.error}
        onRetry={() => void client.refetch()}
      />
    );
  }

  return (
    <PageContainer>
      {client.isPending ? (
        // The breadcrumb line is a block, not a live link: a skeleton holds nothing focusable. No
        // description line: most clients have none, and a skeleton cannot know.
        <LoadingShape label="Loading client…" announce="none">
          <Skeleton className="h-5 w-48" />
          <PageHeaderSkeleton className="mt-2" aside actions={canWrite ? 1 : 0} />
        </LoadingShape>
      ) : (
        <>
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
            actions={
              canWrite ? <CreateProjectButton orgSlug={orgSlug} clientId={clientId} /> : null
            }
            /* **One count, not two.** A plan count across this client's projects was built and
           WITHDRAWN by FC-9: it plans as a `Seq Scan on projects` once the client holds a
           substantial share of that table, so its cost is O(the installation) rather than O(this
           client). The count is ABSENT rather than zero when the API could not take it; a real zero
           still renders, because "No projects" is a fact the reader came for. */
            aside={
              <ChildCounts
                counts={[{ value: client.data.projectCount, one: 'project', many: 'projects' }]}
              />
            }
          />
        </>
      )}
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
