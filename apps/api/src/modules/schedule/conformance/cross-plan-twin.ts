import type { LagCalendarSource } from '@prisma/client';

import {
  crossPlanLagCalendarId,
  type CrossPlanEndpointCalendarFacts,
} from '../../cross-plan-dependencies/cross-plan-lag-calendar';
import {
  deriveExternalInstants,
  type CrossPlanLocalActivity,
  type CrossPlanRemoteEndpoint,
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
 * **The #385 twin: one link built twice, across two plans and inside one** (plan M0-T1 step 2,
 * inverted to FC-1 at M2-T6).
 *
 * For one matrix cell it builds a two-plan programme (an upstream plan, a downstream plan and one
 * cross-plan edge) and a single-plan twin holding the same activities and the same link as an
 * ordinary dependency. Both run through the real, unchanged engine. The cross-plan side goes
 * through the real {@link deriveExternalInstants}, fed exactly as `schedule.service.ts`'s
 * cross-plan branch feeds it, so the twin measures the rule the product runs.
 *
 * **What it compares, and why that and not a late finish** (the plan's backward-twin risk):
 * - forward, the successor's early start. The downstream plan holds only the successor, so its early
 *   start is the derived bound and nothing else.
 * - backward, the predecessor's late finish. Both worlds pin the successor with the same `FNLT`, and
 *   both plans carry an unlinked long task, so neither plan's own project finish binds. The only
 *   difference left between the two late finishes is the seam.
 *
 * Both answers are read as the engine's exposed plan-frame offsets (working minutes from the data
 * date on the plan calendar), to the minute (spec FC-1). That is only a comparison if the SUBJECT
 * sits on its plan's calendar in both worlds, so the single plan takes **the subject's plan's
 * calendar** and the other endpoint carries its own calendar when the two differ (the mixed-calendar
 * axis). Both worlds share one data date.
 *
 * **Mirroring the product, line for line, where it matters** (`schedule.service.ts`'s cross-plan
 * branch and `toEngineEdge`, and `cross-plan-dependencies.service.ts`'s write):
 * - the cross-plan lag's calendar is decided by `crossPlanLagCalendarId`, and it is stored as
 *   `lagDays × that calendar's hours-per-day` (1440 for `TWENTY_FOUR_HOUR` or no calendar);
 * - the derivation receives lags in working minutes, the remote endpoint's type, duration, scheduling
 *   port and plan data date, and the local activity's type, duration and port;
 * - the persisted dates the derivation reads are the engine's own display strings: the placed pair
 *   (`visualEffective*`) forward, the late pair backward;
 * - the in-plan link names the calendar the cell's source means, **written by hand here and not
 *   read from the product's rule** (so a defect in the rule moves one world and not both), spelled
 *   as an in-plan source: `PROJECT_DEFAULT` when that is the single plan's calendar, otherwise the
 *   endpoint whose own calendar it is, which `toEngineEdge` receives as that endpoint's port
 *   (`portFor`). The in-plan lag is stored on that calendar's hours-per-day.
 *
 * Why the in-plan spelling may differ from the cross-plan one: cross-plan `PROJECT_DEFAULT` means the
 * **successor's plan's** calendar (CQ-2). In the backward twin the single plan is the predecessor's,
 * so the successor's plan's calendar is, inside one plan, the successor's own calendar. Writing the
 * in-plan link as `PROJECT_DEFAULT` there would compare two different calendars and prove nothing.
 * When both plans share a calendar (the original 1,728-cell matrix) every spelling collapses to the
 * source the cell names.
 *
 * Pure: it imports the engine as `cross-plan-adapter.ts` does and touches no database.
 */

const MINUTES_PER_DAY = 1440;

/** A matrix calendar as the engine port plus its hours-per-day (the day↔minute factor, ADR-0068). */
export interface TwinCalendar {
  name: MatrixCalendarName;
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
    name,
    port: buildWorkingTimeCalendar(weekly, []),
    hoursPerDayMinutes: shape.close - shape.open,
  };
}

/** One plan of the twin: its calendar, its activities and its in-plan edges. */
export interface TwinPlan {
  calendar: TwinCalendar;
  activities: EngineActivity[];
  edges: EngineEdge[];
}

/** The calendars a twin's two plans sit on. Equal for every cell of the original matrix. */
export interface TwinCalendars {
  upstream: MatrixCalendarName;
  downstream: MatrixCalendarName;
}

/** Everything one cell needs, built once. */
export interface CrossPlanTwin {
  cell: CrossPlanMatrixCell;
  dataDate: string;
  /** The predecessor's plan (holds `P`). */
  upstream: TwinPlan;
  /** The successor's plan (holds `S`). */
  downstream: TwinPlan;
  /** The one plan holding both ends and the link as an ordinary dependency. */
  single: TwinPlan;
  /** The cross-plan edge as the product stores it. */
  crossEdge: {
    predecessorId: 'P';
    successorId: 'S';
    type: CrossPlanMatrixCell['linkType'];
    storedLagMinutes: number;
    lagCalendar: WorkingTimeCalendar;
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

/** An activity placed in the single plan: its own calendar only when it is not the plan's. */
function inSingle(activity: EngineActivity, own: TwinCalendar, plan: TwinCalendar): EngineActivity {
  return own.name === plan.name ? activity : { ...activity, calendar: own.port };
}

/**
 * The cross-plan lag calendar, decided by the product's rule. The two endpoints each inherit their
 * own plan's calendar (the matrix gives no activity a calendar of its own in the two-plan world), so
 * the synthetic ids are the plans'.
 */
function crossPlanLagCalendar(
  source: LagCalendarSource,
  predType: EngineActivity['type'],
  succType: EngineActivity['type'],
  cals: { upstream: TwinCalendar; downstream: TwinCalendar },
): TwinCalendar | null {
  const facts = (
    type: EngineActivity['type'],
    plan: 'upstream' | 'downstream',
  ): CrossPlanEndpointCalendarFacts => ({
    type: type ?? 'TASK',
    calendarId: null,
    drivingCalendarId: null,
    planCalendarId: plan,
  });
  const id = crossPlanLagCalendarId({
    lagCalendar: source,
    predecessor: facts(predType, 'upstream'),
    successor: facts(succType, 'downstream'),
  });
  if (id === null) return null;
  return id === 'upstream' ? cals.upstream : cals.downstream;
}

/**
 * The in-plan link for the cell, naming the same calendar the cross-plan rule chose (see the file
 * docblock), with its lag stored on that calendar's factor and its port as `toEngineEdge` builds it.
 */
function inPlanLink(
  cell: CrossPlanMatrixCell,
  lagCal: TwinCalendar | null,
  single: TwinCalendar,
): EngineEdge {
  const factor = lagCal === null ? MINUTES_PER_DAY : lagCal.hoursPerDayMinutes;
  const port =
    lagCal === null
      ? allMinutesWorkCalendar
      : lagCal.name === single.name
        ? undefined
        : lagCal.port;
  return {
    id: 'P->S',
    predecessorId: 'P',
    successorId: 'S',
    type: cell.linkType,
    lagMinutes: cell.lagDays * factor,
    ...(port ? { lagCalendar: port } : {}),
  };
}

/**
 * Build both worlds for one cell. See {@link ./cross-plan-matrix} for the geometry. `cals` defaults
 * to the cell's one calendar for both plans (the original matrix); the mixed-calendar axis passes two.
 */
export function buildTwin(
  cell: CrossPlanMatrixCell,
  cals: TwinCalendars = { upstream: cell.calendar, downstream: cell.calendar },
): CrossPlanTwin {
  const up = twinCalendar(cals.upstream);
  const down = twinCalendar(cals.downstream);
  const forward = cell.direction === 'forward';
  const predType = forward ? cell.remoteType : cell.localType;
  const succType = forward ? cell.localType : cell.remoteType;
  const lagCal = crossPlanLagCalendar(cell.lagCalendar, predType, succType, {
    upstream: up,
    downstream: down,
  });
  // The in-plan side names its calendar by hand, NOT through the rule above, or a defect in the
  // rule would move both worlds together and the twin would agree with itself (spec D2's caveat).
  // CQ-2: PROJECT_DEFAULT is the successor's plan's calendar; an endpoint source is that endpoint's.
  const referenceLagCal: TwinCalendar | null =
    cell.lagCalendar === 'TWENTY_FOUR_HOUR' ? null : cell.lagCalendar === 'PREDECESSOR' ? up : down;
  const crossEdge = {
    predecessorId: 'P' as const,
    successorId: 'S' as const,
    type: cell.linkType,
    storedLagMinutes:
      cell.lagDays * (lagCal === null ? MINUTES_PER_DAY : lagCal.hoursPerDayMinutes),
    lagCalendar: lagCal === null ? allMinutesWorkCalendar : lagCal.port,
  };

  if (forward) {
    // The single plan is the successor's (the subject's), so it takes the downstream calendar.
    const single = down;
    const anchor = task('A', FORWARD_ANCHOR_DAYS, up);
    const predecessor = ofType('P', cell.remoteType, up);
    const successor = ofType('S', cell.localType, down);
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
      upstream: { calendar: up, activities: [anchor, predecessor], edges: [anchorEdge] },
      downstream: { calendar: down, activities: [successor], edges: [] },
      single: {
        calendar: single,
        activities: [inSingle(anchor, up, single), inSingle(predecessor, up, single), successor],
        edges: [anchorEdge, inPlanLink(cell, referenceLagCal, single)],
      },
      crossEdge,
      subjectId: 'S',
    };
  }

  // Backward: the single plan is the predecessor's (the subject's), on the upstream calendar.
  const single = up;
  const predecessor = ofType('P', cell.localType, up);
  const successor: EngineActivity = {
    ...ofType('S', cell.remoteType, down),
    constraintType: 'FNLT',
    constraintDate: BACKWARD_SUCCESSOR_FNLT,
  };
  const longUpstream = task('L', LONG_TASK_DAYS, up);
  const longDownstream = task('L2', LONG_TASK_DAYS, down);
  return {
    cell,
    dataDate: MATRIX_DATA_DATE,
    upstream: { calendar: up, activities: [predecessor, longUpstream], edges: [] },
    downstream: { calendar: down, activities: [successor, longDownstream], edges: [] },
    single: {
      calendar: single,
      activities: [predecessor, longUpstream, inSingle(successor, down, single)],
      edges: [inPlanLink(cell, referenceLagCal, single)],
    },
    crossEdge,
    subjectId: 'P',
  };
}

function run(twin: CrossPlanTwin, plan: TwinPlan): EngineOutput {
  return computeSchedule(plan.activities, plan.edges, {
    dataDate: twin.dataDate,
    calendar: plan.calendar.port,
  });
}

function resultOf(output: EngineOutput, id: string): EngineResult {
  const result = output.results.find((r) => r.activityId === id);
  if (!result) throw new Error(`the twin computed no row for "${id}"`);
  return result;
}

/** A remote endpoint as `schedule.service.ts` hands it to the derivation. */
function remoteOf(twin: CrossPlanTwin, plan: TwinPlan, id: 'P' | 'S'): CrossPlanRemoteEndpoint {
  const activity = plan.activities.find((a) => a.id === id)!;
  return {
    type: activity.type ?? 'TASK',
    durationMinutes: activity.durationMinutes,
    calendar: plan.calendar.port,
    dataDate: twin.dataDate,
  };
}

/** The inputs `schedule.service.ts` builds before calling the derivation, for one plan's activities. */
function serviceInputs(
  twin: CrossPlanTwin,
  plan: TwinPlan,
): {
  m1: Map<string, M1ExternalInstant>;
  activities: Map<string, CrossPlanLocalActivity>;
  dataDate: string;
} {
  return {
    // No hand-entered M1 column anywhere in the matrix; the service still builds an entry per row.
    m1: new Map(
      plan.activities.map((a) => [a.id, { externalEarlyStart: null, externalLateFinish: null }]),
    ),
    activities: new Map(
      plan.activities.map((a) => [
        a.id,
        {
          type: a.type ?? 'TASK',
          durationMinutes: a.durationMinutes,
          calendar: plan.calendar.port,
        },
      ]),
    ),
    dataDate: twin.dataDate,
  };
}

/** Feed the derived external columns onto a plan's activities, as `toEngineActivity` does. */
function withDerived(
  plan: TwinPlan,
  derived: ReturnType<typeof deriveExternalInstants>['derived'],
): TwinPlan {
  return {
    calendar: plan.calendar,
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

/** What one cell produced. */
export interface TwinObservation {
  /** The single-plan answer, as a plan-frame offset (working minutes from the data date). */
  inPlanOffset: number;
  /** The two-plan answer, the same way. */
  crossPlanOffset: number;
  /** `crossPlanOffset − inPlanOffset` in working days on the subject's calendar. */
  disagreementDays: number;
  /** The external value the derivation handed the engine. */
  derivedValue: string | null;
  /** The display dates the two answers print as (early start forward, late finish backward). */
  inPlanDate: string;
  crossPlanDate: string;
}

/** Run one cell on the derivation the product runs. */
export function runTwin(cell: CrossPlanMatrixCell, cals?: TwinCalendars): TwinObservation {
  const twin = buildTwin(cell, cals);
  const single = resultOf(run(twin, twin.single), twin.subjectId);

  if (cell.direction === 'forward') {
    const predecessor = resultOf(run(twin, twin.upstream), 'P');
    const incoming: IncomingCrossPlanEdge = {
      successorActivityId: 'S',
      type: twin.crossEdge.type,
      lagMinutes: twin.crossEdge.storedLagMinutes,
      lagCalendar: twin.crossEdge.lagCalendar,
      predecessor: remoteOf(twin, twin.upstream, 'P'),
      predecessorPlacedStart: predecessor.visualEffectiveStart,
      predecessorPlacedFinish: predecessor.visualEffectiveFinish,
    };
    const { derived } = deriveExternalInstants({
      incoming: [incoming],
      outgoing: [],
      ...serviceInputs(twin, twin.downstream),
    });
    const successor = resultOf(run(twin, withDerived(twin.downstream, derived)), 'S');
    return observe(
      twin.downstream.calendar,
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
    lagMinutes: twin.crossEdge.storedLagMinutes,
    lagCalendar: twin.crossEdge.lagCalendar,
    successor: remoteOf(twin, twin.downstream, 'S'),
    successorLateStart: successor.lateStart,
    successorLateFinish: successor.lateFinish,
  };
  const { derived } = deriveExternalInstants({
    incoming: [],
    outgoing: [outgoing],
    ...serviceInputs(twin, twin.upstream),
  });
  const predecessor = resultOf(run(twin, withDerived(twin.upstream, derived)), 'P');
  return observe(
    twin.upstream.calendar,
    single.lateFinishOffset,
    predecessor.lateFinishOffset,
    derived.get('P')?.externalLateFinish ?? null,
    single.lateFinish,
    predecessor.lateFinish,
  );
}

function observe(
  subjectCalendar: TwinCalendar,
  inPlanOffset: number,
  crossPlanOffset: number,
  derivedValue: string | null,
  inPlanDate: string,
  crossPlanDate: string,
): TwinObservation {
  return {
    inPlanOffset,
    crossPlanOffset,
    disagreementDays: (crossPlanOffset - inPlanOffset) / subjectCalendar.hoursPerDayMinutes,
    derivedValue,
    inPlanDate,
    crossPlanDate,
  };
}
