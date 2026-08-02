import { isLoe, isMandatory, isMilestone, isSummary } from './constraints';
import { advanceWorking, offsetFromDataDate, rollForwardToWorking } from './instants';
import type {
  EngineActivity,
  EngineAssignment,
  EngineResource,
  EngineResult,
  EngineSummary,
  LevelingOptions,
} from './types';
import {
  absMinutesToInstant,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * The resource-**levelling** pass (ADR-0041) — a **pure** second pass over an unchanged CPM network.
 *
 * `computeSchedule` runs first and unchanged, producing early/late/float/critical as a function of the
 * logic only. `levelSchedule` consumes that {@link EngineOutput} plus the resource-demand model and
 * returns the SAME per-activity results with an **additive leveled overlay** merged on: `leveledStart`
 * / `leveledFinish` + `levelingDelay` + the produce-and-flag flags. The pure `early*`/`late*`/
 * `totalFloat`/`isCritical` are **never recomputed** (network float stays authoritative, ADR-0041 §3 /
 * Q2), so the overlay never changes the critical path and the parity gate holds trivially.
 *
 * ## Algorithm — deterministic serial priority-list heuristic (ADR-0041 §1–§6)
 *
 * 1. **Composite order.** Levellable activities are placed one at a time in the single total order
 *    `levelingPriority` asc (NULL sorts LAST as +∞) → `totalFloat` asc → `earlyStartOffset` asc →
 *    `id` asc. This makes the result independent of input order (the determinism invariant).
 * 2. **Exclusions (never moved, §5).** Mandatory-constrained, Level-of-Effort, WBS-summary, milestone,
 *    and progressed (`actualStart` set) activities keep their network position and **occupy** the
 *    resource profile there so others level around them. A residual over-allocation a pinned activity
 *    causes is reported on the mover that can't fit (or left), never resolved by moving the pinned one.
 * 3. **Placement.** Each levellable activity is placed at the earliest working start ≥ its early start
 *    at which every finite-capacity resource it assigns has spare capacity for the whole run — found by
 *    a **single blackout-gap sweep** ({@link earliestFeasibleStart}) that merges the already-placed
 *    intervals into feasible / blackout regions and returns the first region the run fits (O(k log k)
 *    over k placed intervals, never a per-minute scan and never a retry loop — termination is inherent,
 *    so it cannot hang; the final open region always fits, §6/§F).
 * 4. **`levelingDelay`** = working time between early start and leveled start on the activity's own
 *    calendar (0 when not delayed).
 * 5. **Float-first then extend (§4).** A within-total-float delay preserves the project finish; when
 *    float is exhausted the activity extends. Under `levelWithinFloatOnly` it may not extend — see the
 *    residual contract below.
 * 6. **Window conflict (§6, Q1 = extend-and-flag).** When the earliest feasible slot falls past a
 *    resource's availability window (a window-only resource calendar that runs out), the activity is
 *    still placed there and `levelingWindowExceeded` is set — never a hang.
 * 7. **Self-over-allocation (§2).** If a single activity's own demand on a resource exceeds that
 *    resource's capacity, a delay cannot fix it: `selfOverAllocated` is set, the activity is placed at
 *    its early start (not split), and the pass continues.
 * 8. **Uncapped resources** (`capacity === null`) never constrain (skipped). A plan whose resources are
 *    all uncapped — or which has no assignments — levels to **byte-identical** network dates with every
 *    `leveledStart` left null and `levelingDelay` 0 (the parity path).
 *
 * ### `levelWithinFloatOnly` residual contract (documented, ADR-0041 §4)
 * When the option is on and the earliest capacity-feasible slot would push the finish past
 * `lateFinishOffset`, the activity is **not** extended: it is left at its **within-float cap** (its late
 * start — the maximum delay that keeps `leveledFinish ≤ lateFinish`). The residual over-allocation is
 * left **unresolved** — the leveled intervals still overlap on the resource — and is **not** signalled
 * by a boolean flag (there is no residual column; `levelingWindowExceeded` and `selfOverAllocated` both
 * stay false). The observable contract a caller asserts is: `leveledFinishOffset ≤ lateFinishOffset`
 * (stayed within float) while the over-allocation persists (it did not extend to resolve it).
 *
 * ### Mixed-calendar note
 * The network result exposes only **plan-frame** offsets, so this pass reconstructs each activity's
 * early-start/finish instants on the plan calendar. On the all-inherit / golden path (activities on the
 * plan calendar) this is exact; measurement of delay is on the activity's own calendar and resource
 * window coverage on the resource's own calendar. A per-activity-calendar-exact leveling anchor is a
 * documented later refinement — the golden/parity path is unaffected.
 */
export function levelSchedule(
  activities: readonly EngineActivity[],
  output: { results: readonly EngineResult[]; summary: EngineSummary },
  assignments: readonly EngineAssignment[],
  resources: readonly EngineResource[],
  options: LevelingOptions,
): { results: EngineResult[]; summary: Partial<EngineSummary> } {
  const { dataDate, planCalendar, levelWithinFloatOnly } = options;
  const dataDateAbs = instantToAbsMinutes(dataDate);

  const resultById = new Map(output.results.map((r) => [r.activityId, r]));
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const resourceById = new Map(resources.map((r) => [r.id, r]));

  // Assignments grouped by activity in a SINGLE pass. Only finite-capacity resources with positive
  // demand participate in levelling (occupancy + feasibility) — an uncapped resource never constrains
  // (§8, the parity path). Pre-grouping makes `finiteAssignmentsOf` an O(1) lookup, so the pass never
  // re-scans every assignment per activity (which was quadratic even with zero contention).
  const assignmentsByActivity = new Map<string, EngineAssignment[]>();
  for (const asg of assignments) {
    const res = resourceById.get(asg.resourceId);
    if (res == null || res.capacity == null || asg.unitsPerHour <= 0) continue;
    const list = assignmentsByActivity.get(asg.activityId);
    if (list) list.push(asg);
    else assignmentsByActivity.set(asg.activityId, [asg]);
  }
  const finiteAssignmentsOf = (id: string): EngineAssignment[] =>
    assignmentsByActivity.get(id) ?? [];

  const calendarOf = (a: EngineActivity): WorkingTimeCalendar => a.calendar ?? planCalendar;

  /**
   * Where THIS assignment's demand begins (ADR-0071 §1): `lagMinutes` working minutes into the
   * activity, on the activity's own calendar. Absent or `0` returns the activity's start unchanged —
   * the same instant every caller produced before ADR-0071, which is what makes Gate B structural
   * rather than a default someone has to remember. A lag past the finish yields a start beyond it and
   * {@link occupy} then reserves nothing, which is the spec's degenerate case, not an edge to guard.
   */
  const demandStart = (
    cal: WorkingTimeCalendar,
    startInst: number,
    asg: EngineAssignment,
  ): number => {
    const lag = asg.lagMinutes ?? 0;
    return lag > 0 ? advanceWorking(cal, startInst, lag) : startInst;
  };

  /** Reconstruct an offset (plan-frame working minutes from the data date) as an absolute instant. */
  const instOfOffset = (offset: number): number =>
    advanceWorking(planCalendar, dataDateAbs, offset);

  // A never-moved activity (§5): mandatory-pinned, LOE, WBS-summary, milestone, or progressed (started).
  const isPinned = (a: EngineActivity): boolean =>
    isMandatory(a.constraintType) ||
    isLoe(a.type) ||
    isSummary(a.type) ||
    isMilestone(a.type) ||
    (a.actualStart != null && a.actualStart !== '');

  const selfOverOf = (finiteAsgs: readonly EngineAssignment[]): boolean =>
    finiteAsgs.some((asg) => asg.unitsPerHour > resourceById.get(asg.resourceId)!.capacity!);

  // Per-resource placed intervals `[start, finish)` (abs minutes) with their demand — the profile the
  // interval sweep reads. Order-independent (a set), so the whole pass is deterministic (§1 invariant).
  const profile = new Map<string, Array<{ start: number; finish: number; demand: number }>>();
  const occupy = (resourceId: string, start: number, finish: number, demand: number): void => {
    if (demand <= 0 || finish <= start) return;
    const list = profile.get(resourceId);
    if (list) list.push({ start, finish, demand });
    else profile.set(resourceId, [{ start, finish, demand }]);
  };

  interface Overlay {
    leveledStartOffset: number;
    leveledFinishOffset: number;
    levelingDelay: number;
    leveledStart: string;
    leveledFinish: string;
    levelingWindowExceeded: boolean;
    selfOverAllocated: boolean;
  }
  const overlayById = new Map<string, Overlay>();

  /** Pin an activity at its network position: overlay = network dates, and occupy its finite demand. */
  const pinAtNetwork = (
    id: string,
    finiteAsgs: readonly EngineAssignment[],
    selfOver: boolean,
  ): void => {
    const r = resultById.get(id)!;
    const a = activityById.get(id);
    const cal = a ? calendarOf(a) : planCalendar;
    const startInst = instOfOffset(r.earlyStartOffset);
    const finishInst = instOfOffset(r.earlyFinishOffset);
    for (const asg of finiteAsgs) {
      occupy(asg.resourceId, demandStart(cal, startInst, asg), finishInst, asg.unitsPerHour);
    }
    overlayById.set(id, {
      leveledStartOffset: r.earlyStartOffset,
      leveledFinishOffset: r.earlyFinishOffset,
      levelingDelay: 0,
      leveledStart: r.earlyStart,
      leveledFinish: r.earlyFinish,
      levelingWindowExceeded: false,
      selfOverAllocated: selfOver,
    });
  };

  // Pass A — occupy the profile with every PINNED participant at its network position (so levellable
  // activities level around them), and record their overlay. Order-independent.
  const levellable: EngineActivity[] = [];
  for (const a of activities) {
    const finiteAsgs = finiteAssignmentsOf(a.id);
    if (finiteAsgs.length === 0) continue; // not a participant → no overlay, no occupancy (parity)
    if (isPinned(a)) {
      pinAtNetwork(a.id, finiteAsgs, selfOverOf(finiteAsgs));
    } else if (selfOverOf(finiteAsgs)) {
      // §7: a single activity whose own demand exceeds a capacity can't be fixed by delay — pin it at
      // its early start (not split) and flag; it still occupies so others see the demand.
      pinAtNetwork(a.id, finiteAsgs, true);
    } else {
      levellable.push(a);
    }
  }

  // Pass B — place the levellable participants one at a time in the composite priority order (§1).
  levellable.sort((a, b) => {
    const pa = a.levelingPriority ?? Number.POSITIVE_INFINITY;
    const pb = b.levelingPriority ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    const ra = resultById.get(a.id)!;
    const rb = resultById.get(b.id)!;
    if (ra.totalFloat !== rb.totalFloat) return ra.totalFloat - rb.totalFloat;
    if (ra.earlyStartOffset !== rb.earlyStartOffset)
      return ra.earlyStartOffset - rb.earlyStartOffset;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  for (const a of levellable) {
    const r = resultById.get(a.id)!;
    const calA = calendarOf(a);
    const d = a.durationMinutes;
    const finiteAsgs = finiteAssignmentsOf(a.id);
    const esInst = instOfOffset(r.earlyStartOffset);

    // Earliest capacity-feasible start via a single blackout-gap sweep over the already-placed
    // intervals on the resources this activity touches (§2). `need` is the spare headroom on each
    // resource once this activity's own demand is reserved (capacity − demand; ≥ 0 here, since a
    // self-over-allocated activity was pinned in Pass A). Non-iterative — it cannot hang.
    const perResource = finiteAsgs.map((asg) => ({
      intervals: profile.get(asg.resourceId) ?? [],
      need: resourceById.get(asg.resourceId)!.capacity! - asg.unitsPerHour,
      lagMinutes: asg.lagMinutes ?? 0,
    }));
    const { start: candidate, finish: finishInst } = earliestFeasibleStart(
      calA,
      esInst,
      d,
      perResource,
    );
    let windowExceeded = false;

    // §6 window conflict: a finite resource whose own (window-only) calendar supplies NO working time
    // across the activity's leveled run means the serialisation pushed it past that resource's window —
    // still placed (extended), flagged (never a hang).
    for (const asg of finiteAsgs) {
      const res = resourceById.get(asg.resourceId)!;
      if (!res.calendar || finishInst <= candidate) continue;
      let coverage = 0;
      try {
        coverage = res.calendar.workingTimeBetween(
          absMinutesToInstant(candidate),
          absMinutesToInstant(finishInst),
        );
      } catch {
        coverage = 0; // the resource's calendar ran out of horizon → past its window
      }
      if (coverage === 0) windowExceeded = true;
    }

    let leveledStartInst = candidate;
    let leveledFinishInst = finishInst;
    // §4 within-float cap: if the feasible slot exceeds total float and the plan forbids extension,
    // leave the activity at its within-float latest (late start) with the residual unresolved (see the
    // documented contract in the header). Uses the network late finish (authoritative, Q2).
    if (
      levelWithinFloatOnly &&
      offsetFromDataDate(planCalendar, dataDateAbs, leveledFinishInst) > r.lateFinishOffset
    ) {
      leveledFinishInst = instOfOffset(r.lateFinishOffset);
      leveledStartInst = d === 0 ? leveledFinishInst : advanceWorking(calA, leveledFinishInst, -d);
      // Negative-float guard: an over-constrained activity (late finish < early finish) has an
      // unsatisfiable within-float cap, so the cap arithmetic can walk the start BEFORE the early
      // start. Never place an activity before its early start — clamp to the early start (the
      // earliest it can go) and let its finish follow, rather than underflow behind it.
      if (leveledStartInst < esInst) {
        leveledStartInst = esInst;
        leveledFinishInst = d === 0 ? esInst : advanceWorking(calA, esInst, d);
      }
    }
    for (const asg of finiteAsgs) {
      occupy(
        asg.resourceId,
        demandStart(calA, leveledStartInst, asg),
        leveledFinishInst,
        asg.unitsPerHour,
      );
    }
    overlayById.set(a.id, {
      leveledStartOffset: offsetFromDataDate(planCalendar, dataDateAbs, leveledStartInst),
      leveledFinishOffset: offsetFromDataDate(planCalendar, dataDateAbs, leveledFinishInst),
      levelingDelay: Math.max(
        0,
        calA.workingTimeBetween(absMinutesToInstant(esInst), absMinutesToInstant(leveledStartInst)),
      ),
      leveledStart: leveledDate(calA, dataDate, dataDateAbs, leveledStartInst, d, false),
      leveledFinish: leveledDate(calA, dataDate, dataDateAbs, leveledFinishInst, d, true),
      levelingWindowExceeded: windowExceeded,
      selfOverAllocated: false,
    });
  }

  // Merge the overlay onto the network results (untouched where an activity did not participate).
  const results = output.results.map((r) => {
    const ov = overlayById.get(r.activityId);
    return ov ? { ...r, ...ov } : { ...r };
  });

  // Plan roll-up. `leveledActivityCount` = activities the pass actually delayed (delay > 0).
  let leveledActivityCount = 0;
  let levelingWindowExceededCount = 0;
  let selfOverAllocatedCount = 0;
  let leveledProjectFinishOffset: number | null = null;
  let leveledProjectFinish: string | null = null;
  for (const r of results) {
    const a = activityById.get(r.activityId);
    const ov = overlayById.get(r.activityId);
    if (ov) {
      if (ov.levelingDelay > 0) leveledActivityCount += 1;
      if (ov.levelingWindowExceeded) levelingWindowExceededCount += 1;
      if (ov.selfOverAllocated) selfOverAllocatedCount += 1;
    }
    // The leveled project finish is the latest finish under levelling — a summary/LOE never defines it
    // (mirrors the network project-finish exclusions).
    if (a && (isLoe(a.type) || isSummary(a.type))) continue;
    const finishOffset = ov ? ov.leveledFinishOffset : r.earlyFinishOffset;
    const finishDate = ov ? ov.leveledFinish : r.earlyFinish;
    if (leveledProjectFinishOffset === null || finishOffset > leveledProjectFinishOffset) {
      leveledProjectFinishOffset = finishOffset;
      leveledProjectFinish = finishDate;
    }
  }

  return {
    results,
    summary: {
      leveledActivityCount,
      levelingWindowExceededCount,
      selfOverAllocatedCount,
      leveledProjectFinishOffset,
      leveledProjectFinish,
    },
  };
}

/** One touched resource's already-placed intervals plus this activity's spare headroom on it. */
interface ResourceContention {
  intervals: ReadonlyArray<{ start: number; finish: number; demand: number }>;
  /** capacity − this activity's demand: the max concurrent PLACED demand the resource may already carry. */
  need: number;
  /**
   * Working minutes into the run before THIS resource joins (ADR-0071 §1). `0` = joins with the
   * activity, which is every assignment that predates the column and the whole of Gate B.
   */
  lagMinutes: number;
}

/** A half-open `[start, finish)` region in absolute minutes where a resource is over its `need`. */
interface Blackout {
  start: number;
  finish: number;
}

/**
 * One resource's **blackout regions** — the maximal spans over which its already-placed demand exceeds
 * `need`, so this activity cannot join it there. A single sweep of `±demand` events (a finish before a
 * start at an equal instant, so touching intervals do not overlap), returned sorted and disjoint.
 */
function blackoutsOf(rc: ResourceContention, esAbs: number): Blackout[] {
  const events: Array<{ t: number; delta: number }> = [];
  for (const p of rc.intervals) {
    if (p.finish <= esAbs) continue; // cannot affect a placement at or after the early start
    events.push({ t: Math.max(p.start, esAbs), delta: p.demand });
    events.push({ t: p.finish, delta: -p.demand });
  }
  if (events.length === 0) return [];
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);

  const out: Blackout[] = [];
  let load = 0;
  let openedAt: number | null = null;
  let i = 0;
  while (i < events.length) {
    const t = events[i]!.t;
    while (i < events.length && events[i]!.t === t) {
      load += events[i]!.delta;
      i += 1;
    }
    const over = load > rc.need;
    if (over && openedAt === null) openedAt = t;
    else if (!over && openedAt !== null) {
      out.push({ start: openedAt, finish: t });
      openedAt = null;
    }
  }
  // Every placed interval finishes, so `load` returns to 0 and no blackout can still be open here.
  return out;
}

/**
 * Whether `[from, to)` clears every blackout in `sorted`. Binary-searches the first blackout that could
 * still be running at `from`, so the check is `O(log b)` rather than a scan — the blackouts are disjoint
 * and ascending, so if that one clears, every later one starts even later.
 */
function windowIsClear(sorted: readonly Blackout[], from: number, to: number): boolean {
  if (to <= from) return true; // a zero-length demand window (lag ≥ span) reserves nothing
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.finish <= from) lo = mid + 1;
    else hi = mid;
  }
  const first = sorted[lo];
  return first === undefined || first.start >= to;
}

/**
 * The earliest working start ≥ `esAbs` at which **every touched resource has spare capacity across its
 * own demand window** (ADR-0041 §2, generalised by ADR-0071 §1). Non-iterative over a finite candidate
 * list — it cannot hang.
 *
 * Before ADR-0071 every resource on an activity was held for the whole run, so one merged feasible/
 * blackout timeline answered for all of them. A per-assignment lag breaks that: resource `j` is demanded
 * only over `[start ⊕ lag_j, start ⊕ d)`, so two resources on one activity now ask about **different**
 * windows and a span that blocks one may be free for the other.
 *
 * The search therefore works on **candidate starts** rather than merged regions:
 *
 * 1. Each resource's own blackouts are computed independently ({@link blackoutsOf}).
 * 2. The candidates are `start0` plus, for every blackout end `b` on resource `j`, the start `b ⊖ lag_j`
 *    that would place `j`'s joining instant exactly there. That set is **complete**: feasibility can only
 *    change where some resource's demand window crosses one of its own blackout boundaries, and moving a
 *    start later never helps via the finish (that only pushes the window further right).
 * 3. Candidates are tested ascending and the first feasible one wins.
 *
 * **Termination is inherent.** The largest candidate lies at or past every blackout end on every
 * resource, so each window `[cand ⊕ lag_j, cand ⊕ d)` begins after the last blackout finishes and clears
 * them all — there is always an answer, and the list is finite.
 *
 * With every `lag_j` at `0` this reduces to the previous behaviour exactly: the candidates become the
 * blackout ends themselves, the per-resource checks agree with the merged over-count, and the run is
 * placed in the first gap it fits (ADR-0071 Gate B, pinned by `level.parity.spec.ts`).
 *
 * Cost is `O(k log k)` over the k placed intervals (the sorts), with an `O(log b)` check per candidate
 * per resource — never a per-minute scan.
 */
function earliestFeasibleStart(
  cal: WorkingTimeCalendar,
  esAbs: number,
  d: number,
  perResource: readonly ResourceContention[],
): { start: number; finish: number } {
  const start0 = rollForwardToWorking(cal, esAbs);
  // A milestone (zero duration) occupies no span, so no resource can ever block it.
  if (d === 0) return { start: start0, finish: start0 };

  const blackouts = perResource.map((rc) => blackoutsOf(rc, esAbs));
  const anyBlackout = blackouts.some((b) => b.length > 0);
  // No contention → the earliest working start fits immediately.
  if (!anyBlackout) return { start: start0, finish: advanceWorking(cal, start0, d) };

  // Candidate starts. A blackout end is translated BACK by the resource's own lag, because it is the
  // resource's joining instant — not the activity's start — that has to clear the blackout.
  const candidates = new Set<number>([start0]);
  for (let j = 0; j < blackouts.length; j += 1) {
    const lag = perResource[j]!.lagMinutes;
    for (const b of blackouts[j]!) {
      const cand = lag > 0 ? advanceWorking(cal, b.finish, -lag) : b.finish;
      if (cand > start0) candidates.add(cand);
    }
  }

  const ordered = [...candidates].sort((a, b) => a - b);
  for (const raw of ordered) {
    const cand = rollForwardToWorking(cal, Math.max(raw, start0));
    const finish = advanceWorking(cal, cand, d);
    let feasible = true;
    for (let j = 0; j < blackouts.length && feasible; j += 1) {
      const lag = perResource[j]!.lagMinutes;
      const from = lag > 0 ? advanceWorking(cal, cand, lag) : cand;
      feasible = windowIsClear(blackouts[j]!, from, finish);
    }
    if (feasible) return { start: cand, finish };
  }

  // Unreachable: the largest candidate clears every blackout (see the termination note above). Kept as
  // a total function rather than a throw — a levelling pass that cannot place an activity should still
  // return a schedule, and this is the same answer the final open region gave before ADR-0071.
  const last = ordered[ordered.length - 1] ?? start0;
  const cand = rollForwardToWorking(cal, Math.max(last, start0));
  return { start: cand, finish: advanceWorking(cal, cand, d) };
}

/**
 * The inclusive display date of a leveled start/finish, on the activity's own calendar — the SAME
 * mapping `compute.ts` uses for `early*` (ADR-0023). A start reads its offset day; a finish reads the
 * day of its last working minute (`offset − 1`), or the start day for a zero-duration activity.
 */
function leveledDate(
  cal: WorkingTimeCalendar,
  dataDate: string,
  dataDateAbs: number,
  inst: number,
  durationMinutes: number,
  isFinish: boolean,
): string {
  const own = offsetFromDataDate(cal, dataDateAbs, inst);
  const index = isFinish && durationMinutes > 0 ? own - 1 : own;
  const endBoundary = cal.addWorkingTime(dataDate, index + 1);
  const iso = endBoundary.length > 10 ? `${endBoundary}:00Z` : `${endBoundary}T00:00:00Z`;
  const instant = new Date(iso);
  instant.setUTCMinutes(instant.getUTCMinutes() - 1);
  return instant.toISOString().slice(0, 10);
}
