import type { ProbeResultRow } from '../api/probe-results';

import { sittingsFromRows } from './sitting';
import { describeVerdicts, EXPECTED_READINGS, sittingIndexRow } from './sitting-index';

import { formatRelative } from '@/lib/relative-time';

/**
 * What the Performance box says about the last sitting while it is folded away (ADR-0178 D-3).
 *
 * **A tally of what the sitting holds, not a verdict.** The history already refuses to rank
 * verdicts (`sitting-index.ts`: an ungraded or indeterminate reading is not bad news), and a
 * one-line summary is the place that rule is easiest to break, because one phrase has to stand for
 * a whole sitting. So it states the counts, in the words the index uses, and nothing is called good
 * or bad here.
 *
 * **"Not measured" is said only when there is nothing**, which is why this takes the rows and not a
 * flag: a read that has not settled, or has failed, is not the same fact as an empty history, and
 * the caller says those itself.
 *
 * The machine is the operator's own label when there is one. Without it the sentence says the
 * machine was not named rather than "this browser": the reading may have been taken by another
 * staff member on another computer, and the history does not know which.
 */
export function lastReadingSummary(rows: readonly ProbeResultRow[], now: Date): string {
  const newest = sittingsFromRows(rows)[0];
  if (newest === undefined) return 'Not measured on this installation yet.';

  const row = sittingIndexRow(newest, EXPECTED_READINGS);
  const machine = newest.context.machineLabel ?? 'a machine that was not named';
  return `Last measured ${formatRelative(newest.context.startedAt, now)} on ${machine}: ${describeVerdicts(row)}.`;
}
