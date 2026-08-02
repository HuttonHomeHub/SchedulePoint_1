import { loadFixture } from '@repo/engine-conformance';
import {
  DEFAULT_SEED_PLAN_OPTIONS,
  type SeedActivity,
  type SeedActivityType,
  type SeedCalendar,
  type SeedConstraintType,
  type SeedDependency,
  type SeedResource,
  type SeedResourceKind,
  type SeedSpec,
  type SeedUnplaceable,
} from '@repo/seed';

/**
 * The **P6 torture fixture → `SeedSpec`** mapper (ADR-0066, Tier 1).
 *
 * The fixture is authoritative and P6-shaped; this translates its vocabulary into the application's,
 * and — the part that matters — **names everything it cannot translate**. Three of its collections
 * have no SchedulePoint concept at all: roles, activity-code types and UDF definitions. They become
 * `unplaceable` entries with a reason, so a reader can tell "the app cannot hold this" apart from
 * "the seeder forgot". That is the ADR-0050 report discipline applied to seeding.
 *
 * Durations arrive in **hours** and the spec model is in working minutes; the further conversion to
 * the whole days the public API accepts happens in the runner, where the loss can be reported per
 * activity (TECH_DEBT #78).
 */

const MINUTES_PER_HOUR = 60;

/**
 * The fixture keys its working week by day NAME; the domain uses 0 = Sunday … 6 = Saturday. Indexing
 * this array by weekday is the whole conversion, and getting the order wrong would move every shift
 * by a day without failing anything — hence a named constant rather than an inline literal.
 */
const WEEKDAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** P6 activity kinds → the domain's. `TASK_DEPENDENT` is P6's name for an ordinary task. */
const ACTIVITY_TYPE: Readonly<Record<string, SeedActivityType>> = {
  TASK_DEPENDENT: 'TASK',
  START_MILESTONE: 'START_MILESTONE',
  FINISH_MILESTONE: 'FINISH_MILESTONE',
  LEVEL_OF_EFFORT: 'LEVEL_OF_EFFORT',
  WBS_SUMMARY: 'WBS_SUMMARY',
  RESOURCE_DEPENDENT: 'RESOURCE_DEPENDENT',
};

/** The fixture spells constraints out; the domain uses P6's short forms (ADR-0035 §7). */
const CONSTRAINT_TYPE: Readonly<Record<string, SeedConstraintType>> = {
  START_ON_OR_AFTER: 'SNET',
  START_ON_OR_BEFORE: 'SNLT',
  FINISH_ON_OR_AFTER: 'FNET',
  FINISH_ON_OR_BEFORE: 'FNLT',
  START_ON: 'MSO',
  FINISH_ON: 'MFO',
  MANDATORY_START: 'MANDATORY_START',
  MANDATORY_FINISH: 'MANDATORY_FINISH',
  // AS_LATE_AS_POSSIBLE is deliberately absent: P6 files it under constraints, but SchedulePoint
  // models it as the per-activity `scheduleAsLateAsPossible` flag (ADR-0035 §16) — it carries no
  // date and clamps nothing. Mapping it to a constraint type would need a date it does not have.
};

/** P6's constraint slot for the ALAP flag, which is not a constraint here. */
const ALAP = 'AS_LATE_AS_POSSIBLE';

/**
 * `NONLABOUR` is P6's plant/equipment kind. Mapping it to `EQUIPMENT` is the closest fit and is
 * **not** lossless in name, but it is in behaviour — neither kind changes how anything schedules.
 */
const RESOURCE_KIND: Readonly<Record<string, SeedResourceKind>> = {
  LABOUR: 'LABOUR',
  LABOR: 'LABOUR',
  NONLABOUR: 'EQUIPMENT',
  NONLABOR: 'EQUIPMENT',
  MATERIAL: 'MATERIAL',
};

/**
 * P6 names its uniform loading curve `LINEAR`; the domain calls the same profile `UNIFORM`
 * (ADR-0044). Everything else shares a name.
 */
const CURVE_TYPE: Readonly<Record<string, SeedSpec['assignments'][number]['curveType']>> = {
  LINEAR: 'UNIFORM',
  UNIFORM: 'UNIFORM',
  BELL: 'BELL',
  FRONT_LOADED: 'FRONT_LOADED',
  BACK_LOADED: 'BACK_LOADED',
  DOUBLE_PEAK: 'DOUBLE_PEAK',
};

const STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETE',
} as const;

/** Build the Tier-1 spec from the vendored fixture. Pure — no I/O beyond the loader's own read. */
export function fixtureSpec(): SeedSpec {
  const fixture = loadFixture() as unknown as FixtureShape;
  const unplaceable: SeedUnplaceable[] = [];

  // The three collections with no SchedulePoint concept. Reported, never dropped in silence — a
  // reader must be able to see the boundary rather than infer it from an absence.
  for (const role of fixture.roles ?? []) {
    unplaceable.push({
      entity: 'role',
      sourceRef: role.id ?? null,
      reason: 'SchedulePoint has no role model; a resource is assigned directly (ADR-0039)',
    });
  }
  for (const codeType of fixture.activity_code_types ?? []) {
    unplaceable.push({
      entity: 'activity_code_type',
      sourceRef: codeType.id ?? null,
      reason: 'SchedulePoint has no activity-code dimension; the WBS tree is the only grouping',
    });
  }
  for (const udf of fixture.udf_definitions ?? []) {
    unplaceable.push({
      entity: 'udf_definition',
      sourceRef: udf.id ?? null,
      reason: 'SchedulePoint has no user-defined fields',
    });
  }

  const calendars: SeedCalendar[] = fixture.calendars.map((calendar) => ({
    key: calendar.id,
    name: calendar.name,
    // Every fixture calendar lands at PROJECT scope: an imported or seeded calendar must not grow
    // the shared organisation library as a side effect (ADR-0053 §5, the same default the importer
    // uses). A resource-held calendar is forced to ORG below, because a resource can hold no other.
    scope: fixture.resources.some((r) => r.calendar === calendar.id) ? 'ORG' : 'PROJECT',
    // Derived by the API from the week below (ADR-0068). The fixture DOES state its own
    // `hours_per_day`, but this loader reads a narrower local type that does not carry it; deriving
    // is right for every fixture calendar whose week matches its stated day, which is all of them.
    hoursPerDay: null,
    days: WEEKDAY_KEYS.map((key, weekday) => ({
      weekday,
      windows: (calendar.workweek?.[key] ?? []).map(toWindow),
    })),
    exceptions: (calendar.exceptions ?? []).flatMap(expandException),
  }));

  const resources: SeedResource[] = fixture.resources.map((resource) => ({
    key: resource.id,
    name: resource.name,
    code: resource.id,
    kind: RESOURCE_KIND[resource.type.toUpperCase()] ?? 'LABOUR',
    calendarKey: resource.calendar ?? null,
    maxUnitsPerHour: resource.max_units_per_hour ?? null,
    // The fixture's rate is per unit in major currency; the domain stores minor units (ADR-0042).
    costPerUnit:
      resource.price_per_unit === null || resource.price_per_unit === undefined
        ? null
        : Math.round(resource.price_per_unit * 100),
    parentKey: null,
    archived: false,
  }));

  // The WBS is a separate tree in P6; SchedulePoint models it as `WBS_SUMMARY` activities with a
  // `parentId` (ADR-0038). Each fixture WBS node therefore becomes a summary activity, and each real
  // activity's `wbs` becomes its parent key.
  const wbsActivities: SeedActivity[] = fixture.wbs.map((node) => ({
    key: `WBS:${node.id}`,
    code: node.id,
    name: node.name,
    type: 'WBS_SUMMARY',
    durationMinutes: 0,
    calendarKey: null,
    parentKey: node.parent === null ? null : `WBS:${node.parent}`,
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
  }));

  const activities: SeedActivity[] = fixture.activities.map((activity) => ({
    key: activity.id,
    code: activity.id,
    name: activity.name,
    type: ACTIVITY_TYPE[activity.activity_type] ?? 'TASK',
    durationMinutes: Math.round((activity.original_duration_h ?? 0) * MINUTES_PER_HOUR),
    calendarKey: activity.calendar ?? null,
    parentKey: activity.wbs === null || activity.wbs === undefined ? null : `WBS:${activity.wbs}`,
    constraintType: constraintOf(activity.primary_constraint),
    constraintDate: constraintDateOf(activity.primary_constraint),
    secondaryConstraintType: constraintOf(activity.secondary_constraint),
    secondaryConstraintDate: constraintDateOf(activity.secondary_constraint),
    scheduleAsLateAsPossible:
      activity.primary_constraint?.type === ALAP || activity.secondary_constraint?.type === ALAP,
    durationType: activity.duration_type ?? 'FIXED_DURATION_AND_UNITS_TIME',
    externalEarlyStart: instantOrNull(activity.external_early_start),
    externalLateFinish: instantOrNull(activity.external_late_finish),
    levelingPriority: null,
    accrualType: 'UNIFORM',
    budgetedExpense: null,
    actualExpense: null,
    steps: [],
    progress:
      activity.status === 'NOT_STARTED'
        ? null
        : {
            status: STATUS[activity.status],
            percentComplete: Math.round(activity.duration_percent_complete ?? 0),
            percentCompleteType: activity.percent_complete_type ?? 'DURATION',
            physicalPercentComplete:
              activity.physical_percent_complete === null ||
              activity.physical_percent_complete === undefined
                ? null
                : Math.round(activity.physical_percent_complete),
            actualStart: instantOrNull(activity.actual_start),
            actualFinish: instantOrNull(activity.actual_finish),
            remainingDurationMinutes:
              activity.remaining_duration_h === null || activity.remaining_duration_h === undefined
                ? null
                : Math.round(activity.remaining_duration_h * MINUTES_PER_HOUR),
            suspendDate: instantOrNull(activity.suspend_date),
            resumeDate: instantOrNull(activity.resume_date),
            expectedFinish: instantOrNull(activity.expected_finish),
          },
    visualStart: null,
    testTags: [...(activity.test_tags ?? [])],
  }));

  const dependencies: SeedDependency[] = fixture.relationships.map((relationship) => ({
    predecessorKey: relationship.predecessor,
    successorKey: relationship.successor,
    type: relationship.type,
    lagMinutes: Math.round((relationship.lag_h ?? 0) * MINUTES_PER_HOUR),
    lagCalendarSource: relationship.lag_calendar === '24H' ? 'TWENTY_FOUR_HOUR' : 'PROJECT_DEFAULT',
  }));

  return {
    seedName: 'fixture-p6-torture-v1',
    tier: 'fixture',
    plan: {
      name: 'P6 torture test (v1)',
      description:
        'The full ADR-0034 conformance fixture as a live plan. Every capability the XER cannot ' +
        'carry is here; the seed report names what could not be placed at all.',
      // The fixture's own **data date**, not its `planned_start`. They are different dates
      // (2026-03-02 vs 2026-01-05) and confusing them is not cosmetic: the data date floors every
      // computed early start (ADR-0023/0033), so an unprogressed activity lands on it — which is
      // exactly the "everything starts 02 Mar 2026" the WBS summaries were reported showing. It also
      // makes every actual in the fixture legal; against 2026-01-05 the API rightly refused twenty
      // of them with ACTUAL_AFTER_DATA_DATE.
      dataDate: isoDate(fixture.project.data_date),
      defaultCalendarKey:
        fixture.project.default_calendar ?? fixture.calendars.find((c) => c.is_default)?.id ?? null,
      currencyCode: 'GBP',
      options: planOptions(fixture.project.scheduling_options),
    },
    calendars,
    resources,
    activities: [...wbsActivities, ...activities],
    dependencies,
    assignments: fixture.assignments.map((assignment) => ({
      activityKey: assignment.activity,
      resourceKey: assignment.resource,
      budgetedUnits: assignment.budgeted_units ?? 0,
      unitsPerHour: assignment.units_per_hour ?? null,
      isDriving: assignment.driving ?? false,
      actualUnits: assignment.actual_units ?? null,
      curveType: CURVE_TYPE[assignment.curve ?? ''] ?? 'UNIFORM',
    })),
    unplaceable,
  };
}

/**
 * The fixture states an exception either as a single `date` or as an inclusive `date_range` — a site
 * Christmas shutdown, a crane hire window, the turnaround that is the ONLY working time on CAL-05.
 * SchedulePoint stores one row per day, so a range **expands**. Taking only the first day instead
 * would quietly re-open a two-week shutdown, and every activity across it would move without
 * anything failing.
 */
function expandException(exception: FixtureException): SeedCalendar['exceptions'] {
  const windows = (exception.work ?? []).map(toWindow);
  const label = exception.note ?? null;
  if (exception.date !== undefined) {
    return [{ date: isoDate(exception.date), windows, label }];
  }
  if (exception.date_range === undefined) return [];
  const [from, to] = exception.date_range;
  const days: SeedCalendar['exceptions'] = [];
  for (const date of datesBetween(from, to)) days.push({ date, windows, label });
  return days;
}

/** Every `YYYY-MM-DD` from `from` to `to` inclusive, in UTC so no local zone can shift a boundary. */
function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let at = Date.parse(`${from}T00:00:00Z`); at <= end; at += 86_400_000) {
    dates.push(new Date(at).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * The fixture's P6-worded scheduling options → the plan's own switches. Read rather than defaulted,
 * because several of these ARE capabilities the catalogue exists to exercise: the fixture turns
 * `use_expected_finish_dates` ON, and without it `con_expected_finish` is inert (ADR-0035 §9) — the
 * capability would be present in the data and unexercised in the plan.
 */
function planOptions(source: FixtureSchedulingOptions | undefined): SeedSpec['plan']['options'] {
  if (source === undefined) return DEFAULT_SEED_PLAN_OPTIONS;
  return {
    ...DEFAULT_SEED_PLAN_OPTIONS,
    useExpectedFinishDates: source.use_expected_finish_dates ?? false,
    makeOpenEndsCritical: source.make_open_ended_activities_critical ?? false,
    levelResources: source.level_resources_during_scheduling ?? false,
    ignoreExternalRelationships: source.ignore_relationships_to_and_from_other_projects ?? false,
    progressRecalcMode:
      source.when_scheduling_progressed_activities_use === 'PROGRESS_OVERRIDE'
        ? 'PROGRESS_OVERRIDE'
        : source.when_scheduling_progressed_activities_use === 'ACTUAL_DATES'
          ? 'ACTUAL_DATES'
          : 'RETAINED_LOGIC',
    criticalPathDefinition:
      source.define_critical_activities_as === 'LONGEST_PATH' ? 'LONGEST_PATH' : 'TOTAL_FLOAT',
    totalFloatMode:
      source.compute_total_float_as === 'START_FLOAT'
        ? 'START'
        : source.compute_total_float_as === 'SMALLEST_OF_START_AND_FINISH_FLOAT'
          ? 'SMALLEST'
          : 'FINISH',
  };
}

function constraintOf(constraint: FixtureConstraint | null | undefined): SeedConstraintType | null {
  if (constraint === null || constraint === undefined) return null;
  return CONSTRAINT_TYPE[constraint.type] ?? null;
}

function constraintDateOf(constraint: FixtureConstraint | null | undefined): string | null {
  // A constraint the domain does not model as one (ALAP) carries no date, and neither does an
  // absent slot. Returning the date only when BOTH the type maps and a date exists keeps the pair
  // consistent — a type without its date is a 422 the seeder would then report as a finding.
  if (constraint === null || constraint === undefined) return null;
  if (constraint.date === null || CONSTRAINT_TYPE[constraint.type] === undefined) return null;
  return isoDate(constraint.date);
}

/** `2026-01-05T08:00:00` → `2026-01-05`. */
function isoDate(value: string): string {
  return value.slice(0, 10);
}

/** `2026-01-05T08:00:00` → `2026-01-05T08:00`, the spec model's minute-granular instant. */
function instantOrNull(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : value.slice(0, 16);
}

/**
 * The fixture states a shift as a `["HH:MM", "HH:MM"]` pair; the domain stores minutes from local
 * midnight. `24:00` is a legal end (the ADR-0036 end-of-day sentinel) and parses to 1440 naturally.
 */
function toWindow(pair: readonly [string, string]): { startMinute: number; endMinute: number } {
  return { startMinute: clockToMinutes(pair[0]), endMinute: clockToMinutes(pair[1]) };
}

function clockToMinutes(clock: string): number {
  const [hours = '0', minutes = '0'] = clock.split(':');
  return Number(hours) * MINUTES_PER_HOUR + Number(minutes);
}

// The fixture's own Zod schema lives in `@repo/engine-conformance`; these are the narrow shapes this
// mapper reads, declared locally so a schema addition there does not silently widen what is mapped.
interface FixtureConstraint {
  type: string;
  date: string | null;
}
/** One of `date` or `date_range` is present, never both. */
interface FixtureException {
  date?: string;
  date_range?: [string, string];
  note?: string | null;
  work?: Array<[string, string]>;
}
interface FixtureSchedulingOptions {
  ignore_relationships_to_and_from_other_projects?: boolean;
  make_open_ended_activities_critical?: boolean;
  use_expected_finish_dates?: boolean;
  level_resources_during_scheduling?: boolean;
  when_scheduling_progressed_activities_use?: string;
  define_critical_activities_as?: string;
  compute_total_float_as?: string;
}
interface FixtureShape {
  project: {
    data_date: string;
    default_calendar?: string | null;
    scheduling_options?: FixtureSchedulingOptions;
  };
  calendars: Array<{
    id: string;
    name: string;
    is_default?: boolean;
    workweek?: Partial<Record<(typeof WEEKDAY_KEYS)[number], Array<[string, string]>>>;
    exceptions?: FixtureException[];
  }>;
  wbs: Array<{ id: string; parent: string | null; name: string }>;
  resources: Array<{
    id: string;
    name: string;
    type: string;
    calendar?: string | null;
    max_units_per_hour?: number | null;
    price_per_unit?: number | null;
  }>;
  activities: Array<{
    id: string;
    name: string;
    activity_type: string;
    original_duration_h?: number;
    calendar?: string | null;
    wbs?: string | null;
    primary_constraint?: FixtureConstraint | null;
    secondary_constraint?: FixtureConstraint | null;
    duration_type?: SeedActivity['durationType'];
    percent_complete_type?: SeedActivity['progress'] extends null
      ? never
      : 'DURATION' | 'UNITS' | 'PHYSICAL';
    status: keyof typeof STATUS;
    duration_percent_complete?: number;
    physical_percent_complete?: number | null;
    actual_start?: string | null;
    actual_finish?: string | null;
    remaining_duration_h?: number | null;
    suspend_date?: string | null;
    resume_date?: string | null;
    expected_finish?: string | null;
    external_early_start?: string | null;
    external_late_finish?: string | null;
    test_tags?: string[];
  }>;
  relationships: Array<{
    predecessor: string;
    successor: string;
    type: SeedDependency['type'];
    lag_h?: number;
    lag_calendar?: string | null;
  }>;
  assignments: Array<{
    activity: string;
    resource: string;
    budgeted_units?: number;
    units_per_hour?: number | null;
    actual_units?: number | null;
    driving?: boolean;
    curve?: string | null;
  }>;
  roles?: Array<{ id?: string }>;
  activity_code_types?: Array<{ id?: string }>;
  udf_definitions?: Array<{ id?: string }>;
}
