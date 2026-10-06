import { PROBE_RESULTS_KEY } from '@/features/perf-probe/api/probe-results';
import { STAFF_CSP_REPORTS_KEY } from '@/features/staff/api/staff-csp-reports';
import { STAFF_HEALTH_KEY } from '@/features/staff/api/staff-health';
import {
  STAFF_ACCOUNTS_KEY,
  STAFF_ACTIVITY_KEY,
  STAFF_INSTALLATION_KEY,
} from '@/features/staff/api/staff-panels';

/**
 * The six reads a load of `/staff` makes, and therefore the six a **Refresh** makes — **listed by
 * name, never by a key prefix.**
 *
 * Reading a staff panel is an audited act: each request writes one `staff.panel_read` row to a table
 * that refuses `DELETE` (ADR-0072). `['staff']` as a prefix would refetch Diagnostics too, which is
 * press-only by ADR-0140 because it touches customer tables, so a Refresh would have turned "look at
 * the page again" into "ask a question about customer data". A list is the only form that cannot
 * grow by accident: a seventh key added to the console is a line somebody has to write here, and
 * `page-reads.test.ts` pins both the count and the absence of the diagnostics key.
 *
 * Health is read by two boxes (Mail, Clearing old records) and installation by two (Version and
 * settings, Alerts and monitoring); each appears once because the cache holds one entry per key, and
 * a request is per entry, not per observer.
 */
export const STAFF_PAGE_READS = [
  STAFF_HEALTH_KEY,
  STAFF_CSP_REPORTS_KEY,
  STAFF_ACCOUNTS_KEY,
  STAFF_INSTALLATION_KEY,
  STAFF_ACTIVITY_KEY,
  PROBE_RESULTS_KEY,
] as const;
