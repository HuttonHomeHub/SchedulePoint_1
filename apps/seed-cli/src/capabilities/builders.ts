import {
  DEFAULT_SEED_PLAN_OPTIONS,
  type SeedActivity,
  type SeedAssignment,
  type SeedCalendar,
  type SeedDependency,
  type SeedResource,
  type SeedSpec,
} from '@repo/seed';

/**
 * The small vocabulary the capability builders are written in (ADR-0066 M2).
 *
 * A capability plan has to be **checkable by a person** — that is its whole reason to exist beside
 * the 129-activity fixture. So these defaults exist to keep each builder stating only what it is
 * demonstrating: a constraints plan should read as a list of constraints, not as thirty lines of
 * `accrualType: 'UNIFORM', budgetedExpense: null, …` repeated per activity.
 *
 * Every default matches the application's own, so an unstated field is inert rather than quietly
 * varying between families.
 */

/** One working day, so a duration reads as a day count at every call site. */
export const DAY = 1440;

/**
 * The catalogue's shared data date — the **same Monday the fixture uses**, deliberately. A reader
 * comparing a five-activity capability plan against the torture plan should not have to hold two
 * anchors in their head, and the data date floors every computed early start (ADR-0023/0033), so a
 * different one would move every bar for a reason that has nothing to do with the capability.
 */
export const DATA_DATE = '2026-03-02';

export function activity(key: string, overrides: Partial<SeedActivity> = {}): SeedActivity {
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
    ...overrides,
  };
}

export function link(
  predecessorKey: string,
  successorKey: string,
  overrides: Partial<SeedDependency> = {},
): SeedDependency {
  return {
    predecessorKey,
    successorKey,
    type: 'FS',
    lagMinutes: 0,
    lagCalendarSource: 'PROJECT_DEFAULT',
    ...overrides,
  };
}

/**
 * `weekdays` is 0 = Sunday … 6 = Saturday, matching the spec model. The runner converts to the API's
 * Monday-indexed `shifts` rows; stating it here in the model's own numbering keeps the conversion in
 * exactly one place (see `toApiShifts`, and the regression test that pins it).
 *
 * This shorthand writes FULL-DAY windows, which is what a which-days-work plan wants. An intraday
 * pattern is expressible too — pass `days` through `overrides`, as `shift-calendars.ts` does.
 */
export function calendar(
  key: string,
  name: string,
  weekdays: readonly number[],
  overrides: Partial<SeedCalendar> = {},
): SeedCalendar {
  return {
    key,
    name,
    scope: 'PROJECT',
    // Derived from the week unless a plan deliberately disagrees with its own hours (ADR-0068).
    hoursPerDay: null,
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      windows: weekdays.includes(weekday) ? [{ startMinute: 0, endMinute: DAY }] : [],
    })),
    exceptions: [],
    ...overrides,
  };
}

export function resource(
  key: string,
  name: string,
  overrides: Partial<SeedResource> = {},
): SeedResource {
  return {
    key,
    name,
    code: key,
    kind: 'LABOUR',
    calendarKey: null,
    maxUnitsPerHour: null,
    costPerUnit: null,
    parentKey: null,
    archived: false,
    ...overrides,
  };
}

export function assignment(
  activityKey: string,
  resourceKey: string,
  overrides: Partial<SeedAssignment> = {},
): SeedAssignment {
  return {
    activityKey,
    resourceKey,
    budgetedUnits: 40,
    unitsPerHour: null,
    isDriving: false,
    actualUnits: null,
    curveType: 'UNIFORM',
    lagMinutes: 0,
    ...overrides,
  };
}

export interface CapabilityPlanInput {
  seedName: string;
  name: string;
  /**
   * **One sentence stating the expected outcome**, stored on the plan itself (ADR-0066 M2). This is
   * the assertion a reader checks the plan against, and keeping it *in* the plan is what stops the
   * playbook and the plan drifting apart — they are the same string, not two copies of a claim.
   */
  description: string;
  activities: readonly SeedActivity[];
  dependencies?: readonly SeedDependency[];
  calendars?: readonly SeedCalendar[];
  resources?: readonly SeedResource[];
  assignments?: readonly SeedAssignment[];
  defaultCalendarKey?: string | null;
  currencyCode?: string | null;
  options?: Partial<SeedSpec['plan']['options']>;
}

export function capabilityPlan(input: CapabilityPlanInput): SeedSpec {
  return {
    seedName: input.seedName,
    tier: 'capability',
    plan: {
      name: input.name,
      description: input.description,
      dataDate: DATA_DATE,
      defaultCalendarKey: input.defaultCalendarKey ?? null,
      currencyCode: input.currencyCode ?? null,
      options: { ...DEFAULT_SEED_PLAN_OPTIONS, ...input.options },
    },
    calendars: [...(input.calendars ?? [])],
    resources: [...(input.resources ?? [])],
    activities: [...input.activities],
    dependencies: [...(input.dependencies ?? [])],
    assignments: [...(input.assignments ?? [])],
    // A capability plan is authored, not translated, so there is no source object it failed to
    // represent. `unplaceable` is the fixture tier's channel (ADR-0066); here it is always empty.
    unplaceable: [],
  };
}
