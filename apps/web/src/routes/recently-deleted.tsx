import { useParams } from '@tanstack/react-router';

import { PageContainer, PageHeader } from '@/components/ui/page';
import { DEFAULT_SHOW, RecentlyDeletedTable, SHOW_FILTERS } from '@/features/recently-deleted';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';
import { pickParam, useUrlFilterState } from '@/hooks/use-url-filter-state';

const DEFAULT_FILTERS = { show: DEFAULT_SHOW };

/**
 * Which kind of deletion to show, from `?show=`. An unknown value reads as `all` rather than
 * crashing the screen, and `all` is omitted from the URL (ADR-0123). Module-level so its identity is
 * stable across renders.
 */
function parseShow(raw: Record<string, unknown>): { show: (typeof SHOW_FILTERS)[number] } {
  return { show: pickParam(raw, 'show', SHOW_FILTERS, DEFAULT_SHOW) };
}

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
  const [filters, setFilters] = useUrlFilterState(DEFAULT_FILTERS, parseShow);

  return (
    <PageContainer>
      <PageHeader
        title="Recently deleted"
        description="Deleted clients, projects, plans, resources and calendars are kept here so you can restore them. Restoring a client, project or resource group also restores everything deleted with it."
      />
      <div className="mt-6">
        <RecentlyDeletedTable
          orgSlug={orgSlug}
          canWrite={canWrite}
          show={filters.show}
          onShowChange={(show) => setFilters({ show })}
        />
      </div>
    </PageContainer>
  );
}
