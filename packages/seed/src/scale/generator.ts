import {
  DEFAULT_SEED_PLAN_OPTIONS,
  type SeedActivity,
  type SeedAssignment,
  type SeedDependency,
  type SeedSpec,
} from '../spec.js';

/**
 * The **scale generator** (ADR-0066 M4.1): a plan of N activities with a topology a planner would
 * recognise, so a measurement taken on it means something.
 *
 * The failure mode this exists to avoid is a plan that is large and *unrealistic* — a thousand
 * unlinked bars, or one chain a thousand deep. Both are trivial to generate and neither measures
 * what a real programme costs: the first has no logic to route or roll up, the second has a
 * critical path through every activity and a WBS tree one node wide. A number from either would
 * look like evidence and answer nothing.
 *
 * So the shape is **declared and asserted** ({@link SCALE_SHAPE}, `scale.spec.ts`):
 *
 * - **A three-level WBS** — phases → sub-phases → work — with the leaves spread evenly, so no band
 *   holds a large share of the plan and no summary is childless.
 * - **Logic density around 1.6 edges per activity**, built the way a programme is built: chained
 *   within a band, handed on to the same band of the next phase — so a phase's bands run as
 *   concurrent streams — and topped up with skip links inside a band. Wiring random pairs to the
 *   same edge count produces a shallow graph whose longest path is a fraction as long; wiring them
 *   all in series produces one queue. Both are asserted against, the second only after a live run
 *   caught it (see {@link ScaleShape.longestChainFraction}).
 * - **A realistic mix** — some milestones, a few LOE hammocks *with span anchors* (an LOE with no
 *   logic has no dates at all, so generating one would measure nothing), a scattering of
 *   constraints, a progressed front at the data date, and resource assignments on a fraction.
 *
 * **Deterministic**, and that is a requirement rather than tidiness: the whole point is comparing a
 * measurement with a later one, and a plan that differed per run would make every comparison
 * meaningless. `Math.random` is never used; a seeded PRNG is.
 */

const DAY = 1440;
const DATA_DATE = '2026-03-02';

/** Sub-phases per phase, and the target leaves per sub-phase — what makes a band a band. */
const SUB_PHASES_PER_PHASE = 4;
const LEAVES_PER_BAND = 16;

/** The declared shape, asserted by the tests and quoted by any measurement taken on the plan. */
export interface ScaleShape {
  /** Levels in the WBS tree, leaves included: phase → sub-phase → work. */
  wbsDepth: number;
  /** Dependencies ÷ non-summary activities. */
  edgesPerActivity: number;
  milestoneFraction: number;
  loeFraction: number;
  constrainedFraction: number;
  progressedFraction: number;
  assignedFraction: number;
  /**
   * The most activities any single dependency chain may contain, as a fraction of the plan.
   *
   * This is the guard on the failure the docblock above names, and it was **added after the first
   * live run failed it**: linking each band's last activity to the next band's first produced one
   * spine through the whole plan, so the engine returned 96% of tasks critical with zero float and a
   * ten-year duration for 500 activities. Every other declared number was correct, which is exactly
   * why this one now has a test — a plan can hold its density, its tree and its mix and still be a
   * single queue, and nothing but the longest path says so.
   */
  longestChainFraction: number;
}

export const SCALE_SHAPE: ScaleShape = {
  wbsDepth: 3,
  edgesPerActivity: 1.6,
  milestoneFraction: 0.04,
  loeFraction: 0.01,
  constrainedFraction: 0.05,
  progressedFraction: 0.12,
  assignedFraction: 0.35,
  longestChainFraction: 0.4,
};

/**
 * How far a generated plan may sit from {@link SCALE_SHAPE} and still be that shape. The random
 * fractions are rolled per activity, so a 500-leaf plan will not land on 4.00% milestones; the
 * bound says how much drift still describes the same programme. Exported because the test asserts
 * against it and any measurement quoting the shape should quote the tolerance too.
 */
export const SCALE_SHAPE_TOLERANCE = 0.25;

/**
 * `mulberry32` — a small, fast, well-distributed PRNG. Seeded by the activity count, so a 2,000
 * plan is byte-identical every run and a 500 plan is a genuinely different shape rather than a
 * prefix of it.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ScaleOptions {
  /** Non-summary activities. The WBS summaries are generated on top of this count. */
  activities: number;
}

/** The counts an operator wants back without re-deriving them from the spec. */
export interface ScaleShapeReport {
  leaves: number;
  summaries: number;
  dependencies: number;
  edgesPerActivity: number;
  milestones: number;
  loe: number;
  constrained: number;
  progressed: number;
  assignments: number;
}

/** Build a scale plan. Pure and deterministic — same count in, same plan out, on every machine. */
export function scaleSpec(options: ScaleOptions): SeedSpec {
  // Twelve is the floor at which the three-level tree still has more than one leaf per band; below
  // it the "shape" claims above stop being true and the plan would measure nothing anyway.
  const leafCount = Math.max(12, Math.floor(options.activities));
  const random = rng(leafCount);

  const phaseCount = Math.max(
    1,
    Math.ceil(Math.ceil(leafCount / LEAVES_PER_BAND) / SUB_PHASES_PER_PHASE),
  );
  const bandCount = phaseCount * SUB_PHASES_PER_PHASE;

  // Spread the leaves evenly rather than filling bands to a ceiling: a ceiling leaves the tail
  // bands empty, and a childless sub-phase summary is a rollup over nothing — a shape claim that
  // would quietly stop being true at some counts and not others.
  const base = Math.floor(leafCount / bandCount);
  const remainder = leafCount % bandCount;

  const activities: SeedActivity[] = [];
  const dependencies: SeedDependency[] = [];
  const assignments: SeedAssignment[] = [];

  for (let phase = 0; phase < phaseCount; phase += 1) {
    activities.push(summary(phaseKey(phase), `Phase ${String(phase + 1)}`, null));
    for (let sub = 0; sub < SUB_PHASES_PER_PHASE; sub += 1) {
      activities.push(
        summary(
          bandKey(phase, sub),
          `Phase ${String(phase + 1)}.${String(sub + 1)}`,
          phaseKey(phase),
        ),
      );
    }
  }

  // The progressed front: the first slice of the plan in band order, which is what a programme
  // looks like at a data date — a completed front, not progress scattered through the whole plan.
  const frontSize = Math.round(leafCount * SCALE_SHAPE.progressedFraction);
  const completeUntil = Math.round(frontSize * 0.6);

  const leafKeysByBand: string[][] = [];
  let created = 0;
  let taskOrdinal = 0;
  for (let band = 0; band < bandCount; band += 1) {
    const size = base + (band < remainder ? 1 : 0);
    const keys: string[] = [];
    const bandActivities: SeedActivity[] = [];
    for (let position = 0; position < size; position += 1, created += 1) {
      const key = leafKey(created);
      const activity = leaf({
        key,
        index: created,
        parentKey: bandKey(Math.floor(band / SUB_PHASES_PER_PHASE), band % SUB_PHASES_PER_PHASE),
        band,
        frontSize,
        completeUntil,
        random,
      });
      bandActivities.push(activity);
      keys.push(key);
    }

    // An LOE needs two span anchors inside its own band. A band too small to provide them — only
    // reachable at the very bottom of the size range — demotes its LOEs to TASKs rather than
    // emitting a bar with no logic and therefore no dates. Repairing here rather than forcing the
    // band's ends to be TASKs up front: that rule suppressed the declared milestone fraction by a
    // quarter, because a band end is 1-in-8 of the plan at this band size.
    if (bandActivities.filter((a) => a.type !== 'LEVEL_OF_EFFORT').length < 2) {
      for (const activity of bandActivities) {
        if (activity.type !== 'LEVEL_OF_EFFORT') continue;
        activity.type = 'TASK';
        activity.durationMinutes = 5 * DAY;
      }
    }

    for (const activity of bandActivities) {
      activities.push(activity);
      if (activity.type === 'TASK') {
        // Exactly the declared fraction, spread through the plan rather than rolled: an assignment
        // is not a coin flip in a real programme, and the histogram/EV reads this feeds want a
        // predictable load, not a lumpy one.
        if (taskOrdinal % 20 < Math.round(SCALE_SHAPE.assignedFraction * 20)) {
          assignments.push({
            activityKey: activity.key,
            resourceKey: 'SCALE_CREW',
            budgetedUnits: 40,
            unitsPerHour: 1,
            isDriving: false,
            actualUnits: null,
            curveType: 'UNIFORM',
          });
        }
        taskOrdinal += 1;
      }
    }
    leafKeysByBand.push(keys);
  }

  const typeByKey = new Map(activities.map((activity) => [activity.key, activity.type]));
  const isLoe = (key: string): boolean => typeByKey.get(key) === 'LEVEL_OF_EFFORT';
  const link = (from: string, to: string): SeedDependency => edge(from, to, random, typeByKey);

  // 1. Chain within each band. This is where the long paths come from — a programme is a set of
  //    sequences, not a random graph, and a random graph of the same edge count has a critical
  //    path a fraction as long. LOE activities are skipped: they take their dates FROM logic
  //    (ADR-0035 §21) and putting one in the chain would make it drive its successors.
  for (const band of leafKeysByBand) {
    const chain = band.filter((key) => !isLoe(key));
    for (let i = 1; i < chain.length; i += 1) {
      dependencies.push(link(chain[i - 1]!, chain[i]!));
    }
    // 1b. The LOE's span: an in-edge from the band's first activity and an FF out-edge to its
    //     last. That PAIR is the span — an LOE with neither has no dates at all, so generating
    //     one would put a permanently-undated bar in the plan and call it coverage.
    const first = chain[0];
    const last = chain[chain.length - 1];
    if (first === undefined || last === undefined || first === last) continue;
    for (const key of band.filter(isLoe)) {
      dependencies.push(span(first, key, 'FS'));
      dependencies.push(span(key, last, 'FF'));
    }
  }

  // 2. Hand over between phases, along **parallel streams**. Band k of a phase is fed by band k of
  //    the phase before, so the plan runs as `SUB_PHASES_PER_PHASE` concurrent streams rather than
  //    one queue — which is what a programme is, and what gives most activities float.
  //
  //    The first attempt linked each band's last activity to the next band's first, globally. That
  //    reads like a hand-over and is in fact a single chain through the entire plan: the live 500
  //    run came back 96% critical, every task at zero float, ten years long. The unit tests all
  //    passed, because density, depth and mix were each correct — a plan can be exactly the declared
  //    shape and still be one queue. `longestChainFraction` is the assertion that was missing.
  for (let band = SUB_PHASES_PER_PHASE; band < leafKeysByBand.length; band += 1) {
    const from = leafKeysByBand[band - SUB_PHASES_PER_PHASE]?.filter((key) => !isLoe(key)).at(-1);
    const to = leafKeysByBand[band]?.find((key) => !isLoe(key));
    if (from !== undefined && to !== undefined) dependencies.push(link(from, to));
  }

  // 3. Top up to the declared density with **skip links inside a band** — activity 3 feeding
  //    activity 7 of the same sequence, the coordination a real band has. Forward in the band's own
  //    order, so the graph stays acyclic by construction rather than by a cycle check that would
  //    have to reject a generated plan, and an LOE is never an endpoint so its span stays its own.
  //
  //    Confined to a band deliberately. The first version drew across the whole plan with a span of
  //    up to thirteen, which regularly crossed into the next band — a *parallel* stream — and
  //    chained the streams back together: even after the phase-stream fix above, the longest chain
  //    was still 66% of the plan. A skip inside a band adds density without adding path length,
  //    because it short-circuits a sequence that already exists.
  const bandsOfChainable = leafKeysByBand.map((band) => band.filter((key) => !isLoe(key)));
  const target = Math.round(leafCount * SCALE_SHAPE.edgesPerActivity);
  const seen = new Set(dependencies.map((d) => `${d.predecessorKey}->${d.successorKey}`));
  let guard = target * 12;
  while (dependencies.length < target && guard > 0) {
    guard -= 1;
    const band = bandsOfChainable[Math.floor(random() * bandsOfChainable.length)];
    if (band === undefined || band.length < 4) continue;
    const fromIndex = Math.floor(random() * (band.length - 3));
    // Not adjacent — an adjacent pair is already chained above, so it would only hit the dedupe.
    const toIndex = fromIndex + 2 + Math.floor(random() * (band.length - fromIndex - 2));
    const from = band[fromIndex]!;
    const to = band[toIndex]!;
    if (from === to) continue;
    const dedupeKey = `${from}->${to}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    dependencies.push(link(from, to));
  }

  return {
    seedName: `scale-${String(leafCount)}`,
    tier: 'scale',
    plan: {
      name: `Scale ${String(leafCount)} activities`,
      description:
        `Generated scale plan: ${String(leafCount)} activities under ${String(phaseCount)} phases ` +
        `× ${String(SUB_PHASES_PER_PHASE)} sub-phases, ${String(dependencies.length)} ` +
        'dependencies. Deterministic — the same activity count always produces the same plan, so a ' +
        'measurement taken on it can be compared with a later one.',
      dataDate: DATA_DATE,
      defaultCalendarKey: 'SCALE_CAL',
      currencyCode: 'GBP',
      options: { ...DEFAULT_SEED_PLAN_OPTIONS },
    },
    calendars: [
      {
        key: 'SCALE_CAL',
        name: `Scale ${String(leafCount)} week`,
        scope: 'PROJECT',
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          windows: weekday >= 1 && weekday <= 5 ? [{ startMinute: 0, endMinute: DAY }] : [],
        })),
        exceptions: [],
      },
    ],
    resources: [
      {
        key: 'SCALE_CREW',
        name: `Scale ${String(leafCount)} crew`,
        code: `SCALE-${String(leafCount)}`,
        kind: 'LABOUR',
        calendarKey: null,
        maxUnitsPerHour: 8,
        costPerUnit: 4200,
        parentKey: null,
        archived: false,
      },
    ],
    activities,
    dependencies,
    assignments,
    unplaceable: [],
  };
}

/** The generated plan's actual counts, for a report that states what was measured rather than what was asked for. */
export function scaleShapeOf(spec: SeedSpec): ScaleShapeReport {
  const leaves = spec.activities.filter((a) => a.type !== 'WBS_SUMMARY');
  return {
    leaves: leaves.length,
    summaries: spec.activities.length - leaves.length,
    dependencies: spec.dependencies.length,
    edgesPerActivity: leaves.length === 0 ? 0 : spec.dependencies.length / leaves.length,
    milestones: leaves.filter((a) => a.type.endsWith('_MILESTONE')).length,
    loe: leaves.filter((a) => a.type === 'LEVEL_OF_EFFORT').length,
    constrained: leaves.filter((a) => a.constraintType !== null).length,
    progressed: leaves.filter((a) => a.progress !== null).length,
    assignments: spec.assignments.length,
  };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function phaseKey(phase: number): string {
  return `P${pad(phase, 3)}`;
}

function bandKey(phase: number, sub: number): string {
  return `P${pad(phase, 3)}S${pad(sub, 2)}`;
}

function leafKey(index: number): string {
  return `A${pad(index, 5)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function summary(key: string, name: string, parentKey: string | null): SeedActivity {
  return { ...blank(key), name, type: 'WBS_SUMMARY', durationMinutes: 0, parentKey };
}

interface LeafOptions {
  key: string;
  index: number;
  parentKey: string;
  band: number;
  frontSize: number;
  completeUntil: number;
  random: () => number;
}

/** One leaf, with the declared fractions applied deterministically from the PRNG. */
function leaf(options: LeafOptions): SeedActivity {
  const { key, index, parentKey, band, frontSize, completeUntil, random } = options;

  const typeRoll = random();
  const type =
    typeRoll < SCALE_SHAPE.loeFraction
      ? 'LEVEL_OF_EFFORT'
      : typeRoll < SCALE_SHAPE.loeFraction + SCALE_SHAPE.milestoneFraction
        ? index % 2 === 0
          ? 'START_MILESTONE'
          : 'FINISH_MILESTONE'
        : 'TASK';

  const durationRoll = random();
  const constraintRoll = random();

  const inFront = index < frontSize;
  const zeroDuration = type !== 'TASK';
  // A constraint on a progressed activity is largely inert (the actuals win), so the scattering
  // deliberately lands ahead of the front where it can still move a date.
  const constrained =
    type === 'TASK' && !inFront && constraintRoll < SCALE_SHAPE.constrainedFraction;

  return {
    ...blank(key),
    name: `Activity ${key}`,
    type,
    durationMinutes: zeroDuration ? 0 : (1 + Math.floor(durationRoll * 14)) * DAY,
    parentKey,
    ...(constrained
      ? // Near where the activity naturally falls: a single fixed date across a multi-year plan is
        // inert for most of it, which would make the "5% constrained" claim true and meaningless.
        { constraintType: 'SNET' as const, constraintDate: addDays(DATA_DATE, 14 + band * 7) }
      : {}),
    ...(type === 'TASK' && inFront ? { progress: frontProgress(index, completeUntil) } : {}),
  };
}

/** The progressed front: complete behind the data date, in progress at it. */
function frontProgress(index: number, completeUntil: number): SeedActivity['progress'] {
  if (index < completeUntil) {
    return {
      status: 'COMPLETE',
      percentComplete: 100,
      percentCompleteType: 'DURATION',
      physicalPercentComplete: 100,
      actualStart: '2026-01-19T00:00',
      actualFinish: '2026-02-20T00:00',
      remainingDurationMinutes: 0,
      suspendDate: null,
      resumeDate: null,
      expectedFinish: null,
    };
  }
  return {
    status: 'IN_PROGRESS',
    percentComplete: 40,
    percentCompleteType: 'DURATION',
    physicalPercentComplete: null,
    actualStart: '2026-02-23T00:00',
    actualFinish: null,
    remainingDurationMinutes: 2 * DAY,
    suspendDate: null,
    resumeDate: null,
    expectedFinish: null,
  };
}

function edge(
  predecessorKey: string,
  successorKey: string,
  random: () => number,
  typeByKey: ReadonlyMap<string, SeedActivity['type']>,
): SeedDependency {
  const typeRoll = random();
  const lagRoll = random();
  // A milestone has one end, so only one of the four relationship types means anything against it:
  // an SS into a finish milestone names a start that does not exist. A planner writes FS there, and
  // so does this — the randomised mix is for the task-to-task links, which are the vast majority.
  const touchesMilestone =
    isMilestone(typeByKey.get(predecessorKey)) || isMilestone(typeByKey.get(successorKey));

  return {
    predecessorKey,
    successorKey,
    // Mostly FS, as a real programme is, with a minority of the other three so the engine's other
    // branches are exercised at scale rather than only in the small plans.
    type: touchesMilestone
      ? 'FS'
      : typeRoll < 0.82
        ? 'FS'
        : typeRoll < 0.9
          ? 'SS'
          : typeRoll < 0.97
            ? 'FF'
            : 'SF',
    lagMinutes: lagRoll < 0.88 ? 0 : lagRoll < 0.96 ? DAY : -DAY,
    lagCalendarSource: 'PROJECT_DEFAULT',
  };
}

function isMilestone(type: SeedActivity['type'] | undefined): boolean {
  return type === 'START_MILESTONE' || type === 'FINISH_MILESTONE';
}

/** An LOE span leg — never randomised, because the pair IS the LOE's definition. */
function span(
  predecessorKey: string,
  successorKey: string,
  type: SeedDependency['type'],
): SeedDependency {
  return {
    predecessorKey,
    successorKey,
    type,
    lagMinutes: 0,
    lagCalendarSource: 'PROJECT_DEFAULT',
  };
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function blank(key: string): SeedActivity {
  return {
    key,
    code: key,
    name: key,
    type: 'TASK',
    durationMinutes: 5 * DAY,
    calendarKey: null,
    parentKey: null,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    scheduleAsLateAsPossible: false,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    externalEarlyStart: null,
    externalLateFinish: null,
    levelingPriority: null,
    accrualType: 'UNIFORM',
    budgetedExpense: null,
    actualExpense: null,
    steps: [],
    progress: null,
    visualStart: null,
    testTags: [],
  };
}
