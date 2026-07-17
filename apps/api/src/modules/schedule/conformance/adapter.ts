import type {
  ConformanceFixture,
  FixtureActivity,
  FixtureCalendar,
  FixtureRelationship,
} from '@repo/engine-conformance';
import type { ConstraintType, DurationType, EditedField } from '@repo/types';

import { resolveTriad } from '../duration-type/resolve-triad';
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

import { mapActivityType, mapConstraintType, mapDurationType, toCalendarDay } from './type-map';

/**
 * The **differential adapter** (ADR-0034 §7): maps the P6-class conformance
 * fixture onto the inputs today's engine can actually consume, and — the whole
 * point — **reports every place it had to skip or approximate rather than faking a
 * value** (ADR-0034 §2–§3). What the engine still cannot represent
 * (external/multi-project relationships) is recorded, not invented — LOE (§21),
 * WBS-summary (§24) and resource-dependent (§23, M7) activities are now scheduled,
 * not skipped (a resource activity on its driving resource's calendar). M4
 * added the advanced constraints — mandatory produce-and-flag,
 * secondary constraints, expected finish and as-late-as-possible — which the
 * adapter now feeds through instead of dropping.
 *
 * M7 rung 4 (ADR-0040) adds an optional `honorDurationTypes` pass: for a UNITS-DRIVEN
 * activity with a driving assignment it resolves `durationMinutes` through the pure
 * `resolveTriad` (`Units ÷ Units/Time`), the same function the write paths use. On this
 * fixture the pass is inert (no duration-type activity has a driving assignment; the
 * durations are self-consistent), so it is proven by first-principles goldens, not a
 * fixture differential — recorded honestly in `approximations`, never faked.
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
    | 'progress-ignored'
    | 'endpoint-excluded'
    | 'lag-rounded'
    | 'lag-calendar-dropped'
    | 'activity-calendar-substituted'
    | 'resource-calendar-substituted'
    | 'resource-driver-missing'
    | 'duration-derived';
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
  /**
   * Attach each activity's own fixture calendar as its engine calendar port (ADR-0037, M5).
   * Default **false** — the S01 baseline schedules the whole network on the plan default
   * calendar (non-default assignments noted), so a scenario that flips this on differs. When
   * **true**, each activity schedules on its own resolved calendar.
   */
  honorActivityCalendars?: boolean;
  /**
   * Substitute each `RESOURCE_DEPENDENT` activity's **driving resource's calendar** as its scheduling
   * calendar (ADR-0035 §23 / ADR-0039, M7). Default **false** — the baseline schedules a resource
   * activity on its own/plan calendar like any other, so a scenario that flips this on differs for the
   * resource activities whose driving resource works a distinct calendar. The driving resource is the
   * assignment tagged `res_driving`; with no driving assignment the activity is flagged
   * `resourceDriverMissing` and falls back to its activity calendar → plan default. Type-gated: a
   * non-resource activity never picks up its assigned resource's calendar (the A5500 contrast).
   */
  honorResourceCalendars?: boolean;
  /**
   * The global "calendar for scheduling relationship lag" setting (fixture S05). `SUCCESSOR`/
   * `PREDECESSOR` resolve a relationship's lag on that endpoint activity's calendar (requires
   * per-activity calendars); `PLAN` (default) measures it on the plan calendar. An explicit
   * per-edge `24H` always wins over this setting.
   */
  relationshipLagCalendar?: 'PLAN' | 'PREDECESSOR' | 'SUCCESSOR';
  /**
   * Feed each activity's progress (actual start/finish, remaining duration) to the engine (M2,
   * ADR-0035). Off by default (the S01 baseline schedules the clean unprogressed network); on for
   * the progressed scenarios (S02/S03/S04), where the caller also sets `dataDate` to the fixture's
   * data date and the recalc `progressMode`.
   */
  honorProgress?: boolean;
  /**
   * Turn on the Expected-Finish scheduling option (M4, ADR-0035 §9). Off by default — the adapter
   * always FEEDS each activity's `expected_finish`, but the engine only acts on it when this is true
   * (the S12 differential flips it on; the baseline leaves it off). See `ComputeOptions`.
   */
  useExpectedFinishDates?: boolean;
  /**
   * Resolve each activity's `durationMinutes` through the pure `resolveTriad` (ADR-0040 / ADR-0035
   * §26/§27, M7 rung 4) instead of taking the fixture's `original_duration_h × 60` verbatim. Default
   * **false** (parity). When **true**, a `FIXED_UNITS` / `FIXED_UNITS_TIME` activity that has a
   * **driving** assignment (`res_driving`) carrying a rate derives its duration from
   * `Units ÷ Units/Time` (the two units-driven types; the other two hold the duration by construction,
   * so the flag is a no-op for them). Only the **driving** assignment participates (ADR-0040 §3), and
   * duration types are a **write-boundary** concern — the engine has no `durationType` field and reads
   * only the resolved `durationMinutes`.
   *
   * **Inert on this fixture (documented, not faked).** None of the fixture's duration-type activities
   * (A4330/A4430/A7100/A7200 units-driven, A3010/A7400 held) carries a `res_driving` assignment, and
   * their units/duration/rate are internally self-consistent (e.g. A7100 `FIXED_UNITS` 300 h; its
   * LAB-PIPE assignment 2 400 u ÷ 8 u/h = 300 h). So deriving reproduces the fixture durations
   * **byte-for-byte** — the same S13/A8300-style capacity/self-consistency the harness is honest about.
   * The capability is proven by the first-principles `resolveTriad` goldens (`goldens.ts`) and the
   * write-path service tests, **not** by a fixture date-differential. Recorded in `approximations`.
   */
  honorDurationTypes?: boolean;
}

const MINUTES_PER_HOUR = 60;
/**
 * The `editedField` whose recompute **derives the duration** for each units-driven type (ADR-0035 §26
 * truth table): `FIXED_UNITS` derives on a rate edit (`D := U/R`), `FIXED_UNITS_TIME` on a units edit
 * (`D := U/R`). The two held types are absent — they never auto-derive the duration.
 */
const DURATION_DERIVING_EDIT: Partial<Record<DurationType, EditedField>> = {
  FIXED_UNITS: 'UNITS_PER_HOUR',
  FIXED_UNITS_TIME: 'UNITS',
};
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
  const honorActivityCalendars = opts.honorActivityCalendars ?? false;
  const honorResourceCalendars = opts.honorResourceCalendars ?? false;
  const honorProgress = opts.honorProgress ?? false;
  const useExpectedFinishDates = opts.useExpectedFinishDates ?? false;
  const honorDurationTypes = opts.honorDurationTypes ?? false;
  const relationshipLagCalendar = opts.relationshipLagCalendar ?? 'PLAN';
  const notes: AdaptationNote[] = [];

  // Driving-resource calendar + units/rate per activity (ADR-0035 §23 / ADR-0039 / ADR-0040, M7). The
  // fixture marks the driving assignment with the `res_driving` test tag (the product carries an
  // explicit `isDriving` flag); resolve it to the resource's own calendar id and capture its units +
  // rate for the duration-type triad. At most one driver per activity, mirroring the DB partial-unique.
  // The calendar is only consulted when `honorResourceCalendars` is on; the units/rate only when
  // `honorDurationTypes` is on.
  const resourceCalById = new Map(fixture.resources.map((r) => [r.id, r.calendar]));
  const drivingResourceCalByActivity = new Map<string, string>();
  const drivingUnitsByActivity = new Map<string, { budgetedUnits: number; unitsPerHour: number }>();
  for (const asg of fixture.assignments) {
    if (!asg.test_tags.includes('res_driving')) continue;
    const resourceCalendarId = resourceCalById.get(asg.resource);
    if (resourceCalendarId !== undefined)
      drivingResourceCalByActivity.set(asg.activity, resourceCalendarId);
    drivingUnitsByActivity.set(asg.activity, {
      budgetedUnits: asg.budgeted_units,
      unitsPerHour: asg.units_per_hour,
    });
  }

  const defaultCalendarId = fixture.project.default_calendar;
  // Build every fixture calendar once (ADR-0037 M5: O(distinct calendars)); the plan default is
  // one of them. An activity/edge that inherits the default gets an undefined port (fast path).
  const portById = new Map<string, WorkingTimeCalendar>();
  for (const cal of fixture.calendars) portById.set(cal.id, fixtureCalendarToWorkingTime(cal));
  const calendar = portById.get(defaultCalendarId) ?? allMinutesWorkCalendar;
  // Window-only calendars (empty base week — the turnaround/crane-hire calendars) work only during
  // a dated window; an activity whose start is pushed past that window has no reachable finish
  // (the ADR-0036 §5 N16 case). Honouring these per-activity needs in-window placement, an
  // M5-epic edge case, so they stay on the plan calendar here (noted, never silently mis-scheduled).
  const windowOnly = new Set(
    fixture.calendars
      .filter((c) => !WEEKDAY_KEYS.some((k) => c.workweek[k].length > 0))
      .map((c) => c.id),
  );
  /** A representable non-default port for a calendar id, or undefined if it inherits the default / is window-only. */
  const portForCal = (calId: string): WorkingTimeCalendar | undefined =>
    calId !== defaultCalendarId && !windowOnly.has(calId) ? portById.get(calId) : undefined;
  /** The activity's own calendar port, gated on `honorActivityCalendars` (the M5 baseline is off). */
  const activityPort = (calId: string): WorkingTimeCalendar | undefined =>
    honorActivityCalendars ? portForCal(calId) : undefined;

  // Build the WBS containment tree (ADR-0035 §24, M5-epic F7) from the fixture's `wbs` code strings.
  // The product carries `parentId` directly; the fixture instead expresses hierarchy through dotted
  // `wbs` codes (`TT.4`, `TT.4.1`), so here each activity's `parentId` is the nearest ANCESTOR summary —
  // the `WBS_SUMMARY` whose `wbs` code is a strict (proper, segment-aligned) prefix of this activity's
  // code, taking the longest such match when summaries nest. Conformance-only; the engine consumes the
  // resulting `parentId` exactly as the product would.
  const summaryWbsCodes = fixture.activities
    .filter((a) => a.activity_type === 'WBS_SUMMARY')
    .map((a) => ({ code: a.wbs, id: a.id }));
  const resolveParentId = (wbsCode: string): string | undefined => {
    let best: { code: string; id: string } | undefined;
    for (const candidate of summaryWbsCodes) {
      // Strict, segment-aligned prefix: `TT.4` is an ancestor of `TT.4.1` but not of `TT.40` (nor of
      // its own equal code). The longest matching ancestor is the NEAREST parent.
      if (
        wbsCode.startsWith(`${candidate.code}.`) &&
        (best === undefined || candidate.code.length > best.code.length)
      ) {
        best = candidate;
      }
    }
    return best?.id;
  };

  const supportedIds = new Set<string>();
  const calIdByActivity = new Map<string, string>();
  const activities: EngineActivity[] = [];
  for (const activity of fixture.activities) {
    const adapted = adaptActivity(activity, {
      defaultCalendarId,
      honorActivityCalendars,
      honorResourceCalendars,
      honorDurationTypes,
      portForCal,
      honorProgress,
      drivingResourceCalId: drivingResourceCalByActivity.get(activity.id),
      drivingUnits: drivingUnitsByActivity.get(activity.id),
      notes,
    });
    if (adapted) {
      const parentId = resolveParentId(activity.wbs);
      if (parentId !== undefined) adapted.parentId = parentId;
      supportedIds.add(activity.id);
      calIdByActivity.set(activity.id, activity.calendar);
      activities.push(adapted);
    }
  }

  const edges: EngineEdge[] = [];
  let excludedRelationships = 0;
  for (const rel of fixture.relationships) {
    const adapted = adaptRelationship(rel, supportedIds, honorLagCalendars, notes, {
      relationshipLagCalendar,
      portFor: (id) => activityPort(calIdByActivity.get(id) ?? defaultCalendarId),
    });
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
      honorActivityCalendars
        ? `each activity schedules on its own resolved calendar (ADR-0037, M5); relationship lag resolves on the ${relationshipLagCalendar.toLowerCase()} calendar`
        : `every activity is scheduled on the project default calendar ${defaultCalendarId}; per-activity shift/24h/window calendars are not applied (ADR-0037, M5 baseline)`,
      honorResourceCalendars
        ? 'each RESOURCE_DEPENDENT activity schedules on its driving resource’s calendar (ADR-0035 §23 / ADR-0039, M7); a driver-less one is flagged and falls back to the plan default'
        : 'RESOURCE_DEPENDENT activities schedule like any other activity; driving-resource calendars are not applied (ADR-0039, M7 baseline)',
      honorDurationTypes
        ? 'FIXED_UNITS / FIXED_UNITS_TIME activities with a driving assignment carrying a rate derive their duration via resolveTriad (Units ÷ Units/Time → working minutes; ADR-0040 / ADR-0035 §26/§27); on this fixture no duration-type activity has a driving assignment and their units/duration/rate are self-consistent, so the derivation is inert and durations stay byte-identical (documented, not faked — the S13/A8300 self-consistency)'
        : 'duration types are not resolved; each activity keeps its fixture duration (ADR-0040, M7 rung 4 baseline)',
      'progress, actuals, suspend/resume and the data-date floor are ignored (ADR-0035 §1–§6, M2)',
      honorLagCalendars
        ? 'the 24-Hour per-relationship lag calendar is honoured (elapsed lag)'
        : 'per-relationship lag calendars are ignored; lag is measured on the plan calendar (ADR-0036 §6, M3 baseline)',
      'the data date and constraint dates are taken at day granularity (the shift calendar restores intraday working time within the day)',
    ],
    notes,
  };

  return {
    activities,
    edges,
    options: { dataDate, calendar, ...(useExpectedFinishDates ? { useExpectedFinishDates } : {}) },
    report,
  };
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

/**
 * Map one fixture constraint (`{ type, date }`) to the engine's kind + calendar day and hand it to
 * `set`, or push a `constraint-dropped` note when the kind is unsupported or the date is missing.
 * Shared by the primary (forward) and secondary (backward) constraints, so both are honest the same way.
 */
function applyConstraint(
  constraint: { type: string; date: string | null },
  activityId: string,
  notes: AdaptationNote[],
  set: (kind: ConstraintType, date: string) => void,
): void {
  const mapped = mapConstraintType(constraint.type);
  if (!mapped.supported) {
    notes.push({
      entity: 'activity',
      id: activityId,
      kind: 'constraint-dropped',
      reason: mapped.reason,
    });
    return;
  }
  if (constraint.date === null) {
    notes.push({
      entity: 'activity',
      id: activityId,
      kind: 'constraint-dropped',
      reason: `${constraint.type} has no date; constraint needs one`,
    });
    return;
  }
  set(mapped.value, toCalendarDay(constraint.date));
}

interface AdaptActivityContext {
  defaultCalendarId: string;
  honorActivityCalendars: boolean;
  honorResourceCalendars: boolean;
  honorDurationTypes: boolean;
  honorProgress: boolean;
  portForCal: (calId: string) => WorkingTimeCalendar | undefined;
  /** The driving resource's calendar id for this activity (undefined = no driving assignment). */
  drivingResourceCalId: string | undefined;
  /** The driving assignment's units + rate for the duration-type triad (undefined = no driving assignment). */
  drivingUnits: { budgetedUnits: number; unitsPerHour: number } | undefined;
  notes: AdaptationNote[];
}

/** Adapt one activity, or return null (with a note) if its type is unsupported. */
function adaptActivity(
  activity: FixtureActivity,
  ctx: AdaptActivityContext,
): EngineActivity | null {
  const {
    defaultCalendarId,
    honorActivityCalendars,
    honorResourceCalendars,
    honorDurationTypes,
    honorProgress,
    portForCal,
    drivingResourceCalId,
    drivingUnits,
    notes,
  } = ctx;
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

    // Duration-type derivation (ADR-0040 / ADR-0035 §26/§27, M7 rung 4). For the two UNITS-DRIVEN types
    // (FIXED_UNITS / FIXED_UNITS_TIME) with a DRIVING assignment carrying a rate, the duration is derived
    // from `Units ÷ Units/Time` via the SAME pure `resolveTriad` the write paths use — so the fixture and
    // the API agree by construction. The held types (FIXED_DURATION_AND_UNITS[_TIME]) are absent from
    // DURATION_DERIVING_EDIT and keep their entered duration. Only consulted when `honorDurationTypes` is
    // on; only the driving assignment participates (ADR-0040 §3).
    //
    // On THIS fixture the derivation is INERT: no duration-type activity carries a `res_driving`
    // assignment, so `drivingUnits` is undefined for all of them (A4330/A4430/A7100/A7200 are
    // units-driven but driver-less; A6100/A8300 have a driver but are the default held type). Their
    // units/duration/rate are self-consistent, so were a driver present the derivation would reproduce
    // the fixture duration anyway (the S13/A8300 self-consistency). This branch is therefore dead on the
    // fixture — proven by the first-principles `resolveTriad` goldens, not a fixture date-differential.
    if (honorDurationTypes && drivingUnits) {
      const edit = DURATION_DERIVING_EDIT[mapDurationType(activity.duration_type)];
      if (edit) {
        const resolved = resolveTriad(mapDurationType(activity.duration_type), edit, {
          durationMinutes,
          budgetedUnits: drivingUnits.budgetedUnits,
          unitsPerHour: drivingUnits.unitsPerHour,
        });
        // A units-driven derive can only fail on N20 (zero rate); that is a BOUNDARY reject (§25), so we
        // never fake a value — leave the fixture duration and let the write-path/DTO own the reject.
        if (resolved.ok) {
          if (resolved.durationMinutes !== durationMinutes) {
            notes.push({
              entity: 'activity',
              id: activity.id,
              kind: 'duration-derived',
              reason: `${activity.duration_type}: duration derived from the driving assignment's units ÷ rate to ${resolved.durationMinutes} working minutes (ADR-0040 / ADR-0035 §26)`,
            });
          }
          durationMinutes = resolved.durationMinutes;
        }
      }
    }
  }

  // Scheduling calendar (ADR-0035 §23 / ADR-0039 fallback: driving resource → activity → plan default).
  // A RESOURCE_DEPENDENT activity schedules on its DRIVING resource's calendar when resource calendars
  // are honoured; with no driving assignment it is produced-and-flagged and falls back to its activity
  // calendar. Any other type schedules on its own calendar (type-gated — a TASK with a resource
  // assignment never picks up the resource's calendar; the A5500 contrast). When resource calendars are
  // honoured the resource port applies regardless of the per-activity-calendar gate (they are distinct
  // knobs); the activity's own calendar still only applies under `honorActivityCalendars`.
  const isResourceDependent = type === 'RESOURCE_DEPENDENT';
  let resourceDriverMissing = false;
  let schedulingCalId = activity.calendar;
  let resourceDriven = false;
  if (isResourceDependent && honorResourceCalendars) {
    if (drivingResourceCalId !== undefined) {
      schedulingCalId = drivingResourceCalId;
      resourceDriven = true;
    } else {
      resourceDriverMissing = true;
      notes.push({
        entity: 'activity',
        id: activity.id,
        kind: 'resource-driver-missing',
        reason: `no driving resource assignment; scheduled on the fallback calendar and flagged (ADR-0035 §23)`,
      });
    }
  }

  // Apply the port under the right gate: a resource-driven calendar under `honorResourceCalendars`,
  // an own calendar under `honorActivityCalendars`. `portForCal` returns undefined for the plan
  // default or a window-only calendar (which is then substituted onto the plan default + noted).
  const gateOn = resourceDriven ? honorResourceCalendars : honorActivityCalendars;
  const ownPort = gateOn ? portForCal(schedulingCalId) : undefined;
  if (gateOn && schedulingCalId !== defaultCalendarId && !ownPort) {
    notes.push({
      entity: 'activity',
      id: activity.id,
      kind: resourceDriven ? 'resource-calendar-substituted' : 'activity-calendar-substituted',
      reason: resourceDriven
        ? `driving resource calendar ${schedulingCalId} is window-only; scheduled on the plan default ${defaultCalendarId} (in-window placement is an M5-epic edge case)`
        : `assigned window-only calendar ${schedulingCalId} scheduled on the plan default ${defaultCalendarId} (in-window placement is an M5-epic edge case)`,
    });
  } else if (!gateOn && schedulingCalId !== defaultCalendarId) {
    // The baseline (per-activity calendars off): a non-default assignment is noted, never applied.
    notes.push({
      entity: 'activity',
      id: activity.id,
      kind: 'activity-calendar-substituted',
      reason: `assigned calendar ${schedulingCalId} scheduled on the plan default ${defaultCalendarId} (per-activity calendars off — baseline)`,
    });
  }

  // Progress (M2, ADR-0035): when honoured, feed the fixture's actuals (day-denominated, like the
  // service) and the in-progress remaining (hours → working minutes). The engine classifies from
  // the actuals (a set actual finish ⇒ complete). Off (the S01 baseline), progress is dropped with
  // a note and the clean unprogressed network schedules from the planned start.
  let progress: Pick<
    EngineActivity,
    'actualStart' | 'actualFinish' | 'remainingMinutes' | 'resumeDate'
  > = {};
  if (honorProgress) {
    const actualStart = activity.actual_start ? activity.actual_start.slice(0, 10) : null;
    const actualFinish = activity.actual_finish ? activity.actual_finish.slice(0, 10) : null;
    progress = {
      actualStart,
      actualFinish,
      // Remaining only matters for an in-progress activity; a completed one uses its actual finish.
      ...(activity.status === 'IN_PROGRESS'
        ? {
            remainingMinutes: Math.round(activity.remaining_duration_h * MINUTES_PER_HOUR),
            // Suspend/resume (§4): a resume date floors the remaining (e.g. A4230's 2026-03-09).
            ...(activity.resume_date ? { resumeDate: activity.resume_date.slice(0, 10) } : {}),
          }
        : {}),
    };
  } else if (activity.status !== 'NOT_STARTED') {
    notes.push({
      entity: 'activity',
      id: activity.id,
      kind: 'progress-ignored',
      reason: `status ${activity.status}: progress/actuals ignored (S01 baseline — unprogressed)`,
    });
  }

  const engineActivity: EngineActivity = {
    id: activity.id,
    durationMinutes,
    type,
    ...progress,
    ...(ownPort ? { calendar: ownPort } : {}),
    ...(resourceDriverMissing ? { resourceDriverMissing: true } : {}),
  };

  // Expected finish (ADR-0035 §9, M4): fed unconditionally; the engine only acts on it when the plan
  // option `useExpectedFinishDates` is on (ComputeOptions), for an incomplete activity.
  if (activity.expected_finish) {
    engineActivity.expectedFinish = toCalendarDay(activity.expected_finish);
  }

  // Primary constraint. `AS_LATE_AS_POSSIBLE` is not a date constraint — it maps to the activity's
  // as-late-as-possible placement flag (ADR-0035 §11, M4). Every other kind clamps the passes.
  const primary = activity.primary_constraint;
  if (primary && primary.type === 'AS_LATE_AS_POSSIBLE') {
    engineActivity.scheduleAsLateAsPossible = true;
  } else if (primary) {
    applyConstraint(primary, activity.id, notes, (kind, date) => {
      engineActivity.constraintType = kind;
      engineActivity.constraintDate = date;
    });
  }

  // Secondary constraint (ADR-0035 §10, M4): the primary drives the forward pass, the secondary the
  // backward pass. Fed through the same mapping; an unsupported/dateless one is noted, not faked.
  const secondary = activity.secondary_constraint;
  if (secondary) {
    applyConstraint(secondary, activity.id, notes, (kind, date) => {
      engineActivity.secondaryConstraintType = kind;
      engineActivity.secondaryConstraintDate = date;
    });
  }

  return engineActivity;
}

/** Adapt one relationship, or return null (with a note) if an endpoint was excluded. */
function adaptRelationship(
  rel: FixtureRelationship,
  supportedIds: ReadonlySet<string>,
  honorLagCalendars: boolean,
  notes: AdaptationNote[],
  lag: {
    relationshipLagCalendar: 'PLAN' | 'PREDECESSOR' | 'SUCCESSOR';
    portFor: (activityId: string) => WorkingTimeCalendar | undefined;
  },
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
    // An EXPLICIT per-edge lag calendar (24H) always wins over the global setting (ADR-0036 §6).
    const source = normaliseLagCalendar(rel.lag_calendar);
    if (honorLagCalendars && source === 'TWENTY_FOUR_HOUR') {
      // Measure this lag as ELAPSED time on the 24/7 calendar (M3) — the concrete-cure
      // A4430→A4440 FS + 168h case: 7 elapsed days, not 7 working days.
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
  } else if (lag.relationshipLagCalendar === 'PREDECESSOR') {
    // Global setting (fixture S05): resolve the lag on the endpoint activity's calendar (ADR-0037,
    // M5). Undefined = that endpoint inherits the plan calendar (the byte-identical fast path).
    const port = lag.portFor(rel.predecessor);
    if (port) edge.lagCalendar = port;
  } else if (lag.relationshipLagCalendar === 'SUCCESSOR') {
    const port = lag.portFor(rel.successor);
    if (port) edge.lagCalendar = port;
  }

  return edge;
}
