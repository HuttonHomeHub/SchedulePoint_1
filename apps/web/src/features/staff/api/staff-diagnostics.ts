import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

/**
 * What a non-zero count means. A closed vocabulary, mirroring the server registry's.
 *
 * `retrospective` sizes whose stored numbers changed meaning when a release landed — the work is
 * not wrong now. `prospective` sizes a defect that is still live. Both entries are retrospective
 * today, and that is exactly why this is a field rather than a sentence on the panel: a global
 * sentence would be true by coincidence and would lie the day a prospective diagnostic is added.
 */
export type DiagnosticNature = 'retrospective' | 'prospective';

/** One named question's answer. Every field a number except the registry literals (ADR-0140). */
export interface StaffDiagnosticRow {
  id: string;
  label: string;
  nature: DiagnosticNature;
  examined: number;
  affected: number;
  affectedPlans: number;
  affectedOrganizations: number;
  elapsedMs: number;
}

export interface StaffDiagnostics {
  takenAt: string;
  apiVersion: string;
  diagnostics: StaffDiagnosticRow[];
}

/**
 * The diagnostics read, fired **only** by the button (ADR-0140).
 *
 * `enabled: false` plus `refetch()` rather than an ordinary query, for a reason the other staff
 * panels do not have: this one reads customer tables and writes an audit row, so a query that ran
 * on mount would count every visit to `/staff` as somebody asking a question about customer data.
 * Its siblings already refuse `refetchOnWindowFocus` on the weaker version of that argument — a
 * panel refetching on a tab switch fills the audit log with evidence of nothing.
 *
 * `gcTime: 0` so the answer does not survive leaving the page. A count is a fact about the estate
 * at a moment, and the panel prints the moment beside it; a cached row silently re-rendered on a
 * later visit would carry a `takenAt` the reader has no reason to re-read.
 */
export function useStaffDiagnostics(): UseQueryResult<StaffDiagnostics> {
  return useQuery({
    queryKey: ['staff', 'diagnostics'],
    queryFn: () => apiFetch<StaffDiagnostics>('/staff/diagnostics'),
    enabled: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
    retry: false,
  });
}
