import type { AuditEvent, PageMeta } from '@repo/types';
import { infiniteQueryOptions, keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import type { AuditQueryFilter } from '../model/audit-filter';

import { apiFetchEnvelope } from '@/lib/api/client';

/** Rows per request. Small enough that the first screen paints fast, big enough to fill it. */
const PAGE_SIZE = 50;

/**
 * The filter is **part of the query key**, so changing it starts a fresh infinite query rather than
 * appending a differently-filtered page to the one already on screen. Structural, not a handler:
 * cursors are keyset positions in a specific result set, and continuing one across a filter change
 * would silently interleave two.
 *
 * Keyed on the serialised filter rather than the object so a re-render with an equal filter is not
 * a new key.
 */
function filterKey(filter: AuditQueryFilter | undefined): string {
  if (filter === undefined) return '';
  return JSON.stringify([
    filter.action ?? [],
    filter.outcome ?? [],
    filter.from ?? '',
    filter.to ?? '',
  ]);
}

export const auditKeys = {
  all: ['audit-events'] as const,
  organization: (orgSlug: string, filter?: AuditQueryFilter) =>
    [...auditKeys.all, 'organization', orgSlug, filterKey(filter)] as const,
  self: (filter?: AuditQueryFilter) => [...auditKeys.all, 'self', filterKey(filter)] as const,
};

interface AuditPage {
  events: AuditEvent[];
  nextCursor: string | null;
}

async function fetchPage(
  path: string,
  cursor: string | undefined,
  filter: AuditQueryFilter | undefined,
): Promise<AuditPage> {
  const query = [`limit=${String(PAGE_SIZE)}`];
  if (cursor !== undefined && cursor !== '') query.push(`cursor=${encodeURIComponent(cursor)}`);
  // An absent filter adds nothing at all, so the flag-off request is byte-for-byte the one this
  // hook sent before the filter existed — which is what the parity suites pin.
  for (const action of filter?.action ?? []) query.push(`action=${encodeURIComponent(action)}`);
  for (const outcome of filter?.outcome ?? []) query.push(`outcome=${encodeURIComponent(outcome)}`);
  if (filter?.from !== undefined) query.push(`from=${encodeURIComponent(filter.from)}`);
  if (filter?.to !== undefined) query.push(`to=${encodeURIComponent(filter.to)}`);
  const { data, meta } = await apiFetchEnvelope<AuditEvent[], PageMeta>(
    `${path}?${query.join('&')}`,
  );
  return { events: data, nextCursor: meta?.hasMore === true ? meta.nextCursor : null };
}

/**
 * One organisation's audit log (ADR-0072), newest first.
 *
 * Infinite rather than all-pages: an audit log only grows, and the members screen's
 * `apiFetchAllPages` would eventually walk a year of history to render the first screenful.
 *
 * `staleTime: 0`. The log is what someone consults *because* something just happened, and a
 * cached page that omits the event they came to look for is worse than a spinner — the reader has
 * no way to tell "not recorded" from "not fetched yet", which is the exact ambiguity ADR-0072
 * exists to remove.
 */
export function organizationAuditQueryOptions(orgSlug: string, filter?: AuditQueryFilter) {
  return infiniteQueryOptions({
    queryKey: auditKeys.organization(orgSlug, filter),
    staleTime: 0,
    // Keep the rows on screen while a newly-filtered page settles. Without it every chip click
    // discards the table and collapses it to a spinner, because the filter is part of the query
    // key — the `use-calendars.ts` precedent, and `docs/UX_STANDARDS.md`'s "no layout shift".
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchPage(`/organizations/${orgSlug}/audit-events`, pageParam, filter),
    getNextPageParam: (last: AuditPage) => last.nextCursor ?? undefined,
  });
}

/** The caller's own events, across every organisation, plus the org-less authentication rows. */
export function selfAuditQueryOptions(filter?: AuditQueryFilter) {
  return infiniteQueryOptions({
    queryKey: auditKeys.self(filter),
    staleTime: 0,
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage('/me/audit-events', pageParam, filter),
    getNextPageParam: (last: AuditPage) => last.nextCursor ?? undefined,
  });
}

export function useOrganizationAuditEvents(orgSlug: string, filter?: AuditQueryFilter) {
  return useInfiniteQuery(organizationAuditQueryOptions(orgSlug, filter));
}

export function useSelfAuditEvents(filter?: AuditQueryFilter) {
  return useInfiniteQuery(selfAuditQueryOptions(filter));
}
