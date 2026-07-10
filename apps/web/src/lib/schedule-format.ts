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

/** Which variance a cell shows. Start/finish: later = behind. Float: less float = behind. */
export type VarianceField = 'start' | 'finish' | 'float';

/**
 * Format one of a variance row's day deltas for the activities table (working days).
 * For **start/finish**, positive = later than baseline = **behind**. For **float**, the
 * convention flips: less float than baseline (a negative delta) is **behind**, more float
 * is ahead — so a slipping activity reads "behind" consistently across all three columns.
 * "Added"/"Removed" mark activities that don't line up with the baseline; "—" means the
 * values aren't comparable yet (a not-computed live date, or an unbaselined activity).
 */
export function formatDayVariance(row: BaselineVarianceRow, field: VarianceField): FinishVariance {
  if (row.removed) return { text: 'Removed', tone: 'neutral' };
  if (!row.inBaseline) return { text: 'Added', tone: 'neutral' };
  const days =
    field === 'start'
      ? row.startVarianceDays
      : field === 'finish'
        ? row.finishVarianceDays
        : row.floatVarianceDays;
  if (days === null) return { text: '—', tone: 'neutral' };
  if (days === 0) return { text: 'On baseline', tone: 'onTrack' };
  const behind = field === 'float' ? days < 0 : days > 0;
  const magnitude = Math.abs(days);
  if (field === 'float') {
    // Show the signed change in float (positive = more float now, i.e. ahead).
    return behind
      ? { text: `−${magnitude} d float`, tone: 'behind' }
      : { text: `+${magnitude} d float`, tone: 'ahead' };
  }
  return behind
    ? { text: `${magnitude} d behind`, tone: 'behind' }
    : { text: `${magnitude} d ahead`, tone: 'ahead' };
}

/** Finish variance — the headline comparison. Convenience wrapper over {@link formatDayVariance}. */
export function formatFinishVariance(row: BaselineVarianceRow): FinishVariance {
  return formatDayVariance(row, 'finish');
}
