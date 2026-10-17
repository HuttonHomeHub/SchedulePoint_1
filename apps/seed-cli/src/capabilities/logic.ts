import type { SeedActivity, SeedDependency, SeedSpec } from '@repo/seed';

import { activity, calendar, capabilityPlan, DAY, link } from './builders.js';

/**
 * **Relationship types and lag** (ADR-0066 M2), split across two plans.
 *
 * Split because one plan covering all four types with all three lag signs needs seventeen
 * activities, and a plan a person cannot hold in their head is the problem this tier exists to fix
 * — the fixture is already the big one. Two plans of nine and eight read as two pictures.
 *
 * Every lag here is a whole number of days, and that is not a simplification: the public API accepts
 * only `lagDays` (TECH_DEBT #78), so a sub-day lag cannot be authored by any client.
 */

/** Finish-to-Start and Start-to-Start, with positive, zero and negative lag on each. */
export function logicFsSsPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-logic-fs-ss',
    name: 'Logic: FS and SS with lag',
    description:
      'L1 starts the day after L0 finishes; L2 ten working days after; L3 two days BEFORE L0 ' +
      'finishes; L4 seven days after (a lag longer than L0 itself). S1/S2/S3 start two days after, ' +
      'one day before, and on the same day as S0 starts. C1 lags two CALENDAR days behind C0, not ' +
      'two working days.',
    activities: [
      activity('L0', { name: 'FS driver' }),
      activity('L1', { name: 'FS, zero lag', testTags: ['rel_fs', 'lag_zero'] }),
      activity('L2', { name: 'FS, +10d lag', testTags: ['lag_positive', 'lag_long'] }),
      activity('L3', { name: 'FS, -2d lead', testTags: ['lag_negative', 'lag_fs_negative'] }),
      // The lag is longer than the predecessor's own duration, so the successor starts after a gap
      // that no amount of shortening L0 would close. A real case (cure time, a delivery lead) and a
      // classic off-by-one in a scheduler's lag arithmetic.
      activity('L4', { name: 'FS, lag exceeds duration', testTags: ['lag_exceeds_pred_duration'] }),
      activity('S0', { name: 'SS driver' }),
      activity('S1', { name: 'SS, +2d lag', testTags: ['rel_ss', 'lag_ss_positive'] }),
      activity('S2', { name: 'SS, -1d lead', testTags: ['lag_ss_negative'] }),
      activity('S3', { name: 'SS, zero lag', testTags: ['lag_ss_zero'] }),
      activity('C0', { name: '24-hour lag driver' }),
      // The one edge whose lag walks a DIFFERENT calendar from the plan's (ADR-0053 §2). Over a
      // weekend the two answers differ by two days, which is the only way to see the setting at all.
      activity('C1', {
        name: 'FS, +2d lag on the 24-hour calendar',
        testTags: ['lag_calendar_24h', 'lag_calendar_setting_sensitive'],
      }),
    ],
    dependencies: [
      link('L0', 'L1'),
      link('L0', 'L2', { lagMinutes: 10 * DAY }),
      link('L0', 'L3', { lagMinutes: -2 * DAY }),
      link('L0', 'L4', { lagMinutes: 7 * DAY }),
      link('S0', 'S1', { type: 'SS', lagMinutes: 2 * DAY }),
      link('S0', 'S2', { type: 'SS', lagMinutes: -1 * DAY }),
      link('S0', 'S3', { type: 'SS' }),
      link('C0', 'C1', { lagMinutes: 2 * DAY, lagCalendarSource: 'TWENTY_FOUR_HOUR' }),
    ],
  });
}

/** Finish-to-Finish and Start-to-Finish — the two a planner reads wrong most often. */
export function logicFfSfPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-logic-ff-sf',
    name: 'Logic: FF and SF with lag',
    description:
      'F1/F2/F3 finish two days after, one day before, and on the same day as F0 finishes. X1/X2/X3 ' +
      'FINISH relative to when X0 STARTS — the direction that reads backwards. X1’s only ' +
      'predecessor is that SF, so nothing else can be holding its dates.',
    activities: [
      activity('F0', { name: 'FF driver' }),
      activity('F1', { name: 'FF, +2d lag', testTags: ['rel_ff', 'lag_ff_positive'] }),
      activity('F2', { name: 'FF, -1d lead', testTags: ['lag_ff_negative'] }),
      activity('F3', { name: 'FF, zero lag', testTags: ['lag_ff_zero'] }),
      activity('X0', { name: 'SF driver' }),
      // SF: the PREDECESSOR's start drives the SUCCESSOR's finish. `sf_only_predecessor` matters
      // because with any second predecessor you cannot tell whether the SF is doing anything.
      activity('X1', {
        name: 'SF, +1d lag (only predecessor)',
        testTags: ['rel_sf', 'lag_sf_positive', 'sf_predecessor', 'sf_only_predecessor'],
      }),
      activity('X2', { name: 'SF, -1d lead', testTags: ['lag_sf_negative'] }),
      activity('X3', { name: 'SF, zero lag', testTags: ['lag_sf_zero'] }),
    ],
    dependencies: [
      link('F0', 'F1', { type: 'FF', lagMinutes: 2 * DAY }),
      link('F0', 'F2', { type: 'FF', lagMinutes: -1 * DAY }),
      link('F0', 'F3', { type: 'FF' }),
      link('X0', 'X1', { type: 'SF', lagMinutes: 1 * DAY }),
      link('X0', 'X2', { type: 'SF', lagMinutes: -1 * DAY }),
      link('X0', 'X3', { type: 'SF' }),
    ],
  });
}

/**
 * **Redundant logic** (redundant-link-advisory M3, ADR-0196): one disconnected cluster per row of the
 * spec's §2.3 table, so the health check's "Redundant links" row can be checked against a plan a
 * person can hold in their head, and so a wrong rule shows up as a named cluster rather than a count.
 *
 * Four plans rather than one, because a catalogue plan stays within fifteen activities
 * (`coverage.spec.ts`: "small enough for a person to check by hand") and the twelve clusters need
 * fifty: **flagged** (R1, R3, R5, R6, R13), **calendars and same-pair** (R9, R9M, R14, R15),
 * **not flagged** (R2, R4, R7, R8, R12) and **not checked** (R10, R11, R16, R17).
 *
 * Codes read `R<row><A|B|C>`: A is the source, B the middle of the chain and C the target, and the
 * link under judgement is always A to C (R14 and R15 have only A and B). `REDUNDANT_LOGIC_FLAGGED`
 * names, per plan, the links the rule must flag, in `pred>succ:TYPE` form;
 * `redundant-links.catalogue.spec.ts` asserts the rule against it and that each description names
 * every flagged cluster, so the playbook, the plans and the rule cannot quietly disagree.
 *
 * "Redundant" here is the spec's provable sense: deleting the link cannot change any date or float
 * whatever the durations. `capability-network-shape`'s N3 is the other sense (a shorter parallel path)
 * and is not flagged.
 */
export const REDUNDANT_LOGIC_FLAGGED = {
  'capability-redundant-logic': [
    'R1A>R1C:FS',
    'R3A>R3C:FS',
    'R5A>R5C:SS',
    'R6A>R6C:FF',
    'R13A>R13C:FS',
  ],
  'capability-redundant-logic-calendars': ['R9A>R9C:FS', 'R14A>R14B:SS'],
  'capability-redundant-logic-kept': [],
  'capability-redundant-logic-unchecked': [],
} as const;

/** Links each plan cannot check (a pinned or started endpoint, or a level of effort), counted. */
export const REDUNDANT_LOGIC_UNCHECKED = {
  'capability-redundant-logic': 0,
  'capability-redundant-logic-calendars': 0,
  'capability-redundant-logic-kept': 0,
  // R10's link into the mandatory middle; R11's two that touch the level of effort; R16's link into the
  // started middle; R17's two into the pinned target.
  'capability-redundant-logic-unchecked': 6,
} as const;

/** The pieces a cluster is built from; `build` returns a plan holding exactly the clusters it was given. */
function redundantCluster() {
  const activities: SeedActivity[] = [];
  const dependencies: SeedDependency[] = [];
  /** Three activities and the chain A to B to C; the cases add the direct link and vary one thing. */
  const trio = (
    row: string,
    name: string,
    overrides: {
      a?: Partial<SeedActivity>;
      b?: Partial<SeedActivity>;
      c?: Partial<SeedActivity>;
    } = {},
    chain: { ab?: Partial<SeedDependency>; bc?: Partial<SeedDependency> } = {},
  ) => {
    activities.push(
      activity(`${row}A`, { name: `${name}: source`, durationMinutes: 2 * DAY, ...overrides.a }),
      activity(`${row}B`, { name: `${name}: middle`, durationMinutes: 1 * DAY, ...overrides.b }),
      activity(`${row}C`, { name: `${name}: target`, durationMinutes: 2 * DAY, ...overrides.c }),
    );
    dependencies.push(link(`${row}A`, `${row}B`, chain.ab), link(`${row}B`, `${row}C`, chain.bc));
  };
  const direct = (row: string, overrides: Partial<SeedDependency> = {}) =>
    dependencies.push(link(`${row}A`, `${row}C`, overrides));
  return { activities, dependencies, trio, direct };
}

/** A project calendar name must be unique across the catalogue (#428), so each plan names its own. */
const FIVE_DAY = (tag: string) =>
  calendar('CAL5', `Redundant logic ${tag}: five-day week`, [1, 2, 3, 4, 5]);

/** The links the health check must list: the canonical triangle and its provable variants. */
export function redundantLogicPlan(): SeedSpec {
  const { activities, dependencies, trio, direct } = redundantCluster();
  trio('R1', 'R1 canonical');
  direct('R1');
  trio('R3', 'R3 lags sum', {}, { ab: { lagMinutes: DAY }, bc: { lagMinutes: DAY } });
  direct('R3', { lagMinutes: 2 * DAY });
  trio('R5', 'R5 SS beside an FS chain');
  direct('R5', { type: 'SS' });
  trio('R6', 'R6 FF beside an FS chain');
  direct('R6', { type: 'FF' });
  trio('R13', 'R13 lead on the direct link');
  direct('R13', { lagMinutes: -DAY });
  return capabilityPlan({
    seedName: 'capability-redundant-logic',
    name: 'Logic: redundant links that are listed',
    description:
      'Open the health check: Redundant links lists exactly five links, the direct A to C of R1, R3, ' +
      'R5, R6 and R13. R1 is the canonical triangle; R3 sums two lags on one calendar to the direct ' +
      'link’s lag; R5 and R6 are an SS and an FF beside a finish-to-start chain; R13 is a lead. ' +
      'Deleting any of them changes no date and no float, and each says which activity it is ' +
      'already implied through.',
    activities,
    dependencies,
  });
}

/** Calendar-sensitive and same-pair cases, which need a working week to mean anything. */
export function redundantLogicCalendarsPlan(): SeedSpec {
  const { activities, dependencies, trio, direct } = redundantCluster();
  trio('R9', 'R9 FF entry, one calendar', {}, { ab: { type: 'FF' } });
  direct('R9');
  trio(
    'R9M',
    'R9 FF entry, mixed calendars',
    { b: { calendarKey: 'CAL6' } },
    { ab: { type: 'FF' } },
  );
  direct('R9M');
  activities.push(
    activity('R14A', { name: 'R14 same pair: source' }),
    activity('R14B', { name: 'R14 same pair: target' }),
    activity('R15A', { name: 'R15 ladder: source' }),
    activity('R15B', { name: 'R15 ladder: target' }),
  );
  dependencies.push(
    link('R14A', 'R14B'),
    link('R14A', 'R14B', { type: 'SS' }),
    link('R15A', 'R15B', { type: 'SS', lagMinutes: 2 * DAY }),
    link('R15A', 'R15B', { type: 'FF', lagMinutes: 2 * DAY }),
  );
  return capabilityPlan({
    seedName: 'capability-redundant-logic-calendars',
    name: 'Logic: redundant links across calendars and between the same pair',
    description:
      'Redundant links lists exactly two: the direct A to C of R9, and the SS of R14. R9 passes ' +
      'through an FF entry into a middle activity on the one calendar all three share; R9M is the ' +
      'same shape with the middle on a six-day week and is NOT listed, because across calendars an ' +
      'FF entry can land before the instant it was given. R14 is an SS beside an FS between the same ' +
      'two activities, so the SS is implied; R15 is an SS+2 and an FF+2 ladder and neither implies ' +
      'the other, so neither is listed.',
    defaultCalendarKey: 'CAL5',
    calendars: [
      FIVE_DAY('calendars'),
      calendar('CAL6', 'Redundant logic calendars: six-day week', [1, 2, 3, 4, 5, 6]),
    ],
    activities,
    dependencies,
  });
}

/** Cases that look redundant and are not: the link is the one doing the work. */
export function redundantLogicKeptPlan(): SeedSpec {
  const { activities, dependencies, trio, direct } = redundantCluster();
  trio('R2', 'R2 longer lag');
  direct('R2', { lagMinutes: 5 * DAY });
  trio(
    'R4',
    'R4 two lag calendars',
    {},
    {
      ab: { lagMinutes: DAY, lagCalendarSource: 'TWENTY_FOUR_HOUR' },
      bc: { lagMinutes: DAY },
    },
  );
  direct('R4', { lagMinutes: 2 * DAY });
  trio('R7', 'R7 chain leaves A at its start', {}, { ab: { type: 'SS' }, bc: { type: 'SS' } });
  direct('R7');
  trio('R8', 'R8 chain binds C at its finish', {}, { bc: { type: 'FF' } });
  direct('R8');
  trio('R12', 'R12 lead on the chain', {}, { ab: { lagMinutes: -DAY } });
  direct('R12');
  return capabilityPlan({
    seedName: 'capability-redundant-logic-kept',
    name: 'Logic: links that look redundant and are not',
    description:
      'Redundant links lists nothing. Every direct A to C here sits beside a chain A to B to C and ' +
      'every one is the link doing the work: R2 carries a longer lag than the chain; R4’s two lags ' +
      'are on different calendars, so they cannot be added; R7’s chain leaves A at its start and R8’s ' +
      'binds C at its finish, so each can be later than the direct link; R12’s chain has a lead. ' +
      'Deleting any of them would move C if the durations changed.',
    defaultCalendarKey: 'CAL5',
    calendars: [FIVE_DAY('kept')],
    activities,
    dependencies,
  });
}

/** Cases the check does not judge: started or pinned work, and a level of effort. */
export function redundantLogicUncheckedPlan(): SeedSpec {
  const { activities, dependencies, trio, direct } = redundantCluster();
  trio('R10', 'R10 mandatory middle', {
    b: { constraintType: 'MANDATORY_START', constraintDate: '2026-03-09' },
  });
  direct('R10');
  activities.push(
    activity('R11A', { name: 'R11 level of effort: source', durationMinutes: 2 * DAY }),
    activity('R11L', {
      name: 'R11 level of effort: middle',
      type: 'LEVEL_OF_EFFORT',
      durationMinutes: 0,
    }),
    activity('R11C', { name: 'R11 level of effort: target', durationMinutes: 2 * DAY }),
  );
  dependencies.push(link('R11A', 'R11L'), link('R11L', 'R11C'), link('R11A', 'R11C'));
  trio('R16', 'R16 started middle', {
    b: {
      progress: {
        status: 'IN_PROGRESS',
        percentComplete: 40,
        percentCompleteType: 'DURATION',
        physicalPercentComplete: null,
        actualStart: '2026-02-27T00:00',
        actualFinish: null,
        remainingDurationMinutes: DAY,
        suspendDate: null,
        resumeDate: null,
        expectedFinish: null,
      },
    },
  });
  direct('R16');
  trio('R17', 'R17 pinned target', { c: { constraintType: 'MSO', constraintDate: '2026-03-16' } });
  direct('R17');
  return capabilityPlan({
    seedName: 'capability-redundant-logic-unchecked',
    name: 'Logic: links the redundant-link check does not judge',
    description:
      'Redundant links lists nothing and says six links were not checked. R10’s middle is a mandatory ' +
      'start, so the link into it is not judged; R11 runs through a level of effort, which never ' +
      'drives, so the two links that touch it are not judged; R16’s middle is in progress, so the ' +
      'link into it is not judged; R17’s target is pinned, so the two links into it are not judged. ' +
      'In R10, R11 and R16 the direct A to C is judged and is not redundant, because the chain ' +
      'cannot be relied on.',
    activities,
    dependencies,
  });
}
