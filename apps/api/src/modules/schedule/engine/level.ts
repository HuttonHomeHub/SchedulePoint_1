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
 *    an **event-driven interval sweep** over already-placed assignment intervals (never a per-minute
 *    scan), bounded by an iteration cap (a resource that can never free terminates and flags, §6/§F).
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

  // Assignments grouped by activity. Only finite-capacity resources with positive demand participate in
  // levelling (occupancy + feasibility) — an uncapped resource never constrains (§8, the parity path).
  const finiteAssignmentsOf = (id: string): EngineAssignment[] =>
    assignments.filter((asg) => {
      if (asg.activityId !== id) return false;
      const res = resourceById.get(asg.resourceId);
      return res != null && res.capacity != null && asg.unitsPerHour > 0;
    });

  const calendarOf = (a: EngineActivity): WorkingTimeCalendar => a.calendar ?? planCalendar;

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
    const startInst = instOfOffset(r.earlyStartOffset);
    const finishInst = instOfOffset(r.earlyFinishOffset);
    for (const asg of finiteAsgs) occupy(asg.resourceId, startInst, finishInst, asg.unitsPerHour);
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

    // Iteration cap (§F, N11/N16 posture): bounded by the number of already-placed intervals across
    // the resources this activity touches, plus a guard. A resource that can never free terminates here
    // and is flagged, never hangs.
    const placedCount = finiteAsgs.reduce(
      (sum, asg) => sum + (profile.get(asg.resourceId)?.length ?? 0),
      0,
    );
    const maxIter = placedCount + finiteAsgs.length + 8;

    let candidate = rollForwardToWorking(calA, esInst);
    let finishInst = d === 0 ? candidate : advanceWorking(calA, candidate, d);
    let windowExceeded = false;
    let iterations = 0;
    for (;;) {
      let jumpTo: number | null = null;
      for (const asg of finiteAsgs) {
        const res = resourceById.get(asg.resourceId)!;
        const need = res.capacity! - asg.unitsPerHour; // max existing concurrent demand allowed
        const jt = earliestConflictJump(
          profile.get(asg.resourceId) ?? [],
          candidate,
          finishInst,
          need,
        );
        if (jt !== null) jumpTo = jumpTo === null ? jt : Math.min(jumpTo, jt);
      }
      if (jumpTo === null) break; // capacity-feasible for the whole run
      candidate = rollForwardToWorking(calA, jumpTo);
      finishInst = d === 0 ? candidate : advanceWorking(calA, candidate, d);
      if ((iterations += 1) > maxIter) {
        windowExceeded = true;
        break;
      }
    }

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
    }
    for (const asg of finiteAsgs) {
      occupy(asg.resourceId, leveledStartInst, leveledFinishInst, asg.unitsPerHour);
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

/**
 * Event-driven interval sweep (ADR-0041 §2): is there any instant in `[winStart, winFinish)` where the
 * placed demand on a resource exceeds `need` (= capacity − this activity's demand)? If so, return the
 * earliest placed-interval finish overlapping the window — the earliest point the profile can drop, and
 * the next candidate start to retry (strictly greater than `winStart`, so the caller always progresses).
 * Returns `null` when the window is capacity-feasible. Never a per-minute scan.
 */
function earliestConflictJump(
  placed: ReadonlyArray<{ start: number; finish: number; demand: number }>,
  winStart: number,
  winFinish: number,
  need: number,
): number | null {
  const relevant = placed.filter((p) => p.start < winFinish && p.finish > winStart);
  if (relevant.length === 0) return null;
  // Sweep the clamped +demand (at start) / −demand (at finish) events. At an equal instant a finish is
  // processed before a start (touching intervals do not overlap), so sort by time then delta ascending.
  const events: Array<{ t: number; delta: number }> = [];
  for (const p of relevant) {
    events.push({ t: Math.max(p.start, winStart), delta: p.demand });
    events.push({ t: Math.min(p.finish, winFinish), delta: -p.demand });
  }
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let concurrent = 0;
  let over = false;
  for (const e of events) {
    concurrent += e.delta;
    if (concurrent > need) over = true;
  }
  if (!over) return null;
  let jump = Number.POSITIVE_INFINITY;
  for (const p of relevant) if (p.finish > winStart && p.finish < jump) jump = p.finish;
  return jump === Number.POSITIVE_INFINITY ? null : jump;
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
