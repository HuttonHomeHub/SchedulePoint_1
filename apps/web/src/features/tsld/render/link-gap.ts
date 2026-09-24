import type { ActivityType, DependencyType } from '@repo/types';

import { axisDayOf } from './geometry';
import { ELAPSED_DAY_WALK, lagAnchorDay, makeWorkingDayWalk, type DayWalk } from './working-time';

/**
 * **The gap a link waits** (NetPoint grammar M3-T2, spec §4.2 G6).
 *
 * The one number behind both the gap label on a link and the slack a screen reader speaks for it,
 * so the two cannot disagree (WCAG 1.1.1). It replaces `edgeGapDays`' calendar days in both.
 *
 * **Working days on the plan calendar** (CQ-5): every other `d` on the canvas (duration, float) is
 * working days, and a gap in calendar days beside them would say "4d" for a wait of two working days
 * over a weekend. Where no calendar is loaded it falls back to calendar days, and the label says so
 * (`12 cal d`), so a planner never reads one unit as the other.
 *
 * **The interval is derived from the lag anchor, never restated.** The waiting run starts where
 * `lagAnchorDay` puts the relationship's anchor (the same mapping that draws a lag and drags one) and
 * ends at the successor's constrained edge: its start for FS and SS, its finish's right edge for FF
 * and SF. In calendar days that reproduces `edgeGapDays` exactly for every type, which
 * `link-gap.test.ts` asserts, so the change in unit is the only change.
 */

export interface LinkGap {
  /** Days of waiting. Zero or less means none: a driving tie, or a lead. */
  days: number;
  unit: 'working' | 'calendar';
}

export interface LinkGapArgs {
  type: DependencyType;
  predStartDay: number;
  predFinishDay: number;
  succStartDay: number;
  succFinishDay: number;
  lagDays: number;
}

/** One working-day walk and one count memo per calendar predicate, shared by every caller. */
const walks = new WeakMap<(d: number) => boolean, DayWalk>();
const counts = new WeakMap<(d: number) => boolean, Map<string, number>>();

function walkFor(isWorkingDay: (d: number) => boolean): DayWalk {
  let walk = walks.get(isWorkingDay);
  if (!walk) {
    walk = makeWorkingDayWalk(isWorkingDay);
    walks.set(isWorkingDay, walk);
  }
  return walk;
}

/**
 * Working days in `[from, to)`, memoised per calendar predicate and interval, so a frame that
 * repaints an unchanged link re-walks nothing (FC-G7). Keyed by the predicate's identity: a new
 * calendar is a new predicate, so a stale count can never be read against it.
 */
export function workingDaysBetween(
  isWorkingDay: (d: number) => boolean,
  from: number,
  to: number,
): number {
  let memo = counts.get(isWorkingDay);
  if (!memo) {
    memo = new Map();
    counts.set(isWorkingDay, memo);
  }
  const key = `${from}:${to}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  let n = 0;
  for (let d = from; d < to; d += 1) if (isWorkingDay(d)) n += 1;
  memo.set(key, n);
  return n;
}

/**
 * The gap and the day interval it measures, `[fromDay, toDay)` on the canvas's day axis. The painter
 * places the gap label on this interval, so where the label sits and what it says are one
 * computation (NetPoint grammar M3-T3).
 */
export function linkGapSpan(
  args: LinkGapArgs,
  isWorkingDay: ((d: number) => boolean) | null,
): LinkGap & { fromDay: number; toDay: number } {
  const { type, predStartDay, predFinishDay, succStartDay, succFinishDay, lagDays } = args;
  const walk = isWorkingDay ? walkFor(isWorkingDay) : ELAPSED_DAY_WALK;
  const fromDay = lagAnchorDay(predStartDay, predFinishDay, type, lagDays, walk);
  const toDay = type === 'FS' || type === 'SS' ? succStartDay : succFinishDay + 1;
  if (!isWorkingDay) return { days: toDay - fromDay, unit: 'calendar', fromDay, toDay };
  // No waiting (a driving tie) or a lead: the calendar difference, which is zero or negative and
  // draws no label either way.
  if (toDay <= fromDay) return { days: toDay - fromDay, unit: 'working', fromDay, toDay };
  return {
    days: workingDaysBetween(isWorkingDay, fromDay, toDay),
    unit: 'working',
    fromDay,
    toDay,
  };
}

/** The gap a relationship leaves, in working days when `isWorkingDay` is known. */
export function linkGap(args: LinkGapArgs, isWorkingDay: ((d: number) => boolean) | null): LinkGap {
  const { days, unit } = linkGapSpan(args, isWorkingDay);
  return { days, unit };
}

/** A gap as the canvas prints it: `3d` in working days, `12 cal d` when it is calendar days. */
export function formatLinkGap(gap: LinkGap): string {
  return gap.unit === 'working' ? `${gap.days}d` : `${gap.days} cal d`;
}

/**
 * Every relationship's {@link linkGap}, keyed by dependency id: the datum behind both the gap label
 * the canvas draws on a waiting link and its spoken equivalent in `summarizeLogic`.
 *
 * Built once from the plan's dependencies so the two surfaces cannot disagree: the number a sighted
 * planner reads off a link and the number a screen-reader user hears for it are one computation, in
 * one unit (WCAG 1.1.1). It must be fed the DRAWN dates (`TsldPanel.drawn-slack.test.tsx`). Ties
 * whose endpoints are not yet scheduled are absent from the map, because there is no gap to state.
 *
 * It lived in `geometry.ts` as calendar days until NetPoint grammar M3-T2 moved it here, beside the
 * working-day walk that `geometry.ts`, a leaf, cannot import.
 */
export function slackByDependencyId(args: {
  dataDate: string;
  activities: readonly {
    id: string;
    type?: ActivityType;
    earlyStart: string | null;
    earlyFinish: string | null;
  }[];
  dependencies: readonly {
    id: string;
    type: DependencyType;
    lagDays: number;
    predecessor: { id: string };
    successor: { id: string };
  }[];
  /** The plan calendar's working-day predicate; absent ⇒ calendar days, labelled as such. */
  isWorkingDay?: ((d: number) => boolean) | null;
}): Map<string, LinkGap> {
  const { dataDate, activities, dependencies, isWorkingDay = null } = args;
  const byId = new Map(activities.map((a) => [a.id, a]));
  const slack = new Map<string, LinkGap>();
  for (const edge of dependencies) {
    const pred = byId.get(edge.predecessor.id);
    const succ = byId.get(edge.successor.id);
    if (!pred?.earlyStart || !pred.earlyFinish || !succ?.earlyStart || !succ.earlyFinish) continue;
    slack.set(
      edge.id,
      linkGap(
        {
          type: edge.type,
          predStartDay: axisDayOf(pred.type, dataDate, pred.earlyStart),
          predFinishDay: axisDayOf(pred.type, dataDate, pred.earlyFinish),
          succStartDay: axisDayOf(succ.type, dataDate, succ.earlyStart),
          succFinishDay: axisDayOf(succ.type, dataDate, succ.earlyFinish),
          lagDays: edge.lagDays,
        },
        isWorkingDay,
      ),
    );
  }
  return slack;
}
