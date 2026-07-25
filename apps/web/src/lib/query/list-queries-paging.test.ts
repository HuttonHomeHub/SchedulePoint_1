import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clientsQueryOptions, plansQueryOptions, projectsQueryOptions } from './hierarchy-queries';

import { baselinesQueryOptions } from '@/features/baselines/api/use-baselines';
import { calendarsQueryOptions } from '@/features/calendars/api/use-calendars';
import {
  activityCrossPlanLinksQueryOptions,
  useOtherPlanActivities,
} from '@/features/cross-plan-dependencies/api/use-cross-plan-dependencies';
import {
  predecessorsQueryOptions,
  successorsQueryOptions,
} from '@/features/dependencies/api/use-dependencies';
import { membersQueryOptions } from '@/features/members/api/use-members';
import { deletedItemsQueryOptions } from '@/features/recently-deleted/api/use-deleted-items';
import { resourcesQueryOptions } from '@/features/resources/api/use-resources';

/**
 * Regression tests for the cursor-paginated list queries.
 *
 * `PaginationQueryDto.limit` defaults to 20, so a list query that called its endpoint with no
 * pagination params silently truncated at the first 20 rows: an org with more than 20 resources or
 * calendars could neither see nor pick the rest, and the same held for members, the recycle bin, the
 * client → project → plan navigator, baselines and the logic editor's link lists. Each of these must
 * page through `meta.nextCursor` to exhaustion (`apiFetchAllPages`) and concatenate in order — the
 * fix already applied to the plan workspace's activities/dependencies reads.
 *
 * Unpaginated endpoints are deliberately NOT covered here (they return a bare array by design and
 * still use `apiFetch`): resource assignments, activity steps, share links, the organisations list,
 * the per-activity note counts and the baseline variance roll-up.
 */
function page(data: unknown[], meta: { nextCursor: string | null; hasMore: boolean }): Response {
  return new Response(JSON.stringify({ data, meta }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Two rows over two pages, so a first-page-only read would drop `two`. */
function twoPages() {
  return vi
    .fn()
    .mockResolvedValueOnce(page([{ id: 'one' }], { nextCursor: 'one', hasMore: true }))
    .mockResolvedValueOnce(page([{ id: 'two' }], { nextCursor: null, hasMore: false }));
}

/** Invoke a `queryOptions` object's `queryFn` the way TanStack Query would. */
async function run(options: { queryFn?: unknown }): Promise<{ id: string }[]> {
  return (options.queryFn as () => Promise<{ id: string }[]>)();
}

/** Each converted query: a label, its options, and the collection path it must page. */
const PAGED_QUERIES: { name: string; options: { queryFn?: unknown }; path: string }[] = [
  {
    name: 'resources (the org resource library + every resource picker)',
    options: resourcesQueryOptions('acme'),
    path: '/organizations/acme/resources',
  },
  {
    name: 'calendars (the org calendar library + every calendar picker)',
    options: calendarsQueryOptions('acme'),
    path: '/organizations/acme/calendars',
  },
  {
    name: 'members',
    options: membersQueryOptions('acme'),
    path: '/organizations/acme/members',
  },
  {
    name: 'deleted items (the recycle bin)',
    options: deletedItemsQueryOptions('acme'),
    path: '/organizations/acme/deleted',
  },
  {
    name: 'baselines',
    options: baselinesQueryOptions('acme', 'p1'),
    path: '/organizations/acme/plans/p1/baselines',
  },
  {
    name: 'clients',
    options: clientsQueryOptions('acme'),
    path: '/organizations/acme/clients',
  },
  {
    name: 'projects',
    options: projectsQueryOptions('acme', 'c1'),
    path: '/organizations/acme/clients/c1/projects',
  },
  {
    name: 'plans',
    options: plansQueryOptions('acme', 'pr1'),
    path: '/organizations/acme/projects/pr1/plans',
  },
  {
    name: 'predecessors',
    options: predecessorsQueryOptions('acme', 'a1'),
    path: '/organizations/acme/activities/a1/predecessors',
  },
  {
    name: 'successors',
    options: successorsQueryOptions('acme', 'a1'),
    path: '/organizations/acme/activities/a1/successors',
  },
  {
    name: 'cross-plan links',
    options: activityCrossPlanLinksQueryOptions('acme', 'a1'),
    path: '/organizations/acme/activities/a1/cross-plan-dependencies',
  },
];

describe('cursor-paginated list queries page to exhaustion', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it.each(PAGED_QUERIES)('$name follows the cursor and concatenates in order', async (query) => {
    const fetchMock = twoPages();
    vi.stubGlobal('fetch', fetchMock);

    const rows = await run(query.options);

    expect(rows.map((r) => r.id)).toEqual(['one', 'two']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toContain(`${query.path}?limit=100`);
    expect(urls[0]).not.toContain('cursor=');
    expect(urls[1]).toContain('cursor=one');
  });

  // The headline symptom, stated in the terms a user would report it: a library bigger than the
  // server's default page must still list every row.
  it('lists more than one page of resources (no silent truncation at the first 20 rows)', async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` }));
    const second = Array.from({ length: 25 }, (_, i) => ({ id: `r${100 + i}` }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page(first, { nextCursor: 'r99', hasMore: true }))
      .mockResolvedValueOnce(page(second, { nextCursor: null, hasMore: false }));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await run(resourcesQueryOptions('acme'));

    expect(rows).toHaveLength(125);
    expect(rows[20]?.id).toBe('r20');
    expect(rows[124]?.id).toBe('r124');
  });

  it('lists more than one page of calendars (no silent truncation at the first 20 rows)', async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({ id: `c${i}` }));
    const second = Array.from({ length: 5 }, (_, i) => ({ id: `c${100 + i}` }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page(first, { nextCursor: 'c99', hasMore: true }))
      .mockResolvedValueOnce(page(second, { nextCursor: null, hasMore: false }));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await run(calendarsQueryOptions('acme'));

    expect(rows).toHaveLength(105);
    expect(rows[104]?.id).toBe('c104');
  });

  /**
   * The cross-plan endpoint picker reads another plan's activities under the SAME cache key as the
   * plan workspace (`activityKeys.listByPlan`), so a first-page-only read here would also seed the
   * workspace's cache with a truncated plan.
   */
  it('useOtherPlanActivities pages the whole other plan', async () => {
    const fetchMock = twoPages();
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useOtherPlanActivities('acme', 'p2'), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/organizations/acme/plans/p2/activities?limit=100',
    );
  });
});
