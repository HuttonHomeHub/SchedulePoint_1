/**
 * Live cross-plan external-instant derivation (ADR-0045 §2, ADR-0035 §30.5) — the F4 seam that feeds
 * live inter-project bounds into the CPM engine WITHOUT touching the pure engine. It lives ABOVE the
 * engine (beside {@link ./schedule.service}) and overrides each activity's M1 `externalEarlyStart` /
 * `externalLateFinish` (ADR-0043) with a value composed from its cross-plan edges' upstream
 * **persisted** computed dates and the hand-entered M1 column.
 *
 * Purity & parity: this module is engine-free and side-effect-free. The caller only invokes it when a
 * plan has ≥1 active cross-plan edge; a plan with none derives nothing, so no map entry is produced and
 * {@link ./schedule.service} takes the byte-identical M1-column fast path (the parity gate).
 *
 * Day granularity: the M1 external instant is day-denominated (`YYYY-MM-DD`), so the derivation mirrors
 * the engine's forward/backward bound *shapes* (see `forwardLowerBound`/`backwardUpperBound` in
 * `engine/compute.ts`) at **whole-day** granularity — lag and duration are days, arithmetic is UTC
 * calendar-day add/subtract. The composed instant is fed back through the exact same
 * `clampExternalForwardStart` / `clampExternalBackwardFinish` seam as a hand-entered M1 column, so the
 * engine interprets a derived bound identically to a manual one.
 */

/** The four relationship kinds a cross-plan edge can carry — structurally Prisma's `DependencyType`. */
export type CrossPlanEdgeType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * A cross-plan edge whose SUCCESSOR is in the plan being scheduled (its incoming links), carrying the
 * PREDECESSOR's persisted early dates. Drives the forward (external early start) bound (§30.1).
 */
export interface IncomingCrossPlanEdge {
  /** The successor activity (in this plan) whose external early start this edge derives. */
  successorActivityId: string;
  type: CrossPlanEdgeType;
  /** The edge's typed lag, in whole working days (a lead is negative). */
  lagDays: number;
  /** The upstream predecessor's persisted early start / finish (`YYYY-MM-DD`), or null if never calculated. */
  predecessorEarlyStart: string | null;
  predecessorEarlyFinish: string | null;
}

/**
 * A cross-plan edge whose PREDECESSOR is in the plan being scheduled (its outgoing links), carrying the
 * downstream SUCCESSOR's persisted late dates. Drives the backward (external late finish) bound (§30.2).
 */
export interface OutgoingCrossPlanEdge {
  /** The predecessor activity (in this plan) whose external late finish this edge derives. */
  predecessorActivityId: string;
  type: CrossPlanEdgeType;
  /** The edge's typed lag, in whole working days (a lead is negative). */
  lagDays: number;
  /** The downstream successor's persisted late start / finish (`YYYY-MM-DD`), or null if never calculated. */
  successorLateStart: string | null;
  successorLateFinish: string | null;
}

/** The M1 hand-entered external columns (ADR-0043) for one activity, as `YYYY-MM-DD | null`. */
export interface M1ExternalInstant {
  externalEarlyStart: string | null;
  externalLateFinish: string | null;
}

/** The effective external instants derived for one activity — the values fed onto its `EngineActivity`. */
export interface DerivedExternalInstant {
  externalEarlyStart: string | null;
  externalLateFinish: string | null;
}

export interface DeriveExternalInstantsInput {
  /** Cross-plan edges into this plan (successor here); each carries its predecessor's persisted early dates. */
  incoming: readonly IncomingCrossPlanEdge[];
  /** Cross-plan edges out of this plan (predecessor here); each carries its successor's persisted late dates. */
  outgoing: readonly OutgoingCrossPlanEdge[];
  /** The M1 hand-entered external columns, keyed by activity id. Absent id ⇒ no manual bound. */
  m1: ReadonlyMap<string, M1ExternalInstant>;
  /** Each activity's duration in whole days, keyed by id — needed for the FF/SF start-implied arithmetic. */
  durationDaysByActivity: ReadonlyMap<string, number>;
}

export interface DeriveExternalInstantsResult {
  /**
   * The effective external instants keyed by activity id — ONE entry per activity that has ≥1 cross-plan
   * edge (incoming or outgoing). The value composes the derived bound with the M1 column, so an activity
   * whose upstreams are all missing (or which has only one direction of edge) still reproduces its M1
   * value. An activity with no cross-plan edge is ABSENT (the caller keeps the M1-column fast path).
   */
  derived: Map<string, DerivedExternalInstant>;
  /**
   * How many cross-plan edges pointed at an upstream endpoint that has never been calculated (N32,
   * ADR-0035 §30.5) — that edge contributes no bound and is counted here; never an error.
   */
  upstreamMissingCount: number;
}

/** Add (or subtract, for a negative `days`) whole calendar days to a `YYYY-MM-DD`, in UTC. */
function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

/** The later (max) of two `YYYY-MM-DD` days; a null side yields the other (both null ⇒ null). Lexicographic
 * comparison is exact for the fixed-width zero-padded format. */
function laterOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

/** The earlier (min) of two `YYYY-MM-DD` days; a null side yields the other (both null ⇒ null). */
function earlierOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a <= b ? a : b;
}

/**
 * The forward (external early start) bound one incoming edge imposes, mirroring the engine's
 * `forwardLowerBound` shape at day granularity: FS → predEarlyFinish + lag; SS → predEarlyStart + lag;
 * FF → predEarlyFinish + lag − succDuration; SF → predEarlyStart + lag − succDuration (the start implied
 * by the finish bound). A null upstream date (never calculated) ⇒ `missing` (no bound, counted as N32).
 */
function forwardBound(
  edge: IncomingCrossPlanEdge,
  successorDurationDays: number,
): { date: string | null; missing: boolean } {
  switch (edge.type) {
    case 'FS':
      return edge.predecessorEarlyFinish === null
        ? { date: null, missing: true }
        : { date: addDays(edge.predecessorEarlyFinish, edge.lagDays), missing: false };
    case 'SS':
      return edge.predecessorEarlyStart === null
        ? { date: null, missing: true }
        : { date: addDays(edge.predecessorEarlyStart, edge.lagDays), missing: false };
    case 'FF':
      return edge.predecessorEarlyFinish === null
        ? { date: null, missing: true }
        : {
            date: addDays(edge.predecessorEarlyFinish, edge.lagDays - successorDurationDays),
            missing: false,
          };
    case 'SF':
      return edge.predecessorEarlyStart === null
        ? { date: null, missing: true }
        : {
            date: addDays(edge.predecessorEarlyStart, edge.lagDays - successorDurationDays),
            missing: false,
          };
  }
}

/**
 * The backward (external late finish) bound one outgoing edge imposes, mirroring the engine's
 * `backwardUpperBound` shape at day granularity: FS → succLateStart − lag; SS → succLateStart − lag +
 * predDuration; FF → succLateFinish − lag; SF → succLateFinish − lag + predDuration (the finish implied
 * by the start bound). A null downstream date (never calculated) ⇒ `missing` (no bound, counted as N32).
 */
function backwardBound(
  edge: OutgoingCrossPlanEdge,
  predecessorDurationDays: number,
): { date: string | null; missing: boolean } {
  switch (edge.type) {
    case 'FS':
      return edge.successorLateStart === null
        ? { date: null, missing: true }
        : { date: addDays(edge.successorLateStart, -edge.lagDays), missing: false };
    case 'SS':
      return edge.successorLateStart === null
        ? { date: null, missing: true }
        : {
            date: addDays(edge.successorLateStart, -edge.lagDays + predecessorDurationDays),
            missing: false,
          };
    case 'FF':
      return edge.successorLateFinish === null
        ? { date: null, missing: true }
        : { date: addDays(edge.successorLateFinish, -edge.lagDays), missing: false };
    case 'SF':
      return edge.successorLateFinish === null
        ? { date: null, missing: true }
        : {
            date: addDays(edge.successorLateFinish, -edge.lagDays + predecessorDurationDays),
            missing: false,
          };
  }
}

/**
 * Derive each cross-plan-linked activity's effective external instants (ADR-0045 §2 / ADR-0035 §30.5).
 * Forward: the derived external early start is the **latest** of all incoming-edge bounds, composed with
 * the M1 column by **later-of** (max; §30.1 "later drives"). Backward: the derived external late finish
 * is the **earliest** of all outgoing-edge bounds, composed by **tighter-of** (min; §30.2). A cross-plan
 * edge whose upstream endpoint is never-calculated contributes no bound and increments
 * `upstreamMissingCount` (N32). An activity with a cross-plan edge but neither a derived nor an M1 bound
 * gets `{ null, null }` (a no-op override, byte-identical to feeding the M1 columns).
 */
export function deriveExternalInstants(
  input: DeriveExternalInstantsInput,
): DeriveExternalInstantsResult {
  // The latest incoming-derived early start / earliest outgoing-derived late finish per activity.
  const derivedForward = new Map<string, string>();
  const derivedBackward = new Map<string, string>();
  const activityIds = new Set<string>();
  let upstreamMissingCount = 0;

  for (const edge of input.incoming) {
    activityIds.add(edge.successorActivityId);
    const succDuration = input.durationDaysByActivity.get(edge.successorActivityId) ?? 0;
    const bound = forwardBound(edge, succDuration);
    if (bound.missing) {
      upstreamMissingCount += 1;
      continue;
    }
    derivedForward.set(
      edge.successorActivityId,
      laterOf(derivedForward.get(edge.successorActivityId) ?? null, bound.date)!,
    );
  }

  for (const edge of input.outgoing) {
    activityIds.add(edge.predecessorActivityId);
    const predDuration = input.durationDaysByActivity.get(edge.predecessorActivityId) ?? 0;
    const bound = backwardBound(edge, predDuration);
    if (bound.missing) {
      upstreamMissingCount += 1;
      continue;
    }
    derivedBackward.set(
      edge.predecessorActivityId,
      earlierOf(derivedBackward.get(edge.predecessorActivityId) ?? null, bound.date)!,
    );
  }

  const derived = new Map<string, DerivedExternalInstant>();
  for (const id of activityIds) {
    const m1 = input.m1.get(id);
    derived.set(id, {
      // Later-of the derived early start and the M1 column (§30.1); tighter-of for the late finish (§30.2).
      externalEarlyStart: laterOf(derivedForward.get(id) ?? null, m1?.externalEarlyStart ?? null),
      externalLateFinish: earlierOf(
        derivedBackward.get(id) ?? null,
        m1?.externalLateFinish ?? null,
      ),
    });
  }

  return { derived, upstreamMissingCount };
}
