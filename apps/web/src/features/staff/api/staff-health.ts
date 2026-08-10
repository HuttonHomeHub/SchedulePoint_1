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

/** One table's retention state (ADR-0087). */
export interface RetentionTable {
  table: string;
  retentionDays: number;
  /** Null means the table is EMPTY — which the surface must not render as "0 days". */
  oldestAt: string | null;
  oldestAgeDays: number | null;
  overdue: boolean;
  /** Null means this process has not swept. Distinct from `0`, which means it deleted nothing. */
  lastDeleted: number | null;
  cappedOut: boolean;
  failed: boolean;
}

export interface Retention {
  enabled: boolean;
  intervalMinutes: number;
  processStartedAt: string;
  lastRunAt: string | null;
  consecutiveFailures: number;
  tables: RetentionTable[];
}

export interface StaffHealth {
  failuresLast24h: number;
  failuresLastHour: number;
  lastFailureAt: string | null;
  transportConfigured: boolean;
  alertingConfigured: boolean;
  heartbeatConfigured: boolean;
  recentFailures: MailFailure[];
  /**
   * Retention, on the mail-named response.
   *
   * Deliberate (ADR-0087, spec §4.6): retention is health, and a second route would earn its own
   * census entry and write a second `staff.panel_read` row on every page load — buying a tidier
   * name with a noisier audit log. It is also why the Retention section takes no hook of its own:
   * TanStack Query dedupes it with the Mail panel, so the page still makes one request.
   */
  retention: Retention;
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
