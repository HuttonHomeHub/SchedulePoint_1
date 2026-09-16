import { useParams } from '@tanstack/react-router';

import { PageContainer, PageHeader } from '@/components/ui/page';
import { RecentlyDeletedTable } from '@/features/recently-deleted';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';

/**
 * The organisation recycle bin (`/orgs/$orgSlug/recently-deleted`): soft-deleted
 * clients, projects and plans, with a Restore action for writers. Restoring a
 * client brings back its projects and plans too.
 */
export function RecentlyDeletedScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));

  return (
    <PageContainer>
      <PageHeader
        title="Recently deleted"
        description="Deleted clients, projects and plans are kept here so you can restore them. Restoring a client or project also restores everything deleted with it."
      />
      <div className="mt-6">
        <RecentlyDeletedTable orgSlug={orgSlug} canWrite={canWrite} />
      </div>
    </PageContainer>
  );
}
