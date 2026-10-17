import { useParams } from '@tanstack/react-router';

import { PageContainer, PageHeader } from '@/components/ui/page';
import { RecentlyDeletedTable } from '@/features/recently-deleted';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/**
 * The organisation recycle bin (`/orgs/$orgSlug/recently-deleted`): soft-deleted
 * clients, projects, plans, resources and calendars, with a Restore action for writers. Restoring
 * a client brings back its projects and plans too, a resource group its members, and a project its
 * calendars (ADR-0195).
 */
export function RecentlyDeletedScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));

  return (
    <PageContainer>
      <PageHeader
        title="Recently deleted"
        description="Deleted clients, projects, plans, resources and calendars are kept here so you can restore them. Restoring a client, project or resource group also restores everything deleted with it."
      />
      <div className="mt-6">
        <RecentlyDeletedTable orgSlug={orgSlug} canWrite={canWrite} />
      </div>
    </PageContainer>
  );
}
