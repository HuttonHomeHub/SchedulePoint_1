import { ARCHIVED_FILTERS, RESOURCE_KINDS } from '@repo/types';
import { useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { LIBRARY_SCOPING_ENABLED } from '@/config/env';
import { PICKER_CALENDAR_FILTERS, useCalendars } from '@/features/calendars';
import {
  ANY_RESOURCE_KIND,
  CreateResourceButton,
  DEFAULT_RESOURCE_LIBRARY_FILTERS,
  ResourcesTable,
  type ResourceKindFilter,
  type ResourceLibraryFilters,
} from '@/features/resources';
import { canManageHierarchy, useOrgRole } from '@/hooks/use-org-role';
import { pickParam, pickText, useUrlFilterState } from '@/hooks/use-url-filter-state';

/** The kind filter's accepted URL values: a real kind, or `''` (which is also its default). */
const KIND_FILTERS: readonly ResourceKindFilter[] = [ANY_RESOURCE_KIND, ...RESOURCE_KINDS];

/**
 * Parse the screen's three filters out of the URL. Unknown values degrade to the default rather
 * than throwing. Module-level so the identity is stable across renders.
 */
function parseResourceFilters(raw: Record<string, unknown>): ResourceLibraryFilters {
  return {
    q: pickText(raw, 'q'),
    kind: pickParam(raw, 'kind', KIND_FILTERS, DEFAULT_RESOURCE_LIBRARY_FILTERS.kind),
    archived: pickParam(
      raw,
      'archived',
      ARCHIVED_FILTERS,
      DEFAULT_RESOURCE_LIBRARY_FILTERS.archived,
    ),
  };
}

/**
 * The organisation's resource library screen (`/orgs/$orgSlug/resources`), behind
 * `RESOURCES_ENABLED`. The route is only registered when the flag is on (see
 * `app/router.tsx`), so this screen never renders while the surface is dark. The org
 * calendars are composed here and threaded into the table's create/edit dialog so the
 * resources feature stays dependency-free of the calendars feature.
 */
export function ResourcesScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const canWrite = canManageHierarchy(useOrgRole(orgSlug));
  // The screen owns the library filters so they live in the URL (deep-linkable, reload-safe —
  // docs/UX_STANDARDS.md); the table takes them as props and stays router-free.
  const [filters, setFilters] = useUrlFilterState(
    DEFAULT_RESOURCE_LIBRARY_FILTERS,
    parseResourceFilters,
  );
  // ORGANISATION calendars only, deliberately: the resource pool is org-global (ADR-0039), so the
  // API hard-rejects a project-scoped calendar on a resource with a 422 (ADR-0053 §2). The default
  // `?scope=org` list IS the usable set, so the picker can never offer one that would be refused.
  // Archived rows ride along behind the flag (ADR-0053 §4): the picker filters them out of what it
  // OFFERS, but a resource already bound to a since-archived calendar must still show its name
  // rather than "Unnamed". Flag off, the request is byte-for-byte today's.
  const calendars = useCalendars(
    orgSlug,
    'org',
    LIBRARY_SCOPING_ENABLED ? PICKER_CALENDAR_FILTERS : {},
  );

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={[{ label: 'Resources' }]} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
        {canWrite ? (
          <CreateResourceButton
            orgSlug={orgSlug}
            calendars={calendars.data ?? []}
            calendarsLoading={calendars.isPending}
            calendarsError={calendars.isError}
          />
        ) : null}
      </div>
      <div className="mt-6">
        <ResourcesTable
          orgSlug={orgSlug}
          canWrite={canWrite}
          calendars={calendars.data ?? []}
          calendarsLoading={calendars.isPending}
          calendarsError={calendars.isError}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>
    </div>
  );
}
