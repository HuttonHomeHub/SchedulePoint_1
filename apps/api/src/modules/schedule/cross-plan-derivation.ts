import type { ActivityType } from '@repo/types';

import {
  backwardUpperBound,
  externalStartInstant,
  finishDateInstant,
  formatExternalInstant,
  forwardLowerBound,
  startDateInstant,
  type EngineEdge,
  type WorkingTimeCalendar,
} from './engine';
import { finishMilestoneDateInstant, rollBackwardToWorking } from './engine/instants';
import { instantToAbsMinutes } from './engine/working-time-calendar';

/**
 * Live cross-plan external-instant derivation (ADR-0045 §2, ADR-0035 §30.5) — the F4 seam that feeds
 * live inter-project bounds into the CPM engine WITHOUT touching the pure engine. It lives ABOVE the
 * engine (beside {@link ./schedule.service}) and overrides each activity's M1 `externalEarlyStart` /
 * `externalLateFinish` (ADR-0043) with a value composed from its cross-plan edges' remote
 * **persisted** dates and the hand-entered M1 column.
 *
 * Purity & parity: this module is side-effect-free and never calls `computeSchedule`. The caller only
 * invokes it when a plan has ≥1 active cross-plan edge; a plan with none derives nothing, so no map
 * entry is produced and {@link ./schedule.service} takes the byte-identical M1-column fast path (the
 * parity gate).
 *
 * **One rule, not two** (#385, spec D1–D7). Until #385 this module restated the engine's link
 * arithmetic in whole UTC calendar days: a finish date read as the start of its day, a lag added as
 * calendar days, a stored lag read as `minutes / 1440` whatever the calendar, durations subtracted as
 * calendar days, and an LOE upstream allowed to drive. Each made a programme split into plans read
 * differently from the same logic in one plan. It now does what the engine does, with the engine's
 * own functions, on absolute working instants:
 *
 * 1. Each remote date is read as an **instant** on the remote activity's own scheduling calendar by
 *    the engine's date readers (`startDateInstant`, `finishDateInstant`): a finish is the exclusive
 *    end of that day's working time, a finish milestone's date midnight at the end of its day (ADR-0155, unrolled since #539), a
 *    zero-duration activity finishes at its start. `finishDateInstant` is anchored at the remote
 *    plan's data date, the anchor the engine itself used (M1's finding: the reader returns an anchor
 *    that falls after the result but before the day's end, so any other anchor can differ).
 * 2. The bound is the engine's `forwardLowerBound` / `backwardUpperBound`, called with the edge's
 *    lag in working minutes and an explicit lag-calendar port, so `applyLag`'s plan-calendar
 *    fallback is never reached: "the plan" is two plans here (D5). The FF/SF and SS/SF durations
 *    walk the calendar of the activity they belong to.
 * 3. An LOE endpoint contributes no bound (ADR-0035 §21), as in one plan, and is NOT counted as a
 *    never-calculated upstream: only null upstream dates are N32.
 * 4. The derived bound is composed with the M1 column as **instants** on this activity's calendar
 *    (D6): a bare finish-milestone date means the end of its day, so a string comparison gets the
 *    order wrong. An M1 winner or tie is passed through as its own bare string, keeping the engine's
 *    input byte-identical wherever the hand-entered date already wins (the N25 count compares
 *    strings, `compute.ts`). A derived winner is written by `formatExternalInstant`, `YYYY-MM-DDTHH:MM`
 *    with midnight kept (D7, E12), which the engine's clamps read as the instant itself.
 *
 * What it still cannot match is stated in the spec (§1): persisted dates carry no time of day, so an
 * upstream finishing mid-day is read as the end of that day; and the forward bound reads the
 * upstream's PLACED dates in both passes (ADR-0148 M-H), where one plan feeds placements to Pass 2
 * only. The parity domain is unplaced upstreams that finish on a day boundary.
 */

/** The four relationship kinds a cross-plan edge can carry — structurally Prisma's `DependencyType`. */
export type CrossPlanEdgeType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * The OTHER plan's end of a cross-plan edge: what the engine needs to read its persisted dates as
 * instants. `calendar` is its **scheduling** calendar resolved on ITS OWN plan (driving resource →
 * its own → its plan's; `schedulingCalendarId`), never this plan's: the inherit sentinel means "my
 * plan", and there are two plans (the ADR-0139 lesson).
 */
export interface CrossPlanRemoteEndpoint {
  type: ActivityType;
  /** Its stored duration in working minutes (a zero-duration activity finishes at its start). */
  durationMinutes: number;
  calendar: WorkingTimeCalendar;
  /** Its plan's data date (`YYYY-MM-DD`), the anchor `finishDateInstant` counts from. */
  dataDate: string;
}

/** An activity of the plan being scheduled, as the bound functions need it. */
export interface CrossPlanLocalActivity {
  type: ActivityType;
  durationMinutes: number;
  /** Its scheduling calendar port (the plan's own port when it inherits). */
  calendar: WorkingTimeCalendar;
}

/**
 * A cross-plan edge whose SUCCESSOR is in the plan being scheduled (its incoming links), carrying the
 * PREDECESSOR's persisted **placed** dates. Drives the forward (external early start) bound (§30.1).
 */
export interface IncomingCrossPlanEdge {
  /** The successor activity (in this plan) whose external early start this edge derives. */
  successorActivityId: string;
  type: CrossPlanEdgeType;
  /** The edge's stored lag in working minutes on `lagCalendar` (a lead is negative). */
  lagMinutes: number;
  /** The port the lag walks on, resolved by the one cross-plan lag-calendar rule (D5). */
  lagCalendar: WorkingTimeCalendar;
  /** The upstream predecessor: its type, duration, calendar and plan data date. */
  predecessor: CrossPlanRemoteEndpoint;
  /**
   * The upstream predecessor's persisted **placed** start / finish (`YYYY-MM-DD`) — the
   * effective-Visual columns, since one-planning-surface M-H. Null where the bound cannot be
   * derived, which the caller counts as an N32 warning rather than treating as a missing edge.
   *
   * **Null has two causes and only one of them is "never calculated."** The columns were added by
   * `20260714120000_add_scheduling_modes_columns` **with no backfill**, so a plan whose last
   * recalculation predates 2026-07-14 has `early_start` set and `visual_effective_start` null — and
   * a cross-plan bound that used to derive now reports as missing. It degrades gracefully (a
   * counted warning, never a wrong bound) and is almost certainly an empty population on this
   * estate, but a reader debugging an unexpected N32 should recalculate the upstream plan before
   * looking anywhere else.
   */
  predecessorPlacedStart: string | null;
  predecessorPlacedFinish: string | null;
}

/**
 * A cross-plan edge whose PREDECESSOR is in the plan being scheduled (its outgoing links), carrying the
 * downstream SUCCESSOR's persisted late dates. Drives the backward (external late finish) bound (§30.2).
 */
export interface OutgoingCrossPlanEdge {
  /** The predecessor activity (in this plan) whose external late finish this edge derives. */
  predecessorActivityId: string;
  type: CrossPlanEdgeType;
  /** The edge's stored lag in working minutes on `lagCalendar` (a lead is negative). */
  lagMinutes: number;
  lagCalendar: WorkingTimeCalendar;
  /** The downstream successor: its type, duration, calendar and plan data date. */
  successor: CrossPlanRemoteEndpoint;
  /** The downstream successor's persisted late start / finish (`YYYY-MM-DD`), or null if never calculated. */
  successorLateStart: string | null;
  successorLateFinish: string | null;
}

/** The M1 hand-entered external columns (ADR-0043) for one activity, as `YYYY-MM-DD | null`. */
export interface M1ExternalInstant {
  externalEarlyStart: string | null;
  externalLateFinish: string | null;
}

/**
 * The effective external values derived for one activity — the values fed onto its `EngineActivity`.
 * Each is either an M1 bare date passed through verbatim or a derived `YYYY-MM-DDTHH:MM` instant.
 */
export interface DerivedExternalInstant {
  externalEarlyStart: string | null;
  externalLateFinish: string | null;
}

export interface DeriveExternalInstantsInput {
  /** Cross-plan edges into this plan (successor here). */
  incoming: readonly IncomingCrossPlanEdge[];
  /** Cross-plan edges out of this plan (predecessor here). */
  outgoing: readonly OutgoingCrossPlanEdge[];
  /** The M1 hand-entered external columns, keyed by activity id. Absent id ⇒ no manual bound. */
  m1: ReadonlyMap<string, M1ExternalInstant>;
  /** This plan's activities, keyed by id: every endpoint an edge names must be present. */
  activities: ReadonlyMap<string, CrossPlanLocalActivity>;
  /** This plan's data date (`YYYY-MM-DD`), the anchor for reading an M1 late finish. */
  dataDate: string;
}

export interface DeriveExternalInstantsResult {
  /**
   * The effective external values keyed by activity id — ONE entry per activity that has ≥1 cross-plan
   * edge (incoming or outgoing). The value composes the derived bound with the M1 column, so an activity
   * whose upstreams are all missing (or which has only one direction of edge) still reproduces its M1
   * value. An activity with no cross-plan edge is ABSENT (the caller keeps the M1-column fast path).
   */
  derived: Map<string, DerivedExternalInstant>;
  /**
   * How many **incoming** cross-plan edges pointed at an *upstream predecessor* that has never been
   * calculated (N32, ADR-0035 §30.5) — that edge contributes no forward bound and is counted here;
   * never an error. An LOE upstream is NOT counted: it never bounds a successor in one plan, so its
   * absence is not a warning (test-engineer). Outgoing (backward) edges whose downstream successor is
   * uncomputed are deliberately NOT counted either: in an upstream-first programme solve the
   * downstream is computed later in the same closure, so counting it would report a phantom
   * "upstream never calculated" after a clean recalc.
   */
  upstreamMissingCount: number;
}

const isLoe = (type: ActivityType): boolean => type === 'LEVEL_OF_EFFORT';

/**
 * The engine's edge shape for the bound functions. The lag calendar is always an explicit port, so
 * the `planCalendar` argument the bound functions take as a fallback is never consulted.
 */
function engineEdge(
  type: CrossPlanEdgeType,
  lagMinutes: number,
  lagCalendar: WorkingTimeCalendar,
): EngineEdge {
  return {
    id: 'cross-plan',
    predecessorId: 'remote',
    successorId: 'local',
    type,
    lagMinutes,
    lagCalendar,
  };
}

function localOf(
  activities: ReadonlyMap<string, CrossPlanLocalActivity>,
  id: string,
): CrossPlanLocalActivity {
  const activity = activities.get(id);
  if (!activity) {
    throw new Error(`deriveExternalInstants: activity "${id}" has a cross-plan edge but no row`);
  }
  return activity;
}

/**
 * **The instant a stored finish-milestone date stands for** (#539, ADR-0207 D2). The engine reads a date
 * GIVEN for a finish milestone as midnight at the end of its day, but the date a plan STORES for one is
 * the day its kept instant falls on, and that instant is where the work before it ended: the end of that
 * day's last working minute on the milestone's calendar when it has one (Wed 16:00 on an eight-hour
 * calendar), else, on a day with no working time (a Sunday after weekend work), the end of the day. A
 * date carries no time of day (the derivation's stated limit), so this is the closest instant a day can
 * name, and the one that makes the common cases match one plan.
 */
function finishMilestoneRemoteInstant(
  calendar: CrossPlanRemoteEndpoint['calendar'],
  anchor: number,
  date: string,
  pass: 'forward' | 'backward',
): number {
  const midnight = finishMilestoneDateInstant(date);
  // A late date is a bound some later logic or a constraint gave, which is what a date given for a
  // finish milestone means: midnight at the end of its day, exactly as the one-plan clamp reads it.
  if (pass === 'backward') return midnight;
  const lastWorking = rollBackwardToWorking(calendar, anchor, midnight);
  return lastWorking > instantToAbsMinutes(date) ? lastWorking : midnight;
}

/** The remote end's start and finish instants, or null when a date the edge type needs is null. */
function remoteInstants(
  remote: CrossPlanRemoteEndpoint,
  start: string | null,
  finish: string | null,
  needs: 'start' | 'finish',
  pass: 'forward' | 'backward',
): { start: number; finish: number } | null {
  const date = needs === 'start' ? start : finish;
  if (date === null) return null;
  const anchor = instantToAbsMinutes(remote.dataDate);
  const read =
    remote.type === 'FINISH_MILESTONE'
      ? finishMilestoneRemoteInstant(remote.calendar, anchor, date, pass)
      : needs === 'start'
        ? startDateInstant(remote.calendar, date, remote.type)
        : finishDateInstant(remote.calendar, anchor, date, remote.type, remote.durationMinutes);
  // **A zero-duration remote's late date is read as its instant, with no roll** (#539, ADR-0207 D1).
  // This once rolled such a date back onto the remote's calendar to mirror `compute.ts`, whose backward
  // pass held a zero-duration activity's late start at its calendar's pre-gap end boundary. The engine
  // now keeps the instant its logic gives (D1) and reads a finish milestone's date as midnight at the end
  // of its day (D2), so reading the stored date as it is gives the bound one plan gives. A task's late
  // finish was already an end boundary (`finishDateInstant` rolls back from the next midnight), so the
  // roll was a no-op for it.
  const instant = read;
  // Only the date the edge type reads is read. The other is NaN, which the bound function for that
  // type never consults (FS/FF read the finish, SS/SF the start), so a null there is not a miss.
  return needs === 'start'
    ? { start: instant, finish: Number.NaN }
    : { start: Number.NaN, finish: instant };
}

/**
 * Which remote date each bound reads, straight off `edge-bounds.ts`. Forward: an FS or FF edge
 * reads the predecessor's FINISH, an SS or SF edge its START. Backward: an FS or SS edge reads the
 * successor's START, an FF or SF edge its FINISH. The two tables differ on FS and SF, which is
 * why there are two.
 */
const forwardAnchorOf = (type: CrossPlanEdgeType): 'start' | 'finish' =>
  type === 'SS' || type === 'SF' ? 'start' : 'finish';
const backwardAnchorOf = (type: CrossPlanEdgeType): 'start' | 'finish' =>
  type === 'FS' || type === 'SS' ? 'start' : 'finish';

/**
 * Derive each cross-plan-linked activity's effective external values (ADR-0045 §2 / ADR-0035 §30.5).
 * Forward: the latest of all incoming-edge bounds, composed with the M1 column by **later-of**
 * (§30.1). Backward: the earliest of all outgoing-edge bounds, composed by **tighter-of** (§30.2).
 * Both compositions compare instants read on this activity's calendar (D6).
 */
export function deriveExternalInstants(
  input: DeriveExternalInstantsInput,
): DeriveExternalInstantsResult {
  // The latest incoming-derived early start / earliest outgoing-derived late finish per activity,
  // as absolute working instants.
  const derivedForward = new Map<string, number>();
  const derivedBackward = new Map<string, number>();
  const activityIds = new Set<string>();
  let upstreamMissingCount = 0;

  for (const edge of input.incoming) {
    activityIds.add(edge.successorActivityId);
    const successor = localOf(input.activities, edge.successorActivityId);
    // An LOE upstream never drives its successor (ADR-0035 §21). Not an N32 miss: skipped first,
    // whatever its dates, so a never-calculated LOE is not counted either.
    if (isLoe(edge.predecessor.type)) continue;
    const anchors = remoteInstants(
      edge.predecessor,
      edge.predecessorPlacedStart,
      edge.predecessorPlacedFinish,
      forwardAnchorOf(edge.type),
      'forward',
    );
    if (anchors === null) {
      upstreamMissingCount += 1;
      continue;
    }
    const bound = forwardLowerBound(
      engineEdge(edge.type, edge.lagMinutes, edge.lagCalendar),
      anchors.start,
      anchors.finish,
      successor.calendar,
      successor.durationMinutes,
      edge.lagCalendar,
    );
    const current = derivedForward.get(edge.successorActivityId);
    if (current === undefined || bound > current)
      derivedForward.set(edge.successorActivityId, bound);
  }

  for (const edge of input.outgoing) {
    activityIds.add(edge.predecessorActivityId);
    const predecessor = localOf(input.activities, edge.predecessorActivityId);
    // An LOE downstream never bounds its predecessor (ADR-0035 §21).
    if (isLoe(edge.successor.type)) continue;
    const anchors = remoteInstants(
      edge.successor,
      edge.successorLateStart,
      edge.successorLateFinish,
      backwardAnchorOf(edge.type),
      'backward',
    );
    // A never-computed DOWNSTREAM successor yields no backward bound, and it is NOT counted as N32:
    // `upstreamMissingCount` is specifically the *upstream* (incoming-predecessor) never-calculated
    // count (§30.5, web copy "pointed at an upstream activity"). In an upstream-first programme solve
    // the most-upstream plan's outgoing edge always reads its downstream as uncomputed on this pass —
    // that is expected and transient (the downstream is solved later in the same closure), so counting
    // it here would surface a false "1 upstream never calculated" after a fully successful recalc.
    if (anchors === null) continue;
    const bound = backwardUpperBound(
      engineEdge(edge.type, edge.lagMinutes, edge.lagCalendar),
      anchors.start,
      anchors.finish,
      predecessor.calendar,
      predecessor.durationMinutes,
      edge.lagCalendar,
    );
    const current = derivedBackward.get(edge.predecessorActivityId);
    if (current === undefined || bound < current) {
      derivedBackward.set(edge.predecessorActivityId, bound);
    }
  }

  const dataDateAbs = instantToAbsMinutes(input.dataDate);
  const derived = new Map<string, DerivedExternalInstant>();
  for (const id of activityIds) {
    const activity = localOf(input.activities, id);
    const manual = input.m1.get(id);
    derived.set(id, {
      externalEarlyStart: laterOfForward(
        activity,
        derivedForward.get(id),
        manual?.externalEarlyStart ?? null,
      ),
      externalLateFinish: tighterOfBackward(
        activity,
        dataDateAbs,
        derivedBackward.get(id),
        manual?.externalLateFinish ?? null,
      ),
    });
  }

  return { derived, upstreamMissingCount };
}

/**
 * Later-of the derived early-start bound and the M1 column, compared as the engine will read each
 * (`clampExternalForwardStart` reads both through `externalStartInstant`). The M1 string wins a tie.
 */
function laterOfForward(
  activity: CrossPlanLocalActivity,
  derivedAbs: number | undefined,
  manual: string | null,
): string | null {
  if (derivedAbs === undefined) return manual;
  const derived = formatExternalInstant(derivedAbs);
  if (manual === null) return derived;
  const derivedRead = externalStartInstant(activity, activity.calendar, derived);
  const manualRead = externalStartInstant(activity, activity.calendar, manual);
  return derivedRead > manualRead ? derived : manual;
}

/**
 * Tighter-of the derived late-finish bound and the M1 column, compared as the engine will read each
 * (`clampExternalBackwardFinish`: a timed value is the instant itself, a bare date its
 * `finishDateInstant` on this activity's calendar from this plan's data date). The M1 string wins a
 * tie.
 */
function tighterOfBackward(
  activity: CrossPlanLocalActivity,
  dataDateAbs: number,
  derivedAbs: number | undefined,
  manual: string | null,
): string | null {
  if (derivedAbs === undefined) return manual;
  const derived = formatExternalInstant(derivedAbs);
  if (manual === null) return derived;
  const manualRead =
    manual.length > 10
      ? instantToAbsMinutes(manual)
      : finishDateInstant(
          activity.calendar,
          dataDateAbs,
          manual,
          activity.type,
          activity.durationMinutes,
        );
  return derivedAbs < manualRead ? derived : manual;
}
