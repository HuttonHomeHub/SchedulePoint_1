/**
 * One resource's placed-demand profile for the levelling pass, kept **incrementally sorted**.
 *
 * `earliestFeasibleStart` used to rebuild its `±demand` event list from the interval list and sort it
 * on EVERY call — `O(m log m)` with a comparator and an allocation per event. That is invisible on an
 * ordinary plan and the dominant cost when one resource carries most of the plan: Pass B calls it once
 * per participant and Pass C re-places every moved follower, so a hot resource at 2,000 activities paid
 * the sort ~3,600 times over a list that grows to ~1,900 intervals (m0-measurement.md, "M2.5").
 *
 * The events are therefore held in order, as `occupy` and `release` change the profile, by binary
 * search and `splice` (a native memmove, no comparator per element), and {@link blackoutsOf} walks them
 * once with no sort and no event allocation. The per-call cost drops from a sort to a linear scan.
 *
 * **Why this is exactly the old answer and not an approximation.** The blackouts are thresholds on a
 * running float sum, and a different summation order can flip `load > need` on a fractional demand
 * (`unitsPerHour` is a `Decimal(18,4)`), so the walk reproduces the old sort's order precisely: events
 * ascending by time then by delta, with an interval that began before the search start clamped to it.
 * Two events with equal time and delta are the same number, so which of them is which never matters.
 * `level-profile.spec.ts` holds this against a frozen copy of the old function over random operation
 * sequences with fractional demands, comparing the blackouts for exact equality.
 */

/** A placed `[start, finish)` (absolute minutes) and the demand it carries. Compared by identity. */
export interface PlacedInterval {
  start: number;
  finish: number;
  demand: number;
}

/** A half-open `[start, finish)` region in absolute minutes where a resource is over its `need`. */
export interface Blackout {
  start: number;
  finish: number;
}

/** The blackouts found, and how far the profile has been read: none starts before `knownUntil` unlisted. */
export interface BlackoutScan {
  blackouts: Blackout[];
  /** `Infinity` when the walk reached the last event; otherwise the instant the walk stopped at. */
  knownUntil: number;
}

interface ProfileEvent {
  t: number;
  delta: number;
}

export class ResourceProfile {
  /** The placed intervals, in placement order — what a straddler scan and an identity lift read. */
  readonly intervals: PlacedInterval[] = [];
  /** Two events per interval, ascending by `t` then `delta` (a finish sorts before a start at a tie). */
  readonly events: ProfileEvent[] = [];

  add(interval: PlacedInterval): void {
    this.intervals.push(interval);
    this.insertEvent(interval.start, interval.demand);
    this.insertEvent(interval.finish, -interval.demand);
  }

  /** Lift `interval` out by identity (never by equal-looking values), keeping the events in step. */
  remove(interval: PlacedInterval): void {
    this.intervals.splice(this.intervals.indexOf(interval), 1);
    this.removeEvent(interval.start, interval.demand);
    this.removeEvent(interval.finish, -interval.demand);
  }

  private lowerBound(t: number, delta: number): number {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const e = this.events[mid]!;
      if (e.t < t || (e.t === t && e.delta < delta)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private insertEvent(t: number, delta: number): void {
    this.events.splice(this.lowerBound(t, delta), 0, { t, delta });
  }

  private removeEvent(t: number, delta: number): void {
    this.events.splice(this.lowerBound(t, delta), 1);
  }

  /**
   * The maximal spans at or after `esAbs` over which the placed demand exceeds `need`, sorted and
   * disjoint. A finish at an equal instant is applied before a start, so touching intervals do not
   * overlap. An interval that finishes at or before `esAbs` cannot affect a placement there and is
   * ignored; one that began earlier is counted from `esAbs`.
   *
   * With a finite `horizon` the walk stops at the first instant at or after it where no blackout is
   * open, and `knownUntil` says where: every blackout starting before `knownUntil` is listed and
   * closed, and nothing is claimed past it. A search that asks only whether a run of known length fits
   * then reads the few events around the front of the profile instead of all of them, which is the
   * common answer on a contended resource (the run fits in or just after the first gap).
   */
  blackoutsOf(need: number, esAbs: number, horizon = Number.POSITIVE_INFINITY): BlackoutScan {
    const events = this.events;
    // Everything in force AT `esAbs`: the straddlers (clamped to it) and the real starts landing on it.
    // Finishes landing on it belong to intervals the old function skipped outright, so they are skipped.
    const head: number[] = [];
    for (const p of this.intervals) {
      if (p.start < esAbs && p.finish > esAbs) head.push(p.demand);
    }
    let i = this.lowerBound(esAbs, Number.NEGATIVE_INFINITY);
    while (i < events.length && events[i]!.t === esAbs) {
      const delta = events[i]!.delta;
      if (delta > 0) head.push(delta);
      i += 1;
    }

    const out: Blackout[] = [];
    let load = 0;
    let openedAt: number | null = null;
    const settle = (t: number): void => {
      const over = load > need;
      if (over && openedAt === null) openedAt = t;
      else if (!over && openedAt !== null) {
        out.push({ start: openedAt, finish: t });
        openedAt = null;
      }
    };

    if (head.length > 0) {
      head.sort((a, b) => a - b);
      for (const delta of head) load += delta;
      settle(esAbs);
    }
    while (i < events.length) {
      const t = events[i]!.t;
      if (t >= horizon && openedAt === null) return { blackouts: out, knownUntil: t };
      while (i < events.length && events[i]!.t === t) {
        load += events[i]!.delta;
        i += 1;
      }
      settle(t);
    }
    // Every placed interval finishes, so `load` returns to 0 and no blackout can still be open here.
    return { blackouts: out, knownUntil: Number.POSITIVE_INFINITY };
  }
}
