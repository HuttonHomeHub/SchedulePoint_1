import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

export interface CspReportRow {
  id: string;
  effectiveDirective: string;
  blockedUri: string;
  documentUri: string;
  disposition: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceFile: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
}

/**
 * What the Content-Security-Policy is blocking.
 *
 * Reading it is an **audited act** on the server — every staff route is, because on this surface the
 * read is the privileged act — so this is not polled and not refetched on window focus: a panel that
 * refetched on every tab switch would fill the audit log with evidence of nothing.
 */
export function useStaffCspReports(): UseQueryResult<CspReportRow[]> {
  return useQuery({
    // `/staff/csp-reports`, not `/api/v1/staff/csp-reports`: `apiFetch` prefixes `API_BASE_URL`,
    // which is already `/api/v1`. The first version of this feature doubled it, and the component
    // tests could not see it because they mock `apiFetch` and assert back whatever path they are
    // handed — only the Playwright journey caught it.
    queryKey: ['staff', 'csp-reports'],
    queryFn: () => apiFetch<CspReportRow[]>('/staff/csp-reports'),
    refetchOnWindowFocus: false,
    retry: false,
  });
}
