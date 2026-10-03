import type { ActivityHistoryEntry, ActivityHistoryPageMeta } from '@repo/types';
import { useInfiniteQuery, type UseInfiniteQueryResult } from '@tanstack/react-query';

import { apiFetchEnvelope } from '@/lib/api/client';
import { activityHistoryKeys } from '@/lib/query/hierarchy-keys';

export { activityHistoryKeys };

/** One fetched page of an activity's history, with the cursor state of the `{ data, meta }` envelope. */
export interface ActivityHistoryPage {
  entries: ActivityHistoryEntry[];
  nextCursor: string | null;
  hasMore: boolean;
  /** The later of the activity's creation and the day the database began recording. */
  recordingSince: string;
}

const PAGE_SIZE = 50;

async function fetchPage(
  orgSlug: string,
  activityId: string,
  cursor: string | null,
): Promise<ActivityHistoryPage> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) query.set('cursor', cursor);
  const { data, meta } = await apiFetchEnvelope<ActivityHistoryEntry[], ActivityHistoryPageMeta>(
    `/organizations/${orgSlug}/activities/${activityId}/history?${query.toString()}`,
  );
  return {
    entries: data,
    nextCursor: meta?.nextCursor ?? null,
    hasMore: meta?.hasMore ?? false,
    recordingSince: meta?.recordingSince ?? '',
  };
}

/**
 * An activity's change history, newest first, 50 at a time (ADR-0174). Read-only — nothing a client
 * does writes an entry — so there is no mutation here, and the cache is dropped by the activity and
 * link writes that record one (`invalidateActivity`, the dependency hooks). `staleTime: 0` means the
 * tab also refetches each time it is opened, which is what covers the writes that do not invalidate
 * it (a resource assignment) without every one of those hooks having to know this key.
 */
export function useActivityHistory(
  orgSlug: string,
  activityId: string,
): UseInfiniteQueryResult<{ pages: ActivityHistoryPage[]; pageParams: unknown[] }, Error> {
  return useInfiniteQuery({
    queryKey: activityHistoryKeys.byActivity(orgSlug, activityId),
    queryFn: ({ pageParam }) => fetchPage(orgSlug, activityId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
