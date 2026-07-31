import type { SeedSpec } from '@repo/seed';

import { activity, capabilityPlan, DAY, link } from './builders.js';

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
