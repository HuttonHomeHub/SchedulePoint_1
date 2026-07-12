import { useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
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
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={[{ label: 'Recently deleted' }]} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Recently deleted</h1>
      </div>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Deleted clients, projects and plans are kept here so you can restore them. Restoring a
        client or project also restores everything deleted with it.
      </p>
      <div className="mt-6">
        <RecentlyDeletedTable orgSlug={orgSlug} canWrite={canWrite} />
      </div>
    </div>
  );
}
