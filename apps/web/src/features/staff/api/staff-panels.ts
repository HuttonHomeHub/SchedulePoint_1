import { useQuery, type UseQueryResult } from '@tanstack/react-query';

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
export function useStaffInstallation(): UseQueryResult<StaffInstallation> {
  return useQuery({
    queryKey: ['staff', 'installation'],
    queryFn: () => apiFetch<StaffInstallation>('/staff/installation'),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * One page of unverified accounts.
 *
 * The cursor is part of the key rather than held outside it, so paging back to a page already
 * fetched is served from the cache and writes **no** second audit row — every read here is audited,
 * and a reader stepping through pages should not be able to inflate that log by going backwards.
 */
export function useStaffAccounts(cursor?: string): UseQueryResult<StaffAccounts> {
  return useQuery({
    queryKey: ['staff', 'accounts', cursor ?? null],
    queryFn: () =>
      apiFetch<StaffAccounts>(
        cursor === undefined
          ? '/staff/accounts'
          : `/staff/accounts?cursor=${encodeURIComponent(cursor)}`,
      ),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useStaffActivity(): UseQueryResult<StaffActivityRow[]> {
  return useQuery({
    queryKey: ['staff', 'activity'],
    queryFn: () => apiFetch<StaffActivityRow[]>('/staff/activity'),
    refetchOnWindowFocus: false,
    retry: false,
  });
}
