import { useParams } from '@tanstack/react-router';

import { PageContainer, PageHeader } from '@/components/ui/page';
import { ClientsTable, CreateClientButton } from '@/features/clients';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';
import { pickText, useUrlFilterState } from '@/hooks/use-url-filter-state';

/**
 * The search term, out of the URL. Module-level so its identity is stable across renders, and
 * `pickText` so an array or a number degrades to no search rather than throwing (ADR-0123: a search
 * param is a string, and what arrives is whatever somebody typed or pasted).
 */
function parseClientFilters(raw: Record<string, unknown>): { q: string } {
  return { q: pickText(raw, 'q') };
}

const NO_CLIENT_FILTERS = { q: '' };

/**
 * The organisation's clients screen (`/orgs/$orgSlug/clients`).
 *
 * **The search is in the URL, not in component state** — the rule the two library screens already
 * follow, so a narrowed view survives a reload and can be pasted to a colleague. It is also why
 * this lives on the route rather than inside `ClientsTable`: the table is rendered in one place,
 * but the URL belongs to the screen.
 */
export function ClientsScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));
  const [filters, setFilters] = useUrlFilterState(NO_CLIENT_FILTERS, parseClientFilters);

  return (
    <PageContainer>
      <PageHeader
        title="Clients"
        actions={canWrite ? <CreateClientButton orgSlug={orgSlug} /> : null}
      />
      <div className="mt-6">
        <ClientsTable
          orgSlug={orgSlug}
          canWrite={canWrite}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>
    </PageContainer>
  );
}
