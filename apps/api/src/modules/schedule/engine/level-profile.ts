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
 *
 * **The linear scan was still quadratic over a plan (`docs/TECH_DEBT.md` #84).** One crew carrying
 * thousands of back-to-back activities is a single long blackout, and every placement walked it from the
 * search start to its far end: n placements × O(n) events. The events are therefore held in blocks that
 * carry their own sum and the lowest and highest load reached inside them, and the walk steps over a
 * block when those say the load cannot cross `need` within it. That reorders float additions — a block
 * sum is added in one go, and the load at the search start is taken from block sums rather than from
 * the head list — so it is taken ONLY while every demand is a whole multiple of 2⁻¹⁶ (and small): such
 * sums are exact in any order, the aggregates are the very floats the event-by-event walk reaches, and
 * the answer cannot differ. A plan with any other demand (0.1 is not one) reads every event, as before.
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

/**
 * A run of consecutive events plus what walking all of it would do to the running load. A block always
 * begins and ends on a time boundary (no instant's events are split across two blocks), so every
 * prefix the aggregates see is a load the walk itself evaluates: `minP`/`maxP` are the lowest and
 * highest load AFTER each instant's events, relative to the load entering the block.
 */
interface Block {
  events: ProfileEvent[];
  sum: number;
  minP: number;
  maxP: number;
  /** {@link ResourceProfile.clearances}, by `need` then by the load entering the block. */
  clearances?: Map<number, Map<number, Clearances>> | undefined;
}

/**
 * What a walk entering a block at some load, against some `need`, would see of it. A "clear stretch" is
 * a run of instants where the load is at or under `need`; "inside" means it both begins and ends in the
 * block, so its length is known without the neighbouring block.
 */
interface Clearances {
  /** The first instant the load is over `need`, or null if it never is (counting only instants in the block). */
  firstOver: number | null;
  /** The longest clear stretch that begins and ends inside the block; −∞ if there is none. */
  innerMax: number;
  /** Where the clear stretch still running at the block's end began, if it began inside the block. */
  tailStart: number | null;
  /** Whether the load is at or under `need` after the block's last instant. */
  exitClear: boolean;
}

/**
 * Events per block before it splits in two. A 16,000-activity crew is ~32,000 events, so ~250 blocks:
 * short enough to step across, small enough that reading into one block is cheap.
 */
const BLOCK_SIZE = 64;

/** Distinct `need` values per block, and distinct entering loads per `need`, whose clearances are kept. */
const CLEARANCES_CAP = 32;

/** Demands that are whole multiples of 2⁻¹⁶ and at most 2²⁰ sum EXACTLY in any order, up to 2¹⁶ of them. */
const DYADIC_SCALE = 65_536;
const MAX_EXACT_DEMAND = 1_048_576;
const MAX_EXACT_INTERVALS = 65_536;

const isExactDemand = (demand: number): boolean =>
  demand <= MAX_EXACT_DEMAND && Number.isInteger(demand * DYADIC_SCALE);

export class ResourceProfile {
  /** The placed intervals, in placement order — what a straddler scan and an identity lift read. */
  readonly intervals: PlacedInterval[] = [];
  /** Two events per interval, ascending by `t` then `delta` (a finish sorts before a start at a tie). */
  private readonly blocks: Block[] = [];
  /** False once any demand that does not sum exactly in every order has been placed. */
  private exactDemands = true;

  constructor(private readonly blockSize = BLOCK_SIZE) {}

  add(interval: PlacedInterval): void {
    if (!isExactDemand(interval.demand)) this.exactDemands = false;
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

  /** The block that owns instant `t`: the last whose first event is at or before it (else the first). */
  private blockFor(t: number): number {
    let lo = 0;
    let hi = this.blocks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.blocks[mid]!.events[0]!.t <= t) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, lo - 1);
  }

  private static lowerBound(events: readonly ProfileEvent[], t: number, delta: number): number {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const e = events[mid]!;
      if (e.t < t || (e.t === t && e.delta < delta)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private static summarise(block: Block): void {
    const events = block.events;
    let load = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < events.length; i += 1) {
      load += events[i]!.delta;
      if (i === events.length - 1 || events[i + 1]!.t !== events[i]!.t) {
        if (load < min) min = load;
        if (load > max) max = load;
      }
    }
    block.sum = load;
    block.minP = min;
    block.maxP = max;
    block.clearances = undefined;
  }

  /**
   * How `block` looks to a walk entering it at `load` against `need`, remembered until the block next
   * changes (a placement touches one or two blocks; the rest keep their answers, which is what makes a
   * walk over thousands of events cost a lookup per block). Keyed by `need` and `load` themselves rather
   * than their difference, because `load + p > need` is the test the walk makes and a subtraction can
   * round it differently.
   */
  private static clearances(block: Block, need: number, load: number): Clearances {
    let byLoad = block.clearances?.get(need);
    const hit = byLoad?.get(load);
    if (hit !== undefined) return hit;

    let firstOver: number | null = null;
    let innerMax = Number.NEGATIVE_INFINITY;
    let clearSince: number | null = null;
    let over = load > need;
    let running = load;
    const events = block.events;
    for (let i = 0; i < events.length; i += 1) {
      running += events[i]!.delta;
      if (i < events.length - 1 && events[i + 1]!.t === events[i]!.t) continue;
      const t = events[i]!.t;
      const nowOver = running > need;
      if (nowOver) {
        if (firstOver === null) firstOver = t;
        if (clearSince !== null) innerMax = Math.max(innerMax, t - clearSince);
        clearSince = null;
      } else if (over) clearSince = t;
      over = nowOver;
    }
    const made: Clearances = { firstOver, innerMax, tailStart: clearSince, exitClear: !over };
    if (block.clearances === undefined) block.clearances = new Map();
    if (byLoad === undefined) {
      // Bound the memory if the pairs do not recur. 8 thrashed on a crew with 16 distinct demands (47%
      // of lookups missed at n=4,000, 2.1 s at 8,000); 32 misses 11% there and never clears.
      if (block.clearances.size >= CLEARANCES_CAP) block.clearances.clear();
      byLoad = new Map();
      block.clearances.set(need, byLoad);
    }
    if (byLoad.size >= CLEARANCES_CAP) byLoad.clear();
    byLoad.set(load, made);
    return made;
  }

  private insertEvent(t: number, delta: number): void {
    if (this.blocks.length === 0) {
      const first: Block = { events: [{ t, delta }], sum: 0, minP: 0, maxP: 0 };
      ResourceProfile.summarise(first);
      this.blocks.push(first);
      return;
    }
    const bi = this.blockFor(t);
    const block = this.blocks[bi]!;
    block.events.splice(ResourceProfile.lowerBound(block.events, t, delta), 0, { t, delta });
    if (block.events.length > 2 * this.blockSize) this.split(bi);
    else ResourceProfile.summarise(block);
  }

  /** Halve an oversized block at the time boundary nearest its middle (none: it stays whole). */
  private split(bi: number): void {
    const block = this.blocks[bi]!;
    const events = block.events;
    const mid = events.length >> 1;
    let cut = -1;
    for (let d = 0; d < mid && cut < 0; d += 1) {
      if (events[mid + d]!.t !== events[mid + d - 1]!.t) cut = mid + d;
      else if (events[mid - d]!.t !== events[mid - d - 1]!.t) cut = mid - d;
    }
    if (cut <= 0) {
      ResourceProfile.summarise(block);
      return;
    }
    const tail: Block = { events: events.splice(cut), sum: 0, minP: 0, maxP: 0 };
    ResourceProfile.summarise(block);
    ResourceProfile.summarise(tail);
    this.blocks.splice(bi + 1, 0, tail);
  }

  private removeEvent(t: number, delta: number): void {
    const bi = this.blockFor(t);
    const block = this.blocks[bi]!;
    block.events.splice(ResourceProfile.lowerBound(block.events, t, delta), 1);
    if (block.events.length === 0) this.blocks.splice(bi, 1);
    else ResourceProfile.summarise(block);
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
   *
   * A stretch where the load stays over `need` — or stays at or under it — has no blackout boundary in
   * it, so when every demand sums exactly (see the file note) the walk steps across a whole block whose
   * aggregates say so, instead of reading its events.
   */
  blackoutsOf(
    need: number,
    esAbs: number,
    horizon = Number.POSITIVE_INFINITY,
    minGap = 0,
  ): BlackoutScan {
    const blocks = this.blocks;
    // `need >= 0` because stepping assumes the load ends at 0, at or under `need`; the profile cannot
    // see a negative one come from `levelSchedule`, but the walk should not depend on that.
    const exact = this.exactDemands && this.intervals.length <= MAX_EXACT_INTERVALS && need >= 0;

    // The cursor starts at the first event strictly after `esAbs`: (`bi`, `ei`), always on a time
    // boundary. `owner` is the block holding the events at or before `esAbs`, if there are any.
    let bi = 0;
    let ei = 0;
    let owner = -1;
    if (blocks.length > 0 && blocks[this.blockFor(esAbs)]!.events[0]!.t <= esAbs) {
      owner = this.blockFor(esAbs);
      const events = blocks[owner]!.events;
      let lo = 0;
      let hi = events.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (events[mid]!.t <= esAbs) lo = mid + 1;
        else hi = mid;
      }
      bi = lo === events.length ? owner + 1 : owner;
      ei = lo === events.length ? 0 : lo;
    }
    // Events of `owner` before the cursor.
    const ownerEnd = owner < 0 ? 0 : bi === owner ? ei : blocks[owner]!.events.length;

    // `load` is everything in force AT `esAbs`: the straddlers (clamped to it) and the real starts
    // landing on it. Finishes landing on it belong to intervals the old function skipped outright.
    let load = 0;
    let hasHead = false;
    if (exact) {
      // Exact in any order, so the load at `esAbs` is simply every event up to and including it.
      for (let b = 0; b < owner; b += 1) load += blocks[b]!.sum;
      if (owner >= 0) {
        const events = blocks[owner]!.events;
        for (let k = 0; k < ownerEnd; k += 1) load += events[k]!.delta;
      }
      hasHead = load > 0;
    } else {
      const head: number[] = [];
      for (const p of this.intervals) {
        if (p.start < esAbs && p.finish > esAbs) head.push(p.demand);
      }
      if (owner >= 0) {
        const events = blocks[owner]!.events;
        for (let k = ownerEnd - 1; k >= 0 && events[k]!.t === esAbs; k -= 1) {
          if (events[k]!.delta > 0) head.push(events[k]!.delta);
        }
      }
      if (head.length > 0) {
        head.sort((a, b) => a - b);
        for (const delta of head) load += delta;
        hasHead = true;
      }
    }

    const out: Blackout[] = [];
    // The merged blackout in progress. `openedAt` is its start (null: none, the resource is clear), and
    // `closedAt` is set while the load is back at or under `need` but the next blackout may yet join it.
    let openedAt: number | null = null;
    let closedAt: number | null = null;
    // Where the last blackout joined into the one in progress ended. A float sum that never returns
    // to exactly `need` leaves the final blackout open for ever, and the original walk never listed that
    // one — so a blackout it joined must still be listed, ending here.
    let lastClosed: number | null = null;
    const settle = (t: number): void => {
      if (load > need) {
        if (openedAt === null) openedAt = t;
        else if (closedAt !== null) {
          if (t - closedAt < minGap) {
            lastClosed = closedAt;
            closedAt = null;
          } else {
            out.push({ start: openedAt, finish: closedAt });
            openedAt = t;
            closedAt = null;
            lastClosed = null;
          }
        }
      } else if (openedAt !== null && closedAt === null) closedAt = t;
    };
    /** At an instant at or past the horizon: whether nothing listed can still change, closing the last. */
    const settledAt = (t: number): boolean => {
      if (openedAt === null) return true;
      if (closedAt !== null && t - closedAt >= minGap) {
        out.push({ start: openedAt, finish: closedAt });
        return true;
      }
      return false;
    };

    /**
     * Cross a whole block without reading its events, when what the walk would do inside it is known
     * and is nothing the caller can tell: no instant at or past the horizon where it would stop, and no
     * gap of `minGap` or more that would close the blackout in progress. Leaves the walk exactly where
     * reading the events would have left it.
     */
    const stepOver = (block: Block): boolean => {
      const last = block.events[block.events.length - 1]!.t;
      if (openedAt === null) {
        if (last < horizon && load + block.maxP <= need) return true;
      } else if (closedAt === null && load + block.minP > need) return true;
      if (minGap <= 0) return false;

      const s = ResourceProfile.clearances(block, need, load);
      let start = openedAt;
      let from = closedAt;
      let emit: Blackout | null = null;
      if (openedAt === null) {
        // Clear on entry: nothing is in progress until the first instant over `need`.
        if (s.firstOver === null || s.firstOver >= horizon) return false;
        start = s.firstOver;
      } else if (closedAt !== null) {
        // In a gap on entry: the first instant over `need` either rejoins the blackout or ends it.
        if (s.firstOver === null) return last - closedAt < minGap || last < horizon;
        if (s.firstOver - closedAt >= minGap) {
          if (s.firstOver >= horizon) return false;
          emit = { start: openedAt, finish: closedAt };
          start = s.firstOver;
        }
      }
      if (!(s.innerMax < minGap)) return false;
      from = null;
      if (s.exitClear) {
        if (!(last - s.tailStart! < minGap || last < horizon)) return false;
        from = s.tailStart;
      }
      if (emit) out.push(emit);
      openedAt = start;
      closedAt = from;
      return true;
    };

    if (hasHead) settle(esAbs);
    while (bi < blocks.length) {
      const block = blocks[bi]!;
      const events = block.events;
      if (ei === 0) {
        if (events[0]!.t >= horizon && settledAt(events[0]!.t)) {
          return { blackouts: out, knownUntil: events[0]!.t };
        }
        if (exact && stepOver(block)) {
          load += block.sum;
          bi += 1;
          continue;
        }
      }
      const t = events[ei]!.t;
      if (ei > 0 && t >= horizon && settledAt(t)) return { blackouts: out, knownUntil: t };
      while (ei < events.length && events[ei]!.t === t) {
        load += events[ei]!.delta;
        ei += 1;
      }
      settle(t);
      if (ei >= events.length) {
        bi += 1;
        ei = 0;
      }
    }
    // Every placed interval finishes, so `load` returns to 0 and the last blackout has closed — unless
    // the floats left a residue over `need`, in which case that one is not listed (as it never was).
    const end = closedAt ?? lastClosed;
    if (openedAt !== null && end !== null) out.push({ start: openedAt, finish: end });
    return { blackouts: out, knownUntil: Number.POSITIVE_INFINITY };
  }
}
