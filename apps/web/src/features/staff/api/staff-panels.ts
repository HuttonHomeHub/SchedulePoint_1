import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

export interface StaffInstallation {
  apiVersion: string;
  environment: string;
  requireEmailVerification: boolean;
  planEditLockEnforced: boolean;
  mailHost: string | null;
  mailAlertingConfigured: boolean;
  heartbeatConfigured: boolean;
  staffCount: number;
}

export interface UnverifiedAccount {
  id: string;
  email: string;
  createdAt: string;
}

export interface StaffAccounts {
  unverifiedTotal: number;
  unverified: UnverifiedAccount[];
  hasMore: boolean;
  /** The cursor for the next page, or `null` at the end. Without it `hasMore` was unactionable. */
  nextCursor: string | null;
}

export interface StaffActivityRow {
  id: string;
  occurredAt: string;
  action: string;
  actorLabel: string | null;
  subjectLabel: string | null;
}

/**
 * The three M5 panels.
 *
 * All three are **audited reads**, so none is polled or refetched on window focus — a panel that
 * refetched on every tab switch would fill the audit log with evidence of nothing. Paths are
 * relative to `API_BASE_URL`, which is already `/api/v1`.
 */
/** Named so the page's Refresh lists the reads it makes by key (`STAFF_PAGE_READS`). */
export const STAFF_INSTALLATION_KEY = ['staff', 'installation'] as const;
export const STAFF_ACCOUNTS_KEY = ['staff', 'accounts'] as const;
export const STAFF_ACTIVITY_KEY = ['staff', 'activity'] as const;

export function useStaffInstallation(): UseQueryResult<StaffInstallation> {
  return useQuery({
    queryKey: STAFF_INSTALLATION_KEY,
    queryFn: () => apiFetch<StaffInstallation>('/staff/installation'),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * The unverified accounts, one page at a time, accumulated.
 *
 * **One infinite query under one key**, so the summary at the top of the console reads page 1 of it
 * while the panel reads every page fetched so far — and the load is still exactly one request, which
 * is what keeps it at one `staff.panel_read` row (every read here is audited). The previous shape
 * was a query per cursor: pressing *Show older* mounted a new key, which made the whole body pending
 * (taking the focused button with it) and **replaced** the rows instead of adding to them.
 *
 * Paging forward fetches only the next page, and a page already fetched is served from the cache, so
 * a reader stepping through cannot inflate the log. Nothing here refetches on its own.
 */
export function useStaffAccounts(): UseInfiniteQueryResult<
  InfiniteData<StaffAccounts, string | undefined>
> {
  return useInfiniteQuery({
    queryKey: STAFF_ACCOUNTS_KEY,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<StaffAccounts>(
        pageParam === undefined
          ? '/staff/accounts'
          : `/staff/accounts?cursor=${encodeURIComponent(pageParam)}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useStaffActivity(): UseQueryResult<StaffActivityRow[]> {
  return useQuery({
    queryKey: STAFF_ACTIVITY_KEY,
    queryFn: () => apiFetch<StaffActivityRow[]>('/staff/activity'),
    refetchOnWindowFocus: false,
    retry: false,
  });
}
