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

export function useStaffAccounts(): UseQueryResult<StaffAccounts> {
  return useQuery({
    queryKey: ['staff', 'accounts'],
    queryFn: () => apiFetch<StaffAccounts>('/staff/accounts'),
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
