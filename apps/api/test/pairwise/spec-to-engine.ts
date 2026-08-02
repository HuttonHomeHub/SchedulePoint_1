import type { SeedActivity, SeedSpec } from '@repo/seed';

import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  type EngineActivity,
  type EngineEdge,
  type WorkingTimeCalendar,
} from '../../src/modules/schedule/engine';
import type { ComputeOptions } from '../../src/modules/schedule/engine/compute';

/**
 * **`SeedSpec` → the engine's input, read from the spec and nothing else** (ADR-0066 M3.2).
 *
 * This file is the load-bearing detail of the whole differential, and it is easy to get wrong in a
 * way that leaves the suite passing while proving nothing. The tempting shortcut is to build the
 * engine's input by reading the plan back out of the database — the rows are right there, already
 * shaped almost correctly. Doing that would reuse `schedule.repository`'s own input assembly, which
 * is **the exact code both known defects lived in**: the LOE type coerced away at the write path,
 * and `parentId` never reaching the engine. The comparison would then agree with itself.
 *
 * So every value below comes from the `SeedSpec`. If the write path drops a field, the engine still
 * sees it here, the application does not, and the comparison fails naming the activity and the
 * field. That is the only arrangement in which this suite can see anything at all.
 *
 * The one thing it must NOT do is re-implement scheduling. It translates vocabulary — keys to ids,
 * spec calendars to engine ports, minutes to minutes — and never decides a date.
 */

const MINUTES_PER_DAY = 1440;

export interface EngineInput {
  activities: EngineActivity[];
  edges: EngineEdge[];
  options: ComputeOptions;
}

export function specToEngineInput(spec: SeedSpec): EngineInput {
  const calendarByKey = new Map<string, WorkingTimeCalendar>(
    spec.calendars.map((calendar) => [calendar.key, toEnginePort(calendar)]),
  );

  const planCalendar =
    spec.plan.defaultCalendarKey === null
      ? allMinutesWorkCalendar
      : (calendarByKey.get(spec.plan.defaultCalendarKey) ?? allMinutesWorkCalendar);

  // The driving resource's calendar, resolved from the SPEC's assignments (ADR-0039 §23). The
  // service does this from persisted assignment rows; doing it from the spec is what lets the
  // differential see a driving flag the write path lost.
  const drivingCalendarByActivity = new Map<string, WorkingTimeCalendar>();
  for (const assignment of spec.assignments) {
    if (!assignment.isDriving) continue;
    const resource = spec.resources.find((item) => item.key === assignment.resourceKey);
    if (resource?.calendarKey == null) continue;
    const calendar = calendarByKey.get(resource.calendarKey);
    if (calendar !== undefined) drivingCalendarByActivity.set(assignment.activityKey, calendar);
  }

  const activities = spec.activities.map((activity) =>
    toEngineActivity(activity, calendarByKey, drivingCalendarByActivity),
  );

  const edges: EngineEdge[] = spec.dependencies.map((dependency, index) => ({
    id: `edge-${String(index)}`,
    predecessorId: dependency.predecessorKey,
    successorId: dependency.successorKey,
    type: dependency.type,
    lagMinutes: dependency.lagMinutes,
    // Only the 24-hour source resolves to a calendar distinct from the plan's; PREDECESSOR and
    // SUCCESSOR coincide with it until per-edge endpoint calendars land (ADR-0036 §6 / M3).
    ...(dependency.lagCalendarSource === 'TWENTY_FOUR_HOUR'
      ? { lagCalendar: allMinutesWorkCalendar }
      : {}),
  }));

  return {
    activities,
    edges,
    options: {
      dataDate: spec.plan.dataDate,
      calendar: planCalendar,
      progressMode: spec.plan.options.progressRecalcMode,
      useExpectedFinishDates: spec.plan.options.useExpectedFinishDates,
      criticalDefinition: spec.plan.options.criticalPathDefinition,
      criticalFloatThresholdMinutes: spec.plan.options.criticalFloatThresholdMinutes,
      totalFloatMode: spec.plan.options.totalFloatMode,
      makeOpenEndsCritical: spec.plan.options.makeOpenEndsCritical,
      ignoreExternalRelationships: spec.plan.options.ignoreExternalRelationships,
    },
  };
}

function toEngineActivity(
  activity: SeedActivity,
  calendarByKey: ReadonlyMap<string, WorkingTimeCalendar>,
  drivingCalendarByActivity: ReadonlyMap<string, WorkingTimeCalendar>,
): EngineActivity {
  // A RESOURCE_DEPENDENT activity schedules on its DRIVING resource's calendar; everything else on
  // its own if it names one, and otherwise inherits the plan's (undefined = inherit).
  const ownCalendar =
    activity.calendarKey === null ? undefined : calendarByKey.get(activity.calendarKey);
  const calendar =
    activity.type === 'RESOURCE_DEPENDENT'
      ? (drivingCalendarByActivity.get(activity.key) ?? ownCalendar)
      : ownCalendar;

  const progress = activity.progress;

  return {
    id: activity.key,
    // The API is day-denominated, so the seeded row is the ROUNDED duration (TECH_DEBT #78). The
    // engine must be given the same rounded value, or every non-whole-day case would diverge on
    // an approximation the report already declares — a false failure that would bury real ones.
    durationMinutes: roundToWholeDays(activity.durationMinutes),
    type: activity.type,
    parentId: activity.parentKey,
    ...(calendar === undefined ? {} : { calendar }),
    externalEarlyStart: toDate(activity.externalEarlyStart),
    externalLateFinish: toDate(activity.externalLateFinish),
    constraintType: activity.constraintType,
    constraintDate: activity.constraintDate,
    secondaryConstraintType: activity.secondaryConstraintType,
    secondaryConstraintDate: activity.secondaryConstraintDate,
    visualStart: activity.visualStart,
    scheduleAsLateAsPossible: activity.scheduleAsLateAsPossible,
    ...(progress === null
      ? {}
      : {
          actualStart: toDate(progress.actualStart),
          actualFinish: toDate(progress.actualFinish),
          ...(progress.remainingDurationMinutes === null
            ? {}
            : { remainingMinutes: roundToWholeDays(progress.remainingDurationMinutes) }),
          resumeDate: toDate(progress.resumeDate),
          expectedFinish: toDate(progress.expectedFinish),
        }),
    levelingPriority: activity.levelingPriority,
  };
}

/** A spec calendar's weekly windows + dated exceptions → the engine's working-time port. */
function toEnginePort(calendar: SeedSpec['calendars'][number]): WorkingTimeCalendar {
  // The engine's weekly pattern is indexed Monday = 0 … Sunday = 6; the spec model numbers weekdays
  // 0 = Sunday … 6 = Saturday. Same conversion as the seeder's mask, and wrong here would move
  // every bar by a day while both sides still looked plausible.
  const weekly: Array<Array<{ startMinute: number; endMinute: number }>> = [
    [],
    [],
    [],
    [],
    [],
    [],
    [],
  ];
  for (const day of calendar.days) {
    weekly[(day.weekday + 6) % 7] = day.windows.map((window) => ({ ...window }));
  }

  return buildWorkingTimeCalendar(
    weekly,
    calendar.exceptions.map((exception) => ({
      startDate: exception.date,
      endDate: exception.date,
      windows: exception.windows.map((window) => ({ ...window })),
    })),
  );
}

/**
 * Match the API's day ceiling. The seeder rounds a duration to whole working days because no DTO
 * accepts minutes (TECH_DEBT #78); giving the engine the unrounded value would make the two sides
 * disagree about an approximation that is already declared, drowning real divergences in noise.
 */
function roundToWholeDays(minutes: number): number {
  return Math.round(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}

/** The spec's minute-granular instant → the engine's calendar date. */
function toDate(instant: string | null): string | null {
  return instant === null ? null : instant.slice(0, 10);
}
