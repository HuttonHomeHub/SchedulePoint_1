import { ARCHIVED_FILTERS } from '@repo/types';
import { useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import {
  CALENDAR_SCOPE_FILTERS,
  CalendarsTable,
  CreateCalendarButton,
  DEFAULT_CALENDAR_LIBRARY_FILTERS,
  type CalendarLibraryFilters,
} from '@/features/calendars';
import { canManageHierarchy, canManageOrgCalendars, useOrgRole } from '@/hooks/use-org-role';
import { pickParam, pickText, useUrlFilterState } from '@/hooks/use-url-filter-state';

/**
 * Parse the screen's three filters out of the URL. Unknown values degrade to the default rather
 * than throwing — a hand-edited `?scope=nonsense` should show the shared library, not a crash.
 * Module-level (not inline) so the identity is stable across renders.
 */
function parseCalendarFilters(raw: Record<string, unknown>): CalendarLibraryFilters {
  return {
    q: pickText(raw, 'q'),
    scope: pickParam(raw, 'scope', CALENDAR_SCOPE_FILTERS, DEFAULT_CALENDAR_LIBRARY_FILTERS.scope),
    archived: pickParam(
      raw,
      'archived',
      ARCHIVED_FILTERS,
      DEFAULT_CALENDAR_LIBRARY_FILTERS.archived,
    ),
  };
}

/**
 * The organisation's calendars library screen (`/orgs/$orgSlug/calendars`). Writing to the SHARED
 * library additionally needs `calendar:manage_org` (ADR-0053 §2), resolved here and threaded down so
 * the table and the create dialog gate on it rather than re-deriving the role.
 *
 * The screen — not the table — owns the search/scope/archived filters, because they belong in the
 * URL (`docs/UX_STANDARDS.md`: filters are deep-linkable and reload-safe). The table takes them as
 * props so it stays renderable outside a router.
 */
export function CalendarsScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const role = useOrgRole(orgSlug);
  const canWrite = canManageHierarchy(role);
  const canManageOrg = canManageOrgCalendars(role);
  const [filters, setFilters] = useUrlFilterState(
    DEFAULT_CALENDAR_LIBRARY_FILTERS,
    parseCalendarFilters,
  );

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <Breadcrumbs items={[{ label: 'Calendars' }]} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
        {canWrite ? <CreateCalendarButton orgSlug={orgSlug} canManageOrg={canManageOrg} /> : null}
      </div>
      <div className="mt-6">
        <CalendarsTable
          orgSlug={orgSlug}
          canWrite={canWrite}
          canManageOrg={canManageOrg}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>
    </div>
  );
}
