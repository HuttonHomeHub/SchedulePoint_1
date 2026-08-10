import type { CalendarSummary } from '@repo/types';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { projectQueryOptions } from '@/lib/query/hierarchy-queries';

/**
 * Hard cap on how many project lookups one calendar list may fan out to. A PROJECT-scoped calendar
 * carries only its `projectId`, and there is no org-wide project list endpoint (projects are listed
 * under their client), so naming the owning projects means one cached `GET …/projects/:id` per
 * DISTINCT project in view. The cap keeps a pathological library (hundreds of one-off project
 * calendars) from opening hundreds of sockets; beyond it the surplus rows fall back to the plain
 * "Project" pill, which is honest rather than wrong.
 */
const MAX_PROJECT_LOOKUPS = 30;

/**
 * Resolve the owning project's NAME for every PROJECT-scoped calendar in a list, as an
 * `id → name` map for the scope badge (ADR-0053 §1).
 *
 * The lookups share `projectQueryOptions`' cache key with the project-detail screen and the
 * navigator rail, so opening a project the badge already named costs nothing — and a project the
 * rail has loaded names its calendars instantly. A row whose project is still loading (or beyond
 * {@link MAX_PROJECT_LOOKUPS}) is simply absent from the map: the badge then reads "Project".
 */
export function useCalendarProjectNames(
  orgSlug: string,
  calendars: CalendarSummary[] | undefined,
): Map<string, string> {
  const projectIds = useMemo(() => {
    if (!calendars) return [];
    const ids = new Set<string>();
    for (const calendar of calendars) {
      if (calendar.scope === 'PROJECT' && calendar.projectId) ids.add(calendar.projectId);
    }
    return [...ids].slice(0, MAX_PROJECT_LOOKUPS);
  }, [calendars]);

  const results = useQueries({
    queries: projectIds.map((projectId) => projectQueryOptions(orgSlug, projectId)),
  });

  // Built inline (not memoised): it is at most MAX_PROJECT_LOOKUPS entries and is only ever read
  // during render, so a fresh Map each pass is cheaper than tracking the query array's identity.
  const names = new Map<string, string>();
  results.forEach((result, index) => {
    const id = projectIds[index];
    if (id && result.data) names.set(id, result.data.name);
  });
  return names;
}
