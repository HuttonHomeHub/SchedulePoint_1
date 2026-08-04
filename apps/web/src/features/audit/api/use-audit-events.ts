import type { AuditEvent, PageMeta } from '@repo/types';
import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';

import { apiFetchEnvelope } from '@/lib/api/client';

/** Rows per request. Small enough that the first screen paints fast, big enough to fill it. */
const PAGE_SIZE = 50;

export const auditKeys = {
  all: ['audit-events'] as const,
  organization: (orgSlug: string) => [...auditKeys.all, 'organization', orgSlug] as const,
  self: () => [...auditKeys.all, 'self'] as const,
};

interface AuditPage {
  events: AuditEvent[];
  nextCursor: string | null;
}

async function fetchPage(path: string, cursor: string | undefined): Promise<AuditPage> {
  const query = [`limit=${String(PAGE_SIZE)}`];
  if (cursor !== undefined && cursor !== '') query.push(`cursor=${encodeURIComponent(cursor)}`);
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
export function organizationAuditQueryOptions(orgSlug: string) {
  return infiniteQueryOptions({
    queryKey: auditKeys.organization(orgSlug),
    staleTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(`/organizations/${orgSlug}/audit-events`, pageParam),
    getNextPageParam: (last: AuditPage) => last.nextCursor ?? undefined,
  });
}

/** The caller's own events, across every organisation, plus the org-less authentication rows. */
export function selfAuditQueryOptions() {
  return infiniteQueryOptions({
    queryKey: auditKeys.self(),
    staleTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage('/me/audit-events', pageParam),
    getNextPageParam: (last: AuditPage) => last.nextCursor ?? undefined,
  });
}

export function useOrganizationAuditEvents(orgSlug: string) {
  return useInfiniteQuery(organizationAuditQueryOptions(orgSlug));
}

export function useSelfAuditEvents() {
  return useInfiniteQuery(selfAuditQueryOptions());
}
