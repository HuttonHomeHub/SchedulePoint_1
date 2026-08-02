import {
  DEFAULT_SEED_PLAN_OPTIONS,
  type SeedActivity,
  type SeedActivityType,
  type SeedConstraintType,
  type SeedDependencyType,
  type SeedLagCalendarSource,
  type SeedResourceCurveType,
  type SeedResourceKind,
  type SeedSpec,
} from '../spec.js';

import { buildCoveringArray, type CoveringArray } from './covering-array.js';
import type { DimensionAssignment } from './dimensions.js';

/**
 * One covering-array row → one `SeedSpec` (ADR-0066 M3.1).
 *
 * Every case is the **same four-activity shape**, differing only in the row's values. That is
 * deliberate: when a case diverges, a reader compares it against its neighbours, and a shape that
 * varied per case would make every comparison start from scratch. The shape is:
 *
 * ```
 *   PRED ──(relationship dimensions)──▶ SUBJ ──FS──▶ SUCC
 *   ANCHOR (unlinked, so the plan always has a second start)
 * ```
 *
 * `SUBJ` carries every activity-scope dimension and the assignment; `PRED`/`SUCC` exist so the
 * relationship dimensions have somewhere to live and so `SUBJ` is never an open end by accident —
 * open-endedness is `makeOpenEndsCritical`'s business and would otherwise leak into every case.
 */

const DAY = 1440;

/** The catalogue's shared anchor, matching the fixture and the capability plans. */
const DATA_DATE = '2026-03-02';

/** A constrained activity needs a date the constraint can bite on. Two weeks out, on a Monday. */
const CONSTRAINT_DATE = '2026-03-16';

export interface PairwiseCase {
  /**
   * A stable, readable id built from the values that make this case different. It appears in the
   * plan name, so a divergence found in the database can be traced back to a row without a lookup.
   */
  caseId: string;
  assignment: DimensionAssignment;
  spec: SeedSpec;
}

export interface PairwiseSuite {
  cases: PairwiseCase[];
  array: CoveringArray;
}

/** Build the whole pairwise suite. Pure and deterministic — same rows, same specs, every run. */
export function pairwiseSuite(): PairwiseSuite {
  const array = buildCoveringArray();
  const cases = array.rows.map((assignment, index) => {
    const caseId = `pw-${String(index + 1).padStart(3, '0')}`;
    return { caseId, assignment, spec: caseSpec(caseId, assignment) };
  });
  return { cases, array };
}

function caseSpec(caseId: string, row: DimensionAssignment): SeedSpec {
  const subjectType = row.activityType as SeedActivityType;
  const isMilestone = subjectType === 'START_MILESTONE' || subjectType === 'FINISH_MILESTONE';
  // A milestone and an LOE both have zero duration of their own — the milestone because it is an
  // instant, the LOE because the engine derives its span from the logic (ADR-0035 §21).
  const zeroDuration = isMilestone || subjectType === 'LEVEL_OF_EFFORT';

  const calendars = calendarsFor(caseId, row);
  const resources = resourcesFor(caseId, row);

  return {
    seedName: `pairwise-${caseId}`,
    tier: 'pairwise',
    plan: {
      name: `Pairwise ${caseId}`,
      // The row itself, written out. A case that diverges is read by a person, and the fastest
      // question they can ask is "what is different about this one" — so the answer is on the plan.
      description: describe(row),
      dataDate: DATA_DATE,
      defaultCalendarKey: 'PW_PLAN_CAL',
      currencyCode: 'GBP',
      options: {
        ...DEFAULT_SEED_PLAN_OPTIONS,
        schedulingMode: row.schedulingMode === 'VISUAL' ? 'VISUAL' : 'EARLY',
        progressRecalcMode:
          row.progressRecalcMode === 'PROGRESS_OVERRIDE'
            ? 'PROGRESS_OVERRIDE'
            : row.progressRecalcMode === 'ACTUAL_DATES'
              ? 'ACTUAL_DATES'
              : 'RETAINED_LOGIC',
        criticalPathDefinition:
          row.criticalPathDefinition === 'LONGEST_PATH' ? 'LONGEST_PATH' : 'TOTAL_FLOAT',
        totalFloatMode:
          row.totalFloatMode === 'START'
            ? 'START'
            : row.totalFloatMode === 'SMALLEST'
              ? 'SMALLEST'
              : 'FINISH',
        levelResources: row.levelResources === 'on',
        levelWithinFloatOnly: row.levelWithinFloatOnly === 'on',
        ignoreExternalRelationships: row.ignoreExternalRelationships === 'on',
        useExpectedFinishDates: row.useExpectedFinishDates === 'on',
        makeOpenEndsCritical: row.makeOpenEndsCritical === 'on',
      },
    },
    calendars,
    resources,
    activities: [
      base('PRED', { name: 'Predecessor', durationMinutes: 3 * DAY }),
      subject(row, subjectType, zeroDuration),
      base('SUCC', { name: 'Successor', durationMinutes: 2 * DAY }),
      // Unlinked on purpose. Without it, `makeOpenEndsCritical` has exactly one open end to find in
      // every case, and the two values of that dimension become hard to tell apart.
      base('ANCHOR', { name: 'Independent anchor', durationMinutes: 4 * DAY }),
    ],
    dependencies: [
      {
        predecessorKey: 'PRED',
        successorKey: 'SUBJ',
        type: row.dependencyType as SeedDependencyType,
        lagMinutes:
          row.lagSign === 'positive' ? 2 * DAY : row.lagSign === 'negative' ? -1 * DAY : 0,
        lagCalendarSource: row.lagCalendar as SeedLagCalendarSource,
      },
      // Always FS and always zero-lag: this edge exists to stop SUBJ being an open end, and varying
      // it would put a second, uncontrolled relationship into every case.
      {
        predecessorKey: 'SUBJ',
        successorKey: 'SUCC',
        type: 'FS',
        lagMinutes: 0,
        lagCalendarSource: 'PROJECT_DEFAULT',
      },
    ],
    assignments: [
      {
        activityKey: 'SUBJ',
        resourceKey: 'PW_RES',
        budgetedUnits: 40,
        unitsPerHour: row.unitsPerHour === 'set' ? 1 : null,
        isDriving: row.driving === 'yes',
        actualUnits: null,
        curveType: row.curveType as SeedResourceCurveType,
      },
    ],
    unplaceable: [],
  };
}

/** The subject activity — every activity-scope dimension lands here. */
function subject(
  row: DimensionAssignment,
  type: SeedActivityType,
  zeroDuration: boolean,
): SeedActivity {
  const constraintType = row.constraint === 'none' ? null : (row.constraint as SeedConstraintType);
  const hasExternalStart =
    row.externalInstants === 'early-start' || row.externalInstants === 'both';
  const hasExternalFinish =
    row.externalInstants === 'late-finish' || row.externalInstants === 'both';

  return {
    ...base('SUBJ', { name: 'Subject' }),
    type,
    durationMinutes: zeroDuration ? 0 : 5 * DAY,
    calendarKey:
      row.calendar === 'own-5-day'
        ? 'PW_CAL_5'
        : row.calendar === 'own-24-hour'
          ? 'PW_CAL_24'
          : null,
    constraintType,
    constraintDate: constraintType === null ? null : CONSTRAINT_DATE,
    durationType: zeroDuration
      ? 'FIXED_DURATION_AND_UNITS_TIME'
      : (row.durationType as SeedActivity['durationType']),
    accrualType: row.accrualType as SeedActivity['accrualType'],
    externalEarlyStart: hasExternalStart ? '2026-03-23T00:00' : null,
    externalLateFinish: hasExternalFinish ? '2026-04-10T00:00' : null,
    budgetedExpense: 100_000,
    progress: progressFor(row, zeroDuration),
  };
}

/**
 * Progress for the row's status. A COMPLETE activity carries both actuals and zero remaining; an
 * IN_PROGRESS one carries an actual start and a remainder. NOT_STARTED carries no progress record
 * at all — writing a zeroed one would be a different input from writing none, and the engine's
 * classification reads exactly that difference (ADR-0035 §8).
 */
function progressFor(row: DimensionAssignment, zeroDuration: boolean): SeedActivity['progress'] {
  if (row.status === 'NOT_STARTED') return null;
  const suspended = row.suspendResume === 'present';
  const complete = row.status === 'COMPLETE';
  return {
    status: complete ? 'COMPLETE' : 'IN_PROGRESS',
    percentComplete: complete ? 100 : 40,
    percentCompleteType: row.percentCompleteType as 'DURATION' | 'UNITS' | 'PHYSICAL',
    physicalPercentComplete: row.percentCompleteType === 'PHYSICAL' ? (complete ? 100 : 45) : null,
    actualStart: '2026-02-24T00:00',
    actualFinish: complete ? '2026-02-27T00:00' : null,
    remainingDurationMinutes: complete || zeroDuration ? 0 : 3 * DAY,
    suspendDate: suspended ? '2026-02-25T00:00' : null,
    resumeDate: suspended ? '2026-02-27T00:00' : null,
    // Inert unless the plan opts in, which is the point of crossing it with the plan-level switch.
    expectedFinish: '2026-03-27T00:00',
  };
}

/**
 * Every case seeds into the SAME project, and a PROJECT calendar's name is unique per project
 * (ADR-0053 §1), so the names carry the case id. Without it the second case 409s on the first
 * one's calendars — which is what happened, and it is a collision in the CATALOGUE rather than a
 * product defect, so it is fixed here rather than reported as a finding.
 *
 * The ORG calendar deliberately keeps a stable name: the seeder resolves the shared library by
 * name and reuses it, so a per-case name would add one org-global calendar per case.
 */
function calendarsFor(caseId: string, row: DimensionAssignment): SeedSpec['calendars'] {
  const week = (weekdays: number[]) =>
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      windows: weekdays.includes(weekday) ? [{ startMinute: 0, endMinute: DAY }] : [],
    }));

  return [
    {
      key: 'PW_PLAN_CAL',
      name: `Pairwise plan week ${caseId}`,
      scope: 'PROJECT',
      hoursPerDay: null,
      days: week([1, 2, 3, 4, 5]),
      exceptions: [],
    },
    {
      key: 'PW_CAL_5',
      name: `Pairwise five-day ${caseId}`,
      scope: 'PROJECT',
      hoursPerDay: null,
      days: week([1, 2, 3, 4, 5]),
      exceptions: [],
    },
    {
      key: 'PW_CAL_24',
      name: `Pairwise 24-hour ${caseId}`,
      scope: 'PROJECT',
      hoursPerDay: null,
      days: week([0, 1, 2, 3, 4, 5, 6]),
      exceptions: [],
    },
    // ORG scope, and it has to be: a resource may hold only an organisation calendar (ADR-0053 §2).
    // Six-day, so a driving resource actually moves the dates rather than agreeing with the plan.
    ...(row.driving === 'yes'
      ? [
          {
            key: 'PW_CAL_RES',
            name: 'Pairwise resource week (shared)',
            scope: 'ORG' as const,
            hoursPerDay: null,
            days: week([1, 2, 3, 4, 5, 6]),
            exceptions: [],
          },
        ]
      : []),
  ];
}

/**
 * The resource carries the case id too, for the same reason the calendars do — a name and a code
 * are unique per ORGANISATION (ADR-0053), and every case seeds into one. Reusing a single resource
 * across cases is not an option: its kind, capacity and calendar are three of the dimensions.
 */
function resourcesFor(caseId: string, row: DimensionAssignment): SeedSpec['resources'] {
  return [
    {
      key: 'PW_RES',
      name: `Pairwise ${String(row.resourceKind).toLowerCase()} ${caseId}`,
      code: `PW-${caseId}`,
      kind: row.resourceKind as SeedResourceKind,
      // Only a driving resource needs its own calendar — and only a non-MATERIAL one may hold one.
      calendarKey: row.driving === 'yes' ? 'PW_CAL_RES' : null,
      maxUnitsPerHour: row.maxUnitsPerHour === 'set' ? 2 : null,
      costPerUnit: 4200,
      parentKey: null,
      archived: false,
    },
  ];
}

/** Every field at the application's own default, so a case states only what it varies. */
function base(key: string, overrides: Partial<SeedActivity> = {}): SeedActivity {
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

/** The row as a sentence, stored on the plan so a diverging case explains itself. */
export function describe(row: DimensionAssignment): string {
  const parts = Object.entries(row)
    .map(([dimension, value]) => `${dimension}=${value}`)
    .join(', ');
  return `Generated pairwise case (ADR-0066 M3). Dimensions: ${parts}.`;
}
