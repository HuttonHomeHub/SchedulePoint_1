import type { TimeRow } from './window-rows';

/** A week of editable rows — index 0 = Monday … 6 = Sunday. */
type Week = TimeRow[][];

/** Where a day's hours can be copied to. Monday-first indices, matching storage. */
export interface CopyTarget {
  id: string;
  /** Menu label, written from the source day's point of view ("to the rest of the week"). */
  label: string;
  /** The weekdays it writes, excluding the source day itself. */
  weekdays: (source: number) => number[];
}

const MON_TO_FRI = [0, 1, 2, 3, 4];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * The copy targets, in menu order.
 *
 * Groups rather than a multi-select: a checkbox list inside a menu inside a dialog is three nested
 * choice surfaces for what is, in practice, always one of these three answers plus the occasional
 * single day. Every target is repeatable, so "Tuesday and Thursday" is two invocations, each
 * announced — which is also two things to undo, rather than one opaque batch.
 */
export const COPY_TARGET_GROUPS: readonly CopyTarget[] = [
  {
    id: 'weekdays',
    label: 'the other weekdays (Mon–Fri)',
    weekdays: (source) => MON_TO_FRI.filter((weekday) => weekday !== source),
  },
  {
    id: 'every-day',
    label: 'every other day',
    weekdays: (source) => EVERY_DAY.filter((weekday) => weekday !== source),
  },
  {
    id: 'weekend',
    label: 'the weekend (Sat–Sun)',
    weekdays: (source) => [5, 6].filter((weekday) => weekday !== source),
  },
];

/**
 * Copy one day's hours onto others, **replacing** whatever they held.
 *
 * Replace, not merge: merging two days' periods can produce an overlap the day never had, which
 * the editor would then reject — so the planner's "make Tuesday like Monday" would fail on a
 * calendar where both days were individually valid. The caller announces which days were
 * overwritten, since that is the part a planner cannot see once it has happened.
 */
export function copyDay(week: Week, source: number, targets: readonly number[]): Week {
  const rows = week[source] ?? [];
  const targetSet = new Set(targets.filter((weekday) => weekday !== source));
  return week.map((day, weekday) =>
    targetSet.has(weekday) ? rows.map((row) => ({ ...row })) : day,
  );
}
