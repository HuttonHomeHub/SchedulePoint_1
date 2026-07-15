import type {
  ConformanceFixture,
  FixtureActivity,
  FixtureCalendar,
  FixtureRelationship,
} from '@repo/engine-conformance';

import { allMinutesWorkCalendar, buildWorkingTimeCalendar } from '../engine';
import type {
  ComputeOptions,
  EngineActivity,
  EngineEdge,
  ShiftWindow,
  TimeException,
  WeeklyPattern,
  WorkingTimeCalendar,
} from '../engine';

import { mapActivityType, mapConstraintType, toCalendarDay } from './type-map';

/**
 * The **differential adapter** (ADR-0034 §7): maps the P6-class conformance
 * fixture onto the inputs today's engine can actually consume, and — the whole
 * point — **reports every place it had to skip or approximate rather than faking a
 * value** (ADR-0034 §2–§3). What the engine still cannot represent
 * (progress/actuals, resource-dependent/LOE/summary activities, secondary
 * constraints, per-relationship lag calendars, per-activity calendars) is
 * recorded, not invented.
 *
 * Since M1 (ADR-0036) the engine computes in working-**minutes** over intraday
 * shift calendars, so the adapter now feeds the fixture's **hour** durations/lags
 * faithfully (× 60) and builds the project's **default calendar** as a real
 * `WorkingTimeCalendar` — the hour durations land on genuine working time, not a
 * 24/7 line. **Per-activity** calendars remain M5: the whole network is scheduled
 * on the single default calendar, and any activity assigned to a different one is
 * noted (not silently mis-scheduled). Its *dates are still a degradation*, not a
 * golden (progress and per-activity calendars are missing); the report's
 * `approximations` list says why. First-principles date goldens live in
 * `goldens.ts`; this adapter is the structural-regression + gap-map half.
 */

/** One thing the adapter had to drop or approximate, with the reason (for the report + tests). */
export interface AdaptationNote {
  entity: 'activity' | 'relationship';
  id: string;
  kind:
    | 'type-unsupported'
    | 'duration-rounded'
    | 'constraint-dropped'
    | 'secondary-constraint-dropped'
    | 'progress-ignored'
    | 'endpoint-excluded'
    | 'lag-rounded'
    | 'lag-calendar-dropped'
    | 'activity-calendar-substituted';
  reason: string;
}

/** The classification + degradation summary produced alongside the engine inputs. */
export interface AdaptationReport {
  /** The data date the network was adapted against (`YYYY-MM-DD`). */
  dataDate: string;
  /** The project default calendar the whole network was scheduled on. */
  planCalendarId: string;
  supportedActivities: number;
  excludedActivities: number;
  supportedRelationships: number;
  excludedRelationships: number;
  /** Plan-wide fidelity losses that apply to the whole run, in plain English. */
  approximations: string[];
  /** Per-row skips/approximations (deterministic order: activities then relationships). */
  notes: AdaptationNote[];
}

/** The adapted, engine-ready network plus the honesty report. */
export interface AdaptedNetwork {
  activities: EngineActivity[];
  edges: EngineEdge[];
  options: ComputeOptions;
  report: AdaptationReport;
}

export interface AdaptOptions {
  /**
   * The data date (`YYYY-MM-DD`) offset-0 anchor. Defaults to the fixture
   * project's planned start (the S01 baseline anchor) — the only scenario today's
   * progress-free engine can represent.
   */
  dataDate?: string;
  /**
   * Honour each relationship's per-edge lag calendar (ADR-0036 §6, M3). Default **true**
   * (the faithful mapping). When `false` the lag is measured on the plan calendar and the
   * override is noted — the S01 baseline, so `resultsDiffer(S06, S01)` proves the 24-Hour
   * lag actually moved dates. Only `24H` (→ elapsed `allMinutesWorkCalendar`) is distinct
   * today; a Predecessor/Successor calendar needs per-activity calendars (M5).
   */
  honorLagCalendars?: boolean;
}

const MINUTES_PER_HOUR = 60;
const WEEKDAY_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

/** Normalise a fixture `lag_calendar` string to a `LagCalendarSource`, or null if unmappable. */
function normaliseLagCalendar(value: string): 'TWENTY_FOUR_HOUR' | null {
  const upper = value.trim().toUpperCase();
  if (upper === '24H' || upper === '24_HOUR' || upper === '24HOUR') return 'TWENTY_FOUR_HOUR';
  return null;
}

/**
 * Adapt the fixture into the supported engine subset. Unsupported activities are
 * **excluded** (and every relationship touching them dropped, so the graph stays a
 * valid DAG — the engine throws on an edge to an unknown node); supported ones
 * carry minute-precise hour durations and mapped constraints, scheduled on the
 * project default calendar built as a real shift calendar. Progress/actuals are
 * ignored (the engine has no progress model yet), which is why the only faithful
 * anchor is the unprogressed baseline.
 */
export function adaptFixture(fixture: ConformanceFixture, opts: AdaptOptions = {}): AdaptedNetwork {
  const dataDate = opts.dataDate ?? toCalendarDay(fixture.project.planned_start);
  const honorLagCalendars = opts.honorLagCalendars ?? true;
  const notes: AdaptationNote[] = [];

  const defaultCalendarId = fixture.project.default_calendar;
  const defaultCalendar = fixture.calendars.find((c) => c.id === defaultCalendarId);
  const calendar = defaultCalendar
    ? fixtureCalendarToWorkingTime(defaultCalendar)
    : allMinutesWorkCalendar;

  const supportedIds = new Set<string>();
  const activities: EngineActivity[] = [];
  for (const activity of fixture.activities) {
    const adapted = adaptActivity(activity, defaultCalendarId, notes);
    if (adapted) {
      supportedIds.add(activity.id);
      activities.push(adapted);
    }
  }

  const edges: EngineEdge[] = [];
  let excludedRelationships = 0;
  for (const rel of fixture.relationships) {
    const adapted = adaptRelationship(rel, supportedIds, honorLagCalendars, notes);
    if (adapted) edges.push(adapted);
    else excludedRelationships += 1;
  }

  const report: AdaptationReport = {
    dataDate,
    planCalendarId: defaultCalendarId,
    supportedActivities: activities.length,
    excludedActivities: fixture.activities.length - activities.length,
    supportedRelationships: edges.length,
    excludedRelationships,
    approximations: [
      `every activity is scheduled on the project default calendar ${defaultCalendarId}; per-activity shift/24h/window calendars are not applied (ADR-0024/ADR-0036, M5)`,
      'progress, actuals, suspend/resume and the data-date floor are ignored (ADR-0035 §1–§6, M2)',
      honorLagCalendars
        ? 'the 24-Hour per-relationship lag calendar is honoured (elapsed lag); Predecessor/Successor lag calendars coincide with the plan calendar until per-activity calendars (ADR-0036 §6, M5)'
        : 'per-relationship lag calendars are ignored; lag is measured on the plan calendar (ADR-0036 §6, M3)',
      'the data date and constraint dates are taken at day granularity (the shift calendar restores intraday working time within the day)',
    ],
    notes,
  };

  return { activities, edges, options: { dataDate, calendar }, report };
}

/** `"HH:MM"` (end may be `"24:00"`) → minutes-of-day in `[0, 1440]`. */
function toMinuteOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * MINUTES_PER_HOUR + Number(m);
}

/** One fixture work window `["HH:MM", "HH:MM"]` → an engine `[startMinute, endMinute)` window. */
function toShiftWindow(window: readonly [string, string]): ShiftWindow {
  return { startMinute: toMinuteOfDay(window[0]), endMinute: toMinuteOfDay(window[1]) };
}

/**
 * Build a real minute-granular `WorkingTimeCalendar` from a fixture calendar's
 * intraday workweek + dated exceptions (ADR-0036). This is what lets the adapter
 * schedule the fixture's HOUR durations on genuine working time rather than
 * collapsing them to whole days.
 */
function fixtureCalendarToWorkingTime(cal: FixtureCalendar): WorkingTimeCalendar {
  const weekly = WEEKDAY_KEYS.map((key) => cal.workweek[key].map(toShiftWindow)) as WeeklyPattern;
  const exceptions: TimeException[] = cal.exceptions.flatMap((exception) => {
    const range =
      exception.date_range ?? (exception.date ? [exception.date, exception.date] : null);
    if (!range) return [];
    return [
      {
        startDate: range[0].slice(0, 10),
        endDate: range[1].slice(0, 10),
        windows: exception.work.map(toShiftWindow),
      },
    ];
  });
  return buildWorkingTimeCalendar(weekly, exceptions);
}

/** Adapt one activity, or return null (with a note) if its type is unsupported. */
function adaptActivity(
  activity: FixtureActivity,
  defaultCalendarId: string,
  notes: AdaptationNote[],
): EngineActivity | null {
  const typeResult = mapActivityType(activity.activity_type);
  if (!typeResult.supported) {
    notes.push({
      entity: 'activity',
      id: activity.id,
      kind: 'type-unsupported',
      reason: typeResult.reason,
    });
    return null;
  }
  const type = typeResult.value;
  const isMilestone = type === 'START_MILESTONE' || type === 'FINISH_MILESTONE';

  // Milestones are zero-duration; tasks take the fixture's ORIGINAL HOUR duration
  // converted to working minutes (× 60) — exact for whole/part-hour durations, with
  // a note only in the rare sub-minute case.
  let durationMinutes = 0;
  if (!isMilestone) {
    const exact = activity.original_duration_h * MINUTES_PER_HOUR;
    durationMinutes = Math.round(exact);
    if (durationMinutes !== exact) {
      notes.push({
        entity: 'activity',
        id: activity.id,
        kind: 'duration-rounded',
        reason: `${activity.original_duration_h}h rounded to ${durationMinutes} working minutes`,
      });
    }
  }

  // Per-activity calendars are M5: an activity assigned to a non-default calendar is
  // still scheduled on the plan (default) calendar — noted, never silently applied.
  if (activity.calendar !== defaultCalendarId) {
    notes.push({
      entity: 'activity',
      id: activity.id,
      kind: 'activity-calendar-substituted',
      reason: `assigned calendar ${activity.calendar} scheduled on the plan default ${defaultCalendarId} (per-activity calendars are M5)`,
    });
  }

  if (activity.status !== 'NOT_STARTED') {
    notes.push({
      entity: 'activity',
      id: activity.id,
      kind: 'progress-ignored',
      reason: `status ${activity.status}: progress/actuals ignored (engine has no progress model, M2)`,
    });
  }

  const engineActivity: EngineActivity = {
    id: activity.id,
    durationMinutes,
    type,
  };

  if (activity.secondary_constraint) {
    notes.push({
      entity: 'activity',
      id: activity.id,
      kind: 'secondary-constraint-dropped',
      reason: 'engine applies a single constraint; secondary dropped (ADR-0035 §10, M4)',
    });
  }

  const primary = activity.primary_constraint;
  if (primary) {
    const mapped = mapConstraintType(primary.type);
    if (!mapped.supported) {
      notes.push({
        entity: 'activity',
        id: activity.id,
        kind: 'constraint-dropped',
        reason: mapped.reason,
      });
    } else if (primary.date === null) {
      notes.push({
        entity: 'activity',
        id: activity.id,
        kind: 'constraint-dropped',
        reason: `${primary.type} has no date; constraint needs one`,
      });
    } else {
      engineActivity.constraintType = mapped.value;
      engineActivity.constraintDate = toCalendarDay(primary.date);
    }
  }

  return engineActivity;
}

/** Adapt one relationship, or return null (with a note) if an endpoint was excluded. */
function adaptRelationship(
  rel: FixtureRelationship,
  supportedIds: ReadonlySet<string>,
  honorLagCalendars: boolean,
  notes: AdaptationNote[],
): EngineEdge | null {
  if (!supportedIds.has(rel.predecessor) || !supportedIds.has(rel.successor)) {
    notes.push({
      entity: 'relationship',
      id: rel.id,
      kind: 'endpoint-excluded',
      reason: `${rel.predecessor}→${rel.successor}: an endpoint is an unsupported activity type`,
    });
    return null;
  }

  // Lag is the fixture's hours converted to working minutes (× 60), exact for
  // whole/part-hour lags. The lag is measured on the PLAN calendar; a per-relationship
  // lag calendar (e.g. the 24H override) is dropped with a note until M3 wires it.
  const exact = rel.lag_h * MINUTES_PER_HOUR;
  const lagMinutes = Math.round(exact);
  if (lagMinutes !== exact) {
    notes.push({
      entity: 'relationship',
      id: rel.id,
      kind: 'lag-rounded',
      reason: `${rel.lag_h}h lag rounded to ${lagMinutes} working minutes`,
    });
  }
  const edge: EngineEdge = {
    id: rel.id,
    predecessorId: rel.predecessor,
    successorId: rel.successor,
    type: rel.type,
    lagMinutes,
  };

  if (rel.lag_calendar) {
    const source = normaliseLagCalendar(rel.lag_calendar);
    if (honorLagCalendars && source === 'TWENTY_FOUR_HOUR') {
      // Measure this lag as ELAPSED time on the 24/7 calendar (ADR-0036 §6, M3) — the
      // concrete-cure A4430→A4440 FS + 168h case: 7 elapsed days, not 7 working days.
      edge.lagCalendar = allMinutesWorkCalendar;
    } else {
      notes.push({
        entity: 'relationship',
        id: rel.id,
        kind: 'lag-calendar-dropped',
        reason: honorLagCalendars
          ? `lag calendar "${rel.lag_calendar}" not representable; lag measured on the plan calendar (M5)`
          : `lag calendar "${rel.lag_calendar}" ignored; lag measured on the plan calendar (baseline)`,
      });
    }
  }

  return edge;
}
