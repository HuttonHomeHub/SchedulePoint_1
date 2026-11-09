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
 * **The float a planner acts on: what this activity has LEFT from where its bar is drawn**
 * (one-planning-surface M-E-T7).
 *
 * The ONE formatter for it, read by all three planner-facing read-outs — the canvas bar sentence,
 * the Gantt grid and the activities table — so they cannot come to show different numbers under
 * the same word. It is deliberately a sibling of {@link formatFloat} rather than a parameter on
 * it: they take different fields and mean different things, and a boolean flag on one function is
 * how a caller ends up passing the wrong one and looking correct.
 *
 * **Total float and remaining float are both real, and the difference is the planner's own
 * spending.** `remainingFloat` is `totalFloat - visualDriftDays` (ADR-0033, M-D) — the slack a
 * placement has not yet used. On an activity nobody has placed the two are equal, which is every
 * plan in the estate today (FC-1), so this changes no number on any existing screen; it changes
 * which question the number answers the moment somebody places a bar.
 *
 * **Every caller of this renames its label in the same commit, and that is not tidiness.** A
 * column headed `Float` that quietly starts measuring from a different origin is the defect class
 * this register files most often — the reader has no way to notice, because the number is
 * plausible either way. Total float keeps the bare word nowhere: where it is still the right
 * quantity (DCMA, baseline float variance, float paths, the editor's context strip) it is labelled
 * as total, and a structural test pins those three analyses to it.
 */
export function formatRemainingFloat(remainingFloat: number | null): string {
  return formatFloat(remainingFloat);
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
