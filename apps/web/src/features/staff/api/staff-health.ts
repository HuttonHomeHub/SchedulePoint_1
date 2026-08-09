import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

export interface MailFailure {
  id: string;
  occurredAt: string;
  kind: string;
  outcome: string;
  recipient: string | null;
  errorClass: string | null;
}

export interface StaffHealth {
  failuresLast24h: number;
  failuresLastHour: number;
  lastFailureAt: string | null;
  transportConfigured: boolean;
  alertingConfigured: boolean;
  heartbeatConfigured: boolean;
  recentFailures: MailFailure[];
}

/**
 * The installation's mail health.
 *
 * Reading it is an **audited act** on the server, which is why it is not prefetched, not polled and
 * not refetched on window focus: every read writes a row, and a panel that refetched on every tab
 * switch would fill the audit log with evidence of nothing.
 */
export function useStaffHealth(): UseQueryResult<StaffHealth> {
  return useQuery({
    queryKey: ['staff', 'health'],
    queryFn: () => apiFetch<StaffHealth>('/staff/health'),
    refetchOnWindowFocus: false,
    retry: false,
  });
}
