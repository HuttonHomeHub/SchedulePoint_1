import { DEFAULT_SEED_PLAN_OPTIONS, type SeedActivity, type SeedSpec } from '../spec.js';

import type { NegativeCase } from './model.js';

/**
 * The 18 hostile cases of `fixtures/negative_cases.json`, as **one API attempt each** (ADR-0066
 * M5.1). See `model.ts` for why this tier is shaped differently from the other four.
 *
 * ## The mapping is deliberate, and where it is lossy it says so
 *
 * The fixture describes its cases as engine input: hours, a `CAL-01` reference, activity ids like
 * `A5100` that belong to the main torture plan. None of that survives contact with the API, which
 * takes days, its own calendar ids and UUIDs. So each case here declares a **minimal host plan**
 * carrying whatever the attempt needs to point at, and the attempt itself is the hostile write.
 *
 * Two consequences worth stating rather than discovering:
 *
 * - **Hours become days** (TECH_DEBT #78). `original_duration_h: -40` becomes `durationDays: -5`.
 *   The sign is the point of the case and the sign survives, so nothing is lost that matters.
 * - **Some cases cannot be attempted as a single write at all**, because the *plan* is legal and the
 *   *schedule* is the hostile part — an impossible mandatory pair (N10), an unschedulable calendar
 *   (N11), a lag beyond the horizon (N16). Those seed a valid host and then attempt
 *   `recalculate`, which is the only place the engine sees them. That is not a workaround; it is
 *   where the product actually meets the case.
 */

const DAY = 1440;
const DATA_DATE = '2026-03-02';

/**
 * A host plan carrying plain tasks named `H1…Hn`, plus whatever else the case needs.
 *
 * The name carries `runId` because a host is **throwaway, not catalogue**. Plan names are unique per
 * project by design, so without it a second run into the same project collides on every case and
 * the whole tier reports INCONCLUSIVE — which is what happened the first time this was re-run, and
 * reads exactly like an outage. Reusing the existing plan instead would be worse: its contents are
 * whatever the last run left, and the attempt would be made against an unknown host.
 */
function host(
  id: string,
  runId: string,
  options: {
    activities?: SeedActivity[];
    resources?: SeedSpec['resources'];
    calendars?: SeedSpec['calendars'];
    dependencies?: SeedSpec['dependencies'];
  } = {},
): SeedSpec {
  return {
    seedName: `negative-${id}-${runId}`,
    tier: 'negative',
    plan: {
      name: `Negative ${id} (${runId})`,
      description:
        `Host plan for hostile case ${id}. Valid by itself — the case is the ONE write attempted ` +
        'against it, and what the API does with that write is the result.',
      dataDate: DATA_DATE,
      defaultCalendarKey: options.calendars?.[0]?.key ?? 'NEG_CAL',
      currencyCode: 'GBP',
      options: { ...DEFAULT_SEED_PLAN_OPTIONS },
    },
    calendars: options.calendars ?? [fiveDayWeek('NEG_CAL', `Negative ${id} week`)],
    resources: options.resources ?? [],
    activities: options.activities ?? [task('H1'), task('H2')],
    dependencies: options.dependencies ?? [],
    assignments: [],
    unplaceable: [],
  };
}

function fiveDayWeek(key: string, name: string): SeedSpec['calendars'][number] {
  return {
    key,
    name,
    scope: 'PROJECT',
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      windows: weekday >= 1 && weekday <= 5 ? [{ startMinute: 0, endMinute: DAY }] : [],
    })),
    exceptions: [],
  };
}

function task(key: string, overrides: Partial<SeedActivity> = {}): SeedActivity {
  return {
    key,
    code: key,
    name: `Host ${key}`,
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

/** A well-formed activity body, so a case varies exactly the one field it is about. */
function activityBody(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    name: 'Hostile activity',
    code: 'HOSTILE',
    type: 'TASK',
    durationDays: 5,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    accrualType: 'UNIFORM',
    scheduleAsLateAsPossible: false,
    ...overrides,
  };
}

/**
 * The 18 cases, with hosts named for this run.
 *
 * `runId` defaults to a fixed string so the function stays pure and the structural tests can compare
 * two calls; the CLI passes a real per-run value.
 */
export function negativeCases(runId = 'default'): NegativeCase[] {
  return [
    {
      id: 'N01_CYCLE_3',
      expect: 'REJECT_WITH_CYCLE_REPORT',
      description: 'Three-activity closed loop.',
      assertion: "Engine must name the exact members of the cycle, not just say 'loop detected'.",
      // Two legs of the loop are seeded as valid host logic; the attempt closes it. That way the
      // rejection is unambiguously about the cycle rather than about the first link.
      host: host('N01', runId, {
        activities: [task('H1'), task('H2'), task('H3')],
        dependencies: [edge('H1', 'H2'), edge('H2', 'H3')],
      }),
      attempt: {
        kind: 'create-dependency',
        predecessorKey: 'H3',
        successorKey: 'H1',
        body: { type: 'FS', lagDays: 0, lagCalendar: 'PROJECT_DEFAULT' },
      },
    },
    {
      id: 'N02_SELF_LOOP',
      expect: 'REJECT',
      description: 'Activity is its own predecessor.',
      assertion: null,
      host: host('N02', runId),
      attempt: {
        kind: 'create-dependency',
        predecessorKey: 'H1',
        successorKey: 'H1',
        body: { type: 'FS', lagDays: 0, lagCalendar: 'PROJECT_DEFAULT' },
      },
    },
    {
      id: 'N03_SS_FF_CYCLE',
      expect: 'REJECT_WITH_CYCLE_REPORT',
      description:
        'A subtle loop that only exists through SS/FF edges — trips naive FS-only cycle detectors.',
      assertion: null,
      host: host('N03', runId, { dependencies: [edge('H1', 'H2', 'SS', 5)] }),
      attempt: {
        kind: 'create-dependency',
        predecessorKey: 'H2',
        successorKey: 'H1',
        body: { type: 'FF', lagDays: 5, lagCalendar: 'PROJECT_DEFAULT' },
      },
    },
    {
      id: 'N04_DUPLICATE_RELATIONSHIP',
      expect: 'REJECT_OR_DEDUPE',
      description:
        'Two relationships between the same activity pair. P6 permits only one — decide and ' +
        'document whether you reject, dedupe, or keep both and take the most constraining.',
      // The fixture's own case is FS-then-SS, i.e. duplicate by PAIR. SchedulePoint deliberately
      // reads N04 narrower: ADR-0035 §13 accepted "same ordered pair AND type" as the duplicate,
      // and allows a different-type link on the same pair, because an FS+SS ladder is a real
      // modelling idiom rather than an error. So the attempt is an EXACT duplicate — which is what
      // §13 claims is rejected, and the claim is worth measuring rather than trusting.
      //
      // Verified rather than assumed: the fixture's literal FS-then-SS pair WAS attempted first and
      // the API accepted it, exactly as §13 says it should. Reporting that as a finding would have
      // been reporting a decision a human already made.
      assertion:
        'ADR-0035 §13 narrows this to pair+type; the fixture’s pair-only reading is a documented, ' +
        'accepted divergence, and an FS+SS ladder on one pair is allowed by design.',
      host: host('N04', runId, { dependencies: [edge('H1', 'H2')] }),
      attempt: {
        kind: 'create-dependency',
        predecessorKey: 'H1',
        successorKey: 'H2',
        body: { type: 'FS', lagDays: 0, lagCalendar: 'PROJECT_DEFAULT' },
      },
    },
    {
      id: 'N05_DANGLING_REFERENCE',
      expect: 'REJECT',
      description: 'Relationship pointing at an activity that does not exist.',
      assertion: null,
      host: host('N05', runId),
      attempt: {
        kind: 'create-dependency',
        predecessorKey: 'H1',
        successorKey: 'H2',
        // A syntactically valid id that resolves to nothing — the case is "not found", not
        // "malformed". A malformed id would be caught by the UUID pipe and prove something else.
        danglingSuccessor: true,
        body: { type: 'FS', lagDays: 0, lagCalendar: 'PROJECT_DEFAULT' },
      },
    },
    {
      id: 'N06_AF_BEFORE_AS',
      expect: 'REJECT',
      description: 'Actual finish precedes actual start.',
      assertion: null,
      host: host('N06', runId),
      attempt: {
        kind: 'set-progress',
        activityKey: 'H1',
        body: { percentComplete: 100, actualStart: '2026-02-20', actualFinish: '2026-02-16' },
      },
    },
    {
      id: 'N07_ACTUAL_IN_FUTURE',
      expect: 'REJECT_OR_WARN',
      description: 'An actual start after the data date — work reported before it happened.',
      assertion: null,
      host: host('N07', runId),
      attempt: {
        kind: 'set-progress',
        activityKey: 'H1',
        // The plan's data date is 2026-03-02; this claims work started three months later.
        body: { percentComplete: 30, actualStart: '2026-06-01' },
      },
    },
    {
      id: 'N08_COMPLETE_NO_AF',
      expect: 'REPAIR_OR_WARN',
      description: '100% complete with no actual finish.',
      assertion: null,
      host: host('N08', runId),
      attempt: {
        kind: 'set-progress',
        activityKey: 'H1',
        body: { percentComplete: 100, actualStart: '2026-02-16' },
      },
    },
    {
      id: 'N09_NEGATIVE_DURATION',
      expect: 'REJECT',
      description: 'A negative original duration.',
      // Explicitly `it.todo` in the engine's own negative suite: the pure engine cannot own it,
      // because a duration is validated before it ever reaches `computeSchedule`. This tier is
      // where that gap gets an answer.
      assertion: 'API-boundary case (ADR-0035 §25); the pure engine marks it todo.',
      host: host('N09', runId),
      attempt: { kind: 'create-activity', body: activityBody({ durationDays: -5 }) },
    },
    {
      id: 'N10_IMPOSSIBLE_MANDATORY_PAIR',
      expect: 'SCHEDULE_AND_REPORT_VIOLATION',
      description:
        'Two mandatory constraints that cannot both hold, with logic between them. ADR-0035 §7: ' +
        'produce and flag, never refuse to schedule.',
      assertion: null,
      host: host('N10', runId, {
        activities: [
          task('H1', { constraintType: 'MANDATORY_FINISH', constraintDate: '2026-04-01' }),
          task('H2', { constraintType: 'MANDATORY_START', constraintDate: '2026-03-10' }),
        ],
        dependencies: [edge('H1', 'H2')],
      }),
      // The plan is legal to build; the impossibility only exists once the engine runs.
      attempt: { kind: 'recalculate' },
    },
    {
      id: 'N11_ZERO_HOUR_CALENDAR',
      expect: 'REJECT_AT_LOAD_OR_TERMINATE_SAFELY',
      description:
        'THE ENGINE HANG TEST. A calendar with no working time at all. Any naive "advance to the ' +
        'next working hour" loop spins forever.',
      assertion: 'Must have an iteration cap and a "no working time within N years" error.',
      host: host('N11', runId),
      attempt: {
        kind: 'create-calendar',
        // Mask 0 = no working day at all. TECH_DEBT #79 records that `@Min(1)` on the mask may
        // refuse this outright, which is itself a valid "reject at load" answer.
        body: { name: 'No Working Time', scope: 'PROJECT', weekdayMask: 0 },
      },
    },
    {
      id: 'N12_LOE_NO_SPAN',
      expect: 'REJECT_OR_WARN',
      description: 'A Level of Effort activity with no logic to take its dates from.',
      assertion: null,
      host: host('N12', runId),
      attempt: {
        kind: 'create-activity',
        body: activityBody({ type: 'LEVEL_OF_EFFORT', durationDays: 0, code: 'LOE_NOSPAN' }),
      },
    },
    {
      id: 'N13_LEAD_BEFORE_DATA_DATE',
      expect: 'CLAMP_TO_DATA_DATE',
      description: 'A lead (negative lag) large enough to pull a successor before the data date.',
      assertion: null,
      // The lead is in the HOST, because a lead is legal to author (ADR-0036: negative lag is a
      // lead) and the hostile part is only what the engine does with it. Sixty working days
      // against a five-day activity: the successor lands months before the data date unless
      // something clamps it.
      host: host('N13', runId, { dependencies: [edge('H1', 'H2', 'FS', -60)] }),
      attempt: { kind: 'recalculate' },
    },
    {
      id: 'N14_NEGATIVE_UNITS',
      expect: 'REJECT',
      description: 'A resource assignment with negative budgeted units.',
      assertion: null,
      host: host('N14', runId, {
        resources: [
          {
            key: 'NEG_CREW',
            name: 'Negative-case crew',
            code: 'NEG-CREW',
            kind: 'LABOUR',
            calendarKey: null,
            maxUnitsPerHour: 8,
            costPerUnit: 1000,
            parentKey: null,
            archived: false,
          },
        ],
      }),
      attempt: {
        kind: 'assign-resource',
        activityKey: 'H1',
        resourceKey: 'NEG_CREW',
        body: { budgetedUnits: -400, isDriving: false, curveType: 'UNIFORM' },
      },
    },
    {
      id: 'N15_CONSTRAINT_BEFORE_PROJECT_START',
      expect: 'WARN',
      description: 'A start-no-earlier-than constraint dated before the plan’s data date.',
      assertion: null,
      host: host('N15', runId),
      attempt: {
        kind: 'create-activity',
        body: activityBody({
          code: 'EARLY_SNET',
          constraintType: 'SNET',
          constraintDate: '2025-01-05',
        }),
      },
    },
    {
      id: 'N16_LAG_EXCEEDS_HORIZON',
      expect: 'REJECT_OR_WARN',
      description:
        'A 100,000-hour lag — about 48 years on a five-day week. Tests that the date walker has a ' +
        'horizon and does not simply iterate.',
      assertion: null,
      host: host('N16', runId),
      attempt: {
        kind: 'create-dependency',
        predecessorKey: 'H1',
        successorKey: 'H2',
        // 100,000 hours ÷ 8 = 12,500 working days, the fixture's figure carried across the
        // hour→day boundary rather than re-invented.
        body: { type: 'FS', lagDays: 12_500, lagCalendar: 'PROJECT_DEFAULT' },
      },
    },
    {
      id: 'N17_MS_WITH_DURATION',
      expect: 'REJECT_OR_COERCE',
      description: 'A milestone with a non-zero duration.',
      assertion: 'API-boundary case (ADR-0035 §25); the pure engine marks it todo.',
      host: host('N17', runId),
      attempt: {
        kind: 'create-activity',
        body: activityBody({ type: 'START_MILESTONE', durationDays: 5, code: 'FAT_MS' }),
      },
    },
    {
      id: 'N18_RD_GT_OD_ON_COMPLETE',
      expect: 'REPAIR_OR_WARN',
      description: 'Remaining duration greater than the original duration on a complete activity.',
      assertion: null,
      host: host('N18', runId),
      attempt: {
        kind: 'set-progress',
        activityKey: 'H1',
        body: {
          percentComplete: 100,
          actualStart: '2026-02-16',
          actualFinish: '2026-02-20',
          remainingDurationDays: 20,
        },
      },
    },
  ];
}

function edge(
  predecessorKey: string,
  successorKey: string,
  type: 'FS' | 'SS' | 'FF' | 'SF' = 'FS',
  lagDays = 0,
): SeedSpec['dependencies'][number] {
  return {
    predecessorKey,
    successorKey,
    type,
    lagMinutes: lagDays * DAY,
    lagCalendarSource: 'PROJECT_DEFAULT',
  };
}
