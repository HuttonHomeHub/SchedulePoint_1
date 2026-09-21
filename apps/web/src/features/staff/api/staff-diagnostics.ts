import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

/**
 * What a non-zero count means. A closed vocabulary, mirroring the server registry's.
 *
 * `retrospective` sizes whose stored numbers changed meaning when a release landed — the work is
 * not wrong now. `prospective` sizes a defect that is still live. This is a field rather than a
 * sentence on the panel because a global sentence would be true only by coincidence — which the
 * registry has since proved: when this was written every entry was retrospective, and the registry
 * now holds both kinds, so that sentence would by now be lying on most rows with nothing failing.
 */
export type DiagnosticNature = 'retrospective' | 'prospective';

/**
 * What ONE examined row is. A closed vocabulary, mirroring the server registry's.
 *
 * The sentence names this noun out loud — "17 of 1,284 **activities**" — and it was a hard-coded
 * literal until `docs/TECH_DEBT.md` #362, so the two diagnostics that do not count activities
 * printed their counts as counts of activities. Nine entries ask about activities, one about plans
 * and one about baselines.
 */
export type DiagnosticUnit = 'activity' | 'plan' | 'baseline';

/** One named question's answer. Every field a number except the registry literals (ADR-0140). */
export interface StaffDiagnosticRow {
  id: string;
  label: string;
  nature: DiagnosticNature;
  unit: DiagnosticUnit;
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
