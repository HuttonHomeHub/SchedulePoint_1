import type { ActivitySummary } from '@repo/types';

/** The critical/near-critical fields the criticality badge reads. */
type Schedulable = Pick<ActivitySummary, 'isCritical' | 'isNearCritical' | 'totalFloat'>;

/** A criticality badge to render for an activity, or null when none applies. */
export interface Criticality {
  label: string;
  variant: 'critical' | 'warning';
}

/**
 * The criticality badge for an activity, or null. An activity that has never been
 * calculated (`totalFloat === null`) and one with ordinary positive float get no
 * badge — only the critical path (float ≤ 0) and the near-critical band are
 * flagged, so the table stays quiet. Colour is never the only signal: the caller
 * renders the `label` text alongside the variant.
 */
export function criticality(activity: Schedulable): Criticality | null {
  if (activity.totalFloat === null) return null;
  if (activity.isCritical) return { label: 'Critical', variant: 'critical' };
  if (activity.isNearCritical) return { label: 'Near-critical', variant: 'warning' };
  return null;
}

/** Total float as working days (`"3 d"`, `"−2 d"`); an em dash when uncomputed. */
export function formatFloat(totalFloat: number | null): string {
  if (totalFloat === null) return '—';
  // Use a real minus sign for negatives (matches the design system's numerals).
  return totalFloat < 0 ? `−${Math.abs(totalFloat)} d` : `${totalFloat} d`;
}
