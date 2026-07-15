import type {
  ConformanceFixture,
  FixtureActivity,
  FixtureRelationship,
} from '@repo/engine-conformance';

import { allMinutesWorkCalendar } from '../engine';
import type { ComputeOptions, EngineActivity, EngineEdge } from '../engine';

import { mapActivityType, mapConstraintType, toCalendarDay } from './type-map';

/**
 * The **differential adapter** (ADR-0034 §7): maps the P6-class conformance
 * fixture onto the inputs today's day-granular engine can actually consume, and
 * — the whole point — **reports every place it had to skip or approximate rather
 * than faking a value**. What today's engine cannot represent (hour durations,
 * per-activity shift calendars, progress/actuals, resource-dependent/LOE/summary
 * activities, secondary constraints, per-relationship lag calendars) is recorded,
 * not invented (ADR-0034 §2–§3).
 *
 * Because the fixture is P6-class and today's engine is integer-working-day with
 * a single plan calendar and no progress, the adapted network is an **honest
 * degradation**: it schedules structurally (a big real network exercising all
 * four relationship kinds), but its *dates are not a golden* — the report's
 * `approximations` list says why. First-principles date goldens live in
 * `goldens.ts`; this adapter is the structural-regression + gap-map half.
 */

/** The hours/day of the fixture's default calendar (CAL-01, 8h) used to degrade hour lags to days. */
const DEFAULT_HOURS_PER_DAY = 8;

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
    | 'lag-calendar-dropped';
  reason: string;
}

/** The classification + degradation summary produced alongside the engine inputs. */
export interface AdaptationReport {
  /** The data date the network was adapted against (`YYYY-MM-DD`). */
  dataDate: string;
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
}

/**
 * Adapt the fixture into the supported engine subset. Unsupported activities are
 * **excluded** (and every relationship touching them dropped, so the graph stays
 * a valid DAG — the engine throws on an edge to an unknown node); supported ones
 * carry rounded whole-day durations and mapped constraints. Progress/actuals are
 * ignored (the engine has no progress model yet), which is why the only faithful
 * anchor is the unprogressed baseline.
 */
export function adaptFixture(fixture: ConformanceFixture, opts: AdaptOptions = {}): AdaptedNetwork {
  const dataDate = opts.dataDate ?? toCalendarDay(fixture.project.planned_start);
  const notes: AdaptationNote[] = [];

  const supportedIds = new Set<string>();
  const activities: EngineActivity[] = [];
  for (const activity of fixture.activities) {
    const adapted = adaptActivity(activity, notes);
    if (adapted) {
      supportedIds.add(activity.id);
      activities.push(adapted);
    }
  }

  const edges: EngineEdge[] = [];
  let excludedRelationships = 0;
  for (const rel of fixture.relationships) {
    const adapted = adaptRelationship(rel, supportedIds, notes);
    if (adapted) edges.push(adapted);
    else excludedRelationships += 1;
  }

  const report: AdaptationReport = {
    dataDate,
    supportedActivities: activities.length,
    excludedActivities: fixture.activities.length - activities.length,
    supportedRelationships: edges.length,
    excludedRelationships,
    approximations: [
      'per-activity shift/24h/window calendars collapsed to an all-days-work calendar (ADR-0036, M1)',
      'hour durations collapsed to whole working days (ADR-0036, M1)',
      `hour lags converted to whole days at ${DEFAULT_HOURS_PER_DAY}h/day (ADR-0036, M1)`,
      'progress, actuals, suspend/resume and the data-date floor are ignored (ADR-0035 §1–§6, M2)',
      'the calendar time-of-day on every date is discarded (ADR-0036, M1)',
    ],
    notes,
  };

  return { activities, edges, options: { dataDate, calendar: allMinutesWorkCalendar }, report };
}

/** Adapt one activity, or return null (with a note) if its type is unsupported. */
function adaptActivity(activity: FixtureActivity, notes: AdaptationNote[]): EngineActivity | null {
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

  // Milestones are zero-duration; tasks take the fixture's whole-day display,
  // rounded (a handful of fixture tasks carry a fractional day display).
  let durationDays = 0;
  if (!isMilestone) {
    const display = activity.original_duration_days_display;
    durationDays = Math.round(display);
    if (durationDays !== display) {
      notes.push({
        entity: 'activity',
        id: activity.id,
        kind: 'duration-rounded',
        reason: `${display}d display rounded to ${durationDays} working days (hours restored in M1)`,
      });
    }
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
    durationMinutes: durationDays * 1440,
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

  const lagDays = Math.round(rel.lag_h / DEFAULT_HOURS_PER_DAY);
  if (lagDays !== rel.lag_h / DEFAULT_HOURS_PER_DAY) {
    notes.push({
      entity: 'relationship',
      id: rel.id,
      kind: 'lag-rounded',
      reason: `${rel.lag_h}h lag rounded to ${lagDays} working days (hour lag restored in M1)`,
    });
  }
  if (rel.lag_calendar) {
    notes.push({
      entity: 'relationship',
      id: rel.id,
      kind: 'lag-calendar-dropped',
      reason: `lag calendar "${rel.lag_calendar}" ignored; single-calendar lag (ADR-0036 §6, M3)`,
    });
  }

  return {
    id: rel.id,
    predecessorId: rel.predecessor,
    successorId: rel.successor,
    type: rel.type,
    lagMinutes: lagDays * 1440,
  };
}
