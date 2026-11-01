import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetchEnvelope } from '@/lib/api/client';

export interface CrashReportRow {
  id: string;
  /** Six upper-case hex characters: what the person was shown on the "Something went wrong" screen. */
  reference: string;
  boundary: string;
  errorName: string;
  message: string;
  routePattern: string | null;
  webVersion: string;
  browser: string;
  browserMajor: number | null;
  stack: string | null;
  componentStack: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** The rows, and the roll-up the summary and the cap sentence read. */
export interface CrashReports {
  rows: CrashReportRow[];
  /** Every stored crash, which can exceed the rows returned. */
  total: number;
  cap: number;
  /** When true, a new kind of crash is not being stored; a repeat of a stored one still counts. */
  capReached: boolean;
  /** Distinct crashes last reported in the past 7 days: what the console's top line rests on. */
  seenLast7Days: number;
}

interface CrashReportsMeta {
  total?: unknown;
  cap?: unknown;
  capReached?: unknown;
  seenLast7Days?: unknown;
}

/** Named so the page's Refresh lists the reads it makes by key (`STAFF_PAGE_READS`). */
export const STAFF_CRASH_REPORTS_KEY = ['staff', 'crash-reports'] as const;

/**
 * Screen crashes reported by browsers (ADR-0211).
 *
 * An **audited read** like every staff panel, so it is not polled and not refetched on window focus:
 * a refetch on each tab switch would fill the audit log with evidence of nothing. The summary and
 * the panel both take this one query's result, so a page load is one read.
 *
 * A roll-up field the server did not send falls back to a value derived from the rows rather than to
 * a number that would read as a fact: the two apps release independently (ADR-0027).
 */
export function useStaffCrashReports(): UseQueryResult<CrashReports> {
  return useQuery({
    queryKey: STAFF_CRASH_REPORTS_KEY,
    queryFn: async (): Promise<CrashReports> => {
      const { data, meta } = await apiFetchEnvelope<CrashReportRow[], CrashReportsMeta>(
        '/staff/crash-reports',
      );
      const total = typeof meta?.total === 'number' ? meta.total : data.length;
      const cap = typeof meta?.cap === 'number' ? meta.cap : 1000;
      return {
        rows: data,
        total,
        cap,
        capReached: typeof meta?.capReached === 'boolean' ? meta.capReached : total >= cap,
        seenLast7Days: typeof meta?.seenLast7Days === 'number' ? meta.seenLast7Days : data.length,
      };
    },
    refetchOnWindowFocus: false,
    retry: false,
  });
}
