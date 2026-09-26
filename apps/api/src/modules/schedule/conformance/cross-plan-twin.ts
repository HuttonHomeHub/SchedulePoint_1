import {
  deriveExternalInstants,
  type IncomingCrossPlanEdge,
  type M1ExternalInstant,
  type OutgoingCrossPlanEdge,
} from '../cross-plan-derivation';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  computeSchedule,
  type EngineActivity,
  type EngineEdge,
  type EngineOutput,
  type EngineResult,
  type WorkingTimeCalendar,
} from '../engine';

import {
  BACKWARD_SUCCESSOR_FNLT,
  FORWARD_ANCHOR_DAYS,
  LONG_TASK_DAYS,
  MATRIX_CALENDAR_SHAPES,
  MATRIX_DATA_DATE,
  MATRIX_TASK_DAYS,
  type CrossPlanMatrixCell,
  type MatrixCalendarName,
} from './cross-plan-matrix';

/**
 * **The #385 twin: one link built twice, across two plans and inside one** (plan M0-T1 step 2).
 *
 * For one matrix cell it builds a two-plan programme (an upstream plan, a downstream plan and one
 * cross-plan edge) and a single-plan twin holding the same activities and the same link as an
 * ordinary dependency. Both run through the real, unchanged engine. The cross-plan side goes
 * through the real {@link deriveExternalInstants}, fed exactly as `schedule.service.ts`'s
 * cross-plan branch feeds it today, so the twin measures the rule the product runs.
 *
 * **What it compares, and why that and not a late finish** (the plan's backward-twin risk):
 * - forward, the successor's early start. The downstream plan holds only the successor, so its early
 *   start is the derived bound and nothing else.
 * - backward, the predecessor's late finish. Both worlds pin the successor with the same `FNLT`, and
 *   both plans carry an unlinked long task, so neither plan's own project finish binds. The only
 *   difference left between the two late finishes is the seam.
 *
 * Both answers are read as the engine's exposed plan-frame offsets (working minutes from the data
 * date on the plan calendar). Both worlds share one calendar and one data date, so the offsets are
 * directly comparable, and a start and a finish boundary with no working time between them read as
 * one position, which is what the spec's "N days early/loose" means.
 *
 * **Mirroring the product, line for line, where it matters** (`schedule.service.ts`'s cross-plan
 * branch and `toEngineEdge`, and `cross-plan-dependencies.service.ts`'s write):
 * - the stored cross-plan lag is `lagDays × 1440` whatever the calendar, read back as
 *   `round(lagMinutes / 1440)` (E6), and its lag calendar is not passed (E7);
 * - durations reach the derivation as `round(durationMinutes / 1440)` (E8);
 * - the persisted dates the derivation reads are the engine's own display strings: the placed pair
 *   (`visualEffective*`) forward, the late pair backward;
 * - the in-plan twin resolves `PREDECESSOR` / `SUCCESSOR` to no port when the endpoint inherits
 *   the plan calendar (every activity here does), exactly as `toEngineEdge` receives `undefined`
 *   from `portFor`, and stores the in-plan lag on the lag calendar's hours-per-day.
 *
 * Pure: it imports the engine as `cross-plan-adapter.ts` does and touches no database.
 */

const MINUTES_PER_DAY = 1440;

/** A matrix calendar as the engine port plus its hours-per-day (the day↔minute factor, ADR-0068). */
export interface TwinCalendar {
  port: WorkingTimeCalendar;
  hoursPerDayMinutes: number;
}

/** Build the engine port for one of the matrix's calendars from its shift facts. */
export function twinCalendar(name: MatrixCalendarName): TwinCalendar {
  const shape = MATRIX_CALENDAR_SHAPES[name];
  const working = new Set(shape.workingWeekdays);
  const weekly = Array.from({ length: 7 }, (_, weekday) =>
    working.has(weekday) ? [{ startMinute: shape.open, endMinute: shape.close }] : [],
  );
  return {
    port: buildWorkingTimeCalendar(weekly, []),
    hoursPerDayMinutes: shape.close - shape.open,
  };
}

/** One plan of the twin: its activities and its in-plan edges. */
export interface TwinPlan {
  activities: EngineActivity[];
  edges: EngineEdge[];
}

/** Everything one cell needs, built once. */
export interface CrossPlanTwin {
  cell: CrossPlanMatrixCell;
  dataDate: string;
  calendar: TwinCalendar;
  /** The predecessor's plan (holds `P`). */
  upstream: TwinPlan;
  /** The successor's plan (holds `S`). */
  downstream: TwinPlan;
  /** The one plan holding both ends and the link as an ordinary dependency. */
  single: TwinPlan;
  /** The cross-plan edge as the product stores it (`lagMinutes = lagDays × 1440`, E6). */
  crossEdge: {
    predecessorId: 'P';
    successorId: 'S';
    type: CrossPlanMatrixCell['linkType'];
    storedLagMinutes: number;
    lagCalendar: CrossPlanMatrixCell['lagCalendar'];
  };
  /** The activity whose value the cell measures: `S` forward, `P` backward. */
  subjectId: 'S' | 'P';
}

function task(id: string, days: number, cal: TwinCalendar): EngineActivity {
  return { id, type: 'TASK', durationMinutes: days * cal.hoursPerDayMinutes };
}

function ofType(
  id: string,
  type: 'TASK' | 'FINISH_MILESTONE' | 'START_MILESTONE',
  cal: TwinCalendar,
): EngineActivity {
  return type === 'TASK' ? task(id, MATRIX_TASK_DAYS, cal) : { id, type, durationMinutes: 0 };
}

/** The in-plan edge for the cell's link: lag on its lag calendar's factor, port as `toEngineEdge`. */
function inPlanLink(cell: CrossPlanMatrixCell, cal: TwinCalendar): EngineEdge {
  const twentyFourHour = cell.lagCalendar === 'TWENTY_FOUR_HOUR';
  const factor = twentyFourHour ? MINUTES_PER_DAY : cal.hoursPerDayMinutes;
  return {
    id: 'P->S',
    predecessorId: 'P',
    successorId: 'S',
    type: cell.linkType,
    lagMinutes: cell.lagDays * factor,
    // PREDECESSOR / SUCCESSOR on an inheriting endpoint reach `toEngineEdge` as `undefined`.
    ...(twentyFourHour ? { lagCalendar: allMinutesWorkCalendar } : {}),
  };
}

/** Build both worlds for one cell. See {@link ./cross-plan-matrix} for the geometry. */
export function buildTwin(cell: CrossPlanMatrixCell): CrossPlanTwin {
  const cal = twinCalendar(cell.calendar);
  const crossEdge = {
    predecessorId: 'P' as const,
    successorId: 'S' as const,
    type: cell.linkType,
    storedLagMinutes: cell.lagDays * MINUTES_PER_DAY,
    lagCalendar: cell.lagCalendar,
  };
  const link = inPlanLink(cell, cal);

  if (cell.direction === 'forward') {
    const anchor = task('A', FORWARD_ANCHOR_DAYS, cal);
    const predecessor = ofType('P', cell.remoteType, cal);
    const successor = ofType('S', cell.localType, cal);
    const anchorEdge: EngineEdge = {
      id: 'A->P',
      predecessorId: 'A',
      successorId: 'P',
      type: 'FS',
      lagMinutes: 0,
    };
    return {
      cell,
      dataDate: MATRIX_DATA_DATE,
      calendar: cal,
      upstream: { activities: [anchor, predecessor], edges: [anchorEdge] },
      downstream: { activities: [successor], edges: [] },
      single: { activities: [anchor, predecessor, successor], edges: [anchorEdge, link] },
      crossEdge,
      subjectId: 'S',
    };
  }

  const predecessor = ofType('P', cell.localType, cal);
  const successor: EngineActivity = {
    ...ofType('S', cell.remoteType, cal),
    constraintType: 'FNLT',
    constraintDate: BACKWARD_SUCCESSOR_FNLT,
  };
  const longUpstream = task('L', LONG_TASK_DAYS, cal);
  const longDownstream = task('L2', LONG_TASK_DAYS, cal);
  return {
    cell,
    dataDate: MATRIX_DATA_DATE,
    calendar: cal,
    upstream: { activities: [predecessor, longUpstream], edges: [] },
    downstream: { activities: [successor, longDownstream], edges: [] },
    single: { activities: [predecessor, longUpstream, successor], edges: [link] },
    crossEdge,
    subjectId: 'P',
  };
}

function run(twin: CrossPlanTwin, plan: TwinPlan): EngineOutput {
  return computeSchedule(plan.activities, plan.edges, {
    dataDate: twin.dataDate,
    calendar: twin.calendar.port,
  });
}

function resultOf(output: EngineOutput, id: string): EngineResult {
  const result = output.results.find((r) => r.activityId === id);
  if (!result) throw new Error(`the twin computed no row for "${id}"`);
  return result;
}

/** The inputs `schedule.service.ts` builds before calling the derivation, for one plan's activities. */
function serviceInputs(plan: TwinPlan): {
  m1: Map<string, M1ExternalInstant>;
  durationDaysByActivity: Map<string, number>;
} {
  return {
    // No hand-entered M1 column anywhere in the matrix; the service still builds an entry per row.
    m1: new Map(
      plan.activities.map((a) => [a.id, { externalEarlyStart: null, externalLateFinish: null }]),
    ),
    durationDaysByActivity: new Map(
      plan.activities.map((a) => [a.id, Math.round(a.durationMinutes / MINUTES_PER_DAY)]),
    ),
  };
}

/** Feed the derived external columns onto a plan's activities, as `toEngineActivity` does. */
function withDerived(
  plan: TwinPlan,
  derived: ReturnType<typeof deriveExternalInstants>['derived'],
): TwinPlan {
  return {
    edges: plan.edges,
    activities: plan.activities.map((activity) => {
      const d = derived.get(activity.id);
      return d
        ? {
            ...activity,
            externalEarlyStart: d.externalEarlyStart,
            externalLateFinish: d.externalLateFinish,
          }
        : activity;
    }),
  };
}

/** What one cell produced on today's code. */
export interface TwinObservation {
  /** The single-plan answer, as a plan-frame offset (working minutes from the data date). */
  inPlanOffset: number;
  /** The two-plan answer, the same way. */
  crossPlanOffset: number;
  /** `crossPlanOffset − inPlanOffset` in working days on the cell's calendar. */
  disagreementDays: number;
  /** The bare date today's derivation handed the engine. */
  derivedDate: string | null;
  /** The display dates the two answers print as (early start forward, late finish backward). */
  inPlanDate: string;
  crossPlanDate: string;
}

/**
 * Run one cell on **today's** derivation. M2-T6 keeps the builder and replaces this comparison
 * with FC-1's equality over the fixed derivation.
 */
export function runTwinToday(cell: CrossPlanMatrixCell): TwinObservation {
  const twin = buildTwin(cell);
  const lagDays = Math.round(twin.crossEdge.storedLagMinutes / MINUTES_PER_DAY);
  const single = resultOf(run(twin, twin.single), twin.subjectId);

  if (cell.direction === 'forward') {
    const predecessor = resultOf(run(twin, twin.upstream), 'P');
    const incoming: IncomingCrossPlanEdge = {
      successorActivityId: 'S',
      type: twin.crossEdge.type,
      lagDays,
      predecessorPlacedStart: predecessor.visualEffectiveStart,
      predecessorPlacedFinish: predecessor.visualEffectiveFinish,
    };
    const { derived } = deriveExternalInstants({
      incoming: [incoming],
      outgoing: [],
      ...serviceInputs(twin.downstream),
    });
    const successor = resultOf(run(twin, withDerived(twin.downstream, derived)), 'S');
    return observe(
      twin,
      single.earlyStartOffset,
      successor.earlyStartOffset,
      derived.get('S')?.externalEarlyStart ?? null,
      single.earlyStart,
      successor.earlyStart,
    );
  }

  const successor = resultOf(run(twin, twin.downstream), 'S');
  const outgoing: OutgoingCrossPlanEdge = {
    predecessorActivityId: 'P',
    type: twin.crossEdge.type,
    lagDays,
    successorLateStart: successor.lateStart,
    successorLateFinish: successor.lateFinish,
  };
  const { derived } = deriveExternalInstants({
    incoming: [],
    outgoing: [outgoing],
    ...serviceInputs(twin.upstream),
  });
  const predecessor = resultOf(run(twin, withDerived(twin.upstream, derived)), 'P');
  return observe(
    twin,
    single.lateFinishOffset,
    predecessor.lateFinishOffset,
    derived.get('P')?.externalLateFinish ?? null,
    single.lateFinish,
    predecessor.lateFinish,
  );
}

function observe(
  twin: CrossPlanTwin,
  inPlanOffset: number,
  crossPlanOffset: number,
  derivedDate: string | null,
  inPlanDate: string,
  crossPlanDate: string,
): TwinObservation {
  return {
    inPlanOffset,
    crossPlanOffset,
    disagreementDays: (crossPlanOffset - inPlanOffset) / twin.calendar.hoursPerDayMinutes,
    derivedDate,
    inPlanDate,
    crossPlanDate,
  };
}
