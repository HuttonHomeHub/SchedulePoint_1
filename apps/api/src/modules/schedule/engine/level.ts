import { isLoe, isMandatory, isMilestone, isSummary } from './constraints';
import { forwardLowerBound } from './edge-bounds';
import { buildGraph } from './graph';
import {
  advanceWorking,
  finishMilestoneDisplayIndex,
  offsetFromDataDate,
  rollForwardToWorking,
} from './instants';
import { ResourceProfile, type Blackout, type PlacedInterval } from './level-profile';
import type {
  EngineActivity,
  EngineAssignment,
  EngineEdge,
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
 * logic only, plus the span each bar is DRAWN on (`placed*Offset`, #413) and what each bar passes on to
 * its successors (`passOn*Instant`). `levelSchedule` consumes that {@link EngineOutput} plus the links
 * and the resource-demand model and returns the SAME per-activity results with an **additive leveled
 * overlay** merged on: `leveledStart` / `leveledFinish` + `levelingDelay` + the produce-and-flag flags.
 * The pure `early*`/`late*`/`totalFloat`/`isCritical` are **never recomputed** (network float stays
 * authoritative, ADR-0041 §3 / Q2), so the overlay never changes the critical path and the parity gate
 * holds trivially.
 *
 * ## Pass C — the overlay follows the links (`docs/specs/logic-aware-levelling/` §4.6)
 *
 * Passes A and B place each activity from its own anchor and read no link, so a delayed activity's
 * successors used to stay where they were drawn — before the work they follow. Pass C walks the
 * activities in topological order and, wherever a predecessor's levelled pass-on is later than its
 * unlevelled one, moves the follower no earlier than its links now allow: a participant is re-placed by
 * the same sweep from that point, and an activity with no capped resource is given an overlay there (it
 * has no resource to wait for, so its overlay is its link floor alone).
 *
 * **Gate D:** an activity moves only if `floorL > floorU`, the same link arithmetic
 * ({@link forwardLowerBound}, never restated here) over the levelled and the unlevelled pass-on. Where
 * no predecessor moved the two are computed from identical inputs, so a plan levelling leaves alone, and
 * every activity not downstream of a moved one, answers exactly as it did before Pass C existed. Never
 * moved by links: mandatory-constrained, started, Level-of-Effort and WBS-summary activities; an LOE
 * predecessor pushes nothing, as in Pass 2. A gap left behind by a re-placed participant is NOT filled
 * back in (CQ-3 (a)): levelled plans change only downstream of a bar that moved.
 *
 * ## The anchor (#413)
 *
 * `options.anchor` names the span an activity occupies BEFORE levelling — its **anchor span** — and it
 * is the only thing the two bases change. `PLACED` (a recalculation) anchors on where the bar is drawn,
 * so a clash the planner has separated by hand is not reported and one made by hand is; its priority
 * float is `remainingFloatMinutes` (the room the placement has not already spent). `NETWORK` (the DCMA
 * critical-path test) anchors on the early span with total float, i.e. the logic as if nothing were
 * placed. Unplaced, the two are identical, which is what keeps the corpus and S10 byte-for-byte. Seven
 * places read the anchor (a pinned activity's occupancy and its overlay dates, the priority float and
 * start tie-break, the earliest start a run may take, the negative-float clamp, the delay, and a
 * non-participant's finish in the roll-up); they all go through one set of accessors.
 *
 * ## Algorithm — deterministic serial priority-list heuristic (ADR-0041 §1–§6)
 *
 * 1. **Composite order.** Levellable activities are placed one at a time in the single total order
 *    `levelingPriority` asc (NULL sorts LAST as +∞) → anchor float asc (`totalFloat`, or
 *    `remainingFloatMinutes` when placed) → anchor start asc → `id` asc. This makes the result independent of input order (the determinism invariant).
 * 2. **Exclusions (never moved by resources, §5).** Mandatory-constrained, Level-of-Effort, WBS-summary,
 *    milestone, and progressed (`actualStart` set) activities keep their anchor position and **occupy**
 *    the resource profile there so others level around them. (A milestone is still moved by its links,
 *    in Pass C.) A residual over-allocation a pinned activity
 *    causes is reported on the mover that can't fit (or left), never resolved by moving the pinned one.
 * 3. **Placement.** Each levellable activity is placed at the earliest working start ≥ its anchor start
 *    at which every finite-capacity resource it assigns has spare capacity for the whole run — found by
 *    a **single blackout-gap sweep** ({@link earliestFeasibleStart}) that merges the already-placed
 *    intervals into feasible / blackout regions and returns the first region the run fits (a linear walk
 *    of k placed events held pre-sorted by {@link ResourceProfile}, never a per-minute scan and never a retry loop — termination is inherent,
 *    so it cannot hang; the final open region always fits, §6/§F).
 * 4. **`levelingDelay`** = working time between anchor start and leveled start on the activity's own
 *    calendar (0 when not delayed).
 * 5. **Float-first then extend (§4).** A within-total-float delay preserves the project finish; when
 *    float is exhausted the activity extends. Under `levelWithinFloatOnly` it may not extend — see the
 *    residual contract below.
 * 6. **Window conflict (§6, Q1 = extend-and-flag).** When the earliest feasible slot falls past a
 *    resource's availability window (a window-only resource calendar that runs out), the activity is
 *    still placed there and `levelingWindowExceeded` is set — never a hang.
 * 7. **Self-over-allocation (§2).** If a single activity's own demand on a resource exceeds that
 *    resource's capacity, a delay cannot fix it: `selfOverAllocated` is set, the activity is placed at
 *    its anchor start (not split), and the pass continues.
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
  edges: readonly EngineEdge[],
  assignments: readonly EngineAssignment[],
  resources: readonly EngineResource[],
  options: LevelingOptions,
): { results: EngineResult[]; summary: Partial<EngineSummary> } {
  const { dataDate, planCalendar, levelWithinFloatOnly, anchor } = options;
  const dataDateAbs = instantToAbsMinutes(dataDate);

  // The anchor accessors (#413): the ONE place the two bases differ. Every site below reads the span an
  // activity occupies before levelling, its priority float and its display dates through these, so no
  // site can be left on the other basis. An exhaustive switch with no `default`, like `varianceBasisFor`,
  // so a third anchor is a compile error here rather than a silent fall-through.
  interface AnchorAccessors {
    startOffset: (r: EngineResult) => number;
    finishOffset: (r: EngineResult) => number;
    startDate: (r: EngineResult) => string;
    finishDate: (r: EngineResult) => string;
    priorityFloat: (r: EngineResult) => number;
    /** What the activity passes on to its successors before levelling, as absolute instants (Pass C). */
    passOnStart: (r: EngineResult) => number;
    passOnFinish: (r: EngineResult) => number;
  }
  const accessors = ((): AnchorAccessors => {
    switch (anchor) {
      case 'PLACED':
        return {
          startOffset: (r) => r.placedStartOffset,
          finishOffset: (r) => r.placedFinishOffset,
          startDate: (r) => r.visualEffectiveStart,
          finishDate: (r) => r.visualEffectiveFinish,
          priorityFloat: (r) => r.remainingFloatMinutes,
          passOnStart: (r) => r.passOnStartInstant,
          passOnFinish: (r) => r.passOnFinishInstant,
        };
      case 'NETWORK':
        return {
          startOffset: (r) => r.earlyStartOffset,
          finishOffset: (r) => r.earlyFinishOffset,
          startDate: (r) => r.earlyStart,
          finishDate: (r) => r.earlyFinish,
          priorityFloat: (r) => r.totalFloat,
          // The network has no placements, so what an activity passes on is its early span.
          passOnStart: (r) => instOfOffset(r.earlyStartOffset),
          passOnFinish: (r) => instOfOffset(r.earlyFinishOffset),
        };
    }
  })();

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

  // Never moved by a RESOURCE (§5): mandatory-pinned, LOE, WBS-summary, milestone, or progressed (started).
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
  const profile = new Map<string, ResourceProfile>();
  // The interval objects each activity put into `profile`, kept so Pass C can lift a participant out by
  // identity when it re-places it, rather than searching the profile for equal-looking intervals.
  const occupiedBy = new Map<string, Array<{ resourceId: string; interval: PlacedInterval }>>();
  const occupy = (
    owner: string,
    resourceId: string,
    start: number,
    finish: number,
    demand: number,
  ): void => {
    if (demand <= 0 || finish <= start) return;
    const interval = { start, finish, demand };
    const resourceProfile = profile.get(resourceId);
    if (resourceProfile) resourceProfile.add(interval);
    else {
      const created = new ResourceProfile();
      created.add(interval);
      profile.set(resourceId, created);
    }
    const mine = occupiedBy.get(owner);
    if (mine) mine.push({ resourceId, interval });
    else occupiedBy.set(owner, [{ resourceId, interval }]);
  };
  /** Lift everything `owner` occupies out of the profile (lifting only ever frees capacity). */
  const release = (owner: string): void => {
    for (const { resourceId, interval } of occupiedBy.get(owner) ?? []) {
      profile.get(resourceId)!.remove(interval);
    }
    occupiedBy.delete(owner);
  };

  interface Overlay {
    leveledStartOffset: number;
    /**
     * The same position as an ABSOLUTE instant, which the plan-frame offset above cannot be turned back
     * into for an activity on its own calendar (see the mixed-calendar note). In memory only:
     * `planLevellingApplication` reads it, and `writeResults` persists by named column.
     */
    leveledStartInstant: number;
    leveledFinishOffset: number;
    levelingDelay: number;
    leveledStart: string;
    leveledFinish: string;
    levelingWindowExceeded: boolean;
    selfOverAllocated: boolean;
    /** Set by Pass C only, so an activity Pass C never touched is byte-identical to before it existed. */
    leveledFollowsLinks?: boolean;
  }
  const overlayById = new Map<string, Overlay>();
  // The two display dates of an overlay are calendar walks over date strings, and Pass B's overlay for an
  // activity Pass C then re-places is overwritten without ever being read. So `overlayAt` records what
  // its dates are OWED and they are written once, onto the overlays that survive, when the results are
  // merged. (Nothing reads `leveledStart`/`leveledFinish` before then: Pass C reads the instants.)
  const datesOwed = new Map<
    Overlay,
    { a: EngineActivity; startInst: number; finishInst: number }
  >();

  /**
   * An overlay at `[startInst, finishInst)`, with the delay measured on the activity's own calendar from
   * `anchorInst` (the span it occupied before levelling).
   */
  const overlayAt = (
    a: EngineActivity,
    startInst: number,
    finishInst: number,
    anchorInst: number,
    flags: { windowExceeded: boolean; selfOver: boolean },
  ): Overlay => {
    const cal = calendarOf(a);
    const overlay: Overlay = {
      leveledStartOffset: offsetFromDataDate(planCalendar, dataDateAbs, startInst),
      leveledStartInstant: startInst,
      leveledFinishOffset: offsetFromDataDate(planCalendar, dataDateAbs, finishInst),
      levelingDelay: Math.max(
        0,
        cal.workingTimeBetween(absMinutesToInstant(anchorInst), absMinutesToInstant(startInst)),
      ),
      leveledStart: '',
      leveledFinish: '',
      levelingWindowExceeded: flags.windowExceeded,
      selfOverAllocated: flags.selfOver,
    };
    datesOwed.set(overlay, { a, startInst, finishInst });
    return overlay;
  };

  /** Pin an activity at its network position: overlay = network dates, and occupy its finite demand. */
  const pinAtNetwork = (
    id: string,
    finiteAsgs: readonly EngineAssignment[],
    selfOver: boolean,
  ): void => {
    const r = resultById.get(id)!;
    const a = activityById.get(id);
    const cal = a ? calendarOf(a) : planCalendar;
    const startInst = instOfOffset(accessors.startOffset(r));
    const finishInst = instOfOffset(accessors.finishOffset(r));
    for (const asg of finiteAsgs) {
      occupy(id, asg.resourceId, demandStart(cal, startInst, asg), finishInst, asg.unitsPerHour);
    }
    overlayById.set(id, {
      leveledStartOffset: accessors.startOffset(r),
      leveledStartInstant: startInst,
      leveledFinishOffset: accessors.finishOffset(r),
      levelingDelay: 0,
      leveledStart: accessors.startDate(r),
      leveledFinish: accessors.finishDate(r),
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
      // its anchor start (not split) and flag; it still occupies so others see the demand.
      pinAtNetwork(a.id, finiteAsgs, true);
    } else {
      levellable.push(a);
    }
  }

  /**
   * Place one levellable participant at the earliest capacity-feasible start at or after `fromInst`, and
   * occupy the profile there. Pass B calls it with the anchor start for both arguments (exactly what it
   * always did); Pass C calls it with the link floor as `fromInst` and the anchor as `anchorInst`, which
   * is how the within-float cap comes to clamp to `max(anchor, floor)` rather than to the anchor alone
   * (D-8), and how the delay stays measured from where the activity was drawn.
   */
  const placeParticipant = (
    a: EngineActivity,
    r: EngineResult,
    fromInst: number,
    anchorInst: number,
  ): Overlay => {
    const calA = calendarOf(a);
    const d = a.durationMinutes;
    const finiteAsgs = finiteAssignmentsOf(a.id);

    // Earliest capacity-feasible start via a single blackout-gap sweep over the already-placed
    // intervals on the resources this activity touches (§2). `need` is the spare headroom on each
    // resource once this activity's own demand is reserved (capacity − demand; ≥ 0 here, since a
    // self-over-allocated activity was pinned in Pass A). Non-iterative — it cannot hang.
    const perResource = finiteAsgs.map((asg) => ({
      profile: profile.get(asg.resourceId),
      need: resourceById.get(asg.resourceId)!.capacity! - asg.unitsPerHour,
      lagMinutes: asg.lagMinutes ?? 0,
    }));
    const { start: candidate, finish: finishInst } = earliestFeasibleStart(
      calA,
      fromInst,
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
      // Negative-float guard: an over-constrained activity (late finish < anchor finish) has an
      // unsatisfiable within-float cap, so the cap arithmetic can walk the start BEFORE the earliest it
      // may take (its anchor start, or its link floor once a predecessor has moved). Never place an
      // activity before that — clamp to it and let its finish follow, rather than underflow behind it.
      if (leveledStartInst < fromInst) {
        leveledStartInst = fromInst;
        leveledFinishInst = d === 0 ? fromInst : advanceWorking(calA, fromInst, d);
      }
    }
    for (const asg of finiteAsgs) {
      occupy(
        a.id,
        asg.resourceId,
        demandStart(calA, leveledStartInst, asg),
        leveledFinishInst,
        asg.unitsPerHour,
      );
    }
    return overlayAt(a, leveledStartInst, leveledFinishInst, anchorInst, {
      windowExceeded,
      selfOver: false,
    });
  };

  // Pass B — place the levellable participants one at a time in the composite priority order (§1).
  levellable.sort((a, b) => {
    const pa = a.levelingPriority ?? Number.POSITIVE_INFINITY;
    const pb = b.levelingPriority ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    const ra = resultById.get(a.id)!;
    const rb = resultById.get(b.id)!;
    const fa = accessors.priorityFloat(ra);
    const fb = accessors.priorityFloat(rb);
    if (fa !== fb) return fa - fb;
    const sa = accessors.startOffset(ra);
    const sb = accessors.startOffset(rb);
    if (sa !== sb) return sa - sb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  for (const a of levellable) {
    const r = resultById.get(a.id)!;
    const esInst = instOfOffset(accessors.startOffset(r));
    overlayById.set(a.id, placeParticipant(a, r, esInst, esInst));
  }

  // Pass C — the overlay follows the links (see the header). Everything below reads only what Passes A
  // and B produced, in topological order, so it is as deterministic as Pass 2 (ADR-0041 invariant (a)).
  const graph = buildGraph(activities, edges);
  const unlevelledPassOn = new Map<string, { start: number; finish: number }>();
  const passOnOf = (id: string): { start: number; finish: number } => {
    let on = unlevelledPassOn.get(id);
    if (on === undefined) {
      const r = resultById.get(id)!;
      on = { start: accessors.passOnStart(r), finish: accessors.passOnFinish(r) };
      unlevelledPassOn.set(id, on);
    }
    return on;
  };
  // What a MOVED activity passes on once levelled: the later of its levelled start and its unlevelled
  // pass-on start, spanned as Pass 2 spans it. Held only for activities levelling actually delayed, so
  // an overlay that merely restates the anchor (a pinned participant) can never look like a move.
  const levelledPassOn = new Map<string, { start: number; finish: number }>();
  const recordMoved = (a: EngineActivity, overlay: Overlay): void => {
    if (overlay.levelingDelay <= 0) return;
    const unlevelled = passOnOf(a.id);
    const start = Math.max(overlay.leveledStartInstant, unlevelled.start);
    if (start <= unlevelled.start) return;
    const cal = calendarOf(a);
    const span = cal.workingTimeBetween(
      absMinutesToInstant(unlevelled.start),
      absMinutesToInstant(unlevelled.finish),
    );
    levelledPassOn.set(a.id, {
      start,
      finish: span === 0 ? start : advanceWorking(cal, start, span),
    });
  };
  for (const a of activities) {
    const ov = overlayById.get(a.id);
    if (ov) recordMoved(a, ov);
  }

  // Never moved by a link (D-2). A milestone and a self-over-allocated activity are NOT in this list:
  // they carry no resource wait to protect, so their links move them.
  const isFixedInLogic = (a: EngineActivity): boolean =>
    isMandatory(a.constraintType) ||
    isLoe(a.type) ||
    isSummary(a.type) ||
    (a.actualStart != null && a.actualStart !== '');

  for (const id of graph.order) {
    const a = graph.activities.get(id)!;
    if (isFixedInLogic(a)) continue;
    const incoming = graph.incoming.get(id)!;
    // Nothing before it moved, so both floors would be computed from identical inputs and be equal
    // (Gate D): skipping is the same answer without the arithmetic.
    if (!incoming.some((e) => levelledPassOn.has(e.predecessorId))) continue;

    const cal = calendarOf(a);
    const d = a.durationMinutes;
    let floorU = Number.NEGATIVE_INFINITY;
    let floorL = Number.NEGATIVE_INFINITY;
    for (const edge of incoming) {
      // An LOE predecessor never pushes its successor, in Pass 2 or here.
      if (isLoe(graph.activities.get(edge.predecessorId)!.type)) continue;
      const u = passOnOf(edge.predecessorId);
      const l = levelledPassOn.get(edge.predecessorId) ?? u;
      floorU = Math.max(floorU, forwardLowerBound(edge, u.start, u.finish, cal, d, planCalendar));
      floorL = Math.max(floorL, forwardLowerBound(edge, l.start, l.finish, cal, d, planCalendar));
    }
    // The levelled floor is no later than the unlevelled one: no move reached this activity, so it
    // stays exactly where Passes A and B put it. This guard IS Gate D.
    if (floorL <= floorU) continue;

    const r = resultById.get(id)!;
    const anchorInst = instOfOffset(accessors.startOffset(r));
    const earliest = rollForwardToWorking(cal, Math.max(anchorInst, floorL));
    const existing = overlayById.get(id);
    if ((existing ? existing.leveledStartInstant : anchorInst) >= earliest) continue;

    const finiteAsgs = finiteAssignmentsOf(id);
    let overlay: Overlay;
    if (finiteAsgs.length === 0) {
      // No capped resource: nothing to wait for but the link, so the overlay is the link floor. The
      // span is the one the bar is drawn on (what it passes on), not the input duration. The window
      // flag stays false on purpose: it reports a finite RESOURCE's own availability window (§6), which
      // this activity does not have. Running past its late finish is a float question the plan's own
      // constraint reporting answers, not a resource window being exceeded.
      const drawn = passOnOf(id);
      const span = cal.workingTimeBetween(
        absMinutesToInstant(drawn.start),
        absMinutesToInstant(drawn.finish),
      );
      overlay = overlayAt(
        a,
        earliest,
        span === 0 ? earliest : advanceWorking(cal, earliest, span),
        anchorInst,
        {
          windowExceeded: false,
          selfOver: false,
        },
      );
      overlay.leveledFollowsLinks = true;
    } else {
      release(id);
      if (selfOverOf(finiteAsgs)) {
        // §7 again: a delay cannot fix it, so it is placed at its link floor without a search, still
        // occupying and still flagged.
        const finishInst = d === 0 ? earliest : advanceWorking(cal, earliest, d);
        for (const asg of finiteAsgs) {
          occupy(id, asg.resourceId, demandStart(cal, earliest, asg), finishInst, asg.unitsPerHour);
        }
        overlay = overlayAt(a, earliest, finishInst, anchorInst, {
          windowExceeded: false,
          selfOver: true,
        });
      } else {
        overlay = placeParticipant(a, r, earliest, anchorInst);
      }
      overlay.leveledFollowsLinks = overlay.leveledStartInstant === earliest;
    }
    overlayById.set(id, overlay);
    recordMoved(a, overlay);
  }

  for (const ov of overlayById.values()) {
    const owed = datesOwed.get(ov);
    if (owed === undefined) continue;
    const { a, startInst, finishInst } = owed;
    const cal = calendarOf(a);
    const d = a.durationMinutes;
    ov.leveledStart = leveledDate(cal, dataDate, dataDateAbs, startInst, d, false, a.type);
    ov.leveledFinish = leveledDate(cal, dataDate, dataDateAbs, finishInst, d, true, a.type);
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
    const finishOffset = ov ? ov.leveledFinishOffset : accessors.finishOffset(r);
    const finishDate = ov ? ov.leveledFinish : accessors.finishDate(r);
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

/** One touched resource's already-placed profile plus this activity's spare headroom on it. */
interface ResourceContention {
  /** Absent while nothing has been placed on the resource yet, which is no contention at all. */
  profile: ResourceProfile | undefined;
  /** capacity − this activity's demand: the max concurrent PLACED demand the resource may already carry. */
  need: number;
  /**
   * Working minutes into the run before THIS resource joins (ADR-0071 §1). `0` = joins with the
   * activity, which is every assignment that predates the column and the whole of Gate B.
   */
  lagMinutes: number;
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
 * 1. Each resource's own blackouts are computed independently ({@link ResourceProfile.blackoutsOf}).
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
 * Cost is a walk of each touched resource's placed events — which {@link ResourceProfile} keeps sorted
 * incrementally, so no call re-sorts them — that reads only as far as the run reaches when every lag is
 * zero, with an `O(log b)` check per candidate per resource. Never a per-minute scan.
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

  // With every lag at zero the candidates are the blackout ends themselves, in the order the walk finds
  // them, and a run of known length either fits in the first gap or is pushed past the blackout that
  // blocks it. So the walk need only read as far as the run reaches, and widens when the run does not
  // fit in what it has read. With a lag the candidates are shifted back by a calendar walk and no longer
  // arrive in discovery order, so the whole profile is read. Either way the answer is the same one.
  const lagFree = perResource.every((rc) => rc.lagMinutes === 0);
  let horizon = lagFree ? advanceWorking(cal, start0, d) : Number.POSITIVE_INFINITY;
  for (;;) {
    const scans = perResource.map((rc) => rc.profile?.blackoutsOf(rc.need, esAbs, horizon));
    let knownUntil = Number.POSITIVE_INFINITY;
    for (const scan of scans) if (scan) knownUntil = Math.min(knownUntil, scan.knownUntil);
    const found = searchCandidates(
      cal,
      start0,
      d,
      perResource,
      scans.map((scan) => scan?.blackouts ?? []),
      knownUntil,
    );
    if ('start' in found) return found;
    horizon = Math.max(found.needsKnownUntil, esAbs + 2 * (horizon - esAbs));
  }
}

/**
 * The candidate loop of {@link earliestFeasibleStart} over blackouts that are complete up to
 * `knownUntil`. A candidate whose run reaches past it cannot be judged, and neither can any later one
 * (a later start finishes later), so that is reported as the horizon the caller must read to instead.
 */
function searchCandidates(
  cal: WorkingTimeCalendar,
  start0: number,
  d: number,
  perResource: readonly ResourceContention[],
  blackouts: ReadonlyArray<readonly Blackout[]>,
  knownUntil: number,
): { start: number; finish: number } | { needsKnownUntil: number } {
  const anyBlackout = blackouts.some((b) => b.length > 0);
  // No contention → the earliest working start fits immediately.
  if (!anyBlackout) {
    const finish = advanceWorking(cal, start0, d);
    return finish <= knownUntil ? { start: start0, finish } : { needsKnownUntil: finish };
  }

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
    if (finish > knownUntil) return { needsKnownUntil: finish };
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
  type: EngineActivity['type'],
): string {
  const own = offsetFromDataDate(cal, dataDateAbs, inst);
  // A finish milestone is reported on the day it closes (#381), start and finish alike, exactly as
  // `compute.ts` dates its own; every other type reads its own offset.
  const reported = type === 'FINISH_MILESTONE' ? finishMilestoneDisplayIndex(own) : own;
  const index = isFinish && durationMinutes > 0 ? reported - 1 : reported;
  const endBoundary = cal.addWorkingTime(dataDate, index + 1);
  const iso = endBoundary.length > 10 ? `${endBoundary}:00Z` : `${endBoundary}T00:00:00Z`;
  const instant = new Date(iso);
  instant.setUTCMinutes(instant.getUTCMinutes() - 1);
  return instant.toISOString().slice(0, 10);
}
