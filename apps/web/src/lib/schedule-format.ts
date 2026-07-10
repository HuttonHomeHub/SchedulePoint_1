import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';

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

/**
 * How an activity's finish compares to the active baseline (M7, ADR-0025). `tone`
 * drives an optional visual accent but is **never the only signal** — `text` always
 * carries the meaning (WCAG 2.2). `behind` = later than baseline, `ahead` = earlier,
 * `onTrack` = on the baseline, `neutral` = not comparable / added / removed.
 */
export interface FinishVariance {
  text: string;
  tone: 'behind' | 'ahead' | 'onTrack' | 'neutral';
}

/**
 * Format a variance row's finish variance for the activities table. Working days,
 * signed so positive = behind. Returns "Added"/"Removed" for activities that don't line
 * up with the baseline, and "—" when the dates aren't comparable yet.
 */
export function formatFinishVariance(row: BaselineVarianceRow): FinishVariance {
  if (row.removed) return { text: 'Removed', tone: 'neutral' };
  if (!row.inBaseline) return { text: 'Added', tone: 'neutral' };
  const days = row.finishVarianceDays;
  if (days === null) return { text: '—', tone: 'neutral' };
  if (days === 0) return { text: 'On baseline', tone: 'onTrack' };
  return days > 0
    ? { text: `${days} d behind`, tone: 'behind' }
    : { text: `${Math.abs(days)} d ahead`, tone: 'ahead' };
}
